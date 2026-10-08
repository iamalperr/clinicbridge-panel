/**
 * Provider-neutral ports between the call orchestrator (voiceCall.ts) and the transport adapter
 * (livekit/*). The orchestrator never sees room names, participant identities or raw SIP data.
 */

import type { VoiceRuntimeCall } from "@/lib/voice/runtime/voiceRuntimeBridge";
import type { SpeechPlaybackOutcome } from "./playback";
import type { SpeechSessionClose } from "./transportEvents";

export interface SpeechPlayback {
  /** Settles once this speech finished playing out; never rejects. */
  readonly outcome: Promise<SpeechPlaybackOutcome>;
  /** Epoch ms of the first played-out audio, or null if playout never started; telemetry only. */
  readonly started?: Promise<number | null>;
}

export interface SpeechSessionHandlers {
  /** A committed (final) caller turn. Interim transcripts never arrive here. */
  onFinalTranscript(text: string): void;
  /** Voice activity started on the caller's audio. */
  onUserSpeaking(): void;
  /** Voice activity on the caller's audio ended. */
  onUserStoppedSpeaking(): void;
  onClosed(close: SpeechSessionClose): void;
}

export interface SpeechSessionPort {
  start(handlers: SpeechSessionHandlers): Promise<void>;
  say(text: string, options: { allowInterruptions: boolean }): SpeechPlayback;
  /** Force-stops any speech in progress, including uninterruptible speech. */
  interruptAll(): void;
  close(): Promise<void>;
}

export interface SpeechSessionFactory {
  /** False when the speech stack could not be initialized: no call is started at all. */
  available(): boolean;
  create(input: { call: VoiceRuntimeCall }): SpeechSessionPort;
}

export interface CallTransportPort {
  onCallerDisconnected(listener: () => void): void;
  /** Synchronous presence check; false once the caller is known to have left. */
  isCallerConnected(): boolean;
  /** Disconnects the caller. Only used after this worker ended a call it owned. */
  hangUp(): Promise<void>;
  /** Ends this worker's job. Never ends the call by itself. */
  shutdownJob(reason: string): void;
}
