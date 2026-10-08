/**
 * Phase 3 Step 2.6 — Firestore session update() never sends `undefined` to Firestore.
 * The fake rejects `undefined` recursively, like the Admin SDK without
 * ignoreUndefinedProperties, and records every payload passed to set().
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  createFirestoreCallSessionStore,
  isSessionAlreadyExistsError,
} from "@/lib/voice/callSessionStore";
import { endCallSession, processVoiceTurn, startCallSession, type VoiceAdapterDeps } from "@/lib/voice/voiceAdapter";
import type { CallSession, VoiceTurnResult } from "@/lib/voice/types";
import type { AgentTurnResult } from "@/lib/agent/types";

const CLINIC = "clinic_test_a";
const CALL_ID = "call_serialization_1";
const CONV_ID = "voice_conv_serialization_1";
const SESSION_PATH = `voiceCallSessions/${CALL_ID}`;

function findUndefinedPath(value: unknown, path = ""): string | null {
  if (value === undefined) return path || "<root>";
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      const hit = findUndefinedPath(v, path ? `${path}.${k}` : k);
      if (hit) return hit;
    }
  }
  return null;
}

function createStrictFakeAdminDb() {
  const docs = new Map<string, Record<string, unknown>>();
  const setPayloads: Array<{ path: string; data: Record<string, unknown> }> = [];

  const reject = (data: unknown) => {
    const hit = findUndefinedPath(data);
    if (hit) throw new Error(`Cannot use "undefined" as a Firestore value (found in field "${hit}")`);
  };

  const docRef = (path: string) => ({
    collection: (name: string) => collRef(`${path}/${name}`),
    async get() {
      const d = docs.get(path);
      return { exists: Boolean(d), data: () => (d ? structuredClone(d) : undefined) };
    },
    async create(data: Record<string, unknown>) {
      reject(data);
      if (docs.has(path)) throw Object.assign(new Error("6 ALREADY_EXISTS"), { code: 6 });
      docs.set(path, structuredClone(data));
    },
    async set(data: Record<string, unknown>, opts?: { merge?: boolean }) {
      reject(data);
      setPayloads.push({ path, data: structuredClone(data) });
      docs.set(path, opts?.merge ? { ...(docs.get(path) || {}), ...structuredClone(data) } : structuredClone(data));
    },
  });
  const collRef = (path: string) => ({ doc: (id: string) => docRef(`${path}/${id}`) });

  return { db: { collection: (name: string) => collRef(name) }, docs, setPayloads };
}

let clock: Date;
const now = () => clock;

function baseSession(overrides: Partial<CallSession> = {}): CallSession {
  return {
    callSessionId: CALL_ID,
    clinicId: CLINIC,
    conversationId: CONV_ID,
    channel: "voice",
    status: "STARTED",
    startedAt: clock.toISOString(),
    lastActivityAt: clock.toISOString(),
    processedTurnIds: [],
    turnResultCache: {},
    ...overrides,
  };
}

function cachedResult(overrides: Partial<VoiceTurnResult> = {}): VoiceTurnResult {
  return {
    ok: true,
    callSessionId: CALL_ID,
    conversationId: CONV_ID,
    clinicId: CLINIC,
    channel: "voice",
    replyText: "Merhaba",
    ...overrides,
  };
}

beforeEach(() => {
  clock = new Date("2026-10-07T09:00:00.000Z");
});

describe("Firestore session update() serialization", () => {
  it("1–4. strips top-level, nested and turn-cache undefined values; keeps defined siblings", async () => {
    const fake = createStrictFakeAdminDb();
    const store = createFirestoreCallSessionStore(fake.db);
    await store.create(baseSession({ locale: "tr" }));

    const patch: Partial<CallSession> = {
      status: "ACTIVE",
      endedAt: undefined,
      locale: undefined,
      lastActivityAt: "2026-10-07T09:01:00.000Z",
      processedTurnIds: ["t1"],
      turnResultCache: {
        t1: cachedResult({
          appointmentState: undefined,
          appointmentDraft: { requestedService: "İmplant", notes: undefined, requestedDoctor: undefined },
          appointmentId: undefined,
          escalationRequested: undefined,
          escalation: undefined,
          locale: "tr",
        }),
      },
    };

    const returned = await store.update(CALL_ID, patch);
    expect(returned).not.toBeNull();

    const sent = fake.setPayloads.at(-1)!.data;
    expect(findUndefinedPath(sent)).toBeNull();
    expect("endedAt" in sent).toBe(false);
    const cached = (sent.turnResultCache as Record<string, Record<string, unknown>>).t1;
    for (const key of ["appointmentState", "appointmentId", "escalationRequested", "escalation"]) {
      expect(key in cached).toBe(false);
    }
    expect(cached.appointmentDraft).toEqual({ requestedService: "İmplant" });
    expect(cached).toMatchObject({ replyText: "Merhaba", locale: "tr", clinicId: CLINIC, ok: true });
    expect(sent).toMatchObject({
      status: "ACTIVE",
      lastActivityAt: "2026-10-07T09:01:00.000Z",
      processedTurnIds: ["t1"],
      callSessionId: CALL_ID,
      conversationId: CONV_ID,
      clinicId: CLINIC,
      channel: "voice",
    });
    // merge:true + omitted key leaves the previously stored value in place
    expect(fake.docs.get(SESSION_PATH)!.locale).toBe("tr");
  });

  it("5. false, 0, empty string, null and [] survive unchanged", async () => {
    const fake = createStrictFakeAdminDb();
    const store = createFirestoreCallSessionStore(fake.db);
    await store.create(baseSession());

    await store.update(CALL_ID, {
      processedTurnIds: [],
      turnResultCache: {
        t0: cachedResult({
          replyText: "",
          appointmentCreated: false,
          escalationRequested: false,
          appointmentDraft: { emailValidationFails: 0, requestedTime: null, notes: "" },
        }),
        t1: cachedResult({ appointmentDraft: null }),
      },
    });

    const sent = fake.setPayloads.at(-1)!.data;
    expect(sent.processedTurnIds).toEqual([]);
    const cache = sent.turnResultCache as Record<string, Record<string, unknown>>;
    expect(cache.t0.replyText).toBe("");
    expect(cache.t0.appointmentCreated).toBe(false);
    expect(cache.t0.escalationRequested).toBe(false);
    expect(cache.t0.appointmentDraft).toEqual({ emailValidationFails: 0, requestedTime: null, notes: "" });
    expect(cache.t1.appointmentDraft).toBeNull();
  });

  it("10. does not mutate the patch passed to update()", async () => {
    const fake = createStrictFakeAdminDb();
    const store = createFirestoreCallSessionStore(fake.db);
    await store.create(baseSession());

    const patch: Partial<CallSession> = {
      status: "ACTIVE",
      endedAt: undefined,
      turnResultCache: { t1: cachedResult({ escalation: undefined, appointmentDraft: { notes: undefined } }) },
    };
    const snapshot = structuredClone(patch);
    const returned = await store.update(CALL_ID, patch);

    expect(patch).toEqual(snapshot);
    expect("endedAt" in patch).toBe(true);
    expect("escalation" in patch.turnResultCache!.t1).toBe(true);
    expect("notes" in (patch.turnResultCache!.t1.appointmentDraft as object)).toBe(true);
    expect(returned!.turnResultCache).toBe(patch.turnResultCache);
  });

  it("8. create-if-absent from Step 2.5 still holds after sanitized updates", async () => {
    const fake = createStrictFakeAdminDb();
    const store = createFirestoreCallSessionStore(fake.db);
    await store.create(baseSession());
    await store.update(CALL_ID, { status: "ACTIVE", processedTurnIds: ["t1"], turnResultCache: { t1: cachedResult() } });
    const before = structuredClone(fake.docs.get(SESSION_PATH));

    const err = await store.create(baseSession()).catch((e) => e);
    expect(isSessionAlreadyExistsError(err)).toBe(true);
    expect(fake.docs.get(SESSION_PATH)).toEqual(before);
  });

  it("update of a missing session still returns null without writing", async () => {
    const fake = createStrictFakeAdminDb();
    const store = createFirestoreCallSessionStore(fake.db);
    expect(await store.update("call_missing", { status: "ACTIVE" })).toBeNull();
    expect(fake.setPayloads).toHaveLength(0);
  });
});

describe("Voice Adapter over the strict Firestore store", () => {
  function setup() {
    const fake = createStrictFakeAdminDb();
    const store = createFirestoreCallSessionStore(fake.db);
    let agentCalls = 0;
    const deps: VoiceAdapterDeps = {
      sessionStore: store,
      adminDb: fake.db,
      now,
      generateId: () => CALL_ID,
      loadHistory: async () => [],
      runAgentTurn: async (params) => {
        agentCalls += 1;
        // Realistic plain Q&A turn: no appointment state, no escalation, no side effects.
        return {
          replyText: "İmplant tedavisi sunuyoruz.",
          conversationId: params.input.conversationId,
          payload: { reply: "İmplant tedavisi sunuyoruz." },
          httpStatus: 200,
        } satisfies AgentTurnResult;
      },
    };
    return { fake, store, deps, agentCalls: () => agentCalls };
  }

  it("6 + 9. processVoiceTurn persists a result with undefined optionals; cached replay still works", async () => {
    const { fake, deps, agentCalls } = setup();
    const started = await startCallSession(deps, { clinicId: CLINIC, conversationId: CONV_ID });
    expect(started.ok).toBe(true);

    const first = await processVoiceTurn(deps, { callSessionId: CALL_ID, text: "implant var mı?", turnId: "voice:t:1" });
    expect(first).toMatchObject({ ok: true, replyText: "İmplant tedavisi sunuyoruz." });
    if (!first.ok) return;
    expect(first.appointmentState).toBeUndefined();
    expect(first.escalation).toBeUndefined();

    const stored = fake.docs.get(SESSION_PATH)!;
    expect(stored.status).toBe("ACTIVE");
    expect(stored.processedTurnIds).toEqual(["voice:t:1"]);
    const cached = (stored.turnResultCache as Record<string, Record<string, unknown>>)["voice:t:1"];
    expect(cached).toMatchObject({ replyText: "İmplant tedavisi sunuyoruz.", appointmentCreated: false });
    expect("escalation" in cached).toBe(false);
    expect("appointmentState" in cached).toBe(false);

    const replay = await processVoiceTurn(deps, { callSessionId: CALL_ID, text: "implant var mı?", turnId: "voice:t:1" });
    expect(replay).toMatchObject({ ok: true, idempotentReplay: true, replyText: "İmplant tedavisi sunuyoruz." });
    expect(agentCalls()).toBe(1);
  });

  it("7. endCallSession persists when the session was started without optional fields", async () => {
    const { fake, deps } = setup();
    await startCallSession(deps, { clinicId: CLINIC, conversationId: CONV_ID });
    await processVoiceTurn(deps, { callSessionId: CALL_ID, text: "merhaba", turnId: "voice:t:1" });

    clock = new Date("2026-10-07T09:03:00.000Z");
    const ended = await endCallSession(deps, { callSessionId: CALL_ID, reason: "completed" });
    expect(ended).toMatchObject({ ok: true, status: "COMPLETED" });

    const stored = fake.docs.get(SESSION_PATH)!;
    expect(stored).toMatchObject({
      status: "COMPLETED",
      endedAt: "2026-10-07T09:03:00.000Z",
      lastActivityAt: "2026-10-07T09:03:00.000Z",
    });
    expect("callerE164" in stored).toBe(false);
    expect(findUndefinedPath(fake.setPayloads.at(-1)!.data)).toBeNull();

    const afterEnd = await processVoiceTurn(deps, { callSessionId: CALL_ID, text: "hello", turnId: "voice:t:2" });
    expect(afterEnd).toMatchObject({ ok: false, errorCode: "SESSION_ENDED" });
  });
});
