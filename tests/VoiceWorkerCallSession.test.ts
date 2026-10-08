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
import { createCompletionGuard } from "@/workers/voice/src/call/completionGuard";
import { resolveCallGreeting } from "@/workers/voice/src/call/greeting";
import { classifySpeechPlayback, finalReplyPlaybackOutcome, type SpeechPlaybackOutcome } from "@/workers/voice/src/call/playback";
import type { SpeechSessionHandlers, SpeechSessionPort } from "@/workers/voice/src/call/ports";
import { buildVoiceSessionConfig } from "@/workers/voice/src/call/sessionConfig";
import { endReasonForJobShutdown, endReasonForSessionClose } from "@/workers/voice/src/call/transportEvents";
import { runVoiceCall, type VoiceCallDeps } from "@/workers/voice/src/call/voiceCall";
import { createWorkerLogger } from "@/workers/voice/src/call/workerLog";
import type { SipParticipantLike, SipTrustPolicy } from "@/workers/voice/src/sipIdentity";

/* ── Fixtures ────────────────────────────────────────────────────────── */

const T0 = Date.UTC(2026, 9, 7, 12, 0, 0);
const DID = "+908502428852";
const CALLER_PHONE = "+905551112233";
const SIP_CALL_ID = "SCL_test";
const EXTERNAL_KEY = `livekit-sip:${SIP_CALL_ID}`;
const BINDING_ID = deriveCallBindingId(EXTERNAL_KEY) as string;
const SUFFIX = BINDING_ID.slice(3);
const OWNER = "worker-1:job-1";
const TOKEN_MARKER = "T0KENsecretVALUE";
const TOKEN = `vrl_${TOKEN_MARKER.padEnd(43, "x")}`;
const PARTICIPANT_IDENTITY = `sip_${CALLER_PHONE}`;
const ROOM_NAME = `call-${CALLER_PHONE}-room`;
const RENEW_MS = 10_000;

const WORKER_SRC = resolve(__dirname, "../workers/voice/src");

function sipParticipant(attributes: Record<string, string> = {}): SipParticipantLike {
  return {
    kind: 3,
    attributes: {
      "sip.trunkPhoneNumber": DID,
      "sip.callID": SIP_CALL_ID,
      "sip.trunkID": "ST_allowed",
      "sip.ruleID": "SDR_allowed",
      "sip.phoneNumber": CALLER_PHONE,
      ...attributes,
    },
  };
}

function makeCall(overrides: Partial<Omit<VoiceRuntimeCall, "lifecycle">> = {}): VoiceRuntimeCall {
  return Object.freeze({
    bindingId: BINDING_ID,
    clinicId: "clinic_a",
    didE164: DID,
    callSessionId: `call_${SUFFIX}`,
    conversationId: `voice_conv_${SUFFIX}`,
    locale: "tr-TR",
    ...overrides,
    lifecycle: Object.freeze({
      startedAtMs: T0,
      maxCallDurationMs: 15 * 60 * 1000,
      silenceTimeoutMs: 8_000,
      maxSilenceReprompts: 2,
      silence: INITIAL_SILENCE_STATE,
      bargeIn: { allowInterruptions: true, reason: "DEFAULT" } as const,
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
const UNINTERRUPTIBLE: Partial<RuntimeTurnOutput> = {
  allowBargeIn: false,
  bargeIn: { allowInterruptions: false, reason: "APPOINTMENT_CONFIRMATION_SUMMARY" },
  bufferedSpeech: "DISCARD",
  appointmentState: "AWAITING_CONFIRMATION",
};

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
  let inFlight = 0;
  let maxInFlight = 0;
  const startRuntimeCall = vi.fn<VoiceRuntimeBridge["startRuntimeCall"]>(async () => start);
  const processRuntimeTranscript = vi.fn<VoiceRuntimeBridge["processRuntimeTranscript"]>((input) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    const entry = { transcript: input.transcript, deferred: deferred<ProcessRuntimeTranscriptResult>(), settled: false };
    turns.push(entry);
    return entry.deferred.promise.finally(() => {
      inFlight -= 1;
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
  return {
    startRuntimeCall,
    processRuntimeTranscript,
    endRuntimeCall,
    turns,
    get maxInFlight() {
      return maxInFlight;
    },
  };
}

function makeSpeech() {
  const says: Array<{ text: string; allowInterruptions: boolean; finish(outcome: SpeechPlaybackOutcome): void }> = [];
  let handlers: SpeechSessionHandlers | null = null;
  const port = {
    start: vi.fn<SpeechSessionPort["start"]>(async (h) => {
      handlers = h;
    }),
    say: vi.fn<SpeechSessionPort["say"]>((text, options) => {
      const d = deferred<SpeechPlaybackOutcome>();
      says.push({ text, allowInterruptions: options.allowInterruptions, finish: d.resolve });
      return { outcome: d.promise };
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
  const port = {
    onCallerDisconnected: vi.fn((listener: () => void) => {
      disconnect = listener;
    }),
    isCallerConnected: vi.fn(() => connected),
    hangUp: vi.fn(async () => {}),
    shutdownJob: vi.fn<(reason: string) => void>(),
  };
  return {
    port,
    callerHangsUp() {
      connected = false;
      disconnect?.();
    },
    /** The caller left but the disconnect event has not been delivered yet. */
    callerLeavesSilently() {
      connected = false;
    },
  };
}

interface HarnessOptions {
  participant?: SipParticipantLike;
  sipTrust?: SipTrustPolicy;
  start?: StartRuntimeCallResult;
  created?: boolean;
  call?: VoiceRuntimeCall;
  speechAvailable?: boolean;
  limits?: VoiceCallDeps["limits"];
}

function harness(options: HarnessOptions = {}) {
  const lines: string[] = [];
  const lease = makeLease();
  const start: StartRuntimeCallResult = options.start ?? {
    ok: true,
    call: options.call ?? makeCall(),
    created: options.created ?? true,
  };
  const bridge = makeBridge(start);
  const speech = makeSpeech();
  const transport = makeTransport();
  const controllers: CallController[] = [];
  const submitted: string[] = [];
  const createSpeech = vi.fn(() => speech.port);
  const call = runVoiceCall({
    participant: options.participant ?? sipParticipant(),
    sipTrust: options.sipTrust ?? { allowedTrunkIds: ["ST_allowed"], allowedRuleIds: ["SDR_allowed"] },
    bridge,
    lease,
    ownerId: OWNER,
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
  return {
    call,
    lines,
    lease,
    bridge,
    speech,
    transport,
    controllers,
    submitted,
    createSpeech,
    controller(): CallController {
      expect(controllers).toHaveLength(1);
      return controllers[0];
    },
  };
}

/** A started call with the greeting (if any) already played. */
async function startedCall(options: HarnessOptions = {}) {
  const h = harness(options);
  await flush();
  expect(h.speech.port.start).toHaveBeenCalledTimes(1);
  for (const s of h.speech.says) s.finish("COMPLETED");
  h.speech.says.length = 0;
  await flush();
  return h;
}

/** Caller says `transcript`; Agent Core replies with `result`. */
async function exchange(h: ReturnType<typeof harness>, transcript: string, result: ProcessRuntimeTranscriptResult) {
  h.speech.handlers.onFinalTranscript(transcript);
  await flush();
  const turn = h.bridge.turns[h.bridge.turns.length - 1];
  turn.deferred.resolve(result);
  await flush();
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

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

/* ── A. Trusted SIP call start ───────────────────────────────────────── */

describe("A. trusted SIP call start", () => {
  it("1. the called DID comes only from sip.trunkPhoneNumber", async () => {
    const h = harness({
      participant: sipParticipant({ "sip.h.x-called": "+900000000000", "sip.calledNumber": "+901111111111" }),
    });
    await flush();
    expect(h.bridge.startRuntimeCall).toHaveBeenCalledTimes(1);
    expect(h.bridge.startRuntimeCall.mock.calls[0][0].calledDid).toBe(DID);
  });

  it("2. the external call key comes only from sip.callID and never carries the caller number", async () => {
    const h = harness({ participant: sipParticipant({ "sip.callIDFull": `full-${CALLER_PHONE}` }) });
    await flush();
    const input = h.bridge.startRuntimeCall.mock.calls[0][0];
    expect(input.externalCallKey).toBe(EXTERNAL_KEY);
    expect(input.externalCallKey).not.toContain(CALLER_PHONE.slice(1));
  });

  it("3. caller number, room name, participant identity and metadata cannot become tenant identity", async () => {
    const participant = {
      ...sipParticipant({ "lk.clinicId": "clinic_evil", "sip.h.x-clinic-id": "clinic_evil" }),
      identity: PARTICIPANT_IDENTITY,
      name: "clinic_evil",
      metadata: JSON.stringify({ clinicId: "clinic_evil" }),
      roomName: ROOM_NAME,
    };
    const h = harness({ participant });
    await flush();
    expect(h.bridge.startRuntimeCall.mock.calls[0][0]).toEqual({ externalCallKey: EXTERNAL_KEY, calledDid: DID });
    expect(JSON.stringify(h.bridge.startRuntimeCall.mock.calls)).not.toMatch(/clinic_evil|5551112233|room/);
  });

  it("4. trunk/rule allowlists fail closed before any ClinicBridge call starts", async () => {
    for (const [sipTrust, code] of [
      [{ allowedTrunkIds: [] }, "UNTRUSTED_TRUNK"],
      [{ allowedTrunkIds: ["ST_other"] }, "UNTRUSTED_TRUNK"],
      [{ allowedRuleIds: ["SDR_other"] }, "UNTRUSTED_RULE"],
    ] as const) {
      const h = harness({ sipTrust });
      await expect(h.call.done).resolves.toEqual({ outcome: "IDENTITY_REJECTED", code });
      expect(h.bridge.startRuntimeCall).not.toHaveBeenCalled();
      expect(h.createSpeech).not.toHaveBeenCalled();
      expect(h.controllers).toHaveLength(0);
      expect(h.transport.port.shutdownJob).toHaveBeenCalledTimes(1);
    }
    const notSip = harness({ participant: { ...sipParticipant(), kind: 0 } });
    await expect(notSip.call.done).resolves.toEqual({ outcome: "IDENTITY_REJECTED", code: "NOT_SIP_PARTICIPANT" });
    expect(notSip.bridge.startRuntimeCall).not.toHaveBeenCalled();
  });

  it("missing speech providers end the job before any ClinicBridge record is created", async () => {
    const h = harness({ speechAvailable: false });
    await expect(h.call.done).resolves.toEqual({ outcome: "SPEECH_UNAVAILABLE" });
    expect(h.bridge.startRuntimeCall).not.toHaveBeenCalled();
    expect(h.lease.acquire).not.toHaveBeenCalled();
  });

  it("start order: runtime call → lease → speech session; tenant rejection starts nothing", async () => {
    const h = harness();
    await flush();
    const startOrder = h.bridge.startRuntimeCall.mock.invocationCallOrder[0];
    const leaseOrder = h.lease.acquire.mock.invocationCallOrder[0];
    const speechOrder = h.speech.port.start.mock.invocationCallOrder[0];
    expect(startOrder).toBeLessThan(leaseOrder);
    expect(leaseOrder).toBeLessThan(speechOrder);

    const rejected = harness({ start: { ok: false, code: "TENANT_RESOLUTION_FAILED", retryable: false, endReason: "TENANT_REJECTED" } });
    await expect(rejected.call.done).resolves.toEqual({ outcome: "CALL_REJECTED", code: "TENANT_RESOLUTION_FAILED" });
    expect(rejected.lease.acquire).not.toHaveBeenCalled();
    expect(rejected.createSpeech).not.toHaveBeenCalled();
  });

  it("a lease held by another worker never activates speech or ends the call", async () => {
    const h = harness();
    h.lease.acquire.mockImplementation(async () => ({ ok: false, code: "RUNTIME_LEASE_HELD" }));
    await vi.runAllTimersAsync();
    const result = await h.call.done;
    expect(result.outcome).toBe("FINISHED");
    expect(h.createSpeech).not.toHaveBeenCalled();
    expect(h.bridge.endRuntimeCall).not.toHaveBeenCalled();
    expect(h.transport.port.hangUp).not.toHaveBeenCalled();
  });
});

/* ── B. AgentSession boundary ────────────────────────────────────────── */

describe("B. speech session boundary", () => {
  const config = buildVoiceSessionConfig();
  const speechSessionSource = stripComments(readFileSync(join(WORKER_SRC, "livekit/speechSession.ts"), "utf8"));
  const agentSource = stripComments(readFileSync(join(WORKER_SRC, "livekit/transcriptAgent.ts"), "utf8"));

  it("5. no LLM is configured on the session or the agent", () => {
    expect(config.session).not.toHaveProperty("llm");
    expect(config.agent.llm).toBeNull();
    expect(config.agent.instructions).toBe("");
    const sessionOptions = speechSessionSource.match(/createSession\(\{([\s\S]*?)\n {2}\}\);/)?.[1] ?? "";
    expect(sessionOptions).toContain("stt: providers.stt");
    expect(sessionOptions).not.toMatch(/\bllm\b/);
    expect(agentSource).toContain("llm: config.llm");
    for (const file of workerSourceFiles()) {
      const source = stripComments(readFileSync(file, "utf8"));
      expect(source, file).not.toMatch(/generateReply|llmNode|RealtimeModel|inference\.LLM|from "openai"|aiGateway/);
    }
  });

  it("6. preemptive generation is explicitly disabled", () => {
    expect(config.session.turnHandling.preemptiveGeneration).toEqual({ enabled: false, preemptiveTts: false });
    expect(speechSessionSource).toContain("preemptiveGeneration: config.session.turnHandling.preemptiveGeneration");
    expect(speechSessionSource).not.toMatch(/preemptiveGeneration:\s*true/);
  });

  it("7. recording, transcription publishing and text input are disabled", () => {
    expect(config.start.record).toBe(false);
    expect(config.start.output.transcriptionEnabled).toBe(false);
    expect(config.start.input.textEnabled).toBe(false);
    expect(config.start.input.deleteRoomOnClose).toBe(false);
    expect(config.say.addToChatCtx).toBe(false);
    expect(speechSessionSource).toContain("record: config.start.record");
    expect(speechSessionSource).toContain("outputOptions: config.start.output");
    expect(speechSessionSource).toContain("participantKinds: [ParticipantKind.SIP]");
  });

  it("8. only committed final turns are submitted; interim transcripts have no path", async () => {
    const h = await startedCall();
    h.speech.handlers.onFinalTranscript("merhaba");
    await flush();
    expect(h.submitted).toEqual(["merhaba"]);
    expect(h.bridge.processRuntimeTranscript).toHaveBeenCalledTimes(1);
    expect(h.bridge.processRuntimeTranscript.mock.calls[0][0].transcript).toBe("merhaba");
    expect(speechSessionSource).not.toMatch(/UserInputTranscribed|isFinal/);
    expect(agentSource).toContain("onUserTurnCompleted");
    expect(agentSource).toContain("throw new voice.StopResponse()");
  });

  it("9. empty or whitespace transcripts are ignored", async () => {
    const h = await startedCall();
    h.speech.handlers.onFinalTranscript("");
    h.speech.handlers.onFinalTranscript("   \n ");
    await flush();
    expect(h.submitted).toEqual([]);
    expect(h.bridge.processRuntimeTranscript).not.toHaveBeenCalled();
  });

  it("10. the worker never calls processVoiceTurn or the voice adapter directly", async () => {
    const bridgeCalls: string[] = [];
    for (const file of workerSourceFiles()) {
      const source = stripComments(readFileSync(file, "utf8"));
      expect(source, file).not.toMatch(/processVoiceTurn|handleClinicAgentTurn|voiceAdapter/);
      for (const match of source.matchAll(/[\w.]+\.processRuntimeTranscript\([^)]*\)/g)) bridgeCalls.push(match[0]);
    }
    // The only call site is the timing decorator, which only the CallController receives.
    expect(bridgeCalls).toEqual(["deps.bridge.processRuntimeTranscript(input)"]);
    const voiceCallSource = stripComments(readFileSync(join(WORKER_SRC, "call/voiceCall.ts"), "utf8"));
    expect(voiceCallSource.match(/timedBridge/g)).toHaveLength(2);
    expect(voiceCallSource).toContain("bridge: timedBridge,");
    const h = await startedCall();
    h.speech.handlers.onFinalTranscript("randevu almak istiyorum");
    await flush();
    expect(h.submitted).toEqual(["randevu almak istiyorum"]);
    expect(h.bridge.processRuntimeTranscript).toHaveBeenCalledTimes(1);
  });
});

/* ── C. Controller ownership of turns ────────────────────────────────── */

describe("C. CallController owns turns", () => {
  it("11. exactly one controller per call", async () => {
    const h = await startedCall();
    await exchange(h, "bir", turnResult(1));
    await exchange(h, "iki", turnResult(2));
    h.speech.handlers.onClosed({ kind: "OTHER" });
    await flush();
    expect(h.controllers).toHaveLength(1);
  });

  it("12. single flight stays in the controller: newest pending wins, no concatenation", async () => {
    const h = await startedCall();
    h.speech.handlers.onFinalTranscript("first");
    await flush();
    h.speech.handlers.onFinalTranscript("second");
    h.speech.handlers.onFinalTranscript("third");
    await flush();
    expect(h.bridge.processRuntimeTranscript).toHaveBeenCalledTimes(1);
    h.bridge.turns[0].deferred.resolve(turnResult(1));
    await flush();
    expect(h.bridge.processRuntimeTranscript).toHaveBeenCalledTimes(2);
    expect(h.bridge.turns[1].transcript).toBe("third");
    expect(h.bridge.maxInFlight).toBe(1);
  });

  it("13. the worker never creates turn IDs; spoken turns carry the controller's turnSeq", async () => {
    for (const file of workerSourceFiles()) {
      const source = stripComments(readFileSync(file, "utf8"));
      expect(source, file).not.toMatch(/formatTurnId|allocateTurnId|allocateNextTurnId|turnId\s*:/);
    }
    const h = await startedCall();
    h.speech.handlers.onFinalTranscript("merhaba");
    await flush();
    expect(Object.keys(h.bridge.processRuntimeTranscript.mock.calls[0][0]).sort()).toEqual(["runtimeCall", "transcript"]);
  });

  it("14. no worker retry of a failed turn", async () => {
    const h = await startedCall();
    await exchange(h, "merhaba", { ok: false, action: "DISCARD", code: "TRANSCRIPT_INVALID", retryable: true });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(h.bridge.processRuntimeTranscript).toHaveBeenCalledTimes(1);
    expect(h.controller().snapshot().state).toBe("ACTIVE");
  });
});

/* ── D. Speech output ────────────────────────────────────────────────── */

describe("D. speech output", () => {
  it("15. only turn.speechText is spoken", async () => {
    const h = await startedCall();
    await exchange(h, "merhaba", turnResult(1));
    expect(h.speech.says.map((s) => s.text)).toEqual(["SPEECH_SECRET_1"]);
  });

  it("16. allowBargeIn maps to per-speech allowInterruptions", async () => {
    const h = await startedCall();
    await exchange(h, "bir", turnResult(1));
    h.speech.says[0].finish("COMPLETED");
    await flush();
    await exchange(h, "iki", turnResult(2, UNINTERRUPTIBLE));
    expect(h.speech.says.map((s) => s.allowInterruptions)).toEqual([true, false]);
  });

  it("17. a normal interrupted reply does not end the call", async () => {
    const h = await startedCall();
    await exchange(h, "merhaba", turnResult(1));
    h.speech.says[0].finish("INTERRUPTED");
    await flush();
    expect(h.controller().snapshot().state).toBe("ACTIVE");
    expect(h.bridge.endRuntimeCall).not.toHaveBeenCalled();
  });

  it("empty speechText speaks nothing", async () => {
    const h = await startedCall();
    await exchange(h, "merhaba", turnResult(1, { speechText: "" }));
    expect(h.speech.says).toHaveLength(0);
  });

  it("a failed normal reply ends the call with TTS_FAILURE", async () => {
    const h = await startedCall();
    await exchange(h, "merhaba", turnResult(1));
    h.speech.says[0].finish("FAILED");
    await flush();
    expect(h.bridge.endRuntimeCall).toHaveBeenCalledTimes(1);
    expect(h.bridge.endRuntimeCall.mock.calls[0][0].reason).toBe("TTS_FAILURE");
  });
});

/* ── E. AGENT_COMPLETED consumer ─────────────────────────────────────── */

describe("E. AGENT_COMPLETED after verified playback", () => {
  it("18. the final reply plays in full before the call ends with AGENT_COMPLETED", async () => {
    const h = await startedCall();
    await exchange(h, "teşekkürler", turnResult(1, FINAL_TURN));
    expect(h.speech.says.map((s) => s.text)).toEqual(["SPEECH_SECRET_1"]);
    expect(h.bridge.endRuntimeCall).not.toHaveBeenCalled();
    h.speech.says[0].finish("COMPLETED");
    await flush();
    expect(h.bridge.endRuntimeCall).toHaveBeenCalledTimes(1);
    expect(h.bridge.endRuntimeCall.mock.calls[0][0].reason).toBe("AGENT_COMPLETED");
    const result = await h.call.done;
    expect(result).toMatchObject({ outcome: "FINISHED", finish: { reason: "AGENT_COMPLETED", disposition: "ENDED" } });
    expect(h.transport.port.hangUp).toHaveBeenCalledTimes(1);
    expect(h.transport.port.shutdownJob).toHaveBeenCalledTimes(1);
  });

  it("19. failed final playback ends with TTS_FAILURE", async () => {
    const h = await startedCall();
    await exchange(h, "teşekkürler", turnResult(1, FINAL_TURN));
    h.speech.says[0].finish("FAILED");
    await flush();
    expect(h.bridge.endRuntimeCall.mock.calls.map((c) => c[0].reason)).toEqual(["TTS_FAILURE"]);
  });

  it("20. a caller hangup during the final reply wins (CALLER_HANGUP)", async () => {
    const h = await startedCall();
    await exchange(h, "teşekkürler", turnResult(1, FINAL_TURN));
    h.transport.callerHangsUp();
    await flush();
    h.speech.says[0].finish("COMPLETED");
    await flush();
    expect(h.bridge.endRuntimeCall.mock.calls.map((c) => c[0].reason)).toEqual(["CALLER_HANGUP"]);
    expect(h.transport.port.hangUp).not.toHaveBeenCalled();
  });

  it("21. an interrupted final reply does not produce AGENT_COMPLETED", async () => {
    const h = await startedCall();
    await exchange(h, "teşekkürler", turnResult(1, FINAL_TURN));
    h.speech.says[0].finish("INTERRUPTED");
    await flush();
    expect(h.bridge.endRuntimeCall).not.toHaveBeenCalled();
    expect(h.controller().snapshot().state).toBe("ACTIVE");
  });

  it("22. turn N's completion cannot close the call after turn N+1 was accepted or spoken", async () => {
    // N+1 accepted (in flight) when N's playback completes.
    const a = await startedCall();
    await exchange(a, "teşekkürler", turnResult(1, FINAL_TURN));
    a.speech.handlers.onFinalTranscript("bir sorum daha var");
    await flush();
    a.speech.says[0].finish("COMPLETED");
    await flush();
    expect(a.bridge.endRuntimeCall).not.toHaveBeenCalled();
    a.bridge.turns[1].deferred.resolve(turnResult(2));
    await flush();
    expect(a.bridge.endRuntimeCall).not.toHaveBeenCalled();
    expect(a.controller().snapshot().state).toBe("ACTIVE");

    // N+1 processed and spoken (non-final) before N's playback completes.
    const b = await startedCall();
    await exchange(b, "teşekkürler", turnResult(1, FINAL_TURN));
    await exchange(b, "bir sorum daha var", turnResult(2));
    b.speech.says[0].finish("COMPLETED");
    await flush();
    expect(b.bridge.endRuntimeCall).not.toHaveBeenCalled();
    expect(b.lines.some((l) => l.includes("VOICE_WORKER_STALE_COMPLETION_IGNORED"))).toBe(true);
  });

  it("22c. an accepted newer transcript blocks completion even when it produced no processed turn", async () => {
    const h = await startedCall();
    await exchange(h, "teşekkürler", turnResult(1, FINAL_TURN));
    await exchange(h, "bir dakika", { ok: false, action: "DISCARD", code: "TRANSCRIPT_INVALID", retryable: true });
    expect(h.controller().snapshot()).toMatchObject({ turnInFlight: false, lastTurnSeq: 1, agentCompletionRequested: true });
    h.speech.says[0].finish("COMPLETED");
    await flush();
    expect(h.bridge.endRuntimeCall).not.toHaveBeenCalled();
  });

  it("22b. completion guard: newer events supersede an armed completion", () => {
    const guard = createCompletionGuard();
    const first = guard.arm(1);
    expect(guard.isCurrent(first)).toBe(true);
    guard.supersede();
    expect(guard.isCurrent(first)).toBe(false);
    const second = guard.arm(2);
    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
  });

  it("23. the worker adds no endCallSuggested producer", () => {
    for (const file of workerSourceFiles()) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/endCallSuggested/);
    }
  });

  it("final-reply playback mapping delegates to lifecyclePolicy outcomes", () => {
    expect(finalReplyPlaybackOutcome("COMPLETED", false)).toBe("PLAYED");
    expect(finalReplyPlaybackOutcome("FAILED", false)).toBe("PLAYBACK_FAILED");
    expect(finalReplyPlaybackOutcome("INTERRUPTED", false)).toBeNull();
    expect(finalReplyPlaybackOutcome("COMPLETED", true)).toBe("CALLER_HANGUP");
    expect(classifySpeechPlayback({ failed: true, interrupted: true })).toBe("FAILED");
    expect(classifySpeechPlayback({ failed: false, interrupted: true })).toBe("INTERRUPTED");
    expect(classifySpeechPlayback({ failed: false, interrupted: false })).toBe("COMPLETED");
  });
});

/* ── F. Greeting ─────────────────────────────────────────────────────── */

describe("F. greeting", () => {
  it("24. the trusted greetingText wins", async () => {
    const h = harness({ call: makeCall({ greetingText: "Hoş geldiniz, size nasıl yardımcı olabilirim?" }) });
    await flush();
    expect(h.speech.says.map((s) => s.text)).toEqual(["Hoş geldiniz, size nasıl yardımcı olabilirim?"]);
    expect(h.speech.says[0].allowInterruptions).toBe(true);
  });

  it("25. locale fallback is short and generic (Turkish default)", async () => {
    const h = harness();
    await flush();
    expect(h.speech.says.map((s) => s.text)).toEqual(["Merhaba, size nasıl yardımcı olabilirim?"]);
    expect(resolveCallGreeting({ locale: "en-US" })).toBe("Hello, how can I help you?");
    expect(resolveCallGreeting({})).toBe("Merhaba, size nasıl yardımcı olabilirim?");
    expect(resolveCallGreeting({ greetingText: "   ", locale: "tr-TR" })).toBe("Merhaba, size nasıl yardımcı olabilirim?");
  });

  it("26. only the dispatch that created the call greets", async () => {
    const h = harness({ created: false });
    await flush();
    expect(h.speech.port.start).toHaveBeenCalledTimes(1);
    expect(h.speech.port.say).not.toHaveBeenCalled();
  });

  it("27. the greeting is not an Agent Core turn", async () => {
    const h = harness();
    await flush();
    h.speech.says[0].finish("COMPLETED");
    await flush();
    expect(h.bridge.processRuntimeTranscript).not.toHaveBeenCalled();
    expect(h.controller().snapshot()).toMatchObject({ processedTurns: 0, lastTurnSeq: null, state: "ACTIVE" });
  });
});

/* ── G. Ownership loss and shutdown ──────────────────────────────────── */

describe("G. ownership loss and shutdown", () => {
  async function loseOwnershipDuringTurn() {
    const h = await startedCall();
    await exchange(h, "bir", turnResult(1));
    h.speech.handlers.onFinalTranscript("iki");
    await flush();
    h.lease.renew.mockResolvedValue({ ok: false, code: "RUNTIME_LEASE_TOKEN_MISMATCH" });
    await vi.advanceTimersByTimeAsync(RENEW_MS);
    h.bridge.turns[1].deferred.resolve(turnResult(2));
    await flush();
    return h;
  }

  it("28. ownership loss stops current speech and suppresses later speech", async () => {
    const h = await loseOwnershipDuringTurn();
    expect(h.speech.port.interruptAll).toHaveBeenCalledTimes(1);
    expect(h.speech.says.map((s) => s.text)).toEqual(["SPEECH_SECRET_1"]);
    h.speech.handlers.onFinalTranscript("üç");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.submitted).toEqual(["bir", "iki"]);
    expect(h.speech.says).toHaveLength(1);
  });

  it("29. ownership loss never ends the binding, releases the lease or hangs up", async () => {
    const h = await loseOwnershipDuringTurn();
    const result = await h.call.done;
    expect(result).toMatchObject({ outcome: "FINISHED", finish: { disposition: "OWNERSHIP_LOST" } });
    expect(h.bridge.endRuntimeCall).not.toHaveBeenCalled();
    expect(h.lease.release).not.toHaveBeenCalled();
    expect(h.transport.port.hangUp).not.toHaveBeenCalled();
    expect(h.transport.port.shutdownJob).toHaveBeenCalledTimes(1);
  });

  it("30. shutdown, hangup and session close finish exactly once", async () => {
    const h = await startedCall();
    h.transport.callerHangsUp();
    h.speech.handlers.onClosed({ kind: "PARTICIPANT_DISCONNECTED" });
    await Promise.all([h.call.shutdown(), h.call.shutdown()]);
    h.speech.handlers.onClosed({ kind: "JOB_SHUTDOWN" });
    await flush();
    expect(h.bridge.endRuntimeCall).toHaveBeenCalledTimes(1);
    expect(h.bridge.endRuntimeCall.mock.calls[0][0].reason).toBe("CALLER_HANGUP");
    expect(h.lease.release).toHaveBeenCalledTimes(1);
    expect(h.transport.port.shutdownJob).toHaveBeenCalledTimes(1);
  });

  it("31. shutdown never cancels an in-flight turn and its wait is bounded", async () => {
    const h = await startedCall({ limits: { shutdownWaitMs: 1_000 } });
    h.speech.handlers.onFinalTranscript("randevu oluştur");
    await flush();
    let shutdownDone = false;
    void h.call.shutdown().then(() => {
      shutdownDone = true;
    });
    await flush();
    expect(h.bridge.endRuntimeCall).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(shutdownDone).toBe(true);
    expect(h.bridge.turns[0].settled).toBe(false);
    expect(h.bridge.endRuntimeCall).not.toHaveBeenCalled();

    h.bridge.turns[0].deferred.resolve(turnResult(1, { appointmentCreated: true }));
    await flush();
    expect(h.bridge.turns[0].settled).toBe(true);
    expect(h.bridge.endRuntimeCall.mock.calls.map((c) => c[0].reason)).toEqual(["RUNTIME_FAILURE"]);
    expect(h.speech.says).toHaveLength(0);
  });

  it("job shutdown after the caller left maps to CALLER_HANGUP", () => {
    expect(endReasonForJobShutdown({ callerGone: true })).toBe("CALLER_HANGUP");
    expect(endReasonForJobShutdown({ callerGone: false })).toBe("RUNTIME_FAILURE");
  });
});

/* ── Transport events, silence, controller-initiated end ─────────────── */

describe("transport event mapping", () => {
  it("maps speech session close reasons to canonical end reasons", () => {
    const ctx = { callerGone: false };
    expect(endReasonForSessionClose({ kind: "PARTICIPANT_DISCONNECTED" }, ctx)).toBe("CALLER_HANGUP");
    expect(endReasonForSessionClose({ kind: "ERROR", errorType: "stt_error" }, ctx)).toBe("STT_FAILURE");
    expect(endReasonForSessionClose({ kind: "ERROR", errorType: "tts_error" }, ctx)).toBe("TTS_FAILURE");
    expect(endReasonForSessionClose({ kind: "ERROR", errorType: "other" }, ctx)).toBe("RUNTIME_FAILURE");
    expect(endReasonForSessionClose({ kind: "JOB_SHUTDOWN" }, ctx)).toBe("RUNTIME_FAILURE");
    expect(endReasonForSessionClose({ kind: "ERROR", errorType: "tts_error" }, { callerGone: true })).toBe("CALLER_HANGUP");
  });

  it("a fatal STT error closes the call with STT_FAILURE", async () => {
    const h = await startedCall();
    h.speech.handlers.onClosed({ kind: "ERROR", errorType: "stt_error" });
    await flush();
    expect(h.bridge.endRuntimeCall.mock.calls.map((c) => c[0].reason)).toEqual(["STT_FAILURE"]);
  });

  it("controller-initiated end speaks its fallback before disconnecting", async () => {
    const h = await startedCall();
    await exchange(h, "merhaba", {
      ok: false,
      action: "DISCARD",
      code: "AGENT_FAILED",
      retryable: false,
      endReason: "AGENT_FAILURE",
      fallback: "TECHNICAL_FAILURE",
    });
    expect(h.speech.says.map((s) => s.text)).toEqual([getFallbackSpeech("TECHNICAL_FAILURE", "tr-TR")]);
    expect(h.speech.says[0].allowInterruptions).toBe(false);
    expect(h.transport.port.hangUp).not.toHaveBeenCalled();
    h.speech.says[0].finish("COMPLETED");
    await flush();
    expect(h.transport.port.hangUp).toHaveBeenCalledTimes(1);
    expect(h.bridge.endRuntimeCall.mock.calls.map((c) => c[0].reason)).toEqual(["AGENT_FAILURE"]);
  });

  it("silence follows lifecyclePolicy: reprompts, then goodbye and SILENCE_TIMEOUT", async () => {
    const h = await startedCall();
    await vi.advanceTimersByTimeAsync(8_000);
    h.speech.says[0].finish("COMPLETED");
    await flush();
    await vi.advanceTimersByTimeAsync(8_000);
    h.speech.says[1].finish("COMPLETED");
    await flush();
    expect(h.bridge.endRuntimeCall).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(8_000);
    expect(h.speech.says.map((s) => s.text)).toEqual([
      getFallbackSpeech("NO_SPEECH_REPROMPT", "tr-TR"),
      getFallbackSpeech("NO_SPEECH_REPROMPT", "tr-TR"),
      getFallbackSpeech("SILENCE_GOODBYE", "tr-TR"),
    ]);
    expect(h.bridge.endRuntimeCall.mock.calls.map((c) => c[0].reason)).toEqual(["SILENCE_TIMEOUT"]);
    expect(h.transport.port.hangUp).not.toHaveBeenCalled();
    h.speech.says[2].finish("COMPLETED");
    await flush();
    expect(h.transport.port.hangUp).toHaveBeenCalledTimes(1);
  });

  it("accepted caller speech resets the silence counter; silence is ignored while a turn is in flight", async () => {
    const h = await startedCall();
    for (let i = 0; i < 2; i++) {
      await vi.advanceTimersByTimeAsync(8_000);
      h.speech.says[i].finish("COMPLETED");
      await flush();
    }
    await exchange(h, "merhaba", turnResult(1));
    h.speech.says[2].finish("COMPLETED");
    await flush();
    await vi.advanceTimersByTimeAsync(8_000);
    expect(h.bridge.endRuntimeCall).not.toHaveBeenCalled();
    expect(h.speech.says[3].text).toBe(getFallbackSpeech("NO_SPEECH_REPROMPT", "tr-TR"));
    h.speech.says[3].finish("COMPLETED");
    await flush();
    h.speech.handlers.onFinalTranscript("tamam");
    await flush();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.speech.says).toHaveLength(4);
    expect(h.bridge.endRuntimeCall).not.toHaveBeenCalled();
  });

  it("the agent entry subscribes to audio only and wires the shutdown callback", () => {
    const source = stripComments(readFileSync(join(WORKER_SRC, "agent.ts"), "utf8"));
    expect(source).toContain("AutoSubscribe.AUDIO_ONLY");
    expect(source).toContain("ctx.addShutdownCallback(() => call.shutdown())");
    expect(source).not.toMatch(/SUBSCRIBE_ALL/);
  });
});

/* ── H. Privacy ──────────────────────────────────────────────────────── */

describe("H. privacy", () => {
  it("32. logs and results never contain caller data, transcript, reply, speech or lease token", async () => {
    const participant = { ...sipParticipant(), identity: PARTICIPANT_IDENTITY, roomName: ROOM_NAME };
    const h = await startedCall({ participant });
    await exchange(h, "TRANSCRIPT_SECRET_1", turnResult(1));
    h.speech.says[0].finish("COMPLETED");
    await flush();
    await exchange(h, "TRANSCRIPT_SECRET_2", turnResult(2, FINAL_TURN));
    h.speech.says[1].finish("COMPLETED");
    const result = await h.call.done;
    expect(result.outcome).toBe("FINISHED");

    const haystack = [...h.lines, JSON.stringify(result), JSON.stringify(h.transport.port.shutdownJob.mock.calls)].join("\n");
    for (const secret of [
      CALLER_PHONE,
      CALLER_PHONE.slice(1),
      PARTICIPANT_IDENTITY,
      ROOM_NAME,
      "TRANSCRIPT_SECRET",
      "REPLY_SECRET",
      "SPEECH_SECRET",
      TOKEN_MARKER,
      "SDR_allowed",
      "ST_allowed",
      SIP_CALL_ID,
    ]) {
      expect(haystack).not.toContain(secret);
    }
    expect(h.lines.length).toBeGreaterThan(0);
    for (const line of h.lines) expect(JSON.parse(line)).toHaveProperty("checkpoint");
  });

  it("the worker logger drops fields outside the allowlist", () => {
    const lines: string[] = [];
    const log = createWorkerLogger((line) => lines.push(line));
    const unsafe = { bindingId: "vc_1", transcript: "TRANSCRIPT_SECRET", callerPhone: CALLER_PHONE, leaseToken: TOKEN };
    log("CHECK", unsafe as unknown as Parameters<typeof log>[1]);
    expect(JSON.parse(lines[0])).toEqual({ checkpoint: "CHECK", bindingId: "vc_1" });
  });
});
