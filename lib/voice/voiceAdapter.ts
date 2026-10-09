/**
 * Provider-independent Voice Adapter (Phase 2).
 *
 * Translates finalized transcript turns into DentalBridge Agent Core calls.
 * No telephony, STT, TTS, webhooks, or provider SDKs.
 */

import { handleClinicAgentTurn } from "@/lib/agent/handleClinicAgentTurn";
import type { HandleClinicAgentTurnParams } from "@/lib/agent/handleClinicAgentTurn";
import { RequestTimer } from "@/lib/performance/requestTimer";
import type { CanonicalConversationStatus } from "@/lib/services/conversations/conversationStatusResolver";
import {
  appendProcessedTurnId,
  isFirestoreAlreadyExistsError,
  putTurnResultCache,
  type CallSessionStore,
} from "./callSessionStore";
import { loadServerAgentHistory, type AgentHistoryTurn } from "./loadServerHistory";
import { safeErrorMeta } from "@/lib/services/infrastructureErrors";
import type {
  CallSession,
  EndCallSessionInput,
  EndCallSessionResult,
  ProcessVoiceTurnOptions,
  StartCallSessionInput,
  StartCallSessionResult,
  VoiceErrorResult,
  VoiceTurnInput,
  VoiceTurnPrefetch,
  VoiceTurnResult,
} from "./types";

export type { ProcessVoiceTurnOptions, VoiceTurnPrefetch } from "./types";

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
  /**
   * Write post-turn session bookkeeping (status/locale/processed turn ids) after the reply is
   * returned instead of before. Writes stay ordered per call session: the next turn, a prefetch
   * and endCallSession all wait for it first.
   */
  deferSessionBookkeeping?: boolean;
}

const pendingSessionWrites = new Map<string, Promise<void>>();

/** Resolves once deferred bookkeeping writes for this call session have settled. */
export function awaitVoiceSessionWrites(callSessionId: string): Promise<void> {
  return pendingSessionWrites.get(callSessionId) ?? Promise.resolve();
}

function enqueueSessionWrite(
  callSessionId: string,
  write: () => Promise<void>,
  onError: (err: unknown) => void
): void {
  const queued: Promise<void> = awaitVoiceSessionWrites(callSessionId)
    .then(write)
    .catch(onError)
    .finally(() => {
      if (pendingSessionWrites.get(callSessionId) === queued) pendingSessionWrites.delete(callSessionId);
    });
  pendingSessionWrites.set(callSessionId, queued);
}

function elapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

/**
 * Load the session and server history for the next turn of a known call. Reads only.
 * `clinicId`/`conversationId` must come from the trusted call binding.
 */
export async function prefetchVoiceTurnContext(
  deps: VoiceAdapterDeps,
  input: { callSessionId: string; clinicId: string; conversationId: string }
): Promise<VoiceTurnPrefetch> {
  const { callSessionId, clinicId, conversationId } = input;
  const sessionRead = (async (): Promise<Pick<VoiceTurnPrefetch, "session" | "sessionReadMs">> => {
    await awaitVoiceSessionWrites(callSessionId);
    const startedAt = performance.now();
    try {
      const value = await deps.sessionStore.get(callSessionId);
      return { session: { ok: true, value }, sessionReadMs: elapsedMs(startedAt) };
    } catch (error) {
      return { session: { ok: false, error }, sessionReadMs: elapsedMs(startedAt) };
    }
  })();
  const historyRead = (async (): Promise<Pick<VoiceTurnPrefetch, "history" | "historyMs">> => {
    const startedAt = performance.now();
    try {
      const value = await (deps.loadHistory ?? loadServerAgentHistory)({ adminDb: deps.adminDb, clinicId, conversationId });
      return { history: { ok: true, value }, historyMs: elapsedMs(startedAt) };
    } catch {
      return { history: { ok: false }, historyMs: elapsedMs(startedAt) };
    }
  })();
  const [s, h] = await Promise.all([sessionRead, historyRead]);
  return { callSessionId, clinicId, conversationId, ...s, ...h };
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
    // Create-if-absent: a retried/stale start must not reset an in-progress conversation.
    await ref.create({
      clinicId,
      channel: "voice",
      source: "voice",
      createdAt: nowIso,
      updatedAt: nowIso,
      status: "open",
      ...(callerE164 ? { patientPhone: callerE164 } : {}),
      ...(locale ? { conversationLocale: locale } : {}),
    });
    return true;
  } catch (e: any) {
    if (isFirestoreAlreadyExistsError(e)) return true;
    console.error(JSON.stringify({
      checkpoint: "VOICE_CONV_SHELL_FAILED",
      clinicId,
      conversationId,
      ...safeErrorMeta(e),
    }));
    return false;
  }
}

const VOICE_SHELL_INITIAL_STATUS = "open";
const NO_INTERACTION_STATUS: CanonicalConversationStatus = "no_interaction";

type VoiceConversationFinalizeOutcome =
  | "NO_INTERACTION"
  | "OUTCOME_PRESERVED"
  | "SHELL_MISSING"
  | "SKIPPED"
  | "FAILED";

/** True only for the untouched shell written by ensureConversationLogShell. */
function isUntouchedVoiceShell(data: unknown, hasMessages: boolean): boolean {
  if (hasMessages || typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    d.channel === "voice" &&
    d.status === VOICE_SHELL_INITIAL_STATUS &&
    !(typeof d.totalMessages === "number" && d.totalMessages > 0) &&
    d.convertedToAppointment !== true &&
    d.appointmentId === undefined &&
    d.appointmentState === undefined &&
    d.appointmentDraft === undefined &&
    d.pendingAppointmentData === undefined &&
    d.contactRequestId === undefined
  );
}

/**
 * Give a voice conversation that never had a recorded business turn a final status.
 * conversationLogs.status is the conversation OUTCOME (set by Agent Core per turn), so any
 * conversation that already has one is left untouched. Never creates the document.
 */
async function finalizeVoiceConversationShell(params: {
  adminDb: any;
  clinicId: string;
  conversationId: string;
  nowIso: string;
}): Promise<VoiceConversationFinalizeOutcome> {
  const { adminDb, clinicId, conversationId, nowIso } = params;
  if (!adminDb || typeof adminDb.runTransaction !== "function") return "SKIPPED";
  try {
    const ref = adminDb
      .collection("clinics")
      .doc(clinicId)
      .collection("conversationLogs")
      .doc(conversationId);
    // Transactional so a concurrent Agent Core outcome write is never overwritten.
    return await adminDb.runTransaction(async (tx: any): Promise<VoiceConversationFinalizeOutcome> => {
      const snap = await tx.get(ref);
      if (!snap.exists) return "SHELL_MISSING";
      const messages = await tx.get(ref.collection("messages").limit(1));
      if (!isUntouchedVoiceShell(snap.data(), !messages.empty)) return "OUTCOME_PRESERVED";
      tx.update(ref, { status: NO_INTERACTION_STATUS, updatedAt: nowIso });
      return "NO_INTERACTION";
    });
  } catch (e: any) {
    console.error(JSON.stringify({
      checkpoint: "VOICE_CONV_FINALIZE_FAILED",
      clinicId,
      conversationId,
      ...safeErrorMeta(e),
    }));
    return "FAILED";
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
  input: VoiceTurnInput,
  options: ProcessVoiceTurnOptions = {}
): Promise<VoiceTurnResult | VoiceErrorResult> {
  const callSessionId = String(input.callSessionId || "").trim();
  if (!callSessionId) {
    return err("SESSION_NOT_FOUND", "callSessionId is required");
  }

  const text = normalizeTranscript(input.text);
  if (!text) {
    return err("EMPTY_TRANSCRIPT", "Transcript text is empty", { callSessionId });
  }

  const prefetched = options.prefetch ? await options.prefetch : null;
  const usablePrefetch = prefetched && prefetched.callSessionId === callSessionId ? prefetched : null;

  let session: CallSession | null;
  let sessionReadMs: number;
  if (usablePrefetch) {
    if (!usablePrefetch.session.ok) throw usablePrefetch.session.error;
    session = usablePrefetch.session.value;
    sessionReadMs = usablePrefetch.sessionReadMs;
  } else {
    await awaitVoiceSessionWrites(callSessionId);
    const startedAt = performance.now();
    session = await deps.sessionStore.get(callSessionId);
    sessionReadMs = elapsedMs(startedAt);
  }
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

  // Prefetched history is only used when it was loaded for this session's own conversation.
  const prefetchedHistory =
    usablePrefetch &&
    usablePrefetch.history.ok &&
    usablePrefetch.clinicId === session.clinicId &&
    usablePrefetch.conversationId === session.conversationId
      ? { value: usablePrefetch.history.value, ms: usablePrefetch.historyMs }
      : null;
  let history: AgentHistoryTurn[];
  let historyMs: number;
  if (prefetchedHistory) {
    history = prefetchedHistory.value;
    historyMs = prefetchedHistory.ms;
  } else {
    const startedAt = performance.now();
    history = await (deps.loadHistory ?? loadServerAgentHistory)({
      adminDb: deps.adminDb,
      clinicId: session.clinicId,
      conversationId: session.conversationId,
    });
    historyMs = elapsedMs(startedAt);
  }

  const locale = input.locale || session.locale;
  const runAgent = deps.runAgentTurn ?? handleClinicAgentTurn;
  const now = deps.now?.() ?? new Date();
  const debugLog: string[] = [];
  const perf = new RequestTimer({});

  const agentStartedAt = performance.now();
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
      ...safeErrorMeta(e),
    }));
    return err("AGENT_ERROR", "Agent failed to process the turn", {
      callSessionId,
      clinicId: session.clinicId,
      conversationId: session.conversationId,
    });
  }
  const agentMs = elapsedMs(agentStartedAt);

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

  const sessionPatch: Partial<CallSession> = {
    status: "ACTIVE",
    lastActivityAt: nowIso,
    locale: result.locale || session.locale,
    processedTurnIds,
    turnResultCache,
  };

  let sessionWriteMs: number | null = null;
  if (deps.deferSessionBookkeeping) {
    const { clinicId, conversationId } = session;
    enqueueSessionWrite(
      callSessionId,
      async () => {
        await deps.sessionStore.update(callSessionId, sessionPatch);
      },
      (e) => {
        console.error(JSON.stringify({
          checkpoint: "VOICE_SESSION_BOOKKEEPING_FAILED",
          callSessionId,
          conversationId,
          clinicId,
          turnId: turnId || null,
          ...safeErrorMeta(e),
        }));
      }
    );
  } else {
    const startedAt = performance.now();
    await deps.sessionStore.update(callSessionId, sessionPatch);
    sessionWriteMs = elapsedMs(startedAt);
  }

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
    prefetchUsed: Boolean(usablePrefetch),
    historyFromPrefetch: Boolean(prefetchedHistory),
    sessionReadMs,
    historyMs,
    historyTurns: history.length,
    agentMs,
    sessionWrite: deps.deferSessionBookkeeping ? "DEFERRED" : "SYNC",
    ...(sessionWriteMs !== null ? { sessionWriteMs } : {}),
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

  // A deferred turn write must not land after (and overwrite) the terminal status.
  await awaitVoiceSessionWrites(callSessionId);
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

  const conversationFinalize = await finalizeVoiceConversationShell({
    adminDb: deps.adminDb,
    clinicId: session.clinicId,
    conversationId: session.conversationId,
    nowIso,
  });

  console.log(JSON.stringify({
    checkpoint: "VOICE_SESSION_ENDED",
    callSessionId,
    conversationId: session.conversationId,
    clinicId: session.clinicId,
    channel: "voice",
    status,
    conversationFinalize,
  }));

  return {
    ok: true,
    callSessionId,
    conversationId: session.conversationId,
    clinicId: session.clinicId,
    status,
  };
}
