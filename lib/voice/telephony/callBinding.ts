/**
 * External call → ClinicBridge voice session binding (Phase 3, provider-independent).
 *
 *   voiceCalls/{bindingId}  →  clinicId, didE164, callSessionId, conversationId, turnSeq
 *
 * Session ids are derived deterministically from the binding id and persisted in the
 * binding BEFORE the session is started, so every retry targets the same session and
 * no session can exist without a binding that references it.
 *
 * Lifecycle: INITIALIZING → ACTIVE → ENDED, or → FAILED (terminal).
 * INITIALIZING is guarded by a short lease so concurrent deliveries do not start the
 * session in parallel; a crashed holder's lease expires and the next delivery resumes.
 */

import { createHash, randomUUID } from "crypto";

export const VOICE_CALLS_COLLECTION = "voiceCalls";

export const CALL_BINDING_MAX_INIT_ATTEMPTS = 3;
export const CALL_BINDING_DEFAULT_INIT_LEASE_MS = 10_000;
export const CALL_BINDING_MAX_TURNS = 500;

const MAX_EXTERNAL_CALL_KEY_LENGTH = 256;
const MAX_CLINIC_ID_LENGTH = 128;
const EXTERNAL_CALL_KEY_PATTERN = /^[\x21-\x7E]+$/;
const BINDING_ID_PATTERN = /^vc_[0-9a-f]{32}$/;
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const LOCALE_PATTERN = /^[a-z]{2}(?:-[A-Z]{2})?$/;
const FAILURE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

export type CallBindingStatus = "INITIALIZING" | "ACTIVE" | "ENDED" | "FAILED";
export type CallBindingEndReason = "completed" | "abandoned";

export type CallBindingErrorCode =
  | "CALL_BINDING_INVALID_INPUT"
  | "CALL_BINDING_NOT_FOUND"
  | "CALL_BINDING_TENANT_CONFLICT"
  | "CALL_BINDING_INITIALIZING"
  | "CALL_BINDING_ENDED"
  | "CALL_BINDING_FAILED"
  | "CALL_BINDING_SESSION_START_FAILED"
  | "CALL_BINDING_TURN_LIMIT"
  | "CALL_BINDING_LOOKUP_FAILED"
  | "CALL_BINDING_CREATE_FAILED"
  | "CALL_BINDING_UPDATE_FAILED";

/** Public view of a binding (lease internals omitted). */
export interface CallBinding {
  bindingId: string;
  clinicId: string;
  didE164: string;
  callSessionId: string;
  conversationId: string;
  status: CallBindingStatus;
  turnSeq: number;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
  endReason?: CallBindingEndReason;
  failureCode?: string;
}

/** Persisted shape of voiceCalls/{bindingId}. */
interface CallBindingDoc {
  bindingId: string;
  clinicId: string;
  didE164: string;
  callSessionId: string;
  conversationId: string;
  status: CallBindingStatus;
  turnSeq: number;
  initAttempts: number;
  initOwner: string | null;
  initLeaseExpiresAt: string | null;
  startedAt: string;
  updatedAt: string;
  endedAt: string | null;
  endReason: CallBindingEndReason | null;
  failureCode: string | null;
}

export type CallBindingError = { ok: false; code: CallBindingErrorCode; bindingId?: string };

export type GetOrCreateCallBindingResult =
  | { ok: true; binding: CallBinding; created: boolean }
  | CallBindingError;

export type CallBindingResult = { ok: true; binding: CallBinding } | CallBindingError;

export type AllocateTurnIdResult =
  | { ok: true; bindingId: string; turnSeq: number; turnId: string }
  | CallBindingError;

/* ── Injected boundaries ─────────────────────────────────────────────── */

export interface CallBindingSnapshot {
  exists: boolean;
  data(): unknown;
}

export interface CallBindingTransaction {
  get(ref: object): Promise<CallBindingSnapshot>;
  create(ref: object, data: Record<string, unknown>): unknown;
  update(ref: object, data: Record<string, unknown>): unknown;
}

/** Firestore subset used here; firebase-admin `Firestore` satisfies it structurally. */
export interface CallBindingFirestore {
  collection(path: string): { doc(id: string): object };
  runTransaction<T>(fn: (tx: CallBindingTransaction) => Promise<T>): Promise<T>;
}

export interface StartBoundSessionInput {
  clinicId: string;
  callSessionId: string;
  conversationId: string;
  locale?: string;
}

/** Must be idempotent for the same ids (see phase2SessionStarter). */
export type StartBoundSession = (
  input: StartBoundSessionInput
) => Promise<{ ok: true; clinicId: string; callSessionId: string; conversationId: string } | { ok: false; reason: string }>;

export interface CallBindingStoreDeps {
  adminDb: CallBindingFirestore | null | undefined;
  now?: () => Date;
}

export interface GetOrCreateCallBindingDeps extends CallBindingStoreDeps {
  startSession: StartBoundSession;
  generateOwnerId?: () => string;
  initLeaseMs?: number;
}

export interface GetOrCreateCallBindingInput {
  /** Stable provider call identifier (e.g. a provider-namespaced call/session SID). */
  externalCallKey: string;
  /** Trusted clinicId produced by the DID resolver. */
  clinicId: string;
  /** Canonical called DID produced by the DID resolver. */
  didE164: string;
  locale?: string;
}

/* ── Pure helpers ────────────────────────────────────────────────────── */

function isValidExternalCallKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_EXTERNAL_CALL_KEY_LENGTH &&
    EXTERNAL_CALL_KEY_PATTERN.test(value)
  );
}

function isValidClinicId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_CLINIC_ID_LENGTH &&
    value === value.trim() &&
    !value.includes("/") &&
    value !== "." &&
    value !== ".."
  );
}

export function isValidCallBindingId(value: unknown): value is string {
  return typeof value === "string" && BINDING_ID_PATTERN.test(value);
}

/** Deterministic, path-safe binding id. The raw external key is never stored. */
export function deriveCallBindingId(externalCallKey: string): string | null {
  if (!isValidExternalCallKey(externalCallKey)) return null;
  const digest = createHash("sha256").update(`voice-call:${externalCallKey}`).digest("hex");
  return `vc_${digest.slice(0, 32)}`;
}

export function deriveBoundSessionIds(bindingId: string): { callSessionId: string; conversationId: string } {
  const suffix = bindingId.slice("vc_".length);
  return { callSessionId: `call_${suffix}`, conversationId: `voice_conv_${suffix}` };
}

export function formatTurnId(bindingId: string, turnSeq: number): string {
  return `voice:${bindingId}:${turnSeq}`;
}

const STATUSES: readonly CallBindingStatus[] = ["INITIALIZING", "ACTIVE", "ENDED", "FAILED"];

function parseDoc(raw: unknown): CallBindingDoc | null {
  if (typeof raw !== "object" || raw === null) return null;
  const d = raw as Record<string, unknown>;
  const str = (v: unknown) => typeof v === "string" && v.length > 0;
  const nullableStr = (v: unknown) => v === null || v === undefined || typeof v === "string";
  if (
    !isValidCallBindingId(d.bindingId) ||
    !isValidClinicId(d.clinicId) ||
    !str(d.didE164) ||
    !str(d.callSessionId) ||
    !str(d.conversationId) ||
    !STATUSES.includes(d.status as CallBindingStatus) ||
    !Number.isInteger(d.turnSeq) ||
    !Number.isInteger(d.initAttempts) ||
    !str(d.startedAt) ||
    !str(d.updatedAt) ||
    !nullableStr(d.initOwner) ||
    !nullableStr(d.initLeaseExpiresAt) ||
    !nullableStr(d.endedAt) ||
    !nullableStr(d.endReason) ||
    !nullableStr(d.failureCode)
  ) {
    return null;
  }
  return {
    bindingId: d.bindingId as string,
    clinicId: d.clinicId as string,
    didE164: d.didE164 as string,
    callSessionId: d.callSessionId as string,
    conversationId: d.conversationId as string,
    status: d.status as CallBindingStatus,
    turnSeq: d.turnSeq as number,
    initAttempts: d.initAttempts as number,
    initOwner: (d.initOwner as string | null | undefined) ?? null,
    initLeaseExpiresAt: (d.initLeaseExpiresAt as string | null | undefined) ?? null,
    startedAt: d.startedAt as string,
    updatedAt: d.updatedAt as string,
    endedAt: (d.endedAt as string | null | undefined) ?? null,
    endReason: (d.endReason as CallBindingEndReason | null | undefined) ?? null,
    failureCode: (d.failureCode as string | null | undefined) ?? null,
  };
}

function toView(doc: CallBindingDoc): CallBinding {
  const view: CallBinding = {
    bindingId: doc.bindingId,
    clinicId: doc.clinicId,
    didE164: doc.didE164,
    callSessionId: doc.callSessionId,
    conversationId: doc.conversationId,
    status: doc.status,
    turnSeq: doc.turnSeq,
    startedAt: doc.startedAt,
    updatedAt: doc.updatedAt,
  };
  if (doc.endedAt) view.endedAt = doc.endedAt;
  if (doc.endReason) view.endReason = doc.endReason;
  if (doc.failureCode) view.failureCode = doc.failureCode;
  return view;
}

function fail(code: CallBindingErrorCode, bindingId?: string): CallBindingError {
  return bindingId ? { ok: false, code, bindingId } : { ok: false, code };
}

function statusError(doc: CallBindingDoc): CallBindingError | null {
  if (doc.status === "ENDED") return fail("CALL_BINDING_ENDED", doc.bindingId);
  if (doc.status === "FAILED") return fail("CALL_BINDING_FAILED", doc.bindingId);
  return null;
}

/** Content-free error fields for logs: class name and provider code only, never the message. */
export function voiceErrorLogMeta(err: unknown): { errorType: string; errorCode: string | null } {
  const code = (err as { code?: unknown } | null)?.code;
  return {
    errorType: (err instanceof Error ? err.name || "Error" : err === null ? "null" : typeof err).slice(0, 64),
    errorCode: typeof code === "string" || typeof code === "number" ? String(code).slice(0, 64) : null,
  };
}

function logBindingError(checkpoint: string, bindingId: string, err: unknown): void {
  console.error(
    JSON.stringify({
      checkpoint,
      bindingId,
      ...voiceErrorLogMeta(err),
    })
  );
}

function nowIso(deps: CallBindingStoreDeps): string {
  return (deps.now?.() ?? new Date()).toISOString();
}

/* ── Operations ──────────────────────────────────────────────────────── */

type ClaimOutcome =
  | { kind: "start"; doc: CallBindingDoc; created: boolean }
  | { kind: "done"; doc: CallBindingDoc }
  | { kind: "error"; error: CallBindingError };

/**
 * Idempotently bind an external call to exactly one Phase 2 voice session.
 * Duplicate deliveries return the same binding/session ids and never start a second session.
 */
export async function getOrCreateCallBinding(
  deps: GetOrCreateCallBindingDeps,
  input: GetOrCreateCallBindingInput
): Promise<GetOrCreateCallBindingResult> {
  const bindingId = deriveCallBindingId(input?.externalCallKey);
  if (
    !bindingId ||
    !isValidClinicId(input.clinicId) ||
    typeof input.didE164 !== "string" ||
    !E164_PATTERN.test(input.didE164) ||
    (input.locale !== undefined && !LOCALE_PATTERN.test(input.locale))
  ) {
    return fail("CALL_BINDING_INVALID_INPUT");
  }
  const db = deps.adminDb;
  if (!db) return fail("CALL_BINDING_LOOKUP_FAILED", bindingId);

  const { clinicId, didE164 } = input;
  const ref = db.collection(VOICE_CALLS_COLLECTION).doc(bindingId);
  const ownerId = (deps.generateOwnerId ?? randomUUID)();
  const leaseMs = deps.initLeaseMs ?? CALL_BINDING_DEFAULT_INIT_LEASE_MS;

  let claim: ClaimOutcome;
  try {
    claim = await db.runTransaction<ClaimOutcome>(async (tx) => {
      const now = deps.now?.() ?? new Date();
      const iso = now.toISOString();
      const leaseUntil = new Date(now.getTime() + leaseMs).toISOString();
      const snap = await tx.get(ref);

      if (!snap.exists) {
        const doc: CallBindingDoc = {
          bindingId,
          clinicId,
          didE164,
          ...deriveBoundSessionIds(bindingId),
          status: "INITIALIZING",
          turnSeq: 0,
          initAttempts: 1,
          initOwner: ownerId,
          initLeaseExpiresAt: leaseUntil,
          startedAt: iso,
          updatedAt: iso,
          endedAt: null,
          endReason: null,
          failureCode: null,
        };
        tx.create(ref, { ...doc });
        return { kind: "start", doc, created: true };
      }

      const doc = parseDoc(snap.data());
      if (!doc || doc.bindingId !== bindingId) {
        return { kind: "error", error: fail("CALL_BINDING_LOOKUP_FAILED", bindingId) };
      }
      if (doc.clinicId !== clinicId || doc.didE164 !== didE164) {
        return { kind: "error", error: fail("CALL_BINDING_TENANT_CONFLICT", bindingId) };
      }
      const terminal = statusError(doc);
      if (terminal) return { kind: "error", error: terminal };
      if (doc.status === "ACTIVE") return { kind: "done", doc };

      const leaseHeld =
        doc.initOwner !== null &&
        doc.initLeaseExpiresAt !== null &&
        Date.parse(doc.initLeaseExpiresAt) > now.getTime();
      if (leaseHeld) return { kind: "error", error: fail("CALL_BINDING_INITIALIZING", bindingId) };

      if (doc.initAttempts >= CALL_BINDING_MAX_INIT_ATTEMPTS) {
        tx.update(ref, {
          status: "FAILED",
          failureCode: "INIT_ATTEMPTS_EXHAUSTED",
          initOwner: null,
          initLeaseExpiresAt: null,
          endedAt: iso,
          updatedAt: iso,
        });
        return { kind: "error", error: fail("CALL_BINDING_FAILED", bindingId) };
      }

      const resumed: CallBindingDoc = {
        ...doc,
        initAttempts: doc.initAttempts + 1,
        initOwner: ownerId,
        initLeaseExpiresAt: leaseUntil,
        updatedAt: iso,
      };
      tx.update(ref, {
        initAttempts: resumed.initAttempts,
        initOwner: ownerId,
        initLeaseExpiresAt: leaseUntil,
        updatedAt: iso,
      });
      return { kind: "start", doc: resumed, created: false };
    });
  } catch (err) {
    logBindingError("VOICE_CALL_BINDING_CLAIM_FAILED", bindingId, err);
    return fail("CALL_BINDING_CREATE_FAILED", bindingId);
  }

  if (claim.kind === "error") return claim.error;
  if (claim.kind === "done") return { ok: true, binding: toView(claim.doc), created: false };

  const claimed = claim.doc;
  let started: Awaited<ReturnType<StartBoundSession>>;
  try {
    started = await deps.startSession({
      clinicId,
      callSessionId: claimed.callSessionId,
      conversationId: claimed.conversationId,
      ...(input.locale ? { locale: input.locale } : {}),
    });
  } catch (err) {
    logBindingError("VOICE_CALL_BINDING_SESSION_START_THREW", bindingId, err);
    started = { ok: false, reason: "SESSION_START_THREW" };
  }

  const sessionMatches =
    started.ok &&
    started.clinicId === clinicId &&
    started.callSessionId === claimed.callSessionId &&
    started.conversationId === claimed.conversationId;

  if (!sessionMatches) {
    await releaseInitLease(db, ref, ownerId, deps, bindingId);
    return fail("CALL_BINDING_SESSION_START_FAILED", bindingId);
  }

  try {
    const activated = await db.runTransaction<CallBindingResult>(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return fail("CALL_BINDING_NOT_FOUND", bindingId);
      const doc = parseDoc(snap.data());
      if (!doc) return fail("CALL_BINDING_LOOKUP_FAILED", bindingId);
      if (doc.clinicId !== clinicId || doc.didE164 !== didE164) {
        return fail("CALL_BINDING_TENANT_CONFLICT", bindingId);
      }
      const terminal = statusError(doc);
      if (terminal) return terminal;
      if (doc.status === "ACTIVE") return { ok: true, binding: toView(doc) };

      const iso = nowIso(deps);
      tx.update(ref, { status: "ACTIVE", initOwner: null, initLeaseExpiresAt: null, updatedAt: iso });
      return {
        ok: true,
        binding: toView({ ...doc, status: "ACTIVE", initOwner: null, initLeaseExpiresAt: null, updatedAt: iso }),
      };
    });
    if (!activated.ok) return activated;
    return { ok: true, binding: activated.binding, created: claim.created };
  } catch (err) {
    logBindingError("VOICE_CALL_BINDING_ACTIVATE_FAILED", bindingId, err);
    return fail("CALL_BINDING_UPDATE_FAILED", bindingId);
  }
}

async function releaseInitLease(
  db: CallBindingFirestore,
  ref: object,
  ownerId: string,
  deps: CallBindingStoreDeps,
  bindingId: string
): Promise<void> {
  try {
    await db.runTransaction(async (tx) => {
      const doc = parseDoc((await tx.get(ref)).data());
      if (doc && doc.status === "INITIALIZING" && doc.initOwner === ownerId) {
        tx.update(ref, { initOwner: null, initLeaseExpiresAt: null, updatedAt: nowIso(deps) });
      }
    });
  } catch (err) {
    // Lease expires on its own; next delivery resumes after initLeaseMs.
    logBindingError("VOICE_CALL_BINDING_LEASE_RELEASE_FAILED", bindingId, err);
  }
}

export async function getCallBinding(
  deps: CallBindingStoreDeps,
  input: { bindingId: string }
): Promise<CallBindingResult> {
  const bindingId = input?.bindingId;
  if (!isValidCallBindingId(bindingId)) return fail("CALL_BINDING_INVALID_INPUT");
  const db = deps.adminDb;
  if (!db) return fail("CALL_BINDING_LOOKUP_FAILED", bindingId);
  try {
    return await db.runTransaction<CallBindingResult>(async (tx) => {
      const snap = await tx.get(db.collection(VOICE_CALLS_COLLECTION).doc(bindingId));
      if (!snap.exists) return fail("CALL_BINDING_NOT_FOUND", bindingId);
      const doc = parseDoc(snap.data());
      if (!doc) return fail("CALL_BINDING_LOOKUP_FAILED", bindingId);
      return { ok: true, binding: toView(doc) };
    });
  } catch (err) {
    logBindingError("VOICE_CALL_BINDING_LOOKUP_FAILED", bindingId, err);
    return fail("CALL_BINDING_LOOKUP_FAILED", bindingId);
  }
}

/**
 * Atomically allocate the next turn id (`voice:<bindingId>:<n>`) for an ACTIVE binding.
 * Safe to pass as Phase 2 `turnId`.
 */
export async function allocateNextTurnId(
  deps: CallBindingStoreDeps,
  input: { bindingId: string; clinicId: string }
): Promise<AllocateTurnIdResult> {
  const bindingId = input?.bindingId;
  if (!isValidCallBindingId(bindingId) || !isValidClinicId(input.clinicId)) {
    return fail("CALL_BINDING_INVALID_INPUT");
  }
  const db = deps.adminDb;
  if (!db) return fail("CALL_BINDING_LOOKUP_FAILED", bindingId);
  const ref = db.collection(VOICE_CALLS_COLLECTION).doc(bindingId);
  try {
    return await db.runTransaction<AllocateTurnIdResult>(async (tx) => {
      const planned = planTurnAllocation(await tx.get(ref), { bindingId, clinicId: input.clinicId }, deps);
      if (!planned.ok) return planned;
      tx.update(ref, planned.patch);
      return planned.result;
    });
  } catch (err) {
    logBindingError("VOICE_CALL_BINDING_TURN_ALLOC_FAILED", bindingId, err);
    return fail("CALL_BINDING_UPDATE_FAILED", bindingId);
  }
}

export type PlannedTurnAllocation =
  | {
      ok: true;
      result: Extract<AllocateTurnIdResult, { ok: true }>;
      patch: { turnSeq: number; updatedAt: string };
    }
  | CallBindingError;

/**
 * The allocation rules of `allocateNextTurnId` for a `voiceCalls/{bindingId}` snapshot read
 * inside the caller's transaction. Pure: the caller applies `patch` with `tx.update` in the
 * same transaction. Inputs must already be validated.
 */
export function planTurnAllocation(
  snap: CallBindingSnapshot,
  input: { bindingId: string; clinicId: string },
  deps: Pick<CallBindingStoreDeps, "now">
): PlannedTurnAllocation {
  const { bindingId } = input;
  if (!snap.exists) return fail("CALL_BINDING_NOT_FOUND", bindingId);
  const doc = parseDoc(snap.data());
  if (!doc) return fail("CALL_BINDING_LOOKUP_FAILED", bindingId);
  if (doc.clinicId !== input.clinicId) return fail("CALL_BINDING_TENANT_CONFLICT", bindingId);
  const terminal = statusError(doc);
  if (terminal) return terminal;
  if (doc.status !== "ACTIVE") return fail("CALL_BINDING_INITIALIZING", bindingId);
  if (doc.turnSeq >= CALL_BINDING_MAX_TURNS) return fail("CALL_BINDING_TURN_LIMIT", bindingId);

  const turnSeq = doc.turnSeq + 1;
  return {
    ok: true,
    result: { ok: true, bindingId, turnSeq, turnId: formatTurnId(bindingId, turnSeq) },
    patch: { turnSeq, updatedAt: (deps.now?.() ?? new Date()).toISOString() },
  };
}

type TerminalTransition =
  | { status: "ENDED"; endReason: CallBindingEndReason }
  | { status: "FAILED"; failureCode: string };

async function transitionToTerminal(
  deps: CallBindingStoreDeps,
  bindingId: string,
  clinicId: string,
  transition: TerminalTransition
): Promise<CallBindingResult> {
  const db = deps.adminDb;
  if (!db) return fail("CALL_BINDING_LOOKUP_FAILED", bindingId);
  const ref = db.collection(VOICE_CALLS_COLLECTION).doc(bindingId);
  try {
    return await db.runTransaction<CallBindingResult>(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return fail("CALL_BINDING_NOT_FOUND", bindingId);
      const doc = parseDoc(snap.data());
      if (!doc) return fail("CALL_BINDING_LOOKUP_FAILED", bindingId);
      if (doc.clinicId !== clinicId) return fail("CALL_BINDING_TENANT_CONFLICT", bindingId);
      // Terminal states are immutable; repeated end/fail calls are no-ops.
      if (doc.status === "ENDED" || doc.status === "FAILED") return { ok: true, binding: toView(doc) };

      const iso = nowIso(deps);
      const patch =
        transition.status === "ENDED"
          ? { status: "ENDED" as const, endReason: transition.endReason }
          : { status: "FAILED" as const, failureCode: transition.failureCode };
      tx.update(ref, { ...patch, initOwner: null, initLeaseExpiresAt: null, endedAt: iso, updatedAt: iso });
      return {
        ok: true,
        binding: toView({ ...doc, ...patch, initOwner: null, initLeaseExpiresAt: null, endedAt: iso, updatedAt: iso }),
      };
    });
  } catch (err) {
    logBindingError("VOICE_CALL_BINDING_TRANSITION_FAILED", bindingId, err);
    return fail("CALL_BINDING_UPDATE_FAILED", bindingId);
  }
}

export async function endCallBinding(
  deps: CallBindingStoreDeps,
  input: { bindingId: string; clinicId: string; reason: CallBindingEndReason }
): Promise<CallBindingResult> {
  if (
    !isValidCallBindingId(input?.bindingId) ||
    !isValidClinicId(input.clinicId) ||
    (input.reason !== "completed" && input.reason !== "abandoned")
  ) {
    return fail("CALL_BINDING_INVALID_INPUT");
  }
  return transitionToTerminal(deps, input.bindingId, input.clinicId, { status: "ENDED", endReason: input.reason });
}

export async function failCallBinding(
  deps: CallBindingStoreDeps,
  input: { bindingId: string; clinicId: string; failureCode: string }
): Promise<CallBindingResult> {
  if (
    !isValidCallBindingId(input?.bindingId) ||
    !isValidClinicId(input.clinicId) ||
    typeof input.failureCode !== "string" ||
    !FAILURE_CODE_PATTERN.test(input.failureCode)
  ) {
    return fail("CALL_BINDING_INVALID_INPUT");
  }
  return transitionToTerminal(deps, input.bindingId, input.clinicId, {
    status: "FAILED",
    failureCode: input.failureCode,
  });
}
