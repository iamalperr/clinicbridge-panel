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
 * POST /api/public/agency-lead
 *
 * Creates a new lead in the agency's leads sub-collection.
 * Called from the widget when a patient conversation produces actionable info.
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
      aiExtractedNotes,
      consentStatus,
      source,
      sourceUrl,
    } = body;

    if (!agencyId) {
      return NextResponse.json({ error: "agencyId required" }, { status: 400, headers: CORS });
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: "db unavailable" }, { status: 503, headers: CORS });
    }

    // Verify agency exists
    const agencyDoc = await adminDb.collection("agencies").doc(agencyId).get();
    if (!agencyDoc.exists) {
      return NextResponse.json({ error: "Agency not found" }, { status: 404, headers: CORS });
    }

    const now = new Date().toISOString();

    const lead = {
      agencyId,
      clinicId: null,
      patientName: patientName || null,
      patientEmail: patientEmail || null,
      patientPhone: patientPhone || null,
      country: country || "Unknown",
      language: language || "en",
      treatmentCategory: treatmentCategory || "other",
      treatmentSubcategory: treatmentSubcategory || null,
      urgency: urgency || "medium",
      conversationSummary: conversationSummary || "",
      conversationId: conversationId || null,
      aiExtractedNotes: aiExtractedNotes || null,
      consentStatus: consentStatus || "pending",
      consentTimestamp: consentStatus === "accepted" ? now : null,
      status: "new",
      statusHistory: [
        {
          status: "new",
          changedAt: now,
          note: "Lead created from widget",
        },
      ],
      source: source || "widget",
      sourceUrl: sourceUrl || null,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await adminDb
      .collection("agencies")
      .doc(agencyId)
      .collection("leads")
      .add(lead);

    return NextResponse.json(
      { ok: true, leadId: docRef.id },
      { headers: CORS }
    );
  } catch (err) {
    console.error("[agency-lead] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: CORS });
  }
}
