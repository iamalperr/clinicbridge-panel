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
 * GET /api/public/agency/[slug]/config
 * Returns matching + widget configuration.
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
    const configRef = adminDb.collection("agencies").doc(agencyId).collection("config");

    // Read matching config
    const matchingDoc = await configRef.doc("matching").get();
    const matching = matchingDoc.exists ? matchingDoc.data() : null;

    // Read widget config
    const widgetDoc = await configRef.doc("widget").get();
    const widget = widgetDoc.exists ? widgetDoc.data() : null;

    return NextResponse.json({
      matching: matching ? {
        routingMode: matching.routingMode || "assisted",
        maxClinicsToShow: matching.maxClinicsToShow ?? 5,
        showPriceRange: matching.showPriceRange ?? true,
        showProfileLinks: matching.showProfileLinks ?? true,
        requireConsentBeforeQuote: matching.requireConsentBeforeQuote ?? true,
        treatmentClinicRules: matching.treatmentClinicRules || [],
      } : null,
      widget: widget ? {
        assistantName: widget.assistantName || "AI Assistant",
        welcomeMessage: widget.welcomeMessage || null,
        toneOfVoice: widget.toneOfVoice || "professional",
        defaultLanguage: widget.defaultLanguage || "en",
        supportedLanguages: widget.supportedLanguages || ["en"],
        widgetMode: widget.widgetMode || "matching_assistant",
        ctaOptions: widget.ctaOptions || [],
        openingMessage: widget.openingMessage || null,
      } : null,
    }, { headers: CORS });
  } catch (err) {
    console.error("[public/agency/config] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: CORS });
  }
}
