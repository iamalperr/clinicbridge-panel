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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ agencyId: string }> }
) {
  try {
    const { agencyId } = await params;
    if (!agencyId) {
      return NextResponse.json({ error: "agencyId required" }, { status: 400, headers: CORS });
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: "db unavailable" }, { status: 503, headers: CORS });
    }

    const agencyDoc = await adminDb.collection("agencies").doc(agencyId).get();
    if (!agencyDoc.exists) {
      return NextResponse.json({ error: "Agency not found" }, { status: 404, headers: CORS });
    }

    const raw = agencyDoc.data()!;

    const publicSettings = {
      agencyId,
      name: raw.name || "Agency",
      branding: {
        primaryColor: raw.branding?.primaryColor || "#10b981",
        accentColor: raw.branding?.accentColor || undefined,
      },
      supportedLanguages: raw.supportedLanguages || ["en"],
      privacy: {
        enabled: true,
        privacyUrl: raw.privacyUrl || "https://app.clinicbridge-ai.com/kvkk",
        requireConsent: true,
      },
      treatmentCategories: raw.treatmentCategories || [],
      widget: {
        title: raw.name || "Health Tourism Assistant",
        assistantName: raw.name || "Health Assistant",
        primaryColor: raw.branding?.primaryColor || "#10b981",
        defaultLanguage: "auto",
        messages: {
          tr: {
            greetingMessage: "Merhaba! Tedavi ihtiyacınız için size en uygun kliniği bulmamıza yardımcı olabiliriz.",
            inputPlaceholder: "Tedavi ihtiyacınızı yazın...",
            quickActions: [
              "Tedavim için doğru kliniği bul",
              "Tedavi seçeneklerini karşılaştır",
              "Tedavi talebimi başlat",
            ],
          },
          en: {
            greetingMessage: "Hello! We can help you find the right clinic for your treatment needs.",
            inputPlaceholder: "Describe your treatment needs...",
            quickActions: [
              "Find the right clinic for my treatment",
              "Compare treatment options",
              "Start my treatment request",
            ],
          },
        },
      },
    };

    return NextResponse.json(publicSettings, { headers: CORS });
  } catch (err) {
    console.error("[agency-widget-settings] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: CORS });
  }
}
