/**
 * Called-number (DID) → clinic tenant resolution (Phase 3, provider-independent).
 *
 * Tenant identity is derived ONLY from the dialed business number via
 * `voiceNumbers/{E.164}`. The input deliberately accepts nothing else: no
 * originating-party number, no session/room identifiers, no clinicId override.
 */

export const VOICE_NUMBERS_COLLECTION = "voiceNumbers";
const CLINICS_COLLECTION = "clinics";

const MAX_RAW_DID_LENGTH = 32;
const MAX_CLINIC_ID_LENGTH = 128;
const MAX_GREETING_LENGTH = 500;
const MAX_PROVIDER_LENGTH = 64;

/** Turkish national significant numbers are 10 digits; these leading digits are in use. */
const TR_NSN_PATTERN = /^[2-589]\d{9}$/;
const ALLOWED_RAW_DID = /^\+?[\d\s\-().]+$/;
const LOCALE_PATTERN = /^[a-z]{2}(?:-[A-Z]{2})?$/;

export type DidNormalizationErrorCode =
  | "DID_MISSING"
  | "DID_INVALID_FORMAT"
  | "DID_UNSUPPORTED_NUMBER";

export type DidResolutionErrorCode =
  | DidNormalizationErrorCode
  | "DID_LOOKUP_FAILED"
  | "DID_MAPPING_NOT_FOUND"
  | "DID_MAPPING_INACTIVE"
  | "DID_VOICE_DISABLED"
  | "DID_MAPPING_INVALID_CLINIC_ID"
  | "DID_CLINIC_NOT_FOUND";

export type DidNormalizationResult =
  | { ok: true; didE164: string }
  | { ok: false; code: DidNormalizationErrorCode };

export type DidResolutionResult =
  | {
      ok: true;
      didE164: string;
      clinicId: string;
      defaultLocale?: string;
      greetingText?: string;
      provider?: string;
    }
  | {
      ok: false;
      code: DidResolutionErrorCode;
      didE164?: string;
    };

/** Read-only Firestore subset used here; firebase-admin `Firestore` satisfies it structurally. */
export interface DidResolverFirestore {
  collection(path: string): {
    doc(id: string): {
      get(): Promise<{ exists: boolean; data(): unknown }>;
    };
  };
}

export interface DidResolverDeps {
  adminDb: DidResolverFirestore | null | undefined;
}

export interface ResolveClinicByDidInput {
  /** The dialed (called) business number, never the originating party's number. */
  readonly calledDid: string;
}

function fromInternationalDigits(digits: string): DidNormalizationResult {
  if (!digits.startsWith("90")) {
    return { ok: false, code: digits.length >= 8 && digits.length <= 15 ? "DID_UNSUPPORTED_NUMBER" : "DID_INVALID_FORMAT" };
  }
  return fromNationalSignificantNumber(digits.slice(2));
}

function fromNationalSignificantNumber(nsn: string): DidNormalizationResult {
  if (nsn.length !== 10) return { ok: false, code: "DID_INVALID_FORMAT" };
  if (!TR_NSN_PATTERN.test(nsn)) return { ok: false, code: "DID_UNSUPPORTED_NUMBER" };
  return { ok: true, didE164: `+90${nsn}` };
}

/**
 * Normalize a called DID to canonical Turkish E.164 (`+90XXXXXXXXXX`).
 *
 * Accepted: `+90…`, `0090…`, `90…` (12 digits), `0…` (11 digits), with optional
 * spaces, dashes, dots or parentheses. A bare 10-digit national number is rejected
 * as ambiguous; non-Turkish country codes are rejected as unsupported.
 */
export function normalizeCalledDid(calledDid: unknown): DidNormalizationResult {
  if (calledDid === undefined || calledDid === null) return { ok: false, code: "DID_MISSING" };
  if (typeof calledDid !== "string") return { ok: false, code: "DID_INVALID_FORMAT" };

  const trimmed = calledDid.trim();
  if (!trimmed) return { ok: false, code: "DID_MISSING" };
  if (trimmed.length > MAX_RAW_DID_LENGTH || !ALLOWED_RAW_DID.test(trimmed)) {
    return { ok: false, code: "DID_INVALID_FORMAT" };
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return { ok: false, code: "DID_INVALID_FORMAT" };

  if (trimmed.startsWith("+")) return fromInternationalDigits(digits);
  if (digits.startsWith("00")) return fromInternationalDigits(digits.slice(2));
  if (digits.length === 12 && digits.startsWith("90")) return fromNationalSignificantNumber(digits.slice(2));
  if (digits.length === 11 && digits.startsWith("0")) return fromNationalSignificantNumber(digits.slice(1));
  if (digits.length === 10) return { ok: false, code: "DID_UNSUPPORTED_NUMBER" };
  return { ok: false, code: "DID_INVALID_FORMAT" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidClinicId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_CLINIC_ID_LENGTH &&
    value === value.trim() &&
    !value.includes("/") &&
    value !== "." &&
    value !== ".."
  );
}

function optionalBoundedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : undefined;
}

function optionalLocale(value: unknown): string | undefined {
  return typeof value === "string" && LOCALE_PATTERN.test(value) ? value : undefined;
}

function logLookupFailure(stage: "mapping" | "clinic", didE164: string, err: unknown): void {
  const code = (err as { code?: unknown } | null)?.code;
  console.error(
    JSON.stringify({
      checkpoint: "VOICE_DID_LOOKUP_FAILED",
      stage,
      didE164,
      errorType: (err instanceof Error ? err.name || "Error" : err === null ? "null" : typeof err).slice(0, 64),
      errorCode: typeof code === "string" || typeof code === "number" ? String(code).slice(0, 64) : null,
    })
  );
}

/**
 * Resolve the trusted clinicId for a called DID.
 * Expected routing failures are returned as `{ ok: false, code }`, never thrown.
 */
export async function resolveClinicByDid(
  deps: DidResolverDeps,
  input: ResolveClinicByDidInput
): Promise<DidResolutionResult> {
  const normalized = normalizeCalledDid(input?.calledDid);
  if (!normalized.ok) return { ok: false, code: normalized.code };
  const { didE164 } = normalized;

  const db = deps.adminDb;
  if (!db) return { ok: false, code: "DID_LOOKUP_FAILED", didE164 };

  let mapping: unknown;
  try {
    const snap = await db.collection(VOICE_NUMBERS_COLLECTION).doc(didE164).get();
    if (!snap.exists) return { ok: false, code: "DID_MAPPING_NOT_FOUND", didE164 };
    mapping = snap.data();
  } catch (err) {
    logLookupFailure("mapping", didE164, err);
    return { ok: false, code: "DID_LOOKUP_FAILED", didE164 };
  }

  if (!isRecord(mapping) || mapping.active !== true) {
    return { ok: false, code: "DID_MAPPING_INACTIVE", didE164 };
  }
  if (mapping.voiceEnabled !== true) {
    return { ok: false, code: "DID_VOICE_DISABLED", didE164 };
  }
  const clinicId = mapping.clinicId;
  if (!isValidClinicId(clinicId)) {
    return { ok: false, code: "DID_MAPPING_INVALID_CLINIC_ID", didE164 };
  }

  try {
    const clinicSnap = await db.collection(CLINICS_COLLECTION).doc(clinicId).get();
    if (!clinicSnap.exists) return { ok: false, code: "DID_CLINIC_NOT_FOUND", didE164 };
  } catch (err) {
    logLookupFailure("clinic", didE164, err);
    return { ok: false, code: "DID_LOOKUP_FAILED", didE164 };
  }

  const result: DidResolutionResult = { ok: true, didE164, clinicId };
  const defaultLocale = optionalLocale(mapping.defaultLocale);
  const greetingText = optionalBoundedString(mapping.greetingText, MAX_GREETING_LENGTH);
  const provider = optionalBoundedString(mapping.provider, MAX_PROVIDER_LENGTH);
  if (defaultLocale) result.defaultLocale = defaultLocale;
  if (greetingText) result.greetingText = greetingText;
  if (provider) result.provider = provider;
  return result;
}
