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
 * GET /api/public/agency/[slug]/clinics/[clinicId]/doctors
 * Returns active, public-visible doctors for a clinic.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; clinicId: string }> }
) {
  try {
    const { slug, clinicId } = await params;
    const adminDb = getAdminDb();
    if (!adminDb) return NextResponse.json({ error: "db unavailable" }, { status: 503, headers: CORS });

    const agencySnap = await adminDb.collection("agencies").where("slug", "==", slug).limit(1).get();
    if (agencySnap.empty) return NextResponse.json({ error: "Agency not found" }, { status: 404, headers: CORS });
    const agencyId = agencySnap.docs[0].id;

    const doctorSnap = await adminDb
      .collection("agencies").doc(agencyId)
      .collection("clinics").doc(clinicId)
      .collection("doctors")
      .orderBy("order", "asc")
      .get();

    const doctors = doctorSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((doc: any) => doc.status === "active" && doc.showOnPublicProfile !== false);

    return NextResponse.json({ doctors }, { headers: CORS });
  } catch (err) {
    console.error("[public/doctors] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: CORS });
  }
}
