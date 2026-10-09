import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";
import {
  createCallController,
  type CallController,
  type CallControllerOptions,
  type RuntimeLeaseOperations,
} from "@/lib/voice/runtime/callController";
import type {
  ProcessRuntimeTranscriptResult,
  RuntimeTurnOutput,
  StartRuntimeCallResult,
  VoiceRuntimeBridge,
  VoiceRuntimeCall,
} from "@/lib/voice/runtime/voiceRuntimeBridge";
import { deriveCallBindingId, formatTurnId } from "@/lib/voice/telephony/callBinding";
import { fallbackForEndReason, getFallbackSpeech, INITIAL_SILENCE_STATE } from "@/lib/voice/telephony/lifecyclePolicy";
import type { SpeechPlaybackOutcome } from "@/workers/voice/src/call/playback";
import type { SpeechSessionHandlers, SpeechSessionPort } from "@/workers/voice/src/call/ports";
import { buildVoiceSessionConfig } from "@/workers/voice/src/call/sessionConfig";
import { createSilenceScheduler } from "@/workers/voice/src/call/silenceScheduler";
import {
  assertSpeechStackConfig,
  planSpeechStack,
  resolveSpeechStack,
  SpeechStackConfigError,
  VOICE_ENDPOINTING_OVERRIDES,
  VOICE_TTS_VOICE_ENV,
  VOICE_VAD_OPTIONS,
  type SpeechStackPlan,
} from "@/workers/voice/src/call/speechStack";
import { computeTurnLatency } from "@/workers/voice/src/call/turnLatency";
import { runVoiceCall, type VoiceCallDeps } from "@/workers/voice/src/call/voiceCall";
import { createWorkerLogger } from "@/workers/voice/src/call/workerLog";
import { checkCriticalFacts, TURKISH_EVAL_PHRASES } from "@/workers/voice/src/eval/turkishSpeechEval";
import {
  enforceFrameworkLogLevel,
  FRAMEWORK_LOG_LEVEL,
  FrameworkLogPolicyError,
} from "@/workers/voice/src/frameworkLogPolicy";
import type { SipParticipantLike } from "@/workers/voice/src/sipIdentity";

/* ── Fixtures ────────────────────────────────────────────────────────── */

const T0 = Date.UTC(2026, 9, 8, 9, 0, 0);
const DID = "+908502428852";
const CALLER_PHONE = "+905551112233";
const SIP_CALL_ID = "SCL_speech";
const BINDING_ID = deriveCallBindingId(`livekit-sip:${SIP_CALL_ID}`) as string;
const SUFFIX = BINDING_ID.slice(3);
const TOKEN_MARKER = "T0KENsecretVALUE";
const TOKEN = `vrl_${TOKEN_MARKER.padEnd(43, "x")}`;
const VOICE_ID = "0b6f3c9e-1a2b-4c3d-8e9f-a1b2c3d4e5f6";
const SILENCE_MS = 8_000;
const RENEW_MS = 10_000;

const WORKER_SRC = resolve(__dirname, "../workers/voice/src");

function sipParticipant(): SipParticipantLike {
  return {
    kind: 3,
    attributes: {
      "sip.trunkPhoneNumber": DID,
      "sip.callID": SIP_CALL_ID,
      "sip.trunkID": "ST_allowed",
      "sip.ruleID": "SDR_allowed",
      "sip.phoneNumber": CALLER_PHONE,
    },
  };
}

function makeCall(lifecycle: Partial<VoiceRuntimeCall["lifecycle"]> = {}): VoiceRuntimeCall {
  return Object.freeze({
    bindingId: BINDING_ID,
    clinicId: "clinic_a",
    didE164: DID,
    callSessionId: `call_${SUFFIX}`,
    conversationId: `voice_conv_${SUFFIX}`,
    locale: "tr-TR",
    lifecycle: Object.freeze({
      startedAtMs: T0,
      maxCallDurationMs: 15 * 60 * 1000,
      silenceTimeoutMs: SILENCE_MS,
      maxSilenceReprompts: 2,
      silence: INITIAL_SILENCE_STATE,
      bargeIn: { allowInterruptions: true, reason: "DEFAULT" } as const,
      ...lifecycle,
    }),
  });
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolveFn!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolveFn = r;
  });
  return { promise, resolve: resolveFn };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 100; i++) await Promise.resolve();
}

function turnResult(seq: number, overrides: Partial<RuntimeTurnOutput> = {}): ProcessRuntimeTranscriptResult {
  return {
    ok: true,
    action: "PROCESS",
    turn: {
      turnId: formatTurnId(BINDING_ID, seq),
      turnSeq: seq,
      replyText: `REPLY_SECRET_${seq}`,
      speechText: `SPEECH_SECRET_${seq}`,
      appointmentCreated: false,
      escalationRequested: false,
      endCallSuggested: false,
      idempotentReplay: false,
      allowBargeIn: true,
      bargeIn: { allowInterruptions: true, reason: "DEFAULT" },
      bufferedSpeech: "SUBMIT",
      ...overrides,
    },
  };
}

const FINAL_TURN: Partial<RuntimeTurnOutput> = { endCallSuggested: true };

function makeLease() {
  const expiresAt = () => new Date(Date.now() + 30_000).toISOString();
  return {
    acquire: vi.fn<RuntimeLeaseOperations["acquire"]>(async (input) => ({
      ok: true,
      takeover: false,
      lease: { ...input, generation: 1, leaseToken: TOKEN, expiresAt: expiresAt(), leaseDurationMs: 30_000, clockSource: "LOCAL_CLOCK" },
    })),
    renew: vi.fn<RuntimeLeaseOperations["renew"]>(async (proof) => ({
      ok: true,
      generation: proof.generation,
      expiresAt: expiresAt(),
      clockSource: "LOCAL_CLOCK",
    })),
    verify: vi.fn<RuntimeLeaseOperations["verify"]>(async (proof) => ({
      ok: true,
      generation: proof.generation,
      expiresAt: expiresAt(),
      remainingMs: 25_000,
      clockSource: "LOCAL_CLOCK",
    })),
    release: vi.fn<RuntimeLeaseOperations["release"]>(async () => ({ ok: true, alreadyReleased: false })),
  };
}

function makeBridge(start: StartRuntimeCallResult) {
  const turns: Array<{ transcript: string; deferred: Deferred<ProcessRuntimeTranscriptResult>; settled: boolean }> = [];
  const startRuntimeCall = vi.fn<VoiceRuntimeBridge["startRuntimeCall"]>(async () => start);
  const processRuntimeTranscript = vi.fn<VoiceRuntimeBridge["processRuntimeTranscript"]>((input) => {
    const entry = { transcript: input.transcript, deferred: deferred<ProcessRuntimeTranscriptResult>(), settled: false };
    turns.push(entry);
    return entry.deferred.promise.finally(() => {
      entry.settled = true;
    });
  });
  const endRuntimeCall = vi.fn<VoiceRuntimeBridge["endRuntimeCall"]>(async (input) => ({
    ok: true,
    reason: input.reason,
    bindingStatus: "ENDED",
    sessionEndReason: "completed",
    sessionEnded: true,
    alreadyEnded: false,
    fallback: fallbackForEndReason(input.reason),
  }));
  return { startRuntimeCall, processRuntimeTranscript, endRuntimeCall, turns };
}

interface SpokenSpeech {
  text: string;
  allowInterruptions: boolean;
  finish(outcome: SpeechPlaybackOutcome): void;
  firstAudio(at: number): void;
}

function makeSpeech() {
  const says: SpokenSpeech[] = [];
  let handlers: SpeechSessionHandlers | null = null;
  const port = {
    start: vi.fn<SpeechSessionPort["start"]>(async (h) => {
      handlers = h;
    }),
    say: vi.fn<SpeechSessionPort["say"]>((text, options) => {
      const outcome = deferred<SpeechPlaybackOutcome>();
      const started = deferred<number | null>();
      void outcome.promise.then(() => started.resolve(null));
      says.push({ text, allowInterruptions: options.allowInterruptions, finish: outcome.resolve, firstAudio: started.resolve });
      return { outcome: outcome.promise, started: started.promise };
    }),
    interruptAll: vi.fn<SpeechSessionPort["interruptAll"]>(() => {
      for (const s of says) s.finish("INTERRUPTED");
    }),
    close: vi.fn<SpeechSessionPort["close"]>(async () => {}),
  };
  return {
    port,
    says,
    get handlers(): SpeechSessionHandlers {
      if (!handlers) throw new Error("speech session not started");
      return handlers;
    },
  };
}

function makeTransport() {
  let disconnect: (() => void) | null = null;
  let connected = true;
  return {
    port: {
      onCallerDisconnected: vi.fn((listener: () => void) => {
        disconnect = listener;
      }),
      isCallerConnected: vi.fn(() => connected),
      hangUp: vi.fn(async () => {}),
      shutdownJob: vi.fn<(reason: string) => void>(),
    },
    callerHangsUp() {
      connected = false;
      disconnect?.();
    },
    callerLeavesSilently() {
      connected = false;
    },
  };
}

interface HarnessOptions {
  call?: VoiceRuntimeCall;
  created?: boolean;
  speechAvailable?: boolean;
  limits?: VoiceCallDeps["limits"];
}

function harness(options: HarnessOptions = {}) {
  const lines: string[] = [];
  const lease = makeLease();
  const bridge = makeBridge({ ok: true, call: options.call ?? makeCall(), created: options.created ?? true });
  const speech = makeSpeech();
  const transport = makeTransport();
  const controllers: CallController[] = [];
  const submitted: string[] = [];
  const createSpeech = vi.fn(() => speech.port);
  const call = runVoiceCall({
    participant: sipParticipant(),
    sipTrust: { allowedTrunkIds: ["ST_allowed"], allowedRuleIds: ["SDR_allowed"] },
    bridge,
    lease,
    ownerId: "worker-1:job-1",
    speech: { available: () => options.speechAvailable ?? true, create: createSpeech },
    transport: transport.port,
    log: createWorkerLogger((line) => lines.push(line)),
    createController: (controllerOptions: CallControllerOptions) => {
      const controller = createCallController({ ...controllerOptions, renewIntervalMs: RENEW_MS });
      const submitTranscript = controller.submitTranscript;
      controller.submitTranscript = (text) => {
        submitted.push(text);
        return submitTranscript(text);
      };
      controllers.push(controller);
      return controller;
    },
    ...(options.limits ? { limits: options.limits } : {}),
  });
  return { call, lines, lease, bridge, speech, transport, controllers, submitted, createSpeech };
}

type Harness = ReturnType<typeof harness>;

/** A started call with the greeting already played. */
async function startedCall(options: HarnessOptions = {}): Promise<Harness> {
  const h = harness(options);
  await flush();
  expect(h.speech.port.start).toHaveBeenCalledTimes(1);
  for (const s of h.speech.says) s.finish("COMPLETED");
  h.speech.says.length = 0;
  await flush();
  return h;
}

async function exchange(h: Harness, transcript: string, result: ProcessRuntimeTranscriptResult): Promise<void> {
  h.speech.handlers.onFinalTranscript(transcript);
  await flush();
  h.bridge.turns[h.bridge.turns.length - 1].deferred.resolve(result);
  await flush();
}

/** Lets the silence countdown elapse once and returns the speech it produced. */
async function silenceElapses(h: Harness): Promise<SpokenSpeech> {
  const before = h.speech.says.length;
  await vi.advanceTimersByTimeAsync(SILENCE_MS);
  expect(h.speech.says).toHaveLength(before + 1);
  return h.speech.says[before];
}

function endReasons(h: Harness): string[] {
  return h.bridge.endRuntimeCall.mock.calls.map((c) => c[0].reason);
}

function workerSourceFiles(dir = WORKER_SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return workerSourceFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function workerSource(relative: string): string {
  return stripComments(readFileSync(join(WORKER_SRC, relative), "utf8"));
}

function plan(): SpeechStackPlan {
  const planned = planSpeechStack({ [VOICE_TTS_VOICE_ENV]: VOICE_ID });
  if (!planned.ok) throw new Error(planned.code);
  return planned.plan;
}

const FAKE_VAD = { kind: "vad" } as const;

function fakeFactories(overrides: Partial<Parameters<typeof resolveSpeechStack>[1]> = {}) {
  return {
    vad: FAKE_VAD as unknown,
    createStt: vi.fn((p: SpeechStackPlan["stt"]) => ({ kind: "stt", p }) as unknown),
    createTts: vi.fn((p: SpeechStackPlan["tts"]) => ({ kind: "tts", p }) as unknown),
    createTurnDetector: vi.fn((p: SpeechStackPlan["turnDetector"]) => ({ kind: "eot", p }) as unknown),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

/* ── A. Providers ────────────────────────────────────────────────────── */

describe("A. speech providers", () => {
  const providersSource = workerSource("livekit/speechProviders.ts");
  const sessionSource = workerSource("livekit/speechSession.ts");

  it("1. STT is Turkish Deepgram Nova-3 via LiveKit Inference, with formatting pinned off", () => {
    expect(plan().stt).toEqual({
      model: "deepgram/nova-3",
      language: "tr",
      modelOptions: { smart_format: false, numerals: false, mip_opt_out: true },
    });
    expect(providersSource).toContain(
      "new inference.STT({ model: plan.model, language: plan.language, modelOptions: { ...plan.modelOptions } })"
    );
    expect(sessionSource).toContain("stt: providers.stt");
  });

  it("2. TTS is Turkish Cartesia Sonic 3.5 with a staff-chosen voice; missing or invalid voice fails closed", () => {
    expect(plan().tts).toEqual({ model: "cartesia/sonic-3.5", language: "tr", voice: VOICE_ID });
    expect(providersSource).toContain(
      "new inference.TTS({ model: plan.model, voice: plan.voice, language: plan.language })"
    );
    expect(sessionSource).toContain("tts: providers.tts");
    expect(planSpeechStack({})).toEqual({ ok: false, code: "TTS_VOICE_MISSING" });
    expect(planSpeechStack({ [VOICE_TTS_VOICE_ENV]: "  " })).toEqual({ ok: false, code: "TTS_VOICE_MISSING" });
    expect(planSpeechStack({ [VOICE_TTS_VOICE_ENV]: "jacqueline" })).toEqual({ ok: false, code: "TTS_VOICE_INVALID" });
  });

  it("3. VAD is supplied explicitly (prewarmed Silero); a missing native model fails closed", () => {
    const resolved = resolveSpeechStack(plan(), fakeFactories());
    expect(resolved.ok && resolved.providers.vad).toBe(FAKE_VAD);
    const noVad = fakeFactories({ vad: null });
    expect(resolveSpeechStack(plan(), noVad)).toEqual({ ok: false, code: "VAD_UNAVAILABLE" });
    expect(noVad.createStt).not.toHaveBeenCalled();
    expect(VOICE_VAD_OPTIONS.minSilenceDuration).toBeGreaterThanOrEqual(250);
    expect(providersSource.indexOf("native.initVad()")).toBeGreaterThan(-1);
    expect(providersSource.indexOf("native.initVad()")).toBeLessThan(providersSource.indexOf("new inference.VAD("));
    expect(workerSource("agent.ts")).toContain("proc.userData.vad = prewarmVoiceVad()");
    expect(sessionSource).toContain("vad: providers.vad");
  });

  it("4. the LiveKit audio turn detector is supplied explicitly; only maxDelay is overridden (Turkish phone hold)", () => {
    expect(plan().turnDetector).toEqual({ version: "v1" });
    const resolved = resolveSpeechStack(plan(), fakeFactories());
    expect(resolved.ok && resolved.providers.turnDetection).toEqual({ kind: "eot", p: { version: "v1" } });
    expect(providersSource).toContain("new inference.TurnDetector({ version: plan.version })");
    expect(sessionSource).toContain("turnDetection: providers.turnDetection");
    // minDelay stays LiveKit's 300 ms; maxDelay 2500 → 1500 bounds the "caller sounds unfinished" hold.
    expect(VOICE_ENDPOINTING_OVERRIDES).toEqual({ maxDelay: 1_500 });
    expect(Object.isFrozen(VOICE_ENDPOINTING_OVERRIDES)).toBe(true);
    expect(buildVoiceSessionConfig().session.turnHandling.endpointing).toEqual({ maxDelay: 1_500 });
    // Conservative bounds: never below the 1.2 s hesitation floor, never above the old default.
    expect(VOICE_ENDPOINTING_OVERRIDES.maxDelay).toBeGreaterThanOrEqual(1_200);
    expect(VOICE_ENDPOINTING_OVERRIDES.maxDelay).toBeLessThan(2_500);
    expect(VOICE_ENDPOINTING_OVERRIDES.minDelay).toBeUndefined();
    // The VAD silence that precedes the hold is unchanged (turn detector needs ≥ 250 ms).
    expect(VOICE_VAD_OPTIONS.minSilenceDuration).toBe(250);
    const failing = fakeFactories({
      createTurnDetector: () => {
        throw new Error("apiKey is required");
      },
    });
    expect(resolveSpeechStack(plan(), failing)).toEqual({ ok: false, code: "TURN_DETECTOR_INIT_FAILED" });
  });

  it("5. provider init failure stops the call before startRuntimeCall; no error text is surfaced", async () => {
    const secret = "LIVEKIT_SECRET_VALUE";
    const failing = fakeFactories({
      createStt: () => {
        throw new Error(`apiSecret is required ${secret}`);
      },
    });
    const result = resolveSpeechStack(plan(), failing);
    expect(result).toEqual({ ok: false, code: "STT_INIT_FAILED" });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(
      resolveSpeechStack(
        plan(),
        fakeFactories({
          createTts: () => {
            throw new Error("boom");
          },
        })
      )
    ).toEqual({ ok: false, code: "TTS_INIT_FAILED" });

    const h = harness({ speechAvailable: false });
    await expect(h.call.done).resolves.toEqual({ outcome: "SPEECH_UNAVAILABLE" });
    expect(h.bridge.startRuntimeCall).not.toHaveBeenCalled();
    expect(h.lease.acquire).not.toHaveBeenCalled();
    expect(h.createSpeech).not.toHaveBeenCalled();
    expect(workerSource("agent.ts")).toContain("available: () => speechStack.ok");

    expect(() => assertSpeechStackConfig({})).toThrow(SpeechStackConfigError);
    const main = workerSource("main.ts");
    expect(main.indexOf("assertSpeechStackConfig(process.env)")).toBeGreaterThan(-1);
    expect(main.indexOf("assertSpeechStackConfig(process.env)")).toBeLessThan(main.indexOf("cli.runApp(options)"));
  });

  it("6. no LLM is part of the speech stack", () => {
    const config = buildVoiceSessionConfig();
    expect(config.agent.llm).toBeNull();
    expect(config.session).not.toHaveProperty("llm");
    expect(providersSource).not.toMatch(/inference\.LLM|RealtimeModel|\bllm\b/);
    const sessionOptions = sessionSource.match(/createSession\(\{([\s\S]*?)\n {2}\}\);/)?.[1] ?? "";
    expect(sessionOptions).toContain("stt: providers.stt");
    expect(sessionOptions).not.toMatch(/\bllm\b/);
  });
});

/* ── B. STT ──────────────────────────────────────────────────────────── */

describe("B. STT boundary", () => {
  it("7. interim transcripts never reach the CallController", async () => {
    const h = await startedCall();
    h.speech.handlers.onUserSpeaking();
    h.speech.handlers.onUserStoppedSpeaking();
    await flush();
    expect(h.submitted).toEqual([]);
    expect(workerSource("livekit/speechSession.ts")).not.toMatch(/UserInputTranscribed|isFinal|interim/i);
    const agent = workerSource("livekit/transcriptAgent.ts");
    expect(agent).toContain("onUserTurnCompleted");
    expect(agent.match(/onFinalTranscript\(/g)).toHaveLength(1);
  });

  it("8. a final transcript reaches the controller exactly once", async () => {
    const h = await startedCall();
    h.speech.handlers.onFinalTranscript(" 12 Ekim Pazartesi saat üç uygun mu? ");
    await flush();
    expect(h.submitted).toEqual(["12 Ekim Pazartesi saat üç uygun mu?"]);
    expect(h.bridge.processRuntimeTranscript).toHaveBeenCalledTimes(1);
    expect(h.bridge.turns[0].transcript).toBe("12 Ekim Pazartesi saat üç uygun mu?");
  });

  it("9. empty final transcripts are ignored", async () => {
    const h = await startedCall();
    h.speech.handlers.onFinalTranscript("");
    h.speech.handlers.onFinalTranscript(" \n\t ");
    await flush();
    expect(h.submitted).toEqual([]);
    expect(h.bridge.processRuntimeTranscript).not.toHaveBeenCalled();
  });

  it("10. transcripts and audio are never persisted by the worker", () => {
    for (const file of workerSourceFiles()) {
      const source = stripComments(readFileSync(file, "utf8"));
      expect(source, file).not.toMatch(/from "(node:)?fs(\/promises)?"|writeFile|appendFile|createWriteStream/);
      expect(source, file).not.toMatch(/\.collection\(|\.doc\(|firebase-admin\/firestore/);
      expect(source, file).not.toMatch(/RecorderIO|recordingOptions|record:\s*true/);
    }
  });
});

/* ── C. TTS ──────────────────────────────────────────────────────────── */

describe("C. TTS boundary", () => {
  it("11. only turn.speechText is spoken", async () => {
    const h = await startedCall();
    await exchange(h, "merhaba", turnResult(1));
    expect(h.speech.says.map((s) => s.text)).toEqual(["SPEECH_SECRET_1"]);
  });

  it("12. allowBargeIn maps to allowInterruptions for each reply", async () => {
    const h = await startedCall();
    await exchange(h, "bir", turnResult(1, { allowBargeIn: false, bufferedSpeech: "DISCARD" }));
    h.speech.says[0].finish("COMPLETED");
    await flush();
    await exchange(h, "iki", turnResult(2, { allowBargeIn: true }));
    expect(h.speech.says.map((s) => s.allowInterruptions)).toEqual([false, true]);
  });

  it("13. TTS runtime failures end the call with TTS_FAILURE", async () => {
    const reply = await startedCall();
    await exchange(reply, "merhaba", turnResult(1));
    reply.speech.says[0].finish("FAILED");
    await flush();
    expect(endReasons(reply)).toEqual(["TTS_FAILURE"]);

    const closed = await startedCall();
    closed.speech.handlers.onClosed({ kind: "ERROR", errorType: "tts_error" });
    await flush();
    expect(endReasons(closed)).toEqual(["TTS_FAILURE"]);

    const reprompt = await startedCall();
    (await silenceElapses(reprompt)).finish("FAILED");
    await flush();
    expect(endReasons(reprompt)).toEqual(["TTS_FAILURE"]);
  });

  it("14. AGENT_COMPLETED requires the final reply to play out successfully", async () => {
    const interrupted = await startedCall();
    await exchange(interrupted, "teşekkürler", turnResult(1, FINAL_TURN));
    interrupted.speech.says[0].finish("INTERRUPTED");
    await flush();
    expect(interrupted.bridge.endRuntimeCall).not.toHaveBeenCalled();

    const played = await startedCall();
    await exchange(played, "teşekkürler", turnResult(1, FINAL_TURN));
    expect(played.bridge.endRuntimeCall).not.toHaveBeenCalled();
    played.speech.says[0].finish("COMPLETED");
    await flush();
    expect(endReasons(played)).toEqual(["AGENT_COMPLETED"]);
  });
});

/* ── D. Silence ──────────────────────────────────────────────────────── */

describe("D. silence re-arm", () => {
  const REPROMPT = getFallbackSpeech("NO_SPEECH_REPROMPT", "tr-TR");
  const GOODBYE = getFallbackSpeech("SILENCE_GOODBYE", "tr-TR");

  it("15. the first silence timeout plays an interruptible reprompt", async () => {
    const h = await startedCall();
    await vi.advanceTimersByTimeAsync(SILENCE_MS - 1);
    expect(h.speech.says).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.speech.says).toHaveLength(1);
    const [first] = h.speech.says;
    expect(first.text).toBe(REPROMPT);
    expect(first.allowInterruptions).toBe(true);
    expect(h.bridge.endRuntimeCall).not.toHaveBeenCalled();
  });

  it("16. after the reprompt plays, the countdown re-arms and a second reprompt follows", async () => {
    const h = await startedCall();
    (await silenceElapses(h)).finish("COMPLETED");
    await flush();
    const second = await silenceElapses(h);
    expect(second.text).toBe(REPROMPT);
    expect(h.bridge.endRuntimeCall).not.toHaveBeenCalled();
  });

  it("17. the third timeout says goodbye and finishes with SILENCE_TIMEOUT", async () => {
    const h = await startedCall();
    for (let i = 0; i < 2; i++) {
      (await silenceElapses(h)).finish("COMPLETED");
      await flush();
    }
    const goodbye = await silenceElapses(h);
    expect(goodbye.text).toBe(GOODBYE);
    expect(goodbye.allowInterruptions).toBe(false);
    expect(endReasons(h)).toEqual(["SILENCE_TIMEOUT"]);
    expect(h.transport.port.hangUp).not.toHaveBeenCalled();
    goodbye.finish("COMPLETED");
    await flush();
    expect(h.transport.port.hangUp).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.speech.says).toHaveLength(3);
  });

  it("18. accepted caller speech resets the reprompt count", async () => {
    const h = await startedCall();
    for (let i = 0; i < 2; i++) {
      (await silenceElapses(h)).finish("COMPLETED");
      await flush();
    }
    await exchange(h, "evet", turnResult(1));
    h.speech.says[2].finish("COMPLETED");
    await flush();
    expect((await silenceElapses(h)).text).toBe(REPROMPT);
    expect(h.bridge.endRuntimeCall).not.toHaveBeenCalled();
  });

  it("18b. voice activity alone (no accepted transcript) pauses but does not reset the count", async () => {
    const h = await startedCall();
    for (let i = 0; i < 2; i++) {
      (await silenceElapses(h)).finish("COMPLETED");
      await flush();
    }
    h.speech.handlers.onUserSpeaking();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.speech.says).toHaveLength(2);
    h.speech.handlers.onUserStoppedSpeaking();
    expect((await silenceElapses(h)).text).toBe(GOODBYE);
    expect(endReasons(h)).toEqual(["SILENCE_TIMEOUT"]);
  });

  it("19. the countdown is paused while a business turn is processing", async () => {
    const h = await startedCall();
    h.speech.handlers.onFinalTranscript("implant fiyatı");
    await flush();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.speech.says).toHaveLength(0);
    h.bridge.turns[0].deferred.resolve(turnResult(1));
    await flush();
    expect(h.speech.says.map((s) => s.text)).toEqual(["SPEECH_SECRET_1"]);
  });

  it("20. the countdown is paused while assistant speech is playing", async () => {
    const h = await startedCall();
    await exchange(h, "merhaba", turnResult(1));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.speech.says.map((s) => s.text)).toEqual(["SPEECH_SECRET_1"]);
  });

  it("21. the countdown re-arms when the call returns to listening", async () => {
    const h = await startedCall();
    await exchange(h, "merhaba", turnResult(1));
    await vi.advanceTimersByTimeAsync(20_000);
    h.speech.says[0].finish("COMPLETED");
    await flush();
    await vi.advanceTimersByTimeAsync(SILENCE_MS - 1);
    expect(h.speech.says).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.speech.says.map((s) => s.text)).toEqual(["SPEECH_SECRET_1", REPROMPT]);
  });

  it("22. race: caller speech at the timeout instant wins; a timer already queued is ignored", async () => {
    const h = await startedCall();
    await vi.advanceTimersByTimeAsync(SILENCE_MS - 1);
    h.speech.handlers.onUserSpeaking();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.speech.says).toHaveLength(0);

    const queued: Array<() => void> = [];
    const onTimeout = vi.fn();
    const scheduler = createSilenceScheduler({
      timer: { setTimeout: (fn) => queued.push(fn), clearTimeout: () => undefined },
      timeoutMs: SILENCE_MS,
      onTimeout,
    });
    scheduler.setListening(true);
    scheduler.setListening(false);
    queued[0]();
    expect(onTimeout).not.toHaveBeenCalled();
    scheduler.setListening(true);
    scheduler.stop();
    queued[1]();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("22b. race: a transcript right after the goodbye cannot reopen the call", async () => {
    const h = await startedCall();
    for (let i = 0; i < 2; i++) {
      (await silenceElapses(h)).finish("COMPLETED");
      await flush();
    }
    await silenceElapses(h);
    h.speech.handlers.onFinalTranscript("alo");
    await flush();
    expect(h.bridge.processRuntimeTranscript).not.toHaveBeenCalled();
    expect(endReasons(h)).toEqual(["SILENCE_TIMEOUT"]);
  });

  it("23. MAX_DURATION stays controller-owned and stops the silence countdown", async () => {
    const h = await startedCall({ call: makeCall({ maxCallDurationMs: 20_000 }) });
    for (let i = 0; i < 2; i++) {
      (await silenceElapses(h)).finish("COMPLETED");
      await flush();
    }
    await vi.advanceTimersByTimeAsync(4_000);
    expect(h.speech.says.map((s) => s.text)).toEqual([
      REPROMPT,
      REPROMPT,
      getFallbackSpeech("MAX_DURATION_GOODBYE", "tr-TR"),
    ]);
    expect(endReasons(h)).toEqual(["MAX_DURATION"]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.speech.says).toHaveLength(3);
    expect(endReasons(h)).toEqual(["MAX_DURATION"]);
  });
});

/* ── E. Privacy ──────────────────────────────────────────────────────── */

describe("E. privacy", () => {
  it("24. the framework log level is forced to error; verbose levels refuse to start", () => {
    const env: Record<string, string | undefined> = {};
    enforceFrameworkLogLevel(env, ["node", "main.mjs", "start"]);
    expect(env.LOG_LEVEL).toBe(FRAMEWORK_LOG_LEVEL);
    for (const level of ["error", "fatal", "ERROR"]) {
      const ok: Record<string, string | undefined> = { LOG_LEVEL: level };
      enforceFrameworkLogLevel(ok, ["node", "main.mjs", "start"]);
      expect(ok.LOG_LEVEL).toBe(level.toLowerCase());
    }
    for (const level of ["trace", "debug", "info", "warn"]) {
      expect(() => enforceFrameworkLogLevel({ LOG_LEVEL: level }, ["node", "main.mjs", "start"])).toThrow(FrameworkLogPolicyError);
      expect(() => enforceFrameworkLogLevel({}, ["node", "main.mjs", "start", "--log-level", level])).toThrow(FrameworkLogPolicyError);
      expect(() => enforceFrameworkLogLevel({}, ["node", "main.mjs", "start", `--log-level=${level}`])).toThrow(FrameworkLogPolicyError);
    }
    const main = workerSource("main.ts");
    const enforced = main.indexOf("enforceFrameworkLogLevel(process.env, process.argv)");
    expect(enforced).toBeGreaterThan(-1);
    expect(enforced).toBeLessThan(main.indexOf("readVoiceWorkerConfig(process.env)"));
    expect(enforced).toBeLessThan(main.indexOf("cli.runApp(options)"));
    expect(JSON.parse(readFileSync(resolve(__dirname, "../workers/voice/package.json"), "utf8")).scripts.start).not.toContain("--log-level");
  });

  it("25. worker logs (including latency) carry no caller data, transcript, reply, speech or token", async () => {
    const h = await startedCall();
    h.speech.handlers.onUserSpeaking();
    h.speech.handlers.onUserStoppedSpeaking();
    await exchange(h, "TRANSCRIPT_SECRET_1", turnResult(1));
    h.speech.says[0].firstAudio(Date.now());
    h.speech.says[0].finish("COMPLETED");
    await flush();
    await exchange(h, "TRANSCRIPT_SECRET_2", turnResult(2, FINAL_TURN));
    h.speech.says[1].finish("COMPLETED");
    await h.call.done;
    const haystack = h.lines.join("\n");
    for (const secret of [CALLER_PHONE, CALLER_PHONE.slice(1), "TRANSCRIPT_SECRET", "REPLY_SECRET", "SPEECH_SECRET", TOKEN_MARKER, SIP_CALL_ID]) {
      expect(haystack).not.toContain(secret);
    }
    const latency = h.lines.map((line) => JSON.parse(line)).filter((entry) => entry.checkpoint === "VOICE_WORKER_TURN_LATENCY");
    expect(latency.length).toBeGreaterThan(0);
    for (const entry of latency) {
      for (const [key, value] of Object.entries(entry)) {
        if (key.endsWith("Ms")) expect(Number.isInteger(value)).toBe(true);
      }
    }
  });

  it("26. recording, transcription publishing, text input and chat context stay disabled", () => {
    const config = buildVoiceSessionConfig();
    expect(config.start.record).toBe(false);
    expect(config.start.output.transcriptionEnabled).toBe(false);
    expect(config.start.input.textEnabled).toBe(false);
    expect(config.say.addToChatCtx).toBe(false);
    expect(config.session.userAwayTimeout).toBeNull();
    const session = workerSource("livekit/speechSession.ts");
    expect(session).toContain("record: config.start.record");
    expect(session).toContain("outputOptions: config.start.output");
    expect(session).toContain("addToChatCtx: config.say.addToChatCtx");
    expect(session).toContain("userAwayTimeout: config.session.userAwayTimeout");
  });
});

/* ── F. Architecture ─────────────────────────────────────────────────── */

describe("F. architecture", () => {
  it("27. no LLM, realtime model or OpenAI chat anywhere in the worker", () => {
    for (const file of workerSourceFiles()) {
      const source = stripComments(readFileSync(file, "utf8"));
      expect(source, file).not.toMatch(/generateReply|llmNode|RealtimeModel|inference\.LLM|from "openai"|aiGateway|chat\.completions/);
    }
  });

  it("28. the worker never calls processVoiceTurn, the voice adapter or the agent turn handler", () => {
    for (const file of workerSourceFiles()) {
      const source = stripComments(readFileSync(file, "utf8"));
      expect(source, file).not.toMatch(/processVoiceTurn|handleClinicAgentTurn|voiceAdapter/);
    }
  });

  it("29. the worker creates no turn IDs; latency logs carry the controller's turnSeq", async () => {
    for (const file of workerSourceFiles()) {
      const source = stripComments(readFileSync(file, "utf8"));
      expect(source, file).not.toMatch(/formatTurnId|turnSeq\s*(\+\+|\+=|=\s*\w+\s*\+)/);
    }
    const h = await startedCall();
    await exchange(h, "bir", turnResult(7));
    h.speech.says[0].finish("COMPLETED");
    await flush();
    const latency = h.lines.map((line) => JSON.parse(line)).find((entry) => entry.checkpoint === "VOICE_WORKER_TURN_LATENCY");
    expect(latency.turnSeq).toBe(7);
  });

  it("30. Agent Core (via the CallController) is the only path from caller speech to a reply", async () => {
    const h = await startedCall();
    await exchange(h, "bir", turnResult(1));
    h.speech.says[0].finish("COMPLETED");
    await flush();
    await exchange(h, "iki", turnResult(2));
    expect(h.bridge.processRuntimeTranscript.mock.calls.map((c) => c[0].transcript)).toEqual(h.submitted);
    expect(h.speech.says.map((s) => s.text)).toEqual(["SPEECH_SECRET_1", "SPEECH_SECRET_2"]);
  });
});

/* ── G. Lifecycle ────────────────────────────────────────────────────── */

describe("G. lifecycle", () => {
  it("31. ownership loss suppresses all later speech, including silence reprompts", async () => {
    const h = await startedCall();
    await exchange(h, "bir", turnResult(1));
    h.speech.handlers.onFinalTranscript("iki");
    await flush();
    h.lease.renew.mockResolvedValue({ ok: false, code: "RUNTIME_LEASE_TOKEN_MISMATCH" });
    await vi.advanceTimersByTimeAsync(RENEW_MS);
    h.bridge.turns[1].deferred.resolve(turnResult(2));
    await flush();
    expect(h.speech.port.interruptAll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.speech.says.map((s) => s.text)).toEqual(["SPEECH_SECRET_1"]);
    expect(h.bridge.endRuntimeCall).not.toHaveBeenCalled();
  });

  it("32. a known caller hangup wins over a completed final reply", async () => {
    const h = await startedCall();
    await exchange(h, "teşekkürler", turnResult(1, FINAL_TURN));
    h.transport.callerLeavesSilently();
    h.speech.says[0].finish("COMPLETED");
    await flush();
    expect(endReasons(h)).toEqual(["CALLER_HANGUP"]);
    expect(h.transport.port.hangUp).not.toHaveBeenCalled();
  });

  it("33. a stale completion cannot end the call after a newer transcript was accepted", async () => {
    const h = await startedCall();
    await exchange(h, "teşekkürler", turnResult(1, FINAL_TURN));
    h.speech.handlers.onFinalTranscript("bir sorum daha var");
    await flush();
    h.speech.says[0].finish("COMPLETED");
    await flush();
    expect(h.bridge.endRuntimeCall).not.toHaveBeenCalled();
    expect(h.lines.some((line) => line.includes("VOICE_WORKER_STALE_COMPLETION_IGNORED"))).toBe(true);
  });

  it("34. job shutdown never cancels the in-flight Agent Core turn", async () => {
    const h = await startedCall({ limits: { shutdownWaitMs: 1_000 } });
    h.speech.handlers.onFinalTranscript("randevu oluştur");
    await flush();
    let shutdownDone = false;
    void h.call.shutdown().then(() => {
      shutdownDone = true;
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(shutdownDone).toBe(true);
    expect(h.bridge.turns[0].settled).toBe(false);
    expect(h.bridge.endRuntimeCall).not.toHaveBeenCalled();
    h.bridge.turns[0].deferred.resolve(turnResult(1, { appointmentCreated: true }));
    await flush();
    expect(h.bridge.turns[0].settled).toBe(true);
    expect(endReasons(h)).toEqual(["RUNTIME_FAILURE"]);
  });
});

/* ── Telemetry and evaluation harness ────────────────────────────────── */

describe("latency telemetry", () => {
  it("computes non-negative integer spans and omits unknown ones", () => {
    expect(
      computeTurnLatency(
        { callerStoppedAt: 1_000, finalTranscriptAt: 1_400.4, agentStartAt: 1_450, agentEndAt: 2_650, speakRequestedAt: 2_660 },
        2_960
      )
    ).toEqual({ eouToFinalMs: 400, finalToAgentStartMs: 50, agentCoreMs: 1_200, ttsFirstAudioMs: 300, userTurnToFirstAudioMs: 1_960 });
    expect(computeTurnLatency({ callerStoppedAt: null, finalTranscriptAt: 5_000 }, null)).toEqual({});
    expect(computeTurnLatency({ callerStoppedAt: 9_000, finalTranscriptAt: 5_000 }, null)).toEqual({});
  });

  it("logs one latency entry per spoken reply with the measured spans", async () => {
    const h = await startedCall();
    h.speech.handlers.onUserSpeaking();
    await vi.advanceTimersByTimeAsync(1_000);
    h.speech.handlers.onUserStoppedSpeaking();
    await vi.advanceTimersByTimeAsync(400);
    h.speech.handlers.onFinalTranscript("merhaba");
    await flush();
    await vi.advanceTimersByTimeAsync(1_200);
    h.bridge.turns[0].deferred.resolve(turnResult(1));
    await flush();
    await vi.advanceTimersByTimeAsync(300);
    h.speech.says[0].firstAudio(Date.now());
    await flush();
    const latency = h.lines.map((line) => JSON.parse(line)).filter((entry) => entry.checkpoint === "VOICE_WORKER_TURN_LATENCY");
    expect(latency).toHaveLength(1);
    expect(latency[0]).toMatchObject({
      turnSeq: 1,
      eouToFinalMs: 400,
      finalToAgentStartMs: 0,
      agentCoreMs: 1_200,
      ttsFirstAudioMs: 300,
      userTurnToFirstAudioMs: 1_900,
    });
    h.speech.says[0].finish("COMPLETED");
    await flush();
    expect(h.lines.filter((line) => line.includes("VOICE_WORKER_TURN_LATENCY"))).toHaveLength(1);
  });
});

describe("Turkish evaluation harness", () => {
  it("covers the eight pilot phrases with critical facts and no patient data", () => {
    expect(TURKISH_EVAL_PHRASES.map((p) => p.expected)).toEqual([
      "İmplant tedavisi hakkında bilgi almak istiyorum.",
      "12 Ekim Pazartesi saat üç uygun mu?",
      "Randevumu saat on dörtten on ikiye alabilir miyiz?",
      "Telefon numaram sıfır beş yüz otuz bir...",
      "Dr. Ahmet ile görüşmek istiyorum.",
      "Fiyat iki bin beş yüz TL mi?",
      "Yüzde yirmi indirim var mı?",
      "Cumartesi öğleden sonra uygun musunuz?",
    ]);
    for (const phrase of TURKISH_EVAL_PHRASES) {
      expect(phrase.criticalFacts.length).toBeGreaterThan(0);
      expect(checkCriticalFacts(phrase, phrase.expected)).toEqual([]);
    }
  });

  it("flags facts that did not survive STT, accepting digit or word renderings", () => {
    const [, dateTime, , , , price] = TURKISH_EVAL_PHRASES;
    expect(checkCriticalFacts(dateTime, "on iki ekim pazartesi saat 3 uygun mu")).toEqual([]);
    expect(checkCriticalFacts(dateTime, "12 ekim saat")).toEqual(["weekday", "hour"]);
    expect(checkCriticalFacts(price, "fiyat 2.500 TL mi")).toEqual([]);
    expect(checkCriticalFacts(price, "fiyat iki bin mi")).toEqual(["amount", "currency"]);
    expect(checkCriticalFacts(TURKISH_EVAL_PHRASES[0], "İMPLANT tedavisi")).toEqual([]);
  });
});
