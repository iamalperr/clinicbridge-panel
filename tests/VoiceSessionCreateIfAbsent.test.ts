/**
 * Phase 3 Step 2.5 — Phase 2 Firestore session creation is create-if-absent.
 * Fake Admin-SDK-like Firestore: native create() fails with gRPC code 6 when the doc
 * exists and, like the real SDK, rejects `undefined` values.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_ALREADY_EXISTS,
  createFirestoreCallSessionStore,
  createInMemoryCallSessionStore,
  isFirestoreAlreadyExistsError,
  isSessionAlreadyExistsError,
  type CallSessionStore,
} from "@/lib/voice/callSessionStore";
import { processVoiceTurn, startCallSession } from "@/lib/voice/voiceAdapter";
import type { CallSession } from "@/lib/voice/types";
import {
  CALL_BINDING_DEFAULT_INIT_LEASE_MS,
  allocateNextTurnId,
  deriveBoundSessionIds,
  deriveCallBindingId,
  getOrCreateCallBinding,
  type CallBindingFirestore,
  type CallBindingTransaction,
} from "@/lib/voice/telephony/callBinding";
import { createPhase2BoundSessionStarter } from "@/lib/voice/telephony/phase2SessionStarter";

const CLINIC = "clinic_test_a";
const DID = "+908502428852";
const CALL_KEY = "provider:RM_race_1";
const BINDING_ID = deriveCallBindingId(CALL_KEY)!;
const IDS = deriveBoundSessionIds(BINDING_ID);
const SESSION_PATH = `voiceCallSessions/${IDS.callSessionId}`;
const CONV_PATH = `clinics/${CLINIC}/conversationLogs/${IDS.conversationId}`;

/* ── Fake Admin SDK Firestore ───────────────────────────────────────── */

function assertNoUndefined(value: unknown, path = ""): void {
  if (value === undefined) {
    throw new Error(`Cannot use "undefined" as a Firestore value (found in field "${path}")`);
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) assertNoUndefined(v, path ? `${path}.${k}` : k);
  }
}

function grpcError(code: number, message: string) {
  return Object.assign(new Error(`${code} ${message}`), { code });
}

function createFakeAdminDb() {
  const docs = new Map<string, Record<string, unknown>>();
  const hooks: {
    beforeCreate?: (path: string) => Promise<void> | void;
    failCreate?: (path: string) => Error | undefined;
  } = {};

  const readDoc = (path: string) => {
    const d = docs.get(path);
    return { exists: Boolean(d), data: () => (d ? structuredClone(d) : undefined) };
  };

  const docRef = (path: string) => ({
    path,
    collection: (name: string) => collRef(`${path}/${name}`),
    async get() {
      return readDoc(path);
    },
    async create(data: Record<string, unknown>) {
      await hooks.beforeCreate?.(path);
      const injected = hooks.failCreate?.(path);
      if (injected) throw injected;
      assertNoUndefined(data);
      if (docs.has(path)) throw grpcError(6, `ALREADY_EXISTS: Document already exists: ${path}`);
      docs.set(path, structuredClone(data));
    },
    async set(data: Record<string, unknown>, opts?: { merge?: boolean }) {
      assertNoUndefined(data);
      docs.set(path, opts?.merge ? { ...(docs.get(path) || {}), ...structuredClone(data) } : structuredClone(data));
    },
  });
  const collRef = (path: string) => ({ doc: (id: string) => docRef(`${path}/${id}`) });

  let chain: Promise<unknown> = Promise.resolve();
  const db = {
    collection: (name: string) => collRef(name),
    runTransaction<T>(fn: (tx: CallBindingTransaction) => Promise<T>): Promise<T> {
      const run = chain.then(async () => {
        const writes: Array<() => void> = [];
        const pathOf = (ref: object) => (ref as { path: string }).path;
        const tx: CallBindingTransaction = {
          async get(ref) {
            return readDoc(pathOf(ref));
          },
          create(ref, data) {
            writes.push(() => {
              if (docs.has(pathOf(ref))) throw grpcError(6, "ALREADY_EXISTS");
              docs.set(pathOf(ref), structuredClone(data));
            });
          },
          update(ref, data) {
            writes.push(() => {
              const existing = docs.get(pathOf(ref));
              if (!existing) throw grpcError(5, "NOT_FOUND");
              docs.set(pathOf(ref), { ...existing, ...structuredClone(data) });
            });
          },
        };
        const result = await fn(tx);
        writes.forEach((w) => w());
        return result;
      });
      chain = run.catch(() => undefined);
      return run;
    },
  };
  return { db: db as typeof db & CallBindingFirestore, docs, hooks };
}

let clock: Date;
const now = () => clock;

function sessionFixture(overrides: Partial<CallSession> = {}): CallSession {
  return {
    ...IDS,
    clinicId: CLINIC,
    channel: "voice",
    status: "STARTED",
    startedAt: clock.toISOString(),
    lastActivityAt: clock.toISOString(),
    processedTurnIds: [],
    turnResultCache: {},
    ...overrides,
  };
}

const TURN_ID = `voice:${BINDING_ID}:1`;
const progressedPatch = (iso: string): Partial<CallSession> => ({
  status: "ACTIVE",
  lastActivityAt: iso,
  processedTurnIds: [TURN_ID],
  turnResultCache: {
    [TURN_ID]: {
      ok: true,
      callSessionId: IDS.callSessionId,
      conversationId: IDS.conversationId,
      clinicId: CLINIC,
      channel: "voice",
      replyText: "Merhaba, size nasıl yardımcı olabilirim?",
    },
  },
});

beforeEach(() => {
  clock = new Date("2026-10-07T09:00:00.000Z");
});

/* ── Tests ──────────────────────────────────────────────────────────── */

describe("already-exists detection", () => {
  it("recognizes native Firestore already-exists codes only", () => {
    expect(isFirestoreAlreadyExistsError(grpcError(6, "ALREADY_EXISTS"))).toBe(true);
    expect(isFirestoreAlreadyExistsError({ code: "already-exists" })).toBe(true);
    expect(isFirestoreAlreadyExistsError({ code: "ALREADY_EXISTS" })).toBe(true);
    expect(isFirestoreAlreadyExistsError(grpcError(14, "UNAVAILABLE"))).toBe(false);
    expect(isFirestoreAlreadyExistsError(new Error("ALREADY_EXISTS somewhere in text"))).toBe(false);
    expect(isFirestoreAlreadyExistsError(null)).toBe(false);
  });

  it("in-memory and Firestore stores share the SESSION_ALREADY_EXISTS contract", async () => {
    const mem = createInMemoryCallSessionStore();
    await mem.create(sessionFixture());
    const memErr = await mem.create(sessionFixture()).catch((e) => e);
    expect(isSessionAlreadyExistsError(memErr)).toBe(true);

    const fake = createFakeAdminDb();
    const fsStore = createFirestoreCallSessionStore(fake.db);
    await fsStore.create(sessionFixture());
    const fsErr = await fsStore.create(sessionFixture()).catch((e) => e);
    expect(isSessionAlreadyExistsError(fsErr)).toBe(true);
    expect((fsErr as Error).message).toBe(SESSION_ALREADY_EXISTS);
  });
});

describe("Firestore call session store — create-if-absent", () => {
  it("1. first create succeeds (optional undefined fields are not written)", async () => {
    const fake = createFakeAdminDb();
    const store = createFirestoreCallSessionStore(fake.db);
    await store.create(sessionFixture({ callerE164: undefined, locale: undefined }));
    const stored = fake.docs.get(SESSION_PATH)!;
    expect(stored).toMatchObject({ ...IDS, clinicId: CLINIC, status: "STARTED" });
    expect("callerE164" in stored).toBe(false);
    expect("locale" in stored).toBe(false);
    expect(await store.get(IDS.callSessionId)).toMatchObject({ status: "STARTED" });
  });

  it("2–5. a second create cannot overwrite status, turn cache or timestamps", async () => {
    const fake = createFakeAdminDb();
    const store = createFirestoreCallSessionStore(fake.db);
    await store.create(sessionFixture());
    const progressedAt = "2026-10-07T09:05:00.000Z";
    await store.update(IDS.callSessionId, progressedPatch(progressedAt));
    const before = structuredClone(fake.docs.get(SESSION_PATH));

    clock = new Date("2026-10-07T09:10:00.000Z");
    const err = await store.create(sessionFixture()).catch((e) => e);
    expect(isSessionAlreadyExistsError(err)).toBe(true);

    const after = fake.docs.get(SESSION_PATH)!;
    expect(after).toEqual(before);
    expect(after.status).toBe("ACTIVE");
    expect(after.turnResultCache).toHaveProperty([TURN_ID]);
    expect(after.processedTurnIds).toEqual([TURN_ID]);
    expect(after.startedAt).toBe("2026-10-07T09:00:00.000Z");
    expect(after.lastActivityAt).toBe(progressedAt);
  });

  it("duplicate startCallSession with the same ids rejects and leaves the session intact", async () => {
    const fake = createFakeAdminDb();
    const store = createFirestoreCallSessionStore(fake.db);
    const deps = { sessionStore: store, adminDb: fake.db, now, generateId: () => IDS.callSessionId };
    await startCallSession(deps, { clinicId: CLINIC, conversationId: IDS.conversationId });
    await store.update(IDS.callSessionId, progressedPatch("2026-10-07T09:05:00.000Z"));
    const before = structuredClone(fake.docs.get(SESSION_PATH));

    const err = await startCallSession(deps, { clinicId: CLINIC, conversationId: IDS.conversationId }).catch((e) => e);
    expect(isSessionAlreadyExistsError(err)).toBe(true);
    expect(fake.docs.get(SESSION_PATH)).toEqual(before);
  });

  it("8. non-ALREADY_EXISTS create failures are surfaced unchanged", async () => {
    const fake = createFakeAdminDb();
    const store = createFirestoreCallSessionStore(fake.db);
    const unavailable = grpcError(14, "UNAVAILABLE");
    fake.hooks.failCreate = (path) => (path === SESSION_PATH ? unavailable : undefined);
    const err = await store.create(sessionFixture()).catch((e) => e);
    expect(err).toBe(unavailable);
    expect(isSessionAlreadyExistsError(err)).toBe(false);
    expect(fake.docs.has(SESSION_PATH)).toBe(false);
  });
});

describe("conversation log shell", () => {
  it("first start creates the voice conversation shell", async () => {
    const fake = createFakeAdminDb();
    const deps = {
      sessionStore: createFirestoreCallSessionStore(fake.db),
      adminDb: fake.db,
      now,
      generateId: () => IDS.callSessionId,
    };
    await startCallSession(deps, { clinicId: CLINIC, conversationId: IDS.conversationId, locale: "tr" });
    expect(fake.docs.get(CONV_PATH)).toEqual({
      clinicId: CLINIC,
      channel: "voice",
      source: "voice",
      createdAt: clock.toISOString(),
      updatedAt: clock.toISOString(),
      status: "open",
      conversationLocale: "tr",
    });
  });

  it("9. a duplicate/stale start does not reset an existing conversation log", async () => {
    const fake = createFakeAdminDb();
    const progressed = {
      clinicId: CLINIC,
      channel: "voice",
      source: "voice",
      createdAt: "2026-10-07T08:00:00.000Z",
      updatedAt: "2026-10-07T08:30:00.000Z",
      status: "collecting",
      appointmentState: "COLLECTING_DATE",
      appointmentDraft: { requestedService: "İmplant" },
      totalMessages: 6,
    };
    fake.docs.set(CONV_PATH, structuredClone(progressed));
    fake.docs.set(`${CONV_PATH}/messages/m1`, { role: "user", content: "implant" });

    const deps = {
      sessionStore: createFirestoreCallSessionStore(fake.db),
      adminDb: fake.db,
      now,
      generateId: () => "call_other_attempt",
    };
    const started = await startCallSession(deps, { clinicId: CLINIC, conversationId: IDS.conversationId, locale: "en" });
    expect(started.ok).toBe(true);
    expect(fake.docs.get(CONV_PATH)).toEqual(progressed);
    expect(fake.docs.get(`${CONV_PATH}/messages/m1`)).toEqual({ role: "user", content: "implant" });
  });

  it("non-ALREADY_EXISTS shell failure keeps the previous soft-failure behavior", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const fake = createFakeAdminDb();
      fake.hooks.failCreate = (path) => (path === CONV_PATH ? grpcError(14, "UNAVAILABLE") : undefined);
      const deps = {
        sessionStore: createFirestoreCallSessionStore(fake.db),
        adminDb: fake.db,
        now,
        generateId: () => IDS.callSessionId,
      };
      const started = await startCallSession(deps, { clinicId: CLINIC, conversationId: IDS.conversationId });
      expect(started.ok).toBe(true);
      expect(fake.docs.has(SESSION_PATH)).toBe(true);
      expect(errSpy.mock.calls.some((c) => String(c[0]).includes("VOICE_CONV_SHELL_FAILED"))).toBe(true);
    } finally {
      errSpy.mockRestore();
    }
  });
});

describe("phase2SessionStarter — check-then-create race", () => {
  function raceSetup(competitor: CallSession) {
    const fake = createFakeAdminDb();
    const store = createFirestoreCallSessionStore(fake.db);
    let injected = false;
    fake.hooks.beforeCreate = (path) => {
      if (path === SESSION_PATH && !injected) {
        injected = true;
        fake.docs.set(SESSION_PATH, structuredClone(competitor) as unknown as Record<string, unknown>);
      }
    };
    const starter = createPhase2BoundSessionStarter({ sessionStore: store, adminDb: fake.db, now });
    return { fake, store, starter };
  }

  it("6. lookup absent → competitor creates → ALREADY_EXISTS → re-read matching session succeeds", async () => {
    const competitor = { ...sessionFixture(), ...progressedPatch("2026-10-07T09:01:00.000Z") } as CallSession;
    const { fake, starter } = raceSetup(competitor);
    const result = await starter({ clinicId: CLINIC, ...IDS });
    expect(result).toEqual({ ok: true, clinicId: CLINIC, ...IDS });
    expect(fake.docs.get(SESSION_PATH)).toEqual(competitor);
  });

  it.each([
    ["clinicId", { clinicId: "clinic_test_b" }],
    ["conversationId", { conversationId: "voice_conv_someone_else" }],
  ])("7. race with conflicting %s fails closed without overwriting", async (_label, override) => {
    const competitor = sessionFixture(override as Partial<CallSession>);
    const { fake, starter } = raceSetup(competitor);
    const result = await starter({ clinicId: CLINIC, ...IDS });
    expect(result).toEqual({ ok: false, reason: "SESSION_IDENTITY_MISMATCH" });
    expect(fake.docs.get(SESSION_PATH)).toEqual(competitor);
  });

  it("8. starter surfaces non-ALREADY_EXISTS failures (binding maps them to SESSION_START_FAILED)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const fake = createFakeAdminDb();
      const unavailable = grpcError(14, "UNAVAILABLE");
      fake.hooks.failCreate = (path) => (path === SESSION_PATH ? unavailable : undefined);
      const store = createFirestoreCallSessionStore(fake.db);
      const starter = createPhase2BoundSessionStarter({ sessionStore: store, adminDb: fake.db, now });
      await expect(starter({ clinicId: CLINIC, ...IDS })).rejects.toBe(unavailable);

      const bound = await getOrCreateCallBinding(
        { adminDb: fake.db, startSession: starter, now, generateOwnerId: () => "w" },
        { externalCallKey: CALL_KEY, clinicId: CLINIC, didE164: DID }
      );
      expect(bound).toEqual({ ok: false, code: "CALL_BINDING_SESSION_START_FAILED", bindingId: BINDING_ID });
    } finally {
      errSpy.mockRestore();
    }
  });
});

describe("10. Step 2 long-stall scenario (> binding lease)", () => {
  it("stale worker A can no longer overwrite the session or conversation log created by worker B", async () => {
    const fake = createFakeAdminDb();
    const store = createFirestoreCallSessionStore(fake.db);
    const input = { externalCallKey: CALL_KEY, clinicId: CLINIC, didE164: DID };

    let releaseA!: () => void;
    const gateA = new Promise<void>((r) => (releaseA = r));
    let markStalled!: () => void;
    const aStalled = new Promise<void>((r) => (markStalled = r));
    let gated = false;
    const staleStore: CallSessionStore = {
      ...store,
      async get(id) {
        const s = await store.get(id);
        if (!gated) {
          gated = true;
          markStalled();
          await gateA;
        }
        return s;
      },
    };

    const workerA = getOrCreateCallBinding(
      {
        adminDb: fake.db,
        now,
        generateOwnerId: () => "worker_A",
        startSession: createPhase2BoundSessionStarter({ sessionStore: staleStore, adminDb: fake.db, now }),
      },
      input
    );
    await aStalled;
    expect(fake.docs.has(SESSION_PATH)).toBe(false);

    clock = new Date(clock.getTime() + CALL_BINDING_DEFAULT_INIT_LEASE_MS + 1);
    const depsB = {
      adminDb: fake.db,
      now,
      generateOwnerId: () => "worker_B",
      startSession: createPhase2BoundSessionStarter({ sessionStore: store, adminDb: fake.db, now }),
    };
    const b = await getOrCreateCallBinding(depsB, input);
    expect(b).toMatchObject({ ok: true, binding: { status: "ACTIVE", ...IDS } });

    const turn = await allocateNextTurnId(depsB, { bindingId: BINDING_ID, clinicId: CLINIC });
    expect(turn).toMatchObject({ ok: true, turnId: TURN_ID });
    await store.update(IDS.callSessionId, progressedPatch("2026-10-07T09:00:20.000Z"));
    await fake.db
      .collection("clinics")
      .doc(CLINIC)
      .collection("conversationLogs")
      .doc(IDS.conversationId)
      .set({ status: "collecting", appointmentState: "COLLECTING_DATE", updatedAt: "2026-10-07T09:00:20.000Z" }, { merge: true });

    const sessionBefore = structuredClone(fake.docs.get(SESSION_PATH));
    const convBefore = structuredClone(fake.docs.get(CONV_PATH));

    clock = new Date(clock.getTime() + 5_000);
    releaseA();
    const a = await workerA;

    expect(a).toMatchObject({ ok: true, binding: { status: "ACTIVE", ...IDS } });
    expect(fake.docs.get(SESSION_PATH)).toEqual(sessionBefore);
    expect(fake.docs.get(CONV_PATH)).toEqual(convBefore);
    expect(fake.docs.get(`voiceCalls/${BINDING_ID}`)).toMatchObject({ status: "ACTIVE", turnSeq: 1, initAttempts: 2 });

    const replay = await processVoiceTurn(
      { sessionStore: store, adminDb: fake.db, now, runAgentTurn: async () => { throw new Error("must not run"); } },
      { callSessionId: IDS.callSessionId, text: "merhaba", turnId: TURN_ID }
    );
    expect(replay).toMatchObject({ ok: true, idempotentReplay: true });
  });
});
