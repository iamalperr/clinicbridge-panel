/**
 * Phase 3 Step 5 — distributed runtime worker ownership lease (voiceRuntimeLeases).
 * Runs against an in-memory optimistic-concurrency Firestore fake whose snapshots carry
 * a test-controlled server read time. No real Firebase.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { Firestore } from "firebase-admin/firestore";
import { deriveCallBindingId } from "@/lib/voice/telephony/callBinding";
import {
  RUNTIME_LEASE_DEFAULT_DURATION_MS,
  RUNTIME_LEASE_RECOMMENDED_RENEW_INTERVAL_MS,
  VOICE_RUNTIME_LEASES_COLLECTION,
  acquireRuntimeLease,
  getRuntimeLease,
  hashRuntimeLeaseToken,
  releaseRuntimeLease,
  renewRuntimeLease,
  verifyRuntimeLease,
  type RuntimeLeaseDeps,
  type RuntimeLeaseFirestore,
  type RuntimeLeaseHandle,
  type RuntimeLeaseTransaction,
} from "@/lib/voice/runtime/runtimeLease";

const REPO = resolve(__dirname, "..");
const BID = deriveCallBindingId("lk:room_1:call_1")!;
const BID_OTHER = deriveCallBindingId("lk:room_2:call_2")!;
const CLINIC = "clinic_nova";
const OTHER_CLINIC = "clinic_other";
const T0 = Date.parse("2026-10-07T12:00:00.000Z");
const LEASE = RUNTIME_LEASE_DEFAULT_DURATION_MS;

/* ── In-memory optimistic-concurrency Firestore ─────────────────────── */

type Doc = Record<string, unknown>;
type Ref = { path: string };

function createLeaseDb(options: { serverTime?: boolean } = {}) {
  const docs = new Map<string, { data: Doc; version: number }>();
  const clock = { now: T0 };
  const stats = { conflictRetries: 0, commits: 0 };
  let version = 0;
  let failWith: Error | null = null;
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));

  const db: RuntimeLeaseFirestore = {
    collection: (c) => ({ doc: (id) => ({ path: `${c}/${id}` }) }),
    async runTransaction<T>(fn: (tx: RuntimeLeaseTransaction) => Promise<T>): Promise<T> {
      if (failWith) throw failWith;
      for (let attempt = 0; attempt < 5; attempt++) {
        const reads = new Map<string, number>();
        const writes: Array<() => void> = [];
        const tx: RuntimeLeaseTransaction = {
          async get(ref) {
            await tick();
            const path = (ref as Ref).path;
            const entry = docs.get(path);
            reads.set(path, entry?.version ?? 0);
            const readAt = clock.now;
            return {
              exists: entry !== undefined,
              data: () => (entry ? structuredClone(entry.data) : undefined),
              ...(options.serverTime === false ? {} : { readTime: { toMillis: () => readAt } }),
            };
          },
          create(ref, data) {
            const path = (ref as Ref).path;
            writes.push(() => {
              if (docs.has(path)) throw Object.assign(new Error("ALREADY_EXISTS"), { code: 6 });
              docs.set(path, { data: structuredClone(data), version: ++version });
            });
          },
          update(ref, data) {
            const path = (ref as Ref).path;
            writes.push(() => {
              const cur = docs.get(path);
              if (!cur) throw Object.assign(new Error("NOT_FOUND"), { code: 5 });
              docs.set(path, { data: { ...cur.data, ...structuredClone(data) }, version: ++version });
            });
          },
        };
        const out = await fn(tx);
        await tick();
        const conflict = [...reads].some(([p, v]) => (docs.get(p)?.version ?? 0) !== v);
        if (conflict) {
          stats.conflictRetries += 1;
          continue;
        }
        writes.forEach((w) => w());
        stats.commits += 1;
        return out;
      }
      throw new Error("ABORTED: too much contention");
    },
  };

  return {
    db,
    clock,
    stats,
    docs,
    raw: (bindingId = BID) => docs.get(`${VOICE_RUNTIME_LEASES_COLLECTION}/${bindingId}`)?.data,
    seed: (bindingId: string, data: Doc) =>
      docs.set(`${VOICE_RUNTIME_LEASES_COLLECTION}/${bindingId}`, { data, version: ++version }),
    failNext: (err: Error | null) => {
      failWith = err;
    },
  };
}

function setup(options?: { serverTime?: boolean }, extra: Partial<RuntimeLeaseDeps> = {}) {
  const env = createLeaseDb(options);
  const deps: RuntimeLeaseDeps = { adminDb: env.db, ...extra };
  return { ...env, deps };
}

async function acquireOk(deps: RuntimeLeaseDeps, ownerId: string, bindingId = BID, clinicId = CLINIC) {
  const r = await acquireRuntimeLease(deps, { bindingId, clinicId, ownerId });
  if (!r.ok) throw new Error(`acquire failed: ${r.code}`);
  return r;
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

/* ── ACQUIRE ────────────────────────────────────────────────────────── */

describe("acquire", () => {
  it("1. first worker acquires generation 1 with a server-time expiry", async () => {
    const { deps, raw } = setup();
    const r = await acquireOk(deps, "worker-a");
    expect(r.takeover).toBe(false);
    expect(r.lease).toMatchObject({
      bindingId: BID,
      clinicId: CLINIC,
      ownerId: "worker-a",
      generation: 1,
      expiresAt: new Date(T0 + LEASE).toISOString(),
      leaseDurationMs: LEASE,
      clockSource: "SERVER_READ_TIME",
    });
    expect(r.lease.leaseToken).toMatch(/^vrl_[A-Za-z0-9_-]{43}$/);
    expect(raw()).toMatchObject({ status: "ACTIVE", generation: 1, ownerId: "worker-a", releasedAt: null });
  });

  it("2. an active lease blocks a second worker", async () => {
    const { deps, clock } = setup();
    await acquireOk(deps, "worker-a");
    clock.now = T0 + LEASE - 1;
    expect(await acquireRuntimeLease(deps, { bindingId: BID, clinicId: CLINIC, ownerId: "worker-b" })).toEqual({
      ok: false,
      code: "RUNTIME_LEASE_HELD",
    });
  });

  it("3. the same ownerId without the token cannot reacquire an active lease", async () => {
    const { deps, raw } = setup();
    const first = await acquireOk(deps, "worker-a");
    const before = structuredClone(raw());
    expect(await acquireRuntimeLease(deps, { bindingId: BID, clinicId: CLINIC, ownerId: "worker-a" })).toEqual({
      ok: false,
      code: "RUNTIME_LEASE_HELD",
    });
    expect(raw()).toEqual(before);
    expect((await verifyRuntimeLease(deps, first.lease)).ok).toBe(true);
  });

  it("4–6. an expired lease is taken over with generation+1 and a completely new token", async () => {
    const { deps, clock, raw } = setup();
    const a = await acquireOk(deps, "worker-a");
    clock.now = T0 + LEASE;
    const b = await acquireOk(deps, "worker-b");
    expect(b.takeover).toBe(true);
    expect(b.lease.generation).toBe(2);
    expect(b.lease.leaseToken).not.toBe(a.lease.leaseToken);
    expect(raw()).toMatchObject({ ownerId: "worker-b", generation: 2, acquiredAt: new Date(T0 + LEASE).toISOString() });
  });

  it("7. the raw token is never persisted (only a binding/generation-scoped digest)", async () => {
    const { deps, raw, docs } = setup();
    const r = await acquireOk(deps, "worker-a");
    const stored = JSON.stringify([...docs.values()]);
    expect(stored).not.toContain(r.lease.leaseToken);
    expect(stored).not.toContain(r.lease.leaseToken.slice(4));
    expect(raw()?.leaseTokenHash).toBe(hashRuntimeLeaseToken(BID, 1, r.lease.leaseToken));
    expect(raw()?.leaseTokenHash).not.toBe(hashRuntimeLeaseToken(BID, 2, r.lease.leaseToken));
    expect(raw()?.leaseTokenHash).not.toBe(hashRuntimeLeaseToken(BID_OTHER, 1, r.lease.leaseToken));
    expect(Object.keys(raw()!).sort()).toEqual(
      [
        "acquiredAt",
        "bindingId",
        "clinicId",
        "clockSource",
        "expiresAt",
        "generation",
        "leaseDurationMs",
        "leaseTokenHash",
        "ownerId",
        "releasedAt",
        "renewedAt",
        "status",
      ].sort()
    );
  });

  it("8. neither the token nor its digest appears in failure results, views or logs", async () => {
    const { deps, raw } = setup();
    const a = await acquireOk(deps, "worker-a");
    const hash = String(raw()?.leaseTokenHash);
    const held = await acquireRuntimeLease(deps, { bindingId: BID, clinicId: CLINIC, ownerId: "worker-b" });
    const view = await getRuntimeLease(deps, { bindingId: BID, clinicId: CLINIC });
    const wrong = await verifyRuntimeLease(deps, { ...a.lease, ownerId: "worker-b" });
    for (const out of [held, view, wrong, ...errorSpy.mock.calls]) {
      const json = JSON.stringify(out);
      expect(json).not.toContain(a.lease.leaseToken);
      expect(json).not.toContain(hash);
      expect(json).not.toMatch(/leaseToken|leaseTokenHash/);
    }
    expect(Object.keys(held)).toEqual(["ok", "code"]);
  });

  it("validates acquire input and lease duration bounds", async () => {
    const { deps } = setup();
    for (const input of [
      { bindingId: "not-a-binding", clinicId: CLINIC, ownerId: "w" },
      { bindingId: BID, clinicId: "a/b", ownerId: "w" },
      { bindingId: BID, clinicId: CLINIC, ownerId: "" },
      { bindingId: BID, clinicId: CLINIC, ownerId: "has space" },
      { bindingId: BID, clinicId: CLINIC, ownerId: "x".repeat(129) },
      null,
    ]) {
      const r = await acquireRuntimeLease(deps, input as never);
      expect(r).toEqual({ ok: false, code: "RUNTIME_LEASE_INVALID_INPUT" });
    }
    for (const leaseDurationMs of [0, 4_999, 300_001, 1.5, Number.NaN]) {
      const r = await acquireRuntimeLease({ ...deps, leaseDurationMs }, { bindingId: BID, clinicId: CLINIC, ownerId: "w" });
      expect(r).toEqual({ ok: false, code: "RUNTIME_LEASE_INVALID_INPUT" });
    }
    const custom = await acquireRuntimeLease({ ...deps, leaseDurationMs: 60_000 }, { bindingId: BID, clinicId: CLINIC, ownerId: "w" });
    expect(custom.ok && custom.lease.expiresAt).toBe(new Date(T0 + 60_000).toISOString());
    expect(RUNTIME_LEASE_RECOMMENDED_RENEW_INTERVAL_MS * 3).toBeLessThanOrEqual(LEASE);
  });

  it("acquire input accepts no tenant/caller/room overrides", async () => {
    const { deps, raw } = setup();
    await acquireRuntimeLease(deps, {
      bindingId: BID,
      clinicId: CLINIC,
      ownerId: "worker-a",
      calledDid: "+908502428852",
      callerE164: "+905321112233",
      roomName: "room_x",
      generation: 99,
    } as never);
    const json = JSON.stringify(raw());
    expect(json).not.toMatch(/908502428852|905321112233|room_x/);
    expect(raw()?.generation).toBe(1);
  });
});

/* ── RENEW ──────────────────────────────────────────────────────────── */

describe("renew", () => {
  it("9–10. a valid owner/token renews from server time without changing generation", async () => {
    const { deps, clock, raw } = setup();
    const a = await acquireOk(deps, "worker-a");
    clock.now = T0 + 10_000;
    const r = await renewRuntimeLease(deps, a.lease);
    expect(r).toEqual({
      ok: true,
      generation: 1,
      expiresAt: new Date(T0 + 10_000 + LEASE).toISOString(),
      clockSource: "SERVER_READ_TIME",
    });
    expect(raw()).toMatchObject({ generation: 1, renewedAt: new Date(T0 + 10_000).toISOString() });
    clock.now = T0 + LEASE + 5_000;
    expect((await verifyRuntimeLease(deps, a.lease)).ok).toBe(true);
  });

  it("11. wrong owner fails", async () => {
    const { deps } = setup();
    const a = await acquireOk(deps, "worker-a");
    expect(await renewRuntimeLease(deps, { ...a.lease, ownerId: "worker-b" })).toEqual({
      ok: false,
      code: "RUNTIME_LEASE_OWNER_MISMATCH",
    });
  });

  it("12. wrong token fails", async () => {
    const { deps } = setup();
    const a = await acquireOk(deps, "worker-a");
    const forged = `vrl_${"A".repeat(43)}`;
    expect(await renewRuntimeLease(deps, { ...a.lease, leaseToken: forged })).toEqual({
      ok: false,
      code: "RUNTIME_LEASE_TOKEN_MISMATCH",
    });
    expect(await renewRuntimeLease(deps, { ...a.lease, leaseToken: "short" })).toEqual({
      ok: false,
      code: "RUNTIME_LEASE_INVALID_INPUT",
    });
  });

  it("13. a token from a previous generation fails, even when the stale owner claims the new generation", async () => {
    const { deps, clock } = setup();
    const a = await acquireOk(deps, "worker-a");
    clock.now = T0 + LEASE + 1;
    const a2 = await acquireOk(deps, "worker-a");
    expect(await renewRuntimeLease(deps, a.lease)).toEqual({ ok: false, code: "RUNTIME_LEASE_GENERATION_MISMATCH" });
    expect(await renewRuntimeLease(deps, { ...a.lease, generation: 2 })).toEqual({
      ok: false,
      code: "RUNTIME_LEASE_TOKEN_MISMATCH",
    });
    expect((await renewRuntimeLease(deps, a2.lease)).ok).toBe(true);
  });

  it("14–15. an expired lease cannot be renewed or resurrected", async () => {
    const { deps, clock, raw } = setup();
    const a = await acquireOk(deps, "worker-a");
    clock.now = T0 + LEASE;
    const before = structuredClone(raw());
    expect(await renewRuntimeLease(deps, a.lease)).toEqual({ ok: false, code: "RUNTIME_LEASE_EXPIRED" });
    expect(raw()).toEqual(before);
    expect(await verifyRuntimeLease(deps, a.lease)).toEqual({ ok: false, code: "RUNTIME_LEASE_EXPIRED" });
    expect((await acquireOk(deps, "worker-b")).lease.generation).toBe(2);
  });

  it("a released lease cannot be renewed", async () => {
    const { deps } = setup();
    const a = await acquireOk(deps, "worker-a");
    await releaseRuntimeLease(deps, a.lease);
    expect(await renewRuntimeLease(deps, a.lease)).toEqual({ ok: false, code: "RUNTIME_LEASE_NOT_FOUND" });
  });
});

/* ── VERIFY ─────────────────────────────────────────────────────────── */

describe("verify", () => {
  it("16. the current lease verifies and reports server-time remaining", async () => {
    const { deps, clock } = setup();
    const a = await acquireOk(deps, "worker-a");
    clock.now = T0 + 12_000;
    expect(await verifyRuntimeLease(deps, a.lease)).toEqual({
      ok: true,
      generation: 1,
      expiresAt: new Date(T0 + LEASE).toISOString(),
      remainingMs: LEASE - 12_000,
      clockSource: "SERVER_READ_TIME",
    });
  });

  it("minRemainingMs refuses to start a turn too close to expiry", async () => {
    const { deps, clock } = setup();
    const a = await acquireOk(deps, "worker-a");
    clock.now = T0 + LEASE - 3_000;
    expect(await verifyRuntimeLease(deps, a.lease, { minRemainingMs: 5_000 })).toEqual({
      ok: false,
      code: "RUNTIME_LEASE_EXPIRED",
    });
    expect((await verifyRuntimeLease(deps, a.lease, { minRemainingMs: 2_000 })).ok).toBe(true);
    expect(await verifyRuntimeLease(deps, a.lease, { minRemainingMs: -1 })).toEqual({
      ok: false,
      code: "RUNTIME_LEASE_INVALID_INPUT",
    });
  });

  it("17. an expired lease fails verification", async () => {
    const { deps, clock } = setup();
    const a = await acquireOk(deps, "worker-a");
    clock.now = T0 + LEASE;
    expect(await verifyRuntimeLease(deps, a.lease)).toEqual({ ok: false, code: "RUNTIME_LEASE_EXPIRED" });
  });

  it("18–19. after takeover, the old generation and the stale token both fail", async () => {
    const { deps, clock } = setup();
    const a = await acquireOk(deps, "worker-a");
    clock.now = T0 + LEASE + 1;
    const b = await acquireOk(deps, "worker-b");
    expect(await verifyRuntimeLease(deps, a.lease)).toEqual({ ok: false, code: "RUNTIME_LEASE_GENERATION_MISMATCH" });
    expect(await verifyRuntimeLease(deps, { ...a.lease, generation: 2, ownerId: "worker-b" })).toEqual({
      ok: false,
      code: "RUNTIME_LEASE_TOKEN_MISMATCH",
    });
    expect((await verifyRuntimeLease(deps, b.lease)).ok).toBe(true);
  });

  it("a released lease fails verification", async () => {
    const { deps } = setup();
    const a = await acquireOk(deps, "worker-a");
    await releaseRuntimeLease(deps, a.lease);
    expect(await verifyRuntimeLease(deps, a.lease)).toEqual({ ok: false, code: "RUNTIME_LEASE_NOT_FOUND" });
  });
});

/* ── RELEASE ────────────────────────────────────────────────────────── */

describe("release", () => {
  it("20–21. the current owner releases; another worker can then acquire immediately with generation+1", async () => {
    const { deps, raw } = setup();
    const a = await acquireOk(deps, "worker-a");
    expect(await releaseRuntimeLease(deps, a.lease)).toEqual({ ok: true, alreadyReleased: false });
    expect(raw()).toMatchObject({ status: "RELEASED", generation: 1, releasedAt: new Date(T0).toISOString() });
    const b = await acquireOk(deps, "worker-b");
    expect(b.takeover).toBe(false);
    expect(b.lease.generation).toBe(2);
  });

  it("22. a stale worker cannot release a newer lease", async () => {
    const { deps, clock, raw } = setup();
    const a = await acquireOk(deps, "worker-a");
    clock.now = T0 + LEASE + 1;
    await acquireOk(deps, "worker-b");
    const before = structuredClone(raw());
    expect(await releaseRuntimeLease(deps, a.lease)).toEqual({ ok: false, code: "RUNTIME_LEASE_GENERATION_MISMATCH" });
    expect(await releaseRuntimeLease(deps, { ...a.lease, generation: 2, ownerId: "worker-b" })).toEqual({
      ok: false,
      code: "RUNTIME_LEASE_TOKEN_MISMATCH",
    });
    expect(raw()).toEqual(before);
  });

  it("23. duplicate release is deterministic", async () => {
    const { deps, raw } = setup();
    const a = await acquireOk(deps, "worker-a");
    await releaseRuntimeLease(deps, a.lease);
    const snapshot = structuredClone(raw());
    expect(await releaseRuntimeLease(deps, a.lease)).toEqual({ ok: true, alreadyReleased: true });
    expect(await releaseRuntimeLease(deps, a.lease)).toEqual({ ok: true, alreadyReleased: true });
    expect(raw()).toEqual(snapshot);
    const b = await acquireOk(deps, "worker-b");
    expect(await releaseRuntimeLease(deps, a.lease)).toEqual({ ok: false, code: "RUNTIME_LEASE_GENERATION_MISMATCH" });
    expect((await verifyRuntimeLease(deps, b.lease)).ok).toBe(true);
  });

  it("an expired-but-not-taken-over lease can still be released by its owner", async () => {
    const { deps, clock, raw } = setup();
    const a = await acquireOk(deps, "worker-a");
    clock.now = T0 + LEASE + 10;
    expect(await releaseRuntimeLease(deps, a.lease)).toEqual({ ok: true, alreadyReleased: false });
    expect(raw()).toMatchObject({ status: "RELEASED", expiresAt: new Date(T0 + LEASE).toISOString() });
  });

  it("missing lease → NOT_FOUND", async () => {
    const { deps } = setup();
    const fake: RuntimeLeaseHandle = {
      bindingId: BID,
      clinicId: CLINIC,
      ownerId: "worker-a",
      generation: 1,
      leaseToken: `vrl_${"b".repeat(43)}`,
      expiresAt: new Date(T0).toISOString(),
      leaseDurationMs: LEASE,
      clockSource: "SERVER_READ_TIME",
    };
    for (const op of [renewRuntimeLease, verifyRuntimeLease, releaseRuntimeLease]) {
      expect(await op(deps, fake)).toEqual({ ok: false, code: "RUNTIME_LEASE_NOT_FOUND" });
    }
    expect(await getRuntimeLease(deps, { bindingId: BID, clinicId: CLINIC })).toEqual({
      ok: false,
      code: "RUNTIME_LEASE_NOT_FOUND",
    });
  });
});

/* ── TENANT ─────────────────────────────────────────────────────────── */

describe("tenant isolation", () => {
  it("24. clinic mismatch fails closed for every operation, even after expiry or release", async () => {
    const { deps, clock, raw } = setup();
    const a = await acquireOk(deps, "worker-a");
    const forged = { ...a.lease, clinicId: OTHER_CLINIC };
    for (const op of [renewRuntimeLease, verifyRuntimeLease, releaseRuntimeLease]) {
      expect(await op(deps, forged)).toEqual({ ok: false, code: "RUNTIME_LEASE_TENANT_CONFLICT" });
    }
    expect(await getRuntimeLease(deps, { bindingId: BID, clinicId: OTHER_CLINIC })).toEqual({
      ok: false,
      code: "RUNTIME_LEASE_TENANT_CONFLICT",
    });
    clock.now = T0 + LEASE + 1;
    expect(await acquireRuntimeLease(deps, { bindingId: BID, clinicId: OTHER_CLINIC, ownerId: "worker-x" })).toEqual({
      ok: false,
      code: "RUNTIME_LEASE_TENANT_CONFLICT",
    });
    await releaseRuntimeLease(deps, a.lease);
    expect(await acquireRuntimeLease(deps, { bindingId: BID, clinicId: OTHER_CLINIC, ownerId: "worker-x" })).toEqual({
      ok: false,
      code: "RUNTIME_LEASE_TENANT_CONFLICT",
    });
    expect(raw()).toMatchObject({ clinicId: CLINIC, ownerId: "worker-a" });
  });

  it("25. binding mismatch / path confusion cannot cross tenants", async () => {
    const { deps, seed } = setup();
    const a = await acquireOk(deps, "worker-a", BID, CLINIC);
    expect(await verifyRuntimeLease(deps, { ...a.lease, bindingId: BID_OTHER })).toEqual({
      ok: false,
      code: "RUNTIME_LEASE_NOT_FOUND",
    });
    const b = await acquireOk(deps, "worker-b", BID_OTHER, OTHER_CLINIC);
    expect(await verifyRuntimeLease(deps, { ...a.lease, bindingId: BID_OTHER, generation: 1 })).toEqual({
      ok: false,
      code: "RUNTIME_LEASE_TENANT_CONFLICT",
    });
    expect(await verifyRuntimeLease(deps, { ...b.lease, bindingId: BID, clinicId: CLINIC })).toEqual({
      ok: false,
      code: "RUNTIME_LEASE_OWNER_MISMATCH",
    });

    const misplaced = deriveCallBindingId("lk:room_3:call_3")!;
    seed(misplaced, { ...(await rawCopy(deps, BID)), bindingId: BID });
    for (const r of [
      await acquireRuntimeLease(deps, { bindingId: misplaced, clinicId: CLINIC, ownerId: "worker-c" }),
      await verifyRuntimeLease(deps, { ...a.lease, bindingId: misplaced }),
      await getRuntimeLease(deps, { bindingId: misplaced, clinicId: CLINIC }),
    ]) {
      expect(r).toEqual({ ok: false, code: "RUNTIME_LEASE_INVALID_STATE" });
    }
  });
});

async function rawCopy(deps: RuntimeLeaseDeps, bindingId: string): Promise<Doc> {
  let out: Doc = {};
  await deps.adminDb!.runTransaction(async (tx) => {
    const snap = await tx.get(deps.adminDb!.collection(VOICE_RUNTIME_LEASES_COLLECTION).doc(bindingId));
    out = snap.data() as Doc;
  });
  return out;
}

/* ── CONCURRENCY ────────────────────────────────────────────────────── */

describe("concurrency", () => {
  it("26. many concurrent acquire attempts produce exactly one owner", async () => {
    const { deps, raw, stats } = setup();
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => acquireRuntimeLease(deps, { bindingId: BID, clinicId: CLINIC, ownerId: `worker-${i}` }))
    );
    const winners = results.filter((r) => r.ok);
    expect(winners).toHaveLength(1);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.code === "RUNTIME_LEASE_HELD")).toBe(true);
    const winner = winners[0];
    expect(winner.ok && raw()?.ownerId).toBe(winner.ok && winner.lease.ownerId);
    expect(raw()?.generation).toBe(1);
    expect(stats.conflictRetries).toBeGreaterThan(0);
  });

  it("27. concurrent takeovers of an expired lease produce one valid generation", async () => {
    const { deps, clock, raw, stats } = setup();
    const a = await acquireOk(deps, "worker-a");
    clock.now = T0 + LEASE + 1;
    const results = await Promise.all(
      ["worker-b", "worker-c", "worker-d"].map((ownerId) => acquireRuntimeLease(deps, { bindingId: BID, clinicId: CLINIC, ownerId }))
    );
    const winners = results.filter((r) => r.ok);
    expect(winners).toHaveLength(1);
    expect(winners[0].ok && winners[0].lease.generation).toBe(2);
    expect(raw()?.generation).toBe(2);
    expect(await verifyRuntimeLease(deps, a.lease)).toEqual({ ok: false, code: "RUNTIME_LEASE_GENERATION_MISMATCH" });
    expect(stats.conflictRetries).toBeGreaterThan(0);
  });

  it("28. renew racing with takeover cannot revive the old generation", async () => {
    const { deps, clock, raw } = setup();
    const a = await acquireOk(deps, "worker-a");
    clock.now = T0 + LEASE + 1;
    const [renew, takeover] = await Promise.all([
      renewRuntimeLease(deps, a.lease),
      acquireRuntimeLease(deps, { bindingId: BID, clinicId: CLINIC, ownerId: "worker-b" }),
    ]);
    expect(renew.ok).toBe(false);
    expect(["RUNTIME_LEASE_EXPIRED", "RUNTIME_LEASE_GENERATION_MISMATCH"]).toContain(!renew.ok && renew.code);
    expect(takeover.ok && takeover.lease.generation).toBe(2);
    expect(raw()).toMatchObject({ ownerId: "worker-b", generation: 2, status: "ACTIVE" });
  });

  it("renew racing with acquire before expiry keeps the current owner", async () => {
    const { deps, clock, raw } = setup();
    const a = await acquireOk(deps, "worker-a");
    clock.now = T0 + LEASE - 100;
    const [renew, acquire] = await Promise.all([
      renewRuntimeLease(deps, a.lease),
      acquireRuntimeLease(deps, { bindingId: BID, clinicId: CLINIC, ownerId: "worker-b" }),
    ]);
    expect(renew.ok).toBe(true);
    expect(acquire).toEqual({ ok: false, code: "RUNTIME_LEASE_HELD" });
    expect(raw()).toMatchObject({ ownerId: "worker-a", generation: 1 });
  });

  it("29. stale release racing with takeover cannot delete or downgrade the new lease", async () => {
    for (let run = 0; run < 5; run++) {
      const { deps, clock, raw } = setup();
      const a = await acquireOk(deps, "worker-a");
      clock.now = T0 + LEASE + 1;
      const [release, takeover] = await Promise.all([
        releaseRuntimeLease(deps, a.lease),
        acquireRuntimeLease(deps, { bindingId: BID, clinicId: CLINIC, ownerId: "worker-b" }),
      ]);
      expect(takeover.ok && takeover.lease.generation).toBe(2);
      if (!release.ok) expect(release.code).toBe("RUNTIME_LEASE_GENERATION_MISMATCH");
      expect(raw()).toMatchObject({ ownerId: "worker-b", generation: 2, status: "ACTIVE" });
      expect(takeover.ok && (await verifyRuntimeLease(deps, takeover.lease)).ok).toBe(true);
    }
  });
});

/* ── CRITICAL STALE-WORKER FENCING ──────────────────────────────────── */

describe("critical fencing race", () => {
  it("A owns g1 → stalls → expires → B acquires g2 → A wakes: verify/renew/release all fail; B still owns g2", async () => {
    const { deps, clock, raw } = setup();
    const a = await acquireOk(deps, "worker-a");
    expect(a.lease.generation).toBe(1);

    clock.now = T0 + 9_000;
    expect((await renewRuntimeLease(deps, a.lease)).ok).toBe(true);

    clock.now = T0 + 9_000 + LEASE + 1;
    const b = await acquireOk(deps, "worker-b");
    expect(b.lease.generation).toBe(2);
    expect(b.takeover).toBe(true);

    expect(await verifyRuntimeLease(deps, a.lease)).toEqual({ ok: false, code: "RUNTIME_LEASE_GENERATION_MISMATCH" });
    expect(await renewRuntimeLease(deps, a.lease)).toEqual({ ok: false, code: "RUNTIME_LEASE_GENERATION_MISMATCH" });
    expect(await releaseRuntimeLease(deps, a.lease)).toEqual({ ok: false, code: "RUNTIME_LEASE_GENERATION_MISMATCH" });
    expect(await acquireRuntimeLease(deps, { bindingId: BID, clinicId: CLINIC, ownerId: "worker-a" })).toEqual({
      ok: false,
      code: "RUNTIME_LEASE_HELD",
    });

    expect(raw()).toMatchObject({ ownerId: "worker-b", generation: 2, status: "ACTIVE" });
    const verified = await verifyRuntimeLease(deps, b.lease);
    expect(verified.ok && verified.generation).toBe(2);
  });
});

/* ── CLOCK ──────────────────────────────────────────────────────────── */

describe("clock source", () => {
  it("server read time wins over a skewed local clock", async () => {
    const { deps, clock } = setup(undefined, { localClock: () => new Date(T0 + 3_600_000) });
    const a = await acquireOk(deps, "worker-a");
    expect(a.lease.clockSource).toBe("SERVER_READ_TIME");
    expect(a.lease.expiresAt).toBe(new Date(T0 + LEASE).toISOString());
    clock.now = T0 + 1_000;
    expect((await verifyRuntimeLease(deps, a.lease)).ok).toBe(true);
  });

  it("without server read time the operation fails closed unless a local clock is explicitly injected", async () => {
    const noClock = setup({ serverTime: false });
    expect(await acquireRuntimeLease(noClock.deps, { bindingId: BID, clinicId: CLINIC, ownerId: "w" })).toEqual({
      ok: false,
      code: "RUNTIME_LEASE_LOOKUP_FAILED",
    });
    expect(noClock.raw()).toBeUndefined();

    const local = setup({ serverTime: false }, { localClock: () => new Date(T0) });
    const r = await acquireOk(local.deps, "w");
    expect(r.lease.clockSource).toBe("LOCAL_CLOCK");
    expect(local.raw()?.clockSource).toBe("LOCAL_CLOCK");
  });

  it("a snapshot whose readTime getter throws (local document) is not treated as server time", async () => {
    const { deps } = setup();
    const db = deps.adminDb!;
    const throwing: RuntimeLeaseFirestore = {
      collection: db.collection,
      runTransaction: (fn) =>
        db.runTransaction((tx) =>
          fn({
            ...tx,
            get: async (ref) => {
              const snap = await tx.get(ref);
              return {
                exists: snap.exists,
                data: () => snap.data(),
                get readTime(): { toMillis(): number } {
                  throw new Error("Called 'readTime' on a local document");
                },
              };
            },
          })
        ),
    };
    expect(await acquireRuntimeLease({ adminDb: throwing }, { bindingId: BID, clinicId: CLINIC, ownerId: "w" })).toEqual({
      ok: false,
      code: "RUNTIME_LEASE_LOOKUP_FAILED",
    });
  });
});

/* ── FAILURE ────────────────────────────────────────────────────────── */

describe("failure handling", () => {
  const SECRET = "FirebaseError: PERMISSION_DENIED projects/prod-secret-project key=AIzaSyFAKE";

  it("30–31. Firestore errors produce stable safe codes and leak no error text or token", async () => {
    const { deps, failNext } = setup();
    const a = await acquireOk(deps, "worker-a");
    failNext(new Error(SECRET));
    const results = {
      acquire: await acquireRuntimeLease(deps, { bindingId: BID, clinicId: CLINIC, ownerId: "worker-b" }),
      renew: await renewRuntimeLease(deps, a.lease),
      release: await releaseRuntimeLease(deps, a.lease),
      verify: await verifyRuntimeLease(deps, a.lease),
      get: await getRuntimeLease(deps, { bindingId: BID, clinicId: CLINIC }),
    };
    expect(results).toEqual({
      acquire: { ok: false, code: "RUNTIME_LEASE_UPDATE_FAILED" },
      renew: { ok: false, code: "RUNTIME_LEASE_UPDATE_FAILED" },
      release: { ok: false, code: "RUNTIME_LEASE_UPDATE_FAILED" },
      verify: { ok: false, code: "RUNTIME_LEASE_LOOKUP_FAILED" },
      get: { ok: false, code: "RUNTIME_LEASE_LOOKUP_FAILED" },
    });
    expect(JSON.stringify(results)).not.toMatch(/PERMISSION|secret|AIza|Error/);
    const logs = JSON.stringify(errorSpy.mock.calls);
    expect(logs).not.toContain(a.lease.leaseToken);
    expect(logs).toContain("VOICE_RUNTIME_LEASE_");

    expect(await acquireRuntimeLease({ adminDb: null }, { bindingId: BID, clinicId: CLINIC, ownerId: "w" })).toEqual({
      ok: false,
      code: "RUNTIME_LEASE_LOOKUP_FAILED",
    });
  });

  it("32. a malformed stored lease fails closed and is never overwritten", async () => {
    const valid = (await (async () => {
      const env = setup();
      await acquireOk(env.deps, "worker-a");
      return env.raw()!;
    })()) as Doc;
    const corruptions: Doc[] = [
      { ...valid, generation: "1" },
      { ...valid, generation: 0 },
      { ...valid, status: "EXPIRED" },
      { ...valid, leaseTokenHash: "plain-token" },
      { ...valid, expiresAt: "tomorrow" },
      { ...valid, clinicId: undefined },
      { ...valid, clockSource: "WALL" },
      { bindingId: BID },
    ];
    for (const bad of corruptions) {
      const { deps, seed, raw, clock } = setup();
      seed(BID, bad);
      clock.now = T0 + 10 * LEASE;
      const before = structuredClone(raw());
      const proof = { bindingId: BID, clinicId: CLINIC, ownerId: "worker-a", generation: 1, leaseToken: `vrl_${"c".repeat(43)}` };
      for (const r of [
        await acquireRuntimeLease(deps, { bindingId: BID, clinicId: CLINIC, ownerId: "worker-b" }),
        await renewRuntimeLease(deps, proof),
        await verifyRuntimeLease(deps, proof),
        await releaseRuntimeLease(deps, proof),
        await getRuntimeLease(deps, { bindingId: BID, clinicId: CLINIC }),
      ]) {
        expect(r).toEqual({ ok: false, code: "RUNTIME_LEASE_INVALID_STATE" });
      }
      expect(raw()).toEqual(before);
    }
  });

  it("the Admin SDK Firestore type satisfies the lease boundary (compile-time)", () => {
    const accepts = (db: Firestore): RuntimeLeaseFirestore => db;
    expect(typeof accepts).toBe("function");
  });
});

/* ── BOUNDARY ───────────────────────────────────────────────────────── */

describe("module boundary", () => {
  const src = readFileSync(resolve(REPO, "lib/voice/runtime/runtimeLease.ts"), "utf8");
  const imports = [...src.matchAll(/^import\s[\s\S]*?from\s+["']([^"']+)["'];?$/gm)].map((m) => m[1]);

  it("33. no LiveKit/Verimor/speech-provider/WebSocket/Next.js dependency; Node crypto only", () => {
    expect(src).not.toMatch(
      /livekit|verimor|openai|anthropic|elevenlabs|deepgram|azure|websocket|webrtc|from ["']next|NextRequest|NextResponse|firebase-admin|process\.env|fetch\(/i
    );
    expect(imports.sort()).toEqual(["../telephony/callBinding", "crypto"]);
    expect(src).not.toMatch(/setInterval|setTimeout/);
  });

  it("34. no Agent Core, appointment, RAG or bridge logic", () => {
    expect(src).not.toMatch(
      /handleClinicAgentTurn|voiceAdapter|processVoiceTurn|appointment|treatment|rag\b|retriev|embedding|voiceRuntimeBridge|transcript|callerE164|calledDid/i
    );
  });
});
