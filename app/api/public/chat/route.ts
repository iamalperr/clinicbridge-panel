import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { RequestTimer } from "@/lib/performance/requestTimer";
import {
  handleClinicAgentTurn,
  resolveAgentChannel,
  respondWithVisibleReply,
  safeMergeDraft,
  type AgentTurnResult,
  type AppointmentData,
  type AppointmentState,
} from "@/lib/agent";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** @deprecated Prefer importing from `@/lib/agent` — re-exported for compatibility. */
export { safeMergeDraft };
/** @deprecated Prefer importing from `@/lib/agent` — re-exported for compatibility. */
export type { AppointmentState, AppointmentData };

function agentTurnResultToResponse(result: AgentTurnResult): NextResponse {
  return NextResponse.json(result.payload, {
    status: result.httpStatus ?? 200,
    headers: CORS,
  });
}

/**
 * Web Chat Adapter — HTTP transport around the channel-agnostic Agent Core.
 * Widget contract unchanged: same request body and JSON response fields.
 */
export async function POST(req: Request) {
  const startTime = Date.now();
  const debugLog: string[] = [];
  const perf = new RequestTimer({});

  try {
    perf.start("parse_request");
    const body = await req.json();
    const {
      clinicId,
      widgetId,
      message,
      language,
      history = [],
      conversationId = "",
      pendingAppointmentData,
      _systemAction,
      traceId,
    } = body;
    const convId = conversationId || `session_${Date.now()}`;
    perf.end("parse_request");
    perf.setContext({ conversationId: convId, clinicId, traceId });
    debugLog.push(`clinicId=${clinicId} msg="${message?.slice(0, 60)}"`);

    if (!clinicId || !message) {
      return NextResponse.json(
        { error: "clinicId and message required" },
        { status: 400, headers: CORS }
      );
    }

    /* ── Handle system actions (no OpenAI / Agent Core) ── */
    if (_systemAction && conversationId) {
      const adminDb = getAdminDb();
      if (adminDb) {
        try {
          const now = new Date().toISOString();
          const logRef = adminDb
            .collection("clinics")
            .doc(clinicId)
            .collection("conversationLogs")
            .doc(conversationId);

          if (_systemAction.type === "liveSupportHandoffDisplayed") {
            await logRef.set(
              {
                status: "liveSupport",
                updatedAt: now,
                clinicId,
                lastMessagePreview: message?.slice(0, 100) ?? "",
              },
              { merge: true }
            );
            const sysRef = logRef.collection("messages").doc(`msg_${Date.now()}_sys_handoff`);
            await sysRef.set({
              sender: "system",
              content: "Canlı Destek Yönlendirmesi Gösterildi",
              action: "live_support_handoff_displayed",
              createdAt: now,
              wasAnswered: true,
              needsTraining: false,
            });
            console.log(`[handoff] Logged handoff displayed convId=${conversationId}`);
          } else if (_systemAction.type === "liveSupportChannelClick") {
            const isWhatsapp = _systemAction.channel === "whatsapp";
            const action = isWhatsapp ? "whatsapp_redirect_clicked" : "telegram_redirect_clicked";
            const label = isWhatsapp ? "WhatsApp'a Yönlendirildi" : "Telegram'a Yönlendirildi";
            const sysRef = logRef.collection("messages").doc(`msg_${Date.now()}_sys_click`);
            await sysRef.set({
              sender: "system",
              content: label,
              action,
              channel: _systemAction.channel,
              createdAt: now,
              wasAnswered: true,
              needsTraining: false,
            });
            await logRef.set({ lastRedirectAction: action, lastRedirectAt: now }, { merge: true });
            console.log(`[channel-click] Logged: ${label} convId=${conversationId}`);
          } else if (_systemAction.type === "satisfaction_survey_displayed") {
            await logRef.set(
              {
                surveyDisplayed: true,
                surveyDisplayedAt: now,
                updatedAt: now,
                clinicId,
              },
              { merge: true }
            );
            const sysRef = logRef.collection("messages").doc(`msg_${Date.now()}_sys_survey`);
            await sysRef.set({
              sender: "system",
              content: "Memnuniyet Anketi Gösterildi",
              action: "satisfaction_survey_displayed",
              createdAt: now,
              wasAnswered: true,
              needsTraining: false,
            });
            console.log(`[survey] Displayed convId=${conversationId}`);
          } else if (_systemAction.type === "satisfaction_survey_submitted") {
            const rating = typeof _systemAction.rating === "number" ? _systemAction.rating : 0;
            await logRef.set(
              {
                surveySubmitted: true,
                surveyRating: rating,
                surveySubmittedAt: now,
                updatedAt: now,
              },
              { merge: true }
            );
            const sysRef = logRef.collection("messages").doc(`msg_${Date.now()}_sys_rating`);
            await sysRef.set({
              sender: "system",
              content: `Memnuniyet Anketi Yanıtlandı — ${rating}/5 ⭐`,
              action: "satisfaction_survey_submitted",
              rating,
              createdAt: now,
              wasAnswered: true,
              needsTraining: false,
            });
            console.log(`[survey] Submitted rating=${rating} convId=${conversationId}`);
          } else if (_systemAction.type === "quick_action_clicked") {
            const { actionType, label } = _systemAction as any;
            const sysRef = logRef.collection("messages").doc(`msg_${Date.now()}_sys_qa`);
            await sysRef.set({
              sender: "system",
              content: `Hızlı Komut Tıklandı — ${label} (${actionType})`,
              action: "quick_action_clicked",
              actionType: actionType ?? "",
              label: label ?? "",
              createdAt: now,
              wasAnswered: true,
              needsTraining: false,
            });
            console.log(
              `[quick-action] clicked type=${actionType} label=${label} convId=${conversationId}`
            );
          }
        } catch (e: any) {
          console.warn("[system-action] Log error:", e.message);
        }
      }
      return NextResponse.json({ ok: true }, { headers: CORS });
    }

    if (!process.env.OPENAI_API_KEY) {
      const result = await respondWithVisibleReply(
        { reply: "Yapay zeka servisi şu an yapılandırılmamış. Lütfen kliniğimizi arayın." },
        {
          clinicId,
          convId,
          userMessage: message,
          history,
        }
      );
      return agentTurnResultToResponse(result);
    }

    const adminDb = getAdminDb();
    const sourceDomain =
      body.originUrl || req.headers.get("origin") || req.headers.get("referer") || "unknown";

    const result = await handleClinicAgentTurn({
      input: {
        clinicId,
        conversationId: convId,
        channel: resolveAgentChannel("web_widget"),
        text: message,
        history,
        locale: language,
        pendingAppointmentData,
        widgetId,
        traceId,
        originUrl: body.originUrl,
        sourceDomain,
        context: { messageId: body.messageId },
      },
      adminDb,
      perf,
      debugLog,
      startTime,
    });

    return agentTurnResultToResponse(result);
  } catch (err: any) {
    debugLog.push(`ERROR: ${err.message ?? err}`);
    console.error("[widget-chat]", debugLog.join(" | "), err);
    return NextResponse.json(
      { reply: "Şu an teknik bir sorun yaşıyoruz. Lütfen kliniğimizi doğrudan arayın." },
      { status: 200, headers: CORS }
    );
  }
}
