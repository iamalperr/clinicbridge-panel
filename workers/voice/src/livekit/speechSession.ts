/**
 * LiveKit AgentSession adapter for the provider-neutral SpeechSessionPort. Transport and speech
 * only: the session has no LLM, records nothing, publishes no transcription, accepts no text
 * input, and links only to the trusted SIP participant's audio.
 *
 * Playback outcome (verified against @livekit/agents 1.9.1 SpeechHandle):
 *   waitForPlayout() settles when the speech is done, whether it completed or was interrupted;
 *   exception() carries a synthesis/playout task error; `interrupted` marks a stopped speech.
 *   A TTS error event raised while the speech was playing also counts as failed.
 *
 * First audio (telemetry only): say() playout emits AgentStateChanged → "speaking" on its first
 * played frame. Speech handles play in order, so the event is attributed to the oldest handle
 * that has not started yet.
 */

import { voice } from "@livekit/agents";
import { ParticipantKind, type Room } from "@livekit/rtc-node";
import { classifySpeechPlayback, type SpeechPlaybackOutcome } from "../call/playback";
import type { SpeechPlayback, SpeechSessionHandlers, SpeechSessionPort } from "../call/ports";
import type { VoiceSessionConfig } from "../call/sessionConfig";
import type { SpeechSessionClose } from "../call/transportEvents";
import type { VoiceSpeechProviders } from "./speechProviders";
import { ClinicBridgeTranscriptAgent } from "./transcriptAgent";

export type AgentSessionLike = Pick<voice.AgentSession, "on" | "start" | "say" | "close">;

export interface LiveKitSpeechSessionInput {
  room: Room;
  /** Media linking only (never tenant identity, never logged). */
  linkedParticipantIdentity: string;
  providers: VoiceSpeechProviders;
  config: VoiceSessionConfig;
  createSession?: (options: voice.AgentSessionOptions) => AgentSessionLike;
}

interface TrackedSpeech {
  handle: voice.SpeechHandle;
  markStarted: (at: number | null) => void;
  started: boolean;
}

function toSessionClose(event: voice.CloseEvent): SpeechSessionClose {
  switch (event.reason) {
    case voice.CloseReason.PARTICIPANT_DISCONNECTED:
      return { kind: "PARTICIPANT_DISCONNECTED" };
    case voice.CloseReason.JOB_SHUTDOWN:
      return { kind: "JOB_SHUTDOWN" };
    case voice.CloseReason.ERROR: {
      const type = event.error?.type;
      return { kind: "ERROR", errorType: type === "stt_error" || type === "tts_error" ? type : "other" };
    }
    default:
      return { kind: "OTHER" };
  }
}

export function createLiveKitSpeechSession(input: LiveKitSpeechSessionInput): SpeechSessionPort {
  const { room, providers, config } = input;
  const createSession = input.createSession ?? ((options: voice.AgentSessionOptions) => new voice.AgentSession(options));
  const endpointing = config.session.turnHandling.endpointing;
  const session = createSession({
    stt: providers.stt,
    tts: providers.tts,
    vad: providers.vad,
    userAwayTimeout: config.session.userAwayTimeout,
    turnHandling: {
      turnDetection: providers.turnDetection,
      preemptiveGeneration: config.session.turnHandling.preemptiveGeneration,
      interruption: config.session.turnHandling.interruption,
      ...(Object.keys(endpointing).length > 0 ? { endpointing: { ...endpointing } } : {}),
    },
  });

  const tracked: TrackedSpeech[] = [];
  let ttsErrorCount = 0;

  session.on(voice.AgentSessionEventTypes.Error, (event) => {
    if (event.error.type === "tts_error") ttsErrorCount += 1;
  });
  session.on(voice.AgentSessionEventTypes.AgentStateChanged, (event) => {
    if (event.newState !== "speaking") return;
    const next = tracked.find((entry) => !entry.started);
    if (next) next.markStarted(event.createdAt);
  });

  return {
    async start(handlers: SpeechSessionHandlers) {
      session.on(voice.AgentSessionEventTypes.UserStateChanged, (event) => {
        if (event.newState === "speaking") handlers.onUserSpeaking();
        else if (event.oldState === "speaking") handlers.onUserStoppedSpeaking();
      });
      session.on(voice.AgentSessionEventTypes.Close, (event) => handlers.onClosed(toSessionClose(event)));

      const agent = new ClinicBridgeTranscriptAgent(config.agent, handlers.onFinalTranscript);
      await session.start({
        agent,
        room,
        record: config.start.record,
        inputOptions: {
          ...config.start.input,
          participantIdentity: input.linkedParticipantIdentity,
          participantKinds: [ParticipantKind.SIP],
        },
        outputOptions: config.start.output,
      });
    },

    say(text, options): SpeechPlayback {
      const ttsErrorsBefore = ttsErrorCount;
      let handle: voice.SpeechHandle;
      try {
        handle = session.say(text, {
          allowInterruptions: options.allowInterruptions,
          addToChatCtx: config.say.addToChatCtx,
        });
      } catch {
        return { outcome: Promise.resolve<SpeechPlaybackOutcome>("FAILED"), started: Promise.resolve(null) };
      }
      let resolveStarted!: (at: number | null) => void;
      const started = new Promise<number | null>((resolve) => {
        resolveStarted = resolve;
      });
      const entry: TrackedSpeech = {
        handle,
        started: false,
        markStarted: (at) => {
          if (entry.started) return;
          entry.started = true;
          resolveStarted(at);
        },
      };
      tracked.push(entry);
      const outcome = handle.waitForPlayout().then(
        () =>
          classifySpeechPlayback({
            failed: handle.exception() !== undefined || ttsErrorCount !== ttsErrorsBefore,
            interrupted: handle.interrupted,
          }),
        (): SpeechPlaybackOutcome => "FAILED"
      );
      void outcome.finally(() => {
        entry.markStarted(null);
        const index = tracked.indexOf(entry);
        if (index >= 0) tracked.splice(index, 1);
      });
      return { outcome, started };
    },

    interruptAll() {
      for (const { handle } of tracked) {
        try {
          handle.interrupt(true);
        } catch {
          // Already done.
        }
      }
    },

    async close() {
      await session.close();
    },
  };
}
