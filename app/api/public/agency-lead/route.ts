import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  ensureAcceptedConsentForPersistence,
  resolveAgencyConsentVersion,
} from "@/lib/services/agencyConsentService";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/**
 * POST /api/public/agency-lead
 *
 * Creates a new lead in the agency's leads sub-collection.
 * Requires verified accepted consent (or a validated structured consent action).
 * Client-supplied consentStatus / consentAccepted booleans are not sufficient.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      agencyId,
      patientName,
      patientEmail,
      patientPhone,
      country,
      language,
      treatmentCategory,
      treatmentSubcategory,
      urgency,
      conversationSummary,
      conversationId,
      sessionId,
      aiExtractedNotes,
      source,
      sourceUrl,
      clinicIds,
      selectedCity,
      istanbulSide,
      istanbul_side,
      travelDate,
      consentAction,
    } = body;

    if (!agencyId) {
      return NextResponse.json({ error: "agencyId required" }, { status: 400, headers: CORS });
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: "db unavailable" }, { status: 503, headers: CORS });
    }

    const agencyDoc = await adminDb.collection("agencies").doc(agencyId).get();
    if (!agencyDoc.exists) {
      return NextResponse.json({ error: "Agency not found" }, { status: 404, headers: CORS });
    }

    const resolvedConversationId = String(conversationId || sessionId || "").trim();
    if (!resolvedConversationId) {
      return NextResponse.json(
        { ok: false, error: "CONVERSATION_ID_REQUIRED" },
        { status: 400, headers: CORS }
      );
    }

    const agencyData = agencyDoc.data() || {};
    const version = resolveAgencyConsentVersion(agencyData.privacySettings);
    const consentGate = await ensureAcceptedConsentForPersistence({
      agencyId,
      sessionId: resolvedConversationId,
      requiredVersion: version,
      consentAction,
      localeFallback: String(language || "tr"),
    });
    if (!consentGate.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: consentGate.errorCode || "CONSENT_REQUIRED",
          consentStatus: consentGate.status,
        },
        { status: 403, headers: CORS }
      );
    }

    const { submitAgencyLead } = await import("@/lib/services/leadSubmissionService");
    try {
      const result = await submitAgencyLead({
        agencyId,
        conversationId: resolvedConversationId,
        clinicIds: Array.isArray(clinicIds) ? clinicIds : [],
        patientEmail,
        patientName,
        patientPhone,
        country,
        language,
        treatmentCategory,
        treatmentSubcategory,
        urgency,
        conversationSummary,
        aiExtractedNotes,
        source: source || "widget",
        sourceUrl,
        selectedCity,
        istanbulSide: istanbulSide || istanbul_side,
        travelDate,
      });
      return NextResponse.json(
        { ok: true, leadId: result.leadId, agencyId, status: result.status },
        { headers: CORS }
      );
    } catch (submitError: any) {
      const message = submitError?.message || "Internal error";
      const status = String(message).startsWith("CONSENT_") ? 403 : 400;
      if (
        [
          "CONVERSATION_ID_REQUIRED",
          "AGENCY_ID_REQUIRED",
          "AGENCY_NOT_FOUND",
          "CONSENT_REQUIRED",
          "CONSENT_REJECTED",
          "CONSENT_VERSION_MISMATCH",
          "CONSENT_VERIFICATION_FAILED",
          "CONSENT_SAVE_FAILED",
          "CONSENT_EXPIRED",
          "PATIENT_EMAIL_REQUIRED",
          "PATIENT_EMAIL_INVALID",
          "CLINIC_SELECTION_REQUIRED",
          "CLINIC_SELECTION_LIMIT_EXCEEDED",
          "INVALID_CLINIC_SELECTION",
        ].includes(message)
      ) {
        return NextResponse.json({ ok: false, error: message }, { status, headers: CORS });
      }
      console.error("[agency-lead] Submit error:", message);
      return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500, headers: CORS });
    }
  } catch (err) {
    console.error("[agency-lead] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: CORS });
  }
}
