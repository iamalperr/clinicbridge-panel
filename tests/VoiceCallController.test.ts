import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCallController,
  createRuntimeLeaseOperations,
  type CallControllerBridge,
  type CallControllerEvent,
  type CallControllerLogEntry,
  type CallControllerOptions,
  type RuntimeLeaseOperations,
  type TurnOutcome,
} from "@/lib/voice/runtime/callController";
import {
  createVoiceRuntimeBridge,
  type ProcessRuntimeTranscriptResult,
  type RuntimeTurnOutput,
  type VoiceRuntimeCall,
  type VoiceRuntimeCapabilities,
} from "@/lib/voice/runtime/voiceRuntimeBridge";
import type { RuntimeLeaseErrorCode } from "@/lib/voice/runtime/runtimeLease";
import { deriveCallBindingId, formatTurnId, type CallBinding } from "@/lib/voice/telephony/callBinding";
import {
  INITIAL_SILENCE_STATE,
  endReasonAfterFinalReply,
  fallbackForEndReason,
  type VoiceCallEndReason,
} from "@/lib/voice/telephony/lifecyclePolicy";
import { readFileSync } from "fs";
import { resolve } from "path";

/* ── Fixtures ────────────────────────────────────────────────────────── */

const T0 = Date.UTC(2026, 9, 7, 12, 0, 0);
const BINDING_ID = `vc_${"a".repeat(32)}`;
const SUFFIX = "a".repeat(32);
const OWNER = "worker-1:job-1";
const TOKEN_MARKER = "T0KENsecretVALUE";
const TOKEN = `vrl_${TOKEN_MARKER.padEnd(43, "x")}`;
const RENEW_MS = 10_000;

function makeCall(overrides: Partial<VoiceRuntimeCall["lifecycle"]> = {}): VoiceRuntimeCall {
  return Object.freeze({
    bindingId: BINDING_ID,
    clinicId: "clinic_a",
    didE164: "+908502428852",
    callSessionId: `call_${SUFFIX}`,
    conversationId: `voice_conv_${SUFFIX}`,
    locale: "tr-TR",
    lifecycle: Object.freeze({
      startedAtMs: T0,
      maxCallDurationMs: 15 * 60 * 1000,
      silenceTimeoutMs: 8_000,
      maxSilenceReprompts: 2,
      silence: INITIAL_SILENCE_STATE,
      bargeIn: { allowInterruptions: true, reason: "DEFAULT" } as const,
      ...overrides,
    }),
  });
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 30; i++) await Promise.resolve();
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

const UNINTERRUPTIBLE: Partial<RuntimeTurnOutput> = {
  allowBargeIn: false,
  bargeIn: { allowInterruptions: false, reason: "APPOINTMENT_CONFIRMATION_SUMMARY" },
  bufferedSpeech: "DISCARD",
  appointmentState: "AWAITING_CONFIRMATION",
};

function leaseExpiresAt(): string {
  return new Date(Date.now() + 30_000).toISOString();
}

function makeLease(order: string[]) {
  return {
    acquire: vi.fn<RuntimeLeaseOperations["acquire"]>(async (input) => ({
      ok: true,
      takeover: false,
      lease: {
        ...input,
        generation: 1,
        leaseToken: TOKEN,
        expiresAt: leaseExpiresAt(),
        leaseDurationMs: 30_000,
        clockSource: "LOCAL_CLOCK",
      },
    })),
    renew: vi.fn<RuntimeLeaseOperations["renew"]>(async (proof) => ({
      ok: true,
      generation: proof.generation,
      expiresAt: leaseExpiresAt(),
      clockSource: "LOCAL_CLOCK",
    })),
    verify: vi.fn<RuntimeLeaseOperations["verify"]>(async (proof) => {
      order.push("verify");
      return { ok: true, generation: proof.generation, expiresAt: leaseExpiresAt(), remainingMs: 25_000, clockSource: "LOCAL_CLOCK" };
    }),
    release: vi.fn<RuntimeLeaseOperations["release"]>(async () => {
      order.push("release");
      return { ok: true, alreadyReleased: false };
    }),
  };
}

function makeBridge(order: string[]) {
  const turns: Array<{ transcript: string; deferred: Deferred<ProcessRuntimeTranscriptResult>; settled: boolean }> = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const processRuntimeTranscript = vi.fn<CallControllerBridge["processRuntimeTranscript"]>((input) => {
    order.push("process");
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    const entry = { transcript: input.transcript, deferred: deferred<ProcessRuntimeTranscriptResult>(), settled: false };
    turns.push(entry);
    return entry.deferred.promise.finally(() => {
      inFlight -= 1;
      entry.settled = true;
      order.push("process-settled");
    });
  });
  const endRuntimeCall = vi.fn<CallControllerBridge["endRuntimeCall"]>(async (input) => {
    order.push("end");
    return {
      ok: true,
      reason: input.reason,
      bindingStatus: "ENDED",
      sessionEndReason: "completed",
      sessionEnded: true,
      alreadyEnded: false,
      fallback: fallbackForEndReason(input.reason),
    };
  });
  return {
    processRuntimeTranscript,
    endRuntimeCall,
    turns,
    get maxInFlight() {
      return maxInFlight;
    },
  };
}

function setup(overrides: Partial<CallControllerOptions> = {}) {
  const order: string[] = [];
  const events: CallControllerEvent[] = [];
  const logs: CallControllerLogEntry[] = [];
  const lease = makeLease(order);
  const bridge = makeBridge(order);
  const controller = createCallController({
    runtimeCall: makeCall(),
    ownerId: OWNER,
    bridge,
    lease,
    logger: (entry) => logs.push(entry),
    onEvent: (event) => events.push(event),
    ...overrides,
  });
  const outcomes = (): TurnOutcome[] =>
    events.flatMap((e) => (e.type === "TURN_OUTCOME" ? [e.outcome] : []));
  const stateTransitions = () =>
    logs.filter((l) => l.checkpoint === "VOICE_CALL_CONTROLLER_STATE").map((l) => l.code);
  return { controller, lease, bridge, events, logs, order, outcomes, stateTransitions };
}

async function started(overrides: Partial<CallControllerOptions> = {}) {
  const ctx = setup(overrides);
  const result = await ctx.controller.start();
  expect(result.ok).toBe(true);
  return ctx;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

/* ── Lease acquisition / start ───────────────────────────────────────── */

describe("CallController — start", () => {
  it("1. NEW → ACTIVE after successful lease acquisition", async () => {
    const { controller, lease } = setup();
    expect(controller.snapshot().state).toBe("NEW");
    const result = await controller.start();
    expect(result).toEqual({ ok: true, leaseGeneration: 1, takeover: false, acquireAttempts: 1 });
    expect(controller.snapshot().state).toBe("ACTIVE");
    expect(controller.snapshot().leaseGeneration).toBe(1);
    expect(lease.acquire).toHaveBeenCalledWith({ bindingId: BINDING_ID, clinicId: "clinic_a", ownerId: OWNER });
  });

  it("36. start failure does not begin heartbeat (or accept transcripts / end the call)", async () => {
    const { controller, lease, bridge } = setup();
    lease.acquire.mockResolvedValue({ ok: false, code: "RUNTIME_LEASE_TENANT_CONFLICT" });
    const result = await controller.start();
    expect(result).toMatchObject({ ok: false, code: "RUNTIME_LEASE_TENANT_CONFLICT", acquireAttempts: 1 });
    expect(controller.snapshot().state).toBe("FAILED");
    await vi.advanceTimersByTimeAsync(RENEW_MS * 6);
    expect(lease.renew).not.toHaveBeenCalled();
    expect(lease.acquire).toHaveBeenCalledTimes(1);
    expect(controller.submitTranscript("hello")).toEqual({ accepted: false, reason: "FAILED" });
    const finished = await controller.finish("CALLER_HANGUP");
    expect(finished.disposition).toBe("START_FAILED");
    expect(bridge.endRuntimeCall).not.toHaveBeenCalled();
    expect(lease.release).not.toHaveBeenCalled();
  });

  it("37. RUNTIME_LEASE_HELD bounded retry works (re-dispatch after a worker crash)", async () => {
    const { controller, lease } = setup({ acquireRetry: { maxAttempts: 5, delayMs: 2_000 } });
    lease.acquire
      .mockResolvedValueOnce({ ok: false, code: "RUNTIME_LEASE_HELD" })
      .mockResolvedValueOnce({ ok: false, code: "RUNTIME_LEASE_HELD" });
    const pending = controller.start();
    await flush();
    expect(controller.snapshot().state).toBe("STARTING");
    expect(lease.acquire).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(lease.acquire).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await pending;
    expect(result).toMatchObject({ ok: true, acquireAttempts: 3 });
    expect(controller.snapshot().state).toBe("ACTIVE");
  });

  it("transient acquire errors share the same bounded retry budget", async () => {
    const { controller, lease } = setup({ acquireRetry: { maxAttempts: 3, delayMs: 500 } });
    lease.acquire.mockResolvedValueOnce({ ok: false, code: "RUNTIME_LEASE_LOOKUP_FAILED" });
    const pending = controller.start();
    await vi.advanceTimersByTimeAsync(500);
    expect((await pending).ok).toBe(true);
  });

  it("38. bounded retry exhaustion fails closed", async () => {
    const { controller, lease, bridge } = setup({ acquireRetry: { maxAttempts: 3, delayMs: 1_000 } });
    lease.acquire.mockResolvedValue({ ok: false, code: "RUNTIME_LEASE_HELD" });
    const pending = controller.start();
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await pending;
    expect(result).toEqual({
      ok: false,
      code: "ACQUIRE_RETRY_EXHAUSTED",
      acquireAttempts: 3,
      lastLeaseCode: "RUNTIME_LEASE_HELD",
    });
    expect(controller.snapshot().state).toBe("FAILED");
    expect(lease.acquire).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(lease.acquire).toHaveBeenCalledTimes(3);
    expect(lease.renew).not.toHaveBeenCalled();
    expect(bridge.endRuntimeCall).not.toHaveBeenCalled();
  });

  it("a lease handle for another binding/owner is rejected", async () => {
    const { controller, lease } = setup();
    lease.acquire.mockResolvedValueOnce({
      ok: true,
      takeover: false,
      lease: {
        bindingId: `vc_${"b".repeat(32)}`,
        clinicId: "clinic_a",
        ownerId: OWNER,
        generation: 1,
        leaseToken: TOKEN,
        expiresAt: leaseExpiresAt(),
        leaseDurationMs: 30_000,
        clockSource: "LOCAL_CLOCK",
      },
    });
    expect(await controller.start()).toMatchObject({ ok: false, code: "LEASE_MISMATCH" });
    expect(controller.snapshot().state).toBe("FAILED");
  });

  it("finish during HELD retry stops retrying and never touches the call", async () => {
    const { controller, lease, bridge } = setup({ acquireRetry: { maxAttempts: 10, delayMs: 2_000 } });
    lease.acquire.mockResolvedValue({ ok: false, code: "RUNTIME_LEASE_HELD" });
    const pendingStart = controller.start();
    await flush();
    const result = await controller.finish("CALLER_HANGUP");
    expect(result).toMatchObject({ disposition: "ENDED_WITHOUT_OWNERSHIP" });
    expect(await pendingStart).toMatchObject({ ok: false, code: "FINISH_REQUESTED" });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(lease.acquire).toHaveBeenCalledTimes(1);
    expect(bridge.endRuntimeCall).not.toHaveBeenCalled();
    expect(lease.release).not.toHaveBeenCalled();
    expect(controller.snapshot().state).toBe("ENDED");
  });

  it("finish during an acquire that then succeeds ends the call and releases the lease", async () => {
    const { controller, lease, bridge, order } = setup();
    const acquired = deferred<Awaited<ReturnType<RuntimeLeaseOperations["acquire"]>>>();
    lease.acquire.mockImplementationOnce(() => acquired.promise);
    const pendingStart = controller.start();
    const finishing = controller.finish("CALLER_HANGUP");
    acquired.resolve({
      ok: true,
      takeover: true,
      lease: { bindingId: BINDING_ID, clinicId: "clinic_a", ownerId: OWNER, generation: 2, leaseToken: TOKEN, expiresAt: leaseExpiresAt(), leaseDurationMs: 30_000, clockSource: "LOCAL_CLOCK" },
    });
    expect(await pendingStart).toMatchObject({ ok: false, code: "FINISH_REQUESTED" });
    const result = await finishing;
    expect(result.disposition).toBe("ENDED");
    expect(bridge.endRuntimeCall).toHaveBeenCalledTimes(1);
    expect(lease.release).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["end", "release"]);
  });

  it("start is idempotent while running and rejected once finished", async () => {
    const { controller } = setup();
    const a = controller.start();
    const b = controller.start();
    expect(a).toBe(b);
    await a;
    await controller.finish("CALLER_HANGUP");
    expect(await controller.start()).toMatchObject({ ok: false, code: "INVALID_STATE" });
  });
});

/* ── Heartbeat ───────────────────────────────────────────────────────── */

describe("CallController — heartbeat", () => {
  it("2. heartbeat renews with the acquired proof at the recommended interval", async () => {
    const { controller, lease } = await started();
    expect(lease.renew).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(RENEW_MS);
    expect(lease.renew).toHaveBeenCalledTimes(1);
    expect(lease.renew.mock.calls[0][0]).toEqual({
      bindingId: BINDING_ID,
      clinicId: "clinic_a",
      ownerId: OWNER,
      generation: 1,
      leaseToken: TOKEN,
    });
    await vi.advanceTimersByTimeAsync(RENEW_MS);
    expect(lease.renew).toHaveBeenCalledTimes(2);
    expect(controller.snapshot().leaseExpiresAt).toBe(new Date(T0 + 2 * RENEW_MS + 30_000).toISOString());
    expect(controller.snapshot().consecutiveRenewFailures).toBe(0);
  });

  it.each(["RUNTIME_LEASE_LOOKUP_FAILED", "RUNTIME_LEASE_UPDATE_FAILED"] as const)(
    "3/4. transient renew %s keeps ownership and retries on the next heartbeat",
    async (code) => {
      const { controller, lease, events } = await started();
      lease.renew.mockResolvedValueOnce({ ok: false, code });
      await vi.advanceTimersByTimeAsync(RENEW_MS);
      expect(controller.snapshot().state).toBe("ACTIVE");
      expect(controller.snapshot().consecutiveRenewFailures).toBe(1);
      expect(events.some((e) => e.type === "OWNERSHIP_LOST")).toBe(false);
      await vi.advanceTimersByTimeAsync(RENEW_MS);
      expect(lease.renew).toHaveBeenCalledTimes(2);
      expect(controller.snapshot().consecutiveRenewFailures).toBe(0);
    }
  );

  it("a throwing renew is treated as transient", async () => {
    const { controller, lease } = await started();
    lease.renew.mockRejectedValueOnce(new Error("network"));
    await vi.advanceTimersByTimeAsync(RENEW_MS);
    expect(controller.snapshot().state).toBe("ACTIVE");
    expect(controller.snapshot().consecutiveRenewFailures).toBe(1);
  });

  it.each([
    "RUNTIME_LEASE_NOT_FOUND",
    "RUNTIME_LEASE_EXPIRED",
    "RUNTIME_LEASE_OWNER_MISMATCH",
    "RUNTIME_LEASE_TOKEN_MISMATCH",
    "RUNTIME_LEASE_GENERATION_MISMATCH",
    "RUNTIME_LEASE_TENANT_CONFLICT",
    "RUNTIME_LEASE_INVALID_STATE",
    "RUNTIME_LEASE_INVALID_INPUT",
  ] as const)("5–9. definitive renew %s loses ownership", async (code: RuntimeLeaseErrorCode) => {
    const { controller, lease, events } = await started();
    lease.renew.mockResolvedValueOnce({ ok: false, code });
    await vi.advanceTimersByTimeAsync(RENEW_MS);
    expect(controller.snapshot().state).toBe("OWNERSHIP_LOST");
    expect(controller.snapshot().ownershipLostCode).toBe(code);
    expect(events.filter((e) => e.type === "OWNERSHIP_LOST")).toEqual([{ type: "OWNERSHIP_LOST", code }]);
  });

  it("a renew reporting a different generation loses ownership", async () => {
    const { controller, lease } = await started();
    lease.renew.mockResolvedValueOnce({ ok: true, generation: 2, expiresAt: leaseExpiresAt(), clockSource: "LOCAL_CLOCK" });
    await vi.advanceTimersByTimeAsync(RENEW_MS);
    expect(controller.snapshot()).toMatchObject({ state: "OWNERSHIP_LOST", ownershipLostCode: "RUNTIME_LEASE_GENERATION_MISMATCH" });
  });

  it("39. heartbeat stopped on finish", async () => {
    const { controller, lease } = await started();
    await vi.advanceTimersByTimeAsync(RENEW_MS);
    await controller.finish("CALLER_HANGUP");
    await vi.advanceTimersByTimeAsync(RENEW_MS * 10);
    expect(lease.renew).toHaveBeenCalledTimes(1);
  });

  it("40. heartbeat stopped on ownership loss", async () => {
    const { controller, lease } = await started();
    lease.renew.mockResolvedValueOnce({ ok: false, code: "RUNTIME_LEASE_EXPIRED" });
    await vi.advanceTimersByTimeAsync(RENEW_MS);
    expect(controller.snapshot().state).toBe("OWNERSHIP_LOST");
    await vi.advanceTimersByTimeAsync(RENEW_MS * 10);
    expect(lease.renew).toHaveBeenCalledTimes(1);
  });

  it("renew interval is capped at a third of the acquired lease duration", async () => {
    const { controller, lease } = setup();
    lease.acquire.mockResolvedValueOnce({
      ok: true,
      takeover: false,
      lease: { bindingId: BINDING_ID, clinicId: "clinic_a", ownerId: OWNER, generation: 1, leaseToken: TOKEN, expiresAt: leaseExpiresAt(), leaseDurationMs: 9_000, clockSource: "LOCAL_CLOCK" },
    });
    await controller.start();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(lease.renew).toHaveBeenCalledTimes(1);
  });
});

/* ── Single flight / buffering ───────────────────────────────────────── */

describe("CallController — single-flight business turns", () => {
  it("10/11. only one processRuntimeTranscript in flight; the second transcript is buffered", async () => {
    const { controller, bridge } = await started();
    expect(controller.submitTranscript("TRANSCRIPT_SECRET_1")).toEqual({ accepted: true, disposition: "STARTED" });
    await flush();
    expect(controller.submitTranscript("TRANSCRIPT_SECRET_2")).toEqual({ accepted: true, disposition: "BUFFERED" });
    await flush();
    expect(bridge.processRuntimeTranscript).toHaveBeenCalledTimes(1);
    expect(controller.snapshot()).toMatchObject({ turnInFlight: true, pendingTranscript: true });
    bridge.turns[0].deferred.resolve(turnResult(1));
    await flush();
    expect(bridge.processRuntimeTranscript).toHaveBeenCalledTimes(2);
    bridge.turns[1].deferred.resolve(turnResult(2));
    await controller.whenIdle();
    expect(bridge.maxInFlight).toBe(1);
  });

  it("12/13. buffer is bounded to one and the newest buffered transcript wins", async () => {
    const { controller, bridge } = await started();
    controller.submitTranscript("first");
    await flush();
    expect(controller.submitTranscript("second").accepted && "ok").toBe("ok");
    expect(controller.submitTranscript("third")).toEqual({ accepted: true, disposition: "REPLACED_PENDING" });
    expect(controller.submitTranscript("fourth")).toEqual({ accepted: true, disposition: "REPLACED_PENDING" });
    bridge.turns[0].deferred.resolve(turnResult(1));
    await flush();
    expect(bridge.turns.map((t) => t.transcript)).toEqual(["first", "fourth"]);
    bridge.turns[1].deferred.resolve(turnResult(2));
    await controller.whenIdle();
    expect(bridge.processRuntimeTranscript).toHaveBeenCalledTimes(2);
    expect(bridge.turns.some((t) => t.transcript.includes("second") || t.transcript.includes("third"))).toBe(false);
    expect(bridge.turns.some((t) => t.transcript.includes(" "))).toBe(false);
  });

  it("14. buffered speech SUBMIT runs the pending transcript next", async () => {
    const { controller, bridge, outcomes } = await started();
    controller.submitTranscript("first");
    await flush();
    controller.submitTranscript("correction");
    bridge.turns[0].deferred.resolve(turnResult(1, { bufferedSpeech: "SUBMIT" }));
    await flush();
    expect(bridge.turns[1].transcript).toBe("correction");
    bridge.turns[1].deferred.resolve(turnResult(2));
    await controller.whenIdle();
    expect(outcomes().map((o) => o.kind)).toEqual(["SPEAK", "SPEAK"]);
  });

  it("15. buffered speech DISCARD clears it (confirmation summary)", async () => {
    const { controller, bridge, outcomes } = await started();
    controller.submitTranscript("first");
    await flush();
    controller.submitTranscript("evet");
    bridge.turns[0].deferred.resolve(turnResult(1, UNINTERRUPTIBLE));
    await controller.whenIdle();
    expect(bridge.processRuntimeTranscript).toHaveBeenCalledTimes(1);
    expect(controller.snapshot().pendingTranscript).toBe(false);
    expect(outcomes()).toEqual([
      expect.objectContaining({ kind: "SPEAK", turnSeq: 1, allowBargeIn: false }),
    ]);
  });

  it("no pending transcript → nothing else is processed", async () => {
    const { controller, bridge } = await started();
    controller.submitTranscript("only");
    await flush();
    bridge.turns[0].deferred.resolve(turnResult(1));
    await controller.whenIdle();
    expect(bridge.processRuntimeTranscript).toHaveBeenCalledTimes(1);
  });

  it("16. the controller never generates turn ids; they come from the bridge", async () => {
    const { controller, bridge, outcomes } = await started();
    controller.submitTranscript("hello");
    await flush();
    expect(Object.keys(bridge.processRuntimeTranscript.mock.calls[0][0]).sort()).toEqual(["runtimeCall", "transcript"]);
    bridge.turns[0].deferred.resolve(turnResult(7));
    await controller.whenIdle();
    expect(outcomes()[0]).toEqual({
      kind: "SPEAK",
      turnId: formatTurnId(BINDING_ID, 7),
      turnSeq: 7,
      speechText: "SPEECH_SECRET_7",
      allowBargeIn: true,
      endCallSuggested: false,
      endAfterPlayback: null,
    });
    expect(controller.snapshot().lastTurnSeq).toBe(7);
  });

  it("every business turn is preceded by a strong lease verify with the minimum remaining time", async () => {
    const { controller, bridge, lease, order } = await started({ verifyMinRemainingMs: 7_000 });
    controller.submitTranscript("a");
    await flush();
    controller.submitTranscript("b");
    bridge.turns[0].deferred.resolve(turnResult(1));
    await flush();
    bridge.turns[1].deferred.resolve(turnResult(2));
    await controller.whenIdle();
    expect(order.filter((o) => o === "verify" || o === "process")).toEqual(["verify", "process", "verify", "process"]);
    expect(lease.verify.mock.calls.every((c) => c[1].minRemainingMs === 7_000)).toBe(true);
  });

  it("transient verify failure skips the business turn but keeps the call active", async () => {
    const { controller, bridge, lease, outcomes } = await started();
    lease.verify.mockResolvedValueOnce({ ok: false, code: "RUNTIME_LEASE_LOOKUP_FAILED" });
    controller.submitTranscript("hello");
    await controller.whenIdle();
    expect(bridge.processRuntimeTranscript).not.toHaveBeenCalled();
    expect(outcomes()).toEqual([{ kind: "NOT_PROCESSED", code: "LEASE_UNVERIFIED" }]);
    expect(controller.snapshot().state).toBe("ACTIVE");
  });

  it("definitive verify failure loses ownership before Agent Core is invoked", async () => {
    const { controller, bridge, lease, events } = await started();
    lease.verify.mockResolvedValueOnce({ ok: false, code: "RUNTIME_LEASE_GENERATION_MISMATCH" });
    controller.submitTranscript("hello");
    await controller.whenIdle();
    expect(bridge.processRuntimeTranscript).not.toHaveBeenCalled();
    expect(controller.snapshot().state).toBe("OWNERSHIP_LOST");
    expect(events.map((e) => e.type)).toEqual(["OWNERSHIP_LOST", "TURN_OUTCOME"]);
  });

  it("non-terminal bridge discard (empty transcript) keeps the call and lets the pending transcript run", async () => {
    const { controller, bridge, outcomes } = await started();
    controller.submitTranscript("   ");
    await flush();
    controller.submitTranscript("real question");
    bridge.turns[0].deferred.resolve({ ok: false, action: "DISCARD", code: "TRANSCRIPT_EMPTY", retryable: false });
    await flush();
    expect(bridge.turns[1].transcript).toBe("real question");
    bridge.turns[1].deferred.resolve(turnResult(1));
    await controller.whenIdle();
    expect(outcomes().map((o) => o.kind)).toEqual(["NOT_PROCESSED", "SPEAK"]);
    expect(controller.snapshot().state).toBe("ACTIVE");
  });

  it("an unexpected bridge BUFFER is not resubmitted (no tight loop)", async () => {
    const { controller, bridge, outcomes } = await started();
    controller.submitTranscript("x");
    await flush();
    bridge.turns[0].deferred.resolve({ ok: false, action: "BUFFER", code: "TURN_IN_FLIGHT", retryable: true });
    await controller.whenIdle();
    expect(bridge.processRuntimeTranscript).toHaveBeenCalledTimes(1);
    expect(outcomes()).toEqual([{ kind: "NOT_PROCESSED", code: "BRIDGE_UNEXPECTED_BUFFER" }]);
  });
});

/* ── Failures ────────────────────────────────────────────────────────── */

describe("CallController — business turn failure", () => {
  it("17. agent failure is never retried; the canonical end reason is exposed and the call finishes", async () => {
    const { controller, bridge, events, outcomes } = await started();
    controller.submitTranscript("book me");
    await flush();
    controller.submitTranscript("buffered during failure");
    bridge.turns[0].deferred.resolve({
      ok: false,
      action: "DISCARD",
      code: "AGENT_FAILED",
      reasonCode: "AGENT_ERROR",
      retryable: false,
      endReason: "AGENT_FAILURE",
      fallback: "TECHNICAL_FAILURE",
    });
    await controller.whenIdle();
    await flush();
    expect(bridge.processRuntimeTranscript).toHaveBeenCalledTimes(1);
    expect(outcomes()).toEqual([
      { kind: "FAILED", code: "AGENT_FAILED", reasonCode: "AGENT_ERROR", endReason: "AGENT_FAILURE", fallback: "TECHNICAL_FAILURE" },
    ]);
    expect(events).toContainEqual({ type: "CALL_END_REQUESTED", endReason: "AGENT_FAILURE", fallback: "TECHNICAL_FAILURE" });
    const result = await controller.finish("CALLER_HANGUP");
    expect(result.reason).toBe("AGENT_FAILURE");
    expect(bridge.endRuntimeCall).toHaveBeenCalledTimes(1);
    expect(bridge.endRuntimeCall.mock.calls[0][0].reason).toBe("AGENT_FAILURE");
  });

  it("a throwing bridge is a single RUNTIME_FAILURE, never retried", async () => {
    const { controller, bridge, outcomes } = await started();
    bridge.processRuntimeTranscript.mockRejectedValueOnce(new Error("boom"));
    controller.submitTranscript("x");
    await controller.whenIdle();
    const result = await controller.finish("CALLER_HANGUP");
    expect(bridge.processRuntimeTranscript).toHaveBeenCalledTimes(1);
    expect(outcomes()[0]).toMatchObject({ kind: "FAILED", code: "INTERNAL_ERROR", endReason: "RUNTIME_FAILURE" });
    expect(result.reason).toBe("RUNTIME_FAILURE");
  });

  it("CALL_ALREADY_ENDED from the bridge ends this controller with RUNTIME_FAILURE", async () => {
    const { controller, bridge, outcomes } = await started();
    controller.submitTranscript("x");
    await flush();
    bridge.turns[0].deferred.resolve({ ok: false, action: "DISCARD", code: "CALL_ALREADY_ENDED", retryable: false });
    await controller.whenIdle();
    const result = await controller.finish("CALLER_HANGUP");
    expect(outcomes()[0]).toMatchObject({ kind: "FAILED", endReason: "RUNTIME_FAILURE", fallback: "TECHNICAL_FAILURE" });
    expect(result.reason).toBe("RUNTIME_FAILURE");
  });
});

/* ── Hangup / ownership loss during a turn ───────────────────────────── */

describe("CallController — no cancellation", () => {
  it("18/19. caller finish while a turn is in flight waits for it and suppresses its speech", async () => {
    const { controller, bridge, order, outcomes } = await started();
    controller.submitTranscript("TRANSCRIPT_SECRET_1");
    await flush();
    const finishing = controller.finish("CALLER_HANGUP");
    await flush();
    expect(controller.snapshot().state).toBe("ENDING");
    expect(bridge.endRuntimeCall).not.toHaveBeenCalled();
    expect(bridge.turns[0].settled).toBe(false);
    bridge.turns[0].deferred.resolve(turnResult(1, { appointmentCreated: true }));
    const result = await finishing;
    expect(bridge.turns[0].settled).toBe(true);
    expect(order).toEqual(["verify", "process", "process-settled", "end", "release"]);
    expect(outcomes()).toEqual([{ kind: "SUPPRESSED", reason: "CALL_ENDING", turnSeq: 1 }]);
    expect(JSON.stringify(outcomes())).not.toContain("SPEECH_SECRET");
    expect(result).toMatchObject({ disposition: "ENDED", reason: "CALLER_HANGUP" });
    expect(controller.snapshot().processedTurns).toBe(1);
  });

  it("20/21. ownership loss during a turn lets it settle, suppresses speech, and never ends the call", async () => {
    const { controller, bridge, lease, events, outcomes } = await started();
    controller.submitTranscript("TRANSCRIPT_SECRET_1");
    await flush();
    controller.submitTranscript("pending");
    lease.renew.mockResolvedValueOnce({ ok: false, code: "RUNTIME_LEASE_TOKEN_MISMATCH" });
    await vi.advanceTimersByTimeAsync(RENEW_MS);
    expect(controller.snapshot().state).toBe("OWNERSHIP_LOST");
    expect(events.some((e) => e.type === "OWNERSHIP_LOST")).toBe(true);
    expect(bridge.turns[0].settled).toBe(false);
    bridge.turns[0].deferred.resolve(turnResult(1));
    await controller.whenIdle();
    expect(bridge.turns[0].settled).toBe(true);
    expect(bridge.processRuntimeTranscript).toHaveBeenCalledTimes(1);
    expect(outcomes()).toEqual([{ kind: "SUPPRESSED", reason: "OWNERSHIP_LOST", turnSeq: 1 }]);
    expect(bridge.endRuntimeCall).not.toHaveBeenCalled();
    expect(lease.release).not.toHaveBeenCalled();
  });

  it("ownership lost by an in-flight renew while ending: no endRuntimeCall, no release", async () => {
    const { controller, bridge, lease } = await started();
    const renewed = deferred<Awaited<ReturnType<RuntimeLeaseOperations["renew"]>>>();
    lease.renew.mockImplementationOnce(() => renewed.promise);
    await vi.advanceTimersByTimeAsync(RENEW_MS);
    const finishing = controller.finish("CALLER_HANGUP");
    await flush();
    expect(bridge.endRuntimeCall).not.toHaveBeenCalled();
    renewed.resolve({ ok: false, code: "RUNTIME_LEASE_EXPIRED" });
    const result = await finishing;
    expect(result.disposition).toBe("OWNERSHIP_LOST");
    expect(bridge.endRuntimeCall).not.toHaveBeenCalled();
    expect(lease.release).not.toHaveBeenCalled();
  });
});

/* ── Finish ──────────────────────────────────────────────────────────── */

describe("CallController — finish", () => {
  it("22/23/26. normal finish: endRuntimeCall exactly once, then release exactly once", async () => {
    const { controller, bridge, lease, order, events } = await started();
    const result = await controller.finish("CALLER_HANGUP");
    expect(bridge.endRuntimeCall).toHaveBeenCalledTimes(1);
    expect(bridge.endRuntimeCall).toHaveBeenCalledWith({ runtimeCall: makeCall(), reason: "CALLER_HANGUP" });
    expect(lease.release).toHaveBeenCalledTimes(1);
    expect(lease.release.mock.calls[0][0]).toMatchObject({ bindingId: BINDING_ID, generation: 1 });
    expect(order).toEqual(["end", "release"]);
    expect(result).toEqual({
      reason: "CALLER_HANGUP",
      disposition: "ENDED",
      endRuntimeCall: { attempted: true, ok: true, bindingStatus: "ENDED", alreadyEnded: false, fallback: null },
      leaseRelease: { attempted: true, ok: true, attempts: 1, alreadyReleased: false },
    });
    expect(controller.snapshot().state).toBe("ENDED");
    expect(events.filter((e) => e.type === "FINISHED")).toHaveLength(1);
  });

  it("24. repeated finish is idempotent", async () => {
    const { controller, bridge, lease } = await started();
    const first = await controller.finish("CALLER_HANGUP");
    const second = await controller.finish("MAX_DURATION");
    const third = await controller.finish("RUNTIME_FAILURE");
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(bridge.endRuntimeCall).toHaveBeenCalledTimes(1);
    expect(lease.release).toHaveBeenCalledTimes(1);
  });

  it("25. concurrent finish calls are idempotent (first reason wins)", async () => {
    const { controller, bridge, lease } = await started();
    const calls = [
      controller.finish("CALLER_HANGUP"),
      controller.finish("STT_FAILURE"),
      controller.finish("RUNTIME_FAILURE"),
    ];
    expect(new Set(calls).size).toBe(1);
    const [a, b, c] = await Promise.all(calls);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a.reason).toBe("CALLER_HANGUP");
    expect(bridge.endRuntimeCall).toHaveBeenCalledTimes(1);
    expect(lease.release).toHaveBeenCalledTimes(1);
  });

  it("27. endRuntimeCall failure still attempts a bounded release and exposes the failure", async () => {
    const { controller, bridge, lease, order } = await started();
    bridge.endRuntimeCall.mockResolvedValueOnce({ ok: false, code: "BINDING_FAILED", reasonCode: "CALL_BINDING_UPDATE_FAILED", retryable: true });
    const result = await controller.finish("CALLER_HANGUP");
    expect(result.endRuntimeCall).toEqual({ attempted: true, ok: false, code: "BINDING_FAILED", reasonCode: "CALL_BINDING_UPDATE_FAILED" });
    expect(lease.release).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["release"]);
    expect(bridge.endRuntimeCall.mock.invocationCallOrder[0]).toBeLessThan(lease.release.mock.invocationCallOrder[0]);
    expect(controller.snapshot().state).toBe("ENDED");
  });

  it("a throwing endRuntimeCall is exposed as INTERNAL_ERROR and release still runs", async () => {
    const { controller, bridge, lease } = await started();
    bridge.endRuntimeCall.mockRejectedValueOnce(new Error("down"));
    const result = await controller.finish("CALLER_HANGUP");
    expect(result.endRuntimeCall).toMatchObject({ attempted: true, ok: false, code: "INTERNAL_ERROR" });
    expect(lease.release).toHaveBeenCalledTimes(1);
  });

  it("lease release is bounded: transient failures retry up to releaseMaxAttempts, definitive ones stop", async () => {
    const transient = await started({ releaseMaxAttempts: 3 });
    transient.lease.release.mockResolvedValue({ ok: false, code: "RUNTIME_LEASE_UPDATE_FAILED" });
    const r1 = await transient.controller.finish("CALLER_HANGUP");
    expect(r1.leaseRelease).toEqual({ attempted: true, ok: false, attempts: 3, code: "RUNTIME_LEASE_UPDATE_FAILED" });
    expect(transient.lease.release).toHaveBeenCalledTimes(3);

    const definitive = await started({ releaseMaxAttempts: 3 });
    definitive.lease.release.mockResolvedValue({ ok: false, code: "RUNTIME_LEASE_TOKEN_MISMATCH" });
    const r2 = await definitive.controller.finish("CALLER_HANGUP");
    expect(r2.leaseRelease).toMatchObject({ ok: false, attempts: 1, code: "RUNTIME_LEASE_TOKEN_MISMATCH" });
  });

  it("28. finish after ownership loss does not end the binding (local cleanup only)", async () => {
    const { controller, bridge, lease } = await started();
    lease.renew.mockResolvedValueOnce({ ok: false, code: "RUNTIME_LEASE_NOT_FOUND" });
    await vi.advanceTimersByTimeAsync(RENEW_MS);
    const result = await controller.finish("CALLER_HANGUP");
    expect(result).toEqual({
      reason: "CALLER_HANGUP",
      disposition: "OWNERSHIP_LOST",
      endRuntimeCall: { attempted: false },
      leaseRelease: { attempted: false },
    });
    expect(await controller.finish("CALLER_HANGUP")).toBe(result);
    expect(bridge.endRuntimeCall).not.toHaveBeenCalled();
    expect(lease.release).not.toHaveBeenCalled();
    expect(controller.snapshot().state).toBe("OWNERSHIP_LOST");
  });

  it("29. no new transcript accepted while ENDING", async () => {
    const { controller, bridge } = await started();
    controller.submitTranscript("first");
    await flush();
    const finishing = controller.finish("CALLER_HANGUP");
    expect(controller.submitTranscript("late")).toEqual({ accepted: false, reason: "ENDING" });
    bridge.turns[0].deferred.resolve(turnResult(1));
    await finishing;
    expect(bridge.processRuntimeTranscript).toHaveBeenCalledTimes(1);
  });

  it("pending transcript is dropped when finish arrives during a turn", async () => {
    const { controller, bridge } = await started();
    controller.submitTranscript("first");
    await flush();
    controller.submitTranscript("pending");
    const finishing = controller.finish("CALLER_HANGUP");
    bridge.turns[0].deferred.resolve(turnResult(1));
    await finishing;
    expect(bridge.processRuntimeTranscript).toHaveBeenCalledTimes(1);
    expect(controller.snapshot().pendingTranscript).toBe(false);
  });

  it("30. no new transcript accepted after ENDED", async () => {
    const { controller, bridge } = await started();
    await controller.finish("CALLER_HANGUP");
    expect(controller.submitTranscript("late")).toEqual({ accepted: false, reason: "ENDED" });
    expect(bridge.processRuntimeTranscript).not.toHaveBeenCalled();
  });

  it("transcripts before start/while STARTING are rejected", async () => {
    const { controller } = setup();
    expect(controller.submitTranscript("early")).toEqual({ accepted: false, reason: "NOT_ACTIVE" });
  });

  it("finish before start ends without ownership and touches nothing", async () => {
    const { controller, bridge, lease } = setup();
    const result = await controller.finish("CALLER_HANGUP");
    expect(result.disposition).toBe("ENDED_WITHOUT_OWNERSHIP");
    expect(lease.acquire).not.toHaveBeenCalled();
    expect(bridge.endRuntimeCall).not.toHaveBeenCalled();
  });
});

/* ── Lifecycle reasons ───────────────────────────────────────────────── */

describe("CallController — lifecycle reasons", () => {
  it("31. max duration (from the runtime call's canonical policy) maps to MAX_DURATION", async () => {
    const { controller, bridge, events } = await started({ runtimeCall: makeCall({ maxCallDurationMs: 60_000 }) });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(bridge.endRuntimeCall).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(events).toContainEqual({ type: "CALL_END_REQUESTED", endReason: "MAX_DURATION", fallback: "MAX_DURATION_GOODBYE" });
    expect(bridge.endRuntimeCall).toHaveBeenCalledWith(expect.objectContaining({ reason: "MAX_DURATION" }));
    expect(controller.snapshot()).toMatchObject({ state: "ENDED", finishReason: "MAX_DURATION" });
  });

  it("max duration counts from the call start (re-attached call past its limit ends immediately)", async () => {
    vi.setSystemTime(T0 + 61_000);
    const { controller, bridge } = await started({ runtimeCall: makeCall({ maxCallDurationMs: 60_000 }) });
    await flush();
    expect(bridge.endRuntimeCall).toHaveBeenCalledWith(expect.objectContaining({ reason: "MAX_DURATION" }));
    expect(controller.snapshot().state).toBe("ENDED");
  });

  it("max duration during a turn waits for the turn and suppresses its speech", async () => {
    const { controller, bridge, outcomes } = await started({ runtimeCall: makeCall({ maxCallDurationMs: 30_000 }) });
    controller.submitTranscript("x");
    await flush();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(controller.snapshot().state).toBe("ENDING");
    expect(bridge.endRuntimeCall).not.toHaveBeenCalled();
    bridge.turns[0].deferred.resolve(turnResult(1));
    await controller.whenIdle();
    await flush();
    expect(outcomes()).toEqual([{ kind: "SUPPRESSED", reason: "CALL_ENDING", turnSeq: 1 }]);
    expect(bridge.endRuntimeCall).toHaveBeenCalledTimes(1);
  });

  it("32. SILENCE_TIMEOUT (decided by the worker via lifecyclePolicy) is passed canonically", async () => {
    const { controller, bridge } = await started();
    const result = await controller.finish("SILENCE_TIMEOUT");
    expect(bridge.endRuntimeCall).toHaveBeenCalledWith(expect.objectContaining({ reason: "SILENCE_TIMEOUT" }));
    expect(result.endRuntimeCall).toMatchObject({ ok: true, fallback: "SILENCE_GOODBYE" });
  });

  it("a non-canonical end reason fails closed to RUNTIME_FAILURE", async () => {
    const { controller, bridge } = await started();
    await controller.finish("BOGUS" as VoiceCallEndReason);
    expect(bridge.endRuntimeCall).toHaveBeenCalledWith(expect.objectContaining({ reason: "RUNTIME_FAILURE" }));
  });
});

/* ── Agent-completed calls (Step 6B.3A) ──────────────────────────────── */

describe("CallController — AGENT_COMPLETED", () => {
  it("endCallSuggested requests AGENT_COMPLETED after playback (exposed, not executed)", async () => {
    const { controller, bridge, outcomes, logs } = await started();
    controller.submitTranscript("TRANSCRIPT_SECRET_bye");
    await flush();
    bridge.turns[0].deferred.resolve(turnResult(3, { endCallSuggested: true }));
    await controller.whenIdle();
    expect(outcomes()).toEqual([
      expect.objectContaining({ kind: "SPEAK", turnSeq: 3, endCallSuggested: true, endAfterPlayback: "AGENT_COMPLETED" }),
    ]);
    expect(controller.snapshot().agentCompletionRequested).toBe(true);
    const requested = logs.filter((l) => l.checkpoint === "VOICE_CALL_CONTROLLER_AGENT_COMPLETION_REQUESTED");
    expect(requested).toEqual([expect.objectContaining({ turnSeq: 3, reason: "AGENT_COMPLETED" })]);
    const serialized = JSON.stringify(logs);
    for (const secret of ["TRANSCRIPT_SECRET", "REPLY_SECRET", "SPEECH_SECRET"]) expect(serialized).not.toContain(secret);
  });

  it("does NOT auto-finish on endCallSuggested; the worker finishes after playback", async () => {
    const { controller, bridge, events, lease } = await started();
    controller.submitTranscript("bye");
    await flush();
    bridge.turns[0].deferred.resolve(turnResult(1, { endCallSuggested: true }));
    await controller.whenIdle();
    await vi.advanceTimersByTimeAsync(RENEW_MS * 6);
    expect(controller.snapshot().state).toBe("ACTIVE");
    expect(bridge.endRuntimeCall).not.toHaveBeenCalled();
    expect(lease.release).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === "CALL_END_REQUESTED" || e.type === "FINISHED")).toBe(false);

    const result = await controller.finish(endReasonAfterFinalReply("PLAYED"));
    expect(bridge.endRuntimeCall).toHaveBeenCalledWith({ runtimeCall: makeCall(), reason: "AGENT_COMPLETED" });
    expect(result).toMatchObject({ reason: "AGENT_COMPLETED", disposition: "ENDED", endRuntimeCall: { ok: true, fallback: null } });
  });

  it("final playback failure finishes with TTS_FAILURE instead of AGENT_COMPLETED", async () => {
    const { controller, bridge } = await started();
    controller.submitTranscript("bye");
    await flush();
    bridge.turns[0].deferred.resolve(turnResult(1, { endCallSuggested: true }));
    await controller.whenIdle();
    const result = await controller.finish(endReasonAfterFinalReply("PLAYBACK_FAILED"));
    expect(result.reason).toBe("TTS_FAILURE");
    expect(bridge.endRuntimeCall).toHaveBeenCalledWith(expect.objectContaining({ reason: "TTS_FAILURE" }));
  });

  it("a later ordinary turn withdraws the completion request", async () => {
    const { controller, bridge, outcomes } = await started();
    controller.submitTranscript("bye");
    await flush();
    controller.submitTranscript("aslında bir sorum daha var");
    bridge.turns[0].deferred.resolve(turnResult(1, { endCallSuggested: true }));
    await flush();
    bridge.turns[1].deferred.resolve(turnResult(2));
    await controller.whenIdle();
    expect(outcomes().map((o) => (o.kind === "SPEAK" ? o.endAfterPlayback : o.kind))).toEqual(["AGENT_COMPLETED", null]);
    expect(controller.snapshot().agentCompletionRequested).toBe(false);
  });

  it("a suppressed turn never requests completion", async () => {
    const { controller, bridge, outcomes } = await started();
    controller.submitTranscript("bye");
    await flush();
    const finishing = controller.finish("CALLER_HANGUP");
    bridge.turns[0].deferred.resolve(turnResult(1, { endCallSuggested: true }));
    await finishing;
    expect(outcomes()).toEqual([{ kind: "SUPPRESSED", reason: "CALL_ENDING", turnSeq: 1 }]);
    expect(controller.snapshot().agentCompletionRequested).toBe(false);
  });

  it("an unrequested AGENT_COMPLETED is passed through unchanged but flagged in telemetry", async () => {
    const { controller, bridge, logs } = await started();
    await controller.finish("AGENT_COMPLETED");
    expect(bridge.endRuntimeCall).toHaveBeenCalledWith(expect.objectContaining({ reason: "AGENT_COMPLETED" }));
    expect(logs.some((l) => l.checkpoint === "VOICE_CALL_CONTROLLER_AGENT_COMPLETED_UNREQUESTED")).toBe(true);
  });

  it("other end reasons keep their meaning (never rewritten to AGENT_COMPLETED)", async () => {
    for (const reason of ["CALLER_HANGUP", "SILENCE_TIMEOUT", "MAX_DURATION", "STT_FAILURE", "TTS_FAILURE", "AGENT_FAILURE", "RUNTIME_FAILURE"] as const) {
      const { controller, bridge } = await started();
      controller.submitTranscript("bye");
      await flush();
      bridge.turns[0].deferred.resolve(turnResult(1, { endCallSuggested: true }));
      await controller.whenIdle();
      expect((await controller.finish(reason)).reason).toBe(reason);
      expect(bridge.endRuntimeCall).toHaveBeenCalledWith(expect.objectContaining({ reason }));
    }
  });
});

describe("lifecycle/controller module boundary", () => {
  it("no LiveKit, SIP or speech-provider references in lifecyclePolicy or callController", () => {
    for (const file of ["lib/voice/telephony/lifecyclePolicy.ts", "lib/voice/runtime/callController.ts"]) {
      const src = readFileSync(resolve(__dirname, "..", file), "utf8");
      expect(src).not.toMatch(/livekit|@livekit|\bsip\b|verimor|deepgram|elevenlabs|cartesia|twilio|silero|openai|AbortController/i);
    }
  });
});

/* ── Telemetry / secrecy ─────────────────────────────────────────────── */

describe("CallController — telemetry and secrecy", () => {
  const ALLOWED_LOG_KEYS = new Set([
    "checkpoint",
    "state",
    "bindingId",
    "clinicId",
    "callSessionId",
    "conversationId",
    "leaseGeneration",
    "turnSeq",
    "code",
    "reason",
    "verifyMs",
    "bridgeMs",
  ]);

  async function exercise() {
    const ctx = await started();
    ctx.controller.submitTranscript("TRANSCRIPT_SECRET_A +905321112233");
    await flush();
    ctx.controller.submitTranscript("TRANSCRIPT_SECRET_B");
    ctx.lease.renew.mockResolvedValueOnce({ ok: false, code: "RUNTIME_LEASE_LOOKUP_FAILED" });
    await vi.advanceTimersByTimeAsync(RENEW_MS);
    ctx.bridge.turns[0].deferred.resolve(turnResult(1));
    await flush();
    ctx.bridge.turns[1].deferred.resolve(turnResult(2, UNINTERRUPTIBLE));
    await ctx.controller.whenIdle();
    const finishResult = await ctx.controller.finish("CALLER_HANGUP");
    return { ...ctx, finishResult };
  }

  it("33. logs contain no transcript, reply, speech text or caller number; only allowed keys", async () => {
    const { logs } = await exercise();
    expect(logs.length).toBeGreaterThan(5);
    const serialized = JSON.stringify(logs);
    for (const secret of ["TRANSCRIPT_SECRET", "REPLY_SECRET", "SPEECH_SECRET", "905321112233"]) {
      expect(serialized).not.toContain(secret);
    }
    for (const entry of logs) for (const key of Object.keys(entry)) expect(ALLOWED_LOG_KEYS.has(key)).toBe(true);
    for (const entry of logs) {
      if (entry.verifyMs !== undefined) expect(typeof entry.verifyMs).toBe("number");
      if (entry.bridgeMs !== undefined) expect(typeof entry.bridgeMs).toBe("number");
    }
    expect(logs.some((l) => l.checkpoint === "VOICE_CALL_CONTROLLER_TURN_COMPLETED" && typeof l.bridgeMs === "number")).toBe(true);
    expect(logs.some((l) => l.turnSeq === 2)).toBe(true);
    expect(logs.every((l) => l.bindingId === BINDING_ID)).toBe(true);
  });

  it("34. the lease token never appears in snapshots, results, events or logs", async () => {
    const { controller, logs, events, finishResult } = await exercise();
    const startCtx = setup();
    const startResult = await startCtx.controller.start();
    const surfaces = JSON.stringify({ snap: controller.snapshot(), logs, events, finishResult, startResult, startSnap: startCtx.controller.snapshot() });
    expect(surfaces).not.toContain(TOKEN_MARKER);
    expect(surfaces).not.toContain("leaseToken");
  });

  it("turn outcomes carry no reply text or Agent Core internals", async () => {
    const { events } = await exercise();
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("REPLY_SECRET");
    expect(serialized).not.toContain("appointmentState");
    expect(serialized).not.toContain("TRANSCRIPT_SECRET");
  });

  it("35. state transitions are deterministic", async () => {
    const { controller, stateTransitions } = await started();
    await controller.finish("CALLER_HANGUP");
    expect(stateTransitions()).toEqual(["NEW->STARTING", "STARTING->ACTIVE", "ACTIVE->ENDING", "ENDING->ENDED"]);

    const lost = await started();
    lost.lease.renew.mockResolvedValueOnce({ ok: false, code: "RUNTIME_LEASE_EXPIRED" });
    await vi.advanceTimersByTimeAsync(RENEW_MS);
    await lost.controller.finish("CALLER_HANGUP");
    expect(lost.stateTransitions()).toEqual(["NEW->STARTING", "STARTING->ACTIVE", "ACTIVE->OWNERSHIP_LOST"]);
  });

  it("a throwing event sink or logger does not break call handling", async () => {
    const { controller, bridge } = await started({
      onEvent: () => {
        throw new Error("sink");
      },
      logger: () => {
        throw new Error("logger");
      },
    });
    controller.submitTranscript("x");
    await flush();
    bridge.turns[0].deferred.resolve(turnResult(1));
    await controller.whenIdle();
    const result = await controller.finish("CALLER_HANGUP");
    expect(result.disposition).toBe("ENDED");
  });
});

/* ── Configuration / composition ─────────────────────────────────────── */

describe("CallController — configuration", () => {
  it("rejects invalid timing configuration", () => {
    const base = { runtimeCall: makeCall(), ownerId: OWNER, bridge: makeBridge([]), lease: makeLease([]) };
    expect(() => createCallController({ ...base, renewIntervalMs: 0 })).toThrow(RangeError);
    expect(() => createCallController({ ...base, verifyMinRemainingMs: -1 })).toThrow(RangeError);
    expect(() => createCallController({ ...base, acquireRetry: { maxAttempts: 0, delayMs: 1 } })).toThrow(RangeError);
    expect(() => createCallController({ ...base, releaseMaxAttempts: 0 })).toThrow(RangeError);
    expect(() => createCallController({ ...base, runtimeCall: makeCall({ maxCallDurationMs: 0 }) })).toThrow(RangeError);
  });

  it("createRuntimeLeaseOperations binds the canonical runtimeLease functions", async () => {
    const ops = createRuntimeLeaseOperations({ adminDb: null });
    expect(await ops.acquire({ bindingId: BINDING_ID, clinicId: "clinic_a", ownerId: OWNER })).toEqual({
      ok: false,
      code: "RUNTIME_LEASE_LOOKUP_FAILED",
    });
    const badProof = { bindingId: BINDING_ID, clinicId: "clinic_a", ownerId: OWNER, generation: 1, leaseToken: "nope" };
    expect(await ops.renew(badProof)).toEqual({ ok: false, code: "RUNTIME_LEASE_INVALID_INPUT" });
    expect(await ops.verify(badProof, { minRemainingMs: 0 })).toEqual({ ok: false, code: "RUNTIME_LEASE_INVALID_INPUT" });
    expect(await ops.release(badProof)).toEqual({ ok: false, code: "RUNTIME_LEASE_INVALID_INPUT" });
  });
});

/* ── Integration with the real bridge ────────────────────────────────── */

describe("CallController — with the real Voice Runtime Bridge (in-memory capabilities)", () => {
  it("turn ids come from the bridge's allocator; end goes through the bridge exactly once", async () => {
    vi.useRealTimers();
    let turnSeq = 0;
    const externalCallKey = "livekit-sip:SCL_test";
    const bindingId = deriveCallBindingId(externalCallKey);
    if (!bindingId) throw new Error("invalid external call key");
    const binding: CallBinding = {
      bindingId,
      clinicId: "clinic_a",
      didE164: "+908502428852",
      callSessionId: `call_${SUFFIX}`,
      conversationId: `voice_conv_${SUFFIX}`,
      status: "ACTIVE",
      turnSeq: 0,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const processTurnInputs: Array<{ turnId?: string; text: string }> = [];
    const capabilities: VoiceRuntimeCapabilities = {
      resolveDid: async () => ({ ok: true, clinicId: "clinic_a", didE164: "+908502428852", defaultLocale: "tr-TR" }),
      getOrCreateBinding: async () => ({ ok: true, binding, created: true }),
      allocateTurnId: async () => {
        turnSeq += 1;
        return { ok: true, bindingId, turnSeq, turnId: formatTurnId(bindingId, turnSeq) };
      },
      endBinding: async () => ({ ok: true, binding: { ...binding, status: "ENDED", endReason: "completed" } }),
      failBinding: async () => ({ ok: true, binding: { ...binding, status: "FAILED" } }),
      processTurn: async (input) => {
        processTurnInputs.push({ turnId: input.turnId, text: input.text });
        return {
          ok: true,
          callSessionId: binding.callSessionId,
          conversationId: binding.conversationId,
          clinicId: "clinic_a",
          channel: "voice",
          replyText: "Merhaba, randevu için hangi gün uygun?",
        };
      },
      endSession: async () => ({
        ok: true,
        callSessionId: binding.callSessionId,
        conversationId: binding.conversationId,
        clinicId: "clinic_a",
        status: "COMPLETED",
      }),
    };
    const endBinding = vi.spyOn(capabilities, "endBinding");
    const bridge = createVoiceRuntimeBridge({ capabilities });
    const started = await bridge.startRuntimeCall({ externalCallKey, calledDid: "+908502428852" });
    if (!started.ok) throw new Error(`start failed: ${JSON.stringify(started)}`);

    const events: CallControllerEvent[] = [];
    const controller = createCallController({
      runtimeCall: started.call,
      ownerId: OWNER,
      bridge,
      lease: makeLease([]),
      onEvent: (e) => events.push(e),
    });
    expect((await controller.start()).ok).toBe(true);
    controller.submitTranscript("Merhaba");
    await controller.whenIdle();
    controller.submitTranscript("Yarın");
    await controller.whenIdle();
    const result = await controller.finish("CALLER_HANGUP");

    expect(processTurnInputs.map((i) => i.turnId)).toEqual([formatTurnId(bindingId, 1), formatTurnId(bindingId, 2)]);
    const speak = events.flatMap((e) => (e.type === "TURN_OUTCOME" && e.outcome.kind === "SPEAK" ? [e.outcome] : []));
    expect(speak.map((s) => s.turnSeq)).toEqual([1, 2]);
    expect(speak[0].speechText.length).toBeGreaterThan(0);
    expect(result.endRuntimeCall).toMatchObject({ attempted: true, ok: true, bindingStatus: "ENDED" });
    expect(endBinding).toHaveBeenCalledTimes(1);
    expect(endBinding.mock.calls[0][0]).toMatchObject({ reason: "completed" });
  });
});
