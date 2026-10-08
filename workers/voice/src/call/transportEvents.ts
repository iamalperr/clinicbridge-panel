/**
 * Transport events → canonical call end reasons. The controller's finish() is exactly-once, so
 * these only propose a reason; the first finish request wins.
 */

import type { VoiceCallEndReason } from "@/lib/voice/telephony/lifecyclePolicy";

/** Why the speech session closed, reduced to what the end mapping needs (no raw errors). */
export type SpeechSessionClose =
  | { kind: "PARTICIPANT_DISCONNECTED" }
  | { kind: "ERROR"; errorType: "stt_error" | "tts_error" | "other" }
  | { kind: "JOB_SHUTDOWN" }
  | { kind: "OTHER" };

export function endReasonForSessionClose(
  close: SpeechSessionClose,
  context: { callerGone: boolean }
): VoiceCallEndReason {
  if (context.callerGone || close.kind === "PARTICIPANT_DISCONNECTED") return "CALLER_HANGUP";
  if (close.kind === "ERROR") {
    if (close.errorType === "stt_error") return "STT_FAILURE";
    if (close.errorType === "tts_error") return "TTS_FAILURE";
  }
  return "RUNTIME_FAILURE";
}

/** The job is shutting down while the call is still open. */
export function endReasonForJobShutdown(context: { callerGone: boolean }): VoiceCallEndReason {
  return context.callerGone ? "CALLER_HANGUP" : "RUNTIME_FAILURE";
}
