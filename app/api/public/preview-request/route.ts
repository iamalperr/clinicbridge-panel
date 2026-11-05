import { NextResponse, after } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { extractClientIp } from "@/lib/auth/passwordResetRateLimit";
import { fulfillPreviewRequest } from "@/lib/preview/fulfillRequest";
import { consumePreviewRequestRateLimit, hashPreviewRequestIp } from "@/lib/preview/rateLimit";
import { PreviewUrlError, assertPublicResolution, parsePublicHttpUrl } from "@/lib/preview/ssrf";

export const runtime = "nodejs";
export const maxDuration = 60;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  let body: { clinicName?: unknown; website?: unknown; email?: unknown; phone?: unknown; consent?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid");
  }

  const clinicName = typeof body.clinicName === "string" ? body.clinicName.trim().slice(0, 120) : "";
  const email = typeof body.email === "string" ? body.email.trim().slice(0, 160) : "";
  const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 40) : "";
  const websiteRaw = typeof body.website === "string" ? body.website : "";
  if (!clinicName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || body.consent !== true) {
    return jsonError(400, "invalid");
  }

  let website: string;
  try {
    const url = parsePublicHttpUrl(websiteRaw);
    website = url.toString();
    try {
      await assertPublicResolution(url);
    } catch (error) {
      if (!(error instanceof PreviewUrlError) || error.code !== "dns") {
        return jsonError(400, "invalid_url");
      }
    }
  } catch {
    return jsonError(400, "invalid_url");
  }

  const db = getAdminDb();
  if (!db) return jsonError(503, "unavailable");

  const allowed = await consumePreviewRequestRateLimit(db, hashPreviewRequestIp(extractClientIp(req)));
  if (!allowed) return jsonError(429, "rate_limited");

  const created = await db.collection("previewRequests").add({
    clinicName,
    website,
    email,
    phone: phone || null,
    consent: true,
    status: "received",
    source: "direct",
    viewCount: 0,
    clinicEmailSent: false,
    adminEmailSent: false,
    createdAt: Timestamp.now(),
  });

  after(() => fulfillPreviewRequest(created.id));

  return NextResponse.json({ ok: true }, { headers: CORS });
}
