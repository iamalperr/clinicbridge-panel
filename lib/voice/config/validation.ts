/**
 * Strict validation for voice settings. Nothing here repairs configuration: invalid input is
 * rejected with stable codes (field paths only, never values). Pure and synchronous; voice
 * profiles are looked up by the caller and passed in.
 */

import {
  SYSTEM_DEFAULT_VOICE_LOCALE,
  VOICE_LANGUAGE_REGISTRY,
  isVoiceLocale,
  type VoiceLocale,
} from "./languageRegistry";
import {
  CLINIC_EDITABLE_SETTINGS_FIELDS,
  DID_OVERRIDABLE_FIELDS,
  MAX_DID_PROFILES,
  MAX_GREETING_LENGTH,
  PLATFORM_ONLY_SETTINGS_FIELDS,
  VOICE_SETTINGS_SCHEMA_VERSION,
  type DidVoiceProfile,
  type LanguageProfileSettings,
  type VoiceConfigError,
  type VoiceConfigErrorCode,
  type VoiceConfigResult,
  type VoiceLanguageMode,
  type VoiceProfile,
  type VoiceSettingsActor,
  type VoiceSettingsDocument,
  type VoiceSettingsPatch,
} from "./types";
import { LEGACY_TURKISH_VOICE_PROFILE_ID, checkVoiceProfileUsable, isValidVoiceProfileId } from "./voiceProfiles";

const DID_PROFILE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const MAX_LABEL_LENGTH = 80;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const TENANT_FIELDS = new Set(["clinicId", "clinic", "tenantId", "didE164", "did", "calledDid"]);

const SETTINGS_DOCUMENT_FIELDS = new Set<string>([
  "schemaVersion",
  "clinicId",
  ...CLINIC_EDITABLE_SETTINGS_FIELDS,
  ...PLATFORM_ONLY_SETTINGS_FIELDS,
  "version",
  "updatedAt",
  "updatedBy",
]);

type Errors = VoiceConfigError[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function push(errors: Errors, code: VoiceConfigErrorCode, field?: string): void {
  errors.push(field ? { code, field } : { code });
}

export function isValidVoiceClinicId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    value === value.trim() &&
    !value.includes("/") &&
    value !== "." &&
    value !== ".."
  );
}

export function isValidDidProfileKey(value: unknown): value is string {
  return typeof value === "string" && DID_PROFILE_KEY_PATTERN.test(value);
}

/* ── Field parsers (shape only) ─────────────────────────────────────── */

function parseLocale(raw: unknown, field: string, errors: Errors): VoiceLocale | undefined {
  if (!isVoiceLocale(raw)) {
    push(errors, "VOICE_LOCALE_UNKNOWN", field);
    return undefined;
  }
  if (VOICE_LANGUAGE_REGISTRY[raw].status === "RETIRED") {
    push(errors, "VOICE_LOCALE_RETIRED", field);
    return undefined;
  }
  return raw;
}

function parseLocaleList(raw: unknown, field: string, errors: Errors): VoiceLocale[] | undefined {
  if (!Array.isArray(raw)) {
    push(errors, "VOICE_SETTINGS_INVALID_SHAPE", field);
    return undefined;
  }
  if (raw.length === 0) {
    push(errors, "VOICE_SUPPORTED_LANGUAGES_EMPTY", field);
    return undefined;
  }
  const out: VoiceLocale[] = [];
  let valid = true;
  raw.forEach((entry, index) => {
    const locale = parseLocale(entry, `${field}.${index}`, errors);
    if (!locale) {
      valid = false;
    } else if (out.includes(locale)) {
      push(errors, "VOICE_LOCALE_DUPLICATE", `${field}.${index}`);
      valid = false;
    } else {
      out.push(locale);
    }
  });
  return valid ? out : undefined;
}

function parseLanguageMode(raw: unknown, field: string, errors: Errors): VoiceLanguageMode | undefined {
  if (raw === "FIXED" || raw === "AUTO") return raw;
  push(errors, "VOICE_LANGUAGE_MODE_INVALID", field);
  return undefined;
}

function parseBoolean(raw: unknown, field: string, errors: Errors): boolean | undefined {
  if (typeof raw === "boolean") return raw;
  push(errors, "VOICE_SETTINGS_INVALID_SHAPE", field);
  return undefined;
}

function parseVoiceProfileId(raw: unknown, field: string, errors: Errors): string | undefined {
  if (isValidVoiceProfileId(raw)) return raw;
  push(errors, "VOICE_PROFILE_ID_INVALID", field);
  return undefined;
}

/** null clears the greeting; strings must already be trimmed, non-empty and bounded. */
function parseGreeting(raw: unknown, field: string, errors: Errors): string | null | undefined {
  if (raw === null) return null;
  if (
    typeof raw !== "string" ||
    raw.length === 0 ||
    raw !== raw.trim() ||
    raw.length > MAX_GREETING_LENGTH ||
    CONTROL_CHARS.test(raw)
  ) {
    push(errors, "VOICE_GREETING_INVALID", field);
    return undefined;
  }
  return raw;
}

function rejectUnknownKeys(
  raw: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  prefix: string,
  errors: Errors,
  code: VoiceConfigErrorCode = "VOICE_FIELD_NOT_ALLOWED"
): void {
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) push(errors, code, prefix ? `${prefix}.${key}` : key);
  }
}

const LANGUAGE_PROFILE_FIELDS = new Set(["enabled", "voiceProfileId", "greeting"]);

function parseLanguageProfiles(
  raw: unknown,
  field: string,
  errors: Errors
): Partial<Record<VoiceLocale, LanguageProfileSettings>> | undefined {
  if (!isRecord(raw)) {
    push(errors, "VOICE_SETTINGS_INVALID_SHAPE", field);
    return undefined;
  }
  const out: Partial<Record<VoiceLocale, LanguageProfileSettings>> = {};
  const before = errors.length;
  for (const [key, value] of Object.entries(raw)) {
    const path = `${field}.${key}`;
    const locale = parseLocale(key, path, errors);
    if (!locale) continue;
    if (!isRecord(value)) {
      push(errors, "VOICE_SETTINGS_INVALID_SHAPE", path);
      continue;
    }
    rejectUnknownKeys(value, LANGUAGE_PROFILE_FIELDS, path, errors);
    const enabled = parseBoolean(value.enabled, `${path}.enabled`, errors);
    const voiceProfileId =
      value.voiceProfileId === undefined || value.voiceProfileId === null
        ? null
        : parseVoiceProfileId(value.voiceProfileId, `${path}.voiceProfileId`, errors);
    const greeting = value.greeting === undefined ? null : parseGreeting(value.greeting, `${path}.greeting`, errors);
    if (enabled === undefined || voiceProfileId === undefined || greeting === undefined) continue;
    out[locale] = { enabled, voiceProfileId, greeting };
  }
  return errors.length === before ? out : undefined;
}

const DID_PROFILE_FIELDS = new Set<string>(DID_OVERRIDABLE_FIELDS);
const DID_LANGUAGE_PROFILE_FIELDS = new Set(["voiceProfileId", "greeting"]);

export function parseDidVoiceProfile(raw: unknown, field = "didProfile"): VoiceConfigResult<DidVoiceProfile> {
  const errors: Errors = [];
  if (!isRecord(raw)) return { ok: false, errors: [{ code: "VOICE_SETTINGS_INVALID_SHAPE", field }] };

  for (const key of Object.keys(raw)) {
    if (TENANT_FIELDS.has(key)) push(errors, "VOICE_DID_OVERRIDE_TENANT_FIELD_FORBIDDEN", `${field}.${key}`);
    else if (!DID_PROFILE_FIELDS.has(key)) push(errors, "VOICE_DID_OVERRIDE_FIELD_NOT_ALLOWED", `${field}.${key}`);
  }

  const label = typeof raw.label === "string" ? raw.label : undefined;
  if (!label || label !== label.trim() || label.length > MAX_LABEL_LENGTH || CONTROL_CHARS.test(label)) {
    push(errors, "VOICE_SETTINGS_INVALID_SHAPE", `${field}.label`);
  }

  const out: { -readonly [K in keyof DidVoiceProfile]: DidVoiceProfile[K] } = { label: label ?? "" };
  if (raw.enabled !== undefined) {
    if (raw.enabled === false) out.enabled = false;
    else push(errors, "VOICE_DID_OVERRIDE_FIELD_NOT_ALLOWED", `${field}.enabled`);
  }
  if (raw.languageMode !== undefined) out.languageMode = parseLanguageMode(raw.languageMode, `${field}.languageMode`, errors);
  if (raw.defaultLanguage !== undefined) out.defaultLanguage = parseLocale(raw.defaultLanguage, `${field}.defaultLanguage`, errors);
  if (raw.fallbackLanguage !== undefined) out.fallbackLanguage = parseLocale(raw.fallbackLanguage, `${field}.fallbackLanguage`, errors);
  if (raw.supportedLanguages !== undefined) {
    out.supportedLanguages = parseLocaleList(raw.supportedLanguages, `${field}.supportedLanguages`, errors);
  }
  if (raw.allowLanguageSwitch !== undefined) {
    out.allowLanguageSwitch = parseBoolean(raw.allowLanguageSwitch, `${field}.allowLanguageSwitch`, errors);
  }
  if (raw.defaultVoiceProfileId !== undefined) {
    out.defaultVoiceProfileId = parseVoiceProfileId(raw.defaultVoiceProfileId, `${field}.defaultVoiceProfileId`, errors);
  }
  if (raw.languageProfiles !== undefined) {
    if (!isRecord(raw.languageProfiles)) {
      push(errors, "VOICE_SETTINGS_INVALID_SHAPE", `${field}.languageProfiles`);
    } else {
      const profiles: Partial<Record<VoiceLocale, { voiceProfileId?: string; greeting?: string }>> = {};
      for (const [key, value] of Object.entries(raw.languageProfiles)) {
        const path = `${field}.languageProfiles.${key}`;
        const locale = parseLocale(key, path, errors);
        if (!locale) continue;
        if (!isRecord(value)) {
          push(errors, "VOICE_SETTINGS_INVALID_SHAPE", path);
          continue;
        }
        for (const inner of Object.keys(value)) {
          if (TENANT_FIELDS.has(inner)) push(errors, "VOICE_DID_OVERRIDE_TENANT_FIELD_FORBIDDEN", `${path}.${inner}`);
          else if (!DID_LANGUAGE_PROFILE_FIELDS.has(inner)) push(errors, "VOICE_DID_OVERRIDE_FIELD_NOT_ALLOWED", `${path}.${inner}`);
        }
        const entry: { voiceProfileId?: string; greeting?: string } = {};
        if (value.voiceProfileId !== undefined) {
          const id = parseVoiceProfileId(value.voiceProfileId, `${path}.voiceProfileId`, errors);
          if (id) entry.voiceProfileId = id;
        }
        if (value.greeting !== undefined) {
          const greeting = parseGreeting(value.greeting, `${path}.greeting`, errors);
          if (greeting) entry.greeting = greeting;
        }
        profiles[locale] = entry;
      }
      out.languageProfiles = profiles;
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: out as DidVoiceProfile };
}

function parseDidProfiles(raw: unknown, field: string, errors: Errors): Record<string, DidVoiceProfile> | undefined {
  if (!isRecord(raw)) {
    push(errors, "VOICE_SETTINGS_INVALID_SHAPE", field);
    return undefined;
  }
  const entries = Object.entries(raw);
  if (entries.length > MAX_DID_PROFILES) {
    push(errors, "VOICE_DID_PROFILES_TOO_MANY", field);
    return undefined;
  }
  const out: Record<string, DidVoiceProfile> = {};
  const before = errors.length;
  for (const [key, value] of entries) {
    if (!isValidDidProfileKey(key)) {
      push(errors, "VOICE_DID_PROFILE_KEY_INVALID", `${field}.${key}`);
      continue;
    }
    const parsed = parseDidVoiceProfile(value, `${field}.${key}`);
    if (parsed.ok) out[key] = parsed.value;
    else errors.push(...parsed.errors);
  }
  return errors.length === before ? out : undefined;
}

function parseActor(raw: unknown): VoiceSettingsActor | null {
  if (!isRecord(raw) || typeof raw.uid !== "string" || typeof raw.role !== "string") return null;
  return { uid: raw.uid.slice(0, 128), role: raw.role.slice(0, 32) };
}

function parseTimestamp(raw: unknown): string | null {
  if (typeof raw === "string" && !Number.isNaN(Date.parse(raw))) return raw;
  const toDate = (raw as { toDate?: () => Date } | null)?.toDate;
  if (typeof toDate === "function") {
    const date = toDate.call(raw);
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
  }
  return null;
}

/* ── Document / patch ───────────────────────────────────────────────── */

/** Strict shape parse of a stored `voiceSettings/{clinicId}` document. */
export function parseVoiceSettingsDocument(clinicId: string, raw: unknown): VoiceConfigResult<VoiceSettingsDocument> {
  const errors: Errors = [];
  if (!isRecord(raw)) return { ok: false, errors: [{ code: "VOICE_SETTINGS_INVALID_SHAPE" }] };
  rejectUnknownKeys(raw, SETTINGS_DOCUMENT_FIELDS, "", errors);
  if (raw.schemaVersion !== VOICE_SETTINGS_SCHEMA_VERSION) push(errors, "VOICE_SETTINGS_INVALID_SHAPE", "schemaVersion");
  if (raw.clinicId !== clinicId) push(errors, "VOICE_SETTINGS_CLINIC_MISMATCH", "clinicId");
  if (typeof raw.version !== "number" || !Number.isInteger(raw.version) || raw.version < 1) {
    push(errors, "VOICE_SETTINGS_INVALID_SHAPE", "version");
  }

  const enabled = parseBoolean(raw.enabled, "enabled", errors);
  const languageMode = parseLanguageMode(raw.languageMode, "languageMode", errors);
  const defaultLanguage = parseLocale(raw.defaultLanguage, "defaultLanguage", errors);
  const fallbackLanguage = parseLocale(raw.fallbackLanguage, "fallbackLanguage", errors);
  const supportedLanguages = parseLocaleList(raw.supportedLanguages, "supportedLanguages", errors);
  const allowLanguageSwitch = parseBoolean(raw.allowLanguageSwitch, "allowLanguageSwitch", errors);
  const defaultVoiceProfileId = parseVoiceProfileId(raw.defaultVoiceProfileId, "defaultVoiceProfileId", errors);
  const languageProfiles = parseLanguageProfiles(raw.languageProfiles ?? {}, "languageProfiles", errors);
  const didProfiles = parseDidProfiles(raw.didProfiles ?? {}, "didProfiles", errors);
  const customVoiceEnabled = parseBoolean(raw.customVoiceEnabled ?? false, "customVoiceEnabled", errors);

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      schemaVersion: VOICE_SETTINGS_SCHEMA_VERSION,
      clinicId,
      enabled: enabled!,
      languageMode: languageMode!,
      defaultLanguage: defaultLanguage!,
      fallbackLanguage: fallbackLanguage!,
      supportedLanguages: supportedLanguages!,
      allowLanguageSwitch: allowLanguageSwitch!,
      defaultVoiceProfileId: defaultVoiceProfileId!,
      languageProfiles: languageProfiles!,
      didProfiles: didProfiles!,
      customVoiceEnabled: customVoiceEnabled!,
      version: raw.version as number,
      updatedAt: parseTimestamp(raw.updatedAt),
      updatedBy: parseActor(raw.updatedBy),
    },
  };
}

const PATCH_FIELDS = new Set<string>([...CLINIC_EDITABLE_SETTINGS_FIELDS, ...PLATFORM_ONLY_SETTINGS_FIELDS]);
const PLATFORM_ONLY = new Set<string>(PLATFORM_ONLY_SETTINGS_FIELDS);

/** Strict parse of an admin patch. Unknown fields (incl. clinicId/version) are rejected. */
export function parseVoiceSettingsPatch(
  raw: unknown,
  options: { isPlatformAdmin: boolean }
): VoiceConfigResult<VoiceSettingsPatch> {
  const errors: Errors = [];
  if (!isRecord(raw) || Object.keys(raw).length === 0) {
    return { ok: false, errors: [{ code: "VOICE_SETTINGS_INVALID_SHAPE" }] };
  }
  rejectUnknownKeys(raw, PATCH_FIELDS, "", errors);
  for (const key of Object.keys(raw)) {
    if (PLATFORM_ONLY.has(key) && !options.isPlatformAdmin) push(errors, "VOICE_FIELD_REQUIRES_PLATFORM_ADMIN", key);
  }

  const patch: { -readonly [K in keyof VoiceSettingsPatch]: VoiceSettingsPatch[K] } = {};
  if ("enabled" in raw) patch.enabled = parseBoolean(raw.enabled, "enabled", errors);
  if ("languageMode" in raw) patch.languageMode = parseLanguageMode(raw.languageMode, "languageMode", errors);
  if ("defaultLanguage" in raw) patch.defaultLanguage = parseLocale(raw.defaultLanguage, "defaultLanguage", errors);
  if ("fallbackLanguage" in raw) patch.fallbackLanguage = parseLocale(raw.fallbackLanguage, "fallbackLanguage", errors);
  if ("supportedLanguages" in raw) {
    patch.supportedLanguages = parseLocaleList(raw.supportedLanguages, "supportedLanguages", errors);
  }
  if ("allowLanguageSwitch" in raw) patch.allowLanguageSwitch = parseBoolean(raw.allowLanguageSwitch, "allowLanguageSwitch", errors);
  if ("defaultVoiceProfileId" in raw) {
    patch.defaultVoiceProfileId = parseVoiceProfileId(raw.defaultVoiceProfileId, "defaultVoiceProfileId", errors);
  }
  if ("languageProfiles" in raw) patch.languageProfiles = parseLanguageProfiles(raw.languageProfiles, "languageProfiles", errors);
  if ("didProfiles" in raw) patch.didProfiles = parseDidProfiles(raw.didProfiles, "didProfiles", errors);
  if ("customVoiceEnabled" in raw) patch.customVoiceEnabled = parseBoolean(raw.customVoiceEnabled, "customVoiceEnabled", errors);

  return errors.length ? { ok: false, errors } : { ok: true, value: patch };
}

/* ── Legacy baseline ────────────────────────────────────────────────── */

/**
 * Settings equivalent to today's production behavior for a clinic without a settings
 * document: Turkish only, fixed, current worker voice. version 0 marks "never written".
 */
export function legacyVoiceSettings(clinicId: string): VoiceSettingsDocument {
  return {
    schemaVersion: VOICE_SETTINGS_SCHEMA_VERSION,
    clinicId,
    enabled: true,
    languageMode: "FIXED",
    defaultLanguage: SYSTEM_DEFAULT_VOICE_LOCALE,
    fallbackLanguage: SYSTEM_DEFAULT_VOICE_LOCALE,
    supportedLanguages: [SYSTEM_DEFAULT_VOICE_LOCALE],
    allowLanguageSwitch: false,
    defaultVoiceProfileId: LEGACY_TURKISH_VOICE_PROFILE_ID,
    languageProfiles: {},
    didProfiles: {},
    customVoiceEnabled: false,
    version: 0,
    updatedAt: null,
    updatedBy: null,
  };
}

/* ── Semantic validation ────────────────────────────────────────────── */

/** The language/voice fields shared by clinic settings and DID-merged effective configuration. */
export interface VoiceLanguageConfig {
  readonly enabled: boolean;
  readonly languageMode: VoiceLanguageMode;
  readonly defaultLanguage: VoiceLocale;
  readonly fallbackLanguage: VoiceLocale;
  readonly supportedLanguages: readonly VoiceLocale[];
  readonly allowLanguageSwitch: boolean;
  readonly defaultVoiceProfileId: string;
  readonly languageProfiles: Readonly<Partial<Record<VoiceLocale, LanguageProfileSettings>>>;
}

/** Every voice profile id referenced by settings, including all DID profiles. */
export function collectVoiceProfileIds(settings: VoiceSettingsDocument): string[] {
  const ids = new Set<string>([settings.defaultVoiceProfileId]);
  for (const profile of Object.values(settings.languageProfiles)) if (profile?.voiceProfileId) ids.add(profile.voiceProfileId);
  for (const did of Object.values(settings.didProfiles)) {
    if (did.defaultVoiceProfileId) ids.add(did.defaultVoiceProfileId);
    for (const entry of Object.values(did.languageProfiles ?? {})) if (entry?.voiceProfileId) ids.add(entry.voiceProfileId);
  }
  return [...ids].sort();
}

export function enabledLanguages(config: VoiceLanguageConfig): VoiceLocale[] {
  return config.supportedLanguages.filter((locale) => config.languageProfiles[locale]?.enabled !== false);
}

export interface SemanticValidationContext {
  readonly clinicId: string;
  readonly customVoiceEnabled: boolean;
  /** Pre-loaded profiles: missing/null → VOICE_PROFILE_NOT_FOUND, "INVALID" → VOICE_PROFILE_INVALID. */
  readonly profiles: ReadonlyMap<string, VoiceProfile | "INVALID" | null>;
}

function usableProfile(context: SemanticValidationContext, id: string): VoiceProfile | null {
  const profile = context.profiles.get(id);
  return profile && profile !== "INVALID" ? profile : null;
}

function checkVoiceReference(id: string, field: string, context: SemanticValidationContext, errors: Errors): void {
  const profile = context.profiles.get(id);
  if (profile === "INVALID") {
    push(errors, "VOICE_PROFILE_INVALID", field);
    return;
  }
  if (!profile) {
    push(errors, "VOICE_PROFILE_NOT_FOUND", field);
    return;
  }
  const usable = checkVoiceProfileUsable(profile, context);
  if (!usable.ok) push(errors, usable.code, field);
}

/** Cross-field rules for one language configuration (clinic level or DID-merged). */
export function validateVoiceLanguageConfig(
  config: VoiceLanguageConfig,
  context: SemanticValidationContext,
  prefix = ""
): VoiceConfigError[] {
  const errors: Errors = [];
  const at = (field: string) => (prefix ? `${prefix}.${field}` : field);
  const supported = config.supportedLanguages;

  if (supported.length === 0) push(errors, "VOICE_SUPPORTED_LANGUAGES_EMPTY", at("supportedLanguages"));
  if (new Set(supported).size !== supported.length) push(errors, "VOICE_LOCALE_DUPLICATE", at("supportedLanguages"));
  if (!supported.includes(config.defaultLanguage)) push(errors, "VOICE_DEFAULT_LANGUAGE_NOT_SUPPORTED", at("defaultLanguage"));
  if (!supported.includes(config.fallbackLanguage)) push(errors, "VOICE_FALLBACK_LANGUAGE_NOT_SUPPORTED", at("fallbackLanguage"));

  for (const locale of Object.keys(config.languageProfiles) as VoiceLocale[]) {
    if (!supported.includes(locale)) push(errors, "VOICE_LANGUAGE_PROFILE_UNSUPPORTED_LOCALE", at(`languageProfiles.${locale}`));
  }
  if (config.languageProfiles[config.defaultLanguage]?.enabled === false) {
    push(errors, "VOICE_DEFAULT_LANGUAGE_DISABLED", at(`languageProfiles.${config.defaultLanguage}.enabled`));
  }
  if (config.languageProfiles[config.fallbackLanguage]?.enabled === false) {
    push(errors, "VOICE_DEFAULT_LANGUAGE_DISABLED", at(`languageProfiles.${config.fallbackLanguage}.enabled`));
  }

  const active = enabledLanguages(config);
  if (config.languageMode === "AUTO" && active.length < 2) {
    push(errors, "VOICE_AUTO_REQUIRES_MULTIPLE_LANGUAGES", at("languageMode"));
  }

  checkVoiceReference(config.defaultVoiceProfileId, at("defaultVoiceProfileId"), context, errors);
  for (const [locale, profile] of Object.entries(config.languageProfiles) as [VoiceLocale, LanguageProfileSettings][]) {
    if (profile.voiceProfileId) {
      checkVoiceReference(profile.voiceProfileId, at(`languageProfiles.${locale}.voiceProfileId`), context, errors);
    }
  }
  // Every offered language must be speakable by its effective voice.
  for (const locale of active) {
    const own = config.languageProfiles[locale]?.voiceProfileId;
    const profile = usableProfile(context, own ?? config.defaultVoiceProfileId);
    if (profile && !profile.supportedLocales.includes(locale)) {
      push(
        errors,
        "VOICE_PROFILE_LOCALE_UNSUPPORTED",
        at(own ? `languageProfiles.${locale}.voiceProfileId` : `defaultVoiceProfileId[${locale}]`)
      );
    }
  }
  return errors;
}

/**
 * Effective configuration for one DID profile: absent fields inherit the clinic settings;
 * `enabled` can only be narrowed to false; languages can only narrow the clinic's set.
 */
export function mergeDidProfile(clinic: VoiceSettingsDocument, did: DidVoiceProfile): VoiceLanguageConfig {
  const languageProfiles: Partial<Record<VoiceLocale, LanguageProfileSettings>> = {};
  const supportedLanguages = did.supportedLanguages ?? clinic.supportedLanguages;
  for (const locale of supportedLanguages) {
    const base = clinic.languageProfiles[locale];
    const over = did.languageProfiles?.[locale];
    if (!base && !over) continue;
    languageProfiles[locale] = {
      enabled: base?.enabled ?? true,
      voiceProfileId: over?.voiceProfileId ?? base?.voiceProfileId ?? null,
      greeting: over?.greeting ?? base?.greeting ?? null,
    };
  }
  return {
    enabled: clinic.enabled && did.enabled !== false,
    languageMode: did.languageMode ?? clinic.languageMode,
    defaultLanguage: did.defaultLanguage ?? clinic.defaultLanguage,
    fallbackLanguage: did.fallbackLanguage ?? clinic.fallbackLanguage,
    supportedLanguages,
    allowLanguageSwitch: did.allowLanguageSwitch ?? clinic.allowLanguageSwitch,
    defaultVoiceProfileId: did.defaultVoiceProfileId ?? clinic.defaultVoiceProfileId,
    languageProfiles,
  };
}

/** Full validation of settings: clinic level plus every DID profile merged over it. */
export function validateVoiceSettings(
  settings: VoiceSettingsDocument,
  context: Omit<SemanticValidationContext, "customVoiceEnabled" | "clinicId">
): VoiceConfigError[] {
  const full: SemanticValidationContext = {
    clinicId: settings.clinicId,
    customVoiceEnabled: settings.customVoiceEnabled,
    profiles: context.profiles,
  };
  const errors = validateVoiceLanguageConfig(settings, full);
  const clinicLanguages = new Set(settings.supportedLanguages);
  for (const [key, did] of Object.entries(settings.didProfiles)) {
    const prefix = `didProfiles.${key}`;
    for (const locale of did.supportedLanguages ?? []) {
      if (!clinicLanguages.has(locale)) push(errors, "VOICE_DID_OVERRIDE_LANGUAGE_NOT_IN_CLINIC", `${prefix}.supportedLanguages`);
    }
    const didLanguages = new Set(did.supportedLanguages ?? settings.supportedLanguages);
    for (const locale of Object.keys(did.languageProfiles ?? {}) as VoiceLocale[]) {
      if (!clinicLanguages.has(locale)) push(errors, "VOICE_DID_OVERRIDE_LANGUAGE_NOT_IN_CLINIC", `${prefix}.languageProfiles.${locale}`);
      else if (!didLanguages.has(locale)) push(errors, "VOICE_LANGUAGE_PROFILE_UNSUPPORTED_LOCALE", `${prefix}.languageProfiles.${locale}`);
    }
    errors.push(...validateVoiceLanguageConfig(mergeDidProfile(settings, did), full, prefix));
  }
  return errors;
}
