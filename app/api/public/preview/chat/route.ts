import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { trackableAIRequest } from "@/lib/services/aiGateway";
import { buildPreviewChatMessages, previewLimitReply, type PreviewChatTurn } from "@/lib/preview/chat";
import { parseClinicHours } from "@/lib/preview/clinicHours";
import { DEMO_PREVIEW_ID } from "@/lib/preview/demoClinic";
import { NOVA_TREATMENTS, NOVA_WEEK, novaAnswer, novaKnowledgeItems } from "@/lib/demo/novaDental";
import { advancePreviewIntake } from "@/lib/preview/previewIntake";
import { detectPreviewLanguage } from "@/lib/preview/previewLanguage";
import { consumeDemoChatRateLimit, consumePreviewMessage, hashDemoIp } from "@/lib/preview/rateLimit";
import { extractClientIp } from "@/lib/auth/passwordResetRateLimit";
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
  const uiLanguage = detectPreviewLanguage(message, language);
  const history = asHistory(body.history);

  const db = getAdminDb();
  if (previewId === DEMO_PREVIEW_ID) {
    if (db) {
      const allowed = await consumeDemoChatRateLimit(db, hashDemoIp(extractClientIp(req)));
      if (!allowed) {
        return NextResponse.json({ reply: previewLimitReply(uiLanguage), uiLanguage }, { headers: CORS });
      }
    }
    return answerPreview({
      knowledge: novaKnowledgeItems(),
      history,
      message,
      uiLanguage,
      treatments: NOVA_TREATMENTS.map((item) => item.name.tr),
      hours: NOVA_WEEK,
      demo: true,
    });
  }

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
  const treatments = Array.isArray(data.treatments)
    ? data.treatments.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const name = (item as { name?: unknown }).name;
        return typeof name === "string" && name.trim() ? [name.trim()] : [];
      })
    : [];
  return answerPreview({
    knowledge,
    history,
    message,
    uiLanguage,
    treatments,
    hours: parseClinicHours(typeof data.hours === "string" ? data.hours : null),
    demo: false,
  });
}

async function answerPreview(input: {
  knowledge: PreviewKnowledgeItem[];
  history: PreviewChatTurn[];
  message: string;
  uiLanguage: ReturnType<typeof detectPreviewLanguage>;
  treatments: string[];
  hours: ReturnType<typeof parseClinicHours>;
  demo: boolean;
}) {
  const intake = advancePreviewIntake({
    history: input.history,
    message: input.message,
    language: input.uiLanguage,
    treatments: input.treatments,
    hours: input.hours,
  });
  if (intake.handled && intake.reply) {
    return NextResponse.json({ reply: intake.reply, uiLanguage: input.uiLanguage, lead: intake.lead }, { headers: CORS });
  }

  const known = input.demo ? novaAnswer(input.message, input.uiLanguage) : null;
  if (known) {
    const reply = intake.followUp ? `${known}\n\n${intake.followUp}` : known;
    return NextResponse.json({ reply, uiLanguage: input.uiLanguage }, { headers: CORS });
  }

  try {
    const response = await trackableAIRequest({
      channel: "system",
      requestType: "system",
      model: "gpt-4o-mini",
      temperature: 0.2,
      maxTokens: 400,
      messages: buildPreviewChatMessages(input.knowledge, input.history, input.message),
    });
    const reply = response.content?.trim();
    if (reply) {
      return NextResponse.json({
        reply: intake.followUp ? `${reply}\n\n${intake.followUp}` : reply,
        uiLanguage: input.uiLanguage,
      }, { headers: CORS });
    }
  } catch {
    /* model failure still must not persist the visitor message */
  }

  const fallback = input.uiLanguage === "tr"
    ? "Şu an yanıt üretemiyorum. Tedaviler, hekimler ve randevu talebi için sorunuzu kısaca yineler misiniz?"
    : input.uiLanguage === "de"
      ? "Ich kann das gerade nicht beantworten. Fragen Sie bitte kurz nach Behandlung, Ärztin oder Termin."
      : input.uiLanguage === "ar"
        ? "لا أستطيع الإجابة الآن. أعيدوا السؤال باختصار عن العلاج أو الطبيب أو الموعد."
        : input.uiLanguage === "ru"
          ? "Сейчас не могу ответить. Повторите, пожалуйста, вопрос о лечении, враче или записи."
          : "I can't answer that right now. Please ask again about a treatment, a dentist, or an appointment.";
  return NextResponse.json({
    reply: intake.followUp ? `${fallback}\n\n${intake.followUp}` : fallback,
    uiLanguage: input.uiLanguage,
  }, { headers: CORS });
}
