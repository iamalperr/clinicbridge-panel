import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

function getClientDb() {
  const cfg = {
    apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  if (!cfg.apiKey || !cfg.projectId) return null;
  try {
    const app = getApps().length ? getApps()[0] : initializeApp(cfg);
    return getFirestore(app);
  } catch { return null; }
}

/**
 * GET /api/public/clinic-config?clinicId=xxx
 * Returns lightweight clinic contact config for the widget.
 * No auth required — only public-safe fields are returned.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const clinicId = searchParams.get("clinicId");

  if (!clinicId) {
    return NextResponse.json({ error: "clinicId required" }, { status: 400, headers: CORS });
  }

  let clinicName      = "";
  let whatsappNumber  = "";
  let telegramLink    = "";
  let clinicLanguage  = "tr";

  try {
    const adminDb = getAdminDb();
    const clientDb = adminDb ? null : getClientDb();

    if (adminDb) {
      const snap = await adminDb.collection("clinics").doc(clinicId).get();
      if (snap.exists) {
        const d = snap.data()!;
        clinicName     = d.name             ?? "";
        whatsappNumber = d.whatsappNumber   ?? "";
        telegramLink   = d.telegramUsername ?? "";
        clinicLanguage = d.language         ?? "tr";
      }
    } else if (clientDb) {
      const snap = await getDoc(doc(clientDb, "clinics", clinicId));
      if (snap.exists()) {
        const d = snap.data()!;
        clinicName     = d.name             ?? "";
        whatsappNumber = d.whatsappNumber   ?? "";
        telegramLink   = d.telegramUsername ?? "";
        clinicLanguage = d.language         ?? "tr";
      }
    }
  } catch (err: any) {
    console.error("[clinic-config] Error:", err.message);
  }

  return NextResponse.json(
    { clinicName, whatsappNumber, telegramLink, clinicLanguage },
    { headers: CORS }
  );
}
