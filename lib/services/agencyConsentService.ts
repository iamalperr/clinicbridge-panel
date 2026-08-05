import { getAdminDb } from "@/lib/firebase-admin";

export type ConsentStatus = "pending" | "accepted" | "declined" | "revoked";
export type ConsentSource = "agency_widget" | "agency_portal_chat";

/** Must match matching-chat privacy gate default (agencies without explicit version). */
export const DEFAULT_AGENCY_CONSENT_VERSION = "v1.0";

export function resolveAgencyConsentVersion(
  privacySettings?: { version?: string } | null
): string {
  const trimmed = String(privacySettings?.version || "").trim();
  return trimmed || DEFAULT_AGENCY_CONSENT_VERSION;
}

export type AgencyConsentVerificationStatus =
  | "accepted"
  | "missing"
  | "rejected"
  | "expired"
  | "version_mismatch"
  | "verification_failed";

export interface AgencyConsentVerificationResult {
  ok: boolean;
  status: AgencyConsentVerificationStatus;
  consentRecordId?: string;
  consentVersion?: string;
}

export interface AgencyConsentRecord {
  id?: string;
  agencyId: string;
  sessionId: string;
  leadId?: string | null;
  consentCategory: "privacy_and_health_data";
  consentStatus: ConsentStatus;
  consentVersion: string;
  locale: string;
  source: ConsentSource;
  acceptedAt?: string | null;
  declinedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

function normalizeVersion(version: string | undefined | null): string {
  return String(version || "").trim();
}

/**
 * Read-only consent verification for quote/lead persistence.
 * Never writes. Requires an accepted record for the session + consent version.
 */
export async function verifyAcceptedAgencyConsent(
  agencyId: string,
  sessionId: string,
  requiredVersion: string
): Promise<AgencyConsentVerificationResult> {
  const db = getAdminDb();
  if (!db) {
    return { ok: false, status: "verification_failed" };
  }
  if (!agencyId || !sessionId) {
    return { ok: false, status: "missing" };
  }

  const required = normalizeVersion(requiredVersion) || DEFAULT_AGENCY_CONSENT_VERSION;

  try {
    // Prefer a simple sessionId query (no composite index), then filter in memory.
    const snap = await db
      .collection("agencies")
      .doc(agencyId)
      .collection("consents")
      .where("sessionId", "==", sessionId)
      .limit(5)
      .get();

    if (snap.empty) {
      return { ok: false, status: "missing" };
    }

    const records = snap.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() } as AgencyConsentRecord)
    );

    const declinedOrRevoked = records.find(
      (c) => c.consentStatus === "declined" || c.consentStatus === "revoked"
    );
    const accepted = records.filter((c) => c.consentStatus === "accepted");

    if (accepted.length === 0) {
      if (declinedOrRevoked) {
        return {
          ok: false,
          status: "rejected",
          consentRecordId: declinedOrRevoked.id,
          consentVersion: normalizeVersion(declinedOrRevoked.consentVersion) || undefined,
        };
      }
      return { ok: false, status: "missing" };
    }

    const versionMatch = accepted.find(
      (c) => normalizeVersion(c.consentVersion) === required
    );
    if (versionMatch) {
      return {
        ok: true,
        status: "accepted",
        consentRecordId: versionMatch.id,
        consentVersion: normalizeVersion(versionMatch.consentVersion) || required,
      };
    }

    return {
      ok: false,
      status: "version_mismatch",
      consentRecordId: accepted[0].id,
      consentVersion: normalizeVersion(accepted[0].consentVersion) || undefined,
    };
  } catch (err) {
    console.warn(
      "[agencyConsentService] verifyAcceptedAgencyConsent failed",
      err instanceof Error ? err.message : err
    );
    return { ok: false, status: "verification_failed" };
  }
}

export async function getActiveConsent(
  agencyId: string,
  sessionId: string,
  requiredVersion: string
): Promise<AgencyConsentRecord | null> {
  const result = await verifyAcceptedAgencyConsent(agencyId, sessionId, requiredVersion);
  if (!result.ok || !result.consentRecordId) return null;

  return {
    id: result.consentRecordId,
    agencyId,
    sessionId,
    consentCategory: "privacy_and_health_data",
    consentStatus: "accepted",
    consentVersion: result.consentVersion || requiredVersion,
    locale: "tr",
    source: "agency_widget",
    createdAt: "",
    updatedAt: "",
  };
}

/**
 * Persist consent for a session. Idempotent: updates the existing session
 * consent doc when one already exists (does not create duplicates).
 */
export async function saveConsentRecord(
  agencyId: string,
  sessionId: string,
  status: ConsentStatus,
  version: string,
  locale: string,
  source: ConsentSource = "agency_widget"
): Promise<AgencyConsentRecord | null> {
  const db = getAdminDb();
  if (!db) return null;

  const now = new Date().toISOString();
  const consentVersion = normalizeVersion(version) || DEFAULT_AGENCY_CONSENT_VERSION;

  // Find existing record for this session
  const snap = await db
    .collection("agencies")
    .doc(agencyId)
    .collection("consents")
    .where("sessionId", "==", sessionId)
    .limit(1)
    .get();

  const data: Partial<AgencyConsentRecord> = {
    agencyId,
    sessionId,
    consentCategory: "privacy_and_health_data",
    consentStatus: status,
    consentVersion,
    locale,
    source,
    updatedAt: now,
  };

  if (status === "accepted") data.acceptedAt = now;
  else if (status === "declined") data.declinedAt = now;
  else if (status === "revoked") data.revokedAt = now;

  if (snap.empty) {
    data.createdAt = now;
    const ref = await db.collection("agencies").doc(agencyId).collection("consents").add(data);
    return { id: ref.id, ...data } as AgencyConsentRecord;
  } else {
    const doc = snap.docs[0];
    await doc.ref.update(data);
    return { id: doc.id, ...doc.data(), ...data } as AgencyConsentRecord;
  }
}

export async function requireAcceptedAgencyConsent(
  agencyId: string,
  sessionId: string,
  requiredVersion: string
): Promise<boolean> {
  const result = await verifyAcceptedAgencyConsent(agencyId, sessionId, requiredVersion);
  return result.ok;
}

/** Map verification failure to persistence / API error codes. */
export function consentVerificationErrorCode(
  result: AgencyConsentVerificationResult
): string {
  if (result.ok) return "";
  switch (result.status) {
    case "rejected":
      return "CONSENT_REJECTED";
    case "version_mismatch":
      return "CONSENT_VERSION_MISMATCH";
    case "verification_failed":
      return "CONSENT_VERIFICATION_FAILED";
    case "expired":
      return "CONSENT_EXPIRED";
    case "missing":
    default:
      return "CONSENT_REQUIRED";
  }
}

/**
 * Structured consent action from the privacy consent card (not a raw boolean).
 * Required fields: type=privacy_consent_response, action=accept, consentVersion
 * matching the agency's current version.
 */
export function parseStructuredConsentAcceptAction(
  raw: unknown,
  expectedVersion: string
): { ok: true; locale: string; consentVersion: string } | { ok: false; errorCode: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, errorCode: "CONSENT_REQUIRED" };
  }
  const action = raw as Record<string, unknown>;
  const type = String(action.type || "").trim();
  const decision = String(action.action || "").trim().toLowerCase();

  if (type !== "privacy_consent_response") {
    return { ok: false, errorCode: "CONSENT_REQUIRED" };
  }
  if (decision === "decline" || decision === "reject" || decision === "declined") {
    return { ok: false, errorCode: "CONSENT_REJECTED" };
  }
  if (decision !== "accept" && decision !== "accepted") {
    return { ok: false, errorCode: "CONSENT_REQUIRED" };
  }

  const required = normalizeVersion(expectedVersion) || DEFAULT_AGENCY_CONSENT_VERSION;
  const provided = normalizeVersion(String(action.consentVersion || ""));
  if (!provided || provided !== required) {
    return { ok: false, errorCode: "CONSENT_VERSION_MISMATCH" };
  }

  return {
    ok: true,
    locale: String(action.locale || "tr"),
    consentVersion: required,
  };
}

export interface EnsureAcceptedConsentForPersistenceInput {
  agencyId: string;
  sessionId: string;
  requiredVersion: string;
  /** Structured privacy_consent_response action only — never a raw boolean. */
  consentAction?: unknown;
  localeFallback?: string;
  source?: ConsentSource;
}

/**
 * Persistence-gate helper:
 * 1) If a valid structured accept action is present, save then re-verify.
 * 2) Otherwise require an already-persisted accepted consent record.
 * Never treats a bare `consentAccepted: true` boolean as sufficient.
 */
export async function ensureAcceptedConsentForPersistence(
  input: EnsureAcceptedConsentForPersistenceInput
): Promise<AgencyConsentVerificationResult & { errorCode?: string }> {
  const {
    agencyId,
    sessionId,
    requiredVersion,
    consentAction,
    localeFallback = "tr",
    source = "agency_widget",
  } = input;

  if (!agencyId || !sessionId) {
    return { ok: false, status: "missing", errorCode: "CONSENT_REQUIRED" };
  }

  if (consentAction !== undefined && consentAction !== null) {
    const parsed = parseStructuredConsentAcceptAction(consentAction, requiredVersion);
    if (!parsed.ok) {
      return {
        ok: false,
        status: parsed.errorCode === "CONSENT_REJECTED" ? "rejected" : parsed.errorCode === "CONSENT_VERSION_MISMATCH" ? "version_mismatch" : "missing",
        errorCode: parsed.errorCode,
      };
    }
    const saved = await saveConsentRecord(
      agencyId,
      sessionId,
      "accepted",
      parsed.consentVersion,
      parsed.locale || localeFallback,
      source
    );
    if (!saved) {
      return { ok: false, status: "verification_failed", errorCode: "CONSENT_SAVE_FAILED" };
    }
  }

  const verification = await verifyAcceptedAgencyConsent(
    agencyId,
    sessionId,
    requiredVersion
  );
  if (!verification.ok) {
    return {
      ...verification,
      errorCode: consentVerificationErrorCode(verification) || "CONSENT_REQUIRED",
    };
  }
  return verification;
}
