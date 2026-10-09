/**
 * Turkish speech stack for the voice worker, as plain typed data plus a provider-neutral,
 * fail-closed resolver. The LiveKit adapter (livekit/speechProviders.ts) supplies the concrete
 * constructors; this module never imports a provider SDK so it stays root-testable.
 *
 * Every component is served by LiveKit Inference with the worker's LiveKit credentials
 * (LIVEKIT_API_KEY / LIVEKIT_API_SECRET); no extra vendor key exists or is read here.
 *   STT  deepgram/nova-3, language "tr"      (docs: Turkish listed, EU endpoint available)
 *   TTS  cartesia/sonic-3.5, language "tr"   (docs: Turkish listed, EU endpoint available)
 *   VAD  local Silero (bundled native model, prewarmed per process)
 *   EOT  LiveKit audio turn detector "v1"    (docs: Turkish supported; falls back to the local
 *        "v1-mini" model, which lists Turkish, when the cloud model is unavailable)
 *
 * STT formatting is pinned off (smart_format, numerals) so dates, prices, phone numbers and
 * times reach Agent Core as the provider heard them, never silently reformatted.
 */

export const VOICE_TTS_VOICE_ENV = "CLINICBRIDGE_VOICE_TTS_VOICE_ID";

export const VOICE_SPEECH_LANGUAGE = "tr";

/** Cartesia voice IDs are UUIDs; the voice is chosen by staff, never invented in code. */
const VOICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Endpointing overrides in milliseconds, merged over LiveKit's audio-turn-detector defaults
 * (minDelay 300, maxDelay 2500 in @livekit/agents 1.9.1). Both delays count from the caller's
 * last voiced audio. minDelay applies when the detector judges the turn complete; maxDelay
 * applies while the caller sounds unfinished ("12 Ekim saat ..."), and any resumed speech
 * cancels the wait. maxDelay 1500 still leaves a 1.5 s pause for mid-sentence hesitation.
 */
export interface VoiceEndpointingOverrides {
  minDelay?: number;
  maxDelay?: number;
}

export const VOICE_ENDPOINTING_OVERRIDES: Readonly<VoiceEndpointingOverrides> = Object.freeze({ maxDelay: 1_500 });

/** Local Silero VAD thresholds, pinned to the @livekit/agents 1.9.1 defaults (milliseconds). */
export const VOICE_VAD_OPTIONS = Object.freeze({
  minSpeechDuration: 50,
  /** The audio turn detector requires at least 250 ms. */
  minSilenceDuration: 250,
  prefixPaddingDuration: 500,
  activationThreshold: 0.5,
  deactivationThreshold: 0.35,
});

export interface SpeechStackPlan {
  stt: {
    model: "deepgram/nova-3";
    language: typeof VOICE_SPEECH_LANGUAGE;
    modelOptions: { smart_format: false; numerals: false; mip_opt_out: true };
  };
  tts: { model: "cartesia/sonic-3.5"; language: typeof VOICE_SPEECH_LANGUAGE; voice: string };
  turnDetector: { version: "v1" };
}

export type SpeechStackErrorCode =
  | "TTS_VOICE_MISSING"
  | "TTS_VOICE_INVALID"
  | "VAD_UNAVAILABLE"
  | "STT_INIT_FAILED"
  | "TTS_INIT_FAILED"
  | "TURN_DETECTOR_INIT_FAILED";

export class SpeechStackConfigError extends Error {
  readonly code: SpeechStackErrorCode;

  constructor(code: SpeechStackErrorCode) {
    super(`Voice worker speech stack unavailable: ${code}.`);
    this.name = "SpeechStackConfigError";
    this.code = code;
  }
}

type EnvRecord = Readonly<Record<string, string | undefined>>;

export type SpeechStackPlanResult = { ok: true; plan: SpeechStackPlan } | { ok: false; code: SpeechStackErrorCode };

export function planSpeechStack(env: EnvRecord): SpeechStackPlanResult {
  const voice = env[VOICE_TTS_VOICE_ENV]?.trim();
  if (!voice) return { ok: false, code: "TTS_VOICE_MISSING" };
  if (!VOICE_ID_PATTERN.test(voice)) return { ok: false, code: "TTS_VOICE_INVALID" };
  return {
    ok: true,
    plan: {
      stt: {
        model: "deepgram/nova-3",
        language: VOICE_SPEECH_LANGUAGE,
        modelOptions: { smart_format: false, numerals: false, mip_opt_out: true },
      },
      tts: { model: "cartesia/sonic-3.5", language: VOICE_SPEECH_LANGUAGE, voice },
      turnDetector: { version: "v1" },
    },
  };
}

/** Startup check: refuses to register the worker when the speech stack cannot be planned. */
export function assertSpeechStackConfig(env: EnvRecord): SpeechStackPlan {
  const planned = planSpeechStack(env);
  if (!planned.ok) throw new SpeechStackConfigError(planned.code);
  return planned.plan;
}

export interface SpeechStackFactories<Stt, Tts, Vad, TurnDetector> {
  /** Process-level VAD from prewarm; null when the native model could not be loaded. */
  vad: Vad | null;
  createStt(plan: SpeechStackPlan["stt"]): Stt;
  createTts(plan: SpeechStackPlan["tts"]): Tts;
  createTurnDetector(plan: SpeechStackPlan["turnDetector"]): TurnDetector;
}

export interface ResolvedSpeechStack<Stt, Tts, Vad, TurnDetector> {
  stt: Stt;
  tts: Tts;
  vad: Vad;
  turnDetection: TurnDetector;
}

export type SpeechStackResult<Stt, Tts, Vad, TurnDetector> =
  | { ok: true; providers: ResolvedSpeechStack<Stt, Tts, Vad, TurnDetector> }
  | { ok: false; code: SpeechStackErrorCode };

function attempt<T>(create: () => T): T | null {
  try {
    return create();
  } catch {
    // Constructor errors (e.g. missing LiveKit credentials) are reported by code only.
    return null;
  }
}

/** All four components or nothing: any failure means no call is started. */
export function resolveSpeechStack<Stt, Tts, Vad, TurnDetector>(
  plan: SpeechStackPlan,
  factories: SpeechStackFactories<Stt, Tts, Vad, TurnDetector>
): SpeechStackResult<Stt, Tts, Vad, TurnDetector> {
  const vad = factories.vad;
  if (vad === null) return { ok: false, code: "VAD_UNAVAILABLE" };
  const stt = attempt(() => factories.createStt(plan.stt));
  if (stt === null) return { ok: false, code: "STT_INIT_FAILED" };
  const tts = attempt(() => factories.createTts(plan.tts));
  if (tts === null) return { ok: false, code: "TTS_INIT_FAILED" };
  const turnDetection = attempt(() => factories.createTurnDetector(plan.turnDetector));
  if (turnDetection === null) return { ok: false, code: "TURN_DETECTOR_INIT_FAILED" };
  return { ok: true, providers: { stt, tts, vad, turnDetection } };
}
