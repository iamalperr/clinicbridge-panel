import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/**
 * POST /api/public/agency/[slug]/lead
 * Creates a lead in the agency's leads sub-collection.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await req.json();
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: "db unavailable" }, { status: 503, headers: CORS });
    }

    // Find agency
    const agencySnap = await adminDb
      .collection("agencies")
      .where("slug", "==", slug)
      .where("status", "==", "active")
      .limit(1)
      .get();

    if (agencySnap.empty) {
      return NextResponse.json({ error: "Agency not found" }, { status: 404, headers: CORS });
    }

    const agencyId = agencySnap.docs[0].id;
    const now = new Date().toISOString();

    const { submitAgencyLead } = await import("@/lib/services/leadSubmissionService");
    
    try {
      const result = await submitAgencyLead({
        agencyId,
        conversationId: body.conversationId,
        clinicIds: Array.isArray(body.clinicIds) ? body.clinicIds : [],
        patientEmail: body.patientEmail,
        patientName: body.patientName,
        patientPhone: body.patientPhone,
        patientAge: body.patientAge,
        patientGender: body.patientGender,
        country: body.country,
        language: body.language,
        treatmentCategory: body.treatmentCategory,
        treatmentSubcategory: body.treatmentSubcategory,
        urgency: body.urgency,
        conversationSummary: body.conversationSummary,
        aiExtractedNotes: body.aiExtractedNotes,
        source: body.source,
        sourceUrl: body.sourceUrl,
      });
      return NextResponse.json({ ok: true, leadId: result.leadId, agencyId, status: result.status }, { headers: CORS });
    } catch (submitError: any) {
      console.error("[public/agency/lead] Submit error:", submitError.message);
      const knownErrors = [
        "CONVERSATION_ID_REQUIRED", "AGENCY_ID_REQUIRED", "AGENCY_NOT_FOUND",
        "CONSENT_REQUIRED", "PATIENT_EMAIL_REQUIRED", "PATIENT_EMAIL_INVALID",
        "CLINIC_SELECTION_REQUIRED", "CLINIC_SELECTION_LIMIT_EXCEEDED", "INVALID_CLINIC_SELECTION"
      ];
      if (knownErrors.includes(submitError.message)) {
        return NextResponse.json({ error: submitError.message }, { status: 400, headers: CORS });
      }
      return NextResponse.json({ error: "Internal error" }, { status: 500, headers: CORS });
    }
  } catch (err) {
    console.error("[public/agency/lead] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: CORS });
  }
}
