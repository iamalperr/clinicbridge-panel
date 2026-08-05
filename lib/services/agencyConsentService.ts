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

export async function getActiveConsent(
  agencyId: string,
  sessionId: string,
  requiredVersion: string
): Promise<AgencyConsentRecord | null> {
  const db = getAdminDb();
  if (!db) return null;

  // Prefer a simple sessionId query (no composite index), then filter in memory.
  // The previous 3-field equality query required a composite index and could
  // silently fail consent checks in production.
  try {
    const snap = await db
      .collection("agencies")
      .doc(agencyId)
      .collection("consents")
      .where("sessionId", "==", sessionId)
      .limit(5)
      .get();

    if (snap.empty) return null;

    const accepted = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() } as AgencyConsentRecord))
      .filter((c) => c.consentStatus === "accepted");

    if (accepted.length === 0) return null;

    const versionMatch = accepted.find(
      (c) => String(c.consentVersion || "").trim() === String(requiredVersion || "").trim()
    );
    if (versionMatch) return versionMatch;

    // Soft fallback: any accepted consent for this session (version drift / legacy).
    return accepted[0];
  } catch (err) {
    console.warn(
      "[agencyConsentService] getActiveConsent failed",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

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
    consentVersion: version,
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
  const consent = await getActiveConsent(agencyId, sessionId, requiredVersion);
  return consent !== null;
}
