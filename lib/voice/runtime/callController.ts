/**
 * Voice call controller (Phase 3, provider-independent).
 *
 * Orchestrates ONE already-started runtime call between a realtime transport worker and the
 * Voice Runtime Bridge:
 *
 *   start()            → acquire the runtime lease (bounded retry while another worker holds it)
 *   ACTIVE             → lease heartbeat, max-duration timer
 *   submitTranscript() → strong lease verify → bridge.processRuntimeTranscript (single flight)
 *   finish(reason)     → wait for the in-flight turn → bridge.endRuntimeCall → release lease
 *
 * Invariants:
 * - At most one business turn in flight; a started turn is never cancelled (it may create an
 *   appointment). Speech from a turn that settles after ending/ownership loss is suppressed.
 * - At most one pending final transcript; a newer one replaces it. Transcripts are never
 *   concatenated, a failed transcript is never resubmitted, and turn ids come from the bridge.
 * - After definitive ownership loss the controller never mutates the call lifecycle: another
 *   worker may own the call now.
 * - The lease token stays inside this module: never in snapshots, events or logs.
 * - A turn with `endCallSuggested` only requests AGENT_COMPLETED; the worker plays the final
 *   reply and then calls finish(endReasonAfterFinalReply(playback)). No auto-finish.
 *
 * No transport, speech provider, credential or persistence knowledge lives here.
 */

import {
  RUNTIME_LEASE_RECOMMENDED_RENEW_INTERVAL_MS,
  acquireRuntimeLease,
  releaseRuntimeLease,
  renewRuntimeLease,
  verifyRuntimeLease,
  type AcquireRuntimeLeaseResult,
  type ReleaseRuntimeLeaseResult,
  type RenewRuntimeLeaseResult,
  type RuntimeLeaseDeps,
  type RuntimeLeaseErrorCode,
  type RuntimeLeaseProof,
  type VerifyRuntimeLeaseResult,
} from "./runtimeLease";
import type {
  EndRuntimeCallResult,
  ProcessRuntimeTranscriptResult,
  RuntimeCallEnded,
  VoiceRuntimeBridge,
  VoiceRuntimeCall,
  VoiceRuntimeFailureCode,
  VoiceRuntimeReasonCode,
} from "./voiceRuntimeBridge";
import {
  VOICE_CALL_END_REASONS,
  evaluateCallDuration,
  fallbackForEndReason,
  resolveVoiceLifecyclePolicy,
  type VoiceCallEndReason,
  type VoiceFallbackCategory,
} from "../telephony/lifecyclePolicy";

/* ── Defaults ────────────────────────────────────────────────────────── */

/** A business turn only starts with at least this much lease time left (server clock). */
export const CALL_CONTROLLER_DEFAULT_VERIFY_MIN_REMAINING_MS = 5_000;

/**
 * Retry while another worker still holds the lease (transport re-dispatch after a worker crash):
 * 18 × 2 s covers the default 30 s lease expiry.
 */
export const CALL_CONTROLLER_DEFAULT_ACQUIRE_RETRY: Readonly<CallControllerAcquireRetry> = Object.freeze({
  maxAttempts: 18,
  delayMs: 2_000,
});

export const CALL_CONTROLLER_DEFAULT_RELEASE_MAX_ATTEMPTS = 2;

/** Renew failures that may succeed on the next heartbeat; every other code is definitive. */
const TRANSIENT_LEASE_CODES: ReadonlySet<RuntimeLeaseErrorCode> = new Set([
  "RUNTIME_LEASE_LOOKUP_FAILED",
  "RUNTIME_LEASE_UPDATE_FAILED",
]);

const ACQUIRE_RETRYABLE_CODES: ReadonlySet<RuntimeLeaseErrorCode> = new Set([
  "RUNTIME_LEASE_HELD",
  ...TRANSIENT_LEASE_CODES,
]);

/** Bridge failures without an end reason that still mean this call can no longer run turns. */
const CALL_UNAVAILABLE_CODES: ReadonlySet<VoiceRuntimeFailureCode> = new Set([
  "CALL_ALREADY_ENDED",
  "CALL_CONTEXT_INVALID",
]);

/* ── Public types ────────────────────────────────────────────────────── */

export type CallControllerState =
  | "NEW"
  | "STARTING"
  | "ACTIVE"
  | "ENDING"
  | "ENDED"
  | "OWNERSHIP_LOST"
  | "FAILED";

const TRANSITIONS: Readonly<Record<CallControllerState, readonly CallControllerState[]>> = Object.freeze({
  NEW: ["STARTING", "ENDED"],
  STARTING: ["ACTIVE", "FAILED", "ENDING"],
  ACTIVE: ["ENDING", "OWNERSHIP_LOST"],
  ENDING: ["ENDED", "OWNERSHIP_LOST"],
  ENDED: [],
  OWNERSHIP_LOST: [],
  FAILED: [],
});

export interface CallControllerAcquireRetry {
  maxAttempts: number;
  delayMs: number;
}

/** The canonical runtimeLease operations, bound to their dependencies. */
export interface RuntimeLeaseOperations {
  acquire(input: { bindingId: string; clinicId: string; ownerId: string }): Promise<AcquireRuntimeLeaseResult>;
  renew(proof: RuntimeLeaseProof): Promise<RenewRuntimeLeaseResult>;
  verify(proof: RuntimeLeaseProof, options: { minRemainingMs: number }): Promise<VerifyRuntimeLeaseResult>;
  release(proof: RuntimeLeaseProof): Promise<ReleaseRuntimeLeaseResult>;
}

export function createRuntimeLeaseOperations(deps: RuntimeLeaseDeps): RuntimeLeaseOperations {
  return {
    acquire: (input) => acquireRuntimeLease(deps, input),
    renew: (proof) => renewRuntimeLease(deps, proof),
    verify: (proof, options) => verifyRuntimeLease(deps, proof, options),
    release: (proof) => releaseRuntimeLease(deps, proof),
  };
}

export type CallControllerBridge = Pick<VoiceRuntimeBridge, "processRuntimeTranscript" | "endRuntimeCall">;

export interface CallControllerClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** Operational fields only: never transcript/reply/speech text, caller data or lease tokens. */
export interface CallControllerLogEntry {
  checkpoint: string;
  state: CallControllerState;
  bindingId: string;
  clinicId: string;
  callSessionId: string;
  conversationId: string;
  leaseGeneration?: number;
  turnSeq?: number;
  code?: string;
  reason?: VoiceCallEndReason;
  /** Strong lease verification before the business turn. */
  verifyMs?: number;
  /** Bridge turn: turn id allocation + Agent Core turn + bookkeeping. */
  bridgeMs?: number;
}

export type CallControllerLogger = (entry: CallControllerLogEntry) => void;

export type TurnOutcome =
  /** Deliverable reply. `speechText` may be empty (nothing to speak). */
  | {
      kind: "SPEAK";
      turnId: string;
      turnSeq: number;
      speechText: string;
      allowBargeIn: boolean;
      endCallSuggested: boolean;
      /**
       * AGENT_COMPLETED when Agent Core ended the conversation: play `speechText` fully, then
       * finish(endReasonAfterFinalReply(playback)). The controller never finishes by itself.
       */
      endAfterPlayback: "AGENT_COMPLETED" | null;
    }
  /** The turn settled after ending or ownership loss: nothing may be spoken. */
  | { kind: "SUPPRESSED"; reason: "OWNERSHIP_LOST" | "CALL_ENDING"; turnSeq?: number }
  /** The call must end; the controller has started finishing with `endReason`. */
  | {
      kind: "FAILED";
      code: VoiceRuntimeFailureCode;
      reasonCode?: VoiceRuntimeReasonCode;
      endReason: VoiceCallEndReason;
      fallback: VoiceFallbackCategory | null;
    }
  /** No business turn ran for this transcript; the call continues. */
  | { kind: "NOT_PROCESSED"; code: VoiceRuntimeFailureCode | "LEASE_UNVERIFIED" | "CALL_ENDING" | "BRIDGE_UNEXPECTED_BUFFER" };

export type CallControllerEvent =
  | { type: "TURN_OUTCOME"; outcome: TurnOutcome }
  /** Controller-initiated end (agent failure, max duration): speak `fallback` if any, then disconnect. */
  | { type: "CALL_END_REQUESTED"; endReason: VoiceCallEndReason; fallback: VoiceFallbackCategory | null }
  /** Another worker may own the call: stop speaking and shut down without ending the call. */
  | { type: "OWNERSHIP_LOST"; code: RuntimeLeaseErrorCode }
  | { type: "FINISHED"; result: CallFinishResult };

export type TranscriptAcceptance =
  | { accepted: true; disposition: "STARTED" | "BUFFERED" | "REPLACED_PENDING" }
  | { accepted: false; reason: "NOT_ACTIVE" | "ENDING" | "ENDED" | "OWNERSHIP_LOST" | "FAILED" };

export type CallControllerStartResult =
  | { ok: true; leaseGeneration: number; takeover: boolean; acquireAttempts: number }
  | {
      ok: false;
      code: RuntimeLeaseErrorCode | "INVALID_STATE" | "LEASE_MISMATCH" | "ACQUIRE_RETRY_EXHAUSTED" | "FINISH_REQUESTED";
      acquireAttempts: number;
      lastLeaseCode?: RuntimeLeaseErrorCode;
    };

export type CallFinishDisposition =
  /** endRuntimeCall attempted and the lease released (best effort). */
  | "ENDED"
  /** This controller never owned the call: nothing persisted. */
  | "ENDED_WITHOUT_OWNERSHIP"
  /** Ownership was lost: local cleanup only, the call lifecycle was not touched. */
  | "OWNERSHIP_LOST"
  | "START_FAILED";

export type EndRuntimeCallOutcome =
  | { attempted: false }
  | {
      attempted: true;
      ok: true;
      bindingStatus: RuntimeCallEnded["bindingStatus"];
      alreadyEnded: boolean;
      fallback: VoiceFallbackCategory | null;
    }
  | { attempted: true; ok: false; code: VoiceRuntimeFailureCode; reasonCode?: VoiceRuntimeReasonCode };

export type LeaseReleaseOutcome =
  | { attempted: false }
  | { attempted: true; ok: true; attempts: number; alreadyReleased: boolean }
  | { attempted: true; ok: false; attempts: number; code: RuntimeLeaseErrorCode };

export interface CallFinishResult {
  reason: VoiceCallEndReason;
  disposition: CallFinishDisposition;
  endRuntimeCall: EndRuntimeCallOutcome;
  leaseRelease: LeaseReleaseOutcome;
}

export interface CallControllerSnapshot {
  state: CallControllerState;
  bindingId: string;
  clinicId: string;
  callSessionId: string;
  conversationId: string;
  leaseGeneration: number | null;
  leaseExpiresAt: string | null;
  turnInFlight: boolean;
  pendingTranscript: boolean;
  processedTurns: number;
  lastTurnSeq: number | null;
  consecutiveRenewFailures: number;
  ownershipLostCode: RuntimeLeaseErrorCode | null;
  finishReason: VoiceCallEndReason | null;
  /** The last delivered turn requested AGENT_COMPLETED after its playback. */
  agentCompletionRequested: boolean;
}

export interface CallControllerOptions {
  runtimeCall: VoiceRuntimeCall;
  /** Worker/job identity for the lease; never derived from caller data. */
  ownerId: string;
  bridge: CallControllerBridge;
  lease: RuntimeLeaseOperations;
  clock?: CallControllerClock;
  logger?: CallControllerLogger;
  onEvent?: (event: CallControllerEvent) => void;
  /** Capped at a third of the acquired lease duration. */
  renewIntervalMs?: number;
  verifyMinRemainingMs?: number;
  /**
   * Default false. When true, the per-turn lease verification (same checks, same
   * minRemainingMs) runs inside the bridge's turn id transaction instead of a separate
   * transaction before it. Requires a bridge composed with `allocateTurnIdUnderLease`.
   */
  verifyLeaseInTurnAllocation?: boolean;
  acquireRetry?: CallControllerAcquireRetry;
  releaseMaxAttempts?: number;
}

export interface CallController {
  start(): Promise<CallControllerStartResult>;
  /** Final caller transcript. Never throws; the acceptance is synchronous. */
  submitTranscript(transcript: string): TranscriptAcceptance;
  /** Exactly-once: every call returns the same promise. Never rejects. */
  finish(reason: VoiceCallEndReason): Promise<CallFinishResult>;
  snapshot(): CallControllerSnapshot;
  /** Resolves once no business turn is in flight or pending. */
  whenIdle(): Promise<void>;
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

const SYSTEM_CLOCK: CallControllerClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function positiveInteger(name: string, value: number): number {
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer`);
  return value;
}

function nonNegativeInteger(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer`);
  return value;
}

function isCanonicalEndReason(value: unknown): value is VoiceCallEndReason {
  return typeof value === "string" && (VOICE_CALL_END_REASONS as readonly string[]).includes(value);
}

function leaseFailure(code: RuntimeLeaseErrorCode): { ok: false; code: RuntimeLeaseErrorCode } {
  return { ok: false, code };
}

const RUNTIME_LEASE_ERROR_CODES: Readonly<Record<RuntimeLeaseErrorCode, true>> = Object.freeze({
  RUNTIME_LEASE_INVALID_INPUT: true,
  RUNTIME_LEASE_HELD: true,
  RUNTIME_LEASE_NOT_FOUND: true,
  RUNTIME_LEASE_TENANT_CONFLICT: true,
  RUNTIME_LEASE_OWNER_MISMATCH: true,
  RUNTIME_LEASE_TOKEN_MISMATCH: true,
  RUNTIME_LEASE_GENERATION_MISMATCH: true,
  RUNTIME_LEASE_EXPIRED: true,
  RUNTIME_LEASE_INVALID_STATE: true,
  RUNTIME_LEASE_LOOKUP_FAILED: true,
  RUNTIME_LEASE_UPDATE_FAILED: true,
});

function isRuntimeLeaseErrorCode(value: unknown): value is RuntimeLeaseErrorCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(RUNTIME_LEASE_ERROR_CODES, value);
}

const NOT_ATTEMPTED = Object.freeze({ attempted: false as const });

/* ── Controller ──────────────────────────────────────────────────────── */

export function createCallController(options: CallControllerOptions): CallController {
  const call = options.runtimeCall;
  const { bridge, lease, ownerId } = options;
  const clock = options.clock ?? SYSTEM_CLOCK;
  const renewIntervalMs = positiveInteger(
    "renewIntervalMs",
    options.renewIntervalMs ?? RUNTIME_LEASE_RECOMMENDED_RENEW_INTERVAL_MS
  );
  const verifyMinRemainingMs = nonNegativeInteger(
    "verifyMinRemainingMs",
    options.verifyMinRemainingMs ?? CALL_CONTROLLER_DEFAULT_VERIFY_MIN_REMAINING_MS
  );
  const verifyLeaseInTurnAllocation = options.verifyLeaseInTurnAllocation === true;
  const acquireRetry = options.acquireRetry ?? CALL_CONTROLLER_DEFAULT_ACQUIRE_RETRY;
  positiveInteger("acquireRetry.maxAttempts", acquireRetry.maxAttempts);
  nonNegativeInteger("acquireRetry.delayMs", acquireRetry.delayMs);
  const releaseMaxAttempts = positiveInteger(
    "releaseMaxAttempts",
    options.releaseMaxAttempts ?? CALL_CONTROLLER_DEFAULT_RELEASE_MAX_ATTEMPTS
  );
  // Same duration the bridge put on the call; resolveVoiceLifecyclePolicy rejects invalid values.
  const durationPolicy = resolveVoiceLifecyclePolicy({ maxCallDurationMs: call.lifecycle.maxCallDurationMs });

  let state: CallControllerState = "NEW";
  let proof: RuntimeLeaseProof | null = null;
  let leaseGeneration: number | null = null;
  let leaseExpiresAt: string | null = null;
  let effectiveRenewMs = renewIntervalMs;

  let startPromise: Promise<CallControllerStartResult> | null = null;
  let acquireDelay: { handle: unknown; resolve: () => void } | null = null;
  let heartbeatTimer: unknown = null;
  let heartbeatInFlight: Promise<void> | null = null;
  let durationTimer: unknown = null;

  let turnLoop: Promise<void> | null = null;
  let pending: string | null = null;
  let finishPromise: Promise<CallFinishResult> | null = null;

  let finishReason: VoiceCallEndReason | null = null;
  let ownershipLostCode: RuntimeLeaseErrorCode | null = null;
  let processedTurns = 0;
  let lastTurnSeq: number | null = null;
  let consecutiveRenewFailures = 0;
  let agentCompletionRequested = false;

  /* ── Telemetry / events ─────────────────────────────────────────── */

  function log(checkpoint: string, extra: Omit<Partial<CallControllerLogEntry>, "checkpoint" | "state"> = {}): void {
    if (!options.logger) return;
    const entry: CallControllerLogEntry = {
      checkpoint,
      state,
      bindingId: call.bindingId,
      clinicId: call.clinicId,
      callSessionId: call.callSessionId,
      conversationId: call.conversationId,
      ...(leaseGeneration !== null ? { leaseGeneration } : {}),
      ...(extra.turnSeq !== undefined ? { turnSeq: extra.turnSeq } : {}),
      ...(extra.code !== undefined ? { code: extra.code } : {}),
      ...(extra.reason !== undefined ? { reason: extra.reason } : {}),
      ...(extra.verifyMs !== undefined ? { verifyMs: extra.verifyMs } : {}),
      ...(extra.bridgeMs !== undefined ? { bridgeMs: extra.bridgeMs } : {}),
    };
    try {
      options.logger(entry);
    } catch {
      // Telemetry must never affect call handling.
    }
  }

  function emit(event: CallControllerEvent): void {
    if (!options.onEvent) return;
    try {
      options.onEvent(event);
    } catch {
      log("VOICE_CALL_CONTROLLER_EVENT_SINK_FAILED", { code: event.type });
    }
  }

  function emitOutcome(outcome: TurnOutcome): void {
    emit({ type: "TURN_OUTCOME", outcome });
  }

  function transition(to: CallControllerState): boolean {
    const from = state;
    if (!TRANSITIONS[from].includes(to)) {
      log("VOICE_CALL_CONTROLLER_INVALID_TRANSITION", { code: `${from}->${to}` });
      return false;
    }
    state = to;
    log("VOICE_CALL_CONTROLLER_STATE", { code: `${from}->${to}` });
    return true;
  }

  /* ── Timers ─────────────────────────────────────────────────────── */

  function clearHeartbeat(): void {
    if (heartbeatTimer !== null) clock.clearTimeout(heartbeatTimer);
    heartbeatTimer = null;
  }

  function clearDurationTimer(): void {
    if (durationTimer !== null) clock.clearTimeout(durationTimer);
    durationTimer = null;
  }

  function cancelAcquireDelay(): void {
    if (!acquireDelay) return;
    clock.clearTimeout(acquireDelay.handle);
    const { resolve } = acquireDelay;
    acquireDelay = null;
    resolve();
  }

  function waitAcquireDelay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const handle = clock.setTimeout(() => {
        acquireDelay = null;
        resolve();
      }, ms);
      acquireDelay = { handle, resolve };
    });
  }

  function scheduleHeartbeat(): void {
    if (state !== "ACTIVE") return;
    heartbeatTimer = clock.setTimeout(() => {
      heartbeatTimer = null;
      heartbeatInFlight = heartbeat().finally(() => {
        heartbeatInFlight = null;
      });
    }, effectiveRenewMs);
  }

  async function heartbeat(): Promise<void> {
    const current = proof;
    if (state !== "ACTIVE" || !current) return;
    let result: RenewRuntimeLeaseResult;
    try {
      result = await lease.renew(current);
    } catch {
      result = leaseFailure("RUNTIME_LEASE_UPDATE_FAILED");
    }
    if (result.ok) {
      if (result.generation !== current.generation) {
        loseOwnership("RUNTIME_LEASE_GENERATION_MISMATCH");
        return;
      }
      consecutiveRenewFailures = 0;
      leaseExpiresAt = result.expiresAt;
    } else if (TRANSIENT_LEASE_CODES.has(result.code)) {
      consecutiveRenewFailures += 1;
      log("VOICE_CALL_CONTROLLER_RENEW_TRANSIENT", { code: result.code });
    } else {
      loseOwnership(result.code);
      return;
    }
    scheduleHeartbeat();
  }

  function scheduleDurationTimer(): void {
    if (state !== "ACTIVE") return;
    const decision = evaluateCallDuration(
      { startedAtMs: call.lifecycle.startedAtMs, nowMs: clock.now() },
      durationPolicy
    );
    if (decision.action === "END_CALL") {
      requestEnd(decision.endReason);
      return;
    }
    durationTimer = clock.setTimeout(() => {
      durationTimer = null;
      scheduleDurationTimer();
    }, decision.remainingMs);
  }

  /* ── Ownership ──────────────────────────────────────────────────── */

  function loseOwnership(code: RuntimeLeaseErrorCode): void {
    if (state !== "ACTIVE" && state !== "ENDING") return;
    ownershipLostCode = code;
    transition("OWNERSHIP_LOST");
    pending = null;
    proof = null;
    clearHeartbeat();
    clearDurationTimer();
    log("VOICE_CALL_CONTROLLER_OWNERSHIP_LOST", { code });
    emit({ type: "OWNERSHIP_LOST", code });
  }

  /** Outcome of a failed lease check (separate verify or fused into turn allocation); null = verified. */
  function leaseVerdict(code: RuntimeLeaseErrorCode | null): { submitPending: boolean } | null {
    if (code === null) return null;
    if (TRANSIENT_LEASE_CODES.has(code)) {
      log("VOICE_CALL_CONTROLLER_VERIFY_TRANSIENT", { code });
      emitOutcome({ kind: "NOT_PROCESSED", code: "LEASE_UNVERIFIED" });
      return { submitPending: true };
    }
    loseOwnership(code);
    emitOutcome({ kind: "SUPPRESSED", reason: "OWNERSHIP_LOST" });
    return { submitPending: false };
  }

  function requestEnd(reason: VoiceCallEndReason): void {
    if (finishPromise || state !== "ACTIVE") return;
    emit({ type: "CALL_END_REQUESTED", endReason: reason, fallback: fallbackForEndReason(reason) });
    void finish(reason);
  }

  /* ── Start ──────────────────────────────────────────────────────── */

  function start(): Promise<CallControllerStartResult> {
    if (startPromise && state === "STARTING") return startPromise;
    if (state !== "NEW") return Promise.resolve({ ok: false, code: "INVALID_STATE", acquireAttempts: 0 });
    transition("STARTING");
    startPromise = acquireLoop();
    return startPromise;
  }

  async function acquireLoop(): Promise<CallControllerStartResult> {
    let attempts = 0;
    let lastLeaseCode: RuntimeLeaseErrorCode | undefined;
    const startFailed = (
      code: Extract<CallControllerStartResult, { ok: false }>["code"]
    ): CallControllerStartResult => {
      if (state === "STARTING") transition("FAILED");
      log("VOICE_CALL_CONTROLLER_START_FAILED", { code });
      return { ok: false, code, acquireAttempts: attempts, ...(lastLeaseCode ? { lastLeaseCode } : {}) };
    };

    for (;;) {
      if (state !== "STARTING") return startFailed("FINISH_REQUESTED");
      attempts += 1;
      let result: AcquireRuntimeLeaseResult;
      try {
        result = await lease.acquire({ bindingId: call.bindingId, clinicId: call.clinicId, ownerId });
      } catch {
        result = leaseFailure("RUNTIME_LEASE_UPDATE_FAILED");
      }

      if (result.ok) {
        const handle = result.lease;
        if (handle.bindingId !== call.bindingId || handle.clinicId !== call.clinicId || handle.ownerId !== ownerId) {
          return startFailed("LEASE_MISMATCH");
        }
        proof = {
          bindingId: handle.bindingId,
          clinicId: handle.clinicId,
          ownerId: handle.ownerId,
          generation: handle.generation,
          leaseToken: handle.leaseToken,
        };
        leaseGeneration = handle.generation;
        leaseExpiresAt = handle.expiresAt;
        effectiveRenewMs = Math.min(renewIntervalMs, Math.max(1, Math.floor(handle.leaseDurationMs / 3)));
        // finish() arrived during this attempt: it now owns the lease and ends + releases it.
        if (state !== "STARTING") return startFailed("FINISH_REQUESTED");
        transition("ACTIVE");
        log("VOICE_CALL_CONTROLLER_LEASE_ACQUIRED", { code: result.takeover ? "TAKEOVER" : "FRESH" });
        scheduleHeartbeat();
        scheduleDurationTimer();
        return { ok: true, leaseGeneration: handle.generation, takeover: result.takeover, acquireAttempts: attempts };
      }

      lastLeaseCode = result.code;
      if (!ACQUIRE_RETRYABLE_CODES.has(result.code)) return startFailed(result.code);
      if (attempts >= acquireRetry.maxAttempts) return startFailed("ACQUIRE_RETRY_EXHAUSTED");
      log("VOICE_CALL_CONTROLLER_LEASE_ACQUIRE_RETRY", { code: result.code });
      await waitAcquireDelay(acquireRetry.delayMs);
    }
  }

  /* ── Business turns ─────────────────────────────────────────────── */

  function submitTranscript(transcript: string): TranscriptAcceptance {
    switch (state) {
      case "ACTIVE":
        break;
      case "ENDING":
        return { accepted: false, reason: "ENDING" };
      case "ENDED":
        return { accepted: false, reason: "ENDED" };
      case "OWNERSHIP_LOST":
        return { accepted: false, reason: "OWNERSHIP_LOST" };
      case "FAILED":
        return { accepted: false, reason: "FAILED" };
      default:
        return { accepted: false, reason: "NOT_ACTIVE" };
    }
    if (turnLoop) {
      const replaced = pending !== null;
      pending = transcript;
      log("VOICE_CALL_CONTROLLER_TRANSCRIPT_BUFFERED", { code: replaced ? "REPLACED_PENDING" : "BUFFERED" });
      return { accepted: true, disposition: replaced ? "REPLACED_PENDING" : "BUFFERED" };
    }
    turnLoop = runTurns(transcript);
    return { accepted: true, disposition: "STARTED" };
  }

  async function runTurns(first: string): Promise<void> {
    let next: string | null = first;
    let endAfter: VoiceCallEndReason | null = null;
    try {
      while (next !== null) {
        const step = await runOneTurn(next);
        next = null;
        if (step.endReason) {
          endAfter = step.endReason;
          pending = null;
        } else if (state === "ACTIVE" && step.submitPending && pending !== null) {
          next = pending;
          pending = null;
        } else {
          pending = null;
        }
      }
    } catch {
      pending = null;
      log("VOICE_CALL_CONTROLLER_TURN_LOOP_FAILED");
    } finally {
      // Runs synchronously with the last pending check, so no transcript can be orphaned.
      turnLoop = null;
    }
    if (endAfter) requestEnd(endAfter);
  }

  function suppressionReason(): "OWNERSHIP_LOST" | "CALL_ENDING" | null {
    if (state === "ACTIVE") return null;
    return state === "OWNERSHIP_LOST" ? "OWNERSHIP_LOST" : "CALL_ENDING";
  }

  async function runOneTurn(transcript: string): Promise<{ submitPending: boolean; endReason?: VoiceCallEndReason }> {
    const current = proof;
    if (state !== "ACTIVE" || !current) {
      emitOutcome({ kind: "NOT_PROCESSED", code: "CALL_ENDING" });
      return { submitPending: false };
    }

    let verifyMs: number | undefined;
    if (!verifyLeaseInTurnAllocation) {
      const verifyStartedAt = clock.now();
      let verified: VerifyRuntimeLeaseResult;
      try {
        verified = await lease.verify(current, { minRemainingMs: verifyMinRemainingMs });
      } catch {
        verified = leaseFailure("RUNTIME_LEASE_LOOKUP_FAILED");
      }
      verifyMs = Math.max(0, clock.now() - verifyStartedAt);
      let failedCode: RuntimeLeaseErrorCode | null = null;
      if (!verified.ok) failedCode = verified.code;
      else if (verified.generation !== current.generation) failedCode = "RUNTIME_LEASE_GENERATION_MISMATCH";
      const rejected = leaseVerdict(failedCode);
      if (rejected) return rejected;
      if (state !== "ACTIVE") {
        emitOutcome({ kind: "NOT_PROCESSED", code: "CALL_ENDING" });
        return { submitPending: false };
      }
    }

    // The business turn starts here and always settles: no cancellation path exists.
    // In fused mode the bridge verifies the lease atomically with turn id allocation and
    // starts no business turn when that check fails.
    const bridgeStartedAt = clock.now();
    let result: ProcessRuntimeTranscriptResult;
    try {
      result = await bridge.processRuntimeTranscript(
        verifyLeaseInTurnAllocation
          ? { runtimeCall: call, transcript, lease: { proof: current, minRemainingMs: verifyMinRemainingMs } }
          : { runtimeCall: call, transcript }
      );
    } catch {
      result = {
        ok: false,
        action: "DISCARD",
        code: "INTERNAL_ERROR",
        retryable: false,
        endReason: "RUNTIME_FAILURE",
        fallback: fallbackForEndReason("RUNTIME_FAILURE"),
      };
    }
    const bridgeMs = Math.max(0, clock.now() - bridgeStartedAt);
    if (!result.ok && result.code === "LEASE_REJECTED") {
      // Never ran Agent Core; mapped exactly like a failed separate verify.
      const leaseCode = isRuntimeLeaseErrorCode(result.reasonCode) ? result.reasonCode : "RUNTIME_LEASE_INVALID_STATE";
      return leaseVerdict(leaseCode) ?? { submitPending: false };
    }
    const suppressed = suppressionReason();

    if (result.ok) {
      const { turn } = result;
      processedTurns += 1;
      lastTurnSeq = turn.turnSeq;
      log("VOICE_CALL_CONTROLLER_TURN_COMPLETED", { turnSeq: turn.turnSeq, code: turn.bufferedSpeech, verifyMs, bridgeMs });
      if (suppressed) {
        log("VOICE_CALL_CONTROLLER_TURN_SUPPRESSED", { turnSeq: turn.turnSeq, code: suppressed });
        emitOutcome({ kind: "SUPPRESSED", reason: suppressed, turnSeq: turn.turnSeq });
        return { submitPending: false };
      }
      agentCompletionRequested = turn.endCallSuggested;
      if (agentCompletionRequested) {
        log("VOICE_CALL_CONTROLLER_AGENT_COMPLETION_REQUESTED", { turnSeq: turn.turnSeq, reason: "AGENT_COMPLETED" });
      }
      emitOutcome({
        kind: "SPEAK",
        turnId: turn.turnId,
        turnSeq: turn.turnSeq,
        speechText: turn.speechText,
        allowBargeIn: turn.allowBargeIn,
        endCallSuggested: turn.endCallSuggested,
        endAfterPlayback: agentCompletionRequested ? "AGENT_COMPLETED" : null,
      });
      return { submitPending: turn.bufferedSpeech === "SUBMIT" };
    }

    if (result.action === "BUFFER") {
      // Single flight is enforced here, so the bridge can only buffer if something else drives this call.
      log("VOICE_CALL_CONTROLLER_BRIDGE_UNEXPECTED_BUFFER", { code: result.code });
      emitOutcome(suppressed ? { kind: "SUPPRESSED", reason: suppressed } : { kind: "NOT_PROCESSED", code: "BRIDGE_UNEXPECTED_BUFFER" });
      return { submitPending: false };
    }

    log("VOICE_CALL_CONTROLLER_TURN_FAILED", { code: result.code, verifyMs, bridgeMs });
    if (suppressed) {
      emitOutcome({ kind: "SUPPRESSED", reason: suppressed });
      return { submitPending: false };
    }
    const endReason = result.endReason ?? (CALL_UNAVAILABLE_CODES.has(result.code) ? "RUNTIME_FAILURE" : undefined);
    if (endReason) {
      emitOutcome({
        kind: "FAILED",
        code: result.code,
        ...(result.reasonCode ? { reasonCode: result.reasonCode } : {}),
        endReason,
        fallback: result.endReason ? (result.fallback ?? fallbackForEndReason(endReason)) : fallbackForEndReason(endReason),
      });
      return { submitPending: false, endReason };
    }
    emitOutcome({ kind: "NOT_PROCESSED", code: result.code });
    return { submitPending: true };
  }

  /* ── Finish ─────────────────────────────────────────────────────── */

  function finish(reason: VoiceCallEndReason): Promise<CallFinishResult> {
    if (finishPromise) return finishPromise;
    let canonical: VoiceCallEndReason = "RUNTIME_FAILURE";
    if (isCanonicalEndReason(reason)) canonical = reason;
    else log("VOICE_CALL_CONTROLLER_INVALID_END_REASON");
    if (canonical === "AGENT_COMPLETED" && !agentCompletionRequested) {
      // Kept as given: the session mapping is turn-count based, so no interaction is invented.
      log("VOICE_CALL_CONTROLLER_AGENT_COMPLETED_UNREQUESTED", { reason: canonical });
    }
    finishReason = canonical;
    finishPromise = doFinish(canonical).catch((): CallFinishResult => {
      log("VOICE_CALL_CONTROLLER_FINISH_FAILED", { reason: canonical });
      clearHeartbeat();
      clearDurationTimer();
      cancelAcquireDelay();
      return { reason: canonical, disposition: "ENDED_WITHOUT_OWNERSHIP", endRuntimeCall: NOT_ATTEMPTED, leaseRelease: NOT_ATTEMPTED };
    });
    return finishPromise;
  }

  function finished(result: CallFinishResult): CallFinishResult {
    log("VOICE_CALL_CONTROLLER_FINISHED", { reason: result.reason, code: result.disposition });
    emit({ type: "FINISHED", result });
    return result;
  }

  async function doFinish(reason: VoiceCallEndReason): Promise<CallFinishResult> {
    if (state === "NEW") {
      transition("ENDED");
      return finished({ reason, disposition: "ENDED_WITHOUT_OWNERSHIP", endRuntimeCall: NOT_ATTEMPTED, leaseRelease: NOT_ATTEMPTED });
    }
    if (state === "FAILED") {
      return finished({ reason, disposition: "START_FAILED", endRuntimeCall: NOT_ATTEMPTED, leaseRelease: NOT_ATTEMPTED });
    }
    if (state === "STARTING") {
      transition("ENDING");
      cancelAcquireDelay();
      if (startPromise) await startPromise;
    } else if (state === "ACTIVE") {
      transition("ENDING");
    }

    // 1–2: no new transcripts (state is no longer ACTIVE); heartbeat and duration timer stop.
    clearHeartbeat();
    clearDurationTimer();
    if (heartbeatInFlight) await heartbeatInFlight;
    // 3–4: the in-flight business turn settles; its speech is suppressed by the state check.
    while (turnLoop) await turnLoop;
    pending = null;

    if (state === "OWNERSHIP_LOST") {
      return finished({ reason, disposition: "OWNERSHIP_LOST", endRuntimeCall: NOT_ATTEMPTED, leaseRelease: NOT_ATTEMPTED });
    }
    if (!proof) {
      transition("ENDED");
      return finished({ reason, disposition: "ENDED_WITHOUT_OWNERSHIP", endRuntimeCall: NOT_ATTEMPTED, leaseRelease: NOT_ATTEMPTED });
    }

    // 5–6: lifecycle is mutated while still holding the lease, then ownership is given up.
    const endRuntimeCall = await endCall(reason);
    const leaseRelease = await releaseLease();
    transition("ENDED");
    return finished({ reason, disposition: "ENDED", endRuntimeCall, leaseRelease });
  }

  async function endCall(reason: VoiceCallEndReason): Promise<EndRuntimeCallOutcome> {
    let result: EndRuntimeCallResult;
    try {
      result = await bridge.endRuntimeCall({ runtimeCall: call, reason });
    } catch {
      result = { ok: false, code: "INTERNAL_ERROR", retryable: true };
    }
    if (result.ok) {
      return {
        attempted: true,
        ok: true,
        bindingStatus: result.bindingStatus,
        alreadyEnded: result.alreadyEnded,
        fallback: result.fallback,
      };
    }
    log("VOICE_CALL_CONTROLLER_END_FAILED", { code: result.code, reason });
    return { attempted: true, ok: false, code: result.code, ...(result.reasonCode ? { reasonCode: result.reasonCode } : {}) };
  }

  async function releaseLease(): Promise<LeaseReleaseOutcome> {
    const current = proof;
    if (!current) return NOT_ATTEMPTED;
    let attempts = 0;
    let lastCode: RuntimeLeaseErrorCode = "RUNTIME_LEASE_UPDATE_FAILED";
    while (attempts < releaseMaxAttempts) {
      attempts += 1;
      let result: ReleaseRuntimeLeaseResult;
      try {
        result = await lease.release(current);
      } catch {
        result = leaseFailure("RUNTIME_LEASE_UPDATE_FAILED");
      }
      if (result.ok) {
        proof = null;
        return { attempted: true, ok: true, attempts, alreadyReleased: result.alreadyReleased };
      }
      lastCode = result.code;
      if (!TRANSIENT_LEASE_CODES.has(result.code)) break;
    }
    proof = null;
    log("VOICE_CALL_CONTROLLER_RELEASE_FAILED", { code: lastCode });
    return { attempted: true, ok: false, attempts, code: lastCode };
  }

  /* ── Introspection ──────────────────────────────────────────────── */

  function snapshot(): CallControllerSnapshot {
    return Object.freeze({
      state,
      bindingId: call.bindingId,
      clinicId: call.clinicId,
      callSessionId: call.callSessionId,
      conversationId: call.conversationId,
      leaseGeneration,
      leaseExpiresAt,
      turnInFlight: turnLoop !== null,
      pendingTranscript: pending !== null,
      processedTurns,
      lastTurnSeq,
      consecutiveRenewFailures,
      ownershipLostCode,
      finishReason,
      agentCompletionRequested,
    });
  }

  async function whenIdle(): Promise<void> {
    while (turnLoop) await turnLoop;
  }

  return { start, submitTranscript, finish, snapshot, whenIdle };
}
