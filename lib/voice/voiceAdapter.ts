/**
 * Provider-independent Voice Adapter (Phase 2).
 *
 * Translates finalized transcript turns into DentalBridge Agent Core calls.
 * No telephony, STT, TTS, webhooks, or provider SDKs.
 */

import { handleClinicAgentTurn } from "@/lib/agent/handleClinicAgentTurn";
import type { HandleClinicAgentTurnParams } from "@/lib/agent/handleClinicAgentTurn";
import { RequestTimer } from "@/lib/performance/requestTimer";
import {
  appendProcessedTurnId,
  putTurnResultCache,
  type CallSessionStore,
} from "./callSessionStore";
import { loadServerAgentHistory, type AgentHistoryTurn } from "./loadServerHistory";
import type {
  CallSession,
  EndCallSessionInput,
  EndCallSessionResult,
  StartCallSessionInput,
  StartCallSessionResult,
  VoiceErrorResult,
  VoiceTurnInput,
  VoiceTurnResult,
} from "./types";

export interface VoiceAdapterDeps {
  sessionStore: CallSessionStore;
  /** Firestore Admin SDK (or test fake). Used for history + Agent Core. */
  adminDb: any;
  /**
   * Optional override for tests. Defaults to production handleClinicAgentTurn.
   */
  runAgentTurn?: (
    params: HandleClinicAgentTurnParams
  ) => ReturnType<typeof handleClinicAgentTurn>;
  /** Optional override — defaults to loading conversationLogs transcript. */
  loadHistory?: (params: {
    adminDb: any;
    clinicId: string;
    conversationId: string;
  }) => Promise<AgentHistoryTurn[]>;
  now?: () => Date;
  generateId?: (prefix: string) => string;
}

function defaultId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function err(
  errorCode: VoiceErrorResult["errorCode"],
  message: string,
  extra: Partial<VoiceErrorResult> = {}
): VoiceErrorResult {
  return { ok: false, errorCode, message, ...extra };
}

function normalizeTranscript(text: string): string {
  // Transport-level only: trim; do not rewrite patient language.
  return String(text || "").replace(/\u0000/g, "").trim();
}

async function ensureConversationLogShell(params: {
  adminDb: any;
  clinicId: string;
  conversationId: string;
  callerE164?: string;
  locale?: string;
  nowIso: string;
}): Promise<boolean> {
  const { adminDb, clinicId, conversationId, callerE164, locale, nowIso } = params;
  if (!adminDb) return false;
  try {
    const ref = adminDb
      .collection("clinics")
      .doc(clinicId)
      .collection("conversationLogs")
      .doc(conversationId);
    await ref.set(
      {
        clinicId,
        channel: "voice",
        source: "voice",
        createdAt: nowIso,
        updatedAt: nowIso,
        status: "open",
        ...(callerE164 ? { patientPhone: callerE164 } : {}),
        ...(locale ? { conversationLocale: locale } : {}),
      },
      { merge: true }
    );
    return true;
  } catch (e: any) {
    console.error(JSON.stringify({
      checkpoint: "VOICE_CONV_SHELL_FAILED",
      clinicId,
      conversationId,
      error: e?.message || String(e),
    }));
    return false;
  }
}

/**
 * Start a provider-independent voice call session bound to a clinic conversation.
 */
export async function startCallSession(
  deps: VoiceAdapterDeps,
  input: StartCallSessionInput
): Promise<StartCallSessionResult | VoiceErrorResult> {
  const clinicId = String(input.clinicId || "").trim();
  if (!clinicId) {
    return err("CLINIC_NOT_FOUND", "clinicId is required");
  }

  const nowIso = (deps.now?.() ?? new Date()).toISOString();
  const gen = deps.generateId ?? defaultId;
  const callSessionId = gen("call");
  const conversationId = String(input.conversationId || "").trim() || gen("voice_conv");

  // Soft clinic existence check when Admin SDK is available.
  if (deps.adminDb) {
    try {
      const clinicSnap = await deps.adminDb.collection("clinics").doc(clinicId).get();
      if (!clinicSnap.exists) {
        // Agency clinics may live under agencies/*/clinics — Agent Core resolves that.
        // Do not hard-fail here solely on top-level clinics doc missing.
      }
    } catch {
      /* ignore — Agent Core will fail loudly if clinic truly missing */
    }
  }

  await ensureConversationLogShell({
    adminDb: deps.adminDb,
    clinicId,
    conversationId,
    callerE164: input.callerE164,
    locale: input.locale,
    nowIso,
  });

  const session: CallSession = {
    callSessionId,
    clinicId,
    conversationId,
    channel: "voice",
    status: "STARTED",
    startedAt: nowIso,
    lastActivityAt: nowIso,
    callerE164: input.callerE164,
    locale: input.locale,
    processedTurnIds: [],
    turnResultCache: {},
  };

  await deps.sessionStore.create(session);

  console.log(JSON.stringify({
    checkpoint: "VOICE_SESSION_STARTED",
    callSessionId,
    conversationId,
    clinicId,
    channel: "voice",
  }));

  return {
    ok: true,
    callSessionId,
    conversationId,
    clinicId,
    channel: "voice",
    status: "STARTED",
  };
}

/**
 * Process one finalized transcript turn through Agent Core.
 * Server loads history; caller must not supply history/pendingAppointmentData.
 */
export async function processVoiceTurn(
  deps: VoiceAdapterDeps,
  input: VoiceTurnInput
): Promise<VoiceTurnResult | VoiceErrorResult> {
  const callSessionId = String(input.callSessionId || "").trim();
  if (!callSessionId) {
    return err("SESSION_NOT_FOUND", "callSessionId is required");
  }

  const text = normalizeTranscript(input.text);
  if (!text) {
    return err("EMPTY_TRANSCRIPT", "Transcript text is empty", { callSessionId });
  }

  const session = await deps.sessionStore.get(callSessionId);
  if (!session) {
    return err("SESSION_NOT_FOUND", "Call session not found", { callSessionId });
  }

  if (input.clinicId && input.clinicId !== session.clinicId) {
    return err("CLINIC_MISMATCH", "Session does not belong to the requested clinic", {
      callSessionId,
      clinicId: session.clinicId,
      conversationId: session.conversationId,
    });
  }

  if (session.status === "COMPLETED" || session.status === "FAILED") {
    return err("SESSION_ENDED", "Call session is no longer active", {
      callSessionId,
      clinicId: session.clinicId,
      conversationId: session.conversationId,
    });
  }

  const turnId = input.turnId ? String(input.turnId).trim() : "";
  if (turnId && session.processedTurnIds.includes(turnId)) {
    const cached = session.turnResultCache?.[turnId];
    if (cached) {
      return { ...cached, idempotentReplay: true };
    }
    return err("AGENT_ERROR", "Turn already processed but cached result is unavailable", {
      callSessionId,
      clinicId: session.clinicId,
      conversationId: session.conversationId,
    });
  }

  const history = await (deps.loadHistory ?? loadServerAgentHistory)({
    adminDb: deps.adminDb,
    clinicId: session.clinicId,
    conversationId: session.conversationId,
  });

  const locale = input.locale || session.locale;
  const runAgent = deps.runAgentTurn ?? handleClinicAgentTurn;
  const now = deps.now?.() ?? new Date();
  const debugLog: string[] = [];
  const perf = new RequestTimer({});

  let agentResult;
  try {
    agentResult = await runAgent({
      input: {
        clinicId: session.clinicId,
        conversationId: session.conversationId,
        channel: "voice",
        text,
        history,
        locale,
        // Voice must not round-trip client draft; server draft is authoritative.
        pendingAppointmentData: undefined,
        sourceDomain: "voice",
        traceId: turnId || undefined,
        context: {
          messageId: turnId || `voice_msg_${now.getTime()}`,
          callSessionId,
          channel: "voice",
        },
      },
      adminDb: deps.adminDb,
      perf,
      debugLog,
      startTime: now.getTime(),
    });
  } catch (e: any) {
    console.error(JSON.stringify({
      checkpoint: "VOICE_AGENT_ERROR",
      callSessionId,
      conversationId: session.conversationId,
      clinicId: session.clinicId,
      channel: "voice",
      error: e?.message || String(e),
    }));
    return err("AGENT_ERROR", "Agent failed to process the turn", {
      callSessionId,
      clinicId: session.clinicId,
      conversationId: session.conversationId,
    });
  }

  if ((agentResult.httpStatus ?? 200) >= 400 && agentResult.payload?.error) {
    const msg = String(agentResult.payload.error);
    if (/klinik|clinic/i.test(msg)) {
      return err("CLINIC_NOT_FOUND", "Clinic configuration was not found", {
        callSessionId,
        clinicId: session.clinicId,
        conversationId: session.conversationId,
      });
    }
    return err("AGENT_ERROR", "Agent returned an error response", {
      callSessionId,
      clinicId: session.clinicId,
      conversationId: session.conversationId,
    });
  }

  const escalationRequested = Boolean(
    agentResult.escalation?.kind === "live_support" ||
      agentResult.payload?.liveSupportRequired
  );

  const result: VoiceTurnResult = {
    ok: true,
    callSessionId,
    conversationId: session.conversationId,
    clinicId: session.clinicId,
    channel: "voice",
    replyText: agentResult.replyText || String(agentResult.payload?.reply || ""),
    locale: agentResult.locale || locale,
    appointmentState: agentResult.appointmentState,
    appointmentDraft: agentResult.appointmentDraft,
    appointmentCreated: Boolean(agentResult.sideEffects?.appointmentCreated),
    appointmentId: agentResult.sideEffects?.appointmentId,
    escalationRequested: escalationRequested || undefined,
    escalation: escalationRequested ? { kind: "live_support" } : undefined,
  };

  const nowIso = now.toISOString();
  const processedTurnIds = turnId
    ? appendProcessedTurnId(session.processedTurnIds, turnId)
    : session.processedTurnIds;
  const turnResultCache = turnId
    ? putTurnResultCache(session.turnResultCache, turnId, result)
    : session.turnResultCache;

  await deps.sessionStore.update(callSessionId, {
    status: "ACTIVE",
    lastActivityAt: nowIso,
    locale: result.locale || session.locale,
    processedTurnIds,
    turnResultCache,
  });

  console.log(JSON.stringify({
    checkpoint: "VOICE_TURN_PROCESSED",
    callSessionId,
    conversationId: session.conversationId,
    clinicId: session.clinicId,
    channel: "voice",
    turnId: turnId || null,
    appointmentState: result.appointmentState || null,
    appointmentCreated: Boolean(result.appointmentCreated),
    escalationRequested: Boolean(result.escalationRequested),
  }));

  return result;
}

/**
 * Mark a call session completed/failed. Conversation log is retained.
 */
export async function endCallSession(
  deps: VoiceAdapterDeps,
  input: EndCallSessionInput
): Promise<EndCallSessionResult | VoiceErrorResult> {
  const callSessionId = String(input.callSessionId || "").trim();
  if (!callSessionId) {
    return err("SESSION_NOT_FOUND", "callSessionId is required");
  }

  const session = await deps.sessionStore.get(callSessionId);
  if (!session) {
    return err("SESSION_NOT_FOUND", "Call session not found", { callSessionId });
  }

  if (input.clinicId && input.clinicId !== session.clinicId) {
    return err("CLINIC_MISMATCH", "Session does not belong to the requested clinic", {
      callSessionId,
      clinicId: session.clinicId,
      conversationId: session.conversationId,
    });
  }

  const nowIso = (deps.now?.() ?? new Date()).toISOString();
  const status = input.reason === "failed" ? "FAILED" : "COMPLETED";

  await deps.sessionStore.update(callSessionId, {
    status,
    endedAt: nowIso,
    lastActivityAt: nowIso,
  });

  console.log(JSON.stringify({
    checkpoint: "VOICE_SESSION_ENDED",
    callSessionId,
    conversationId: session.conversationId,
    clinicId: session.clinicId,
    channel: "voice",
    status,
  }));

  return {
    ok: true,
    callSessionId,
    conversationId: session.conversationId,
    clinicId: session.clinicId,
    status,
  };
}
