import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { setLifecycleEmailOptOut } from "@/lib/lifecycle/recordMilestone";
import { verifyLifecycleOptOutToken } from "@/lib/lifecycle/optOut";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clinicId = (url.searchParams.get("clinicId") || "").trim();
  const token = (url.searchParams.get("token") || "").trim();
  if (!clinicId || !verifyLifecycleOptOutToken(clinicId, token)) {
    return new NextResponse("Geçersiz bağlantı.", { status: 400 });
  }
  const db = getAdminDb();
  if (!db) return new NextResponse("Servis geçici olarak kullanılamıyor.", { status: 503 });
  await setLifecycleEmailOptOut(db, clinicId);
  return new NextResponse(
    "<!doctype html><html><body style=\"font-family:system-ui;padding:32px\"><h1>Tamam</h1><p>Zorunlu olmayan deneme hatırlatmaları durduruldu.</p></body></html>",
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
