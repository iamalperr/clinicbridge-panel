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
    const hasUser = Boolean(userMessage && String(userMessage).trim());
    const hasAssistant = Boolean(assistantMessage && String(assistantMessage).trim());
    const incrementBy = (hasUser ? 1 : 0) + (hasAssistant ? 1 : 0);

    if (!snap.exists) {
      await convRef.set({
        clinicId,
        sessionId,
        firstMessage: hasUser ? String(userMessage) : "",
        messageCount: Math.max(1, incrementBy),
        status: "open",
        createdAt: nowIso,
        updatedAt: nowIso,
        userName: "Visitor",
        durationSec: 0,
      });
    } else if (incrementBy > 0) {
      const data = snap.data()!;
      await convRef.update({
        messageCount: (data.messageCount ?? 0) + incrementBy,
        updatedAt: nowIso,
        status: "open",
      });
    }

    // Legacy conversations/messages (append-only; used as secondary source).
    if (hasUser) {
      await convRef.collection("messages").add({
        role: "user",
        content: String(userMessage),
        createdAt: nowIso,
      });
    }
    if (hasAssistant) {
      await convRef.collection("messages").add({
        role: "assistant",
        content: String(assistantMessage),
        createdAt: new Date(Date.now() + 1).toISOString(),
      });
    }

    // Dual-write into conversationLogs with content-stable ids (idempotent upserts).
    const turns: Array<{ role: "user" | "assistant"; content: string }> = [];
    if (hasUser) turns.push({ role: "user", content: String(userMessage).trim() });
    if (hasAssistant) turns.push({ role: "assistant", content: String(assistantMessage).trim() });

    if (turns.length > 0) {
      try {
        const logRef = adminDb
          .collection("clinics")
          .doc(clinicId)
          .collection("conversationLogs")
          .doc(sessionId);
        const logSnap = await logRef.get();
        const messagesCol = logRef.collection("messages");
        let maxSeq = -1;
        let newWrites = 0;

        for (let i = 0; i < turns.length; i++) {
          const turn = turns[i];
          const docId = stableHistoryMessageDocId(turn.role, turn.content);
          const existing = await messagesCol.doc(docId).get();
          if (existing.exists) {
            const seq = existing.data()?.sequence;
            if (typeof seq === "number" && seq > maxSeq) maxSeq = seq;
            continue;
          }
          if (maxSeq < 0) {
            // Lazily discover max sequence once when inserting.
            const all = await messagesCol.select("sequence").get();
            for (const d of all.docs) {
              const seq = d.data()?.sequence;
              if (typeof seq === "number" && seq > maxSeq) maxSeq = seq;
            }
          }
          maxSeq += 1;
          await messagesCol.doc(docId).set(
            {
              sender: turn.role === "user" ? "patient" : "assistant",
              role: turn.role,
              content: turn.content,
              createdAt: new Date(Date.now() + i).toISOString(),
              sequence: maxSeq,
              wasAnswered: true,
              needsTraining: false,
              source: "conversation_log_dual_write",
            },
            { merge: true }
          );
          newWrites++;
        }

        const after = await messagesCol.get();
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
                }),
            totalMessages: after.size,
            lastMessagePreview: turns[turns.length - 1].content.slice(0, 100),
          },
          { merge: true }
        );

        if (newWrites === 0 && after.size === 0) {
          /* nothing */
        }
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
