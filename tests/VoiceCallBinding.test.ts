/**
 * Phase 3 Step 2 — external call → Phase 2 session binding + deterministic turn ids.
 * Fake transactional Firestore (optimistic concurrency, create-if-absent); no real Firebase.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { Firestore } from "firebase-admin/firestore";
import {
  CALL_BINDING_DEFAULT_INIT_LEASE_MS,
  CALL_BINDING_MAX_INIT_ATTEMPTS,
  allocateNextTurnId,
  deriveBoundSessionIds,
  deriveCallBindingId,
  endCallBinding,
  failCallBinding,
  getCallBinding,
  getOrCreateCallBinding,
  type CallBindingFirestore,
  type CallBindingTransaction,
  type GetOrCreateCallBindingDeps,
  type StartBoundSession,
  type StartBoundSessionInput,
} from "@/lib/voice/telephony/callBinding";
import { createPhase2BoundSessionStarter } from "@/lib/voice/telephony/phase2SessionStarter";
import { createInMemoryCallSessionStore, processVoiceTurn, type VoiceAdapterDeps } from "@/lib/voice";
import type { AgentTurnResult } from "@/lib/agent/types";

const REPO = resolve(__dirname, "..");
const CALL_KEY = "provider:RM_abc123XYZ";
const CLINIC = "clinic_test_a";
const DID = "+908502428852";

/* ── Fake transactional Firestore ───────────────────────────────────── */

type Write = { op: "create" | "update"; path: string; data: Record<string, unknown> };

const tick = () => new Promise<void>((r) => setImmediate(r));

function createFakeFirestore() {
  const docs = new Map<string, { data: Record<string, unknown>; version: number }>();
  const hooks: {
    failNextTransactions: number;
    shouldFailCommit?: (writes: Write[]) => boolean;
  } = { failNextTransactions: 0 };
  let transactionCalls = 0;
  let conflictRetries = 0;

  const pathOf = (ref: object) => (ref as { path: string }).path;

  const db: CallBindingFirestore = {
    collection: (collectionPath) => ({ doc: (id) => ({ path: `${collectionPath}/${id}` }) }),
    async runTransaction<T>(fn: (tx: CallBindingTransaction) => Promise<T>): Promise<T> {
      transactionCalls += 1;
      if (hooks.failNextTransactions > 0) {
        hooks.failNextTransactions -= 1;
        throw new Error("UNAVAILABLE: projects/secret-project/databases/(default) credentials=XYZ");
      }
      for (let attempt = 0; attempt < 5; attempt++) {
        const reads = new Map<string, number>();
        const writes: Write[] = [];
        const tx: CallBindingTransaction = {
          async get(ref) {
            await tick();
            const entry = docs.get(pathOf(ref));
            reads.set(pathOf(ref), entry?.version ?? 0);
            return {
              exists: Boolean(entry),
              data: () => (entry ? structuredClone(entry.data) : undefined),
            };
          },
          create(ref, data) {
            writes.push({ op: "create", path: pathOf(ref), data: structuredClone(data) });
          },
          update(ref, data) {
            writes.push({ op: "update", path: pathOf(ref), data: structuredClone(data) });
          },
        };
        const result = await fn(tx);
        await tick();
        const conflict = [...reads].some(([p, v]) => (docs.get(p)?.version ?? 0) !== v);
        if (conflict) {
          conflictRetries += 1;
          continue;
        }
        if (writes.length && hooks.shouldFailCommit?.(writes)) {
          throw new Error("DEADLINE_EXCEEDED: internal commit failure");
        }
        for (const w of writes) {
          const existing = docs.get(w.path);
          if (w.op === "create") {
            if (existing) throw new Error("ALREADY_EXISTS");
            docs.set(w.path, { data: w.data, version: 1 });
          } else {
            if (!existing) throw new Error("NOT_FOUND");
            docs.set(w.path, { data: { ...existing.data, ...w.data }, version: existing.version + 1 });
          }
        }
        return result;
      }
      throw new Error("ABORTED: contention");
    },
  };

  return {
    db,
    docs,
    hooks,
    get transactionCalls() {
      return transactionCalls;
    },
    get conflictRetries() {
      return conflictRetries;
    },
    raw: (bindingId: string) => docs.get(`voiceCalls/${bindingId}`)?.data,
    seed: (bindingId: string, data: Record<string, unknown>) =>
      docs.set(`voiceCalls/${bindingId}`, { data: structuredClone(data), version: 1 }),
  };
}

/* ── Fake idempotent session starter ────────────────────────────────── */

function createSessionStarterSpy(opts: { delayTicks?: number } = {}) {
  const sessions = new Map<string, StartBoundSessionInput>();
  const calls: StartBoundSessionInput[] = [];
  let failNext: "reject" | "throw" | null = null;
  const start: StartBoundSession = async (input) => {
    calls.push(input);
    for (let i = 0; i < (opts.delayTicks ?? 0); i++) await tick();
    if (failNext === "throw") {
      failNext = null;
      throw new Error("session store unavailable");
    }
    if (failNext === "reject") {
      failNext = null;
      return { ok: false, reason: "CLINIC_NOT_FOUND" };
    }
    if (!sessions.has(input.callSessionId)) sessions.set(input.callSessionId, input);
    return {
      ok: true,
      clinicId: input.clinicId,
      callSessionId: input.callSessionId,
      conversationId: input.conversationId,
    };
  };
  return {
    start,
    calls,
    sessions,
    failNextWith: (mode: "reject" | "throw") => {
      failNext = mode;
    },
  };
}

let clock: Date;
const now = () => clock;
const advance = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
};

function makeDeps(
  fs: ReturnType<typeof createFakeFirestore>,
  start: StartBoundSession,
  extra: Partial<GetOrCreateCallBindingDeps> = {}
): GetOrCreateCallBindingDeps {
  let owner = 0;
  return {
    adminDb: fs.db,
    startSession: start,
    now,
    generateOwnerId: () => `owner_${++owner}`,
    ...extra,
  };
}

const baseInput = { externalCallKey: CALL_KEY, clinicId: CLINIC, didE164: DID };

beforeEach(() => {
  clock = new Date("2026-10-07T09:00:00.000Z");
});

/* ── Tests ──────────────────────────────────────────────────────────── */

describe("binding ids", () => {
  it("are deterministic, path-safe and do not embed the raw key", () => {
    const id = deriveCallBindingId(CALL_KEY)!;
    expect(id).toMatch(/^vc_[0-9a-f]{32}$/);
    expect(deriveCallBindingId(CALL_KEY)).toBe(id);
    expect(deriveCallBindingId(`${CALL_KEY}x`)).not.toBe(id);
    expect(id).not.toContain("RM_abc123XYZ");
    const ids = deriveBoundSessionIds(id);
    expect(ids.callSessionId).toBe(`call_${id.slice(3)}`);
    expect(ids.conversationId).toBe(`voice_conv_${id.slice(3)}`);
  });
});

describe("getOrCreateCallBinding — idempotency", () => {
  it("1. first delivery creates one binding and one Phase 2 session", async () => {
    const fs = createFakeFirestore();
    const starter = createSessionStarterSpy();
    const result = await getOrCreateCallBinding(makeDeps(fs, starter.start), { ...baseInput, locale: "tr" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bindingId = deriveCallBindingId(CALL_KEY)!;
    expect(result.created).toBe(true);
    expect(result.binding).toMatchObject({
      bindingId,
      clinicId: CLINIC,
      didE164: DID,
      status: "ACTIVE",
      turnSeq: 0,
      ...deriveBoundSessionIds(bindingId),
    });
    expect(starter.calls).toEqual([
      { clinicId: CLINIC, locale: "tr", ...deriveBoundSessionIds(bindingId) },
    ]);
    expect(starter.sessions.size).toBe(1);
    expect(fs.docs.size).toBe(1);
  });

  it("2. duplicate delivery returns the same binding/session ids without starting a session", async () => {
    const fs = createFakeFirestore();
    const starter = createSessionStarterSpy();
    const deps = makeDeps(fs, starter.start);
    const first = await getOrCreateCallBinding(deps, baseInput);
    const second = await getOrCreateCallBinding(deps, baseInput);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.created).toBe(false);
    expect(second.binding.bindingId).toBe(first.binding.bindingId);
    expect(second.binding.callSessionId).toBe(first.binding.callSessionId);
    expect(second.binding.conversationId).toBe(first.binding.conversationId);
    expect(starter.calls).toHaveLength(1);
  });

  it("3. concurrent deliveries for the same call start exactly one session", async () => {
    const fs = createFakeFirestore();
    const starter = createSessionStarterSpy({ delayTicks: 5 });
    const deps = makeDeps(fs, starter.start);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => getOrCreateCallBinding(deps, baseInput))
    );

    const created = results.filter((r) => r.ok && r.created);
    expect(created).toHaveLength(1);
    expect(fs.conflictRetries).toBeGreaterThan(0);
    expect(results.some((r) => !r.ok && r.code === "CALL_BINDING_INITIALIZING")).toBe(true);
    for (const r of results) {
      if (r.ok) {
        expect(r.binding.callSessionId).toBe(created[0].ok && created[0].binding.callSessionId);
      } else {
        expect(r.code).toBe("CALL_BINDING_INITIALIZING");
      }
    }
    expect(starter.calls).toHaveLength(1);
    expect(starter.sessions.size).toBe(1);
    expect(fs.docs.size).toBe(1);

    const later = await getOrCreateCallBinding(deps, baseInput);
    expect(later).toMatchObject({ ok: true, created: false });
    expect(starter.calls).toHaveLength(1);
  });

  it("4. existing binding + different clinicId fails closed", async () => {
    const fs = createFakeFirestore();
    const starter = createSessionStarterSpy();
    const deps = makeDeps(fs, starter.start);
    await getOrCreateCallBinding(deps, baseInput);
    const before = fs.raw(deriveCallBindingId(CALL_KEY)!);

    const result = await getOrCreateCallBinding(deps, { ...baseInput, clinicId: "clinic_test_b" });
    expect(result).toEqual({
      ok: false,
      code: "CALL_BINDING_TENANT_CONFLICT",
      bindingId: deriveCallBindingId(CALL_KEY),
    });
    expect(fs.raw(deriveCallBindingId(CALL_KEY)!)).toEqual(before);
    expect(starter.calls).toHaveLength(1);
  });

  it("5. existing binding + different didE164 fails closed", async () => {
    const fs = createFakeFirestore();
    const starter = createSessionStarterSpy();
    const deps = makeDeps(fs, starter.start);
    await getOrCreateCallBinding(deps, baseInput);
    const result = await getOrCreateCallBinding(deps, { ...baseInput, didE164: "+902120000000" });
    expect(result).toMatchObject({ ok: false, code: "CALL_BINDING_TENANT_CONFLICT" });
    expect(starter.calls).toHaveLength(1);
  });
});

describe("lifecycle", () => {
  async function activeBinding() {
    const fs = createFakeFirestore();
    const starter = createSessionStarterSpy();
    const deps = makeDeps(fs, starter.start);
    const r = await getOrCreateCallBinding(deps, baseInput);
    if (!r.ok) throw new Error("setup failed");
    return { fs, starter, deps, bindingId: r.binding.bindingId };
  }

  it("6. ended binding cannot allocate a turn or be re-bound", async () => {
    const { deps, starter, bindingId } = await activeBinding();
    const ended = await endCallBinding(deps, { bindingId, clinicId: CLINIC, reason: "completed" });
    expect(ended).toMatchObject({ ok: true, binding: { status: "ENDED", endReason: "completed" } });

    expect(await allocateNextTurnId(deps, { bindingId, clinicId: CLINIC })).toEqual({
      ok: false,
      code: "CALL_BINDING_ENDED",
      bindingId,
    });
    expect(await getOrCreateCallBinding(deps, baseInput)).toMatchObject({ ok: false, code: "CALL_BINDING_ENDED" });
    expect(starter.calls).toHaveLength(1);

    const again = await endCallBinding(deps, { bindingId, clinicId: CLINIC, reason: "abandoned" });
    expect(again).toMatchObject({ ok: true, binding: { status: "ENDED", endReason: "completed" } });
  });

  it("7. FAILED is terminal: no turns, no re-binding, no new session; end/fail are no-ops", async () => {
    const { deps, starter, bindingId } = await activeBinding();
    const failed = await failCallBinding(deps, { bindingId, clinicId: CLINIC, failureCode: "STT_UNAVAILABLE" });
    expect(failed).toMatchObject({ ok: true, binding: { status: "FAILED", failureCode: "STT_UNAVAILABLE" } });

    expect(await allocateNextTurnId(deps, { bindingId, clinicId: CLINIC })).toMatchObject({
      ok: false,
      code: "CALL_BINDING_FAILED",
    });
    expect(await getOrCreateCallBinding(deps, baseInput)).toMatchObject({ ok: false, code: "CALL_BINDING_FAILED" });
    expect(await endCallBinding(deps, { bindingId, clinicId: CLINIC, reason: "completed" })).toMatchObject({
      ok: true,
      binding: { status: "FAILED", failureCode: "STT_UNAVAILABLE" },
    });
    expect(
      await failCallBinding(deps, { bindingId, clinicId: CLINIC, failureCode: "OTHER" })
    ).toMatchObject({ ok: true, binding: { failureCode: "STT_UNAVAILABLE" } });
    expect(starter.calls).toHaveLength(1);
  });

  it("end/fail/allocate with a different clinicId fail closed", async () => {
    const { deps, bindingId } = await activeBinding();
    for (const r of [
      await allocateNextTurnId(deps, { bindingId, clinicId: "clinic_test_b" }),
      await endCallBinding(deps, { bindingId, clinicId: "clinic_test_b", reason: "completed" }),
      await failCallBinding(deps, { bindingId, clinicId: "clinic_test_b", failureCode: "X" }),
    ]) {
      expect(r).toMatchObject({ ok: false, code: "CALL_BINDING_TENANT_CONFLICT" });
    }
    expect(await getCallBinding(deps, { bindingId })).toMatchObject({ ok: true, binding: { status: "ACTIVE" } });
  });

  it("missing binding → CALL_BINDING_NOT_FOUND", async () => {
    const fs = createFakeFirestore();
    const deps = makeDeps(fs, createSessionStarterSpy().start);
    const bindingId = deriveCallBindingId("provider:unknown")!;
    expect(await getCallBinding(deps, { bindingId })).toEqual({ ok: false, code: "CALL_BINDING_NOT_FOUND", bindingId });
    expect(await allocateNextTurnId(deps, { bindingId, clinicId: CLINIC })).toMatchObject({
      code: "CALL_BINDING_NOT_FOUND",
    });
  });
});

describe("turn ids", () => {
  it("8. are monotonic voice:<bindingId>:1, :2, :3", async () => {
    const fs = createFakeFirestore();
    const deps = makeDeps(fs, createSessionStarterSpy().start);
    const r = await getOrCreateCallBinding(deps, baseInput);
    if (!r.ok) throw new Error("setup failed");
    const { bindingId } = r.binding;

    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const t = await allocateNextTurnId(deps, { bindingId, clinicId: CLINIC });
      if (!t.ok) throw new Error(t.code);
      ids.push(t.turnId);
    }
    expect(ids).toEqual([`voice:${bindingId}:1`, `voice:${bindingId}:2`, `voice:${bindingId}:3`]);
    for (const id of ids) expect(id).toMatch(/^voice:vc_[0-9a-f]{32}:\d+$/);
    expect(await getCallBinding(deps, { bindingId })).toMatchObject({ ok: true, binding: { turnSeq: 3 } });
  });

  it("9. concurrent allocation never returns the same sequence", async () => {
    const fs = createFakeFirestore();
    const deps = makeDeps(fs, createSessionStarterSpy().start);
    const r = await getOrCreateCallBinding(deps, baseInput);
    if (!r.ok) throw new Error("setup failed");
    const { bindingId } = r.binding;

    const results = await Promise.all(
      Array.from({ length: 4 }, () => allocateNextTurnId(deps, { bindingId, clinicId: CLINIC }))
    );
    expect(fs.conflictRetries).toBeGreaterThan(0);
    const seqs = results.map((t) => (t.ok ? t.turnSeq : -1));
    expect(seqs.every((s) => s > 0)).toBe(true);
    expect(new Set(seqs).size).toBe(seqs.length);
    expect([...seqs].sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it("allocation before activation → CALL_BINDING_INITIALIZING", async () => {
    const fs = createFakeFirestore();
    const bindingId = deriveCallBindingId(CALL_KEY)!;
    fs.seed(bindingId, initializingDoc(bindingId, { initOwner: "dead", initLeaseExpiresAt: clock.toISOString() }));
    const deps = makeDeps(fs, createSessionStarterSpy().start);
    expect(await allocateNextTurnId(deps, { bindingId, clinicId: CLINIC })).toMatchObject({
      code: "CALL_BINDING_INITIALIZING",
    });
  });
});

describe("input validation and failures", () => {
  it.each([
    [""],
    ["has space"],
    ["x".repeat(257)],
    ["ключ"],
    ["line\nbreak"],
    ["tab\tkey"],
  ])("10. rejects malformed external call key %j without Firestore access", async (key) => {
    const fs = createFakeFirestore();
    const starter = createSessionStarterSpy();
    const result = await getOrCreateCallBinding(makeDeps(fs, starter.start), { ...baseInput, externalCallKey: key });
    expect(result).toEqual({ ok: false, code: "CALL_BINDING_INVALID_INPUT" });
    expect(fs.transactionCalls).toBe(0);
    expect(starter.calls).toHaveLength(0);
  });

  it("accepts a 256-char key and rejects non-string keys", async () => {
    const fs = createFakeFirestore();
    const deps = makeDeps(fs, createSessionStarterSpy().start);
    expect(await getOrCreateCallBinding(deps, { ...baseInput, externalCallKey: "k".repeat(256) })).toMatchObject({
      ok: true,
    });
    expect(
      await getOrCreateCallBinding(deps, { ...baseInput, externalCallKey: 42 as unknown as string })
    ).toEqual({ ok: false, code: "CALL_BINDING_INVALID_INPUT" });
  });

  it.each([
    [{ clinicId: "" }],
    [{ clinicId: "a/b" }],
    [{ clinicId: " padded " }],
    [{ didE164: "08502428852" }],
    [{ didE164: "" }],
    [{ locale: "turkish" }],
  ])("rejects invalid binding input %j", async (override) => {
    const fs = createFakeFirestore();
    const result = await getOrCreateCallBinding(makeDeps(fs, createSessionStarterSpy().start), {
      ...baseInput,
      ...override,
    });
    expect(result).toEqual({ ok: false, code: "CALL_BINDING_INVALID_INPUT" });
    expect(fs.transactionCalls).toBe(0);
  });

  it("rejects malformed binding ids / failure codes / end reasons", async () => {
    const fs = createFakeFirestore();
    const deps = makeDeps(fs, createSessionStarterSpy().start);
    const valid = deriveCallBindingId(CALL_KEY)!;
    expect(await getCallBinding(deps, { bindingId: "../clinics/x" })).toEqual({ ok: false, code: "CALL_BINDING_INVALID_INPUT" });
    expect(await allocateNextTurnId(deps, { bindingId: "vc_XYZ", clinicId: CLINIC })).toMatchObject({
      code: "CALL_BINDING_INVALID_INPUT",
    });
    expect(
      await failCallBinding(deps, { bindingId: valid, clinicId: CLINIC, failureCode: "free text with spaces" })
    ).toMatchObject({ code: "CALL_BINDING_INVALID_INPUT" });
    expect(
      await endCallBinding(deps, { bindingId: valid, clinicId: CLINIC, reason: "failed" as unknown as "completed" })
    ).toMatchObject({ code: "CALL_BINDING_INVALID_INPUT" });
    expect(fs.transactionCalls).toBe(0);
  });

  it("11. Firestore failures return stable codes without leaking internals", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const fs = createFakeFirestore();
      const starter = createSessionStarterSpy();
      const deps = makeDeps(fs, starter.start);
      const bindingId = deriveCallBindingId(CALL_KEY)!;

      fs.hooks.failNextTransactions = 1;
      const claimFail = await getOrCreateCallBinding(deps, baseInput);
      expect(claimFail).toEqual({ ok: false, code: "CALL_BINDING_CREATE_FAILED", bindingId });
      expect(JSON.stringify(claimFail)).not.toMatch(/secret|credentials|UNAVAILABLE/);
      expect(starter.calls).toHaveLength(0);

      expect(await getOrCreateCallBinding(deps, baseInput)).toMatchObject({ ok: true });

      fs.hooks.failNextTransactions = 1;
      expect(await allocateNextTurnId(deps, { bindingId, clinicId: CLINIC })).toEqual({
        ok: false,
        code: "CALL_BINDING_UPDATE_FAILED",
        bindingId,
      });
      fs.hooks.failNextTransactions = 1;
      expect(await getCallBinding(deps, { bindingId })).toEqual({
        ok: false,
        code: "CALL_BINDING_LOOKUP_FAILED",
        bindingId,
      });
      fs.hooks.failNextTransactions = 1;
      expect(await endCallBinding(deps, { bindingId, clinicId: CLINIC, reason: "completed" })).toMatchObject({
        code: "CALL_BINDING_UPDATE_FAILED",
      });

      expect(
        await getOrCreateCallBinding({ ...deps, adminDb: null }, baseInput)
      ).toEqual({ ok: false, code: "CALL_BINDING_LOOKUP_FAILED", bindingId });

      for (const call of errSpy.mock.calls) {
        expect(String(call[0])).not.toContain(CALL_KEY);
      }
    } finally {
      errSpy.mockRestore();
    }
  });

  it("corrupt stored binding fails closed with CALL_BINDING_LOOKUP_FAILED", async () => {
    const fs = createFakeFirestore();
    const starter = createSessionStarterSpy();
    const bindingId = deriveCallBindingId(CALL_KEY)!;
    fs.seed(bindingId, { clinicId: CLINIC, status: "ACTIVE" });
    const deps = makeDeps(fs, starter.start);
    expect(await getOrCreateCallBinding(deps, baseInput)).toMatchObject({ code: "CALL_BINDING_LOOKUP_FAILED" });
    expect(await allocateNextTurnId(deps, { bindingId, clinicId: CLINIC })).toMatchObject({
      code: "CALL_BINDING_LOOKUP_FAILED",
    });
    expect(starter.calls).toHaveLength(0);
  });

  it("enforces the per-call turn limit", async () => {
    const fs = createFakeFirestore();
    const bindingId = deriveCallBindingId(CALL_KEY)!;
    fs.seed(bindingId, { ...initializingDoc(bindingId), status: "ACTIVE", turnSeq: 500 });
    const deps = makeDeps(fs, createSessionStarterSpy().start);
    expect(await allocateNextTurnId(deps, { bindingId, clinicId: CLINIC })).toMatchObject({
      code: "CALL_BINDING_TURN_LIMIT",
    });
  });

  it("12. stored binding contains only the minimal schema (no transcript/audio/caller/raw key)", async () => {
    const fs = createFakeFirestore();
    const deps = makeDeps(fs, createSessionStarterSpy().start);
    const r = await getOrCreateCallBinding(deps, baseInput);
    if (!r.ok) throw new Error("setup failed");
    await allocateNextTurnId(deps, { bindingId: r.binding.bindingId, clinicId: CLINIC });
    await endCallBinding(deps, { bindingId: r.binding.bindingId, clinicId: CLINIC, reason: "completed" });

    const stored = fs.raw(r.binding.bindingId)!;
    expect(Object.keys(stored).sort()).toEqual(
      [
        "bindingId",
        "callSessionId",
        "clinicId",
        "conversationId",
        "didE164",
        "endReason",
        "endedAt",
        "failureCode",
        "initAttempts",
        "initLeaseExpiresAt",
        "initOwner",
        "startedAt",
        "status",
        "turnSeq",
        "updatedAt",
      ].sort()
    );
    expect(JSON.stringify(stored)).not.toContain("RM_abc123XYZ");
    expect(JSON.stringify(stored)).not.toMatch(/transcript|audio|text|caller|patient/i);
  });
});

function initializingDoc(bindingId: string, overrides: Record<string, unknown> = {}) {
  const iso = clock.toISOString();
  return {
    bindingId,
    clinicId: CLINIC,
    didE164: DID,
    ...deriveBoundSessionIds(bindingId),
    status: "INITIALIZING",
    turnSeq: 0,
    initAttempts: 1,
    initOwner: null,
    initLeaseExpiresAt: null,
    startedAt: iso,
    updatedAt: iso,
    endedAt: null,
    endReason: null,
    failureCode: null,
    ...overrides,
  };
}

describe("partial failure and recovery", () => {
  it("claim succeeds, session start fails → INITIALIZING with lease released; retry recovers", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const fs = createFakeFirestore();
      const starter = createSessionStarterSpy();
      const deps = makeDeps(fs, starter.start);
      const bindingId = deriveCallBindingId(CALL_KEY)!;

      starter.failNextWith("reject");
      expect(await getOrCreateCallBinding(deps, baseInput)).toEqual({
        ok: false,
        code: "CALL_BINDING_SESSION_START_FAILED",
        bindingId,
      });
      expect(fs.raw(bindingId)).toMatchObject({ status: "INITIALIZING", initOwner: null, initAttempts: 1 });

      starter.failNextWith("throw");
      expect(await getOrCreateCallBinding(deps, baseInput)).toMatchObject({
        code: "CALL_BINDING_SESSION_START_FAILED",
      });

      const retry = await getOrCreateCallBinding(deps, baseInput);
      expect(retry).toMatchObject({ ok: true, created: false, binding: { status: "ACTIVE" } });
      expect(new Set(starter.calls.map((c) => c.callSessionId)).size).toBe(1);
      expect(starter.sessions.size).toBe(1);
      expect(fs.raw(bindingId)).toMatchObject({ initAttempts: 3, initOwner: null });
    } finally {
      errSpy.mockRestore();
    }
  });

  it("process crash between claim and activation: lease blocks until expiry, then resume", async () => {
    const fs = createFakeFirestore();
    const starter = createSessionStarterSpy();
    const deps = makeDeps(fs, starter.start);
    const bindingId = deriveCallBindingId(CALL_KEY)!;
    fs.seed(
      bindingId,
      initializingDoc(bindingId, {
        initOwner: "crashed_worker",
        initLeaseExpiresAt: new Date(clock.getTime() + CALL_BINDING_DEFAULT_INIT_LEASE_MS).toISOString(),
      })
    );

    expect(await getOrCreateCallBinding(deps, baseInput)).toMatchObject({ code: "CALL_BINDING_INITIALIZING" });
    expect(starter.calls).toHaveLength(0);

    advance(CALL_BINDING_DEFAULT_INIT_LEASE_MS + 1);
    const resumed = await getOrCreateCallBinding(deps, baseInput);
    expect(resumed).toMatchObject({
      ok: true,
      created: false,
      binding: { status: "ACTIVE", ...deriveBoundSessionIds(bindingId) },
    });
    expect(starter.calls).toHaveLength(1);
    expect(fs.raw(bindingId)).toMatchObject({ initAttempts: 2 });
  });

  it("crash after Phase 2 session creation: retry reuses the existing session (no second create)", async () => {
    const fs = createFakeFirestore();
    const bindingId = deriveCallBindingId(CALL_KEY)!;
    const ids = deriveBoundSessionIds(bindingId);
    const store = createInMemoryCallSessionStore();
    await store.create({
      ...ids,
      clinicId: CLINIC,
      channel: "voice",
      status: "STARTED",
      startedAt: clock.toISOString(),
      lastActivityAt: clock.toISOString(),
      processedTurnIds: [],
      turnResultCache: {},
    });
    const createSpy = vi.spyOn(store, "create");
    fs.seed(bindingId, initializingDoc(bindingId, { initOwner: "crashed", initLeaseExpiresAt: clock.toISOString() }));

    const starter = createPhase2BoundSessionStarter({ sessionStore: store, adminDb: null, now });
    const result = await getOrCreateCallBinding(makeDeps(fs, starter), baseInput);
    expect(result).toMatchObject({ ok: true, binding: { status: "ACTIVE", ...ids } });
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("activation write fails after the session was created: retry activates without a new session", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const fs = createFakeFirestore();
      const store = createInMemoryCallSessionStore();
      const createSpy = vi.spyOn(store, "create");
      const starter = createPhase2BoundSessionStarter({ sessionStore: store, adminDb: null, now });
      const deps = makeDeps(fs, starter);
      const bindingId = deriveCallBindingId(CALL_KEY)!;

      let failActivation = true;
      fs.hooks.shouldFailCommit = (writes) => {
        const hit = failActivation && writes.some((w) => w.data.status === "ACTIVE");
        if (hit) failActivation = false;
        return hit;
      };

      expect(await getOrCreateCallBinding(deps, baseInput)).toEqual({
        ok: false,
        code: "CALL_BINDING_UPDATE_FAILED",
        bindingId,
      });
      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(fs.raw(bindingId)).toMatchObject({ status: "INITIALIZING" });

      expect(await getOrCreateCallBinding(deps, baseInput)).toMatchObject({ code: "CALL_BINDING_INITIALIZING" });
      advance(CALL_BINDING_DEFAULT_INIT_LEASE_MS + 1);
      expect(await getOrCreateCallBinding(deps, baseInput)).toMatchObject({
        ok: true,
        binding: { status: "ACTIVE" },
      });
      expect(createSpy).toHaveBeenCalledTimes(1);
    } finally {
      errSpy.mockRestore();
    }
  });

  it(`after ${CALL_BINDING_MAX_INIT_ATTEMPTS} failed initializations the binding becomes FAILED deterministically`, async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const fs = createFakeFirestore();
      const starter = createSessionStarterSpy();
      const deps = makeDeps(fs, starter.start);
      for (let i = 0; i < CALL_BINDING_MAX_INIT_ATTEMPTS; i++) {
        starter.failNextWith("reject");
        expect(await getOrCreateCallBinding(deps, baseInput)).toMatchObject({
          code: "CALL_BINDING_SESSION_START_FAILED",
        });
      }
      expect(await getOrCreateCallBinding(deps, baseInput)).toMatchObject({ code: "CALL_BINDING_FAILED" });
      expect(fs.raw(deriveCallBindingId(CALL_KEY)!)).toMatchObject({
        status: "FAILED",
        failureCode: "INIT_ATTEMPTS_EXHAUSTED",
      });
      expect(starter.calls).toHaveLength(CALL_BINDING_MAX_INIT_ATTEMPTS);
    } finally {
      errSpy.mockRestore();
    }
  });
});

describe("Phase 2 integration (real startCallSession + processVoiceTurn, in-memory store)", () => {
  it("binds to a real Phase 2 session and allocated turn ids drive idempotent turns", async () => {
    const fs = createFakeFirestore();
    const store = createInMemoryCallSessionStore();
    const createSpy = vi.spyOn(store, "create");
    const starter = createPhase2BoundSessionStarter({ sessionStore: store, adminDb: null, now });
    const deps = makeDeps(fs, starter);

    const r = await getOrCreateCallBinding(deps, { ...baseInput, locale: "tr" });
    if (!r.ok) throw new Error(r.code);
    const session = await store.get(r.binding.callSessionId);
    expect(session).toMatchObject({
      callSessionId: r.binding.callSessionId,
      conversationId: r.binding.conversationId,
      clinicId: CLINIC,
      status: "STARTED",
      locale: "tr",
    });
    expect(session?.callerE164).toBeUndefined();

    expect(await getOrCreateCallBinding(deps, baseInput)).toMatchObject({ ok: true, created: false });
    expect(createSpy).toHaveBeenCalledTimes(1);

    let agentCalls = 0;
    const voiceDeps: VoiceAdapterDeps = {
      sessionStore: store,
      adminDb: null,
      loadHistory: async () => [],
      runAgentTurn: async (params) => {
        agentCalls += 1;
        return {
          replyText: "Merhaba",
          conversationId: params.input.conversationId,
          payload: { reply: "Merhaba" },
        } satisfies AgentTurnResult;
      },
    };
    const turn = await allocateNextTurnId(deps, { bindingId: r.binding.bindingId, clinicId: CLINIC });
    if (!turn.ok) throw new Error(turn.code);

    const first = await processVoiceTurn(voiceDeps, {
      callSessionId: r.binding.callSessionId,
      text: "merhaba",
      turnId: turn.turnId,
    });
    const replay = await processVoiceTurn(voiceDeps, {
      callSessionId: r.binding.callSessionId,
      text: "merhaba",
      turnId: turn.turnId,
    });
    expect(first).toMatchObject({ ok: true, replyText: "Merhaba" });
    expect(replay).toMatchObject({ ok: true, idempotentReplay: true });
    expect(agentCalls).toBe(1);
  });

  it("starter refuses an existing session with a different identity", async () => {
    const store = createInMemoryCallSessionStore();
    const bindingId = deriveCallBindingId(CALL_KEY)!;
    const ids = deriveBoundSessionIds(bindingId);
    await store.create({
      ...ids,
      clinicId: "clinic_test_b",
      channel: "voice",
      status: "STARTED",
      startedAt: clock.toISOString(),
      lastActivityAt: clock.toISOString(),
      processedTurnIds: [],
    });
    const starter = createPhase2BoundSessionStarter({ sessionStore: store, adminDb: null });
    expect(await starter({ clinicId: CLINIC, ...ids })).toEqual({ ok: false, reason: "SESSION_IDENTITY_MISMATCH" });
  });
});

describe("compile-time and module boundaries", () => {
  it("firebase-admin Firestore satisfies the injected boundary", () => {
    const toBoundary = (db: Firestore): CallBindingFirestore => db;
    expect(typeof toBoundary).toBe("function");
  });

  const bindingSrc = readFileSync(resolve(REPO, "lib/voice/telephony/callBinding.ts"), "utf8");
  const starterSrc = readFileSync(resolve(REPO, "lib/voice/telephony/phase2SessionStarter.ts"), "utf8");
  const PROVIDER_RE =
    /livekit|verimor|websocket|deepgram|elevenlabs|twilio|speechToText|textToSpeech|\bSTT\b|\bTTS\b|from ["']next|NextRequest|NextResponse/i;

  it("callBinding.ts has no provider / realtime / Next.js references", () => {
    expect(bindingSrc).not.toMatch(PROVIDER_RE);
    expect(starterSrc).not.toMatch(PROVIDER_RE);
  });

  it("callBinding.ts has no appointment, RAG or Agent Core logic and imports only node crypto", () => {
    expect(bindingSrc).not.toMatch(/appointment|hybridSearch|retrieval|embedding|handleClinicAgentTurn|aiGateway|openai|prompt/i);
    const imports = [...bindingSrc.matchAll(/^import\s.*from\s+["']([^"']+)["'];?$/gm)].map((m) => m[1]);
    expect(imports).toEqual(["crypto"]);
  });

  it("phase2SessionStarter.ts only bridges to the Phase 2 adapter", () => {
    const imports = [...starterSrc.matchAll(/^import\s.*from\s+["']([^"']+)["'];?$/gm)].map((m) => m[1]);
    expect(imports.sort()).toEqual(["../callSessionStore", "../types", "../voiceAdapter", "./callBinding"].sort());
    expect(starterSrc).not.toMatch(/appointment|hybridSearch|retrieval|embedding|aiGateway|openai/i);
  });
});
