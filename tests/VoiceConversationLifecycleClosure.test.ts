/**
 * Phase 3 Step 6A.1 — a terminal voice call does not leave its conversation shell "open".
 *
 * conversationLogs.status is the conversation OUTCOME. endCallSession only finalizes the
 * untouched voice shell (zero recorded turns) to "no_interaction"; any existing outcome,
 * transcript or appointment state is preserved. The fake Admin-SDK-like Firestore rejects
 * `undefined`, enforces create-if-absent and retries transactions on read-version conflicts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentTurnResult } from "@/lib/agent/types";
import { createFirestoreCallSessionStore } from "@/lib/voice/callSessionStore";
import { endCallSession, processVoiceTurn, startCallSession, type VoiceAdapterDeps } from "@/lib/voice/voiceAdapter";
import {
  CANONICAL_CONVERSATION_STATUSES,
  getConversationStatusLabel,
  getConversationStatusVariant,
  normalizeConversationStatus,
} from "@/lib/services/conversations/conversationStatusResolver";
import { computeWeeklyMetricsFromLogs } from "@/lib/services/weeklyClinicReport/computeWeeklyClinicMetrics";
import { createVoiceRuntimeBridge, type VoiceRuntimeCapabilities } from "@/lib/voice/runtime/voiceRuntimeBridge";
import { deriveCallBindingId, formatTurnId, type CallBinding } from "@/lib/voice/telephony/callBinding";
import type { VoiceCallEndReason } from "@/lib/voice/telephony/lifecyclePolicy";

const CLINIC = "clinic_test_a";
const CALL_ID = "call_lifecycle_1";
const CONV_ID = "voice_conv_lifecycle_1";
const SESSION_PATH = `voiceCallSessions/${CALL_ID}`;
const CONV_PATH = `clinics/${CLINIC}/conversationLogs/${CONV_ID}`;
const MESSAGES_PATH = `${CONV_PATH}/messages`;

/* ── Fake Admin SDK Firestore ───────────────────────────────────────── */

function assertNoUndefined(value: unknown, path = ""): void {
  if (value === undefined) throw new Error(`Cannot use "undefined" as a Firestore value (found in field "${path}")`);
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) assertNoUndefined(v, path ? `${path}.${k}` : k);
  }
}

function grpcError(code: number, message: string) {
  return Object.assign(new Error(`${code} ${message}`), { code });
}

type Ref = { kind: "doc" | "query"; path: string; limit?: number };

function createFakeAdminDb() {
  const docs = new Map<string, Record<string, unknown>>();
  const docVersions = new Map<string, number>();
  const collectionVersions = new Map<string, number>();
  const writes: Array<{ path: string; kind: string; data: Record<string, unknown> }> = [];
  const hooks: {
    failCreate?: (path: string) => Error | undefined;
    beforeCommit?: (attempt: number) => void;
  } = {};
  let transactionAttempts = 0;

  const parentOf = (path: string) => path.slice(0, path.lastIndexOf("/"));
  const put = (path: string, data: Record<string, unknown>, kind: string) => {
    assertNoUndefined(data);
    docs.set(path, structuredClone(data));
    docVersions.set(path, (docVersions.get(path) ?? 0) + 1);
    collectionVersions.set(parentOf(path), (collectionVersions.get(parentOf(path)) ?? 0) + 1);
    writes.push({ path, kind, data: structuredClone(data) });
  };
  const readDoc = (path: string) => ({
    exists: docs.has(path),
    data: () => (docs.has(path) ? structuredClone(docs.get(path)) : undefined),
  });
  const runQuery = (collectionPath: string, limit: number) => {
    const size = Math.min(
      limit,
      [...docs.keys()].filter((k) => parentOf(k) === collectionPath).length
    );
    return { empty: size === 0, size };
  };

  const docRef = (path: string) => ({
    kind: "doc" as const,
    path,
    collection: (name: string) => collRef(`${path}/${name}`),
    async get() {
      return readDoc(path);
    },
    async create(data: Record<string, unknown>) {
      const injected = hooks.failCreate?.(path);
      if (injected) throw injected;
      assertNoUndefined(data);
      if (docs.has(path)) throw grpcError(6, `ALREADY_EXISTS: ${path}`);
      put(path, data, "create");
    },
    async set(data: Record<string, unknown>, opts?: { merge?: boolean }) {
      assertNoUndefined(data);
      put(path, opts?.merge ? { ...(docs.get(path) || {}), ...data } : data, opts?.merge ? "set-merge" : "set");
    },
  });
  const collRef = (path: string) => ({
    doc: (id: string) => docRef(`${path}/${id}`),
    limit: (n: number): Ref => ({ kind: "query", path, limit: n }),
  });

  const db = {
    collection: (name: string) => collRef(name),
    async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      for (let attempt = 1; attempt <= 5; attempt++) {
        transactionAttempts++;
        const reads = new Map<string, number>();
        const pending: Array<() => void> = [];
        const tx = {
          async get(ref: Ref) {
            if (ref.kind === "query") {
              reads.set(`q:${ref.path}`, collectionVersions.get(ref.path) ?? 0);
              return runQuery(ref.path, ref.limit ?? Infinity);
            }
            reads.set(ref.path, docVersions.get(ref.path) ?? 0);
            return readDoc(ref.path);
          },
          update(ref: Ref, data: Record<string, unknown>) {
            assertNoUndefined(data);
            pending.push(() => {
              const existing = docs.get(ref.path);
              if (!existing) throw grpcError(5, "NOT_FOUND");
              put(ref.path, { ...existing, ...data }, "tx.update");
            });
          },
        };
        const result = await fn(tx);
        hooks.beforeCommit?.(attempt);
        const stale = [...reads].some(([key, version]) =>
          key.startsWith("q:")
            ? (collectionVersions.get(key.slice(2)) ?? 0) !== version
            : (docVersions.get(key) ?? 0) !== version
        );
        if (stale) continue;
        pending.forEach((w) => w());
        return result;
      }
      throw grpcError(10, "ABORTED: too much contention");
    },
  };

  return {
    db,
    docs,
    writes,
    hooks,
    put,
    attempts: () => transactionAttempts,
    convWrites: () => writes.filter((w) => w.path === CONV_PATH),
  };
}

/* ── Fixtures ───────────────────────────────────────────────────────── */

let clock: Date;
const now = () => clock;
const START_ISO = "2026-10-07T09:00:00.000Z";
const END_ISO = "2026-10-07T09:02:00.000Z";

function makeDeps(fake: ReturnType<typeof createFakeAdminDb>, runAgentTurn?: VoiceAdapterDeps["runAgentTurn"]): VoiceAdapterDeps {
  return {
    sessionStore: createFirestoreCallSessionStore(fake.db),
    adminDb: fake.db,
    now,
    generateId: () => CALL_ID,
    loadHistory: async () => [],
    runAgentTurn: runAgentTurn ?? (async () => { throw new Error("Agent Core must not run"); }),
  };
}

async function startCall(deps: VoiceAdapterDeps, locale: string | null = "tr-TR") {
  clock = new Date(START_ISO);
  const started = await startCallSession(deps, { clinicId: CLINIC, conversationId: CONV_ID, ...(locale ? { locale } : {}) });
  expect(started.ok).toBe(true);
}

async function endCall(deps: VoiceAdapterDeps, reason: "completed" | "abandoned" | "failed") {
  clock = new Date(END_ISO);
  const ended = await endCallSession(deps, { callSessionId: CALL_ID, clinicId: CLINIC, reason });
  expect(ended.ok).toBe(true);
  return ended;
}

const SHELL = {
  clinicId: CLINIC,
  channel: "voice",
  source: "voice",
  createdAt: START_ISO,
  updatedAt: START_ISO,
  status: "open",
  conversationLocale: "tr-TR",
};

/** Simulates Agent Core persistence (logConversation) for one voice turn. */
function agentCoreWritingOutcome(fake: ReturnType<typeof createFakeAdminDb>, calls: { n: number }): VoiceAdapterDeps["runAgentTurn"] {
  return async (params) => {
    calls.n++;
    fake.put(`${MESSAGES_PATH}/m1`, { role: "user", content: params.input.text, sequence: 0 }, "set");
    fake.put(`${MESSAGES_PATH}/m2`, { role: "assistant", content: "Hangi tarihi tercih edersiniz?", sequence: 1 }, "set");
    fake.put(
      CONV_PATH,
      {
        ...(fake.docs.get(CONV_PATH) || {}),
        status: "collecting",
        appointmentState: "COLLECTING_DATE",
        appointmentDraft: { requestedService: "İmplant" },
        totalMessages: 2,
        updatedAt: "2026-10-07T09:01:00.000Z",
      },
      "set-merge"
    );
    return {
      conversationId: CONV_ID,
      replyText: "Hangi tarihi tercih edersiniz?",
      payload: { reply: "Hangi tarihi tercih edersiniz?" },
      httpStatus: 200,
      appointmentState: "COLLECTING_DATE",
    } as AgentTurnResult;
  };
}

let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;
const endedCheckpoint = () =>
  logSpy.mock.calls
    .map((c: unknown[]) => String(c[0]))
    .filter((line: string) => line.includes("VOICE_SESSION_ENDED"))
    .map((line: string) => JSON.parse(line) as { conversationFinalize?: string });

beforeEach(() => {
  clock = new Date(START_ISO);
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  logSpy.mockRestore();
  errSpy.mockRestore();
});

/* ── Tests ──────────────────────────────────────────────────────────── */

describe("endCallSession — voice conversation closure", () => {
  it("1. zero-turn call (Step 6A case): open shell → no_interaction, everything else preserved", async () => {
    const fake = createFakeAdminDb();
    const deps = makeDeps(fake);
    await startCall(deps);
    expect(fake.docs.get(CONV_PATH)).toEqual(SHELL);

    await endCall(deps, "abandoned");

    expect(fake.docs.get(CONV_PATH)).toEqual({ ...SHELL, status: "no_interaction", updatedAt: END_ISO });
    const closeWrites = fake.convWrites().filter((w) => w.kind === "tx.update");
    expect(closeWrites).toHaveLength(1);
    expect(fake.docs.get(SESSION_PATH)).toMatchObject({ status: "COMPLETED", endedAt: END_ISO });
    expect(endedCheckpoint().at(-1)?.conversationFinalize).toBe("NO_INTERACTION");
  });

  it("2. normal call: outcome, messages and appointment state/draft stay untouched; no Agent Core call on close", async () => {
    const fake = createFakeAdminDb();
    const calls = { n: 0 };
    const deps = makeDeps(fake, agentCoreWritingOutcome(fake, calls));
    await startCall(deps);
    const turn = await processVoiceTurn(deps, { callSessionId: CALL_ID, text: "İmplant için randevu", turnId: "t1" });
    expect(turn.ok).toBe(true);

    const convBefore = structuredClone(fake.docs.get(CONV_PATH));
    const messagesBefore = [...fake.docs.entries()].filter(([k]) => k.startsWith(`${MESSAGES_PATH}/`));
    const convWritesBefore = fake.convWrites().length;

    await endCall(deps, "completed");

    expect(fake.docs.get(CONV_PATH)).toEqual(convBefore);
    expect(fake.docs.get(CONV_PATH)).toMatchObject({
      status: "collecting",
      appointmentState: "COLLECTING_DATE",
      appointmentDraft: { requestedService: "İmplant" },
      createdAt: START_ISO,
      channel: "voice",
    });
    expect([...fake.docs.entries()].filter(([k]) => k.startsWith(`${MESSAGES_PATH}/`))).toEqual(messagesBefore);
    expect(fake.convWrites()).toHaveLength(convWritesBefore);
    expect(calls.n).toBe(1);
    expect(endedCheckpoint().at(-1)?.conversationFinalize).toBe("OUTCOME_PRESERVED");
  });

  it("2b. converted-to-appointment conversation is never downgraded", async () => {
    const fake = createFakeAdminDb();
    const deps = makeDeps(fake);
    await startCall(deps);
    const converted = {
      ...SHELL,
      status: "appointment",
      convertedToAppointment: true,
      appointmentId: "appt_1",
      appointmentState: "APPOINTMENT_SUBMITTED",
      appointmentDraft: { requestedService: "Dolgu", requestedDate: "2026-10-12" },
      totalMessages: 8,
    };
    fake.put(CONV_PATH, converted, "set");

    await endCall(deps, "completed");
    expect(fake.docs.get(CONV_PATH)).toEqual(converted);
  });

  it("3. failed zero-turn call: session FAILED and shell no longer open", async () => {
    const fake = createFakeAdminDb();
    const deps = makeDeps(fake);
    await startCall(deps);

    await endCall(deps, "failed");

    expect(fake.docs.get(SESSION_PATH)).toMatchObject({ status: "FAILED" });
    expect(fake.docs.get(CONV_PATH)).toEqual({ ...SHELL, status: "no_interaction", updatedAt: END_ISO });
  });

  it("3b. failed call with an existing outcome keeps that outcome", async () => {
    const fake = createFakeAdminDb();
    const deps = makeDeps(fake);
    await startCall(deps);
    const unanswered = { ...SHELL, status: "unanswered", needsTraining: true, totalMessages: 2 };
    fake.put(CONV_PATH, unanswered, "set");
    fake.put(`${MESSAGES_PATH}/m1`, { role: "user", content: "?" }, "set");

    await endCall(deps, "failed");
    expect(fake.docs.get(CONV_PATH)).toEqual(unanswered);
  });

  it("4. repeated endCallSession is idempotent and never resets the conversation", async () => {
    const fake = createFakeAdminDb();
    const deps = makeDeps(fake);
    await startCall(deps);
    await endCall(deps, "abandoned");
    const afterFirst = structuredClone(fake.docs.get(CONV_PATH));
    const convWritesAfterFirst = fake.convWrites().length;

    clock = new Date("2026-10-07T09:05:00.000Z");
    const again = await endCallSession(deps, { callSessionId: CALL_ID, clinicId: CLINIC, reason: "abandoned" });
    expect(again.ok).toBe(true);

    expect(fake.docs.get(CONV_PATH)).toEqual(afterFirst);
    expect(fake.convWrites()).toHaveLength(convWritesAfterFirst);
    expect(fake.docs.get(SESSION_PATH)).toMatchObject({ status: "COMPLETED" });
    expect(endedCheckpoint().at(-1)?.conversationFinalize).toBe("OUTCOME_PRESERVED");
  });

  it("5. missing shell: no document is created and the session still ends", async () => {
    const fake = createFakeAdminDb();
    fake.hooks.failCreate = (path) => (path === CONV_PATH ? grpcError(14, "UNAVAILABLE") : undefined);
    const deps = makeDeps(fake);
    await startCall(deps);
    expect(fake.docs.has(CONV_PATH)).toBe(false);

    await endCall(deps, "abandoned");

    expect(fake.docs.has(CONV_PATH)).toBe(false);
    expect(fake.docs.get(SESSION_PATH)).toMatchObject({ status: "COMPLETED" });
    expect(endedCheckpoint().at(-1)?.conversationFinalize).toBe("SHELL_MISSING");
  });

  it("5b. a finalize failure is logged and never fails endCallSession", async () => {
    const fake = createFakeAdminDb();
    const deps = makeDeps(fake);
    await startCall(deps);
    fake.db.runTransaction = async () => { throw grpcError(14, "UNAVAILABLE"); };

    await endCall(deps, "abandoned");

    expect(fake.docs.get(SESSION_PATH)).toMatchObject({ status: "COMPLETED" });
    expect(fake.docs.get(CONV_PATH)).toEqual(SHELL);
    expect(errSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes("VOICE_CONV_FINALIZE_FAILED"))).toBe(true);
    expect(endedCheckpoint().at(-1)?.conversationFinalize).toBe("FAILED");
  });

  it("5c. without transaction support the shell is left as-is (deterministic skip)", async () => {
    const fake = createFakeAdminDb();
    const deps = makeDeps(fake);
    await startCall(deps);
    const noTxDb = { collection: fake.db.collection };

    clock = new Date(END_ISO);
    const ended = await endCallSession({ ...deps, adminDb: noTxDb }, { callSessionId: CALL_ID, reason: "abandoned" });
    expect(ended.ok).toBe(true);
    expect(fake.docs.get(CONV_PATH)).toEqual(SHELL);
    expect(endedCheckpoint().at(-1)?.conversationFinalize).toBe("SKIPPED");
  });

  it("6. race: an Agent Core outcome committed during finalize wins (transaction retries, no overwrite)", async () => {
    const fake = createFakeAdminDb();
    const deps = makeDeps(fake);
    await startCall(deps);
    fake.hooks.beforeCommit = (attempt) => {
      if (attempt !== 1) return;
      fake.put(`${MESSAGES_PATH}/m1`, { role: "user", content: "merhaba" }, "set");
      fake.put(CONV_PATH, { ...(fake.docs.get(CONV_PATH) || {}), status: "answered", totalMessages: 2 }, "set-merge");
    };
    const attemptsBefore = fake.attempts();

    await endCall(deps, "abandoned");

    expect(fake.attempts() - attemptsBefore).toBe(2);
    expect(fake.docs.get(CONV_PATH)).toMatchObject({ status: "answered", totalMessages: 2 });
    expect(endedCheckpoint().at(-1)?.conversationFinalize).toBe("OUTCOME_PRESERVED");
  });

  it("6b. shell still 'open' but messages exist (outcome write lost) → not marked no_interaction", async () => {
    const fake = createFakeAdminDb();
    const deps = makeDeps(fake);
    await startCall(deps);
    fake.put(`${MESSAGES_PATH}/m1`, { role: "user", content: "randevu" }, "set");

    await endCall(deps, "completed");
    expect(fake.docs.get(CONV_PATH)).toEqual(SHELL);
  });

  it("6c. a non-voice log with legacy 'open' status is never touched", async () => {
    const fake = createFakeAdminDb();
    const deps = makeDeps(fake);
    await startCall(deps);
    const webLike = { clinicId: CLINIC, createdAt: START_ISO, status: "open", language: "tr", convertedToAppointment: false };
    fake.put(CONV_PATH, webLike, "set");

    await endCall(deps, "abandoned");
    expect(fake.docs.get(CONV_PATH)).toEqual(webLike);
  });

  it("7. create-if-absent stays intact: a stale start after closure does not reset the conversation", async () => {
    const fake = createFakeAdminDb();
    const deps = makeDeps(fake);
    await startCall(deps);
    await endCall(deps, "abandoned");
    const closed = structuredClone(fake.docs.get(CONV_PATH));

    clock = new Date("2026-10-07T09:10:00.000Z");
    const stale = await startCallSession(
      { ...deps, generateId: () => "call_stale_attempt" },
      { clinicId: CLINIC, conversationId: CONV_ID, locale: "en" }
    );
    expect(stale.ok).toBe(true);
    expect(fake.docs.get(CONV_PATH)).toEqual(closed);
  });

  it("8. serialization: session started without optional fields closes without undefined writes", async () => {
    const fake = createFakeAdminDb();
    const deps = makeDeps(fake);
    await startCall(deps, null);

    await endCall(deps, "abandoned");

    const close = fake.convWrites().filter((w) => w.kind === "tx.update");
    expect(close).toHaveLength(1);
    expect(fake.docs.get(CONV_PATH)).toEqual({
      clinicId: CLINIC,
      channel: "voice",
      source: "voice",
      createdAt: START_ISO,
      updatedAt: END_ISO,
      status: "no_interaction",
    });
    expect(fake.docs.get(SESSION_PATH)).toMatchObject({ status: "COMPLETED", endedAt: END_ISO });
  });
});

describe("conversationStatusResolver — no_interaction", () => {
  it("is a canonical status with labels and a neutral badge variant", () => {
    expect(CANONICAL_CONVERSATION_STATUSES).toContain("no_interaction");
    expect(normalizeConversationStatus("no_interaction")).toBe("no_interaction");
    expect(getConversationStatusLabel("no_interaction", "tr")).toBe("Etkileşim Olmadı");
    expect(getConversationStatusLabel("no_interaction", "en")).toBe("No Interaction");
    expect(getConversationStatusVariant("no_interaction")).toBe("inactive");
  });

  it("appointment context still takes precedence; legacy 'open' mapping is unchanged", () => {
    expect(normalizeConversationStatus("no_interaction", { appointmentId: "appt_1" })).toBe("converted_to_appointment");
    expect(normalizeConversationStatus("open")).toBe("successfully_answered");
  });

  it("is not counted as AI-handled or unanswered in clinic metrics", () => {
    const metrics = computeWeeklyMetricsFromLogs([
      { status: "no_interaction", createdAt: START_ISO },
      { status: "answered", createdAt: START_ISO },
    ]);
    expect(metrics.totalConversations).toBe(2);
    expect(metrics.aiHandled).toBe(1);
    expect(metrics.unanswered).toBe(0);
    expect(metrics.liveSupport).toBe(0);
  });
});

/* ── AGENT_COMPLETED (Step 6B.3A): lifecycle reason only ────────────── */

const TEST_DID = "+908501112233";
const EXTERNAL_CALL_KEY = "livekit-sip:SCL_closure_test";

/** Real bridge → real processVoiceTurn/endCallSession over the fake Admin DB; binding kept in memory. */
function bridgeOverAdapter(deps: VoiceAdapterDeps) {
  const bindingId = deriveCallBindingId(EXTERNAL_CALL_KEY)!;
  const binding: CallBinding = {
    bindingId,
    clinicId: CLINIC,
    didE164: TEST_DID,
    callSessionId: CALL_ID,
    conversationId: CONV_ID,
    status: "ACTIVE",
    turnSeq: 0,
    startedAt: START_ISO,
    updatedAt: START_ISO,
  };
  const capabilities: VoiceRuntimeCapabilities = {
    resolveDid: async () => ({ ok: true, didE164: TEST_DID, clinicId: CLINIC, defaultLocale: "tr-TR" }),
    getOrCreateBinding: async () => ({ ok: true, binding: { ...binding }, created: true }),
    allocateTurnId: async () => {
      binding.turnSeq += 1;
      return { ok: true, bindingId, turnSeq: binding.turnSeq, turnId: formatTurnId(bindingId, binding.turnSeq) };
    },
    endBinding: async ({ reason }) => {
      Object.assign(binding, { status: "ENDED", endReason: reason });
      return { ok: true, binding: { ...binding } };
    },
    failBinding: async ({ failureCode }) => {
      Object.assign(binding, { status: "FAILED", failureCode });
      return { ok: true, binding: { ...binding } };
    },
    processTurn: (input) => processVoiceTurn(deps, input),
    endSession: (input) => endCallSession(deps, input),
  };
  return { bridge: createVoiceRuntimeBridge({ capabilities }), binding };
}

async function runBridgeCall(reason: VoiceCallEndReason, opts: { turns: number; outcome?: Record<string, unknown> }) {
  const fake = createFakeAdminDb();
  const calls = { n: 0 };
  const deps = makeDeps(fake, agentCoreWritingOutcome(fake, calls));
  await startCall(deps);
  const { bridge, binding } = bridgeOverAdapter(deps);
  const started = await bridge.startRuntimeCall({ externalCallKey: EXTERNAL_CALL_KEY, calledDid: TEST_DID });
  if (!started.ok) throw new Error(`start failed: ${started.code}`);
  for (let i = 0; i < opts.turns; i++) {
    const r = await bridge.processRuntimeTranscript({ runtimeCall: started.call, transcript: `randevu ${i}` });
    expect(r.ok).toBe(true);
  }
  if (opts.outcome) fake.put(CONV_PATH, { ...(fake.docs.get(CONV_PATH) || {}), ...opts.outcome }, "set");
  const convBefore = structuredClone(fake.docs.get(CONV_PATH));
  const convWritesBefore = fake.convWrites().length;
  clock = new Date(END_ISO);
  const ended = await bridge.endRuntimeCall({ runtimeCall: started.call, reason });
  return {
    ended,
    binding: { ...binding },
    session: fake.docs.get(SESSION_PATH),
    convBefore,
    convAfter: structuredClone(fake.docs.get(CONV_PATH)),
    newConvWrites: fake.convWrites().slice(convWritesBefore),
    allWrites: fake.writes,
    agentCalls: calls.n,
  };
}

describe("AGENT_COMPLETED — transport lifecycle only, conversation outcome stays with Agent Core", () => {
  it("after a business turn: binding ENDED/completed, session COMPLETED, conversation outcome untouched", async () => {
    const run = await runBridgeCall("AGENT_COMPLETED", { turns: 1 });
    expect(run.ended).toMatchObject({ ok: true, bindingStatus: "ENDED", sessionEndReason: "completed", fallback: null });
    expect(run.binding).toMatchObject({ status: "ENDED", endReason: "completed", turnSeq: 1 });
    expect(run.session).toMatchObject({ status: "COMPLETED", endedAt: END_ISO });
    expect(run.convAfter).toEqual(run.convBefore);
    expect(run.convAfter).toMatchObject({ status: "collecting", appointmentState: "COLLECTING_DATE" });
    expect(run.newConvWrites).toHaveLength(0);
    expect(run.agentCalls).toBe(1);
  });

  it("produces exactly the same persisted conversation/session state as CALLER_HANGUP", async () => {
    for (const turns of [0, 1, 2]) {
      const completed = await runBridgeCall("AGENT_COMPLETED", { turns });
      const hangup = await runBridgeCall("CALLER_HANGUP", { turns });
      expect(completed.convAfter).toEqual(hangup.convAfter);
      expect(completed.session).toEqual(hangup.session);
      expect({ status: completed.binding.status, endReason: completed.binding.endReason }).toEqual({
        status: hangup.binding.status,
        endReason: hangup.binding.endReason,
      });
    }
  });

  it("appointment and contact-request classification are unchanged", async () => {
    const outcome = {
      status: "appointment",
      convertedToAppointment: true,
      appointmentId: "appt_9",
      appointmentState: "APPOINTMENT_SUBMITTED",
      contactRequestId: "cr_9",
      totalMessages: 6,
    };
    const run = await runBridgeCall("AGENT_COMPLETED", { turns: 1, outcome });
    expect(run.convAfter).toEqual(run.convBefore);
    const before = run.convBefore as Record<string, unknown>;
    const after = run.convAfter as Record<string, unknown>;
    expect(normalizeConversationStatus(String(after.status), after)).toBe(normalizeConversationStatus(String(before.status), before));
    expect(normalizeConversationStatus(String(after.status), after)).toBe("converted_to_appointment");
  });

  it("resolved/unanswered metrics are identical to the same call ended by CALLER_HANGUP", async () => {
    const statuses = ["answered", "unanswered"] as const;
    for (const status of statuses) {
      const a = await runBridgeCall("AGENT_COMPLETED", { turns: 1, outcome: { status } });
      const b = await runBridgeCall("CALLER_HANGUP", { turns: 1, outcome: { status } });
      const metricsA = computeWeeklyMetricsFromLogs([{ status: String(a.convAfter?.status), createdAt: START_ISO }]);
      const metricsB = computeWeeklyMetricsFromLogs([{ status: String(b.convAfter?.status), createdAt: START_ISO }]);
      expect(metricsA).toEqual(metricsB);
      expect(a.convAfter?.status).toBe(status);
    }
  });

  it("zero-turn AGENT_COMPLETED keeps Step 6A.1 no_interaction behaviour (no interaction invented)", async () => {
    const run = await runBridgeCall("AGENT_COMPLETED", { turns: 0 });
    expect(run.ended).toMatchObject({ ok: true, bindingStatus: "ENDED", sessionEndReason: "abandoned" });
    expect(run.binding).toMatchObject({ status: "ENDED", endReason: "abandoned", turnSeq: 0 });
    expect(run.session).toMatchObject({ status: "COMPLETED" });
    expect(run.convAfter).toEqual({ ...SHELL, status: "no_interaction", updatedAt: END_ISO });
    expect(run.agentCalls).toBe(0);
  });

  it("the transport end reason is never persisted into conversation or session documents", async () => {
    const run = await runBridgeCall("AGENT_COMPLETED", { turns: 1 });
    const serialized = JSON.stringify(run.allWrites);
    expect(serialized).not.toContain("AGENT_COMPLETED");
    expect(serialized).not.toContain("endReason");
  });
});
