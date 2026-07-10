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
 * POST /api/public/agency/[slug]/quote
 * Creates a quote request in the agency's quotes sub-collection.
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

    if (!body.leadId) {
      return NextResponse.json({ error: "leadId required" }, { status: 400, headers: CORS });
    }

    const quote = {
      agencyId,
      leadId: body.leadId,
      patientName: body.patientName || null,
      patientEmail: body.patientEmail || null,
      patientCountry: body.patientCountry || null,
      treatmentCategory: body.treatmentCategory || "other",
      treatmentName: body.treatmentName || "",
      subTreatment: body.subTreatment || null,
      selectedClinicIds: body.selectedClinicIds || [],
      selectedClinicNames: body.selectedClinicNames || [],
      intakeAnswers: body.intakeAnswers || {},
      consentStatus: body.consentStatus || "accepted",
      status: "requested",
      clinicOffers: [],
      internalNotes: null,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await adminDb
      .collection("agencies")
      .doc(agencyId)
      .collection("quotes")
      .add(quote);

    return NextResponse.json({ ok: true, quoteId: docRef.id, agencyId }, { headers: CORS });
  } catch (err) {
    console.error("[public/agency/quote] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: CORS });
  }
}
