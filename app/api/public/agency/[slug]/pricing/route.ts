import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/**
 * GET /api/public/agency/[slug]/pricing
 * Returns aggregated pricing from all active clinics.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: "db unavailable" }, { status: 503, headers: CORS });
    }

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

    // Get all active clinics
    const clinicSnap = await adminDb
      .collection("agencies")
      .doc(agencyId)
      .collection("clinics")
      .get();

    const pricing: any[] = [];

    // For each clinic, get its pricing sub-collection
    for (const clinicDoc of clinicSnap.docs) {
      const clinicData = clinicDoc.data();
      if (clinicData.status !== "active") continue;

      const pricingSnap = await adminDb
        .collection("agencies")
        .doc(agencyId)
        .collection("clinics")
        .doc(clinicDoc.id)
        .collection("pricing")
        .get();

      for (const pDoc of pricingSnap.docs) {
        const p = pDoc.data();
        if (p.status === "inactive") continue;
        pricing.push({
          id: pDoc.id,
          clinicId: clinicDoc.id,
          clinicName: clinicData.clinicName,
          treatmentName: p.treatmentName,
          subTreatmentName: p.subTreatmentName || p.treatmentName,
          priceGroup: p.priceGroup || null,
          priceMin: p.priceMin,
          priceMax: p.priceMax,
          currency: p.currency || "EUR",
          priceType: p.priceType || "average",
          duration: p.duration || null,
          notes: p.notes || null,
        });
      }
    }

    return NextResponse.json({ pricing }, { headers: CORS });
  } catch (err) {
    console.error("[public/agency/pricing] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: CORS });
  }
}
