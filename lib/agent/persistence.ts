/**
 * Conversation / appointment state persistence for the Agent Core.
 * respondWithVisibleReply persists then returns AgentTurnResult (not HTTP).
 */
import { getAdminDb } from "@/lib/firebase-admin";
import { stripUndefinedDeep } from "@/lib/firestore/stripUndefined";
import type { AgentTurnResult, AppointmentData, AppointmentState } from "./types";

export async function saveAppointmentState(
  adminDb: any, 
  clinicId: string, 
  convId: string, 
  expectedVersion: number, 
  newState: AppointmentState, 
  newDraft: Partial<AppointmentData>, 
  extras: Record<string, any> = {}
): Promise<boolean> {
  const logRef = adminDb.collection("clinics").doc(clinicId).collection("conversationLogs").doc(convId);
  try {
    // Firestore rejects `undefined` nested fields; a failed write here previously
    // left conversations stuck in COLLECTING_* without appointmentDraft while the
    // patient still saw the in-memory confirmation summary.
    const payload = stripUndefinedDeep({
      appointmentState: newState,
      appointmentDraft: newDraft || {},
      ...extras,
    });
    await logRef.set(payload, { merge: true });
    console.log(JSON.stringify({
      checkpoint: "APPT_STATE_SAVED",
      conversationId: convId,
      clinicId,
      stateAfter: newState,
      draftKeys: Object.keys(newDraft || {}),
      hasDraft: Boolean(newDraft && Object.keys(newDraft).length > 0),
    }));
    return true;
  } catch (e: any) {
    console.error(JSON.stringify({
      checkpoint: "APPT_STATE_SAVE_FAILED",
      conversationId: convId,
      clinicId,
      stateAttempted: newState,
      error: e?.message || String(e),
    }));
    return false;
  }
}

export async function logConversation(params: {
  clinicId: string;
  convId: string;
  userMessage: string;
  aiReply: string;
  historyLength: number;
  /** Prior turns from the widget (role/content). Synced into messages for full history. */
  history?: Array<{ role?: string; content?: string }> | null;
  apptData?: AppointmentData | null;
  appointmentId?: string;
  isAppointmentCreated?: boolean;
  isLiveSupport?: boolean;
  // NEW DIAGNOSTIC FIELDS
  tenantId?: string;
  widgetId?: string;
  sourceDomain?: string;
  detectedLanguage?: string;
  promptVersionId?: string;
  knowledgeBaseId?: string;
  retrievedDocumentCount?: number;
  fallbackReason?: string;
  appointmentState?: AppointmentState;
}) {
  const adminDb = getAdminDb();
  if (!adminDb) return;

  try {
    const { syncConversationLogMessagesFromHistory } = await import(
      "@/lib/services/conversations/conversationTranscriptService"
    );
    const logRef = adminDb.collection("clinics").doc(params.clinicId).collection("conversationLogs").doc(params.convId);
    
    // Check existing
    const snap = await logRef.get();
    const existing = snap.exists ? snap.data() : null;

    let status = existing?.status || "open";
    let needsTraining = existing?.needsTraining || false;
    let trainingTopic = existing?.trainingTopic || "";
    
    const replyLower = params.aiReply.toLowerCase();
    const alreadyConverted =
      Boolean(params.isAppointmentCreated) ||
      Boolean(existing?.convertedToAppointment) ||
      existing?.appointmentStatus === "created" ||
      existing?.appointmentState === "APPOINTMENT_SUBMITTED" ||
      (typeof existing?.appointmentId === "string" && existing.appointmentId.trim().length > 0);

    if (alreadyConverted || params.isAppointmentCreated) {
      // Appointment conversion is durable; live-support / chat may coexist.
      status = "appointment";
    } else if (params.isLiveSupport) {
      status = "liveSupport";
    } else if (params.appointmentState && params.appointmentState !== "IDLE") {
      status = "collecting";
    } else if (replyLower.includes("üzgünüm") && (replyLower.includes("yardımcı olamıyorum") || replyLower.includes("anlayamadım") || replyLower.includes("yanıt üretemiyorum") || replyLower.includes("bilgi havuzumda"))) {
      status = "unanswered";
      needsTraining = true;
      if (!trainingTopic) trainingTopic = params.userMessage.slice(0, 60);
    } else if (replyLower.includes("canlı destek") || replyLower.includes("temsilci") || replyLower.includes("klinik ekibi") || replyLower.includes("iletişime geç") || replyLower.includes("doğrudan arayın") || replyLower.includes("whatsapp")) {
      status = "liveSupport";
    } else {
      status = "answered";
    }

    if (params.isLiveSupport || /\bwhatsapp\b/i.test(params.userMessage) || /\bwhatsapp\b/i.test(params.aiReply)) {
      // Independent support flag — never erases appointment conversion.
      // Written below onto logData.
    }

    const nowStr = new Date().toISOString();

    // Sync full visible history (client history + current turn) into messages.
    // This prevents "14 mesaj" counts with only the last turn persisted.
    const actualMessageCount = await syncConversationLogMessagesFromHistory(adminDb, {
      clinicId: params.clinicId,
      conversationId: params.convId,
      history: params.history,
      userMessage: params.userMessage,
      aiReply: params.aiReply,
      baseIso: existing?.createdAt || nowStr,
      includeLiveSupportSystem: Boolean(params.isLiveSupport),
    });
    
    const logData: any = {
      clinicId: params.clinicId,
      updatedAt: nowStr,
      // Prefer actual persisted message count over historyLength+2 heuristics.
      totalMessages: actualMessageCount > 0 ? actualMessageCount : params.historyLength + 2,
      lastMessagePreview: params.userMessage.slice(0, 100),
      status,
      needsTraining,
    };

    if (params.appointmentState) {
      logData.appointmentState = params.appointmentState;
    }

    if (params.apptData) {
      // Only force review state when we are not already terminal / submitted.
      if (!params.isAppointmentCreated && params.appointmentState !== "APPOINTMENT_SUBMITTED") {
        logData.appointmentState = params.appointmentState || "AWAITING_CONFIRMATION";
      }
      logData.appointmentDraft = stripUndefinedDeep(params.apptData);
    }

    if (!existing) {
      logData.createdAt = nowStr;
      logData.convertedToAppointment = false;
      logData.tenantId = params.tenantId || "";
      logData.widgetId = params.widgetId || "";
      logData.sourceDomain = params.sourceDomain || "";
      logData.promptVersionId = params.promptVersionId || "";
      logData.knowledgeBaseId = params.knowledgeBaseId || "";
    }

    // Persist active conversation language on every turn so short follow-ups
    // (WhatsApp?, Да, phone numbers) inherit the established language.
    if (params.detectedLanguage) {
      logData.language = params.detectedLanguage;
      logData.conversationLocale = params.detectedLanguage;
      logData.detectedLanguage = params.detectedLanguage;
    }

    if (params.retrievedDocumentCount !== undefined) logData.retrievedDocumentCount = params.retrievedDocumentCount;
    if (params.fallbackReason) logData.fallbackReason = params.fallbackReason;

    if (trainingTopic) logData.trainingTopic = trainingTopic;
    if (params.apptData?.patientName) logData.patientName = params.apptData.patientName;
    if (params.apptData?.patientPhone) logData.patientPhone = params.apptData.patientPhone;
    let activeIntent = existing?.activeIntent || "";
    let appointmentStatus = existing?.appointmentStatus || "";

    const userMessageLower = params.userMessage.toLowerCase();
    const intentKeywords = ["randevu", "görüşme almak", "doktora görünmek", "appointment", "consultation"];
    if (intentKeywords.some(k => userMessageLower.includes(k) || replyLower.includes(k))) {
      activeIntent = "appointment";
      if (!existing?.convertedToAppointment && appointmentStatus !== "readyToCreate" && appointmentStatus !== "created") {
        appointmentStatus = "collecting";
      }
    }

    if (params.apptData && !params.isAppointmentCreated) {
      logData.pendingAppointmentData = stripUndefinedDeep({
        patientName: params.apptData.patientName || "",
        patientPhone: params.apptData.patientPhone || "",
        patientEmail: params.apptData.patientEmail || "",
        treatmentType: params.apptData.requestedService || "",
        preferredDate: params.apptData.requestedDate || "",
        preferredTime: params.apptData.requestedTime || "",
        notes: params.apptData.notes || "",
        requestedDoctor: params.apptData.requestedDoctor || undefined
      });
      activeIntent = "appointment";
      appointmentStatus = "readyToCreate";
    }

    if (params.isAppointmentCreated) {
      status = "appointment";
      activeIntent = "appointment";
      appointmentStatus = "created";
      logData.convertedToAppointment = true;
      logData.appointmentId = params.appointmentId;
      logData.appointmentState = "APPOINTMENT_SUBMITTED";
      logData.isAppointmentCreated = true;
    }

    logData.activeIntent = activeIntent;
    logData.appointmentStatus = appointmentStatus;
    logData.status = status;

    if (
      params.isLiveSupport ||
      /\bwhatsapp\b/i.test(params.userMessage || "") ||
      /\bwhatsapp\b/i.test(params.aiReply || "")
    ) {
      logData.liveSupportRequested = true;
      logData.supportStatus = "requested";
      if (/\bwhatsapp\b/i.test(params.userMessage || "")) {
        logData.preferredContactChannel = "whatsapp";
      }
    }

    // Preserve terminal appointment fields even when this turn is support/chat.
    if (alreadyConverted) {
      logData.convertedToAppointment = true;
      if (existing?.appointmentId || params.appointmentId) {
        logData.appointmentId = params.appointmentId || existing?.appointmentId;
      }
      if (!params.appointmentState && existing?.appointmentState === "APPOINTMENT_SUBMITTED") {
        logData.appointmentState = "APPOINTMENT_SUBMITTED";
      }
      if (appointmentStatus !== "created") {
        logData.appointmentStatus = "created";
      }
    }

    // Write log doc — strip undefined so Firestore cannot silently reject the whole update
    await logRef.set(stripUndefinedDeep(logData), { merge: true });

    console.log(JSON.stringify({
      checkpoint: "APPT_CONVERSATION_LOG_WRITTEN",
      conversationId: params.convId,
      clinicId: params.clinicId,
      appointmentState: logData.appointmentState || null,
      appointmentStatus: logData.appointmentStatus || null,
      status: logData.status,
      appointmentPersisted: Boolean(params.isAppointmentCreated && params.appointmentId),
      appointmentId: params.appointmentId || null,
    }));

    // Message docs are upserted via syncConversationLogMessagesFromHistory above.

  } catch (err: any) {
    console.error("[logConversation] Error:", err.message);
  }
}

/**
 * Canonical turn finalizer: persist the visible user+assistant turn, then return AgentTurnResult.
 * Every user-visible `reply` must go through this (or an equivalent awaited logConversation).
 * Web adapter maps result.payload → NextResponse.json.
 */
export async function respondWithVisibleReply(
  payload: Record<string, any>,
  persist: {
    clinicId: string;
    convId: string;
    userMessage: string;
    history?: Array<{ role?: string; content?: string }> | null;
    apptData?: AppointmentData | null;
    appointmentId?: string;
    isAppointmentCreated?: boolean;
    isLiveSupport?: boolean;
    tenantId?: string;
    widgetId?: string;
    sourceDomain?: string;
    detectedLanguage?: string;
    promptVersionId?: string;
    knowledgeBaseId?: string;
    retrievedDocumentCount?: number;
    fallbackReason?: string;
    appointmentState?: AppointmentState;
    /** When false, skip persistence (empty duplicate / no visible reply). Default true when reply non-empty. */
    skipPersist?: boolean;
  }
): Promise<AgentTurnResult> {
  const reply = typeof payload.reply === "string" ? payload.reply : "";
  const shouldPersist =
    !persist.skipPersist && Boolean(persist.clinicId && persist.convId && reply.trim());

  if (shouldPersist) {
    await logConversation({
      clinicId: persist.clinicId,
      convId: persist.convId,
      userMessage: persist.userMessage,
      aiReply: reply,
      historyLength: persist.history?.length || 0,
      history: persist.history,
      apptData: persist.apptData,
      appointmentId: persist.appointmentId,
      isAppointmentCreated: persist.isAppointmentCreated,
      isLiveSupport: persist.isLiveSupport,
      tenantId: persist.tenantId,
      widgetId: persist.widgetId,
      sourceDomain: persist.sourceDomain,
      detectedLanguage: persist.detectedLanguage,
      promptVersionId: persist.promptVersionId,
      knowledgeBaseId: persist.knowledgeBaseId,
      retrievedDocumentCount: persist.retrievedDocumentCount,
      fallbackReason: persist.fallbackReason,
      appointmentState: persist.appointmentState,
    });
  }

  if (persist.convId && payload.conversationId === undefined) {
    payload.conversationId = persist.convId;
  }

  const draft =
    (payload.pendingAppointmentData as Partial<AppointmentData> | null | undefined) ??
    persist.apptData ??
    null;

  return {
    replyText: reply,
    conversationId: String(payload.conversationId || persist.convId || ""),
    locale: persist.detectedLanguage,
    appointmentState: persist.appointmentState,
    appointmentDraft: draft,
    payload,
    httpStatus: 200,
    escalation: persist.isLiveSupport ? { kind: "live_support" } : undefined,
    sideEffects: {
      appointmentCreated: Boolean(persist.isAppointmentCreated || payload.appointmentCreated),
      appointmentId: persist.appointmentId || payload.appointmentId,
    },
  };
}
