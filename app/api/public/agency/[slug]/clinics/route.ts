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
 * GET /api/public/agency/[slug]/clinics
 * Returns active, recommendation-eligible clinics for the agency.
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

    const clinicSnap = await adminDb
      .collection("agencies")
      .doc(agencyId)
      .collection("clinics")
      .orderBy("priority", "asc")
      .get();

    const clinics = clinicSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((c: any) => c.status === "active");

    return NextResponse.json({ clinics }, { headers: CORS });
  } catch (err) {
    console.error("[public/agency/clinics] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: CORS });
  }
}
