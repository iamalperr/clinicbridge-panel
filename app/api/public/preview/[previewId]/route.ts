import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { DEMO_PREVIEW_ID, demoPreviewView } from "@/lib/preview/demoClinic";

export const runtime = "nodejs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

type RouteParams = { params: Promise<{ previewId: string }> };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { previewId } = await params;
  if (previewId === DEMO_PREVIEW_ID) {
    return NextResponse.json(demoPreviewView(), { headers: { ...CORS, "Cache-Control": "no-store" } });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: CORS });

  const snap = await db.collection("previews").doc(previewId).get();
  if (!snap.exists) return NextResponse.json({ error: "not_found" }, { status: 404, headers: CORS });
  const data = snap.data() ?? {};
  const expiresAt = data.expiresAt?.toDate?.() as Date | undefined;
  if (!expiresAt || expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "expired" }, { status: 410, headers: CORS });
  }

  const treatments = Array.isArray(data.treatments) ? data.treatments.length : 0;
  const languages = Array.isArray(data.languages) ? data.languages.length : 0;
  const questions = Array.isArray(data.faq) ? data.faq.length : 0;

  return NextResponse.json(
    {
      previewId,
      sourceUrl: typeof data.sourceUrl === "string" ? data.sourceUrl : "",
      clinicName: typeof data.clinicName === "string" ? data.clinicName : null,
      logoUrl: typeof data.logoUrl === "string" ? data.logoUrl : null,
      primaryColor: typeof data.primaryColor === "string" ? data.primaryColor : null,
      embeddable: data.embeddable !== false,
      treatmentCount: treatments,
      languageCount: languages,
      questionCount: questions,
      expiresAt: expiresAt.toISOString(),
    },
    { headers: { ...CORS, "Cache-Control": "no-store" } }
  );
}
