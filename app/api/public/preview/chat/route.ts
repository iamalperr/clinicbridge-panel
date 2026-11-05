import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { trackableAIRequest } from "@/lib/services/aiGateway";
import { buildPreviewChatMessages, previewLimitReply, type PreviewChatTurn } from "@/lib/preview/chat";
import { consumePreviewMessage } from "@/lib/preview/rateLimit";
import type { PreviewKnowledgeItem } from "@/lib/preview/types";

export const runtime = "nodejs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

function asHistory(value: unknown): PreviewChatTurn[] {
  if (!Array.isArray(value)) return [];
  const turns: PreviewChatTurn[] = [];
  for (const entry of value.slice(-8)) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as { role?: unknown; content?: unknown };
    if ((record.role !== "user" && record.role !== "assistant") || typeof record.content !== "string") continue;
    const content = record.content.trim().slice(0, 500);
    if (!content) continue;
    turns.push({ role: record.role, content });
  }
  return turns;
}

export async function POST(req: Request) {
  let body: { previewId?: unknown; message?: unknown; history?: unknown; language?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400, headers: CORS });
  }

  const previewId = typeof body.previewId === "string" ? body.previewId.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 500) : "";
  const language = typeof body.language === "string" ? body.language : null;
  if (!previewId || !message) {
    return NextResponse.json({ error: "invalid" }, { status: 400, headers: CORS });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: CORS });

  const snap = await db.collection("previews").doc(previewId).get();
  if (!snap.exists) return NextResponse.json({ error: "not_found" }, { status: 404, headers: CORS });
  const data = snap.data() ?? {};
  const expiresAt = data.expiresAt?.toDate?.() as Date | undefined;
  if (expiresAt && expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "expired" }, { status: 410, headers: CORS });
  }

  const allowed = await consumePreviewMessage(db, previewId);
  if (!allowed) {
    return NextResponse.json({ reply: previewLimitReply(language) }, { headers: CORS });
  }

  const knowledge = Array.isArray(data.knowledgeItems) ? (data.knowledgeItems as PreviewKnowledgeItem[]) : [];
  const messages = buildPreviewChatMessages(knowledge, asHistory(body.history), message);
  try {
    const response = await trackableAIRequest({
      channel: "system",
      requestType: "system",
      model: "gpt-4o-mini",
      temperature: 0.2,
      maxTokens: 400,
      messages,
    });
    const reply = response.content?.trim();
    if (reply) return NextResponse.json({ reply }, { headers: CORS });
  } catch {
    /* model failure still must not persist the visitor message */
  }

  const fallback = (language || "").toLowerCase().startsWith("tr")
    ? "Şu an yanıt üretemiyorum. Lütfen kliniğin sitesindeki iletişim bilgisini kullanın."
    : "I can't answer right now. Please use the contact details on the clinic website.";
  return NextResponse.json({ reply: fallback }, { headers: CORS });
}
