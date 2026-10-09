/**
 * Voice settings admin service: the boundary the future "Sesli Yanıt" UI will call through
 * app/api/clinics/[clinicId]/voice-settings. Every operation authorizes the caller itself.
 *
 * Writes are transactional and versioned (optimistic concurrency via expectedVersion); each
 * successful mutation appends an audit event in the same transaction. No-op patches write
 * nothing. Responses never contain provider voice ids, storage/consent refs or credentials.
 */

import type { UserProfile } from "@/lib/types";
import { normalizeCalledDid, VOICE_NUMBERS_COLLECTION } from "@/lib/voice/telephony/didResolver";
import { authorizeVoiceSettingsAccess } from "./authorization";
import { VOICE_LANGUAGE_REGISTRY, VOICE_LOCALES, type VoiceLanguageDefinition } from "./languageRegistry";
import { loadVoiceProfiles, type VoiceConfigFirestore, type VoiceDocSnapshot } from "./store";
import {
  VOICE_PROFILES_COLLECTION,
  VOICE_SETTINGS_AUDIT_SUBCOLLECTION,
  VOICE_SETTINGS_COLLECTION,
  type AuditLanguageShape,
  type VoiceConfigError,
  type VoiceConfigErrorCode,
  type VoiceProfile,
  type VoiceSettingsActor,
  type VoiceSettingsAuditEvent,
  type VoiceSettingsDocument,
} from "./types";
import {
  collectVoiceProfileIds,
  isValidDidProfileKey,
  isValidVoiceClinicId,
  legacyVoiceSettings,
  parseVoiceSettingsDocument,
  parseVoiceSettingsPatch,
  validateVoiceSettings,
} from "./validation";
import { BUILTIN_VOICE_PROFILES, parseStoredVoiceProfile, toVoiceProfileSummary, type VoiceProfileSummary } from "./voiceProfiles";

const CLINICS_COLLECTION = "clinics";

export interface VoiceSettingsServiceDeps {
  readonly db: VoiceConfigFirestore | null | undefined;
  readonly now?: () => Date;
}

export interface VoiceSettingsCaller {
  readonly uid: string;
  readonly profile: Pick<UserProfile, "role" | "permissions" | "status" | "clinicId"> | null | undefined;
}

export type VoiceServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 403 | 404 | 409 | 422 | 503; errors: readonly VoiceConfigError[] };

export interface VoiceSettingsView {
  readonly clinicId: string;
  /** LEGACY: no settings document yet; values describe today's Turkish production behavior. */
  readonly source: "LEGACY" | "VOICE_SETTINGS";
  readonly settings: Omit<VoiceSettingsDocument, "schemaVersion">;
  /** Present when the stored document no longer validates (e.g. a voice lost consent). */
  readonly storedConfigErrors: readonly VoiceConfigError[];
  readonly languages: readonly VoiceLanguageDefinition[];
}

export interface DidVoiceOverrideView {
  readonly didE164: string;
  readonly active: boolean;
  readonly voiceEnabled: boolean;
  readonly voiceProfileKey: string | null;
  readonly profileLabel: string | null;
}

const STATUS_BY_CODE: Partial<Record<VoiceConfigErrorCode, 400 | 403 | 404 | 409 | 503>> = {
  VOICE_ACCESS_DENIED: 403,
  VOICE_FIELD_REQUIRES_PLATFORM_ADMIN: 403,
  VOICE_CLINIC_ID_INVALID: 400,
  VOICE_DID_INVALID: 400,
  VOICE_CLINIC_NOT_FOUND: 404,
  VOICE_DID_MAPPING_NOT_FOUND: 404,
  VOICE_DID_TENANT_MISMATCH: 404,
  VOICE_SETTINGS_VERSION_CONFLICT: 409,
  VOICE_CONFIG_LOOKUP_FAILED: 503,
};

function fail<T>(errors: readonly VoiceConfigError[]): VoiceServiceResult<T> {
  const status = errors.map((e) => STATUS_BY_CODE[e.code]).find((s) => s !== undefined) ?? 422;
  return { ok: false, status, errors };
}

function failCode<T>(code: VoiceConfigErrorCode, field?: string): VoiceServiceResult<T> {
  return fail([field ? { code, field } : { code }]);
}

type Access = { actor: VoiceSettingsActor; isPlatformAdmin: boolean; db: VoiceConfigFirestore };

function authorize(deps: VoiceSettingsServiceDeps, caller: VoiceSettingsCaller, clinicId: string): Access | VoiceConfigErrorCode {
  if (!isValidVoiceClinicId(clinicId)) return "VOICE_CLINIC_ID_INVALID";
  const decision = authorizeVoiceSettingsAccess(caller?.uid, caller?.profile, clinicId);
  if (!decision.ok) return decision.code;
  if (!deps.db) return "VOICE_CONFIG_LOOKUP_FAILED";
  return { actor: decision.actor, isPlatformAdmin: decision.isPlatformAdmin, db: deps.db };
}

/** Firestore rejects undefined; settings are plain JSON data, so a JSON round-trip is exact. */
function toFirestoreData<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function languageShape(s: VoiceSettingsDocument): AuditLanguageShape {
  return {
    enabled: s.enabled,
    languageMode: s.languageMode,
    defaultLanguage: s.defaultLanguage,
    fallbackLanguage: s.fallbackLanguage,
    supportedLanguages: [...s.supportedLanguages],
    allowLanguageSwitch: s.allowLanguageSwitch,
  };
}

function changedFields(before: VoiceSettingsDocument, after: VoiceSettingsDocument, keys: readonly string[]): string[] {
  const b = before as unknown as Record<string, unknown>;
  const a = after as unknown as Record<string, unknown>;
  return keys.filter((key) => JSON.stringify(b[key]) !== JSON.stringify(a[key])).sort();
}

function readStoredSettings(clinicId: string, snap: VoiceDocSnapshot): VoiceServiceResult<VoiceSettingsDocument> {
  if (!snap.exists) return { ok: true, value: legacyVoiceSettings(clinicId) };
  const parsed = parseVoiceSettingsDocument(clinicId, snap.data());
  return parsed.ok ? { ok: true, value: parsed.value } : fail(parsed.errors.map((e) => ({ ...e, field: `stored.${e.field ?? ""}` })));
}

function withoutSchemaVersion(settings: VoiceSettingsDocument): Omit<VoiceSettingsDocument, "schemaVersion"> {
  const { schemaVersion, ...rest } = settings;
  void schemaVersion;
  return rest;
}

/* ── Reads ──────────────────────────────────────────────────────────── */

export function listVoiceLanguages(): VoiceLanguageDefinition[] {
  return VOICE_LOCALES.map((locale) => VOICE_LANGUAGE_REGISTRY[locale]);
}

export async function getVoiceSettings(
  deps: VoiceSettingsServiceDeps,
  caller: VoiceSettingsCaller,
  clinicId: string
): Promise<VoiceServiceResult<VoiceSettingsView>> {
  const access = authorize(deps, caller, clinicId);
  if (typeof access === "string") return failCode(access);
  try {
    const snap = await access.db.collection(VOICE_SETTINGS_COLLECTION).doc(clinicId).get();
    const stored = readStoredSettings(clinicId, snap);
    if (!stored.ok) return stored;
    const settings = stored.value;
    const profiles = await loadVoiceProfiles(access.db, collectVoiceProfileIds(settings));
    return {
      ok: true,
      value: {
        clinicId,
        source: snap.exists ? "VOICE_SETTINGS" : "LEGACY",
        settings: withoutSchemaVersion(settings),
        storedConfigErrors: snap.exists ? validateVoiceSettings(settings, { profiles }) : [],
        languages: listVoiceLanguages(),
      },
    };
  } catch {
    return failCode("VOICE_CONFIG_LOOKUP_FAILED");
  }
}

async function readClinicVoiceProfiles(db: VoiceConfigFirestore, clinicId: string): Promise<VoiceProfile[]> {
  const [system, owned] = await Promise.all([
    db.collection(VOICE_PROFILES_COLLECTION).where("type", "==", "SYSTEM").get(),
    db.collection(VOICE_PROFILES_COLLECTION).where("ownerClinicId", "==", clinicId).get(),
  ]);
  const out: VoiceProfile[] = [];
  for (const doc of [...system.docs, ...owned.docs]) {
    const profile = parseStoredVoiceProfile(doc.id, doc.data());
    // Defense in depth: the owner query is re-checked after parsing.
    if (profile && (profile.type === "SYSTEM" || profile.ownerClinicId === clinicId)) out.push(profile);
  }
  return out;
}

/** Voices the clinic can select right now (built-in + active system + its usable custom voices). */
export async function listAvailableVoiceProfiles(
  deps: VoiceSettingsServiceDeps,
  caller: VoiceSettingsCaller,
  clinicId: string
): Promise<VoiceServiceResult<VoiceProfileSummary[]>> {
  const access = authorize(deps, caller, clinicId);
  if (typeof access === "string") return failCode(access);
  try {
    const settingsSnap = await access.db.collection(VOICE_SETTINGS_COLLECTION).doc(clinicId).get();
    const stored = readStoredSettings(clinicId, settingsSnap);
    const context = { clinicId, customVoiceEnabled: stored.ok ? stored.value.customVoiceEnabled : false };
    const profiles = [...Object.values(BUILTIN_VOICE_PROFILES), ...(await readClinicVoiceProfiles(access.db, clinicId))];
    const summaries = profiles.map((p) => toVoiceProfileSummary(p, context)).filter((s) => s.selectable);
    return { ok: true, value: summaries.sort((a, b) => a.id.localeCompare(b.id)) };
  } catch {
    return failCode("VOICE_CONFIG_LOOKUP_FAILED");
  }
}

/** All of the clinic's own custom voices with lifecycle/consent status (selectable or not). */
export async function listCustomVoices(
  deps: VoiceSettingsServiceDeps,
  caller: VoiceSettingsCaller,
  clinicId: string
): Promise<VoiceServiceResult<VoiceProfileSummary[]>> {
  const access = authorize(deps, caller, clinicId);
  if (typeof access === "string") return failCode(access);
  try {
    const settingsSnap = await access.db.collection(VOICE_SETTINGS_COLLECTION).doc(clinicId).get();
    const stored = readStoredSettings(clinicId, settingsSnap);
    const context = { clinicId, customVoiceEnabled: stored.ok ? stored.value.customVoiceEnabled : false };
    const owned = (await readClinicVoiceProfiles(access.db, clinicId)).filter((p) => p.type === "CUSTOM");
    return { ok: true, value: owned.map((p) => toVoiceProfileSummary(p, context)).sort((a, b) => a.id.localeCompare(b.id)) };
  } catch {
    return failCode("VOICE_CONFIG_LOOKUP_FAILED");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** DIDs whose trusted mapping points at this clinic, with their assigned DID profile. */
export async function getDidVoiceOverrides(
  deps: VoiceSettingsServiceDeps,
  caller: VoiceSettingsCaller,
  clinicId: string
): Promise<VoiceServiceResult<DidVoiceOverrideView[]>> {
  const access = authorize(deps, caller, clinicId);
  if (typeof access === "string") return failCode(access);
  try {
    const [numbers, settingsSnap] = await Promise.all([
      access.db.collection(VOICE_NUMBERS_COLLECTION).where("clinicId", "==", clinicId).get(),
      access.db.collection(VOICE_SETTINGS_COLLECTION).doc(clinicId).get(),
    ]);
    const stored = readStoredSettings(clinicId, settingsSnap);
    const didProfiles = stored.ok ? stored.value.didProfiles : {};
    const out: DidVoiceOverrideView[] = [];
    for (const doc of numbers.docs) {
      const data = doc.data();
      if (!isRecord(data) || data.clinicId !== clinicId) continue;
      const key = isValidDidProfileKey(data.voiceProfileKey) ? data.voiceProfileKey : null;
      out.push({
        didE164: doc.id,
        active: data.active === true,
        voiceEnabled: data.voiceEnabled === true,
        voiceProfileKey: key,
        profileLabel: key ? (didProfiles[key]?.label ?? null) : null,
      });
    }
    return { ok: true, value: out.sort((a, b) => a.didE164.localeCompare(b.didE164)) };
  } catch {
    return failCode("VOICE_CONFIG_LOOKUP_FAILED");
  }
}

/* ── Writes ─────────────────────────────────────────────────────────── */

export interface UpdateVoiceSettingsInput {
  readonly expectedVersion: unknown;
  readonly patch: unknown;
}

export interface UpdateVoiceSettingsOutput {
  readonly changed: boolean;
  readonly version: number;
  readonly changedFields: readonly string[];
}

const AUDITED_FIELDS = [
  "enabled",
  "languageMode",
  "defaultLanguage",
  "fallbackLanguage",
  "supportedLanguages",
  "allowLanguageSwitch",
  "defaultVoiceProfileId",
  "languageProfiles",
  "didProfiles",
  "customVoiceEnabled",
] as const;

const LANGUAGE_SHAPE_FIELDS = new Set([
  "enabled",
  "languageMode",
  "defaultLanguage",
  "fallbackLanguage",
  "supportedLanguages",
  "allowLanguageSwitch",
]);

function isVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

class VoiceServiceAbort extends Error {
  constructor(readonly result: VoiceServiceResult<never>) {
    super("voice settings transaction aborted");
  }
}

export async function updateVoiceSettings(
  deps: VoiceSettingsServiceDeps,
  caller: VoiceSettingsCaller,
  clinicId: string,
  input: UpdateVoiceSettingsInput
): Promise<VoiceServiceResult<UpdateVoiceSettingsOutput>> {
  const access = authorize(deps, caller, clinicId);
  if (typeof access === "string") return failCode(access);
  if (!isVersion(input?.expectedVersion)) return failCode("VOICE_SETTINGS_INVALID_SHAPE", "expectedVersion");
  const parsedPatch = parseVoiceSettingsPatch(input.patch, { isPlatformAdmin: access.isPlatformAdmin });
  if (!parsedPatch.ok) return fail(parsedPatch.errors);
  const patch = parsedPatch.value;
  const db = access.db;
  const now = (deps.now ?? (() => new Date()))().toISOString();

  try {
    return await db.runTransaction(async (tx) => {
      const settingsRef = db.collection(VOICE_SETTINGS_COLLECTION).doc(clinicId);
      const clinicSnap = await tx.get(db.collection(CLINICS_COLLECTION).doc(clinicId));
      if (!clinicSnap.exists) throw new VoiceServiceAbort(failCode("VOICE_CLINIC_NOT_FOUND"));
      const snap = await tx.get(settingsRef);
      const stored = readStoredSettings(clinicId, snap);
      if (!stored.ok) throw new VoiceServiceAbort(stored);
      const current = stored.value;
      if (current.version !== input.expectedVersion) throw new VoiceServiceAbort(failCode("VOICE_SETTINGS_VERSION_CONFLICT"));

      const candidate: VoiceSettingsDocument = { ...current, ...patch, clinicId };
      const changed = changedFields(current, candidate, AUDITED_FIELDS);
      if (snap.exists && changed.length === 0) return { ok: true, value: { changed: false, version: current.version, changedFields: [] } };

      const profiles = await loadVoiceProfiles(db, collectVoiceProfileIds(candidate));
      const errors = validateVoiceSettings(candidate, { profiles });
      if (patch.didProfiles) {
        const removed = Object.keys(current.didProfiles).filter((key) => !(key in candidate.didProfiles));
        if (removed.length) {
          const numbers = await db.collection(VOICE_NUMBERS_COLLECTION).where("clinicId", "==", clinicId).get();
          for (const doc of numbers.docs) {
            const data = doc.data();
            if (isRecord(data) && typeof data.voiceProfileKey === "string" && removed.includes(data.voiceProfileKey)) {
              errors.push({ code: "VOICE_DID_PROFILE_IN_USE", field: `didProfiles.${data.voiceProfileKey}` });
            }
          }
        }
      }
      if (errors.length) throw new VoiceServiceAbort(fail(errors));

      const next: VoiceSettingsDocument = { ...candidate, version: current.version + 1, updatedAt: now, updatedBy: access.actor };
      const languageChanged = changed.some((field) => LANGUAGE_SHAPE_FIELDS.has(field));
      const event: VoiceSettingsAuditEvent = {
        action: "VOICE_SETTINGS_UPDATED",
        clinicId,
        fromVersion: current.version,
        toVersion: next.version,
        at: now,
        actor: access.actor,
        changedFields: changed,
        languageChange: languageChanged ? { before: languageShape(current), after: languageShape(next) } : null,
      };
      tx.set(settingsRef, toFirestoreData(next));
      tx.create(settingsRef.collection(VOICE_SETTINGS_AUDIT_SUBCOLLECTION).doc(), toFirestoreData(event));
      return { ok: true, value: { changed: true, version: next.version, changedFields: changed } };
    });
  } catch (err) {
    if (err instanceof VoiceServiceAbort) return err.result;
    return failCode("VOICE_CONFIG_LOOKUP_FAILED");
  }
}

export interface UpdateDidVoiceOverrideInput {
  readonly calledDid: unknown;
  /** Key in voiceSettings.didProfiles, or null to remove the DID override. */
  readonly voiceProfileKey: unknown;
  readonly expectedVersion: unknown;
}

/**
 * Assigns a DID profile to a DID owned by this clinic. Writes ONLY voiceNumbers/{DID}.voiceProfileKey
 * (never clinicId/active/voiceEnabled/routing), after re-verifying ownership inside the transaction.
 */
export async function updateDidVoiceOverride(
  deps: VoiceSettingsServiceDeps,
  caller: VoiceSettingsCaller,
  clinicId: string,
  input: UpdateDidVoiceOverrideInput
): Promise<VoiceServiceResult<UpdateVoiceSettingsOutput>> {
  const access = authorize(deps, caller, clinicId);
  if (typeof access === "string") return failCode(access);
  if (!isVersion(input?.expectedVersion)) return failCode("VOICE_SETTINGS_INVALID_SHAPE", "expectedVersion");
  const normalized = normalizeCalledDid(input.calledDid);
  if (!normalized.ok) return failCode("VOICE_DID_INVALID", "calledDid");
  const key = input.voiceProfileKey;
  if (key !== null && !isValidDidProfileKey(key)) return failCode("VOICE_DID_PROFILE_KEY_INVALID", "voiceProfileKey");
  const db = access.db;
  const didE164 = normalized.didE164;
  const now = (deps.now ?? (() => new Date()))().toISOString();

  try {
    return await db.runTransaction(async (tx) => {
      const mappingRef = db.collection(VOICE_NUMBERS_COLLECTION).doc(didE164);
      const settingsRef = db.collection(VOICE_SETTINGS_COLLECTION).doc(clinicId);
      const mappingSnap = await tx.get(mappingRef);
      if (!mappingSnap.exists) throw new VoiceServiceAbort(failCode("VOICE_DID_MAPPING_NOT_FOUND"));
      const mapping = mappingSnap.data();
      if (!isRecord(mapping) || mapping.clinicId !== clinicId) throw new VoiceServiceAbort(failCode("VOICE_DID_TENANT_MISMATCH"));
      const settingsSnap = await tx.get(settingsRef);
      const stored = readStoredSettings(clinicId, settingsSnap);
      if (!stored.ok) throw new VoiceServiceAbort(stored);
      const current = stored.value;
      if (current.version !== input.expectedVersion) throw new VoiceServiceAbort(failCode("VOICE_SETTINGS_VERSION_CONFLICT"));
      if (key !== null && !current.didProfiles[key]) {
        throw new VoiceServiceAbort(failCode("VOICE_DID_PROFILE_NOT_FOUND", "voiceProfileKey"));
      }

      const before = isValidDidProfileKey(mapping.voiceProfileKey) ? mapping.voiceProfileKey : null;
      if (before === key) return { ok: true, value: { changed: false, version: current.version, changedFields: [] } };

      const nextVersion = settingsSnap.exists ? current.version + 1 : current.version;
      tx.update(mappingRef, { voiceProfileKey: key });
      if (settingsSnap.exists) tx.update(settingsRef, { version: nextVersion, updatedAt: now, updatedBy: toFirestoreData(access.actor) });
      const event: VoiceSettingsAuditEvent = {
        action: "DID_VOICE_PROFILE_ASSIGNED",
        clinicId,
        fromVersion: current.version,
        toVersion: nextVersion,
        at: now,
        actor: access.actor,
        changedFields: ["voiceProfileKey"],
        languageChange: null,
        didE164,
        voiceProfileKey: { before, after: key },
      };
      tx.create(settingsRef.collection(VOICE_SETTINGS_AUDIT_SUBCOLLECTION).doc(), toFirestoreData(event));
      return { ok: true, value: { changed: true, version: nextVersion, changedFields: ["voiceProfileKey"] } };
    });
  } catch (err) {
    if (err instanceof VoiceServiceAbort) return err.result;
    return failCode("VOICE_CONFIG_LOOKUP_FAILED");
  }
}
