import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  applyWhatsAppStatusUpdate,
  maybeAutoReplyToStaff,
  parseWhatsAppWebhookPayload,
  verifyWhatsAppSignature,
  verifyWhatsAppWebhookChallenge,
} from "@/lib/services/notifications/whatsapp/webhook";

export const runtime = "nodejs";

/** Meta webhook verification (hub.mode / hub.verify_token / hub.challenge). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = verifyWhatsAppWebhookChallenge({
    mode: url.searchParams.get("hub.mode"),
    token: url.searchParams.get("hub.verify_token"),
    challenge: url.searchParams.get("hub.challenge"),
  });
  if (!result.ok) {
    return new NextResponse("Forbidden", { status: result.reason === "bad_request" ? 400 : 403 });
  }
  return new NextResponse(result.challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/** Status updates + inbound staff messages. Signature must match; body is never logged. */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyWhatsAppSignature(rawBody, signature)) {
    console.log(JSON.stringify({ checkpoint: "WHATSAPP_WEBHOOK", status: "signature_rejected" }));
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const adminDb = getAdminDb();
  if (!adminDb) {
    // Acknowledge so Meta does not retry forever while Admin SDK is down.
    return NextResponse.json({ ok: true, skipped: "no_admin_db" });
  }

  const parsed = parseWhatsAppWebhookPayload(body);
  for (const status of parsed.statuses) {
    try {
      await applyWhatsAppStatusUpdate(adminDb, {
        messageId: status.messageId,
        status: status.status,
        timestamp: status.timestamp,
        errorCode: status.errorCode,
      });
    } catch {
      /* continue other updates */
    }
  }

  for (const inbound of parsed.inbound) {
    await maybeAutoReplyToStaff({
      db: adminDb,
      from: inbound.from,
      text: inbound.text,
    });
  }

  return NextResponse.json({ ok: true });
}
