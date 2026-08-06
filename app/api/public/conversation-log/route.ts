import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { stableHistoryMessageDocId } from "@/lib/services/conversations/conversationTranscript";

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
    const nowIso = now.toISOString();
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
        createdAt: nowIso,
        updatedAt: nowIso,
        userName: "Visitor",
        durationSec: 0,
      });
    } else {
      // Increment message count and update timestamp
      const data = snap.data()!;
      await convRef.update({
        messageCount: (data.messageCount ?? 0) + 1,
        updatedAt: nowIso,
        status: "open",
      });
    }

    const content = userMessage ?? assistantMessage ?? "";
    const role = userMessage ? "user" : "assistant";

    // Log individual message (legacy store)
    await convRef.collection("messages").add({
      role,
      content,
      createdAt: nowIso,
    });

    // Dual-write into conversationLogs so portal detail can see early turns
    // even when /chat appointment early-returns skip logConversation.
    if (content && String(content).trim()) {
      try {
        const logRef = adminDb
          .collection("clinics")
          .doc(clinicId)
          .collection("conversationLogs")
          .doc(sessionId);
        const logSnap = await logRef.get();
        const existingCount = logSnap.exists
          ? Number(logSnap.data()?.totalMessages || 0)
          : 0;
        const seq = existingCount;
        const docId = stableHistoryMessageDocId(
          role === "user" ? "user" : "assistant",
          String(content),
          seq
        );
        await logRef.set(
          {
            clinicId,
            updatedAt: nowIso,
            ...(logSnap.exists
              ? {}
              : {
                  createdAt: nowIso,
                  status: "open",
                  language: "tr",
                  convertedToAppointment: false,
                  lastMessagePreview: String(content).slice(0, 100),
                }),
            totalMessages: existingCount + 1,
            lastMessagePreview: String(content).slice(0, 100),
          },
          { merge: true }
        );
        await logRef.collection("messages").doc(docId).set(
          {
            sender: role === "user" ? "patient" : "assistant",
            role,
            content: String(content),
            createdAt: nowIso,
            sequence: seq,
            wasAnswered: true,
            needsTraining: false,
            source: "conversation_log_dual_write",
          },
          { merge: true }
        );
      } catch (dualErr: any) {
        console.warn("[conversation-log] dual-write skipped:", dualErr?.message);
      }
    }

    return NextResponse.json({ ok: true }, { headers: CORS });
  } catch (err) {
    console.error("[conversation-log] Error:", err);
    return NextResponse.json({ ok: false }, { status: 500, headers: CORS });
  }
}
