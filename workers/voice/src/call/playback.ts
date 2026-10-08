/**
 * Speech playback outcomes, independent of the speech provider.
 */

import type { FinalReplyPlaybackOutcome } from "@/lib/voice/telephony/lifecyclePolicy";

export type SpeechPlaybackOutcome = "COMPLETED" | "INTERRUPTED" | "FAILED";

/** What the transport observed once a single speech finished playing out. */
export interface SpeechPlaybackObservation {
  /** Synthesis/playout raised an error for this speech. */
  failed: boolean;
  /** Playback was stopped before the end (barge-in or forced stop). */
  interrupted: boolean;
}

/** A failed speech was not heard in full, whether or not it was also interrupted. */
export function classifySpeechPlayback(observation: SpeechPlaybackObservation): SpeechPlaybackOutcome {
  if (observation.failed) return "FAILED";
  if (observation.interrupted) return "INTERRUPTED";
  return "COMPLETED";
}

/**
 * Maps playback of a reply to the lifecyclePolicy final-reply outcome. A caller hangup wins
 * over whatever the playback reported; null means the call continues (interrupted by the caller).
 */
export function finalReplyPlaybackOutcome(
  outcome: SpeechPlaybackOutcome,
  callerGone: boolean
): FinalReplyPlaybackOutcome | null {
  if (callerGone) return "CALLER_HANGUP";
  if (outcome === "FAILED") return "PLAYBACK_FAILED";
  if (outcome === "COMPLETED") return "PLAYED";
  return null;
}
