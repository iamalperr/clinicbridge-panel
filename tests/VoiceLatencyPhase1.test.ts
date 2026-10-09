/**
 * Voice latency optimization phase 1: parallel transcript reads, turn-context prefetch,
 * deferred session bookkeeping, bridge timing, clinic runtime pre-warm and the pricing
 * negative cache. Business behavior (Agent Core, tenant isolation, idempotency) must not move.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import type { HandleClinicAgentTurnParams } from "@/lib/agent/handleClinicAgentTurn";
import type { AgentTurnResult } from "@/lib/agent/types";
import { loadClinicConversationTranscript } from "@/lib/services/conversations/conversationTranscriptService";
import { createInMemoryCallSessionStore, type CallSessionStore } from "@/lib/voice/callSessionStore";
import {
  awaitVoiceSessionWrites,
  endCallSession,
  prefetchVoiceTurnContext,
  processVoiceTurn,
  startCallSession,
  type VoiceAdapterDeps,
} from "@/lib/voice/voiceAdapter";
import type { VoiceTurnPrefetch, VoiceTurnResult } from "@/lib/voice/types";
import {
  deriveBoundSessionIds,
  deriveCallBindingId,
  formatTurnId,
  type CallBinding,
} from "@/lib/voice/telephony/callBinding";
import { createVoiceRuntimeBridge, type VoiceRuntimeCapabilities } from "@/lib/voice/runtime/voiceRuntimeBridge";
import {
  _clinicRuntimeInflightSize,
  loadTopLevelClinicRuntime,
  warmClinicRuntime,
  type ClinicRuntimeFirestore,
} from "@/lib/performance/clinicRuntimeLoader";
import { getCachedClinicRuntime, invalidateClinicRuntimeCache } from "@/lib/performance/clinicRuntimeCache";

const TRANSCRIPT = "TRANSCRIPT_SECRET implant fiyatı nedir";
const REPLY = "REPLY_SECRET Implant ücreti kliniğimizde değerlendirme sonrası belirlenir.";
const CALLER = "+905551112233";

function deferred<T>() {
  let resolveFn!: (v: T) => void;
  let rejectFn!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolveFn = res;
    rejectFn = rej;
  });
  return { promise, resolve: resolveFn, reject: rejectFn };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}

function captureConsole() {
  const lines: string[] = [];
  const push = (...args: unknown[]) => {
    lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  const spies = [
    vi.spyOn(console, "log").mockImplementation(push),
    vi.spyOn(console, "info").mockImplementation(push),
    vi.spyOn(console, "warn").mockImplementation(push),
    vi.spyOn(console, "error").mockImplementation(push),
  ];
  return {
    lines,
    json(checkpoint: string): Record<string, unknown>[] {
      return lines
        .filter((l) => l.startsWith("{"))
        .map((l) => JSON.parse(l) as Record<string, unknown>)
        .filter((o) => o.checkpoint === checkpoint);
    },
    restore() {
      for (const s of spies) s.mockRestore();
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

/* ── A. Canonical transcript load: four independent reads in parallel ─────── */

describe("A. loadClinicConversationTranscript issues its reads together", () => {
  type Read = { path: string; kind: "doc" | "query"; d: ReturnType<typeof deferred<any>> };

  function pathDb() {
    const reads: Read[] = [];
    const read = (path: string, kind: "doc" | "query") => {
      const d = deferred<any>();
      reads.push({ path, kind, d });
      return d.promise;
    };
    const docRef = (path: string): any => ({
      get: () => read(path, "doc"),
      collection: (name: string) => collRef(`${path}/${name}`),
    });
    const collRef = (path: string): any => ({
      doc: (id: string) => docRef(`${path}/${id}`),
      orderBy: () => ({ get: () => read(path, "query") }),
    });
    return { db: { collection: (name: string) => collRef(name) } as unknown as Firestore, reads };
  }

  const LOG = "clinics/c1/conversationLogs/conv1";
  const LEGACY = "clinics/c1/conversations/conv1";
  const msg = (id: string, role: string, content: string, createdAt: string) => ({
    id,
    data: () => ({ role, content, createdAt }),
  });

  function find(reads: Read[], path: string, kind: "doc" | "query") {
    const r = reads.find((x) => x.path === path && x.kind === kind);
    if (!r) throw new Error(`missing read ${kind} ${path}`);
    return r;
  }

  it("all four reads are in flight before any of them resolves; result is unchanged", async () => {
    const { db, reads } = pathDb();
    const pending = loadClinicConversationTranscript(db, { clinicId: "c1", conversationId: "conv1", reconcileCount: false });
    await flush();
    expect(reads.map((r) => `${r.kind}:${r.path}`).sort()).toEqual(
      [`doc:${LOG}`, `doc:${LEGACY}`, `query:${LOG}/messages`, `query:${LEGACY}/messages`].sort()
    );

    find(reads, LOG, "doc").d.resolve({ exists: true, data: () => ({ status: "answered", totalMessages: 2 }) });
    find(reads, LEGACY, "doc").d.resolve({ exists: false, data: () => undefined });
    find(reads, `${LOG}/messages`, "query").d.resolve({
      docs: [
        msg("m1", "user", "Merhaba", "2026-10-07T10:00:00.000Z"),
        msg("m2", "assistant", "Size nasıl yardımcı olabilirim?", "2026-10-07T10:00:01.000Z"),
      ],
    });
    find(reads, `${LEGACY}/messages`, "query").d.resolve({ docs: [] });

    const detail = await pending;
    expect(detail?.messages.map((m) => [m.role, m.content])).toEqual([
      ["user", "Merhaba"],
      ["assistant", "Size nasıl yardımcı olabilirim?"],
    ]);
    expect(detail?.sourcesUsed).toEqual(["conversationLogs.messages"]);
  });

  it("a failed messages-subcollection read still falls through (missing index semantics)", async () => {
    const { db, reads } = pathDb();
    const pending = loadClinicConversationTranscript(db, { clinicId: "c1", conversationId: "conv1", reconcileCount: false });
    await flush();
    find(reads, LOG, "doc").d.resolve({
      exists: true,
      data: () => ({ messages: [{ id: "a", role: "user", content: "Selam", createdAt: "2026-10-07T10:00:00.000Z" }] }),
    });
    find(reads, LEGACY, "doc").d.resolve({ exists: false, data: () => undefined });
    find(reads, `${LOG}/messages`, "query").d.reject(new Error("FAILED_PRECONDITION: index"));
    find(reads, `${LEGACY}/messages`, "query").d.reject(new Error("FAILED_PRECONDITION: index"));
    const detail = await pending;
    expect(detail?.messages.map((m) => m.content)).toEqual(["Selam"]);
  });

  it("a failed document read still rejects the load", async () => {
    const { db, reads } = pathDb();
    const pending = loadClinicConversationTranscript(db, { clinicId: "c1", conversationId: "conv1", reconcileCount: false });
    await flush();
    find(reads, LOG, "doc").d.reject(new Error("UNAVAILABLE"));
    find(reads, LEGACY, "doc").d.resolve({ exists: false, data: () => undefined });
    find(reads, `${LOG}/messages`, "query").d.resolve({ docs: [] });
    find(reads, `${LEGACY}/messages`, "query").d.resolve({ docs: [] });
    await expect(pending).rejects.toThrow("UNAVAILABLE");
  });

  it("returns null when neither conversation document exists", async () => {
    const { db, reads } = pathDb();
    const pending = loadClinicConversationTranscript(db, { clinicId: "c1", conversationId: "conv1", reconcileCount: false });
    await flush();
    for (const r of reads) r.d.resolve(r.kind === "doc" ? { exists: false, data: () => undefined } : { docs: [] });
    expect(await pending).toBeNull();
  });
});

/* ── B. processVoiceTurn: prefetch + deferred bookkeeping ───────────────── */

type HistoryTurn = { role: "user" | "assistant"; content: string };

function agentReply(params: HandleClinicAgentTurnParams, partial: Partial<AgentTurnResult> = {}): AgentTurnResult {
  return {
    replyText: REPLY,
    conversationId: params.input.conversationId ?? "",
    payload: { reply: REPLY },
    httpStatus: 200,
    appointmentState: "IDLE",
    ...partial,
  };
}

function adapterHarness(options: { defer?: boolean; store?: CallSessionStore } = {}) {
  const store = options.store ?? createInMemoryCallSessionStore();
  const agentInputs: HandleClinicAgentTurnParams["input"][] = [];
  const historyLoads: Array<{ clinicId: string; conversationId: string }> = [];
  const histories = new Map<string, HistoryTurn[]>();
  let n = 0;
  const deps: VoiceAdapterDeps = {
    sessionStore: store,
    adminDb: null,
    deferSessionBookkeeping: options.defer ?? false,
    generateId: (prefix) => `${prefix}_${++n}`,
    loadHistory: async ({ clinicId, conversationId }) => {
      historyLoads.push({ clinicId, conversationId });
      return histories.get(`${clinicId}/${conversationId}`) ?? [];
    },
    runAgentTurn: async (params) => {
      agentInputs.push(params.input);
      return agentReply(params);
    },
  };
  return { deps, store, agentInputs, historyLoads, histories };
}

async function startSession(h: ReturnType<typeof adapterHarness>, clinicId = "clinic_a") {
  const started = await startCallSession(h.deps, { clinicId, locale: "tr", callerE164: CALLER });
  if (!started.ok) throw new Error(started.errorCode);
  return started;
}

describe("B1. prefetched turn context", () => {
  it("uses prefetched history for the session's own clinic + conversation; Agent Core still runs", async () => {
    const h = adapterHarness();
    const s = await startSession(h);
    h.histories.set(`clinic_a/${s.conversationId}`, [{ role: "user", content: "önceki" }]);
    const prefetch = prefetchVoiceTurnContext(h.deps, {
      callSessionId: s.callSessionId,
      clinicId: "clinic_a",
      conversationId: s.conversationId,
    });
    const result = await processVoiceTurn(h.deps, { callSessionId: s.callSessionId, clinicId: "clinic_a", text: TRANSCRIPT, turnId: "t1" }, { prefetch });
    expect(result.ok).toBe(true);
    expect(h.historyLoads).toHaveLength(1);
    expect(h.agentInputs).toHaveLength(1);
    expect(h.agentInputs[0]).toMatchObject({ channel: "voice", clinicId: "clinic_a", conversationId: s.conversationId, history: [{ role: "user", content: "önceki" }] });
  });

  it("a prefetch for another conversation is discarded and history is reloaded for the session", async () => {
    const h = adapterHarness();
    const s = await startSession(h);
    h.histories.set("clinic_a/conv_other", [{ role: "user", content: "FOREIGN" }]);
    h.histories.set(`clinic_a/${s.conversationId}`, [{ role: "user", content: "own" }]);
    const prefetch = prefetchVoiceTurnContext(h.deps, { callSessionId: s.callSessionId, clinicId: "clinic_a", conversationId: "conv_other" });
    await processVoiceTurn(h.deps, { callSessionId: s.callSessionId, text: TRANSCRIPT, turnId: "t1" }, { prefetch });
    expect(h.agentInputs[0].history).toEqual([{ role: "user", content: "own" }]);
    expect(h.historyLoads.at(-1)).toEqual({ clinicId: "clinic_a", conversationId: s.conversationId });
  });

  it("a prefetch carrying another clinic's id is never used (tenant isolation)", async () => {
    const h = adapterHarness();
    const s = await startSession(h);
    h.histories.set(`clinic_b/${s.conversationId}`, [{ role: "user", content: "CLINIC_B_DATA" }]);
    const prefetch = prefetchVoiceTurnContext(h.deps, { callSessionId: s.callSessionId, clinicId: "clinic_b", conversationId: s.conversationId });
    await processVoiceTurn(h.deps, { callSessionId: s.callSessionId, text: TRANSCRIPT, turnId: "t1" }, { prefetch });
    expect(JSON.stringify(h.agentInputs)).not.toContain("CLINIC_B_DATA");
    expect(h.agentInputs[0].clinicId).toBe("clinic_a");
  });

  it("a prefetch for a different call session is ignored and the session is re-read", async () => {
    const h = adapterHarness();
    const a = await startSession(h);
    const b = await startSession(h);
    const prefetch = prefetchVoiceTurnContext(h.deps, { callSessionId: b.callSessionId, clinicId: "clinic_a", conversationId: b.conversationId });
    const result = await processVoiceTurn(h.deps, { callSessionId: a.callSessionId, text: TRANSCRIPT, turnId: "t1" }, { prefetch });
    expect(result.ok && result.conversationId).toBe(a.conversationId);
    expect(h.agentInputs[0].conversationId).toBe(a.conversationId);
  });

  it("clinic mismatch is still rejected before Agent Core when the session came from a prefetch", async () => {
    const h = adapterHarness();
    const s = await startSession(h);
    const prefetch = prefetchVoiceTurnContext(h.deps, { callSessionId: s.callSessionId, clinicId: "clinic_a", conversationId: s.conversationId });
    const r = await processVoiceTurn(h.deps, { callSessionId: s.callSessionId, clinicId: "clinic_b", text: TRANSCRIPT, turnId: "t1" }, { prefetch });
    expect(r).toMatchObject({ ok: false, errorCode: "CLINIC_MISMATCH" });
    expect(h.agentInputs).toHaveLength(0);
  });

  it("a prefetched session read failure fails the turn exactly like an inline read failure", async () => {
    const h = adapterHarness();
    const s = await startSession(h);
    const failing: VoiceTurnPrefetch = {
      callSessionId: s.callSessionId,
      clinicId: "clinic_a",
      conversationId: s.conversationId,
      session: { ok: false, error: new Error("UNAVAILABLE") },
      history: { ok: true, value: [] },
      sessionReadMs: 1,
      historyMs: 1,
    };
    await expect(
      processVoiceTurn(h.deps, { callSessionId: s.callSessionId, text: TRANSCRIPT, turnId: "t1" }, { prefetch: Promise.resolve(failing) })
    ).rejects.toThrow("UNAVAILABLE");
    expect(h.agentInputs).toHaveLength(0);
  });
});

describe("B2. deferred session bookkeeping", () => {
  function gatedStore() {
    const inner = createInMemoryCallSessionStore();
    const gates: Array<ReturnType<typeof deferred<void>>> = [];
    const events: string[] = [];
    let failNext = false;
    const store: CallSessionStore = {
      create: (s) => inner.create(s),
      async get(id) {
        events.push("get");
        return inner.get(id);
      },
      async update(id, patch) {
        const gate = deferred<void>();
        gates.push(gate);
        events.push(`update:${patch.status ?? "-"}:start`);
        await gate.promise;
        if (failNext) {
          failNext = false;
          throw new Error("DEADLINE_EXCEEDED");
        }
        const out = await inner.update(id, patch);
        events.push(`update:${patch.status ?? "-"}:done`);
        return out;
      },
    };
    return {
      store,
      gates,
      events,
      failNextUpdate() {
        failNext = true;
      },
    };
  }

  it("the reply is returned before the bookkeeping write; the next turn reads after it", async () => {
    const g = gatedStore();
    const h = adapterHarness({ defer: true, store: g.store });
    const s = await startSession(h);

    const r1 = await processVoiceTurn(h.deps, { callSessionId: s.callSessionId, text: TRANSCRIPT, turnId: "t1" });
    expect(r1.ok).toBe(true);
    expect(g.gates).toHaveLength(1);
    expect((await h.store.get(s.callSessionId))?.status).toBe("STARTED");

    g.events.length = 0;
    const turn2 = processVoiceTurn(h.deps, { callSessionId: s.callSessionId, text: TRANSCRIPT, turnId: "t2" });
    await flush();
    expect(h.agentInputs).toHaveLength(1);
    g.gates[0].resolve();
    expect((await turn2).ok).toBe(true);
    await vi.waitFor(() => expect(g.gates).toHaveLength(2));
    g.gates[1].resolve();
    await awaitVoiceSessionWrites(s.callSessionId);

    expect(g.events.slice(0, 2)).toEqual(["update:ACTIVE:done", "get"]);
    expect((await h.store.get(s.callSessionId))?.processedTurnIds).toEqual(["t1", "t2"]);
  });

  it("a replayed turn id after the deferred write returns the cached result without Agent Core", async () => {
    const h = adapterHarness({ defer: true });
    const s = await startSession(h);
    await processVoiceTurn(h.deps, { callSessionId: s.callSessionId, text: TRANSCRIPT, turnId: "t1" });
    const replay = await processVoiceTurn(h.deps, { callSessionId: s.callSessionId, text: TRANSCRIPT, turnId: "t1" });
    expect(replay).toMatchObject({ ok: true, idempotentReplay: true });
    expect(h.agentInputs).toHaveLength(1);
  });

  it("endCallSession waits for a pending turn write, so COMPLETED is never overwritten by ACTIVE", async () => {
    const g = gatedStore();
    const h = adapterHarness({ defer: true, store: g.store });
    const s = await startSession(h);
    await processVoiceTurn(h.deps, { callSessionId: s.callSessionId, text: TRANSCRIPT, turnId: "t1" });
    const ending = endCallSession(h.deps, { callSessionId: s.callSessionId, reason: "completed" });
    await flush();
    expect(g.gates).toHaveLength(1);
    expect(g.events).not.toContain("update:COMPLETED:start");
    g.gates[0].resolve();
    await vi.waitFor(() => expect(g.gates).toHaveLength(2));
    g.gates[1].resolve();
    expect((await ending).ok).toBe(true);
    expect((await h.store.get(s.callSessionId))?.status).toBe("COMPLETED");
  });

  it("a failed deferred write is logged without PII and never blocks the reply or later turns", async () => {
    const out = captureConsole();
    try {
      const g = gatedStore();
      const h = adapterHarness({ defer: true, store: g.store });
      const s = await startSession(h);
      g.failNextUpdate();
      const r1 = await processVoiceTurn(h.deps, { callSessionId: s.callSessionId, text: TRANSCRIPT, turnId: "t1" });
      expect(r1.ok).toBe(true);
      g.gates[0].resolve();
      await awaitVoiceSessionWrites(s.callSessionId);
      const failed = out.json("VOICE_SESSION_BOOKKEEPING_FAILED");
      expect(failed).toHaveLength(1);

      expect((await processVoiceTurn(h.deps, { callSessionId: s.callSessionId, text: TRANSCRIPT, turnId: "t2" })).ok).toBe(true);
      g.gates[1].resolve();
      await awaitVoiceSessionWrites(s.callSessionId);
      expect((await h.store.get(s.callSessionId))?.processedTurnIds).toEqual(["t2"]);

      const all = out.lines.join("\n");
      for (const secret of ["TRANSCRIPT_SECRET", "REPLY_SECRET", CALLER]) expect(all).not.toContain(secret);
    } finally {
      out.restore();
    }
  });

  it("VOICE_TURN_PROCESSED carries stage durations and no transcript/reply/caller data", async () => {
    const out = captureConsole();
    try {
      const h = adapterHarness({ defer: true });
      const s = await startSession(h);
      await processVoiceTurn(h.deps, { callSessionId: s.callSessionId, text: TRANSCRIPT, turnId: "t1" });
      const [processed] = out.json("VOICE_TURN_PROCESSED");
      expect(processed).toMatchObject({ sessionWrite: "DEFERRED", prefetchUsed: false });
      for (const k of ["sessionReadMs", "historyMs", "agentMs", "historyTurns"]) expect(typeof processed[k]).toBe("number");
      const all = out.lines.join("\n");
      for (const secret of ["TRANSCRIPT_SECRET", "REPLY_SECRET", CALLER]) expect(all).not.toContain(secret);
    } finally {
      out.restore();
    }
  });
});

/* ── C. Bridge: prefetch alongside allocation, timing, pre-warm ─────────── */

const DID = "+908502428852";
const CLINIC = "clinic_nova";
const KEY = "lk:room_latency:sip_call_1";

function bridgeCaps() {
  const bindings = new Map<string, CallBinding>();
  const iso = "2026-10-07T10:00:00.000Z";
  const allocation = { gate: null as ReturnType<typeof deferred<void>> | null, fail: false };
  const order: string[] = [];
  const caps = {
    resolveDid: vi.fn<VoiceRuntimeCapabilities["resolveDid"]>(async () => ({ ok: true, didE164: DID, clinicId: CLINIC, defaultLocale: "tr" })),
    getOrCreateBinding: vi.fn<VoiceRuntimeCapabilities["getOrCreateBinding"]>(async (input) => {
      const bindingId = deriveCallBindingId(input.externalCallKey)!;
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
      order.push("allocate:start");
      if (allocation.gate) await allocation.gate.promise;
      order.push("allocate:done");
      if (allocation.fail) return { ok: false, code: "CALL_BINDING_UPDATE_FAILED" };
      const b = bindings.get(bindingId)!;
      b.turnSeq += 1;
      return { ok: true, bindingId, turnSeq: b.turnSeq, turnId: formatTurnId(bindingId, b.turnSeq) };
    }),
    endBinding: vi.fn<VoiceRuntimeCapabilities["endBinding"]>(async ({ bindingId }) => ({ ok: true, binding: { ...bindings.get(bindingId)!, status: "ENDED" } })),
    failBinding: vi.fn<VoiceRuntimeCapabilities["failBinding"]>(async ({ bindingId }) => ({ ok: true, binding: { ...bindings.get(bindingId)!, status: "FAILED" } })),
    processTurn: vi.fn<VoiceRuntimeCapabilities["processTurn"]>(async (input): Promise<VoiceTurnResult> => {
      order.push("process");
      return {
        ok: true,
        callSessionId: input.callSessionId,
        conversationId: deriveBoundSessionIds(deriveCallBindingId(KEY)!).conversationId,
        clinicId: input.clinicId ?? CLINIC,
        channel: "voice",
        replyText: REPLY,
        appointmentState: "IDLE",
      };
    }),
    endSession: vi.fn<VoiceRuntimeCapabilities["endSession"]>(async (input) => ({
      ok: true,
      callSessionId: input.callSessionId,
      conversationId: "conv",
      clinicId: CLINIC,
      status: "COMPLETED",
    })),
    prefetchTurn: vi.fn<NonNullable<VoiceRuntimeCapabilities["prefetchTurn"]>>(async (input) => {
      order.push("prefetch");
      return {
        ...input,
        session: { ok: true, value: null },
        history: { ok: true, value: [] },
        sessionReadMs: 0,
        historyMs: 0,
      };
    }),
    warmClinicRuntime: vi.fn<NonNullable<VoiceRuntimeCapabilities["warmClinicRuntime"]>>(async () => undefined),
  };
  return { caps, allocation, order };
}

async function startBridge(caps: VoiceRuntimeCapabilities) {
  const bridge = createVoiceRuntimeBridge({ capabilities: caps });
  const started = await bridge.startRuntimeCall({ externalCallKey: KEY, calledDid: DID });
  if (!started.ok) throw new Error(started.code);
  return { bridge, call: started.call };
}

describe("C. bridge turn path", () => {
  it("prefetch starts before turn id allocation completes and is handed to processTurn", async () => {
    const env = bridgeCaps();
    const { bridge, call } = await startBridge(env.caps);
    env.allocation.gate = deferred<void>();
    const pending = bridge.processRuntimeTranscript({ runtimeCall: call, transcript: TRANSCRIPT });
    await flush();
    expect(env.order).toEqual(["prefetch", "allocate:start"]);
    expect(env.caps.processTurn).not.toHaveBeenCalled();
    env.allocation.gate.resolve();
    const result = await pending;
    expect(result.ok).toBe(true);
    expect(env.order).toEqual(["prefetch", "allocate:start", "allocate:done", "process"]);
    expect(env.caps.prefetchTurn).toHaveBeenCalledWith({
      callSessionId: call.callSessionId,
      clinicId: CLINIC,
      conversationId: call.conversationId,
    });
    const [input, options] = env.caps.processTurn.mock.calls[0];
    expect(input).toMatchObject({ clinicId: CLINIC, callSessionId: call.callSessionId, turnId: formatTurnId(call.bindingId, 1) });
    expect(options?.prefetch).toBeInstanceOf(Promise);
  });

  it("no business turn runs when turn id allocation fails", async () => {
    const env = bridgeCaps();
    const { bridge, call } = await startBridge(env.caps);
    env.allocation.fail = true;
    const result = await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: TRANSCRIPT });
    expect(result).toMatchObject({ ok: false, action: "DISCARD" });
    expect(env.caps.processTurn).not.toHaveBeenCalled();
  });

  it("without a prefetch capability processTurn is called exactly as before (single argument)", async () => {
    const env = bridgeCaps();
    const caps: VoiceRuntimeCapabilities = { ...env.caps };
    delete caps.prefetchTurn;
    const { bridge, call } = await startBridge(caps);
    await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: TRANSCRIPT });
    expect(env.caps.processTurn.mock.calls[0]).toHaveLength(1);
  });

  it("pre-warm uses the DID-derived clinicId at call start and after each turn; its failure never affects turns", async () => {
    const out = captureConsole();
    try {
      const env = bridgeCaps();
      env.caps.warmClinicRuntime.mockRejectedValue(new Error("warm boom"));
      const { bridge, call } = await startBridge(env.caps);
      const result = await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: TRANSCRIPT });
      await flush();
      expect(result.ok).toBe(true);
      expect(env.caps.warmClinicRuntime.mock.calls.map(([i]) => i)).toEqual([{ clinicId: CLINIC }, { clinicId: CLINIC }]);
      expect(out.json("VOICE_RUNTIME_WARM_FAILED")).toHaveLength(2);
    } finally {
      out.restore();
    }
  });

  it("VOICE_RUNTIME_TURN_TIMING has durations and ids only", async () => {
    const out = captureConsole();
    try {
      const env = bridgeCaps();
      const { bridge, call } = await startBridge(env.caps);
      await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: TRANSCRIPT });
      const [timing] = out.json("VOICE_RUNTIME_TURN_TIMING");
      expect(Object.keys(timing).sort()).toEqual(
        ["allocateMs", "bindingId", "callSessionId", "checkpoint", "clinicId", "outcome", "prefetch", "processTurnMs", "totalMs", "turnSeq"].sort()
      );
      expect(timing).toMatchObject({ outcome: "OK", prefetch: true, turnSeq: 1, clinicId: CLINIC });
      expect(out.lines.join("\n")).not.toMatch(/TRANSCRIPT_SECRET|REPLY_SECRET/);
    } finally {
      out.restore();
    }
  });
});

/* ── D. Clinic runtime loader / pre-warm ────────────────────────────────── */

function clinicDb(clinics: Record<string, { name: string; docs: string[] }>) {
  const reads: string[] = [];
  const gate = { current: null as ReturnType<typeof deferred<void>> | null, fail: false };
  const db: ClinicRuntimeFirestore = {
    collection: (name) => ({
      doc: (id) => ({
        async get() {
          reads.push(`${name}/${id}`);
          if (gate.current) await gate.current.promise;
          if (gate.fail) throw new Error("UNAVAILABLE");
          if (name === "clinics" && clinics[id]) return { exists: true, data: () => ({ name: clinics[id].name, language: "tr" }) };
          if (name === "promptSettings" && clinics[id]) return { exists: true, data: () => ({ model: "gpt-4o" }) };
          return { exists: false, data: () => undefined };
        },
      }),
      where: (_field, _op, value) => ({
        limit: () => ({
          async get() {
            reads.push(`${name}?clinicId=${value}`);
            if (gate.current) await gate.current.promise;
            if (gate.fail) throw new Error("UNAVAILABLE");
            return {
              docs: (clinics[value]?.docs ?? []).map((content, i) => ({
                id: `${value}_doc_${i}`,
                data: () => ({ clinicId: value, title: `t${i}`, content }),
              })),
            };
          },
        }),
      }),
    }),
  };
  return { db, reads, gate };
}

describe("D. clinic runtime pre-warm", () => {
  beforeEach(() => invalidateClinicRuntimeCache());

  it("loads clinic config, prompt settings and training docs keyed only by clinicId", async () => {
    const env = clinicDb({ clinic_a: { name: "A Dental", docs: ["A fiyat bilgisi"] }, clinic_b: { name: "B Dental", docs: ["B bilgi"] } });
    expect(await warmClinicRuntime(env.db, "clinic_a", { minRemainingMs: 25_000 })).toBe("LOADED");
    expect(getCachedClinicRuntime("clinic_a")).toMatchObject({ clinicName: "A Dental", promptSettings: { model: "gpt-4o" } });
    expect(getCachedClinicRuntime("clinic_a")?.trainingDocs.map((d) => d.content)).toEqual(["A fiyat bilgisi"]);
    expect(getCachedClinicRuntime("clinic_b")).toBeNull();
    expect(env.reads.every((r) => r.includes("clinic_a"))).toBe(true);
  });

  it("a fresh entry is not reloaded; a missing top-level clinic is not cached", async () => {
    const env = clinicDb({ clinic_a: { name: "A", docs: [] } });
    await warmClinicRuntime(env.db, "clinic_a", { minRemainingMs: 25_000 });
    const readsAfterFirst = env.reads.length;
    expect(await warmClinicRuntime(env.db, "clinic_a", { minRemainingMs: 25_000 })).toBe("FRESH");
    expect(env.reads.length).toBe(readsAfterFirst);
    expect(await warmClinicRuntime(env.db, "agency_clinic", { minRemainingMs: 25_000 })).toBe("NOT_TOP_LEVEL");
    expect(getCachedClinicRuntime("agency_clinic")).toBeNull();
  });

  it("an in-flight warm-up is shared with Agent Core's load (one read per clinic)", async () => {
    const env = clinicDb({ clinic_a: { name: "A", docs: [] } });
    env.gate.current = deferred<void>();
    const warm = warmClinicRuntime(env.db, "clinic_a", { minRemainingMs: 25_000 });
    const core = loadTopLevelClinicRuntime(env.db, "clinic_a");
    await flush();
    expect(env.reads.filter((r) => r === "clinics/clinic_a")).toHaveLength(1);
    env.gate.current.resolve();
    expect((await core)?.clinicName).toBe("A");
    expect(await warm).toBe("LOADED");
    expect(_clinicRuntimeInflightSize()).toBe(0);
  });

  it("a failed warm-up never throws; Agent Core joining it retries on its own", async () => {
    const env = clinicDb({ clinic_a: { name: "A", docs: [] } });
    env.gate.current = deferred<void>();
    env.gate.fail = true;
    const warm = warmClinicRuntime(env.db, "clinic_a", { minRemainingMs: 25_000 });
    const core = loadTopLevelClinicRuntime(env.db, "clinic_a");
    await flush();
    env.gate.current.resolve();
    expect(await warm).toBe("FAILED");
    env.gate.fail = false;
    env.gate.current = null;
    expect((await core)?.clinicName).toBe("A");
  });
});

/* ── E. Pricing lookup is not repeated per AI request when pricing is absent ─ */

describe("E. AI pricing negative cache", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock("@/lib/firebase-admin");
  });

  it("an empty successful pricing load is reused for the TTL; a failed load is retried", async () => {
    let queries = 0;
    let fail = false;
    vi.doMock("@/lib/firebase-admin", () => ({
      getAdminDb: () => ({
        collection: () => ({
          where: () => ({
            get: async () => {
              queries += 1;
              if (fail) throw new Error("UNAVAILABLE");
              return { docs: [] };
            },
          }),
        }),
      }),
    }));
    const out = captureConsole();
    try {
      const { getModelPricing, invalidatePricingCache } = await import("@/lib/services/aiPricingService");
      fail = true;
      expect(await getModelPricing("gpt-4o")).toBeNull();
      expect(await getModelPricing("gpt-4o")).toBeNull();
      expect(queries).toBe(2);
      fail = false;
      expect(await getModelPricing("gpt-4o")).toBeNull();
      expect(await getModelPricing("gpt-4o")).toBeNull();
      expect(await getModelPricing("gpt-4o-mini")).toBeNull();
      expect(queries).toBe(3);
      invalidatePricingCache();
      await getModelPricing("gpt-4o");
      expect(queries).toBe(4);
    } finally {
      out.restore();
    }
  });
});

/* ── F. Usage accounting failure cannot block the reply ─────────────────── */

describe("F. aiGateway usage persistence failure is non-fatal", () => {
  const ENV_KEY = "OPENAI_API_KEY";
  let previousKey: string | undefined;

  beforeEach(() => {
    vi.resetModules();
    previousKey = process.env[ENV_KEY];
    process.env[ENV_KEY] = "test-placeholder-not-a-key";
  });
  afterEach(() => {
    if (previousKey === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = previousKey;
    vi.doUnmock("openai");
    vi.doUnmock("@/lib/firebase-admin");
    vi.doUnmock("@/lib/services/aiPricingService");
    vi.doUnmock("@/lib/services/aiLimitService");
  });

  it("returns the model content when pricing is missing and the usage write rejects", async () => {
    vi.doMock("openai", () => ({
      default: class {
        chat = {
          completions: {
            create: async () => ({
              id: "chatcmpl_test",
              choices: [{ message: { content: "Merhaba, nasıl yardımcı olabilirim?" } }],
              usage: { total_tokens: 12, prompt_tokens: 8, completion_tokens: 4 },
            }),
          },
        };
      },
    }));
    vi.doMock("@/lib/services/aiPricingService", () => ({
      getModelPricing: async () => null,
      calculateCost: () => ({ inputCostUsd: 0, cachedInputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0 }),
    }));
    vi.doMock("@/lib/services/aiLimitService", () => ({ checkLimitsAndNotify: vi.fn() }));
    vi.doMock("@/lib/firebase-admin", () => ({
      getAdminDb: () => ({
        collection: () => ({
          doc: () => ({
            set: async () => {
              throw new Error('Cannot use "undefined" as a Firestore value');
            },
          }),
        }),
      }),
    }));
    const out = captureConsole();
    try {
      const { trackableAIRequest } = await import("@/lib/services/aiGateway");
      const res = await trackableAIRequest({
        clinicId: "clinic_a",
        model: "gpt-4o",
        requestType: "chat",
        channel: "voice",
        messages: [{ role: "user", content: TRANSCRIPT }],
      } as Parameters<typeof trackableAIRequest>[0]);
      expect(res.content).toBe("Merhaba, nasıl yardımcı olabilirim?");
      expect(out.lines.some((l) => l.includes("Failed to save usage record"))).toBe(true);
      expect(out.lines.join("\n")).not.toContain("TRANSCRIPT_SECRET");
    } finally {
      out.restore();
    }
  });
});
