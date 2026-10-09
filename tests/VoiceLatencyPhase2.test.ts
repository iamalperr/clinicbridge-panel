/**
 * Voice latency Phase 2 (local only, no Firebase, no network):
 *   D  lease verification fused into the turn id transaction (adversarial: takeover races,
 *      contention retries, expiry, forged tokens, tenant mismatch, fail-closed wiring)
 *   C  voice conversation-log persistence in one atomic batch (same documents as the
 *      sequential web path, 2 round trips instead of 5)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { AgentTurnResult } from "@/lib/agent/types";
import type { HandleClinicAgentTurnParams } from "@/lib/agent/handleClinicAgentTurn";
import { createInMemoryCallSessionStore } from "@/lib/voice/callSessionStore";
import {
  createCallController,
  createRuntimeLeaseOperations,
  type CallControllerEvent,
  type CallControllerOptions,
  type RuntimeLeaseOperations,
  type TurnOutcome,
} from "@/lib/voice/runtime/callController";
import { composeVoiceRuntimeCapabilities } from "@/lib/voice/runtime/composeVoiceRuntime";
import { allocateTurnIdUnderLease } from "@/lib/voice/runtime/leasedTurnAllocation";
import { acquireRuntimeLease, type RuntimeLeaseHandle } from "@/lib/voice/runtime/runtimeLease";
import {
  createVoiceRuntimeBridge,
  type ProcessRuntimeTranscriptInput,
  type VoiceRuntimeCapabilities,
} from "@/lib/voice/runtime/voiceRuntimeBridge";
import { formatTurnId } from "@/lib/voice/telephony/callBinding";

const REPO = resolve(__dirname, "..");
const DID = "+908502428852";
const CLINIC = "clinic_nova";
const OTHER_CLINIC = "clinic_other";
const KEY = "lk:room_abc:sip_call_1";
const T0 = Date.parse("2026-10-09T10:00:00.000Z");

/* ── Optimistic-concurrency Firestore fake ──────────────────────────── */

type Doc = Record<string, unknown>;

interface MemRef {
  path: string;
  get(): Promise<MemSnap>;
  create(data: Doc): Promise<void>;
  set(data: Doc, opts?: { merge?: boolean }): Promise<void>;
  collection(name: string): { doc(id: string): MemRef };
}

interface MemSnap {
  exists: boolean;
  data(): Doc | undefined;
  readTime?: { toMillis(): number };
}

interface OccTx {
  get(ref: object): Promise<MemSnap>;
  getAll(...refs: object[]): Promise<MemSnap[]>;
  create(ref: object, data: Doc): unknown;
  update(ref: object, data: Doc): unknown;
}

/**
 * Versioned documents; a transaction commits only if every document it read is unchanged,
 * otherwise the callback is re-run (up to 5 attempts), like Firestore's retry on contention.
 */
function createOccDb(options: { serverReadTime?: boolean } = {}) {
  const docs = new Map<string, { data: Doc; version: number }>();
  let serverNow = T0;
  const stats = { transactions: 0, attempts: 0, getAllCalls: 0, getCalls: 0 };
  const hooks: { beforeCommit?: (attempt: number) => void } = {};
  let failNextTransactions = 0;
  const alreadyExists = () => Object.assign(new Error("ALREADY_EXISTS"), { code: 6 });

  const snap = (path: string): MemSnap => {
    const d = docs.get(path);
    return {
      exists: d !== undefined,
      data: () => (d ? structuredClone(d.data) : undefined),
      ...(options.serverReadTime === false ? {} : { readTime: { toMillis: () => serverNow } }),
    };
  };
  const write = (path: string, data: Doc) => {
    docs.set(path, { data: structuredClone(data), version: (docs.get(path)?.version ?? 0) + 1 });
  };
  const ref = (path: string): MemRef => ({
    path,
    async get() {
      return snap(path);
    },
    async create(data) {
      if (docs.has(path)) throw alreadyExists();
      write(path, data);
    },
    async set(data, opts) {
      write(path, opts?.merge ? { ...(docs.get(path)?.data ?? {}), ...structuredClone(data) } : data);
    },
    collection: (name) => col(`${path}/${name}`),
  });
  const col = (path: string) => ({ doc: (id: string) => ref(`${path}/${id}`) });

  const db = {
    collection: col,
    async runTransaction<T>(fn: (tx: OccTx) => Promise<T>): Promise<T> {
      stats.transactions += 1;
      if (failNextTransactions > 0) {
        failNextTransactions -= 1;
        throw Object.assign(new Error("UNAVAILABLE"), { code: 14 });
      }
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        stats.attempts += 1;
        const reads = new Map<string, number>();
        const writes: Array<() => void> = [];
        const read = (r: object) => {
          const path = (r as MemRef).path;
          reads.set(path, docs.get(path)?.version ?? 0);
          return snap(path);
        };
        const tx: OccTx = {
          get: async (r) => {
            stats.getCalls += 1;
            return read(r);
          },
          getAll: async (...rs) => {
            stats.getAllCalls += 1;
            return rs.map(read);
          },
          create: (r, data) =>
            writes.push(() => {
              const path = (r as MemRef).path;
              if (docs.has(path)) throw alreadyExists();
              write(path, data);
            }),
          update: (r, data) =>
            writes.push(() => {
              const path = (r as MemRef).path;
              write(path, { ...docs.get(path)!.data, ...structuredClone(data) });
            }),
        };
        const out = await fn(tx);
        hooks.beforeCommit?.(attempt);
        const conflict = [...reads].some(([path, version]) => (docs.get(path)?.version ?? 0) !== version);
        if (conflict) continue;
        writes.forEach((w) => w());
        return out;
      }
      throw Object.assign(new Error("ABORTED"), { code: 10 });
    },
  };

  return {
    db,
    docs,
    stats,
    hooks,
    write,
    advance: (ms: number) => {
      serverNow += ms;
    },
    now: () => serverNow,
    failTransactions: (n: number) => {
      failNextTransactions = n;
    },
  };
}

/* ── Composition + controller harness ───────────────────────────────── */

function agentResult(params: HandleClinicAgentTurnParams, replyText: string): AgentTurnResult {
  return {
    replyText,
    conversationId: params.input.conversationId ?? "conv",
    payload: { reply: replyText },
    httpStatus: 200,
    appointmentState: "IDLE",
  };
}

async function setupCall(dbOptions: { serverReadTime?: boolean } = {}) {
  const mem = createOccDb(dbOptions);
  mem.write(`voiceNumbers/${DID}`, { active: true, voiceEnabled: true, clinicId: CLINIC, defaultLocale: "tr" });
  mem.write(`clinics/${CLINIC}`, { name: "Nova Dent" });
  const agentInputs: HandleClinicAgentTurnParams["input"][] = [];
  const capabilities = composeVoiceRuntimeCapabilities({
    adminDb: mem.db,
    sessionStore: createInMemoryCallSessionStore(),
    loadHistory: async () => [],
    runAgentTurn: async (params) => {
      agentInputs.push(params.input);
      return agentResult(params, "Size nasıl yardımcı olabilirim?");
    },
    warmClinicRuntime: false,
    deferSessionBookkeeping: false,
    now: () => new Date(mem.now()),
  });
  const bridge = createVoiceRuntimeBridge({ capabilities });
  const started = await bridge.startRuntimeCall({ externalCallKey: KEY, calledDid: DID });
  if (!started.ok) throw new Error(started.code);
  return { mem, capabilities, bridge, call: started.call, agentInputs };
}

type CallEnv = Awaited<ReturnType<typeof setupCall>>;

function startController(env: CallEnv, overrides: Partial<CallControllerOptions> = {}) {
  const ops = createRuntimeLeaseOperations({ adminDb: env.mem.db });
  const verify = vi.fn(ops.verify);
  const lease: RuntimeLeaseOperations = { ...ops, verify };
  const bridgeInputs: ProcessRuntimeTranscriptInput[] = [];
  const events: CallControllerEvent[] = [];
  const controller = createCallController({
    runtimeCall: env.call,
    ownerId: "worker-a:job-1",
    bridge: {
      endRuntimeCall: (input) => env.bridge.endRuntimeCall(input),
      processRuntimeTranscript: (input) => {
        bridgeInputs.push(input);
        return env.bridge.processRuntimeTranscript(input);
      },
    },
    lease,
    clock: { now: () => env.mem.now(), setTimeout: () => 0, clearTimeout: () => undefined },
    logger: () => undefined,
    onEvent: (event) => events.push(event),
    verifyLeaseInTurnAllocation: true,
    ...overrides,
  });
  const outcomes = (): TurnOutcome[] =>
    events.flatMap((e) => (e.type === "TURN_OUTCOME" ? [e.outcome] : []));
  return { controller, verify, bridgeInputs, events, outcomes };
}

async function turn(c: ReturnType<typeof startController>, text: string): Promise<void> {
  expect(c.controller.submitTranscript(text)).toMatchObject({ accepted: true });
  await c.controller.whenIdle();
}

const turnSeqOf = (env: CallEnv) => env.mem.docs.get(`voiceCalls/${env.call.bindingId}`)?.data.turnSeq;
const leasePath = (env: CallEnv) => `voiceRuntimeLeases/${env.call.bindingId}`;

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

/* ── D. Lease verification fused into turn id allocation ────────────── */

describe("D. fused lease verify + turn id allocation (controller → bridge → Firestore)", () => {
  it("D1. one transaction verifies the lease and allocates the turn; no separate verify round trip", async () => {
    const env = await setupCall();
    const c = startController(env);
    expect(await c.controller.start()).toMatchObject({ ok: true });
    const before = { ...env.mem.stats };

    await turn(c, "Merhaba");

    expect(c.verify).not.toHaveBeenCalled();
    expect(c.bridgeInputs[0].lease).toMatchObject({ minRemainingMs: 5_000, proof: { bindingId: env.call.bindingId, clinicId: CLINIC } });
    expect(env.mem.stats.transactions - before.transactions).toBe(1);
    expect(env.mem.stats.getAllCalls - before.getAllCalls).toBe(1);
    expect(env.agentInputs).toHaveLength(1);
    expect(turnSeqOf(env)).toBe(1);
    expect(c.outcomes()).toEqual([expect.objectContaining({ kind: "SPEAK", turnSeq: 1, turnId: formatTurnId(env.call.bindingId, 1) })]);
  });

  it("D2. takeover by another worker between turns: no turn id, no Agent Core, ownership lost", async () => {
    const env = await setupCall();
    const c = startController(env);
    await c.controller.start();
    await turn(c, "Merhaba");

    env.mem.advance(31_000);
    const taken = await acquireRuntimeLease({ adminDb: env.mem.db }, { bindingId: env.call.bindingId, clinicId: CLINIC, ownerId: "worker-b:job-2" });
    expect(taken).toMatchObject({ ok: true, takeover: true });

    await turn(c, "Fiyat nedir?");
    expect(env.agentInputs).toHaveLength(1);
    expect(turnSeqOf(env)).toBe(1);
    expect(c.outcomes().at(-1)).toEqual({ kind: "SUPPRESSED", reason: "OWNERSHIP_LOST" });
    expect(c.events).toContainEqual({ type: "OWNERSHIP_LOST", code: "RUNTIME_LEASE_GENERATION_MISMATCH" });
    expect(c.controller.snapshot().state).toBe("OWNERSHIP_LOST");
  });

  it("D3. takeover committed between this transaction's read and commit forces a retry that rejects the turn", async () => {
    const env = await setupCall();
    const c = startController(env);
    await c.controller.start();
    const attemptsBefore = env.mem.stats.attempts;
    env.mem.hooks.beforeCommit = (attempt) => {
      if (attempt !== 1) return;
      const current = env.mem.docs.get(leasePath(env))!.data;
      env.mem.write(leasePath(env), { ...current, ownerId: "worker-b:job-2", generation: (current.generation as number) + 1 });
    };

    await turn(c, "Merhaba");

    expect(env.mem.stats.attempts - attemptsBefore).toBe(2);
    expect(env.agentInputs).toHaveLength(0);
    expect(turnSeqOf(env)).toBe(0);
    expect(c.outcomes()).toEqual([{ kind: "SUPPRESSED", reason: "OWNERSHIP_LOST" }]);
  });

  it("D4. contention retry without ownership change allocates exactly once and runs Agent Core exactly once", async () => {
    const env = await setupCall();
    const c = startController(env);
    await c.controller.start();
    const callPath = `voiceCalls/${env.call.bindingId}`;
    const attemptsBefore = env.mem.stats.attempts;
    env.mem.hooks.beforeCommit = (attempt) => {
      if (attempt === 1) env.mem.write(callPath, { ...env.mem.docs.get(callPath)!.data, updatedAt: "touched" });
    };

    await turn(c, "Merhaba");

    expect(env.mem.stats.attempts - attemptsBefore).toBe(2);
    expect(turnSeqOf(env)).toBe(1);
    expect(env.agentInputs).toHaveLength(1);
    expect(c.outcomes()).toEqual([expect.objectContaining({ kind: "SPEAK", turnSeq: 1 })]);
  });

  it("D5. less than minRemainingMs of lease left: rejected like a failed verify (EXPIRED → ownership lost)", async () => {
    const env = await setupCall();
    const c = startController(env);
    await c.controller.start();
    env.mem.advance(26_000);

    await turn(c, "Merhaba");

    expect(env.agentInputs).toHaveLength(0);
    expect(turnSeqOf(env)).toBe(0);
    expect(c.events).toContainEqual({ type: "OWNERSHIP_LOST", code: "RUNTIME_LEASE_EXPIRED" });
  });

  it("D6. transaction failure is transient: NOT_PROCESSED, call stays ACTIVE, next turn succeeds", async () => {
    const env = await setupCall();
    const c = startController(env);
    await c.controller.start();
    env.mem.failTransactions(1);

    await turn(c, "Merhaba");
    expect(c.outcomes()).toEqual([{ kind: "NOT_PROCESSED", code: "LEASE_UNVERIFIED" }]);
    expect(env.agentInputs).toHaveLength(0);
    expect(c.controller.snapshot().state).toBe("ACTIVE");

    await turn(c, "Merhaba");
    expect(env.agentInputs).toHaveLength(1);
    expect(turnSeqOf(env)).toBe(1);
  });

  it("D7. two workers: a stale proof never allocates; the current owner's turns are numbered without gaps", async () => {
    const env = await setupCall();
    const stale = startController(env);
    await stale.controller.start();
    env.mem.advance(31_000);
    const current = await acquireRuntimeLease({ adminDb: env.mem.db }, { bindingId: env.call.bindingId, clinicId: CLINIC, ownerId: "worker-b:job-2" });
    if (!current.ok) throw new Error(current.code);

    await turn(stale, "eski işçi");
    for (const n of [1, 2]) {
      const r = await env.bridge.processRuntimeTranscript({
        runtimeCall: env.call,
        transcript: `yeni işçi ${n}`,
        lease: { proof: current.lease, minRemainingMs: 5_000 },
      });
      expect(r).toMatchObject({ ok: true, turn: { turnSeq: n } });
    }
    expect(env.agentInputs.map((i) => i.text)).toEqual(["yeni işçi 1", "yeni işçi 2"]);
    expect(turnSeqOf(env)).toBe(2);
  });

  it("D8. default controller (flag off) still verifies separately and sends no lease to the bridge", async () => {
    const env = await setupCall();
    const c = startController(env, { verifyLeaseInTurnAllocation: false });
    await c.controller.start();
    await turn(c, "Merhaba");
    expect(c.verify).toHaveBeenCalledTimes(1);
    expect(c.bridgeInputs[0]).not.toHaveProperty("lease");
    expect(turnSeqOf(env)).toBe(1);
  });
});

describe("D. allocateTurnIdUnderLease — adversarial inputs", () => {
  async function leased(env: CallEnv): Promise<RuntimeLeaseHandle> {
    const r = await acquireRuntimeLease({ adminDb: env.mem.db }, { bindingId: env.call.bindingId, clinicId: CLINIC, ownerId: "worker-a:job-1" });
    if (!r.ok) throw new Error(r.code);
    return r.lease;
  }

  it("D9. forged token, other owner or other generation: rejected, nothing written", async () => {
    const env = await setupCall();
    const proof = await leased(env);
    const forged = [
      { ...proof, leaseToken: `vrl_${"A".repeat(43)}` },
      { ...proof, ownerId: "worker-z:job-9" },
      { ...proof, generation: proof.generation + 1 },
    ];
    const codes = [];
    for (const p of forged) {
      const r = await allocateTurnIdUnderLease({ adminDb: env.mem.db }, {
        bindingId: env.call.bindingId,
        clinicId: CLINIC,
        lease: { proof: p, minRemainingMs: 5_000 },
      });
      codes.push(r.ok ? "OK" : "leaseCode" in r ? r.leaseCode : r.code);
    }
    expect(codes).toEqual(["RUNTIME_LEASE_TOKEN_MISMATCH", "RUNTIME_LEASE_OWNER_MISMATCH", "RUNTIME_LEASE_GENERATION_MISMATCH"]);
    expect(turnSeqOf(env)).toBe(0);
  });

  it("D10. tenant: the proof must match the binding and clinic; a foreign clinic cannot allocate", async () => {
    const env = await setupCall();
    const proof = await leased(env);
    const tx = env.mem.stats.transactions;
    const wrongClinic = await allocateTurnIdUnderLease({ adminDb: env.mem.db }, {
      bindingId: env.call.bindingId,
      clinicId: OTHER_CLINIC,
      lease: { proof, minRemainingMs: 5_000 },
    });
    const wrongBinding = await allocateTurnIdUnderLease({ adminDb: env.mem.db }, {
      bindingId: `vc_${"0".repeat(32)}`,
      clinicId: CLINIC,
      lease: { proof, minRemainingMs: 5_000 },
    });
    expect(wrongClinic).toEqual({ ok: false, code: "TURN_LEASE_REJECTED", leaseCode: "RUNTIME_LEASE_INVALID_INPUT" });
    expect(wrongBinding).toEqual({ ok: false, code: "TURN_LEASE_REJECTED", leaseCode: "RUNTIME_LEASE_INVALID_INPUT" });
    expect(env.mem.stats.transactions).toBe(tx);

    // A lease issued to another clinic for this binding id cannot allocate on this clinic's call.
    const foreign = createOccDb();
    foreign.write(`voiceCalls/${env.call.bindingId}`, env.mem.docs.get(`voiceCalls/${env.call.bindingId}`)!.data);
    const foreignLease = await acquireRuntimeLease({ adminDb: foreign.db }, { bindingId: env.call.bindingId, clinicId: OTHER_CLINIC, ownerId: "worker-x:job-1" });
    if (!foreignLease.ok) throw new Error(foreignLease.code);
    const crossTenant = await allocateTurnIdUnderLease({ adminDb: foreign.db }, {
      bindingId: env.call.bindingId,
      clinicId: OTHER_CLINIC,
      lease: { proof: foreignLease.lease, minRemainingMs: 5_000 },
    });
    expect(crossTenant).toMatchObject({ ok: false, code: "CALL_BINDING_TENANT_CONFLICT" });
    expect(foreign.docs.get(`voiceCalls/${env.call.bindingId}`)!.data.turnSeq).toBe(0);
  });

  it("D11. ended call: lease valid but binding terminal → no allocation", async () => {
    const env = await setupCall();
    const proof = await leased(env);
    const path = `voiceCalls/${env.call.bindingId}`;
    env.mem.write(path, { ...env.mem.docs.get(path)!.data, status: "ENDED", endReason: "completed" });
    const r = await allocateTurnIdUnderLease({ adminDb: env.mem.db }, {
      bindingId: env.call.bindingId,
      clinicId: CLINIC,
      lease: { proof, minRemainingMs: 5_000 },
    });
    expect(r).toMatchObject({ ok: false, code: "CALL_BINDING_ENDED" });
    expect(env.mem.docs.get(path)!.data.turnSeq).toBe(0);
  });

  it("D12. no server read time and no injected clock: fails closed (transient), nothing written", async () => {
    const env = await setupCall({ serverReadTime: false });
    const proof = await acquireRuntimeLease(
      { adminDb: env.mem.db, localClock: () => new Date(env.mem.now()) },
      { bindingId: env.call.bindingId, clinicId: CLINIC, ownerId: "worker-a:job-1" }
    );
    if (!proof.ok) throw new Error(proof.code);
    const r = await allocateTurnIdUnderLease({ adminDb: env.mem.db }, {
      bindingId: env.call.bindingId,
      clinicId: CLINIC,
      lease: { proof: proof.lease, minRemainingMs: 5_000 },
    });
    expect(r).toEqual({ ok: false, code: "TURN_LEASE_REJECTED", leaseCode: "RUNTIME_LEASE_LOOKUP_FAILED" });
    expect(turnSeqOf(env)).toBe(0);
  });
});

describe("D. bridge wiring", () => {
  it("D13. a lease check without the fused capability fails closed: no allocation, no Agent Core", async () => {
    const env = await setupCall();
    const allocateTurnId = vi.fn(env.capabilities.allocateTurnId);
    const processTurn = vi.fn(env.capabilities.processTurn);
    const caps: VoiceRuntimeCapabilities = { ...env.capabilities, allocateTurnId, processTurn, allocateTurnIdUnderLease: undefined };
    const bridge = createVoiceRuntimeBridge({ capabilities: caps });
    const started = await bridge.startRuntimeCall({ externalCallKey: KEY, calledDid: DID });
    if (!started.ok) throw new Error(started.code);
    const lease = await acquireRuntimeLease({ adminDb: env.mem.db }, { bindingId: env.call.bindingId, clinicId: CLINIC, ownerId: "worker-a:job-1" });
    if (!lease.ok) throw new Error(lease.code);

    const r = await bridge.processRuntimeTranscript({
      runtimeCall: started.call,
      transcript: "Merhaba",
      lease: { proof: lease.lease, minRemainingMs: 5_000 },
    });
    expect(r).toMatchObject({ ok: false, action: "DISCARD", code: "LEASE_REJECTED", reasonCode: "RUNTIME_LEASE_INVALID_STATE" });
    expect(allocateTurnId).not.toHaveBeenCalled();
    expect(processTurn).not.toHaveBeenCalled();
  });

  it("D14. caller-supplied turn ids are ignored: the turn id is always the server sequence", async () => {
    const env = await setupCall();
    const lease = await acquireRuntimeLease({ adminDb: env.mem.db }, { bindingId: env.call.bindingId, clinicId: CLINIC, ownerId: "worker-a:job-1" });
    if (!lease.ok) throw new Error(lease.code);
    const input = {
      runtimeCall: env.call,
      transcript: "Merhaba",
      lease: { proof: lease.lease, minRemainingMs: 5_000 },
      turnId: `voice:${env.call.bindingId}:99`,
      turnSeq: 99,
    } as ProcessRuntimeTranscriptInput;
    const r = await env.bridge.processRuntimeTranscript(input);
    expect(r).toMatchObject({ ok: true, turn: { turnSeq: 1, turnId: formatTurnId(env.call.bindingId, 1) } });
    expect(env.agentInputs[0].context?.messageId).toBe(formatTurnId(env.call.bindingId, 1));
  });

  it("D15. the worker runtime graph enables the fused check together with the composed capability", () => {
    const graphSrc = readFileSync(resolve(REPO, "workers/voice/src/runtimeGraph.ts"), "utf8");
    const agentSrc = readFileSync(resolve(REPO, "workers/voice/src/agent.ts"), "utf8");
    const composeSrc = readFileSync(resolve(REPO, "lib/voice/runtime/composeVoiceRuntime.ts"), "utf8");
    expect(graphSrc).toContain("controllerOptions: { verifyLeaseInTurnAllocation: true }");
    expect(agentSrc).toContain("controllerOptions: runtime.controllerOptions");
    expect(composeSrc).toContain("allocateTurnIdUnderLease: (input) => allocateTurnIdUnderLease(bindingDeps, input)");
  });

  it("D16. lease tokens never reach logs", async () => {
    const env = await setupCall();
    const logSpy = vi.spyOn(console, "log");
    const c = startController(env, { logger: (entry) => console.log(JSON.stringify(entry)) });
    await c.controller.start();
    env.mem.failTransactions(1);
    await turn(c, "Merhaba");
    await turn(c, "Merhaba");
    const token = (c.bridgeInputs[0].lease?.proof as RuntimeLeaseHandle).leaseToken;
    const logged = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().map(String).join("\n");
    expect(token).toMatch(/^vrl_/);
    expect(logged).not.toContain(token);
  });
});

/* ── C. Voice conversation-log persistence in one batch ─────────────── */

type LogDb = ReturnType<typeof createLogDb>;
let currentLogDb: LogDb | null = null;

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => currentLogDb?.db ?? null,
}));

/** Records every round trip; each one yields to the event loop so overlapping calls are visible. */
function createLogDb(seed: Record<string, Doc> = {}) {
  const docs = new Map<string, Doc>(Object.entries(structuredClone(seed)));
  const ops: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let failCommit = false;

  async function rpc<T>(kind: string, fn: () => T): Promise<T> {
    ops.push(kind);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 1));
    inFlight -= 1;
    return fn();
  }
  const merge = (path: string, data: Doc, opts?: { merge?: boolean }) =>
    docs.set(path, opts?.merge ? { ...(docs.get(path) ?? {}), ...structuredClone(data) } : structuredClone(data));
  const docRef = (path: string): any => ({
    path,
    get: () => rpc("get", () => ({ exists: docs.has(path), data: () => structuredClone(docs.get(path)) })),
    set: (data: Doc, opts?: { merge?: boolean }) => rpc("set", () => merge(path, data, opts)),
    collection: (name: string) => colRef(`${path}/${name}`),
  });
  const colRef = (path: string): any => ({
    doc: (id: string) => docRef(`${path}/${id}`),
    get: () =>
      rpc("query", () => {
        const children = [...docs.keys()].filter((k) => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes("/"));
        return {
          size: children.length,
          docs: children.map((k) => ({ id: k.slice(path.length + 1), data: () => structuredClone(docs.get(k)) })),
        };
      }),
  });
  const db = {
    collection: colRef,
    batch: () => {
      const staged: Array<() => void> = [];
      return {
        set(ref: { path: string }, data: Doc, opts?: { merge?: boolean }) {
          staged.push(() => merge(ref.path, data, opts));
        },
        commit: () =>
          rpc("commit", () => {
            if (failCommit) throw Object.assign(new Error("UNAVAILABLE"), { code: 14 });
            staged.forEach((w) => w());
          }),
      };
    },
  };
  return {
    db,
    docs,
    ops,
    maxInFlight: () => maxInFlight,
    failCommits: () => {
      failCommit = true;
    },
  };
}

const LOG = `clinics/${CLINIC}/conversationLogs/conv_1`;
const HISTORY = [
  { role: "user", content: "Merhaba" },
  { role: "assistant", content: "Size nasıl yardımcı olabilirim?" },
];

const SEEDS: Record<string, Record<string, Doc>> = {
  "new conversation": {},
  "existing transcript, collecting appointment": {
    [LOG]: { createdAt: "2026-10-09T09:00:00.000Z", status: "collecting", appointmentState: "COLLECTING_DATE", tenantId: CLINIC },
  },
  "converted conversation keeps its appointment": {
    [LOG]: {
      createdAt: "2026-10-09T09:00:00.000Z",
      status: "appointment",
      appointmentState: "APPOINTMENT_SUBMITTED",
      appointmentId: "apt_1",
      convertedToAppointment: true,
    },
  },
};

async function persistWith(
  seed: Record<string, Doc>,
  mode: "SEQUENTIAL" | "VOICE_SINGLE_BATCH" | undefined,
  overrides: Record<string, unknown> = {}
) {
  const { logConversation } = await import("@/lib/agent/persistence");
  const env = createLogDb(seed);
  currentLogDb = env;
  await logConversation({
    clinicId: CLINIC,
    convId: "conv_1",
    userMessage: "Yarın saat üçte randevu istiyorum",
    aiReply: "Hangi tedavi için randevu almak istersiniz?",
    historyLength: HISTORY.length,
    history: HISTORY,
    detectedLanguage: "tr",
    appointmentState: "COLLECTING_TREATMENT" as never,
    sourceDomain: "voice",
    ...(mode ? { persistMode: mode } : {}),
    ...overrides,
  });
  currentLogDb = null;
  return env;
}

describe("C. voice conversation-log persistence (single atomic batch)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  for (const [name, seed] of Object.entries(SEEDS)) {
    it(`C1. identical documents to the sequential path: ${name}`, async () => {
      const sequential = await persistWith(seed, "SEQUENTIAL");
      const voice = await persistWith(seed, "VOICE_SINGLE_BATCH");
      expect(Object.fromEntries(voice.docs)).toEqual(Object.fromEntries(sequential.docs));
      expect(voice.docs.get(LOG)).toMatchObject({ totalMessages: 4, conversationLocale: "tr" });
    });
  }

  it("C1b. live-support system message and multi-turn re-sync stay identical", async () => {
    const first = await persistWith({}, "SEQUENTIAL", { isLiveSupport: true });
    const seed = Object.fromEntries(first.docs);
    const nextTurn = {
      history: [...HISTORY, { role: "user", content: "Yarın saat üçte randevu istiyorum" }, { role: "assistant", content: "Hangi tedavi için randevu almak istersiniz?" }],
      userMessage: "İmplant",
      aiReply: "Not aldım.",
    };
    const sequential = await persistWith(seed, "SEQUENTIAL", nextTurn);
    const voice = await persistWith(seed, "VOICE_SINGLE_BATCH", nextTurn);
    expect(Object.fromEntries(voice.docs)).toEqual(Object.fromEntries(sequential.docs));
  });

  it("C2. two round trips (parallel reads, one commit) instead of five sequential ones", async () => {
    const sequential = await persistWith(SEEDS["existing transcript, collecting appointment"], "SEQUENTIAL");
    const voice = await persistWith(SEEDS["existing transcript, collecting appointment"], "VOICE_SINGLE_BATCH");
    expect(sequential.ops).toEqual(["get", "query", "commit", "query", "set"]);
    expect(sequential.maxInFlight()).toBe(1);
    expect([...voice.ops.slice(0, 2)].sort()).toEqual(["get", "query"]);
    expect(voice.ops).toHaveLength(3);
    expect(voice.ops[2]).toBe("commit");
    expect(voice.maxInFlight()).toBe(2);
  });

  it("C3. a failed commit writes nothing at all (state and transcript are all-or-nothing) and never throws", async () => {
    const { logConversation } = await import("@/lib/agent/persistence");
    const seed = SEEDS["existing transcript, collecting appointment"];
    const env = createLogDb(seed);
    env.failCommits();
    currentLogDb = env;
    await expect(
      logConversation({
        clinicId: CLINIC,
        convId: "conv_1",
        userMessage: "evet",
        aiReply: "Talebiniz alındı.",
        historyLength: 0,
        history: [],
        appointmentState: "AWAITING_CONFIRMATION" as never,
        persistMode: "VOICE_SINGLE_BATCH",
      })
    ).resolves.toBeUndefined();
    currentLogDb = null;
    expect(Object.fromEntries(env.docs)).toEqual(seed);
    expect(env.ops).toEqual(expect.arrayContaining(["commit"]));
    expect(env.ops).not.toContain("set");
  });

  it("C4. histories beyond the batch limit fall back to the sequential path with the same result", async () => {
    const long = Array.from({ length: 460 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `mesaj ${i}` }));
    const sequential = await persistWith({}, "SEQUENTIAL", { history: long, historyLength: long.length });
    const voice = await persistWith({}, "VOICE_SINGLE_BATCH", { history: long, historyLength: long.length });
    expect(voice.ops.slice(-5)).toEqual(["get", "query", "commit", "query", "set"]);
    expect(Object.fromEntries(voice.docs)).toEqual(Object.fromEntries(sequential.docs));
  });

  it("C5. web default (no persistMode) keeps the sequential five-step path", async () => {
    const web = await persistWith({}, undefined);
    expect(web.ops).toEqual(["get", "query", "commit", "query", "set"]);
  });

  it("C6. respondWithVisibleReply forwards persistMode; Agent Core sets it only for channel === voice", async () => {
    const { respondWithVisibleReply } = await import("@/lib/agent/persistence");
    const env = createLogDb({});
    currentLogDb = env;
    const result = await respondWithVisibleReply(
      { reply: "Merhaba" },
      { clinicId: CLINIC, convId: "conv_1", userMessage: "Selam", history: [], persistMode: "VOICE_SINGLE_BATCH" }
    );
    currentLogDb = null;
    expect(result.replyText).toBe("Merhaba");
    expect(env.ops).toHaveLength(3);

    const agentSrc = readFileSync(resolve(REPO, "lib/agent/handleClinicAgentTurn.ts"), "utf8");
    expect(agentSrc).toContain('...(channel === "voice" ? { persistMode: "VOICE_SINGLE_BATCH" as const } : {}),');
    expect(agentSrc.match(/VOICE_SINGLE_BATCH/g)).toHaveLength(1);
  });
});
