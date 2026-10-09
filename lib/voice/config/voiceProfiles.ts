/**
 * Voice profiles: selectable voices, never provider credentials.
 *
 * The built-in legacy profile is the current production Turkish voice. Its provider voice id
 * lives only in the worker env (CLINICBRIDGE_VOICE_TTS_VOICE_ID), so this module never sees it.
 * Every other profile is a `voiceProfiles/{id}` document (SYSTEM or clinic-owned CUSTOM).
 */

import { isVoiceLocale, type VoiceLocale } from "./languageRegistry";
import type {
  CustomVoiceConsent,
  CustomVoiceDetails,
  CustomVoiceLifecycleStatus,
  VoiceConfigErrorCode,
  VoiceProfile,
} from "./types";

export const LEGACY_TURKISH_VOICE_PROFILE_ID = "builtin_tr_reception";

/** Reserved for code-defined profiles; Firestore documents with this prefix are rejected. */
const BUILTIN_PREFIX = "builtin_";

export const BUILTIN_VOICE_PROFILES: Readonly<Record<string, VoiceProfile>> = Object.freeze({
  [LEGACY_TURKISH_VOICE_PROFILE_ID]: Object.freeze({
    id: LEGACY_TURKISH_VOICE_PROFILE_ID,
    displayName: "ClinicBridge Turkish Reception",
    provider: "cartesia",
    providerVoice: Object.freeze({ kind: "WORKER_ENV" }),
    supportedLocales: Object.freeze(["tr-TR"]) as readonly VoiceLocale[],
    type: "SYSTEM",
    status: "ACTIVE",
    ownerClinicId: null,
    custom: null,
    metadata: Object.freeze({}),
    createdAt: null,
    updatedAt: null,
  } satisfies VoiceProfile),
});

const VOICE_PROFILE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
/** Cartesia voice ids are UUIDs (same rule as the worker's speech stack). */
const CARTESIA_VOICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DISPLAY_NAME = 80;
const MAX_REF_LENGTH = 512;
const MAX_METADATA_ENTRIES = 10;
const MAX_METADATA_VALUE = 200;

const LIFECYCLE: readonly CustomVoiceLifecycleStatus[] = [
  "DRAFT",
  "CONSENT_PENDING",
  "PROCESSING",
  "ACTIVE",
  "FAILED",
  "DISABLED",
];

export function isValidVoiceProfileId(value: unknown): value is string {
  return typeof value === "string" && VOICE_PROFILE_ID_PATTERN.test(value);
}

export function isBuiltinVoiceProfileId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUILTIN_VOICE_PROFILES, id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

function isoOrNull(value: unknown): string | null {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return value;
  const toDate = (value as { toDate?: () => Date } | null)?.toDate;
  if (typeof toDate === "function") {
    const date = toDate.call(value);
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
  }
  return null;
}

function parseConsent(raw: unknown): CustomVoiceConsent | null {
  if (!isRecord(raw)) return null;
  const status = raw.status;
  if (status !== "NOT_PROVIDED" && status !== "PROVIDED" && status !== "REVOKED") return null;
  return {
    status,
    providedAt: isoOrNull(raw.providedAt),
    recordedByUid: boundedString(raw.recordedByUid, 128),
    consentRecordRef: boundedString(raw.consentRecordRef, MAX_REF_LENGTH),
    revokedAt: isoOrNull(raw.revokedAt),
  };
}

function parseCustom(raw: unknown): CustomVoiceDetails | null {
  if (!isRecord(raw)) return null;
  const lifecycleStatus = raw.lifecycleStatus;
  if (typeof lifecycleStatus !== "string" || !(LIFECYCLE as readonly string[]).includes(lifecycleStatus)) return null;
  const consent = parseConsent(raw.consent);
  if (!consent) return null;
  return {
    lifecycleStatus: lifecycleStatus as CustomVoiceLifecycleStatus,
    consent,
    sampleStorageRef: boundedString(raw.sampleStorageRef, MAX_REF_LENGTH),
    createdByUid: boundedString(raw.createdByUid, 128),
    failureCode: boundedString(raw.failureCode, 64),
  };
}

function parseMetadata(raw: unknown): Record<string, string> {
  if (!isRecord(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw).slice(0, MAX_METADATA_ENTRIES)) {
    const text = boundedString(value, MAX_METADATA_VALUE);
    if (/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(key) && text) out[key] = text;
  }
  return out;
}

/**
 * Strict parse of a `voiceProfiles/{id}` document. Malformed documents are rejected, never
 * repaired. Unknown top-level fields are ignored except credential-shaped ones, which reject
 * the whole profile so a misplaced secret can never flow onward.
 */
export function parseStoredVoiceProfile(id: string, raw: unknown): VoiceProfile | null {
  if (!isValidVoiceProfileId(id) || id.startsWith(BUILTIN_PREFIX) || !isRecord(raw)) return null;
  if (Object.keys(raw).some((key) => /(secret|token|api_?key|password|credential|private)/i.test(key))) return null;

  const displayName = boundedString(raw.displayName, MAX_DISPLAY_NAME);
  if (!displayName || raw.provider !== "cartesia") return null;
  const type = raw.type;
  if (type !== "SYSTEM" && type !== "CUSTOM") return null;
  const status = raw.status;
  if (status !== "ACTIVE" && status !== "INACTIVE") return null;

  if (!Array.isArray(raw.supportedLocales) || raw.supportedLocales.length === 0) return null;
  if (!raw.supportedLocales.every(isVoiceLocale)) return null;
  const supportedLocales = [...new Set(raw.supportedLocales as VoiceLocale[])];

  const providerVoiceId = raw.providerVoiceId;
  const hasVoiceId = typeof providerVoiceId === "string" && CARTESIA_VOICE_ID_PATTERN.test(providerVoiceId);
  if (providerVoiceId !== undefined && providerVoiceId !== null && !hasVoiceId) return null;

  let ownerClinicId: string | null = null;
  let custom: CustomVoiceDetails | null = null;
  if (type === "SYSTEM") {
    if (raw.ownerClinicId !== undefined && raw.ownerClinicId !== null) return null;
    if (raw.custom !== undefined && raw.custom !== null) return null;
    if (!hasVoiceId) return null;
  } else {
    ownerClinicId = boundedString(raw.ownerClinicId, 128);
    if (!ownerClinicId || ownerClinicId.includes("/")) return null;
    custom = parseCustom(raw.custom);
    if (!custom) return null;
  }

  return {
    id,
    displayName,
    provider: "cartesia",
    providerVoice: hasVoiceId
      ? { kind: "PROVIDER_VOICE_ID", providerVoiceId: providerVoiceId as string }
      : { kind: "UNPROVISIONED" },
    supportedLocales,
    type,
    status,
    ownerClinicId,
    custom,
    metadata: parseMetadata(raw.metadata),
    createdAt: isoOrNull(raw.createdAt),
    updatedAt: isoOrNull(raw.updatedAt),
  };
}

export interface VoiceUsabilityContext {
  readonly clinicId: string;
  readonly customVoiceEnabled: boolean;
}

/**
 * Whether `profile` may be used by `clinicId`. Custom voices require: same owning clinic,
 * clinic entitlement, ACTIVE lifecycle, a provisioned provider voice id, and consent PROVIDED
 * with a timestamp and a consent record reference (never revoked).
 */
export function checkVoiceProfileUsable(
  profile: VoiceProfile,
  context: VoiceUsabilityContext
): { ok: true } | { ok: false; code: VoiceConfigErrorCode } {
  if (profile.type === "CUSTOM") {
    if (profile.ownerClinicId !== context.clinicId) return { ok: false, code: "VOICE_CUSTOM_VOICE_CROSS_TENANT" };
    if (!context.customVoiceEnabled) return { ok: false, code: "VOICE_CUSTOM_VOICES_DISABLED" };
    const consent = profile.custom?.consent;
    if (!consent || consent.status !== "PROVIDED" || !consent.providedAt || !consent.consentRecordRef || consent.revokedAt) {
      return { ok: false, code: "VOICE_CUSTOM_VOICE_CONSENT_MISSING" };
    }
    if (profile.custom?.lifecycleStatus !== "ACTIVE") return { ok: false, code: "VOICE_CUSTOM_VOICE_NOT_READY" };
  }
  if (profile.status !== "ACTIVE") return { ok: false, code: "VOICE_PROFILE_INACTIVE" };
  if (profile.providerVoice.kind === "UNPROVISIONED") return { ok: false, code: "VOICE_CUSTOM_VOICE_NOT_READY" };
  return { ok: true };
}

/** Admin-facing view: no provider voice ids, storage refs, consent record refs or uids. */
export interface VoiceProfileSummary {
  readonly id: string;
  readonly displayName: string;
  readonly type: VoiceProfile["type"];
  readonly provider: VoiceProfile["provider"];
  readonly supportedLocales: readonly VoiceLocale[];
  readonly status: VoiceProfile["status"];
  readonly selectable: boolean;
  readonly unavailableReason: VoiceConfigErrorCode | null;
  readonly custom: {
    readonly lifecycleStatus: CustomVoiceLifecycleStatus;
    readonly consentStatus: CustomVoiceConsent["status"];
  } | null;
}

export function toVoiceProfileSummary(profile: VoiceProfile, context: VoiceUsabilityContext): VoiceProfileSummary {
  const usable = checkVoiceProfileUsable(profile, context);
  return {
    id: profile.id,
    displayName: profile.displayName,
    type: profile.type,
    provider: profile.provider,
    supportedLocales: [...profile.supportedLocales],
    status: profile.status,
    selectable: usable.ok,
    unavailableReason: usable.ok ? null : usable.code,
    custom: profile.custom
      ? { lifecycleStatus: profile.custom.lifecycleStatus, consentStatus: profile.custom.consent.status }
      : null,
  };
}
