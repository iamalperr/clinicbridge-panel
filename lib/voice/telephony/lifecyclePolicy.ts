/**
 * Voice call lifecycle / interruption policy (Phase 3, pure, provider-independent).
 *
 * Transport behavior only: call duration, silence handling, barge-in, in-flight turn
 * protection, end reasons and fixed fallback categories. Business decisions stay in
 * Agent Core; this module reads structured turn state, never reply text.
 */

import type { AppointmentState } from "@/lib/agent/types";
import type { EndCallSessionInput, VoiceTurnResult } from "../types";

/* ── Policy ──────────────────────────────────────────────────────────── */

export interface VoiceLifecyclePolicy {
  maxCallDurationMs: number;
  /** Caller silence (while listening) that counts as one silence timeout. */
  silenceTimeoutMs: number;
  /** Reprompts before the call ends on the next consecutive silence timeout. */
  maxSilenceReprompts: number;
  /** Assistant replies for these states are played without caller interruption. */
  uninterruptibleAppointmentStates: readonly AppointmentState[];
}

export const DEFAULT_VOICE_LIFECYCLE_POLICY: Readonly<VoiceLifecyclePolicy> = Object.freeze({
  maxCallDurationMs: 15 * 60 * 1000,
  silenceTimeoutMs: 8_000,
  maxSilenceReprompts: 2,
  uninterruptibleAppointmentStates: Object.freeze(["AWAITING_CONFIRMATION"] as const),
});

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer`);
}

/** Merge overrides onto the defaults; invalid values throw (misconfiguration must not pass silently). */
export function resolveVoiceLifecyclePolicy(overrides: Partial<VoiceLifecyclePolicy> = {}): VoiceLifecyclePolicy {
  const policy: VoiceLifecyclePolicy = { ...DEFAULT_VOICE_LIFECYCLE_POLICY, ...overrides };
  assertPositiveInteger("maxCallDurationMs", policy.maxCallDurationMs);
  assertPositiveInteger("silenceTimeoutMs", policy.silenceTimeoutMs);
  if (!Number.isInteger(policy.maxSilenceReprompts) || policy.maxSilenceReprompts < 0) {
    throw new RangeError("maxSilenceReprompts must be a non-negative integer");
  }
  return policy;
}

/* ── End reasons ─────────────────────────────────────────────────────── */

export const VOICE_CALL_END_REASONS = [
  "CALLER_HANGUP",
  "SILENCE_TIMEOUT",
  "MAX_DURATION",
  "STT_FAILURE",
  "TTS_FAILURE",
  "AGENT_FAILURE",
  "TENANT_REJECTED",
  "RUNTIME_FAILURE",
  /**
   * The ClinicBridge agent intentionally ended a normally completed conversation, after its
   * final reply was played. Lifecycle only: says nothing about the conversation outcome.
   */
  "AGENT_COMPLETED",
] as const;

export type VoiceCallEndReason = (typeof VOICE_CALL_END_REASONS)[number];

const FAILURE_END_REASONS: ReadonlySet<VoiceCallEndReason> = new Set([
  "STT_FAILURE",
  "TTS_FAILURE",
  "AGENT_FAILURE",
  "RUNTIME_FAILURE",
]);

export function isFailureEndReason(reason: VoiceCallEndReason): boolean {
  return FAILURE_END_REASONS.has(reason);
}

/**
 * Phase 2 `endCallSession` reason for an end reason. TENANT_REJECTED returns null:
 * tenant resolution fails before any Phase 2 session exists. Every non-failure reason
 * (including AGENT_COMPLETED) is "completed" only if a business turn completed.
 */
export function toSessionEndReason(
  reason: VoiceCallEndReason,
  completedTurns: number
): NonNullable<EndCallSessionInput["reason"]> | null {
  if (reason === "TENANT_REJECTED") return null;
  if (isFailureEndReason(reason)) return "failed";
  return completedTurns > 0 ? "completed" : "abandoned";
}

/** How playback of the final reply of a turn with `endCallSuggested` ended. */
export type FinalReplyPlaybackOutcome = "PLAYED" | "PLAYBACK_FAILED" | "CALLER_HANGUP";

/**
 * End reason once the final reply of an `endCallSuggested` turn has stopped playing.
 * AGENT_COMPLETED only when the reply was actually delivered to the caller.
 */
export function endReasonAfterFinalReply(outcome: FinalReplyPlaybackOutcome): VoiceCallEndReason {
  switch (outcome) {
    case "PLAYED":
      return "AGENT_COMPLETED";
    case "PLAYBACK_FAILED":
      return "TTS_FAILURE";
    case "CALLER_HANGUP":
      return "CALLER_HANGUP";
  }
}

/* ── Call phase ──────────────────────────────────────────────────────── */

export type VoiceCallPhase = "LISTENING" | "PROCESSING" | "SPEAKING" | "ENDING" | "ENDED";

/* ── Max duration ────────────────────────────────────────────────────── */

export type CallDurationDecision =
  | { action: "CONTINUE"; remainingMs: number }
  | { action: "END_CALL"; endReason: "MAX_DURATION" };

export function evaluateCallDuration(
  params: { startedAtMs: number; nowMs: number },
  policy: VoiceLifecyclePolicy = DEFAULT_VOICE_LIFECYCLE_POLICY
): CallDurationDecision {
  const elapsed = Math.max(0, params.nowMs - params.startedAtMs);
  const remainingMs = policy.maxCallDurationMs - elapsed;
  return remainingMs > 0 ? { action: "CONTINUE", remainingMs } : { action: "END_CALL", endReason: "MAX_DURATION" };
}

/* ── Silence ─────────────────────────────────────────────────────────── */

export interface SilenceState {
  readonly consecutiveSilenceTimeouts: number;
}

export const INITIAL_SILENCE_STATE: SilenceState = Object.freeze({ consecutiveSilenceTimeouts: 0 });

export type SilenceDecision =
  | { action: "REPROMPT"; state: SilenceState; fallback: "NO_SPEECH_REPROMPT" }
  | { action: "END_CALL"; state: SilenceState; endReason: "SILENCE_TIMEOUT"; fallback: "SILENCE_GOODBYE" };

/** Silence timers only run while waiting for the caller. */
export function isSilenceTimerActive(phase: VoiceCallPhase): boolean {
  return phase === "LISTENING";
}

export function onSilenceTimeout(
  state: SilenceState,
  policy: VoiceLifecyclePolicy = DEFAULT_VOICE_LIFECYCLE_POLICY
): SilenceDecision {
  const next: SilenceState = { consecutiveSilenceTimeouts: state.consecutiveSilenceTimeouts + 1 };
  if (next.consecutiveSilenceTimeouts > policy.maxSilenceReprompts) {
    return { action: "END_CALL", state: next, endReason: "SILENCE_TIMEOUT", fallback: "SILENCE_GOODBYE" };
  }
  return { action: "REPROMPT", state: next, fallback: "NO_SPEECH_REPROMPT" };
}

export function onCallerSpeech(): SilenceState {
  return INITIAL_SILENCE_STATE;
}

/* ── Barge-in ────────────────────────────────────────────────────────── */

export type BargeInDecision =
  | { allowInterruptions: true; reason: "DEFAULT" }
  | { allowInterruptions: false; reason: "APPOINTMENT_CONFIRMATION_SUMMARY" };

/**
 * Whether the caller may interrupt playback of the reply produced by this turn.
 * Uses structured appointment state only. The confirmation summary must be heard
 * in full before a following "evet/yes" can submit the appointment.
 */
export function resolveBargeIn(
  turn: Pick<VoiceTurnResult, "appointmentState"> | null | undefined,
  policy: VoiceLifecyclePolicy = DEFAULT_VOICE_LIFECYCLE_POLICY
): BargeInDecision {
  const state = turn?.appointmentState;
  if (state && policy.uninterruptibleAppointmentStates.includes(state)) {
    return { allowInterruptions: false, reason: "APPOINTMENT_CONFIRMATION_SUMMARY" };
  }
  return { allowInterruptions: true, reason: "DEFAULT" };
}

/* ── Caller speech routing / in-flight protection ────────────────────── */

/** An active Agent Core turn is never cancelled and never runs concurrently. */
export const IN_FLIGHT_TURN_POLICY = Object.freeze({
  allowConcurrentAgentTurns: false,
  cancelActiveTurnOnCallerSpeech: false,
  cancelActiveTurnOnHangup: false,
} as const);

export type CallerSpeechAction =
  /** Finalized utterance may start a new Agent Core turn. */
  | "START_TURN"
  /** Keep the utterance; submit it after the in-flight turn completes. */
  | "BUFFER"
  /** Stop assistant playback; the utterance then starts a turn. */
  | "INTERRUPT_PLAYBACK"
  /** Drop it: playback is uninterruptible or the call is ending. */
  | "DISCARD";

export function routeCallerSpeech(params: {
  phase: VoiceCallPhase;
  turnInFlight: boolean;
  bargeIn: BargeInDecision;
}): CallerSpeechAction {
  const { phase, turnInFlight, bargeIn } = params;
  if (phase === "ENDING" || phase === "ENDED") return "DISCARD";
  if (turnInFlight || phase === "PROCESSING") return "BUFFER";
  if (phase === "SPEAKING") return bargeIn.allowInterruptions ? "INTERRUPT_PLAYBACK" : "DISCARD";
  return "START_TURN";
}

/**
 * What to do with speech buffered during the in-flight turn once its reply is known.
 * Speech captured before an uninterruptible reply (confirmation summary) was said
 * before the caller heard it and must not be submitted as an answer to it.
 */
export function resolveBufferedSpeechAfterTurn(bargeIn: BargeInDecision): "SUBMIT" | "DISCARD" {
  return bargeIn.allowInterruptions ? "SUBMIT" : "DISCARD";
}

export function canStartAgentTurn(params: { phase: VoiceCallPhase; turnInFlight: boolean }): boolean {
  if (params.turnInFlight) return false;
  return params.phase === "LISTENING";
}

/* ── Fixed fallback speech ───────────────────────────────────────────── */

export type VoiceFallbackCategory =
  | "TECHNICAL_FAILURE"
  | "NO_SPEECH_REPROMPT"
  | "SILENCE_GOODBYE"
  | "MAX_DURATION_GOODBYE";

const FALLBACK_SPEECH: Record<"tr" | "en", Record<VoiceFallbackCategory, string>> = {
  tr: {
    TECHNICAL_FAILURE: "Üzgünüm, şu anda teknik bir sorun yaşıyoruz. Lütfen daha sonra tekrar deneyin.",
    NO_SPEECH_REPROMPT: "Sizi duyamadım. Size nasıl yardımcı olabilirim?",
    SILENCE_GOODBYE: "Sizi duyamadığım için görüşmeyi sonlandırıyorum. İyi günler dileriz.",
    MAX_DURATION_GOODBYE: "Görüşme süremiz doldu. Bizi aradığınız için teşekkür ederiz.",
  },
  en: {
    TECHNICAL_FAILURE: "Sorry, we are experiencing a technical issue. Please try again later.",
    NO_SPEECH_REPROMPT: "I couldn't hear you. How can I help you?",
    SILENCE_GOODBYE: "As I can't hear you, I will end the call now. Have a nice day.",
    MAX_DURATION_GOODBYE: "We have reached the maximum call length. Thank you for calling.",
  },
};

/** Fixed, generic fallback text. Unknown locales fall back to Turkish. */
export function getFallbackSpeech(category: VoiceFallbackCategory, locale?: string): string {
  const lang = (locale || "").toLowerCase().startsWith("en") ? "en" : "tr";
  return FALLBACK_SPEECH[lang][category];
}

/**
 * Fallback to speak before ending for a given end reason, or null when nothing can or
 * should be spoken (caller already gone, speech synthesis itself failed, or the agent's
 * own final reply was already played).
 */
export function fallbackForEndReason(reason: VoiceCallEndReason): VoiceFallbackCategory | null {
  switch (reason) {
    case "CALLER_HANGUP":
    case "TTS_FAILURE":
    case "AGENT_COMPLETED":
      return null;
    case "SILENCE_TIMEOUT":
      return "SILENCE_GOODBYE";
    case "MAX_DURATION":
      return "MAX_DURATION_GOODBYE";
    case "STT_FAILURE":
    case "AGENT_FAILURE":
    case "TENANT_REJECTED":
    case "RUNTIME_FAILURE":
      return "TECHNICAL_FAILURE";
  }
}
