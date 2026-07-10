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
 * GET /api/public/agency/[slug]
 * Returns public agency config by slug.
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

    const snap = await adminDb
      .collection("agencies")
      .where("slug", "==", slug)
      .where("status", "==", "active")
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json({ error: "Agency not found" }, { status: 404, headers: CORS });
    }

    const doc = snap.docs[0];
    const d = doc.data();

    return NextResponse.json({
      id: doc.id,
      name: d.name,
      slug: d.slug,
      domain: d.domain,
      logo: d.logo || null,
      branding: d.branding || {},
      supportedLanguages: d.supportedLanguages || ["en"],
      privacyUrl: d.privacyUrl || null,
      treatmentCategories: d.treatmentCategories || [],
      contactEmail: d.contactEmail || null,
    }, { headers: CORS });
  } catch (err) {
    console.error("[public/agency] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: CORS });
  }
}
