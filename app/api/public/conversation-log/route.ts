import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { clinicId, sessionId, userMessage, assistantMessage } = body;

    if (!clinicId || !sessionId) {
      return NextResponse.json({ error: "clinicId and sessionId required" }, { status: 400, headers: CORS });
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ ok: false, error: "db unavailable" }, { status: 503, headers: CORS });
    }

    const now = new Date();
    const convRef = adminDb
      .collection("clinics")
      .doc(clinicId)
      .collection("conversations")
      .doc(sessionId);

    const snap = await convRef.get();

    if (!snap.exists) {
      // Create new conversation document
      await convRef.set({
        clinicId,
        sessionId,
        firstMessage: userMessage ?? "",
        messageCount: 1,
        status: "open",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        userName: "Visitor",
        durationSec: 0,
      });
    } else {
      // Increment message count and update timestamp
      const data = snap.data()!;
      await convRef.update({
        messageCount: (data.messageCount ?? 0) + 1,
        updatedAt: now.toISOString(),
        status: "open",
      });
    }

    // Log individual message
    await convRef.collection("messages").add({
      role: userMessage ? "user" : "assistant",
      content: userMessage ?? assistantMessage ?? "",
      createdAt: now.toISOString(),
    });

    return NextResponse.json({ ok: true }, { headers: CORS });
  } catch (err) {
    console.error("[conversation-log] Error:", err);
    return NextResponse.json({ ok: false }, { status: 500, headers: CORS });
  }
}
