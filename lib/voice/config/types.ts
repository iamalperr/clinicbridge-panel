/**
 * Voice control plane: canonical server-managed configuration (Phase 4A, backend only).
 *
 * Firestore layout (all server-only; clients are denied by firestore.rules):
 *   voiceSettings/{clinicId}                     VoiceSettingsDocument, doc id == clinicId
 *   voiceSettings/{clinicId}/auditLog/{eventId}  VoiceSettingsAuditEvent (append-only)
 *   voiceProfiles/{voiceProfileId}               StoredVoiceProfile (SYSTEM or CUSTOM)
 *   voiceNumbers/{E.164}.voiceProfileKey         optional reference to didProfiles[key]
 *
 * Provider credentials (Cartesia, LiveKit, OpenAI, Firebase) never appear in any of these
 * documents; they stay worker/server infrastructure secrets.
 */

import type { VoiceLocale } from "./languageRegistry";

export type VoiceLanguageMode = "FIXED" | "AUTO";

export const VOICE_SETTINGS_COLLECTION = "voiceSettings";
export const VOICE_SETTINGS_AUDIT_SUBCOLLECTION = "auditLog";
export const VOICE_PROFILES_COLLECTION = "voiceProfiles";
export const VOICE_SETTINGS_SCHEMA_VERSION = 1;

export const MAX_GREETING_LENGTH = 500;
export const MAX_DID_PROFILES = 10;

/* ── Voice profiles ─────────────────────────────────────────────────── */

export type VoiceProvider = "cartesia";
export type VoiceProfileType = "SYSTEM" | "CUSTOM";
export type VoiceProfileStatus = "ACTIVE" | "INACTIVE";

/**
 * How the runtime obtains the provider voice. WORKER_ENV is the current production Turkish
 * voice, read by the worker from CLINICBRIDGE_VOICE_TTS_VOICE_ID; the value never enters
 * Firestore or this control plane.
 */
export type ProviderVoiceRef =
  | { readonly kind: "WORKER_ENV" }
  | { readonly kind: "PROVIDER_VOICE_ID"; readonly providerVoiceId: string }
  /** CUSTOM voice not provisioned at the provider yet (DRAFT/PROCESSING); never usable. */
  | { readonly kind: "UNPROVISIONED" };

export type CustomVoiceLifecycleStatus =
  | "DRAFT"
  | "CONSENT_PENDING"
  | "PROCESSING"
  | "ACTIVE"
  | "FAILED"
  | "DISABLED";

export type CustomVoiceConsentStatus = "NOT_PROVIDED" | "PROVIDED" | "REVOKED";

export interface CustomVoiceConsent {
  readonly status: CustomVoiceConsentStatus;
  /** ISO timestamp; required when PROVIDED. */
  readonly providedAt: string | null;
  /** Staff uid that recorded the consent. */
  readonly recordedByUid: string | null;
  /** Reference to the signed consent record (storage path / document id), never the record itself. */
  readonly consentRecordRef: string | null;
  readonly revokedAt: string | null;
}

export interface CustomVoiceDetails {
  readonly lifecycleStatus: CustomVoiceLifecycleStatus;
  readonly consent: CustomVoiceConsent;
  /** Reference to the source audio in object storage; raw samples are never stored in Firestore. */
  readonly sampleStorageRef: string | null;
  readonly createdByUid: string | null;
  readonly failureCode: string | null;
}

export interface VoiceProfile {
  readonly id: string;
  readonly displayName: string;
  readonly provider: VoiceProvider;
  readonly providerVoice: ProviderVoiceRef;
  readonly supportedLocales: readonly VoiceLocale[];
  readonly type: VoiceProfileType;
  readonly status: VoiceProfileStatus;
  /** null for SYSTEM; owning clinic for CUSTOM. */
  readonly ownerClinicId: string | null;
  readonly custom: CustomVoiceDetails | null;
  readonly metadata: Readonly<Record<string, string>>;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

/* ── Clinic voice settings ──────────────────────────────────────────── */

export interface LanguageProfileSettings {
  /** false keeps the profile but stops offering the language. */
  readonly enabled: boolean;
  /** Overrides defaultVoiceProfileId for this locale. */
  readonly voiceProfileId: string | null;
  /** null → runtime generic greeting for the locale. */
  readonly greeting: string | null;
}

/**
 * DID-level override, referenced from voiceNumbers/{DID}.voiceProfileKey. Every field is
 * optional; absent fields inherit the clinic settings. There is deliberately no clinicId,
 * DID or routing field: tenant identity comes only from the trusted DID mapping.
 */
export interface DidVoiceProfile {
  readonly label: string;
  /** Only `false` is accepted: a DID can switch voice off, never on when the clinic is off. */
  readonly enabled?: false;
  readonly languageMode?: VoiceLanguageMode;
  readonly defaultLanguage?: VoiceLocale;
  readonly fallbackLanguage?: VoiceLocale;
  /** Must be a subset of the clinic's supported languages. */
  readonly supportedLanguages?: readonly VoiceLocale[];
  readonly allowLanguageSwitch?: boolean;
  readonly defaultVoiceProfileId?: string;
  readonly languageProfiles?: Readonly<
    Partial<Record<VoiceLocale, { readonly voiceProfileId?: string; readonly greeting?: string }>>
  >;
}

export const DID_OVERRIDABLE_FIELDS = [
  "label",
  "enabled",
  "languageMode",
  "defaultLanguage",
  "fallbackLanguage",
  "supportedLanguages",
  "allowLanguageSwitch",
  "defaultVoiceProfileId",
  "languageProfiles",
] as const;

export interface VoiceSettingsActor {
  readonly uid: string;
  readonly role: string;
}

export interface VoiceSettingsDocument {
  readonly schemaVersion: typeof VOICE_SETTINGS_SCHEMA_VERSION;
  readonly clinicId: string;
  readonly enabled: boolean;
  readonly languageMode: VoiceLanguageMode;
  readonly defaultLanguage: VoiceLocale;
  readonly fallbackLanguage: VoiceLocale;
  readonly supportedLanguages: readonly VoiceLocale[];
  readonly allowLanguageSwitch: boolean;
  readonly defaultVoiceProfileId: string;
  readonly languageProfiles: Readonly<Partial<Record<VoiceLocale, LanguageProfileSettings>>>;
  readonly didProfiles: Readonly<Record<string, DidVoiceProfile>>;
  /** Platform entitlement (super admin only): gates every CUSTOM voice reference. */
  readonly customVoiceEnabled: boolean;
  readonly version: number;
  readonly updatedAt: string | null;
  readonly updatedBy: VoiceSettingsActor | null;
}

/** Fields a clinic admin may patch. Top-level replacement: maps/arrays are replaced whole. */
export const CLINIC_EDITABLE_SETTINGS_FIELDS = [
  "enabled",
  "languageMode",
  "defaultLanguage",
  "fallbackLanguage",
  "supportedLanguages",
  "allowLanguageSwitch",
  "defaultVoiceProfileId",
  "languageProfiles",
  "didProfiles",
] as const;

export const PLATFORM_ONLY_SETTINGS_FIELDS = ["customVoiceEnabled"] as const;

export type VoiceSettingsPatch = Partial<
  Pick<
    VoiceSettingsDocument,
    (typeof CLINIC_EDITABLE_SETTINGS_FIELDS)[number] | (typeof PLATFORM_ONLY_SETTINGS_FIELDS)[number]
  >
>;

/* ── Resolved runtime configuration ─────────────────────────────────── */

export interface ResolvedLanguageProfile {
  readonly locale: VoiceLocale;
  readonly rtl: boolean;
  readonly voiceProfileId: string;
  readonly voiceType: VoiceProfileType;
  readonly provider: VoiceProvider;
  readonly providerVoice: ProviderVoiceRef;
  readonly greeting: string | null;
}

export type VoiceConfigSource = "LEGACY" | "VOICE_SETTINGS";

export interface ResolvedVoiceConfiguration {
  readonly clinicId: string;
  readonly didE164: string | null;
  readonly source: VoiceConfigSource;
  readonly enabled: boolean;
  readonly languageMode: VoiceLanguageMode;
  readonly defaultLanguage: VoiceLocale;
  readonly fallbackLanguage: VoiceLocale;
  readonly supportedLanguages: readonly VoiceLocale[];
  readonly allowLanguageSwitch: boolean;
  readonly languageProfiles: Readonly<Partial<Record<VoiceLocale, ResolvedLanguageProfile>>>;
  readonly resolvedDidProfile: { readonly key: string; readonly label: string } | null;
  /** 0 for LEGACY (no settings document). */
  readonly version: number;
  /** Non-fatal, deterministic reasons the result differs from the stored configuration. */
  readonly issues: readonly VoiceConfigIssueCode[];
  /** Validation errors behind those issues (codes and field paths only). */
  readonly diagnostics: readonly VoiceConfigError[];
}

/* ── Stable codes ───────────────────────────────────────────────────── */

export const VOICE_CONFIG_ERROR_CODES = [
  // shape / fields
  "VOICE_SETTINGS_INVALID_SHAPE",
  "VOICE_FIELD_NOT_ALLOWED",
  "VOICE_FIELD_REQUIRES_PLATFORM_ADMIN",
  "VOICE_SETTINGS_CLINIC_MISMATCH",
  // languages
  "VOICE_LANGUAGE_MODE_INVALID",
  "VOICE_LOCALE_UNKNOWN",
  "VOICE_LOCALE_RETIRED",
  "VOICE_LOCALE_DUPLICATE",
  "VOICE_SUPPORTED_LANGUAGES_EMPTY",
  "VOICE_DEFAULT_LANGUAGE_NOT_SUPPORTED",
  "VOICE_FALLBACK_LANGUAGE_NOT_SUPPORTED",
  "VOICE_DEFAULT_LANGUAGE_DISABLED",
  "VOICE_AUTO_REQUIRES_MULTIPLE_LANGUAGES",
  "VOICE_LANGUAGE_PROFILE_UNSUPPORTED_LOCALE",
  "VOICE_GREETING_INVALID",
  // voice profiles
  "VOICE_PROFILE_ID_INVALID",
  "VOICE_PROFILE_NOT_FOUND",
  "VOICE_PROFILE_INVALID",
  "VOICE_PROFILE_INACTIVE",
  "VOICE_PROFILE_LOCALE_UNSUPPORTED",
  "VOICE_CUSTOM_VOICES_DISABLED",
  "VOICE_CUSTOM_VOICE_CROSS_TENANT",
  "VOICE_CUSTOM_VOICE_CONSENT_MISSING",
  "VOICE_CUSTOM_VOICE_NOT_READY",
  // DID overrides
  "VOICE_DID_PROFILE_KEY_INVALID",
  "VOICE_DID_PROFILE_NOT_FOUND",
  "VOICE_DID_PROFILE_IN_USE",
  "VOICE_DID_PROFILES_TOO_MANY",
  "VOICE_DID_OVERRIDE_FIELD_NOT_ALLOWED",
  "VOICE_DID_OVERRIDE_TENANT_FIELD_FORBIDDEN",
  "VOICE_DID_OVERRIDE_LANGUAGE_NOT_IN_CLINIC",
  "VOICE_DID_INVALID",
  "VOICE_DID_MAPPING_NOT_FOUND",
  "VOICE_DID_TENANT_MISMATCH",
  // access / lookup / concurrency
  "VOICE_CLINIC_ID_INVALID",
  "VOICE_CLINIC_NOT_FOUND",
  "VOICE_ACCESS_DENIED",
  "VOICE_CONFIG_LOOKUP_FAILED",
  "VOICE_SETTINGS_VERSION_CONFLICT",
] as const;

export type VoiceConfigErrorCode = (typeof VOICE_CONFIG_ERROR_CODES)[number];

export const VOICE_CONFIG_ISSUE_CODES = [
  /** Stored settings failed validation at resolve time; legacy Turkish behavior was used. */
  "VOICE_SETTINGS_INVALID_USED_LEGACY",
  /** Settings could not be read; legacy Turkish behavior was used. */
  "VOICE_SETTINGS_UNREADABLE_USED_LEGACY",
  /** DID profile reference missing or invalid; clinic settings were used for this DID. */
  "VOICE_DID_PROFILE_IGNORED",
  /** Legacy voiceNumbers.defaultLocale is not Turkish; the Turkish-only legacy stack was kept. */
  "VOICE_LEGACY_LOCALE_IGNORED",
] as const;

export type VoiceConfigIssueCode = (typeof VOICE_CONFIG_ISSUE_CODES)[number];

export interface VoiceConfigError {
  readonly code: VoiceConfigErrorCode;
  /** Dotted field path, never a value. */
  readonly field?: string;
}

export type VoiceConfigResult<T> = { ok: true; value: T } | { ok: false; errors: readonly VoiceConfigError[] };

/* ── Audit ──────────────────────────────────────────────────────────── */

export type VoiceSettingsAuditAction = "VOICE_SETTINGS_UPDATED" | "DID_VOICE_PROFILE_ASSIGNED";

export interface VoiceSettingsAuditEvent {
  readonly action: VoiceSettingsAuditAction;
  readonly clinicId: string;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly at: string;
  readonly actor: VoiceSettingsActor;
  readonly changedFields: readonly string[];
  /** Before/after of language-shape fields only (no greetings, no provider identifiers). */
  readonly languageChange: {
    readonly before: AuditLanguageShape;
    readonly after: AuditLanguageShape;
  } | null;
  readonly didE164?: string;
  readonly voiceProfileKey?: { readonly before: string | null; readonly after: string | null };
}

export interface AuditLanguageShape {
  readonly enabled: boolean;
  readonly languageMode: VoiceLanguageMode;
  readonly defaultLanguage: VoiceLocale;
  readonly fallbackLanguage: VoiceLocale;
  readonly supportedLanguages: readonly VoiceLocale[];
  readonly allowLanguageSwitch: boolean;
}
