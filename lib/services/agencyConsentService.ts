import { getAdminDb } from "@/lib/firebase-admin";

export type ConsentStatus = "pending" | "accepted" | "declined" | "revoked";
export type ConsentSource = "agency_widget" | "agency_portal_chat";

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

  const snap = await db
    .collection("agencies")
    .doc(agencyId)
    .collection("consents")
    .where("sessionId", "==", sessionId)
    .where("consentStatus", "==", "accepted")
    .where("consentVersion", "==", requiredVersion)
    .limit(1)
    .get();

  if (snap.empty) return null;
  
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() } as AgencyConsentRecord;
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
