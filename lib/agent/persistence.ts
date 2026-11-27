/**
 * Conversation / appointment state persistence for the Agent Core.
 * respondWithVisibleReply persists then returns AgentTurnResult (not HTTP).
 */
import { getAdminDb } from "@/lib/firebase-admin";
import { stripUndefinedDeep } from "@/lib/firestore/stripUndefined";
import { normalizeTimestampIso } from "@/lib/datetime/normalizeTimestamp";
import type { AgentTurnResult, AppointmentData, AppointmentState } from "./types";
import { safeErrorMeta } from "@/lib/services/infrastructureErrors";
import {
  formatTechnicalFallbackReply,
  looksLikeTechnicalFallbackReply,
} from "./technicalFallback";
import { looksLikeNoVerifiedInfoReply } from "./noVerifiedInfoReply";
import {
  failureKindForReason,
  type ConversationFailureKind,
} from "@/lib/services/conversations/conversationFailureKind";

function isFirestoreAlreadyExistsError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 6 || code === "already-exists" || code === "ALREADY_EXISTS";
}

export async function saveAppointmentState(
  adminDb: any, 
  clinicId: string, 
  convId: string, 
  expectedVersion: number, 
  newState: AppointmentState, 
  newDraft: Partial<AppointmentData>, 
  extras: Record<string, any> = {},
  options: { replaceDraft?: boolean } = {}
): Promise<boolean> {
  const logRef = adminDb.collection("clinics").doc(clinicId).collection("conversationLogs").doc(convId);
  try {
    // Firestore rejects `undefined` nested fields; a failed write here previously
    // left conversations stuck in COLLECTING_* without appointmentDraft while the
    // patient still saw the in-memory confirmation summary.
    const nowIso = new Date().toISOString();
    const payload = stripUndefinedDeep({
      appointmentState: newState,
      appointmentDraft: newDraft || {},
      ...extras,
      updatedAt: extras.updatedAt ?? nowIso,
    });
    // First write must stamp createdAt. A plain merge on a new doc previously created
    // appointment shells without createdAt → UI "Invalid Date" (new Date(undefined)).
    try {
      await logRef.create(stripUndefinedDeep({ ...payload, createdAt: nowIso, clinicId }));
    } catch (createErr) {
      if (!isFirestoreAlreadyExistsError(createErr)) throw createErr;
      // merge:true deep-merges appointmentDraft, so keys the new draft omits would survive.
      // mergeFields replaces exactly the written top-level fields and leaves the rest of the log.
      const mergePayload = stripUndefinedDeep({ ...payload });
      await logRef.set(
        mergePayload,
        options.replaceDraft ? { mergeFields: Object.keys(mergePayload) } : { merge: true }
      );
    }
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
      ...safeErrorMeta(e),
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
  isContactRequest?: boolean;
  contactRequestId?: string;
  contactRequestStatus?: string;
  preferredContactMethod?: string;
  // NEW DIAGNOSTIC FIELDS
  tenantId?: string;
  widgetId?: string;
  sourceDomain?: string;
  detectedLanguage?: string;
  promptVersionId?: string;
  knowledgeBaseId?: string;
  retrievedDocumentCount?: number;
  fallbackReason?: string;
  technicalErrorCode?: string;
  appointmentState?: AppointmentState;
  /** Default SEQUENTIAL. VOICE_SINGLE_BATCH: same writes, two round trips, one atomic batch. */
  persistMode?: ConversationPersistMode;
}) {
  const adminDb = getAdminDb();
  if (!adminDb) return;

  try {
    const { syncConversationLogMessagesFromHistory, commitConversationLogTurnInSingleBatch } = await import(
      "@/lib/services/conversations/conversationTranscriptService"
    );
    const nowStr = new Date().toISOString();
    let logData: Record<string, any> | null = null;

    if (params.persistMode === "VOICE_SINGLE_BATCH") {
      const single = await commitConversationLogTurnInSingleBatch(adminDb, {
        clinicId: params.clinicId,
        conversationId: params.convId,
        history: params.history,
        userMessage: params.userMessage,
        aiReply: params.aiReply,
        includeLiveSupportSystem: Boolean(params.isLiveSupport),
        nowIso: nowStr,
        buildLogData: (existing, messageCount) =>
          stripUndefinedDeep(buildConversationLogData(params, existing, messageCount, nowStr)),
      });
      if (single.committed) logData = single.logData;
    }

    if (!logData) {
      const logRef = adminDb.collection("clinics").doc(params.clinicId).collection("conversationLogs").doc(params.convId);

      // Check existing
      const snap = await logRef.get();
      const existing = snap.exists ? snap.data() : null;

      // Sync full visible history (client history + current turn) into messages.
      // This prevents "14 mesaj" counts with only the last turn persisted.
      const actualMessageCount = await syncConversationLogMessagesFromHistory(adminDb, {
        clinicId: params.clinicId,
        conversationId: params.convId,
        history: params.history,
        userMessage: params.userMessage,
        aiReply: params.aiReply,
        baseIso: normalizeTimestampIso(existing?.createdAt) || normalizeTimestampIso(existing?.updatedAt) || nowStr,
        includeLiveSupportSystem: Boolean(params.isLiveSupport),
      });

      // Write log doc — strip undefined so Firestore cannot silently reject the whole update
      logData = stripUndefinedDeep(buildConversationLogData(params, existing, actualMessageCount, nowStr));
      await logRef.set(logData, { merge: true });
    }

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
    console.error("[logConversation] Error:", JSON.stringify(safeErrorMeta(err)));
  }
}

export type ConversationPersistMode = "SEQUENTIAL" | "VOICE_SINGLE_BATCH";

type LogConversationParams = Parameters<typeof logConversation>[0];

function classifyTurnFailure(aiReply: string, fallbackReason?: string): ConversationFailureKind | null {
  const byReason = failureKindForReason(fallbackReason);
  if (byReason) return byReason;
  if (looksLikeTechnicalFallbackReply(aiReply)) return "technical_failure";
  // Other explicit reasons keep their historical "unanswered + needs training" outcome.
  if (fallbackReason) return "knowledge_gap";
  const lower = aiReply.toLowerCase();
  if (
    looksLikeNoVerifiedInfoReply(aiReply) ||
    (lower.includes("üzgünüm") &&
      (lower.includes("yardımcı olamıyorum") ||
        lower.includes("anlayamadım") ||
        lower.includes("bilgi havuzumda")))
  ) {
    return "knowledge_gap";
  }
  return null;
}

/** Conversation log doc fields for one visible turn (pure; `existing` is the doc before it). */
function buildConversationLogData(
  params: LogConversationParams,
  existing: Record<string, any> | null | undefined,
  actualMessageCount: number,
  nowStr: string
): Record<string, any> {
    let status = existing?.status || "open";
    let needsTraining = existing?.needsTraining || false;
    let trainingTopic = existing?.trainingTopic || "";
    
    const replyLower = params.aiReply.toLowerCase();
    const failureKind = classifyTurnFailure(params.aiReply, params.fallbackReason);
    const alreadyConverted =
      Boolean(params.isAppointmentCreated) ||
      Boolean(existing?.convertedToAppointment) ||
      existing?.appointmentStatus === "created" ||
      existing?.appointmentState === "APPOINTMENT_SUBMITTED" ||
      (typeof existing?.appointmentId === "string" && existing.appointmentId.trim().length > 0);

    if (alreadyConverted || params.isAppointmentCreated) {
      // Appointment conversion is durable; live-support / chat may coexist.
      status = "appointment";
    } else if (params.isContactRequest || params.contactRequestId) {
      // Contact request pending clinic action — not generically "answered"
      const crStatus = String(params.contactRequestStatus || existing?.contactRequestStatus || "pending").toLowerCase();
      if (crStatus === "resolved") {
        status = "contact_request_resolved";
      } else if (crStatus === "cancelled") {
        status = existing?.status === "contact_request_pending" ? "answered" : (existing?.status || "answered");
      } else {
        status = "contact_request_pending";
      }
    } else if (params.isLiveSupport) {
      status = "liveSupport";
    } else if (params.appointmentState && params.appointmentState !== "IDLE") {
      status = "collecting";
    } else if (failureKind) {
      // Technical failure or knowledge gap — never count as "Başarılı Yanıtlandı".
      status = "unanswered";
    } else if (replyLower.includes("canlı destek") || replyLower.includes("temsilci") || replyLower.includes("klinik ekibi") || replyLower.includes("iletişime geç") || replyLower.includes("whatsapp")) {
      status = "liveSupport";
    } else {
      status = "answered";
    }

    // Only knowledge gaps are training topics; this also applies mid-flow, where status stays "collecting".
    if (failureKind === "knowledge_gap") {
      needsTraining = true;
      if (!trainingTopic) trainingTopic = params.userMessage.slice(0, 60);
    }

    if (params.isLiveSupport || /\bwhatsapp\b/i.test(params.userMessage) || /\bwhatsapp\b/i.test(params.aiReply)) {
      // Independent support flag — never erases appointment conversion.
      // Written below onto logData.
    }

    const logData: any = {
      clinicId: params.clinicId,
      updatedAt: nowStr,
      // Prefer actual persisted message count over historyLength+2 heuristics.
      totalMessages: actualMessageCount > 0 ? actualMessageCount : params.historyLength + 2,
      lastMessagePreview: params.userMessage.slice(0, 100),
      status,
      needsTraining,
      failureKind,
      technicalErrorCode:
        failureKind === "technical_failure" ? params.technicalErrorCode || null : null,
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

    // Stamp createdAt on first create OR when an appointment-state shell was written
    // earlier without createdAt (saveAppointmentState historically omitted it).
    if (!normalizeTimestampIso(existing?.createdAt)) {
      logData.createdAt =
        normalizeTimestampIso(existing?.updatedAt) || nowStr;
    }
    if (!existing) {
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
      // Durable snapshot for same-patient reschedule carry-over (treatment/doctor/contact).
      if (params.apptData) {
        logData.lastSubmittedAppointment = stripUndefinedDeep({
          patientName: params.apptData.patientName || "",
          patientPhone: params.apptData.patientPhone || "",
          patientEmail: params.apptData.patientEmail || "",
          emailDisposition: params.apptData.emailDisposition || undefined,
          requestedService: params.apptData.requestedService || "",
          requestedDoctor: params.apptData.requestedDoctor || undefined,
          notes: params.apptData.notes || "",
          requestedDate: params.apptData.requestedDate || "",
          requestedTime: params.apptData.requestedTime || "",
        });
        if (params.apptData.requestedService) {
          logData.requestedService = params.apptData.requestedService;
        }
      }
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

    if (params.isContactRequest || params.contactRequestId) {
      logData.contactRequestId = params.contactRequestId || existing?.contactRequestId;
      logData.contactRequestStatus = params.contactRequestStatus || existing?.contactRequestStatus || "pending";
      if (params.preferredContactMethod) {
        logData.preferredContactMethod = params.preferredContactMethod;
        logData.preferredContactChannel = params.preferredContactMethod;
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

    return logData;
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
    isContactRequest?: boolean;
    contactRequestId?: string;
    contactRequestStatus?: string;
    preferredContactMethod?: string;
    tenantId?: string;
    widgetId?: string;
    sourceDomain?: string;
    detectedLanguage?: string;
    promptVersionId?: string;
    knowledgeBaseId?: string;
    retrievedDocumentCount?: number;
    fallbackReason?: string;
    /** Content-free cause of a technical failure, e.g. OPENAI_QUOTA_EXCEEDED. */
    technicalErrorCode?: string;
    appointmentState?: AppointmentState;
    /** When false, skip persistence (empty duplicate / no visible reply). Default true when reply non-empty. */
    skipPersist?: boolean;
    persistMode?: ConversationPersistMode;
  }
): Promise<AgentTurnResult> {
  let reply = typeof payload.reply === "string" ? payload.reply : "";
  let persistOpts = persist;
  // Hard guard: no code path may end a turn with a blank assistant message in the HTTP/voice payload.
  if (!reply.trim()) {
    reply = formatTechnicalFallbackReply({
      locale: persistOpts.detectedLanguage,
    });
    payload = {
      ...payload,
      reply,
      responseType: payload.responseType || "CHAT_REPLY",
      emptyReplyGuarded: true,
    };
    if (!persistOpts.skipPersist && !persistOpts.fallbackReason) {
      persistOpts = { ...persistOpts, fallbackReason: "empty_reply_guard" };
    }
    if (!persistOpts.skipPersist) {
      const { logTechnicalFallbackEvent } = await import("./technicalFallback");
      logTechnicalFallbackEvent({
        category: "unknown",
        fallbackReason: persistOpts.fallbackReason || "empty_reply_guard",
        clinicId: persistOpts.clinicId,
        conversationId: persistOpts.convId,
      });
    }
  }
  const shouldPersist =
    !persistOpts.skipPersist && Boolean(persistOpts.clinicId && persistOpts.convId && reply.trim());

  if (shouldPersist) {
    const persistStartedAt = performance.now();
    await logConversation({
      clinicId: persistOpts.clinicId,
      convId: persistOpts.convId,
      userMessage: persistOpts.userMessage,
      aiReply: reply,
      historyLength: persistOpts.history?.length || 0,
      history: persistOpts.history,
      apptData: persistOpts.apptData,
      appointmentId: persistOpts.appointmentId,
      isAppointmentCreated: persistOpts.isAppointmentCreated,
      isLiveSupport: persistOpts.isLiveSupport,
      isContactRequest: persistOpts.isContactRequest,
      contactRequestId: persistOpts.contactRequestId,
      contactRequestStatus: persistOpts.contactRequestStatus,
      preferredContactMethod: persistOpts.preferredContactMethod,
      tenantId: persistOpts.tenantId,
      widgetId: persistOpts.widgetId,
      sourceDomain: persistOpts.sourceDomain,
      detectedLanguage: persistOpts.detectedLanguage,
      promptVersionId: persistOpts.promptVersionId,
      knowledgeBaseId: persistOpts.knowledgeBaseId,
      retrievedDocumentCount: persistOpts.retrievedDocumentCount,
      fallbackReason: persistOpts.fallbackReason,
      technicalErrorCode: persistOpts.technicalErrorCode,
      appointmentState: persistOpts.appointmentState,
      ...(persistOpts.persistMode ? { persistMode: persistOpts.persistMode } : {}),
    });
    console.log(JSON.stringify({
      checkpoint: "AGENT_TURN_PERSIST_PERF",
      clinicId: persistOpts.clinicId,
      conversationId: persistOpts.convId,
      persistMode: persistOpts.persistMode ?? "SEQUENTIAL",
      persistMs: Math.round(performance.now() - persistStartedAt),
    }));
  }

  if (persistOpts.convId && payload.conversationId === undefined) {
    payload.conversationId = persistOpts.convId;
  }

  const draft =
    (payload.pendingAppointmentData as Partial<AppointmentData> | null | undefined) ??
    persistOpts.apptData ??
    null;

  return {
    replyText: reply,
    conversationId: String(payload.conversationId || persistOpts.convId || ""),
    locale: persistOpts.detectedLanguage,
    appointmentState: persistOpts.appointmentState,
    appointmentDraft: draft,
    payload,
    httpStatus: 200,
    escalation: persistOpts.isLiveSupport ? { kind: "live_support" } : undefined,
    sideEffects: {
      appointmentCreated: Boolean(persistOpts.isAppointmentCreated || payload.appointmentCreated),
      appointmentId: persistOpts.appointmentId || payload.appointmentId,
    },
  };
}
