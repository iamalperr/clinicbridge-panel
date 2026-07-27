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

    const { requireAcceptedAgencyConsent } = await import("@/lib/services/agencyConsentService");
    const { normalizeEmail, isValidEmail } = await import("@/lib/utils/emailValidation");

    if (!body.conversationId) {
      return NextResponse.json({ error: "conversationId required" }, { status: 400, headers: CORS });
    }

    const version = agencySnap.docs[0].data().privacySettings?.version || "";
    const hasConsent = await requireAcceptedAgencyConsent(agencyId, body.conversationId, version);
    if (!hasConsent) {
      return NextResponse.json({ error: "CONSENT_REQUIRED" }, { status: 403, headers: CORS });
    }

    const normalizedEmail = normalizeEmail(body.patientEmail);
    if (!normalizedEmail) {
      return NextResponse.json({ error: "PATIENT_EMAIL_REQUIRED" }, { status: 400, headers: CORS });
    }
    if (!isValidEmail(normalizedEmail)) {
      return NextResponse.json({ error: "PATIENT_EMAIL_INVALID" }, { status: 400, headers: CORS });
    }

    const lead = {
      agencyId,
      clinicId: null, // Kept for backward compatibility
      clinicIds: Array.isArray(body.clinicIds) ? body.clinicIds.slice(0, 3) : [], // Limit to max 3 clinics
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
      patientName: body.patientName || null,
      patientEmail: normalizedEmail,
      patientPhone: body.patientPhone || null,
      patientAge: body.patientAge || null,
      patientGender: body.patientGender || null,
      country: body.country || "Unknown",
      language: body.language || "en",
      treatmentCategory: body.treatmentCategory || "other",
      treatmentSubcategory: body.treatmentSubcategory || null,
      urgency: body.urgency || "medium",
      conversationSummary: body.conversationSummary || "",
      conversationId: body.conversationId || null,
      aiExtractedNotes: body.aiExtractedNotes || null,
      consentStatus: body.consentStatus || "pending",
      consentTimestamp: body.consentStatus === "accepted" ? now : null,
      consentVersion: body.consentVersion || null,
      status: "new",
      statusHistory: [
        { status: "new", changedAt: now, note: "Lead created from public demo" },
      ],
      source: body.source || "widget",
      sourceUrl: body.sourceUrl || null,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await adminDb
      .collection("agencies")
      .doc(agencyId)
      .collection("leads")
      .add(lead);

    return NextResponse.json({ ok: true, leadId: docRef.id, agencyId }, { headers: CORS });
  } catch (err) {
    console.error("[public/agency/lead] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: CORS });
  }
}
