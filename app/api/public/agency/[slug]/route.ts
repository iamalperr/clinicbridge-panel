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
  let slug = "";
  try {
    const p = await params;
    slug = p.slug;
    let snap: any = null;
    try {
      const adminDb = getAdminDb();
      if (adminDb) {
        snap = await adminDb
          .collection("agencies")
          .where("slug", "==", slug)
          .where("status", "==", "active")
          .limit(1)
          .get();
      }
    } catch (dbErr) {
      console.warn("[public/agency] DB query failed, checking fallbacks...", dbErr);
    }

    if (!snap || snap.empty) {
      if (slug === "feelinhealthy") {
        return NextResponse.json({
          id: "feelinhealthy",
          name: "FeelinHealthy",
          slug: "feelinhealthy",
          domain: "feelinhealthy.com",
          logo: null,
          branding: { primaryColor: "#059669" },
          supportedLanguages: ["tr", "en"],
          privacyUrl: "https://feelinhealthy.com/kvkk",
          treatmentCategories: ["Dental", "Hair Transplant", "Aesthetic"],
          contactEmail: "info@feelinhealthy.com",
        }, { headers: CORS });
      }
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
    if (slug === "feelinhealthy") {
      return NextResponse.json({
        id: "feelinhealthy",
        name: "FeelinHealthy",
        slug: "feelinhealthy",
        domain: "feelinhealthy.com",
        logo: null,
        branding: { primaryColor: "#059669" },
        supportedLanguages: ["tr", "en"],
        privacyUrl: "https://feelinhealthy.com/kvkk",
        treatmentCategories: ["Dental", "Hair Transplant", "Aesthetic"],
        contactEmail: "info@feelinhealthy.com",
      }, { headers: CORS });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: CORS });
  }
}
