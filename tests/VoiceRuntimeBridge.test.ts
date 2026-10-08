/**
 * Phase 3 Step 4 — provider-independent Voice Runtime Bridge.
 * Unit tests use injected fake capabilities; the end-to-end suite composes the real
 * DID resolver, call binding and Phase 2 adapter over an in-memory Firestore fake.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { Firestore } from "firebase-admin/firestore";
import type { AgentTurnResult } from "@/lib/agent/types";
import type { HandleClinicAgentTurnParams } from "@/lib/agent/handleClinicAgentTurn";
import { createInMemoryCallSessionStore } from "@/lib/voice/callSessionStore";
import type { VoiceErrorResult, VoiceTurnInput, VoiceTurnResult } from "@/lib/voice/types";
import {
  deriveBoundSessionIds,
  deriveCallBindingId,
  failCallBinding,
  formatTurnId,
  type CallBinding,
  type CallBindingFirestore,
  type CallBindingTransaction,
} from "@/lib/voice/telephony/callBinding";
import {
  createVoiceRuntimeBridge,
  type ProcessRuntimeTranscriptResult,
  type StartRuntimeCallInput,
  type VoiceRuntimeCall,
  type VoiceRuntimeCapabilities,
} from "@/lib/voice/runtime/voiceRuntimeBridge";
import {
  composeVoiceRuntimeCapabilities,
  type VoiceRuntimeCompositionDeps,
} from "@/lib/voice/runtime/composeVoiceRuntime";

const REPO = resolve(__dirname, "..");
const DID = "+908502428852";
const CLINIC = "clinic_nova";
const KEY = "lk:room_abc:sip_call_1";
const GREETING = "Nova Dent'e hoş geldiniz. Size nasıl yardımcı olabilirim?";

/* ── Fake capabilities ──────────────────────────────────────────────── */

function deferred<T>() {
  let resolveFn!: (v: T) => void;
  let rejectFn!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolveFn = res;
    rejectFn = rej;
  });
  return { promise, resolve: resolveFn, reject: rejectFn };
}

function turnResult(input: VoiceTurnInput, partial: Partial<VoiceTurnResult> = {}): VoiceTurnResult {
  return {
    ok: true,
    callSessionId: input.callSessionId,
    conversationId: deriveBoundSessionIds(deriveCallBindingId(KEY)!).conversationId,
    clinicId: input.clinicId ?? CLINIC,
    channel: "voice",
    replyText: "Size nasıl yardımcı olabilirim?",
    locale: "tr",
    appointmentState: "IDLE",
    ...partial,
  };
}

function makeCaps(mapping: { greetingText?: string; defaultLocale?: string } = { greetingText: GREETING, defaultLocale: "tr" }) {
  const bindings = new Map<string, CallBinding>();
  const iso = "2026-10-07T10:00:00.000Z";

  const caps = {
    resolveDid: vi.fn<VoiceRuntimeCapabilities["resolveDid"]>(async ({ calledDid }) =>
      calledDid === DID || calledDid === "0850 242 88 52"
        ? { ok: true, didE164: DID, clinicId: CLINIC, ...mapping }
        : { ok: false, code: "DID_MAPPING_NOT_FOUND" }
    ),
    getOrCreateBinding: vi.fn<VoiceRuntimeCapabilities["getOrCreateBinding"]>(async (input) => {
      const bindingId = deriveCallBindingId(input.externalCallKey)!;
      const existing = bindings.get(bindingId);
      if (existing) {
        if (existing.clinicId !== input.clinicId) return { ok: false, code: "CALL_BINDING_TENANT_CONFLICT" };
        if (existing.status === "ENDED") return { ok: false, code: "CALL_BINDING_ENDED" };
        if (existing.status === "FAILED") return { ok: false, code: "CALL_BINDING_FAILED" };
        return { ok: true, binding: { ...existing }, created: false };
      }
      const binding: CallBinding = {
        bindingId,
        clinicId: input.clinicId,
        didE164: input.didE164,
        ...deriveBoundSessionIds(bindingId),
        status: "ACTIVE",
        turnSeq: 0,
        startedAt: iso,
        updatedAt: iso,
      };
      bindings.set(bindingId, binding);
      return { ok: true, binding: { ...binding }, created: true };
    }),
    allocateTurnId: vi.fn<VoiceRuntimeCapabilities["allocateTurnId"]>(async ({ bindingId }) => {
      const b = bindings.get(bindingId);
      if (!b) return { ok: false, code: "CALL_BINDING_NOT_FOUND" };
      if (b.status === "ENDED") return { ok: false, code: "CALL_BINDING_ENDED" };
      if (b.status === "FAILED") return { ok: false, code: "CALL_BINDING_FAILED" };
      b.turnSeq += 1;
      return { ok: true, bindingId, turnSeq: b.turnSeq, turnId: formatTurnId(bindingId, b.turnSeq) };
    }),
    endBinding: vi.fn<VoiceRuntimeCapabilities["endBinding"]>(async ({ bindingId, reason }) => {
      const b = bindings.get(bindingId)!;
      if (b.status === "ACTIVE") Object.assign(b, { status: "ENDED", endReason: reason });
      return { ok: true, binding: { ...b } };
    }),
    failBinding: vi.fn<VoiceRuntimeCapabilities["failBinding"]>(async ({ bindingId, failureCode }) => {
      const b = bindings.get(bindingId)!;
      if (b.status === "ACTIVE") Object.assign(b, { status: "FAILED", failureCode });
      return { ok: true, binding: { ...b } };
    }),
    processTurn: vi.fn<VoiceRuntimeCapabilities["processTurn"]>(async (input) => turnResult(input)),
    endSession: vi.fn<VoiceRuntimeCapabilities["endSession"]>(async (input) => ({
      ok: true,
      callSessionId: input.callSessionId,
      conversationId: "conv",
      clinicId: CLINIC,
      status: input.reason === "failed" ? "FAILED" : "COMPLETED",
    })),
  };
  return { caps, bindings };
}

async function startedBridge(mapping?: Parameters<typeof makeCaps>[0]) {
  const { caps, bindings } = makeCaps(mapping);
  const bridge = createVoiceRuntimeBridge({ capabilities: caps });
  const started = await bridge.startRuntimeCall({ externalCallKey: KEY, calledDid: DID });
  if (!started.ok) throw new Error(`start failed: ${started.code}`);
  return { caps, bindings, bridge, call: started.call };
}

function expectProcessed(r: ProcessRuntimeTranscriptResult) {
  if (!r.ok) throw new Error(`expected PROCESS, got ${r.code}`);
  return r.turn;
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

/* ── START ──────────────────────────────────────────────────────────── */

describe("startRuntimeCall", () => {
  it("1. resolves the called DID to the trusted clinic", async () => {
    const { caps, call } = await startedBridge();
    expect(caps.resolveDid).toHaveBeenCalledTimes(1);
    expect(caps.resolveDid.mock.calls[0][0]).toEqual({ calledDid: DID });
    expect(call.clinicId).toBe(CLINIC);
    expect(call.didE164).toBe(DID);
  });

  it("2. binding receives the resolver's clinicId and canonical DID", async () => {
    const { caps, call } = await startedBridge();
    expect(caps.getOrCreateBinding).toHaveBeenCalledWith({
      externalCallKey: KEY,
      clinicId: CLINIC,
      didE164: DID,
      locale: "tr",
    });
    const ids = deriveBoundSessionIds(deriveCallBindingId(KEY)!);
    expect(call).toMatchObject({ bindingId: deriveCallBindingId(KEY), ...ids });
  });

  it("3. caller/external data cannot supply or override clinicId", async () => {
    const { caps } = makeCaps();
    const bridge = createVoiceRuntimeBridge({ capabilities: caps });
    const forged = {
      externalCallKey: "clinic_evil",
      calledDid: DID,
      clinicId: "clinic_evil",
      callerE164: "+905321112233",
    } as unknown as StartRuntimeCallInput;
    const started = await bridge.startRuntimeCall(forged);
    expect(started.ok && started.call.clinicId).toBe(CLINIC);
    expect(Object.keys(caps.resolveDid.mock.calls[0][0])).toEqual(["calledDid"]);
    const bindingInput = caps.getOrCreateBinding.mock.calls[0][0];
    expect(bindingInput.clinicId).toBe(CLINIC);
    expect(Object.keys(bindingInput).sort()).toEqual(["clinicId", "didE164", "externalCallKey", "locale"]);
    expect(JSON.stringify(started)).not.toContain("clinic_evil\"");
    expect(JSON.stringify(started)).not.toContain("+905321112233");
  });

  it("4. invalid or unmapped DID fails before binding/session creation", async () => {
    const { caps } = makeCaps();
    const bridge = createVoiceRuntimeBridge({ capabilities: caps });
    const unmapped = await bridge.startRuntimeCall({ externalCallKey: KEY, calledDid: "+908509999999" });
    expect(unmapped).toEqual({
      ok: false,
      code: "TENANT_RESOLUTION_FAILED",
      reasonCode: "DID_MAPPING_NOT_FOUND",
      retryable: false,
      endReason: "TENANT_REJECTED",
      fallback: "TECHNICAL_FAILURE",
    });
    for (const bad of [
      { externalCallKey: "", calledDid: DID },
      { externalCallKey: "has space", calledDid: DID },
      { externalCallKey: KEY, calledDid: 908502428852 },
      null,
    ]) {
      const r = await bridge.startRuntimeCall(bad as unknown as StartRuntimeCallInput);
      expect(r).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    }
    expect(caps.getOrCreateBinding).not.toHaveBeenCalled();
    expect(caps.processTurn).not.toHaveBeenCalled();
  });

  it("5. duplicate start (sequential and concurrent) resolves to the same binding/session", async () => {
    const { caps } = makeCaps();
    const bridge = createVoiceRuntimeBridge({ capabilities: caps });
    const [a, b] = await Promise.all([
      bridge.startRuntimeCall({ externalCallKey: KEY, calledDid: DID }),
      bridge.startRuntimeCall({ externalCallKey: KEY, calledDid: DID }),
    ]);
    expect(caps.getOrCreateBinding).toHaveBeenCalledTimes(1);
    const c = await bridge.startRuntimeCall({ externalCallKey: KEY, calledDid: "0850 242 88 52" });
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (!a.ok || !b.ok || !c.ok) return;
    expect(b.call).toBe(a.call);
    expect(c.call).toBe(a.call);
    expect(a.created).toBe(true);
    expect(c.created).toBe(false);
  });

  it("6. greeting and locale come only from the trusted mapping; context is plain transport data", async () => {
    const { call } = await startedBridge();
    expect(call.greetingText).toBe(GREETING);
    expect(call.locale).toBe("tr");
    expect(Object.keys(call).sort()).toEqual(
      ["bindingId", "callSessionId", "clinicId", "conversationId", "didE164", "greetingText", "lifecycle", "locale"].sort()
    );
    expect(call.lifecycle).toEqual({
      startedAtMs: Date.parse("2026-10-07T10:00:00.000Z"),
      maxCallDurationMs: 15 * 60_000,
      silenceTimeoutMs: 8_000,
      maxSilenceReprompts: 2,
      silence: { consecutiveSilenceTimeouts: 0 },
      bargeIn: { allowInterruptions: true, reason: "DEFAULT" },
    });
    expect(JSON.parse(JSON.stringify(call))).toEqual(call);
    expect(Object.isFrozen(call)).toBe(true);

    const bare = await startedBridge({});
    expect(bare.call.greetingText).toBeUndefined();
    expect(bare.call.locale).toBeUndefined();
    expect(bare.caps.getOrCreateBinding.mock.calls[0][0]).not.toHaveProperty("locale");
    expect(bare.caps.processTurn).not.toHaveBeenCalled();
  });
});

/* ── TURN ───────────────────────────────────────────────────────────── */

describe("processRuntimeTranscript", () => {
  it("7–8. allocates exactly one turnId and passes it unchanged to processVoiceTurn", async () => {
    const { caps, bridge, call } = await startedBridge();
    const turn = expectProcessed(await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "Merhaba" }));
    expect(caps.allocateTurnId).toHaveBeenCalledTimes(1);
    expect(caps.allocateTurnId).toHaveBeenCalledWith({ bindingId: call.bindingId, clinicId: CLINIC });
    expect(turn.turnId).toBe(formatTurnId(call.bindingId, 1));
    expect(turn.turnSeq).toBe(1);
    expect(caps.processTurn).toHaveBeenCalledTimes(1);
    expect(caps.processTurn.mock.calls[0][0]).toEqual({
      callSessionId: call.callSessionId,
      clinicId: CLINIC,
      text: "Merhaba",
      turnId: turn.turnId,
    });
  });

  it("9–10. replyText stays the original Agent Core reply; speechText is shaped separately", async () => {
    const { caps, bridge, call } = await startedBridge();
    const reply = "**İmplant** tedavisi sunuyoruz 😊 Randevu 5 Şubat 14:00, ücret 2.500 TL.\n- Muayene\n- Röntgen";
    caps.processTurn.mockImplementation(async (input) => turnResult(input, { replyText: reply }));
    const turn = expectProcessed(await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "Fiyat?" }));
    expect(turn.replyText).toBe(reply);
    expect(turn.speechText).toBe("İmplant tedavisi sunuyoruz. Randevu 5 Şubat 14:00, ücret 2.500 TL. Muayene, Röntgen");
  });

  it("11. appointment state comes from the structured result, never from reply text", async () => {
    const { caps, bridge, call } = await startedBridge();
    caps.processTurn.mockImplementationOnce(async (input) =>
      turnResult(input, { replyText: "Bu bilgileri onaylıyor musunuz?", appointmentState: "COLLECTING_TIME" })
    );
    const asksButCollecting = expectProcessed(await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "a" }));
    expect(asksButCollecting.appointmentState).toBe("COLLECTING_TIME");
    expect(asksButCollecting.allowBargeIn).toBe(true);

    caps.processTurn.mockImplementationOnce(async (input) =>
      turnResult(input, { replyText: "Tamam.", appointmentState: "AWAITING_CONFIRMATION" })
    );
    const plainButConfirming = expectProcessed(await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "b" }));
    expect(plainButConfirming.appointmentState).toBe("AWAITING_CONFIRMATION");
    expect(plainButConfirming.allowBargeIn).toBe(false);
  });

  it("12. AWAITING_CONFIRMATION disables barge-in", async () => {
    const { caps, bridge, call } = await startedBridge();
    caps.processTurn.mockImplementation(async (input) => turnResult(input, { appointmentState: "AWAITING_CONFIRMATION" }));
    const turn = expectProcessed(await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "14:00 olsun" }));
    expect(turn.allowBargeIn).toBe(false);
    expect(turn.bargeIn).toEqual({ allowInterruptions: false, reason: "APPOINTMENT_CONFIRMATION_SUMMARY" });
  });

  it("13. normal states allow barge-in", async () => {
    const { caps, bridge, call } = await startedBridge();
    for (const appointmentState of ["COLLECTING_DATE", "IDLE", undefined] as const) {
      caps.processTurn.mockImplementationOnce(async (input) => turnResult(input, { appointmentState }));
      const turn = expectProcessed(await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "x" }));
      expect(turn.allowBargeIn).toBe(true);
      expect(turn.bargeIn.reason).toBe("DEFAULT");
    }
  });

  it("14–15. empty/invalid transcripts allocate no turn and never call Agent Core", async () => {
    const { caps, bridge, call } = await startedBridge();
    for (const transcript of ["", "   ", "\u0000\n\t"]) {
      expect(await bridge.processRuntimeTranscript({ runtimeCall: call, transcript })).toEqual({
        ok: false,
        code: "TRANSCRIPT_EMPTY",
        retryable: false,
        action: "DISCARD",
      });
    }
    for (const transcript of [undefined, 42, "a".repeat(2_001)]) {
      const r = await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: transcript as string });
      expect(r).toMatchObject({ ok: false, code: "TRANSCRIPT_INVALID", action: "DISCARD" });
    }
    expect(caps.allocateTurnId).not.toHaveBeenCalled();
    expect(caps.processTurn).not.toHaveBeenCalled();
  });

  it("16. concurrent transcripts: only one reaches processVoiceTurn, the second is BUFFER", async () => {
    const { caps, bridge, call } = await startedBridge();
    const gate = deferred<VoiceTurnResult>();
    caps.processTurn.mockImplementationOnce(() => gate.promise);

    const first = bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "Implant istiyorum" });
    const second = await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "yarın" });
    expect(second).toEqual({ ok: false, code: "TURN_IN_FLIGHT", retryable: true, action: "BUFFER" });
    expect(caps.allocateTurnId).toHaveBeenCalledTimes(1);

    await vi.waitFor(() => expect(caps.processTurn).toHaveBeenCalledTimes(1));
    const third = await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "hala bekliyor" });
    expect(third.ok === false && third.action).toBe("BUFFER");

    gate.resolve(turnResult(caps.processTurn.mock.calls[0][0]));
    expectProcessed(await first);
    expect(caps.processTurn).toHaveBeenCalledTimes(1);

    expectProcessed(await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "yarın" }));
    expect(caps.processTurn).toHaveBeenCalledTimes(2);
  });

  it("16b. the in-flight slot is released even when the turn throws", async () => {
    const { caps, bridge, call } = await startedBridge();
    caps.processTurn.mockRejectedValueOnce(new Error("boom"));
    const failed = await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "a" });
    expect(failed).toMatchObject({ ok: false, code: "AGENT_FAILED", action: "DISCARD" });
    expectProcessed(await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "b" }));
  });

  it("17. an in-flight business turn is not cancelled by end/hangup; end waits for it", async () => {
    const { caps, bridge, call } = await startedBridge();
    const gate = deferred<VoiceTurnResult>();
    caps.processTurn.mockImplementationOnce(() => gate.promise);

    const turnPromise = bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "evet onaylıyorum" });
    await vi.waitFor(() => expect(caps.processTurn).toHaveBeenCalledTimes(1));
    const endPromise = bridge.endRuntimeCall({ runtimeCall: call, reason: "CALLER_HANGUP" });

    await new Promise((r) => setTimeout(r, 10));
    expect(caps.endBinding).not.toHaveBeenCalled();
    expect(caps.endSession).not.toHaveBeenCalled();
    const late = await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "alo" });
    expect(late).toMatchObject({ ok: false, code: "CALL_ALREADY_ENDED", action: "DISCARD" });

    gate.resolve(
      turnResult(caps.processTurn.mock.calls[0][0], {
        appointmentState: "APPOINTMENT_SUBMITTED",
        appointmentCreated: true,
        appointmentId: "apt_1",
      })
    );
    const turn = expectProcessed(await turnPromise);
    expect(turn.appointmentCreated).toBe(true);
    expect(turn.appointmentId).toBe("apt_1");

    const ended = await endPromise;
    expect(ended).toMatchObject({ ok: true, bindingStatus: "ENDED", sessionEndReason: "completed" });
    expect(caps.processTurn).toHaveBeenCalledTimes(1);
  });

  it("18. no AbortSignal or cancellation path reaches processVoiceTurn", async () => {
    const { caps, bridge, call } = await startedBridge();
    await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "Merhaba" });
    const args = caps.processTurn.mock.calls[0];
    expect(args).toHaveLength(1);
    expect(Object.keys(args[0]).sort()).toEqual(["callSessionId", "clinicId", "text", "turnId"]);
    for (const value of Object.values(args[0])) {
      expect(value instanceof AbortSignal).toBe(false);
      expect(typeof value).toBe("string");
    }
    const src = readFileSync(resolve(REPO, "lib/voice/runtime/voiceRuntimeBridge.ts"), "utf8");
    expect(src).not.toMatch(/AbortController|AbortSignal|\bsignal\b|\.abort\(|setTimeout|Promise\.race/);
  });
});

/* ── BUFFER SAFETY ──────────────────────────────────────────────────── */

describe("buffered speech safety", () => {
  it("19. an ordinary completed turn lets buffered speech be submitted afterwards", async () => {
    const { caps, bridge, call } = await startedBridge();
    caps.processTurn.mockImplementationOnce(async (input) => turnResult(input, { appointmentState: "COLLECTING_DATE" }));
    const turn = expectProcessed(await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "randevu" }));
    expect(turn.bufferedSpeech).toBe("SUBMIT");
    expectProcessed(await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "yarın" }));
  });

  it("20. a turn entering confirmation tells the transport to discard earlier buffered speech", async () => {
    const { caps, bridge, call } = await startedBridge();
    const gate = deferred<VoiceTurnResult>();
    caps.processTurn.mockImplementationOnce(() => gate.promise);
    const first = bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "14:00 olsun" });
    const buffered = await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "evet" });
    expect(buffered.ok === false && buffered.action).toBe("BUFFER");

    await vi.waitFor(() => expect(caps.processTurn).toHaveBeenCalledTimes(1));
    gate.resolve(turnResult(caps.processTurn.mock.calls[0][0], { appointmentState: "AWAITING_CONFIRMATION" }));
    const turn = expectProcessed(await first);
    expect(turn.bufferedSpeech).toBe("DISCARD");
    expect(turn.allowBargeIn).toBe(false);
    expect(caps.processTurn).toHaveBeenCalledTimes(1);
  });
});

/* ── END ────────────────────────────────────────────────────────────── */

describe("endRuntimeCall", () => {
  it("21. caller hangup after completed turns → completed", async () => {
    const { caps, bridge, call } = await startedBridge();
    await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "Merhaba" });
    const ended = await bridge.endRuntimeCall({ runtimeCall: call, reason: "CALLER_HANGUP" });
    expect(ended).toEqual({
      ok: true,
      reason: "CALLER_HANGUP",
      bindingStatus: "ENDED",
      sessionEndReason: "completed",
      sessionEnded: true,
      alreadyEnded: false,
      fallback: null,
    });
    expect(caps.endBinding).toHaveBeenCalledWith({ bindingId: call.bindingId, clinicId: CLINIC, reason: "completed" });
    expect(caps.endSession).toHaveBeenCalledWith({ callSessionId: call.callSessionId, clinicId: CLINIC, reason: "completed" });
    expect(caps.failBinding).not.toHaveBeenCalled();
  });

  it("22. caller hangup before any completed turn → abandoned", async () => {
    const { caps, bridge, call } = await startedBridge();
    const ended = await bridge.endRuntimeCall({ runtimeCall: call, reason: "CALLER_HANGUP" });
    expect(ended).toMatchObject({ ok: true, bindingStatus: "ENDED", sessionEndReason: "abandoned" });
    expect(caps.endBinding).toHaveBeenCalledWith(expect.objectContaining({ reason: "abandoned" }));
  });

  it("silence and max duration use the same completed/abandoned mapping with their fallbacks", async () => {
    const silent = await startedBridge();
    expect(await silent.bridge.endRuntimeCall({ runtimeCall: silent.call, reason: "SILENCE_TIMEOUT" })).toMatchObject({
      sessionEndReason: "abandoned",
      fallback: "SILENCE_GOODBYE",
    });
    const long = await startedBridge();
    await long.bridge.processRuntimeTranscript({ runtimeCall: long.call, transcript: "a" });
    expect(await long.bridge.endRuntimeCall({ runtimeCall: long.call, reason: "MAX_DURATION" })).toMatchObject({
      sessionEndReason: "completed",
      fallback: "MAX_DURATION_GOODBYE",
    });
  });

  it("AGENT_COMPLETED after completed turns → normal completed lifecycle, no fallback", async () => {
    const { caps, bridge, call } = await startedBridge();
    caps.processTurn.mockImplementationOnce(async (input) => turnResult(input, { endCallSuggested: true }));
    await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "Teşekkürler, bu kadar" });
    const ended = await bridge.endRuntimeCall({ runtimeCall: call, reason: "AGENT_COMPLETED" });
    expect(ended).toEqual({
      ok: true,
      reason: "AGENT_COMPLETED",
      bindingStatus: "ENDED",
      sessionEndReason: "completed",
      sessionEnded: true,
      alreadyEnded: false,
      fallback: null,
    });
    expect(caps.endBinding).toHaveBeenCalledWith({ bindingId: call.bindingId, clinicId: CLINIC, reason: "completed" });
    expect(caps.endSession).toHaveBeenCalledWith({ callSessionId: call.callSessionId, clinicId: CLINIC, reason: "completed" });
    expect(caps.failBinding).not.toHaveBeenCalled();
  });

  it("AGENT_COMPLETED with zero completed turns does not invent interaction (abandoned)", async () => {
    const { caps, bridge, call } = await startedBridge();
    const ended = await bridge.endRuntimeCall({ runtimeCall: call, reason: "AGENT_COMPLETED" });
    expect(ended).toMatchObject({ ok: true, bindingStatus: "ENDED", sessionEndReason: "abandoned", fallback: null });
    expect(caps.endBinding).toHaveBeenCalledWith(expect.objectContaining({ reason: "abandoned" }));
    expect(caps.failBinding).not.toHaveBeenCalled();
  });

  it("endCallSuggested is propagated but never ends the call by itself", async () => {
    const { caps, bridge, call } = await startedBridge();
    caps.processTurn.mockImplementationOnce(async (input) => turnResult(input, { endCallSuggested: true }));
    const turn = expectProcessed(await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "Görüşürüz" }));
    expect(turn.endCallSuggested).toBe(true);
    expect(caps.endBinding).not.toHaveBeenCalled();
    expect(caps.endSession).not.toHaveBeenCalled();
    expect(expectProcessed(await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "Bir şey daha" })).turnSeq).toBe(2);
  });

  it("final playback failure after endCallSuggested can still end with TTS_FAILURE", async () => {
    const { caps, bridge, call } = await startedBridge();
    caps.processTurn.mockImplementationOnce(async (input) => turnResult(input, { endCallSuggested: true }));
    await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "Teşekkürler" });
    const ended = await bridge.endRuntimeCall({ runtimeCall: call, reason: "TTS_FAILURE" });
    expect(ended).toMatchObject({ ok: true, reason: "TTS_FAILURE", bindingStatus: "FAILED", sessionEndReason: "failed", fallback: null });
    expect(caps.failBinding).toHaveBeenCalledWith({ bindingId: call.bindingId, clinicId: CLINIC, failureCode: "TTS_FAILURE" });
  });

  it("23. AGENT_FAILURE → binding FAILED, session failed", async () => {
    const { caps, bridge, call } = await startedBridge();
    await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "Merhaba" });
    const ended = await bridge.endRuntimeCall({ runtimeCall: call, reason: "AGENT_FAILURE" });
    expect(ended).toMatchObject({
      ok: true,
      bindingStatus: "FAILED",
      sessionEndReason: "failed",
      fallback: "TECHNICAL_FAILURE",
    });
    expect(caps.failBinding).toHaveBeenCalledWith({ bindingId: call.bindingId, clinicId: CLINIC, failureCode: "AGENT_FAILURE" });
    expect(caps.endBinding).not.toHaveBeenCalled();
  });

  it("24. TENANT_REJECTED before a call exists requires no Phase 2 end and no binding write", async () => {
    const { caps } = makeCaps();
    const bridge = createVoiceRuntimeBridge({ capabilities: caps });
    const rejected = await bridge.startRuntimeCall({ externalCallKey: KEY, calledDid: "+908509999999" });
    expect(rejected.ok).toBe(false);
    const ended = await bridge.endRuntimeCall({ runtimeCall: null, reason: "TENANT_REJECTED" });
    expect(ended).toEqual({
      ok: true,
      reason: "TENANT_REJECTED",
      bindingStatus: "NONE",
      sessionEndReason: null,
      sessionEnded: false,
      alreadyEnded: false,
      fallback: "TECHNICAL_FAILURE",
    });
    expect(caps.endSession).not.toHaveBeenCalled();
    expect(caps.endBinding).not.toHaveBeenCalled();
    expect(caps.failBinding).not.toHaveBeenCalled();
  });

  it("25. duplicate end (sequential and concurrent) is deterministic and writes once", async () => {
    const { caps, bridge, call } = await startedBridge();
    const [a, b] = await Promise.all([
      bridge.endRuntimeCall({ runtimeCall: call, reason: "CALLER_HANGUP" }),
      bridge.endRuntimeCall({ runtimeCall: call, reason: "CALLER_HANGUP" }),
    ]);
    const c = await bridge.endRuntimeCall({ runtimeCall: call, reason: "CALLER_HANGUP" });
    expect(b).toEqual(a);
    expect(c).toEqual({ ...a, alreadyEnded: true });
    expect(caps.endBinding).toHaveBeenCalledTimes(1);
    expect(caps.endSession).toHaveBeenCalledTimes(1);
  });

  it("26. FAILED is never overwritten by ENDED (locally or when another worker failed the binding)", async () => {
    const local = await startedBridge();
    await local.bridge.endRuntimeCall({ runtimeCall: local.call, reason: "RUNTIME_FAILURE" });
    const later = await local.bridge.endRuntimeCall({ runtimeCall: local.call, reason: "CALLER_HANGUP" });
    expect(later).toMatchObject({ ok: true, bindingStatus: "FAILED", sessionEndReason: "failed", alreadyEnded: true });
    expect(local.caps.endBinding).not.toHaveBeenCalled();
    expect(local.caps.endSession).toHaveBeenCalledTimes(1);

    const remote = await startedBridge();
    remote.bindings.get(remote.call.bindingId)!.status = "FAILED";
    const ended = await remote.bridge.endRuntimeCall({ runtimeCall: remote.call, reason: "CALLER_HANGUP" });
    expect(ended).toMatchObject({ ok: true, bindingStatus: "FAILED", sessionEndReason: "failed" });
    expect(remote.caps.endSession).toHaveBeenCalledWith(expect.objectContaining({ reason: "failed" }));
  });

  it("binding end failure is reported safely and can be retried", async () => {
    const { caps, bridge, call } = await startedBridge();
    caps.endBinding.mockResolvedValueOnce({ ok: false, code: "CALL_BINDING_UPDATE_FAILED" });
    const first = await bridge.endRuntimeCall({ runtimeCall: call, reason: "CALLER_HANGUP" });
    expect(first).toEqual({ ok: false, code: "BINDING_FAILED", reasonCode: "CALL_BINDING_UPDATE_FAILED", retryable: true });
    expect(caps.endSession).not.toHaveBeenCalled();
    const retry = await bridge.endRuntimeCall({ runtimeCall: call, reason: "CALLER_HANGUP" });
    expect(retry).toMatchObject({ ok: true, bindingStatus: "ENDED", alreadyEnded: false });
  });

  it("rejects unknown end reasons", async () => {
    const { bridge, call } = await startedBridge();
    expect(await bridge.endRuntimeCall({ runtimeCall: call, reason: "HUNG_UP" as never })).toMatchObject({
      ok: false,
      code: "INVALID_INPUT",
    });
  });
});

/* ── FAILURE ────────────────────────────────────────────────────────── */

describe("failure mapping", () => {
  const SECRET = "FirebaseError: PERMISSION_DENIED projects/prod-secret-project key=AIzaSyFAKE";

  it("27. Firestore/internal errors are not leaked", async () => {
    const { caps } = makeCaps();
    caps.getOrCreateBinding.mockRejectedValueOnce(new Error(SECRET));
    const bridge = createVoiceRuntimeBridge({ capabilities: caps });
    const started = await bridge.startRuntimeCall({ externalCallKey: KEY, calledDid: DID });
    expect(started).toEqual({ ok: false, code: "INTERNAL_ERROR", retryable: true });

    const ok = await startedBridge();
    ok.caps.processTurn.mockRejectedValueOnce(new Error(SECRET));
    const turn = await ok.bridge.processRuntimeTranscript({ runtimeCall: ok.call, transcript: "a" });
    expect(turn).toEqual({
      ok: false,
      code: "AGENT_FAILED",
      retryable: false,
      endReason: "AGENT_FAILURE",
      fallback: "TECHNICAL_FAILURE",
      action: "DISCARD",
    });
    for (const r of [started, turn]) {
      const json = JSON.stringify(r);
      expect(json).not.toMatch(/PERMISSION|secret|AIza|stack|Error:/i);
    }
    expect(errorSpy).toHaveBeenCalled();
  });

  it("28. Phase 2 error results become safe runtime codes without messages", async () => {
    const cases: Array<[VoiceErrorResult["errorCode"], string, string | undefined]> = [
      ["AGENT_ERROR", "AGENT_FAILED", "AGENT_FAILURE"],
      ["CLINIC_NOT_FOUND", "AGENT_FAILED", "AGENT_FAILURE"],
      ["SESSION_NOT_FOUND", "SESSION_FAILED", "AGENT_FAILURE"],
      ["CLINIC_MISMATCH", "SESSION_FAILED", "AGENT_FAILURE"],
      ["SESSION_ENDED", "CALL_ALREADY_ENDED", undefined],
    ];
    for (const [errorCode, code, endReason] of cases) {
      const { caps, bridge, call } = await startedBridge();
      caps.processTurn.mockResolvedValueOnce({ ok: false, errorCode, message: "Agent failed: internal detail" });
      const r = await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "x" });
      expect(r).toMatchObject({ ok: false, code, reasonCode: errorCode, action: "DISCARD" });
      expect(r).not.toHaveProperty("message");
      expect(r.ok === false ? r.endReason : "n/a").toBe(endReason);
    }
  });

  it("binding allocation failures map to safe codes", async () => {
    const { caps, bridge, call } = await startedBridge();
    caps.allocateTurnId.mockResolvedValueOnce({ ok: false, code: "CALL_BINDING_ENDED" });
    expect(await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "x" })).toMatchObject({
      code: "CALL_ALREADY_ENDED",
      action: "DISCARD",
    });
    caps.allocateTurnId.mockResolvedValueOnce({ ok: false, code: "CALL_BINDING_TURN_LIMIT" });
    expect(await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "x" })).toMatchObject({
      code: "TURN_LIMIT_REACHED",
      endReason: "RUNTIME_FAILURE",
    });
    caps.allocateTurnId.mockResolvedValueOnce({ ok: false, code: "CALL_BINDING_UPDATE_FAILED" });
    expect(await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "x" })).toMatchObject({
      code: "BINDING_FAILED",
      retryable: true,
    });
    expect(caps.processTurn).not.toHaveBeenCalled();
  });

  it("29. an ended call cannot process another transcript; forged contexts are rejected", async () => {
    const { caps, bridge, call } = await startedBridge();
    await bridge.endRuntimeCall({ runtimeCall: call, reason: "CALLER_HANGUP" });
    expect(await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "alo" })).toMatchObject({
      ok: false,
      code: "CALL_ALREADY_ENDED",
      action: "DISCARD",
    });
    expect(await bridge.startRuntimeCall({ externalCallKey: KEY, calledDid: DID })).toMatchObject({
      ok: false,
      code: "CALL_ALREADY_ENDED",
    });

    const fresh = await startedBridge();
    const forged = { ...fresh.call, clinicId: "clinic_evil" } as VoiceRuntimeCall;
    expect(await fresh.bridge.processRuntimeTranscript({ runtimeCall: forged, transcript: "x" })).toMatchObject({
      code: "CALL_CONTEXT_INVALID",
    });
    expect(await fresh.bridge.endRuntimeCall({ runtimeCall: forged, reason: "CALLER_HANGUP" })).toMatchObject({
      code: "CALL_CONTEXT_INVALID",
    });
    const unknown = { ...fresh.call, bindingId: "vc_" + "0".repeat(32) } as VoiceRuntimeCall;
    expect(await fresh.bridge.processRuntimeTranscript({ runtimeCall: unknown, transcript: "x" })).toMatchObject({
      code: "CALL_CONTEXT_INVALID",
    });
    expect(fresh.caps.allocateTurnId).not.toHaveBeenCalled();
    expect(caps.allocateTurnId).not.toHaveBeenCalled();
  });

  it("invalid policy overrides fail at construction", () => {
    const { caps } = makeCaps();
    expect(() => createVoiceRuntimeBridge({ capabilities: caps, policy: { maxCallDurationMs: -1 } })).toThrow(RangeError);
  });
});

/* ── END-TO-END with real modules over an in-memory Firestore ───────── */

type Doc = Record<string, unknown>;
interface MemRef {
  path: string;
  get(): Promise<{ exists: boolean; data(): Doc | undefined }>;
  create(data: Doc): Promise<void>;
  set(data: Doc, opts?: { merge?: boolean }): Promise<void>;
  collection(name: string): { doc(id: string): MemRef };
}

function createMemoryDb() {
  const docs = new Map<string, Doc>();
  const alreadyExists = () => Object.assign(new Error("ALREADY_EXISTS"), { code: 6 });
  const ref = (path: string): MemRef => ({
    path,
    async get() {
      const d = docs.get(path);
      return { exists: d !== undefined, data: () => (d ? structuredClone(d) : undefined) };
    },
    async create(data) {
      if (docs.has(path)) throw alreadyExists();
      docs.set(path, structuredClone(data));
    },
    async set(data, opts) {
      docs.set(path, opts?.merge ? { ...(docs.get(path) ?? {}), ...structuredClone(data) } : structuredClone(data));
    },
    collection: (name) => col(`${path}/${name}`),
  });
  const col = (path: string) => ({ doc: (id: string) => ref(`${path}/${id}`) });

  let chain: Promise<unknown> = Promise.resolve();
  const db: CallBindingFirestore & { collection(path: string): { doc(id: string): MemRef } } = {
    collection: col,
    runTransaction<T>(fn: (tx: CallBindingTransaction) => Promise<T>): Promise<T> {
      const run = chain.then(async () => {
        const writes: Array<() => void> = [];
        const tx: CallBindingTransaction = {
          get: (r) => (r as MemRef).get(),
          create: (r, data) =>
            writes.push(() => {
              const p = (r as MemRef).path;
              if (docs.has(p)) throw alreadyExists();
              docs.set(p, structuredClone(data));
            }),
          update: (r, data) =>
            writes.push(() => {
              const p = (r as MemRef).path;
              docs.set(p, { ...docs.get(p)!, ...structuredClone(data) });
            }),
        };
        const out = await fn(tx);
        writes.forEach((w) => w());
        return out;
      });
      chain = run.catch(() => undefined);
      return run;
    },
  };
  return { db, docs };
}

type AgentReply = Partial<AgentTurnResult> & { replyText: string };

function agentResult(params: HandleClinicAgentTurnParams, partial: AgentReply): AgentTurnResult {
  return {
    conversationId: params.input.conversationId ?? "conv",
    payload: { reply: partial.replyText },
    httpStatus: 200,
    ...partial,
  };
}

describe("end-to-end through the real composition (no Firebase)", () => {
  function setup(mapping: Doc = { active: true, voiceEnabled: true, clinicId: CLINIC, defaultLocale: "tr", greetingText: GREETING }) {
    const mem = createMemoryDb();
    mem.docs.set(`voiceNumbers/${DID}`, mapping);
    mem.docs.set(`clinics/${CLINIC}`, { name: "Nova Dent" });
    const sessionStore = createInMemoryCallSessionStore();
    const agentInputs: HandleClinicAgentTurnParams["input"][] = [];
    const replies: AgentReply[] = [];
    const deps: VoiceRuntimeCompositionDeps = {
      adminDb: mem.db,
      sessionStore,
      loadHistory: async () => [],
      runAgentTurn: async (params) => {
        agentInputs.push(params.input);
        return agentResult(params, replies.shift() ?? { replyText: "Size nasıl yardımcı olabilirim?", appointmentState: "IDLE" });
      },
      now: () => new Date("2026-10-07T10:00:00.000Z"),
    };
    const capabilities = composeVoiceRuntimeCapabilities(deps);
    return { mem, sessionStore, agentInputs, replies, capabilities, bridge: createVoiceRuntimeBridge({ capabilities }) };
  }

  it("start → confirmation turn → submission turn → hangup", async () => {
    const env = setup();
    const started = await env.bridge.startRuntimeCall({ externalCallKey: KEY, calledDid: "0850 242 88 52" });
    if (!started.ok) throw new Error(started.code);
    const call = started.call;
    expect(call).toMatchObject({ clinicId: CLINIC, didE164: DID, locale: "tr", greetingText: GREETING });
    expect(env.mem.docs.get(`voiceCalls/${call.bindingId}`)).toMatchObject({ status: "ACTIVE", clinicId: CLINIC });
    expect(await env.sessionStore.get(call.callSessionId)).toMatchObject({ clinicId: CLINIC, status: "STARTED" });
    expect(env.mem.docs.get(`clinics/${CLINIC}/conversationLogs/${call.conversationId}`)).toMatchObject({ channel: "voice" });

    env.replies.push({
      replyText: "Ön randevu talebinizin özeti:\n\nAd Soyad: Ayşe Yılmaz\nTercih Edilen Saat: 14:00\n\nOnaylıyor musunuz?",
      appointmentState: "AWAITING_CONFIRMATION",
    });
    const confirm = expectProcessed(await env.bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "14:00 olsun" }));
    expect(confirm.turnId).toBe(formatTurnId(call.bindingId, 1));
    expect(env.agentInputs[0]).toMatchObject({ clinicId: CLINIC, channel: "voice", text: "14:00 olsun" });
    expect(env.agentInputs[0].context?.messageId).toBe(confirm.turnId);
    expect(confirm.allowBargeIn).toBe(false);
    expect(confirm.bufferedSpeech).toBe("DISCARD");
    expect(confirm.speechText).toBe("Ön randevu talebinizin özeti: Ad Soyad: Ayşe Yılmaz. Tercih Edilen Saat: 14:00. Onaylıyor musunuz?");

    env.replies.push({
      replyText: "Talebiniz kliniğe iletildi.",
      appointmentState: "APPOINTMENT_SUBMITTED",
      sideEffects: { appointmentCreated: true, appointmentId: "apt_42" },
    });
    const submitted = expectProcessed(await env.bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "evet" }));
    expect(submitted).toMatchObject({ appointmentCreated: true, appointmentId: "apt_42", allowBargeIn: true, turnSeq: 2 });

    const ended = await env.bridge.endRuntimeCall({ runtimeCall: call, reason: "CALLER_HANGUP" });
    expect(ended).toMatchObject({ ok: true, bindingStatus: "ENDED", sessionEndReason: "completed", sessionEnded: true });
    expect(env.mem.docs.get(`voiceCalls/${call.bindingId}`)).toMatchObject({ status: "ENDED", endReason: "completed", turnSeq: 2 });
    expect(await env.sessionStore.get(call.callSessionId)).toMatchObject({ status: "COMPLETED" });
  });

  it("AGENT_COMPLETED after a turn: voiceCalls ENDED/completed, session COMPLETED", async () => {
    const env = setup();
    const started = await env.bridge.startRuntimeCall({ externalCallKey: KEY, calledDid: DID });
    if (!started.ok) throw new Error(started.code);
    expectProcessed(await env.bridge.processRuntimeTranscript({ runtimeCall: started.call, transcript: "Teşekkürler" }));
    const ended = await env.bridge.endRuntimeCall({ runtimeCall: started.call, reason: "AGENT_COMPLETED" });
    expect(ended).toMatchObject({ ok: true, bindingStatus: "ENDED", sessionEndReason: "completed", sessionEnded: true, fallback: null });
    expect(env.mem.docs.get(`voiceCalls/${started.call.bindingId}`)).toMatchObject({ status: "ENDED", endReason: "completed", turnSeq: 1 });
    expect(env.mem.docs.get(`voiceCalls/${started.call.bindingId}`)?.failureCode ?? null).toBeNull();
    expect(await env.sessionStore.get(started.call.callSessionId)).toMatchObject({ status: "COMPLETED" });
  });

  it("unmapped, inactive or malformed DIDs create no binding, session or conversation", async () => {
    for (const [calledDid, mapping, reasonCode] of [
      ["+908509999999", undefined, "DID_MAPPING_NOT_FOUND"],
      [DID, { active: false, voiceEnabled: true, clinicId: CLINIC }, "DID_MAPPING_INACTIVE"],
      ["12345", undefined, "DID_INVALID_FORMAT"],
    ] as const) {
      const env = setup(mapping ?? undefined);
      const r = await env.bridge.startRuntimeCall({ externalCallKey: KEY, calledDid });
      expect(r).toMatchObject({ ok: false, code: "TENANT_RESOLUTION_FAILED", reasonCode });
      expect([...env.mem.docs.keys()].filter((k) => k.startsWith("voiceCalls/") || k.includes("conversationLogs"))).toEqual([]);
      expect(env.agentInputs).toHaveLength(0);
    }
  });

  it("re-delivery to a new bridge instance re-attaches to the same binding and session", async () => {
    const env = setup();
    const first = await env.bridge.startRuntimeCall({ externalCallKey: KEY, calledDid: DID });
    const second = await createVoiceRuntimeBridge({ capabilities: env.capabilities }).startRuntimeCall({
      externalCallKey: KEY,
      calledDid: DID,
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.call).toEqual(first.call);
    expect(second.created).toBe(false);
    expect([...env.mem.docs.keys()].filter((k) => k.startsWith("voiceCalls/"))).toHaveLength(1);
  });

  it("a binding FAILED by another worker is not overwritten; the session follows it", async () => {
    const env = setup();
    const started = await env.bridge.startRuntimeCall({ externalCallKey: KEY, calledDid: DID });
    if (!started.ok) throw new Error(started.code);
    await failCallBinding({ adminDb: env.mem.db }, { bindingId: started.call.bindingId, clinicId: CLINIC, failureCode: "OTHER_WORKER" });
    const ended = await env.bridge.endRuntimeCall({ runtimeCall: started.call, reason: "CALLER_HANGUP" });
    expect(ended).toMatchObject({ ok: true, bindingStatus: "FAILED", sessionEndReason: "failed" });
    expect(env.mem.docs.get(`voiceCalls/${started.call.bindingId}`)).toMatchObject({ status: "FAILED", failureCode: "OTHER_WORKER" });
    expect(await env.sessionStore.get(started.call.callSessionId)).toMatchObject({ status: "FAILED" });
  });

  it("the Admin SDK Firestore type satisfies the composition's adminDb (compile-time)", () => {
    const accepts = (db: Firestore): VoiceRuntimeCompositionDeps["adminDb"] => db;
    expect(typeof accepts).toBe("function");
  });
});

/* ── BOUNDARY ───────────────────────────────────────────────────────── */

describe("module boundary", () => {
  const bridgeSrc = readFileSync(resolve(REPO, "lib/voice/runtime/voiceRuntimeBridge.ts"), "utf8");
  const composeSrc = readFileSync(resolve(REPO, "lib/voice/runtime/composeVoiceRuntime.ts"), "utf8");
  const importsOf = (src: string) => [...src.matchAll(/^import\s[\s\S]*?from\s+["']([^"']+)["'];?$/gm)].map((m) => m[1]);

  it("30. no LiveKit/Verimor/speech-provider/WebSocket/Next.js route dependency", () => {
    for (const src of [bridgeSrc, composeSrc]) {
      expect(src).not.toMatch(
        /livekit|verimor|openai|anthropic|elevenlabs|deepgram|azure|google-cloud|websocket|webrtc|from ["']next|NextRequest|NextResponse|firebase-admin|process\.env|fetch\(/i
      );
    }
    expect(importsOf(bridgeSrc).sort()).toEqual(
      ["../telephony/callBinding", "../telephony/didResolver", "../telephony/lifecyclePolicy", "../telephony/speechText", "../types"].sort()
    );
    expect(importsOf(composeSrc).every((p) => p.startsWith("../") || p.startsWith("./"))).toBe(true);
  });

  it("the bridge itself does not load Agent Core or the Phase 2 adapter (only injected)", () => {
    expect(bridgeSrc).not.toMatch(/voiceAdapter|handleClinicAgentTurn|callSessionStore|@\/lib\/agent\b(?!\/types)/);
  });

  it("31. no medical, business or appointment parsing logic is duplicated", () => {
    expect(bridgeSrc).not.toMatch(
      /slotExtractor|intentRouter|formatters|AppointmentDateValidator|canonicalAppointmentDate|appointment-service|appointmentService|createAppointment|treatment|\bevet\b|\bhayır\b|onayl/i
    );
    expect(bridgeSrc).not.toMatch(/replyText\s*\.\s*(includes|match|test|search|indexOf|toLowerCase|startsWith|endsWith|replace)/);
    expect(bridgeSrc).not.toMatch(/\.test\(\s*[\w.]*replyText/);
  });
});
