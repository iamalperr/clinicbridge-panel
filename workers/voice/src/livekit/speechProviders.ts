/**
 * Concrete LiveKit speech providers for the Turkish stack planned in call/speechStack.ts
 * (verified against @livekit/agents 1.9.1 `inference.*`).
 *
 * - VAD: local Silero via the bundled `@livekit/local-inference` native model, created once per
 *   process in prewarm. inference.VAD silently degrades to a no-op stream when the native binding
 *   is missing, so the binding is loaded explicitly first and its absence fails closed.
 * - STT / TTS / turn detector: LiveKit Inference, created per job (the turn detector's local
 *   fallback needs the job's inference executor). Their constructors throw when the LiveKit
 *   credentials are missing; resolveSpeechStack turns that into an error code, never a log of
 *   the error itself.
 */

import { createRequire } from "node:module";
import { inference, type stt, type tts, type VAD, type voice } from "@livekit/agents";
import {
  planSpeechStack,
  resolveSpeechStack,
  VOICE_VAD_OPTIONS,
  type SpeechStackErrorCode,
} from "../call/speechStack";

export type VoiceTurnDetection = NonNullable<NonNullable<voice.AgentSessionOptions["turnHandling"]>["turnDetection"]>;

export interface VoiceSpeechProviders {
  stt: stt.STT;
  tts: tts.TTS;
  vad: VAD;
  turnDetection: VoiceTurnDetection;
}

export type SpeechProvidersResult = { ok: true; providers: VoiceSpeechProviders } | { ok: false; code: SpeechStackErrorCode };

type LocalInferenceModule = typeof import("@livekit/local-inference");

/** Process-level VAD for prewarm; null when the native Silero model cannot be loaded. */
export function prewarmVoiceVad(): VAD | null {
  try {
    const native = createRequire(import.meta.url)("@livekit/local-inference") as LocalInferenceModule;
    native.initVad();
    return new inference.VAD({ model: "silero", ...VOICE_VAD_OPTIONS });
  } catch {
    return null;
  }
}

export function resolveSpeechProviders(input: {
  env: Readonly<Record<string, string | undefined>>;
  vad: VAD | null;
}): SpeechProvidersResult {
  const planned = planSpeechStack(input.env);
  if (!planned.ok) return planned;
  return resolveSpeechStack<stt.STT, tts.TTS, VAD, VoiceTurnDetection>(planned.plan, {
    vad: input.vad,
    createStt: (plan) =>
      new inference.STT({ model: plan.model, language: plan.language, modelOptions: { ...plan.modelOptions } }),
    createTts: (plan) => new inference.TTS({ model: plan.model, voice: plan.voice, language: plan.language }),
    createTurnDetector: (plan) => new inference.TurnDetector({ version: plan.version }),
  });
}
