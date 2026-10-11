/**
 * Voice Runtime Bridge (Phase 3, provider-independent).
 *
 *   calledDid → DID resolver → call binding → Phase 2 session
 *   final transcript → atomic turn id → processVoiceTurn → speech text + lifecycle policy
 *
 * A realtime transport is a thin adapter around this bridge. ClinicBridge Agent Core
 * stays the only business brain: the bridge never interprets reply text and derives
 * every policy decision from structured turn state.
 *
 * Tenant identity comes ONLY from the called DID. Firestore/session handles are injected
 * (see composeVoiceRuntime.ts) and never returned to the transport.
 *
 * Phase 4B shadow mode: the voice configuration is resolved once per new call and only
 * compared and logged; the call context, speech, greeting and turns never depend on it.
 *
 * In-process guarantees (per bridge instance): one business turn per call at a time, and a
 * started business turn always runs to completion — no cancellation path exists. Distributed
 * ownership across workers is out of scope here.
 */

import type {
  EndCallSessionInput,
  EndCallSessionResult,
  LeasedTurnAllocationResult,
  ProcessVoiceTurnOptions,
  VoiceErrorCode,
  VoiceErrorResult,
  VoiceTurnInput,
  VoiceTurnLeaseCheck,
  VoiceTurnLeaseErrorCode,
  VoiceTurnPrefetch,
  VoiceTurnResult,
} from "../types";
import {
  deriveCallBindingId,
  voiceErrorLogMeta,
  type AllocateTurnIdResult,
  type CallBinding,
  type CallBindingEndReason,
  type CallBindingErrorCode,
  type CallBindingResult,
  type GetOrCreateCallBindingInput,
  type GetOrCreateCallBindingResult,
} from "../telephony/callBinding";
import type {
  DidResolutionErrorCode,
  DidResolutionResult,
  ResolveClinicByDidInput,
} from "../telephony/didResolver";
import {
  INITIAL_SILENCE_STATE,
  VOICE_CALL_END_REASONS,
  fallbackForEndReason,
  isFailureEndReason,
  resolveBargeIn,
  resolveBufferedSpeechAfterTurn,
  resolveVoiceLifecyclePolicy,
  toSessionEndReason,
  type BargeInDecision,
  type SilenceState,
  type VoiceCallEndReason,
  type VoiceFallbackCategory,
  type VoiceLifecyclePolicy,
} from "../telephony/lifecyclePolicy";
import { renderVoiceSpeech, voiceSpeechPresentationLogFields } from "../telephony/renderVoiceSpeech";
import {
  isVoiceConfigTenantViolation,
  startVoiceConfigShadow,
  voiceConfigShadowLogFields,
  type VoiceConfigResolver,
  type VoiceConfigShadowOutcome,
} from "../config/shadow";

const MAX_TRANSCRIPT_LENGTH = 2_000;
const MAX_ENDED_CALLS_TRACKED = 1_000;
/** Upper bound on how long call start may wait for the shadow once the binding is ready. */
export const VOICE_CONFIG_SHADOW_TIMEOUT_MS = 500;

/* ── Injected capabilities ───────────────────────────────────────────── */

/** Existing server capabilities, bound to their dependencies (see composeVoiceRuntime.ts). */
export interface VoiceRuntimeCapabilities {
  resolveDid(input: ResolveClinicByDidInput): Promise<DidResolutionResult>;
  getOrCreateBinding(input: GetOrCreateCallBindingInput): Promise<GetOrCreateCallBindingResult>;
  allocateTurnId(input: { bindingId: string; clinicId: string }): Promise<AllocateTurnIdResult>;
  endBinding(input: { bindingId: string; clinicId: string; reason: CallBindingEndReason }): Promise<CallBindingResult>;
  failBinding(input: { bindingId: string; clinicId: string; failureCode: string }): Promise<CallBindingResult>;
  processTurn(input: VoiceTurnInput, options?: ProcessVoiceTurnOptions): Promise<VoiceTurnResult | VoiceErrorResult>;
  endSession(input: EndCallSessionInput): Promise<EndCallSessionResult | VoiceErrorResult>;
  /**
   * Read-only load of the next turn's session + history, started together with turn id
   * allocation. Must never reject; processTurn validates it against the session.
   */
  prefetchTurn?(input: { callSessionId: string; clinicId: string; conversationId: string }): Promise<VoiceTurnPrefetch>;
  /** Best-effort clinic runtime cache warm-up for the trusted clinicId; never blocks a turn. */
  warmClinicRuntime?(input: { clinicId: string }): Promise<void>;
  /**
   * Turn id allocation that verifies the runtime lease in the same transaction. Required
   * whenever processRuntimeTranscript receives a `lease`; without it such turns fail closed.
   */
  allocateTurnIdUnderLease?(input: {
    bindingId: string;
    clinicId: string;
    lease: VoiceTurnLeaseCheck;
  }): Promise<LeasedTurnAllocationResult>;
  /**
   * Phase 4B shadow mode: resolves the voice configuration once per new call for the trusted
   * clinicId. Observed and logged only; it controls no speech, language, greeting or routing.
   */
  resolveVoiceConfig?: VoiceConfigResolver;
}

export interface VoiceRuntimeBridgeOptions {
  capabilities: VoiceRuntimeCapabilities;
  policy?: Partial<VoiceLifecyclePolicy>;
  /** Defaults to VOICE_CONFIG_SHADOW_TIMEOUT_MS. */
  voiceConfigShadowTimeoutMs?: number;
}

/* ── Transport DTOs ──────────────────────────────────────────────────── */

export interface StartRuntimeCallInput {
  /** Stable provider call identifier. Never carries tenant identity. */
  externalCallKey: string;
  /** The dialed business number. The only source of tenant identity. */
  calledDid: string;
}

/** Transport-safe call context. Plain data; no persistence handles. */
export interface VoiceRuntimeCall {
  readonly bindingId: string;
  readonly clinicId: string;
  readonly didE164: string;
  readonly callSessionId: string;
  readonly conversationId: string;
  readonly locale?: string;
  /** Verbatim from the trusted DID mapping; undefined when not configured. */
  readonly greetingText?: string;
  readonly lifecycle: {
    readonly startedAtMs: number;
    readonly maxCallDurationMs: number;
    readonly silenceTimeoutMs: number;
    readonly maxSilenceReprompts: number;
    readonly silence: SilenceState;
    readonly bargeIn: BargeInDecision;
  };
}

export type VoiceRuntimeFailureCode =
  | "INVALID_INPUT"
  | "TENANT_RESOLUTION_FAILED"
  | "BINDING_FAILED"
  | "CALL_CONTEXT_INVALID"
  | "CALL_ALREADY_ENDED"
  | "TRANSCRIPT_EMPTY"
  | "TRANSCRIPT_INVALID"
  | "TURN_IN_FLIGHT"
  | "TURN_LIMIT_REACHED"
  | "AGENT_FAILED"
  | "SESSION_FAILED"
  | "INTERNAL_ERROR"
  /** The lease check fused into turn allocation failed (reasonCode: the lease code); no turn ran. */
  | "LEASE_REJECTED";

/** Machine-readable detail from ClinicBridge's own closed code sets (never raw error text). */
export type VoiceRuntimeReasonCode =
  | DidResolutionErrorCode
  | CallBindingErrorCode
  | VoiceErrorCode
  | VoiceTurnLeaseErrorCode
  | "VOICE_DID_TENANT_MISMATCH";

export interface VoiceRuntimeFailure {
  ok: false;
  code: VoiceRuntimeFailureCode;
  reasonCode?: VoiceRuntimeReasonCode;
  retryable: boolean;
  /** Set when the call should end; speak `fallback` (if any) first. */
  endReason?: VoiceCallEndReason;
  fallback?: VoiceFallbackCategory | null;
}

export type StartRuntimeCallResult = { ok: true; call: VoiceRuntimeCall; created: boolean } | VoiceRuntimeFailure;

/**
 * What the transport does with a final transcript:
 * PROCESS — it was processed as a business turn (see `turn`);
 * BUFFER — a business turn is in flight; hold it and resubmit after that turn completes;
 * DISCARD — drop it.
 */
export type RuntimeTranscriptAction = "PROCESS" | "BUFFER" | "DISCARD";

export type RuntimeTurnReply = Pick<VoiceTurnResult, "replyText" | "locale" | "appointmentState" | "appointmentId">;

export interface RuntimeTurnOutput extends RuntimeTurnReply {
  turnId: string;
  turnSeq: number;
  /** Speech-safe rendering of `replyText`; empty means nothing to speak. */
  speechText: string;
  appointmentCreated: boolean;
  escalationRequested: boolean;
  endCallSuggested: boolean;
  idempotentReplay: boolean;
  allowBargeIn: boolean;
  bargeIn: BargeInDecision;
  /**
   * Speech buffered while this turn was processing: SUBMIT it as the next transcript,
   * or DISCARD it because it predates an uninterruptible reply (confirmation summary).
   */
  bufferedSpeech: "SUBMIT" | "DISCARD";
}

export type ProcessRuntimeTranscriptResult =
  | { ok: true; action: "PROCESS"; turn: RuntimeTurnOutput }
  | (VoiceRuntimeFailure & { action: "BUFFER" | "DISCARD" });

export interface EndRuntimeCallInput {
  /** Omit when the call never started (e.g. tenant rejected): nothing is persisted then. */
  runtimeCall?: VoiceRuntimeCall | null;
  reason: VoiceCallEndReason;
}

export interface RuntimeCallEnded {
  ok: true;
  reason: VoiceCallEndReason;
  /** Actual terminal binding state ("NONE" when no call existed). Terminal states never change. */
  bindingStatus: "ENDED" | "FAILED" | "NONE";
  /** Reason sent to Phase 2 endCallSession, null when no session exists. */
  sessionEndReason: NonNullable<EndCallSessionInput["reason"]> | null;
  sessionEnded: boolean;
  /** True when this call was already ended by an earlier endRuntimeCall. */
  alreadyEnded: boolean;
  fallback: VoiceFallbackCategory | null;
}

export type EndRuntimeCallResult = RuntimeCallEnded | VoiceRuntimeFailure;

export interface ProcessRuntimeTranscriptInput {
  runtimeCall: VoiceRuntimeCall;
  transcript: string;
  /** When set, the turn id is allocated only if this lease verifies in the same transaction. */
  lease?: VoiceTurnLeaseCheck;
}

export interface VoiceRuntimeBridge {
  startRuntimeCall(input: StartRuntimeCallInput): Promise<StartRuntimeCallResult>;
  processRuntimeTranscript(input: ProcessRuntimeTranscriptInput): Promise<ProcessRuntimeTranscriptResult>;
  endRuntimeCall(input: EndRuntimeCallInput): Promise<EndRuntimeCallResult>;
  /** The call's shadow voice configuration snapshot (null when not resolved). Never re-resolved. */
  getVoiceConfigShadow(runtimeCall: VoiceRuntimeCall): VoiceConfigShadowOutcome | null;
}

/* ── Internals ───────────────────────────────────────────────────────── */

interface LocalCallState {
  call: VoiceRuntimeCall;
  voiceConfigShadow: VoiceConfigShadowOutcome | null;
  /** Seeded from the binding's turnSeq so a re-attached call is not reported as abandoned. */
  completedTurns: number;
  inFlight: Promise<void> | null;
  endRequested: boolean;
  ending: Promise<EndRuntimeCallResult> | null;
  ended: RuntimeCallEnded | null;
}

function failure(
  code: VoiceRuntimeFailureCode,
  extra: Partial<Omit<VoiceRuntimeFailure, "ok" | "code">> = {}
): VoiceRuntimeFailure {
  const endReason = extra.endReason;
  return {
    ok: false,
    code,
    retryable: extra.retryable ?? false,
    ...(extra.reasonCode ? { reasonCode: extra.reasonCode } : {}),
    ...(endReason ? { endReason, fallback: extra.fallback ?? fallbackForEndReason(endReason) } : {}),
  };
}

function transcriptFailure(
  action: "BUFFER" | "DISCARD",
  code: VoiceRuntimeFailureCode,
  extra: Partial<Omit<VoiceRuntimeFailure, "ok" | "code">> = {}
): ProcessRuntimeTranscriptResult {
  return { ...failure(code, extra), action };
}

function logRuntimeError(checkpoint: string, bindingId: string | null, err: unknown): void {
  console.error(
    JSON.stringify({ checkpoint, bindingId, ...voiceErrorLogMeta(err) })
  );
}

/** Durations and closed-set codes only. */
function logTurnTiming(fields: {
  bindingId: string;
  clinicId: string;
  callSessionId: string;
  turnSeq: number | null;
  outcome: string;
  prefetch: boolean;
  allocateMs: number;
  processTurnMs?: number;
  totalMs: number;
}): void {
  console.log(JSON.stringify({ checkpoint: "VOICE_RUNTIME_TURN_TIMING", ...fields }));
}

function bindingFailure(code: CallBindingErrorCode): VoiceRuntimeFailure {
  if (code === "CALL_BINDING_ENDED" || code === "CALL_BINDING_FAILED") {
    return failure("CALL_ALREADY_ENDED", { reasonCode: code });
  }
  if (code === "CALL_BINDING_TURN_LIMIT") {
    return failure("TURN_LIMIT_REACHED", { reasonCode: code, endReason: "RUNTIME_FAILURE" });
  }
  const retryable =
    code === "CALL_BINDING_INITIALIZING" ||
    code === "CALL_BINDING_LOOKUP_FAILED" ||
    code === "CALL_BINDING_CREATE_FAILED" ||
    code === "CALL_BINDING_UPDATE_FAILED" ||
    code === "CALL_BINDING_SESSION_START_FAILED";
  return failure("BINDING_FAILED", { reasonCode: code, retryable });
}

function phase2Failure(errorCode: VoiceErrorCode): VoiceRuntimeFailure {
  switch (errorCode) {
    case "SESSION_ENDED":
      return failure("CALL_ALREADY_ENDED", { reasonCode: errorCode });
    case "EMPTY_TRANSCRIPT":
      return failure("TRANSCRIPT_EMPTY", { reasonCode: errorCode });
    case "SESSION_NOT_FOUND":
    case "CLINIC_MISMATCH":
      return failure("SESSION_FAILED", { reasonCode: errorCode, endReason: "AGENT_FAILURE" });
    case "AGENT_ERROR":
    case "CLINIC_NOT_FOUND":
      return failure("AGENT_FAILED", { reasonCode: errorCode, endReason: "AGENT_FAILURE" });
  }
}

function normalizeTranscript(transcript: unknown): string | null {
  if (typeof transcript !== "string") return null;
  return transcript.replace(/\u0000/g, "").trim();
}

function sameCall(a: VoiceRuntimeCall, b: VoiceRuntimeCall): boolean {
  return (
    a.bindingId === b.bindingId &&
    a.clinicId === b.clinicId &&
    a.didE164 === b.didE164 &&
    a.callSessionId === b.callSessionId &&
    a.conversationId === b.conversationId
  );
}

function isEndReason(value: unknown): value is VoiceCallEndReason {
  return typeof value === "string" && (VOICE_CALL_END_REASONS as readonly string[]).includes(value);
}

/* ── Bridge ──────────────────────────────────────────────────────────── */

export function createVoiceRuntimeBridge(options: VoiceRuntimeBridgeOptions): VoiceRuntimeBridge {
  const caps = options.capabilities;
  const policy = resolveVoiceLifecyclePolicy(options.policy);
  const shadowTimeoutMs = options.voiceConfigShadowTimeoutMs ?? VOICE_CONFIG_SHADOW_TIMEOUT_MS;
  const calls = new Map<string, LocalCallState>();
  const pendingStarts = new Map<string, Promise<StartRuntimeCallResult>>();
  const endedOrder: string[] = [];

  function buildCall(
    binding: CallBinding,
    resolution: Extract<DidResolutionResult, { ok: true }>
  ): VoiceRuntimeCall {
    const startedAtMs = Date.parse(binding.startedAt);
    return Object.freeze({
      bindingId: binding.bindingId,
      clinicId: binding.clinicId,
      didE164: binding.didE164,
      callSessionId: binding.callSessionId,
      conversationId: binding.conversationId,
      ...(resolution.defaultLocale ? { locale: resolution.defaultLocale } : {}),
      ...(resolution.greetingText ? { greetingText: resolution.greetingText } : {}),
      lifecycle: Object.freeze({
        startedAtMs,
        maxCallDurationMs: policy.maxCallDurationMs,
        silenceTimeoutMs: policy.silenceTimeoutMs,
        maxSilenceReprompts: policy.maxSilenceReprompts,
        silence: INITIAL_SILENCE_STATE,
        bargeIn: resolveBargeIn(null, policy),
      }),
    });
  }

  /** Trusted local state for a transport-supplied context; forged/unknown contexts are rejected. */
  function lookup(runtimeCall: unknown): LocalCallState | null {
    if (typeof runtimeCall !== "object" || runtimeCall === null) return null;
    const bindingId = (runtimeCall as { bindingId?: unknown }).bindingId;
    if (typeof bindingId !== "string") return null;
    const state = calls.get(bindingId);
    if (!state || !sameCall(state.call, runtimeCall as VoiceRuntimeCall)) return null;
    return state;
  }

  function rememberEnded(bindingId: string): void {
    endedOrder.push(bindingId);
    while (endedOrder.length > MAX_ENDED_CALLS_TRACKED) {
      const evicted = endedOrder.shift();
      if (evicted) calls.delete(evicted);
    }
  }

  /** The binding was created for a tenant the DID no longer maps to: fail it, never continue. */
  async function rejectTenantViolation(binding: CallBinding): Promise<VoiceRuntimeFailure> {
    const { bindingId, clinicId, callSessionId } = binding;
    console.error(JSON.stringify({
      checkpoint: "VOICE_RUNTIME_TENANT_MISMATCH_REJECTED",
      bindingId,
      clinicId,
      reasonCode: "VOICE_DID_TENANT_MISMATCH",
    }));
    try {
      await caps.failBinding({ bindingId, clinicId, failureCode: "TENANT_REJECTED" });
      await caps.endSession({ callSessionId, clinicId, reason: "failed" });
    } catch (err) {
      logRuntimeError("VOICE_RUNTIME_TENANT_REJECT_FAILED", bindingId, err);
    }
    return failure("TENANT_RESOLUTION_FAILED", {
      reasonCode: "VOICE_DID_TENANT_MISMATCH",
      endReason: "TENANT_REJECTED",
    });
  }

  async function doStart(input: StartRuntimeCallInput, bindingId: string): Promise<StartRuntimeCallResult> {
    // Only the called DID reaches the resolver; the binding gets the resolver's clinicId.
    const resolution = await caps.resolveDid({ calledDid: input.calledDid });
    if (!resolution.ok) {
      return failure("TENANT_RESOLUTION_FAILED", {
        reasonCode: resolution.code,
        retryable: resolution.code === "DID_LOOKUP_FAILED",
        endReason: "TENANT_REJECTED",
      });
    }

    // Resolved once per call, alongside binding creation; a re-attached call keeps its snapshot.
    const shadow =
      caps.resolveVoiceConfig && !calls.has(bindingId)
        ? startVoiceConfigShadow(caps.resolveVoiceConfig, { clinicId: resolution.clinicId, calledDid: resolution.didE164 })
        : null;

    const bound = await caps.getOrCreateBinding({
      externalCallKey: input.externalCallKey,
      clinicId: resolution.clinicId,
      didE164: resolution.didE164,
      ...(resolution.defaultLocale ? { locale: resolution.defaultLocale } : {}),
    });
    if (!bound.ok) return bindingFailure(bound.code);

    const binding = bound.binding;
    if (
      binding.bindingId !== bindingId ||
      binding.clinicId !== resolution.clinicId ||
      binding.didE164 !== resolution.didE164 ||
      binding.status !== "ACTIVE"
    ) {
      return failure("BINDING_FAILED", { reasonCode: "CALL_BINDING_TENANT_CONFLICT" });
    }

    const existing = calls.get(bindingId);
    if (existing) {
      if (existing.endRequested) return failure("CALL_ALREADY_ENDED");
      const next = buildCall(binding, resolution);
      if (!sameCall(existing.call, next)) return failure("BINDING_FAILED", { reasonCode: "CALL_BINDING_TENANT_CONFLICT" });
      return { ok: true, call: existing.call, created: false };
    }

    let voiceConfigShadow: VoiceConfigShadowOutcome | null = null;
    if (shadow) {
      const boundAt = performance.now();
      const settled = await shadow.settle(shadowTimeoutMs);
      voiceConfigShadow = settled.outcome;
      console.log(JSON.stringify({
        checkpoint: "VOICE_CONFIG_SHADOW",
        bindingId,
        clinicId: binding.clinicId,
        ...voiceConfigShadowLogFields(settled.outcome),
        resolveMs: settled.resolveMs,
        startWaitMs: Math.round(performance.now() - boundAt),
      }));
      if (isVoiceConfigTenantViolation(settled.outcome)) return rejectTenantViolation(binding);
    }

    const call = buildCall(binding, resolution);
    calls.set(bindingId, {
      call,
      voiceConfigShadow,
      completedTurns: binding.turnSeq,
      inFlight: null,
      endRequested: false,
      ending: null,
      ended: null,
    });
    warmClinic(call);
    return { ok: true, call, created: bound.created };
  }

  async function startRuntimeCall(input: StartRuntimeCallInput): Promise<StartRuntimeCallResult> {
    const externalCallKey = input?.externalCallKey;
    const bindingId = typeof externalCallKey === "string" ? deriveCallBindingId(externalCallKey) : null;
    if (!bindingId || typeof input.calledDid !== "string") return failure("INVALID_INPUT");

    const pending = pendingStarts.get(bindingId);
    if (pending) return pending;

    const started = doStart({ externalCallKey, calledDid: input.calledDid }, bindingId).catch((err) => {
      logRuntimeError("VOICE_RUNTIME_START_FAILED", bindingId, err);
      return failure("INTERNAL_ERROR", { retryable: true });
    });
    pendingStarts.set(bindingId, started);
    try {
      return await started;
    } finally {
      pendingStarts.delete(bindingId);
    }
  }

  /** Fire-and-forget; the clinicId is the binding's DID-derived tenant. */
  function warmClinic(call: VoiceRuntimeCall): void {
    if (!caps.warmClinicRuntime) return;
    caps.warmClinicRuntime({ clinicId: call.clinicId }).catch((err) => {
      logRuntimeError("VOICE_RUNTIME_WARM_FAILED", call.bindingId, err);
    });
  }

  function allocate(
    call: VoiceRuntimeCall,
    lease: VoiceTurnLeaseCheck | undefined
  ): Promise<LeasedTurnAllocationResult> {
    const { bindingId, clinicId } = call;
    if (!lease) return caps.allocateTurnId({ bindingId, clinicId });
    // A requested lease check is never skipped: without the fused capability the turn fails closed.
    if (!caps.allocateTurnIdUnderLease) {
      return Promise.resolve({ ok: false, code: "TURN_LEASE_REJECTED", leaseCode: "RUNTIME_LEASE_INVALID_STATE" });
    }
    return caps.allocateTurnIdUnderLease({ bindingId, clinicId, lease });
  }

  async function runTurn(
    state: LocalCallState,
    text: string,
    lease: VoiceTurnLeaseCheck | undefined
  ): Promise<ProcessRuntimeTranscriptResult> {
    const { bindingId, clinicId, callSessionId, conversationId } = state.call;
    const startedAt = performance.now();
    const since = (t: number): number => Math.round(performance.now() - t);

    // Reads only, so they may overlap the turn id transaction; the turn itself still starts
    // strictly after allocation (and, when requested, lease verification) succeeds.
    const prefetch = caps.prefetchTurn?.({ callSessionId, clinicId, conversationId });
    const allocated = await allocate(state.call, lease);
    const allocateMs = since(startedAt);
    if (!allocated.ok) {
      const leaseRejected = allocated.code === "TURN_LEASE_REJECTED";
      logTurnTiming({
        bindingId, clinicId, callSessionId, turnSeq: null,
        outcome: leaseRejected ? "LEASE_REJECTED" : "ALLOCATE_FAILED",
        prefetch: Boolean(prefetch), allocateMs, totalMs: since(startedAt),
      });
      if (allocated.code === "TURN_LEASE_REJECTED") {
        return transcriptFailure("DISCARD", "LEASE_REJECTED", { reasonCode: allocated.leaseCode });
      }
      return { ...bindingFailure(allocated.code), action: "DISCARD" };
    }

    // From here the business turn runs to completion: there is no abort, timeout or cancellation hook.
    const turnInput: VoiceTurnInput = { callSessionId, clinicId, text, turnId: allocated.turnId };
    const processStartedAt = performance.now();
    let result: VoiceTurnResult | VoiceErrorResult;
    try {
      result = prefetch ? await caps.processTurn(turnInput, { prefetch }) : await caps.processTurn(turnInput);
    } catch (err) {
      logRuntimeError("VOICE_RUNTIME_TURN_THREW", bindingId, err);
      return transcriptFailure("DISCARD", "AGENT_FAILED", { endReason: "AGENT_FAILURE" });
    }
    logTurnTiming({
      bindingId, clinicId, callSessionId, turnSeq: allocated.turnSeq,
      outcome: result.ok ? "OK" : result.errorCode,
      prefetch: Boolean(prefetch), allocateMs, processTurnMs: since(processStartedAt), totalMs: since(startedAt),
    });
    if (!result.ok) return { ...phase2Failure(result.errorCode), action: "DISCARD" };
    warmClinic(state.call);

    if (result.clinicId !== clinicId || result.callSessionId !== callSessionId) {
      return transcriptFailure("DISCARD", "SESSION_FAILED", {
        reasonCode: "CLINIC_MISMATCH",
        endReason: "AGENT_FAILURE",
      });
    }

    state.completedTurns += 1;
    const bargeIn = resolveBargeIn(result, policy);
    const presented = renderVoiceSpeech({ text: result.replyText, locale: result.locale });
    console.log(
      JSON.stringify({
        checkpoint: "VOICE_SPEECH_PRESENTATION",
        bindingId,
        clinicId,
        turnSeq: allocated.turnSeq,
        ...voiceSpeechPresentationLogFields(presented.telemetry),
      })
    );
    const turn: RuntimeTurnOutput = {
      turnId: allocated.turnId,
      turnSeq: allocated.turnSeq,
      replyText: result.replyText,
      speechText: presented.spokenText,
      appointmentCreated: Boolean(result.appointmentCreated),
      escalationRequested: Boolean(result.escalationRequested),
      endCallSuggested: Boolean(result.endCallSuggested),
      idempotentReplay: Boolean(result.idempotentReplay),
      allowBargeIn: bargeIn.allowInterruptions,
      bargeIn,
      bufferedSpeech: resolveBufferedSpeechAfterTurn(bargeIn),
      ...(result.locale ? { locale: result.locale } : {}),
      ...(result.appointmentState ? { appointmentState: result.appointmentState } : {}),
      ...(result.appointmentId ? { appointmentId: result.appointmentId } : {}),
    };
    return { ok: true, action: "PROCESS", turn };
  }

  async function processRuntimeTranscript(input: ProcessRuntimeTranscriptInput): Promise<ProcessRuntimeTranscriptResult> {
    // Everything up to claiming the in-flight slot is synchronous, so concurrent
    // transcripts for one call cannot both pass the check.
    const state = lookup(input?.runtimeCall);
    if (!state) return transcriptFailure("DISCARD", "CALL_CONTEXT_INVALID");
    if (state.endRequested) return transcriptFailure("DISCARD", "CALL_ALREADY_ENDED");

    const text = normalizeTranscript(input.transcript);
    if (text === null || text.length > MAX_TRANSCRIPT_LENGTH) {
      return transcriptFailure("DISCARD", "TRANSCRIPT_INVALID");
    }
    if (!text) return transcriptFailure("DISCARD", "TRANSCRIPT_EMPTY");
    if (state.inFlight) return transcriptFailure("BUFFER", "TURN_IN_FLIGHT", { retryable: true });

    let release: () => void = () => {};
    state.inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      return await runTurn(state, text, input.lease);
    } catch (err) {
      logRuntimeError("VOICE_RUNTIME_TURN_FAILED", state.call.bindingId, err);
      return transcriptFailure("DISCARD", "INTERNAL_ERROR", { endReason: "RUNTIME_FAILURE" });
    } finally {
      state.inFlight = null;
      release();
    }
  }

  async function finishEnd(state: LocalCallState, reason: VoiceCallEndReason): Promise<EndRuntimeCallResult> {
    // Never abort an in-flight business turn (it may be creating an appointment): wait for it.
    if (state.inFlight) await state.inFlight;

    const { bindingId, clinicId, callSessionId } = state.call;
    const isFailure = isFailureEndReason(reason) || reason === "TENANT_REJECTED";
    const transitioned = isFailure
      ? await caps.failBinding({ bindingId, clinicId, failureCode: reason })
      : await caps.endBinding({
          bindingId,
          clinicId,
          reason: toSessionEndReason(reason, state.completedTurns) === "completed" ? "completed" : "abandoned",
        });
    if (!transitioned.ok) return bindingFailure(transitioned.code);

    // The binding's terminal state is immutable; the session follows it so FAILED and
    // ENDED never overwrite each other.
    const binding = transitioned.binding;
    if (binding.status !== "ENDED" && binding.status !== "FAILED") {
      return failure("BINDING_FAILED", { reasonCode: "CALL_BINDING_UPDATE_FAILED", retryable: true });
    }
    const sessionEndReason: NonNullable<EndCallSessionInput["reason"]> =
      binding.status === "FAILED" ? "failed" : (binding.endReason ?? "completed");

    let sessionEnded = false;
    try {
      const ended = await caps.endSession({ callSessionId, clinicId, reason: sessionEndReason });
      sessionEnded = ended.ok;
    } catch (err) {
      logRuntimeError("VOICE_RUNTIME_SESSION_END_FAILED", bindingId, err);
    }

    return {
      ok: true,
      reason,
      bindingStatus: binding.status,
      sessionEndReason,
      sessionEnded,
      alreadyEnded: false,
      fallback: fallbackForEndReason(reason),
    };
  }

  async function endRuntimeCall(input: EndRuntimeCallInput): Promise<EndRuntimeCallResult> {
    const reason = input?.reason;
    if (!isEndReason(reason)) return failure("INVALID_INPUT");

    if (input.runtimeCall === undefined || input.runtimeCall === null) {
      return {
        ok: true,
        reason,
        bindingStatus: "NONE",
        sessionEndReason: null,
        sessionEnded: false,
        alreadyEnded: false,
        fallback: fallbackForEndReason(reason),
      };
    }

    const state = lookup(input.runtimeCall);
    if (!state) return failure("CALL_CONTEXT_INVALID");
    if (state.ended) return { ...state.ended, alreadyEnded: true };
    if (state.ending) return state.ending;

    state.endRequested = true;
    const ending = finishEnd(state, reason)
      .catch((err): EndRuntimeCallResult => {
        logRuntimeError("VOICE_RUNTIME_END_FAILED", state.call.bindingId, err);
        return failure("INTERNAL_ERROR", { retryable: true });
      })
      .then((result) => {
        state.ending = null;
        if (result.ok) {
          state.ended = result;
          rememberEnded(state.call.bindingId);
        }
        return result;
      });
    state.ending = ending;
    return ending;
  }

  function getVoiceConfigShadow(runtimeCall: VoiceRuntimeCall): VoiceConfigShadowOutcome | null {
    return lookup(runtimeCall)?.voiceConfigShadow ?? null;
  }

  return { startRuntimeCall, processRuntimeTranscript, endRuntimeCall, getVoiceConfigShadow };
}
