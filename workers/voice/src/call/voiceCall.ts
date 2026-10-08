/**
 * One inbound call, from trusted SIP identity to the end of the job. Transport glue only:
 *
 *   trusted SIP identity → startRuntimeCall → CallController.start (lease) → speech session
 *   final caller turn → CallController.submitTranscript → bridge → processVoiceTurn → Agent Core
 *   SPEAK outcome → speak turn.speechText → (AGENT_COMPLETED) verified playback → finish
 *
 * The CallController is the only turn queue and the only owner of turn IDs, single flight,
 * max duration and the exactly-once finish. This module never calls processVoiceTurn, never
 * retries a turn, never persists transcripts and never decides business outcomes.
 *
 * Silence: a worker-owned countdown (silenceScheduler) runs only while the call is listening —
 * caller silent, no business turn in flight, no assistant speech — and lifecyclePolicy decides
 * reprompt vs goodbye. Only an accepted caller transcript resets the reprompt count.
 */

import {
  createCallController,
  type CallController,
  type CallControllerEvent,
  type CallControllerOptions,
  type CallFinishResult,
  type RuntimeLeaseOperations,
  type TurnOutcome,
} from "@/lib/voice/runtime/callController";
import type {
  StartRuntimeCallResult,
  VoiceRuntimeBridge,
  VoiceRuntimeCall,
  VoiceRuntimeFailureCode,
} from "@/lib/voice/runtime/voiceRuntimeBridge";
import {
  endReasonAfterFinalReply,
  getFallbackSpeech,
  INITIAL_SILENCE_STATE,
  onCallerSpeech,
  onSilenceTimeout,
  resolveVoiceLifecyclePolicy,
  type SilenceState,
  type VoiceCallEndReason,
  type VoiceLifecyclePolicy,
} from "@/lib/voice/telephony/lifecyclePolicy";
import { extractTrustedSipIdentity, type SipParticipantLike, type SipTrustPolicy, type TrustedSipIdentityErrorCode } from "../sipIdentity";
import { createCompletionGuard, type CompletionToken } from "./completionGuard";
import { greetingForStartedCall } from "./greeting";
import { finalReplyPlaybackOutcome, type SpeechPlaybackOutcome } from "./playback";
import type { CallTransportPort, SpeechPlayback, SpeechSessionFactory, SpeechSessionHandlers, SpeechSessionPort } from "./ports";
import { createSilenceScheduler, type SilenceScheduler } from "./silenceScheduler";
import { endReasonForJobShutdown, endReasonForSessionClose, type SpeechSessionClose } from "./transportEvents";
import { computeTurnLatency, type TurnLatencyMarks } from "./turnLatency";
import { controllerLogger, type WorkerLogFields, type WorkerLogger } from "./workerLog";

export interface VoiceCallLimits {
  /** Longest wait for a goodbye/fallback to play before the call is disconnected. */
  farewellWaitMs: number;
  speechCloseWaitMs: number;
  /** Longest wait in the job shutdown callback; the in-flight turn itself is never cancelled. */
  shutdownWaitMs: number;
}

export const VOICE_CALL_DEFAULT_LIMITS: Readonly<VoiceCallLimits> = Object.freeze({
  farewellWaitMs: 15_000,
  speechCloseWaitMs: 5_000,
  shutdownWaitMs: 45_000,
});

interface VoiceCallTimer {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface VoiceCallDeps {
  participant: SipParticipantLike;
  sipTrust: SipTrustPolicy;
  bridge: Pick<VoiceRuntimeBridge, "startRuntimeCall" | "processRuntimeTranscript" | "endRuntimeCall">;
  lease: RuntimeLeaseOperations;
  /** Worker/job identity for the lease; never caller-derived. */
  ownerId: string;
  speech: SpeechSessionFactory;
  transport: CallTransportPort;
  log: WorkerLogger;
  createController?: (options: CallControllerOptions) => CallController;
  controllerOptions?: Pick<CallControllerOptions, "clock" | "renewIntervalMs" | "verifyMinRemainingMs" | "acquireRetry" | "releaseMaxAttempts">;
  timer?: VoiceCallTimer;
  limits?: Partial<VoiceCallLimits>;
}

export type VoiceCallResult =
  | { outcome: "IDENTITY_REJECTED"; code: TrustedSipIdentityErrorCode }
  | { outcome: "SPEECH_UNAVAILABLE" }
  | { outcome: "CALL_REJECTED"; code: VoiceRuntimeFailureCode }
  | { outcome: "FINISHED"; finish: CallFinishResult };

export interface VoiceCall {
  readonly done: Promise<VoiceCallResult>;
  /** Job shutdown callback: requests finish (idempotent) and waits a bounded time. */
  shutdown(): Promise<void>;
}

type SpeakOutcome = Extract<TurnOutcome, { kind: "SPEAK" }>;

const SYSTEM_TIMER: VoiceCallTimer = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const FAILED_PLAYBACK: SpeechPlayback = Object.freeze({ outcome: Promise.resolve<SpeechPlaybackOutcome>("FAILED") });
const NOTHING_TO_SPEAK: SpeechPlayback = Object.freeze({ outcome: Promise.resolve<SpeechPlaybackOutcome>("COMPLETED") });

export function runVoiceCall(deps: VoiceCallDeps): VoiceCall {
  const { log, transport } = deps;
  const timer = deps.timer ?? SYSTEM_TIMER;
  const now = (): number => deps.controllerOptions?.clock?.now() ?? Date.now();
  const limits: VoiceCallLimits = { ...VOICE_CALL_DEFAULT_LIMITS, ...deps.limits };
  const completion = createCompletionGuard();

  let runtimeCall: VoiceRuntimeCall | null = null;
  let controller: CallController | null = null;
  let speech: SpeechSessionPort | null = null;
  let speechStarted = false;
  let policy: VoiceLifecyclePolicy | null = null;
  let silence: SilenceState = INITIAL_SILENCE_STATE;
  let silenceTimer: SilenceScheduler | null = null;
  let callerSpeaking = false;
  let activeSpeech = 0;
  let finishRequested = false;
  let callerGone = false;
  let speechSuppressed = false;
  let shuttingDown = false;
  let farewell: Promise<unknown> | null = null;
  let callerStoppedAt: number | null = null;
  let turnMarks: TurnLatencyMarks | null = null;

  let resolveDone!: (result: VoiceCallResult) => void;
  const done = new Promise<VoiceCallResult>((resolve) => {
    resolveDone = resolve;
  });
  let settled = false;

  function ids(): WorkerLogFields {
    if (!runtimeCall) return {};
    return {
      bindingId: runtimeCall.bindingId,
      clinicId: runtimeCall.clinicId,
      callSessionId: runtimeCall.callSessionId,
      conversationId: runtimeCall.conversationId,
    };
  }

  /** Timing-only view of the bridge; the controller still makes the one and only Agent Core call. */
  const timedBridge: CallControllerOptions["bridge"] = {
    endRuntimeCall: (input) => deps.bridge.endRuntimeCall(input),
    async processRuntimeTranscript(input) {
      const marks = turnMarks;
      if (marks && marks.agentStartAt === undefined) marks.agentStartAt = now();
      try {
        return await deps.bridge.processRuntimeTranscript(input);
      } finally {
        if (marks) marks.agentEndAt = now();
      }
    },
  };

  function settle(result: VoiceCallResult, shutdownReason: string): void {
    if (settled) return;
    settled = true;
    resolveDone(result);
    transport.shutdownJob(shutdownReason);
  }

  function withTimeout(promise: Promise<unknown>, ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const handle = timer.setTimeout(resolve, ms);
      promise.then(
        () => {
          timer.clearTimeout(handle);
          resolve();
        },
        () => {
          timer.clearTimeout(handle);
          resolve();
        }
      );
    });
  }

  function requestFinish(reason: VoiceCallEndReason): void {
    if (!controller || finishRequested) return;
    finishRequested = true;
    silenceTimer?.stop();
    log("VOICE_WORKER_FINISH_REQUESTED", { ...ids(), reason });
    void controller.finish(reason);
  }

  /* ── Silence ────────────────────────────────────────────────────── */

  function isListening(): boolean {
    if (!controller || !speechStarted || finishRequested || speechSuppressed || callerGone || shuttingDown) return false;
    if (callerSpeaking || activeSpeech > 0) return false;
    const snap = controller.snapshot();
    return snap.state === "ACTIVE" && !snap.turnInFlight && !snap.pendingTranscript;
  }

  function syncSilence(): void {
    silenceTimer?.setListening(isListening());
  }

  /** Re-evaluates once the controller's turn loop (including merged pending transcripts) is idle. */
  function syncSilenceWhenIdle(): void {
    if (controller) void controller.whenIdle().then(syncSilence, syncSilence);
  }

  function onSilenceElapsed(): void {
    if (!policy || !isListening()) return;
    const decision = onSilenceTimeout(silence, policy);
    silence = decision.state;
    log("VOICE_WORKER_SILENCE_TIMEOUT", { ...ids(), outcome: decision.action });
    const playback = speak(getFallbackSpeech(decision.fallback, runtimeCall?.locale), decision.action === "REPROMPT");
    if (decision.action === "END_CALL") {
      if (playback) farewell = playback.outcome;
      requestFinish(decision.endReason);
      return;
    }
    if (playback) watchForPlaybackFailure(playback);
    syncSilence();
  }

  /* ── Speech ─────────────────────────────────────────────────────── */

  function speak(text: string, allowInterruptions: boolean): SpeechPlayback | null {
    if (!speech || speechSuppressed || callerGone) return null;
    let playback: SpeechPlayback;
    try {
      playback = speech.say(text, { allowInterruptions });
    } catch {
      return FAILED_PLAYBACK;
    }
    activeSpeech += 1;
    syncSilence();
    void playback.outcome.finally(() => {
      activeSpeech -= 1;
      syncSilence();
    });
    return playback;
  }

  function watchForPlaybackFailure(playback: SpeechPlayback): void {
    void playback.outcome.then((outcome) => {
      if (outcome === "FAILED" && !callerGone) requestFinish(endReasonAfterFinalReply("PLAYBACK_FAILED"));
    });
  }

  /** A known caller disconnect is authoritative over any playback result. */
  function refreshCallerPresence(): void {
    if (callerGone) return;
    let connected = true;
    try {
      connected = transport.isCallerConnected();
    } catch {
      // Unknown presence: rely on the disconnect event.
    }
    if (!connected) onCallerDisconnected();
  }

  function logTurnLatency(turnSeq: number, marks: TurnLatencyMarks, playback: SpeechPlayback): void {
    const firstAudio = playback.started ?? Promise.resolve(null);
    void Promise.race([firstAudio, playback.outcome.then(() => null)]).then(
      (firstAudioAt) => log("VOICE_WORKER_TURN_LATENCY", { ...ids(), turnSeq, ...computeTurnLatency(marks, firstAudioAt) }),
      () => undefined
    );
  }

  function completionStillCurrent(token: CompletionToken): boolean {
    if (!controller || !completion.isCurrent(token)) return false;
    const snap = controller.snapshot();
    return (
      snap.state === "ACTIVE" &&
      !snap.turnInFlight &&
      !snap.pendingTranscript &&
      snap.agentCompletionRequested &&
      snap.lastTurnSeq === token.turnSeq
    );
  }

  async function deliverReply(reply: SpeakOutcome, marks: TurnLatencyMarks | null): Promise<void> {
    completion.supersede();
    const token = reply.endAfterPlayback === "AGENT_COMPLETED" ? completion.arm(reply.turnSeq) : null;
    if (marks) marks.speakRequestedAt = now();
    const playback = reply.speechText ? speak(reply.speechText, reply.allowBargeIn) : NOTHING_TO_SPEAK;
    if (!playback) return;
    if (marks) logTurnLatency(reply.turnSeq, marks, playback);
    const outcome = await playback.outcome;

    refreshCallerPresence();
    const final = finalReplyPlaybackOutcome(outcome, callerGone);
    if (final === "CALLER_HANGUP" || final === "PLAYBACK_FAILED") {
      requestFinish(endReasonAfterFinalReply(final));
      return;
    }
    // Interrupted (the caller is speaking) or a normal reply: the call continues.
    if (!token || final !== "PLAYED") return;
    if (!completionStillCurrent(token)) {
      log("VOICE_WORKER_STALE_COMPLETION_IGNORED", { ...ids(), turnSeq: token.turnSeq });
      return;
    }
    requestFinish(endReasonAfterFinalReply("PLAYED"));
  }

  function speakGreeting(text: string): void {
    const playback = speak(text, true);
    if (playback) watchForPlaybackFailure(playback);
  }

  /* ── Controller events ──────────────────────────────────────────── */

  function onTurnOutcome(outcome: TurnOutcome): void {
    const marks = turnMarks;
    // A NOT_PROCESSED transcript stays queued in the controller and is retried with the next turn.
    if (outcome.kind !== "NOT_PROCESSED") turnMarks = null;
    if (outcome.kind === "SPEAK") void deliverReply(outcome, marks);
    syncSilenceWhenIdle();
  }

  function onControllerEvent(event: CallControllerEvent): void {
    switch (event.type) {
      case "TURN_OUTCOME":
        onTurnOutcome(event.outcome);
        return;
      case "CALL_END_REQUESTED": {
        // Controller-owned end (e.g. MAX_DURATION): no further silence handling.
        finishRequested = true;
        silenceTimer?.stop();
        if (!event.fallback) return;
        const playback = speak(getFallbackSpeech(event.fallback, runtimeCall?.locale), false);
        if (playback) farewell = playback.outcome;
        return;
      }
      case "OWNERSHIP_LOST":
        // Another worker may be serving this call: stop talking, never end or release it here.
        speechSuppressed = true;
        completion.supersede();
        try {
          speech?.interruptAll();
        } catch {
          // Best effort.
        }
        log("VOICE_WORKER_OWNERSHIP_LOST", { ...ids(), code: event.code });
        requestFinish("RUNTIME_FAILURE");
        return;
      case "FINISHED":
        finishRequested = true;
        silenceTimer?.stop();
        void afterFinished(event.result);
        return;
    }
  }

  async function afterFinished(result: CallFinishResult): Promise<void> {
    if (farewell && result.disposition !== "OWNERSHIP_LOST") await withTimeout(farewell, limits.farewellWaitMs);
    if (speech) await withTimeout(speech.close(), limits.speechCloseWaitMs);
    if (result.disposition === "ENDED" && !callerGone) {
      try {
        await transport.hangUp();
      } catch {
        log("VOICE_WORKER_HANGUP_FAILED", { ...ids(), reason: result.reason });
      }
    }
    log("VOICE_WORKER_CALL_FINISHED", { ...ids(), reason: result.reason, disposition: result.disposition });
    settle({ outcome: "FINISHED", finish: result }, `clinicbridge:${result.disposition}`);
  }

  /* ── Speech session events ──────────────────────────────────────── */

  const handlers: SpeechSessionHandlers = {
    onFinalTranscript(text) {
      const transcript = text.trim();
      if (!transcript || !controller || speechSuppressed) return;
      const finalAt = now();
      const acceptance = controller.submitTranscript(transcript);
      if (!acceptance.accepted) {
        log("VOICE_WORKER_TRANSCRIPT_NOT_ACCEPTED", { ...ids(), code: acceptance.reason });
        return;
      }
      silence = onCallerSpeech();
      completion.supersede();
      turnMarks ??= { callerStoppedAt, finalTranscriptAt: finalAt };
      syncSilence();
      syncSilenceWhenIdle();
    },
    onUserSpeaking() {
      callerSpeaking = true;
      callerStoppedAt = null;
      syncSilence();
    },
    onUserStoppedSpeaking() {
      callerSpeaking = false;
      callerStoppedAt = now();
      syncSilence();
    },
    onClosed(close: SpeechSessionClose) {
      if (close.kind === "PARTICIPANT_DISCONNECTED") callerGone = true;
      requestFinish(endReasonForSessionClose(close, { callerGone }));
    },
  };

  function onCallerDisconnected(): void {
    callerGone = true;
    completion.supersede();
    requestFinish("CALLER_HANGUP");
  }

  /* ── Start sequence ─────────────────────────────────────────────── */

  async function run(): Promise<void> {
    const identity = extractTrustedSipIdentity(deps.participant, deps.sipTrust);
    if (!identity.ok) {
      log("VOICE_WORKER_CALL_NOT_STARTED", { code: identity.code });
      settle({ outcome: "IDENTITY_REJECTED", code: identity.code }, "clinicbridge:IDENTITY_REJECTED");
      return;
    }
    if (!deps.speech.available()) {
      log("VOICE_WORKER_CALL_NOT_STARTED", { code: "SPEECH_PROVIDERS_UNAVAILABLE" });
      settle({ outcome: "SPEECH_UNAVAILABLE" }, "clinicbridge:SPEECH_UNAVAILABLE");
      return;
    }
    transport.onCallerDisconnected(onCallerDisconnected);

    let started: StartRuntimeCallResult;
    try {
      started = await deps.bridge.startRuntimeCall({
        externalCallKey: identity.externalCallKey,
        calledDid: identity.calledDid,
      });
    } catch {
      started = { ok: false, code: "INTERNAL_ERROR", retryable: true };
    }
    if (!started.ok) {
      log("VOICE_WORKER_CALL_NOT_STARTED", { code: started.code, reason: started.endReason });
      settle({ outcome: "CALL_REJECTED", code: started.code }, "clinicbridge:CALL_REJECTED");
      return;
    }

    const call = started.call;
    runtimeCall = call;
    policy = resolveVoiceLifecyclePolicy({
      maxCallDurationMs: call.lifecycle.maxCallDurationMs,
      silenceTimeoutMs: call.lifecycle.silenceTimeoutMs,
      maxSilenceReprompts: call.lifecycle.maxSilenceReprompts,
    });
    silence = call.lifecycle.silence;
    silenceTimer = createSilenceScheduler({ timer, timeoutMs: policy.silenceTimeoutMs, onTimeout: onSilenceElapsed });
    log("VOICE_WORKER_CALL_STARTED", { ...ids(), didE164: call.didE164, outcome: started.created ? "CREATED" : "RESUMED" });

    const active = (deps.createController ?? createCallController)({
      ...deps.controllerOptions,
      runtimeCall: call,
      ownerId: deps.ownerId,
      bridge: timedBridge,
      lease: deps.lease,
      logger: controllerLogger(log),
      onEvent: onControllerEvent,
    });
    controller = active;

    const leased = await active.start();
    if (!leased.ok) {
      log("VOICE_WORKER_LEASE_UNAVAILABLE", { ...ids(), code: leased.code });
      requestFinish("RUNTIME_FAILURE");
      return;
    }
    if (callerGone || shuttingDown) {
      requestFinish(callerGone ? "CALLER_HANGUP" : endReasonForJobShutdown({ callerGone }));
      return;
    }

    try {
      speech = deps.speech.create({ call });
      await speech.start(handlers);
    } catch {
      log("VOICE_WORKER_SPEECH_SESSION_FAILED", { ...ids(), code: "SPEECH_SESSION_START_FAILED" });
      requestFinish("RUNTIME_FAILURE");
      return;
    }
    if (active.snapshot().state !== "ACTIVE") return;
    speechStarted = true;

    const greeting = greetingForStartedCall(started);
    if (greeting) speakGreeting(greeting);
    syncSilence();
  }

  void run().catch(() => {
    log("VOICE_WORKER_CALL_UNEXPECTED_ERROR", { ...ids(), code: "UNEXPECTED" });
    if (controller) requestFinish("RUNTIME_FAILURE");
    else settle({ outcome: "CALL_REJECTED", code: "INTERNAL_ERROR" }, "clinicbridge:CALL_REJECTED");
  });

  async function shutdown(): Promise<void> {
    shuttingDown = true;
    if (controller) requestFinish(endReasonForJobShutdown({ callerGone }));
    await withTimeout(done, limits.shutdownWaitMs);
  }

  return { done, shutdown };
}
