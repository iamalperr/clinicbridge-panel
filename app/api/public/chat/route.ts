import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { RequestTimer } from "@/lib/performance/requestTimer";
import { safeErrorMeta } from "@/lib/services/infrastructureErrors";
import {
  formatTechnicalFallbackReply,
  handleClinicAgentTurn,
  logTechnicalFallbackEvent,
  resolveAgentChannel,
  resolveClinicPhoneForFallback,
  respondWithVisibleReply,
  safeMergeDraft,
  type AgentTurnResult,
  type AppointmentData,
  type AppointmentState,
} from "@/lib/agent";
import { directClinicChatGate } from "@/lib/trial/policy";
import { clearUsageWarning, recordMonthlyConversation } from "@/lib/trial/recordUsage";
import { buildUsageWarningEmail } from "@/lib/trial/emails";
import { sendClinicEmail } from "@/lib/trial/sendClinicEmail";
import { isRealConversationOrigin } from "@/lib/lifecycle/origins";
import { safeRecordLifecycleMilestone } from "@/lib/lifecycle/safeRecord";

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
  let clinicId: string | undefined;
  let message: string | undefined;
  let language: string | undefined;
  let history: Array<{ role?: string; content?: string }> = [];
  let convId = `session_${Date.now()}`;

  try {
    perf.start("parse_request");
    const body = await req.json();
    clinicId = body.clinicId;
    const widgetId = body.widgetId;
    message = body.message;
    language = body.language;
    history = Array.isArray(body.history) ? body.history : [];
    const conversationId = body.conversationId || "";
    const pendingAppointmentData = body.pendingAppointmentData;
    const _systemAction = body._systemAction;
    const traceId = body.traceId;
    convId = conversationId || convId;
    perf.end("parse_request");
    perf.setContext({ conversationId: convId, clinicId, traceId });
    debugLog.push(`clinicId=${clinicId} msgLength=${message?.length ?? 0}`);

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
            const existingLog = (await logRef.get()).data();
            await logRef.set(
              {
                status: "liveSupport",
                updatedAt: now,
                clinicId,
                lastMessagePreview: message?.slice(0, 100) ?? "",
                ...(!existingLog?.createdAt ? { createdAt: now } : {}),
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
          console.warn("[system-action] Log error:", JSON.stringify(safeErrorMeta(e)));
        }
      }
      return NextResponse.json({ ok: true }, { headers: CORS });
    }

    const gateDb = getAdminDb();
    if (gateDb) {
      try {
        const clinicSnap = await gateDb.collection("clinics").doc(String(clinicId)).get();
        const gate = directClinicChatGate(clinicSnap.exists ? clinicSnap.data() : null, new Date(), language);
        if (gate.kind === "closed") {
          const closed = await respondWithVisibleReply(
            { reply: gate.reply },
            {
              clinicId,
              convId,
              userMessage: message,
              history,
              detectedLanguage: gate.language,
              fallbackReason: "trial_closed",
            }
          );
          return agentTurnResultToResponse(closed);
        }
        if (gate.kind === "track") {
          const tick = await recordMonthlyConversation(gateDb, String(clinicId), convId, new Date());
          if (tick?.notify) {
            const notice = buildUsageWarningEmail({
              language: tick.language,
              clinicName: tick.clinicName,
              notice: tick.notify,
              count: tick.count,
              limit: tick.limit,
            });
            const sent = await sendClinicEmail({ to: tick.email, subject: notice.subject, html: notice.html });
            if (!sent) await clearUsageWarning(gateDb, String(clinicId), tick.month, tick.notify);
          }
          const originHint =
            (typeof body.originUrl === "string" && body.originUrl) ||
            req.headers.get("origin") ||
            req.headers.get("referer") ||
            "";
          if (isRealConversationOrigin(originHint)) {
            await safeRecordLifecycleMilestone(gateDb, {
              clinicId: String(clinicId),
              milestone: "first_real_conversation",
              meta: { host: originHint.slice(0, 200) },
            });
          }
        }
      } catch (gateError: unknown) {
        console.warn("[trial-gate]", JSON.stringify(safeErrorMeta(gateError)));
      }
    }

    if (!process.env.OPENAI_API_KEY) {
      const locale = typeof language === "string" && language.trim() ? language.trim().slice(0, 2) : "tr";
      logTechnicalFallbackEvent({
        category: "unknown",
        fallbackReason: "unconfigured_ai",
        clinicId,
        conversationId: convId,
      });
      const result = await respondWithVisibleReply(
        {
          reply: formatTechnicalFallbackReply({ locale }),
          responseType: "CHAT_REPLY",
          technicalFallback: true,
        },
        {
          clinicId,
          convId,
          userMessage: message,
          history,
          detectedLanguage: locale,
          fallbackReason: "unconfigured_ai",
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
        context: { messageId: body.messageId || body.clientMessageId },
      },
      adminDb,
      perf,
      debugLog,
      startTime,
    });

    // Guard: never return an empty assistant message to the widget.
    if (!String(result.replyText || result.payload?.reply || "").trim()) {
      const locale =
        result.locale ||
        (typeof language === "string" && language.trim() ? language.trim().slice(0, 2) : "tr");
      logTechnicalFallbackEvent({
        category: "unknown",
        fallbackReason: "empty_reply_guard",
        clinicId,
        conversationId: convId,
      });
      const guarded = await respondWithVisibleReply(
        {
          reply: formatTechnicalFallbackReply({ locale }),
          responseType: "CHAT_REPLY",
          technicalFallback: true,
          conversationId: convId,
        },
        {
          clinicId,
          convId,
          userMessage: message,
          history,
          detectedLanguage: locale,
          fallbackReason: "empty_reply_guard",
        }
      );
      return agentTurnResultToResponse(guarded);
    }

    return agentTurnResultToResponse(result);
  } catch (err: unknown) {
    debugLog.push(`ERROR: ${JSON.stringify(safeErrorMeta(err))}`);
    console.error("[widget-chat]", debugLog.join(" | "));
    // Prefer request language; default EN so broken-English pricing questions never get a TR-only catch.
    const locale = typeof language === "string" && language.trim() ? language.trim().slice(0, 2) : "en";
    let clinicPhone = "";
    try {
      const adminDb = getAdminDb();
      if (adminDb && clinicId) {
        const snap = await adminDb.collection("clinics").doc(String(clinicId)).get();
        if (snap.exists) clinicPhone = resolveClinicPhoneForFallback(snap.data() as any);
      }
    } catch {
      /* phone lookup must not block the fallback reply */
    }
    logTechnicalFallbackEvent({
      category: "unknown",
      fallbackReason: "route_unhandled_exception",
      clinicId: String(clinicId || "unknown"),
      conversationId: convId,
    });
    const fallback = await respondWithVisibleReply(
      {
        reply: formatTechnicalFallbackReply({ locale, clinicPhone }),
        responseType: "CHAT_REPLY",
        technicalFallback: true,
        conversationId: convId,
      },
      {
        clinicId: String(clinicId || "unknown"),
        convId,
        userMessage: typeof message === "string" ? message : "",
        history: Array.isArray(history) ? (history as any) : [],
        detectedLanguage: locale,
        fallbackReason: "route_unhandled_exception",
      }
    );
    return agentTurnResultToResponse(fallback);
  }
}
