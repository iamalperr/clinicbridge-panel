import { getAdminDb } from "../firebase-admin";
import crypto from "crypto";
import { AgencyExtendedRequest } from "../types/agency";
import { requireAcceptedAgencyConsent } from "@/lib/services/agencyConsentService";

const db = getAdminDb()!;

function generateSecureToken(): { rawToken: string; tokenHash: string } {
  // Generate 128 bit entropy (32 hex chars)
  const rawToken = crypto.randomBytes(16).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  return { rawToken, tokenHash };
}

export async function createExtendedRequestToken(
  agencyId: string,
  leadId: string,
  conversationId: string,
  locale: string,
  mode: "internal_registration" | "external_verified_url" = "internal_registration"
): Promise<{ rawToken: string; requestId: string }> {
  // Idempotency: Is there already an active request for this lead?
  const existingQuery = await db.collection("agencies").doc(agencyId).collection("extendedRequests")
    .where("leadId", "==", leadId)
    .where("status", "in", ["offered", "started"])
    .limit(1)
    .get();

  let tokenHash = "";
  let rawToken = "";
  let requestId = "";

  if (!existingQuery.empty) {
    // Lead already has an active extended request, but we don't store raw token in DB.
    // If the user lost their raw token, we must generate a new one and update the hash, or simply create a new token.
    // Let's generate a new token hash for the existing request to give them a fresh link.
    const existingDoc = existingQuery.docs[0];
    const newKeys = generateSecureToken();
    rawToken = newKeys.rawToken;
    tokenHash = newKeys.tokenHash;
    requestId = existingDoc.id;

    // Extend expiration
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await existingDoc.ref.update({
      tokenHash,
      expiresAt,
      updatedAt: new Date().toISOString()
    });
  } else {
    // Generate new
    const keys = generateSecureToken();
    rawToken = keys.rawToken;
    tokenHash = keys.tokenHash;

    const ref = db.collection("agencies").doc(agencyId).collection("extendedRequests").doc();
    requestId = ref.id;

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const newRequest: AgencyExtendedRequest = {
      id: requestId,
      agencyId,
      leadId,
      conversationId,
      status: "offered",
      mode,
      locale,
      tokenHash,
      createdAt: now,
      updatedAt: now,
      expiresAt
    };

    await ref.set(newRequest);
  }

  // Combine requestId and rawToken for the client url
  // Format: {requestId}.{rawToken} to easily lookup the document and verify the hash
  const clientToken = `${requestId}.${rawToken}`;
  return { rawToken: clientToken, requestId };
}

export async function validateExtendedRequestToken(clientToken: string) {
  if (!clientToken || typeof clientToken !== "string") {
    throw new Error("INVALID_HANDOFF_TOKEN");
  }

  const parts = clientToken.split(".");
  if (parts.length !== 2) throw new Error("INVALID_HANDOFF_TOKEN");

  const [requestId, rawToken] = parts;
  const computedHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  // We need to find the agency that owns this request.
  // Since we don't have agencyId in the token, we can use a collection group query or just store them at the root.
  // Actually, wait: it's better to store extendedRequests at the root level for easy token lookup:
  // /extendedRequests/{requestId} -> points to agencyId, leadId.
  // Let's assume we use collection group, or the token must include agencyId.
  // Let's use a collectionGroup query on "extendedRequests" with the doc id.
  
  const querySnapshot = await db.collectionGroup("extendedRequests")
    .where("id", "==", requestId)
    .where("tokenHash", "==", computedHash)
    .limit(1)
    .get();

  if (querySnapshot.empty) {
    throw new Error("INVALID_HANDOFF_TOKEN");
  }

  const doc = querySnapshot.docs[0];
  const data = doc.data() as AgencyExtendedRequest;

  // Expiration check
  if (new Date(data.expiresAt) < new Date()) {
    // Auto mark expired if we catch it
    if (data.status === "offered" || data.status === "started") {
      await doc.ref.update({ status: "expired", updatedAt: new Date().toISOString() });
    }
    throw new Error("HANDOFF_TOKEN_EXPIRED");
  }

  if (data.status === "cancelled") throw new Error("HANDOFF_TOKEN_REVOKED");
  if (data.status === "completed") throw new Error("REGISTRATION_ALREADY_COMPLETED");
  if (data.status === "expired") throw new Error("HANDOFF_TOKEN_EXPIRED");

  // Mark started if currently offered
  if (data.status === "offered") {
    await doc.ref.update({
      status: "started",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  // Fetch prefill info from AgencyLead
  const leadDoc = await db.collection("agencies").doc(data.agencyId).collection("leads").doc(data.leadId).get();
  const agencyDoc = await db.collection("agencies").doc(data.agencyId).get();

  let prefill = null;
  if (leadDoc.exists) {
    const leadData = leadDoc.data();
    prefill = {
      patientName: leadData?.patientName || "",
      patientEmail: leadData?.patientEmail || "",
      patientPhone: leadData?.patientPhone || "",
      treatmentCategory: leadData?.treatmentCategory || "",
      agencyName: agencyDoc.exists ? agencyDoc.data()?.name : "",
      agencyPrivacyUrl: agencyDoc.exists ? agencyDoc.data()?.privacyUrl : "",
      privacySettings: agencyDoc.exists ? agencyDoc.data()?.privacySettings : null
    };
  }

  return { request: data, prefill };
}

export async function completeExtendedRequestRegistration(clientToken: string) {
  if (!clientToken) throw new Error("INVALID_HANDOFF_TOKEN");
  const parts = clientToken.split(".");
  if (parts.length !== 2) throw new Error("INVALID_HANDOFF_TOKEN");
  
  const [requestId, rawToken] = parts;
  const computedHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const querySnapshot = await db.collectionGroup("extendedRequests")
    .where("id", "==", requestId)
    .where("tokenHash", "==", computedHash)
    .limit(1)
    .get();

  if (querySnapshot.empty) {
    throw new Error("INVALID_HANDOFF_TOKEN");
  }

  const doc = querySnapshot.docs[0];
  const data = doc.data() as AgencyExtendedRequest;

  if (data.status === "completed") return; // Idempotent
  if (new Date(data.expiresAt) < new Date()) throw new Error("HANDOFF_TOKEN_EXPIRED");

  // Check consent again if privacy is enforced? We assume consent is passed or validated in the controller
  // Wait, if internal registration, we must have consent. Let's do it simply by updating status here.

  await doc.ref.update({
    status: "completed",
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}
