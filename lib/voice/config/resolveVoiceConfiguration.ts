/**
 * Server-only voice configuration resolver (Phase 4A control plane).
 *
 * Phase 4B: the runtime bridge calls it once per new call in shadow mode only (see
 * config/shadow.ts). Production calls still use the Turkish speech stack, the DID mapping's
 * defaultLocale/greetingText and the worker env voice.
 *
 * Precedence (later wins, each layer validated before use):
 *   1. SYSTEM SAFE DEFAULT   FIXED tr-TR, built-in Turkish voice (worker env), generic greeting
 *   2. LEGACY DID MAPPING    voiceNumbers/{DID}.greetingText as the Turkish greeting floor
 *   3. CLINIC VOICE SETTINGS voiceSettings/{clinicId}
 *   4. DID PROFILE OVERRIDE  voiceSettings/{clinicId}.didProfiles[voiceNumbers/{DID}.voiceProfileKey]
 *
 * Tenant identity: clinicId must equal the trusted DID mapping's clinicId; a mismatch is a hard
 * failure, never a fallback. Invalid or unreadable *configuration* degrades to the legacy
 * Turkish behavior with explicit issue codes (a call is never dropped because of settings).
 */

import { normalizeCalledDid, VOICE_NUMBERS_COLLECTION } from "@/lib/voice/telephony/didResolver";
import { SYSTEM_DEFAULT_VOICE_LOCALE, VOICE_LANGUAGE_REGISTRY, canonicalizeLegacyLocale, type VoiceLocale } from "./languageRegistry";
import { loadVoiceProfiles, type LoadedVoiceProfile, type VoiceConfigReadFirestore } from "./store";
import {
  MAX_GREETING_LENGTH,
  VOICE_SETTINGS_COLLECTION,
  type ResolvedLanguageProfile,
  type ResolvedVoiceConfiguration,
  type VoiceConfigError,
  type VoiceConfigErrorCode,
  type VoiceConfigIssueCode,
  type VoiceSettingsDocument,
} from "./types";
import {
  collectVoiceProfileIds,
  enabledLanguages,
  isValidDidProfileKey,
  isValidVoiceClinicId,
  legacyVoiceSettings,
  mergeDidProfile,
  parseVoiceSettingsDocument,
  validateVoiceLanguageConfig,
  type VoiceLanguageConfig,
} from "./validation";
import { BUILTIN_VOICE_PROFILES } from "./voiceProfiles";

const CLINICS_COLLECTION = "clinics";

export interface ResolveVoiceConfigurationDeps {
  readonly adminDb: VoiceConfigReadFirestore | null | undefined;
}

export interface ResolveVoiceConfigurationInput {
  readonly clinicId: string;
  /** The dialed business number. Omit for clinic-level resolution (admin preview). */
  readonly calledDid?: string;
}

export type ResolveVoiceConfigurationResult =
  | { ok: true; config: ResolvedVoiceConfiguration }
  | { ok: false; code: VoiceConfigErrorCode };

interface DidContext {
  readonly didE164: string;
  readonly routingEnabled: boolean;
  readonly legacyGreeting: string | null;
  readonly legacyLocale: VoiceLocale | null;
  readonly hasLegacyLocale: boolean;
  readonly voiceProfileKey: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedGreeting(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= MAX_GREETING_LENGTH ? trimmed : null;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value as Record<string, unknown>)) deepFreeze(inner);
  }
  return value;
}

async function readDidContext(
  db: VoiceConfigReadFirestore,
  clinicId: string,
  calledDid: string
): Promise<{ ok: true; did: DidContext } | { ok: false; code: VoiceConfigErrorCode }> {
  const normalized = normalizeCalledDid(calledDid);
  if (!normalized.ok) return { ok: false, code: "VOICE_DID_INVALID" };
  let mapping: unknown;
  try {
    const snap = await db.collection(VOICE_NUMBERS_COLLECTION).doc(normalized.didE164).get();
    if (!snap.exists) return { ok: false, code: "VOICE_DID_MAPPING_NOT_FOUND" };
    mapping = snap.data();
  } catch {
    return { ok: false, code: "VOICE_CONFIG_LOOKUP_FAILED" };
  }
  if (!isRecord(mapping) || mapping.clinicId !== clinicId) return { ok: false, code: "VOICE_DID_TENANT_MISMATCH" };
  return {
    ok: true,
    did: {
      didE164: normalized.didE164,
      routingEnabled: mapping.active === true && mapping.voiceEnabled === true,
      legacyGreeting: boundedGreeting(mapping.greetingText),
      legacyLocale: canonicalizeLegacyLocale(mapping.defaultLocale),
      hasLegacyLocale: mapping.defaultLocale !== undefined && mapping.defaultLocale !== null,
      voiceProfileKey: mapping.voiceProfileKey,
    },
  };
}

function buildLanguageProfiles(
  config: VoiceLanguageConfig,
  profiles: ReadonlyMap<string, LoadedVoiceProfile>,
  legacyGreeting: { locale: VoiceLocale; text: string } | null
): Partial<Record<VoiceLocale, ResolvedLanguageProfile>> {
  const out: Partial<Record<VoiceLocale, ResolvedLanguageProfile>> = {};
  for (const locale of enabledLanguages(config)) {
    const settings = config.languageProfiles[locale];
    const voiceProfileId = settings?.voiceProfileId ?? config.defaultVoiceProfileId;
    const voice = profiles.get(voiceProfileId);
    // Validation guarantees a usable voice; this guard only keeps the types honest.
    if (!voice || voice === "INVALID") continue;
    out[locale] = {
      locale,
      rtl: VOICE_LANGUAGE_REGISTRY[locale].rtl,
      voiceProfileId,
      voiceType: voice.type,
      provider: voice.provider,
      providerVoice: voice.providerVoice,
      greeting: settings?.greeting ?? (legacyGreeting?.locale === locale ? legacyGreeting.text : null),
    };
  }
  return out;
}

export async function resolveVoiceConfiguration(
  deps: ResolveVoiceConfigurationDeps,
  input: ResolveVoiceConfigurationInput
): Promise<ResolveVoiceConfigurationResult> {
  const clinicId = input?.clinicId;
  if (!isValidVoiceClinicId(clinicId)) return { ok: false, code: "VOICE_CLINIC_ID_INVALID" };
  const db = deps.adminDb;
  if (!db) return { ok: false, code: "VOICE_CONFIG_LOOKUP_FAILED" };

  // Independent reads share one round trip (this runs at call start); their results are still
  // evaluated in order: DID tenant check, clinic existence, then settings.
  const didRead = input.calledDid !== undefined ? readDidContext(db, clinicId, input.calledDid) : null;
  const clinicRead = db
    .collection(CLINICS_COLLECTION)
    .doc(clinicId)
    .get()
    .then((snap) => (snap.exists ? "FOUND" : "NOT_FOUND"), () => "FAILED" as const);
  const settingsRead = db
    .collection(VOICE_SETTINGS_COLLECTION)
    .doc(clinicId)
    .get()
    .catch(() => "UNREADABLE" as const);

  let did: DidContext | null = null;
  if (didRead) {
    const read = await didRead;
    if (!read.ok) return read;
    did = read.did;
  }

  const clinic = await clinicRead;
  if (clinic === "NOT_FOUND") return { ok: false, code: "VOICE_CLINIC_NOT_FOUND" };
  if (clinic === "FAILED") return { ok: false, code: "VOICE_CONFIG_LOOKUP_FAILED" };

  const issues: VoiceConfigIssueCode[] = [];
  const diagnostics: VoiceConfigError[] = [];
  let settings: VoiceSettingsDocument | null = null;
  let profiles = new Map<string, LoadedVoiceProfile>();

  try {
    const snap = await settingsRead;
    if (snap === "UNREADABLE") throw new Error("VOICE_SETTINGS_UNREADABLE");
    if (snap.exists) {
      const parsed = parseVoiceSettingsDocument(clinicId, snap.data());
      if (!parsed.ok) {
        issues.push("VOICE_SETTINGS_INVALID_USED_LEGACY");
        diagnostics.push(...parsed.errors);
      } else {
        profiles = await loadVoiceProfiles(db, collectVoiceProfileIds(parsed.value));
        const errors = validateVoiceLanguageConfig(parsed.value, {
          clinicId,
          customVoiceEnabled: parsed.value.customVoiceEnabled,
          profiles,
        });
        if (errors.length) {
          issues.push("VOICE_SETTINGS_INVALID_USED_LEGACY");
          diagnostics.push(...errors);
        } else {
          settings = parsed.value;
        }
      }
    }
  } catch {
    issues.push("VOICE_SETTINGS_UNREADABLE_USED_LEGACY");
    settings = null;
  }

  const base = settings ?? legacyVoiceSettings(clinicId);
  if (!settings) profiles = new Map(Object.entries(BUILTIN_VOICE_PROFILES));

  let effective: VoiceLanguageConfig = base;
  let resolvedDidProfile: ResolvedVoiceConfiguration["resolvedDidProfile"] = null;
  if (did && did.voiceProfileKey !== undefined && did.voiceProfileKey !== null) {
    const key = did.voiceProfileKey;
    const didProfile = settings && isValidDidProfileKey(key) ? settings.didProfiles[key] : undefined;
    if (!settings || !didProfile) {
      issues.push("VOICE_DID_PROFILE_IGNORED");
      if (settings) diagnostics.push({ code: "VOICE_DID_PROFILE_NOT_FOUND", field: "voiceProfileKey" });
    } else {
      const merged = mergeDidProfile(settings, didProfile);
      const errors = validateVoiceLanguageConfig(
        merged,
        { clinicId, customVoiceEnabled: settings.customVoiceEnabled, profiles },
        `didProfiles.${key}`
      );
      for (const locale of didProfile.supportedLanguages ?? []) {
        if (!settings.supportedLanguages.includes(locale)) {
          errors.push({ code: "VOICE_DID_OVERRIDE_LANGUAGE_NOT_IN_CLINIC", field: `didProfiles.${key}.supportedLanguages` });
        }
      }
      if (errors.length) {
        issues.push("VOICE_DID_PROFILE_IGNORED");
        diagnostics.push(...errors);
      } else {
        effective = merged;
        resolvedDidProfile = { key: key as string, label: didProfile.label };
      }
    }
  }

  let legacyGreeting: { locale: VoiceLocale; text: string } | null = null;
  if (did?.legacyGreeting) {
    // Legacy runtime speaks the mapping greeting with the Turkish stack whatever its locale.
    const locale = settings ? (did.legacyLocale ?? SYSTEM_DEFAULT_VOICE_LOCALE) : SYSTEM_DEFAULT_VOICE_LOCALE;
    legacyGreeting = { locale, text: did.legacyGreeting };
  }
  if (!settings && did?.hasLegacyLocale && did.legacyLocale !== SYSTEM_DEFAULT_VOICE_LOCALE) {
    issues.push("VOICE_LEGACY_LOCALE_IGNORED");
  }

  const config: ResolvedVoiceConfiguration = {
    clinicId,
    didE164: did?.didE164 ?? null,
    source: settings ? "VOICE_SETTINGS" : "LEGACY",
    enabled: effective.enabled && (did ? did.routingEnabled : true),
    languageMode: effective.languageMode,
    defaultLanguage: effective.defaultLanguage,
    fallbackLanguage: effective.fallbackLanguage,
    supportedLanguages: enabledLanguages(effective),
    allowLanguageSwitch: effective.allowLanguageSwitch,
    languageProfiles: buildLanguageProfiles(effective, profiles, legacyGreeting),
    resolvedDidProfile,
    version: settings?.version ?? 0,
    issues,
    diagnostics,
  };
  return { ok: true, config: deepFreeze(config) };
}
