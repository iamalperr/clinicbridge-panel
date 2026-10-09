/**
 * Distributed runtime ownership lease for an ACTIVE voice call (Phase 3, provider-independent).
 *
 *   voiceRuntimeLeases/{bindingId}  →  which runtime worker may process the call right now
 *
 * Separate from the call binding's INITIALIZING lease (binding/session creation) and from
 * voiceCalls (durable call identity/lifecycle). This document is ephemeral ownership only.
 *
 * Authority is the lease token, not ownerId: the raw token is returned once to the acquirer
 * and only its digest is stored. `generation` increases on every acquisition and serves as a
 * fencing token; it never repeats for a binding because release keeps a RELEASED record.
 *
 * Time: expiry is computed from the transaction snapshot's server `readTime`, so all workers
 * compare against Firestore's clock. Without a server read time the operation fails closed
 * unless a local clock is explicitly injected.
 *
 * No timers here; the runtime worker owns heartbeat scheduling.
 */

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { isValidCallBindingId, voiceErrorLogMeta } from "../telephony/callBinding";

export const VOICE_RUNTIME_LEASES_COLLECTION = "voiceRuntimeLeases";

export const RUNTIME_LEASE_DEFAULT_DURATION_MS = 30_000;
export const RUNTIME_LEASE_MIN_DURATION_MS = 5_000;
export const RUNTIME_LEASE_MAX_DURATION_MS = 300_000;
/** Renew well before expiry so one missed heartbeat does not lose ownership. */
export const RUNTIME_LEASE_RECOMMENDED_RENEW_INTERVAL_MS = 10_000;

const MAX_CLINIC_ID_LENGTH = 128;
const OWNER_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const LEASE_TOKEN_PATTERN = /^vrl_[A-Za-z0-9_-]{43}$/;
const TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/;

export type RuntimeLeaseErrorCode =
  | "RUNTIME_LEASE_INVALID_INPUT"
  | "RUNTIME_LEASE_HELD"
  | "RUNTIME_LEASE_NOT_FOUND"
  | "RUNTIME_LEASE_TENANT_CONFLICT"
  | "RUNTIME_LEASE_OWNER_MISMATCH"
  | "RUNTIME_LEASE_TOKEN_MISMATCH"
  | "RUNTIME_LEASE_GENERATION_MISMATCH"
  | "RUNTIME_LEASE_EXPIRED"
  | "RUNTIME_LEASE_INVALID_STATE"
  | "RUNTIME_LEASE_LOOKUP_FAILED"
  | "RUNTIME_LEASE_UPDATE_FAILED";

export type RuntimeLeaseError = { ok: false; code: RuntimeLeaseErrorCode };

export type RuntimeLeaseClockSource = "SERVER_READ_TIME" | "LOCAL_CLOCK";
export type RuntimeLeaseStatus = "ACTIVE" | "RELEASED";

/** Persisted shape of voiceRuntimeLeases/{bindingId}. */
interface RuntimeLeaseDoc {
  bindingId: string;
  clinicId: string;
  ownerId: string;
  status: RuntimeLeaseStatus;
  generation: number;
  leaseTokenHash: string;
  leaseDurationMs: number;
  acquiredAt: string;
  renewedAt: string;
  expiresAt: string;
  releasedAt: string | null;
  clockSource: RuntimeLeaseClockSource;
}

/** Returned once to the acquiring worker. Keep `leaseToken` in memory only; never log it. */
export interface RuntimeLeaseHandle {
  bindingId: string;
  clinicId: string;
  ownerId: string;
  generation: number;
  leaseToken: string;
  expiresAt: string;
  leaseDurationMs: number;
  clockSource: RuntimeLeaseClockSource;
}

/** Ownership proof for renew/verify/release. A `RuntimeLeaseHandle` satisfies it. */
export interface RuntimeLeaseProof {
  bindingId: string;
  clinicId: string;
  ownerId: string;
  generation: number;
  leaseToken: string;
}

/** Diagnostic view; never contains the token or its digest. */
export interface RuntimeLeaseView {
  bindingId: string;
  clinicId: string;
  ownerId: string;
  status: RuntimeLeaseStatus;
  generation: number;
  acquiredAt: string;
  renewedAt: string;
  expiresAt: string;
  releasedAt?: string;
  expired: boolean;
}

export type AcquireRuntimeLeaseResult =
  | { ok: true; lease: RuntimeLeaseHandle; takeover: boolean }
  | RuntimeLeaseError;

export type RenewRuntimeLeaseResult =
  | { ok: true; generation: number; expiresAt: string; clockSource: RuntimeLeaseClockSource }
  | RuntimeLeaseError;

export type VerifyRuntimeLeaseResult =
  | { ok: true; generation: number; expiresAt: string; remainingMs: number; clockSource: RuntimeLeaseClockSource }
  | RuntimeLeaseError;

export type ReleaseRuntimeLeaseResult = { ok: true; alreadyReleased: boolean } | RuntimeLeaseError;

export type GetRuntimeLeaseResult = { ok: true; lease: RuntimeLeaseView } | RuntimeLeaseError;

/* ── Injected boundaries ─────────────────────────────────────────────── */

export interface RuntimeLeaseSnapshot {
  exists: boolean;
  data(): unknown;
  /** Server read time (Admin SDK transactional reads always set it). */
  readonly readTime?: { toMillis(): number };
}

export interface RuntimeLeaseTransaction {
  get(ref: object): Promise<RuntimeLeaseSnapshot>;
  create(ref: object, data: Record<string, unknown>): unknown;
  update(ref: object, data: Record<string, unknown>): unknown;
}

/** Firestore subset used here; the Admin SDK `Firestore` satisfies it structurally. */
export interface RuntimeLeaseFirestore {
  collection(path: string): { doc(id: string): object };
  runTransaction<T>(fn: (tx: RuntimeLeaseTransaction) => Promise<T>): Promise<T>;
}

export interface RuntimeLeaseDeps {
  adminDb: RuntimeLeaseFirestore | null | undefined;
  leaseDurationMs?: number;
  /**
   * Fallback clock used ONLY when a snapshot has no server read time (tests, or stores
   * that cannot provide one). Production should not set it.
   */
  localClock?: () => Date;
  generateToken?: () => string;
}

/* ── Pure helpers ────────────────────────────────────────────────────── */

function fail(code: RuntimeLeaseErrorCode): RuntimeLeaseError {
  return { ok: false, code };
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

function isValidOwnerId(value: unknown): value is string {
  return typeof value === "string" && OWNER_ID_PATTERN.test(value);
}

function isValidGeneration(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

function isValidProof(p: unknown): p is RuntimeLeaseProof {
  if (typeof p !== "object" || p === null) return false;
  const v = p as Record<string, unknown>;
  return (
    isValidCallBindingId(v.bindingId) &&
    isValidClinicId(v.clinicId) &&
    isValidOwnerId(v.ownerId) &&
    isValidGeneration(v.generation) &&
    typeof v.leaseToken === "string" &&
    LEASE_TOKEN_PATTERN.test(v.leaseToken)
  );
}

function resolveDuration(deps: RuntimeLeaseDeps): number | null {
  const ms = deps.leaseDurationMs ?? RUNTIME_LEASE_DEFAULT_DURATION_MS;
  return Number.isInteger(ms) && ms >= RUNTIME_LEASE_MIN_DURATION_MS && ms <= RUNTIME_LEASE_MAX_DURATION_MS
    ? ms
    : null;
}

function newLeaseToken(): string {
  return `vrl_${randomBytes(32).toString("base64url")}`;
}

/** Digest bound to binding and generation so a token is only valid for the lease it was issued for. */
export function hashRuntimeLeaseToken(bindingId: string, generation: number, leaseToken: string): string {
  return createHash("sha256")
    .update(`voice-runtime-lease:v1\n${bindingId}\n${generation}\n${leaseToken}`)
    .digest("hex");
}

function tokenMatches(doc: RuntimeLeaseDoc, leaseToken: string): boolean {
  const expected = Buffer.from(doc.leaseTokenHash, "hex");
  const actual = Buffer.from(hashRuntimeLeaseToken(doc.bindingId, doc.generation, leaseToken), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function parseDoc(raw: unknown): RuntimeLeaseDoc | null {
  if (typeof raw !== "object" || raw === null) return null;
  const d = raw as Record<string, unknown>;
  const iso = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v));
  if (
    !isValidCallBindingId(d.bindingId) ||
    !isValidClinicId(d.clinicId) ||
    !isValidOwnerId(d.ownerId) ||
    (d.status !== "ACTIVE" && d.status !== "RELEASED") ||
    !isValidGeneration(d.generation) ||
    typeof d.leaseTokenHash !== "string" ||
    !TOKEN_HASH_PATTERN.test(d.leaseTokenHash) ||
    !Number.isInteger(d.leaseDurationMs) ||
    !iso(d.acquiredAt) ||
    !iso(d.renewedAt) ||
    !iso(d.expiresAt) ||
    !(d.releasedAt === null || d.releasedAt === undefined || iso(d.releasedAt)) ||
    (d.clockSource !== "SERVER_READ_TIME" && d.clockSource !== "LOCAL_CLOCK")
  ) {
    return null;
  }
  return {
    bindingId: d.bindingId as string,
    clinicId: d.clinicId as string,
    ownerId: d.ownerId as string,
    status: d.status,
    generation: d.generation as number,
    leaseTokenHash: d.leaseTokenHash,
    leaseDurationMs: d.leaseDurationMs as number,
    acquiredAt: d.acquiredAt as string,
    renewedAt: d.renewedAt as string,
    expiresAt: d.expiresAt as string,
    releasedAt: (d.releasedAt as string | null | undefined) ?? null,
    clockSource: d.clockSource,
  };
}

function isExpired(doc: RuntimeLeaseDoc, nowMs: number): boolean {
  return Date.parse(doc.expiresAt) <= nowMs;
}

function snapshotNow(
  snap: RuntimeLeaseSnapshot,
  deps: Pick<RuntimeLeaseDeps, "localClock">
): { nowMs: number; clockSource: RuntimeLeaseClockSource } | null {
  try {
    const ms = snap.readTime?.toMillis();
    if (typeof ms === "number" && Number.isFinite(ms)) return { nowMs: ms, clockSource: "SERVER_READ_TIME" };
  } catch {
    // Local (non-server) snapshots throw on readTime access.
  }
  if (deps.localClock) return { nowMs: deps.localClock().getTime(), clockSource: "LOCAL_CLOCK" };
  return null;
}

function logLeaseError(checkpoint: string, bindingId: string, err: unknown): void {
  console.error(
    JSON.stringify({ checkpoint, bindingId, ...voiceErrorLogMeta(err) })
  );
}

/** Tenant, path, generation, owner and token checks shared by renew/verify/release. */
function checkOwnership(doc: RuntimeLeaseDoc, proof: RuntimeLeaseProof): RuntimeLeaseError | null {
  if (doc.bindingId !== proof.bindingId) return fail("RUNTIME_LEASE_INVALID_STATE");
  if (doc.clinicId !== proof.clinicId) return fail("RUNTIME_LEASE_TENANT_CONFLICT");
  if (doc.generation !== proof.generation) return fail("RUNTIME_LEASE_GENERATION_MISMATCH");
  if (doc.ownerId !== proof.ownerId) return fail("RUNTIME_LEASE_OWNER_MISMATCH");
  if (!tokenMatches(doc, proof.leaseToken)) return fail("RUNTIME_LEASE_TOKEN_MISMATCH");
  return null;
}

type Loaded =
  | { kind: "missing"; nowMs: number; clockSource: RuntimeLeaseClockSource }
  | { kind: "doc"; doc: RuntimeLeaseDoc; nowMs: number; clockSource: RuntimeLeaseClockSource }
  | { kind: "error"; error: RuntimeLeaseError };

async function load(tx: RuntimeLeaseTransaction, ref: object, bindingId: string, deps: RuntimeLeaseDeps): Promise<Loaded> {
  return loadSnapshot(await tx.get(ref), bindingId, deps);
}

function loadSnapshot(
  snap: RuntimeLeaseSnapshot,
  bindingId: string,
  deps: Pick<RuntimeLeaseDeps, "localClock">
): Loaded {
  const clock = snapshotNow(snap, deps);
  if (!clock) {
    logLeaseError("VOICE_RUNTIME_LEASE_NO_SERVER_TIME", bindingId, "snapshot has no server read time");
    return { kind: "error", error: fail("RUNTIME_LEASE_LOOKUP_FAILED") };
  }
  if (!snap.exists) return { kind: "missing", ...clock };
  const doc = parseDoc(snap.data());
  if (!doc || doc.bindingId !== bindingId) return { kind: "error", error: fail("RUNTIME_LEASE_INVALID_STATE") };
  return { kind: "doc", doc, ...clock };
}

function leaseRef(db: RuntimeLeaseFirestore, bindingId: string): object {
  return db.collection(VOICE_RUNTIME_LEASES_COLLECTION).doc(bindingId);
}

function verifyLoaded(loaded: Loaded, proof: RuntimeLeaseProof, minRemainingMs: number): VerifyRuntimeLeaseResult {
  if (loaded.kind === "error") return loaded.error;
  if (loaded.kind === "missing") return fail("RUNTIME_LEASE_NOT_FOUND");
  const { doc, nowMs, clockSource } = loaded;
  const denied = checkOwnership(doc, proof);
  if (denied) return denied;
  if (doc.status === "RELEASED") return fail("RUNTIME_LEASE_NOT_FOUND");
  const remainingMs = Date.parse(doc.expiresAt) - nowMs;
  if (remainingMs <= minRemainingMs || remainingMs <= 0) return fail("RUNTIME_LEASE_EXPIRED");
  return { ok: true, generation: doc.generation, expiresAt: doc.expiresAt, remainingMs, clockSource };
}

export function isValidRuntimeLeaseProof(proof: unknown): proof is RuntimeLeaseProof {
  return isValidProof(proof);
}

/**
 * The checks of `verifyRuntimeLease`, applied to a lease snapshot the caller read inside its
 * own transaction (so the verdict and the caller's writes commit atomically). Pure; the
 * caller validates the proof and minRemainingMs and must read `voiceRuntimeLeases/{bindingId}`.
 */
export function verifyRuntimeLeaseSnapshot(
  snap: RuntimeLeaseSnapshot,
  proof: RuntimeLeaseProof,
  options: { minRemainingMs: number },
  deps: Pick<RuntimeLeaseDeps, "localClock"> = {}
): VerifyRuntimeLeaseResult {
  return verifyLoaded(loadSnapshot(snap, proof.bindingId, deps), proof, options.minRemainingMs);
}

/* ── Operations ──────────────────────────────────────────────────────── */

/**
 * Acquire processing ownership. Succeeds when no lease exists, the current lease has
 * expired, or it was released; an unexpired lease is never re-issued, even to the same ownerId.
 */
export async function acquireRuntimeLease(
  deps: RuntimeLeaseDeps,
  input: { bindingId: string; clinicId: string; ownerId: string }
): Promise<AcquireRuntimeLeaseResult> {
  const durationMs = resolveDuration(deps);
  if (
    durationMs === null ||
    !isValidCallBindingId(input?.bindingId) ||
    !isValidClinicId(input.clinicId) ||
    !isValidOwnerId(input.ownerId)
  ) {
    return fail("RUNTIME_LEASE_INVALID_INPUT");
  }
  const db = deps.adminDb;
  if (!db) return fail("RUNTIME_LEASE_LOOKUP_FAILED");
  const { bindingId, clinicId, ownerId } = input;
  const ref = leaseRef(db, bindingId);

  try {
    return await db.runTransaction<AcquireRuntimeLeaseResult>(async (tx) => {
      const loaded = await load(tx, ref, bindingId, deps);
      if (loaded.kind === "error") return loaded.error;

      let generation = 1;
      let takeover = false;
      if (loaded.kind === "doc") {
        const current = loaded.doc;
        if (current.clinicId !== clinicId) return fail("RUNTIME_LEASE_TENANT_CONFLICT");
        if (current.status === "ACTIVE" && !isExpired(current, loaded.nowMs)) return fail("RUNTIME_LEASE_HELD");
        if (current.generation >= Number.MAX_SAFE_INTEGER) return fail("RUNTIME_LEASE_INVALID_STATE");
        generation = current.generation + 1;
        takeover = current.status === "ACTIVE";
      }

      // Generated per attempt: a retried transaction never reuses a token.
      const leaseToken = (deps.generateToken ?? newLeaseToken)();
      if (!LEASE_TOKEN_PATTERN.test(leaseToken)) return fail("RUNTIME_LEASE_UPDATE_FAILED");
      const nowIso = new Date(loaded.nowMs).toISOString();
      const expiresAt = new Date(loaded.nowMs + durationMs).toISOString();
      const doc: RuntimeLeaseDoc = {
        bindingId,
        clinicId,
        ownerId,
        status: "ACTIVE",
        generation,
        leaseTokenHash: hashRuntimeLeaseToken(bindingId, generation, leaseToken),
        leaseDurationMs: durationMs,
        acquiredAt: nowIso,
        renewedAt: nowIso,
        expiresAt,
        releasedAt: null,
        clockSource: loaded.clockSource,
      };
      if (loaded.kind === "missing") tx.create(ref, { ...doc });
      else tx.update(ref, { ...doc });

      return {
        ok: true,
        takeover,
        lease: {
          bindingId,
          clinicId,
          ownerId,
          generation,
          leaseToken,
          expiresAt,
          leaseDurationMs: durationMs,
          clockSource: loaded.clockSource,
        },
      };
    });
  } catch (err) {
    logLeaseError("VOICE_RUNTIME_LEASE_ACQUIRE_FAILED", bindingId, err);
    return fail("RUNTIME_LEASE_UPDATE_FAILED");
  }
}

/** Extend an unexpired lease held by this owner/token/generation. Never revives an expired lease. */
export async function renewRuntimeLease(
  deps: RuntimeLeaseDeps,
  proof: RuntimeLeaseProof
): Promise<RenewRuntimeLeaseResult> {
  const durationMs = resolveDuration(deps);
  if (durationMs === null || !isValidProof(proof)) return fail("RUNTIME_LEASE_INVALID_INPUT");
  const db = deps.adminDb;
  if (!db) return fail("RUNTIME_LEASE_LOOKUP_FAILED");
  const ref = leaseRef(db, proof.bindingId);

  try {
    return await db.runTransaction<RenewRuntimeLeaseResult>(async (tx) => {
      const loaded = await load(tx, ref, proof.bindingId, deps);
      if (loaded.kind === "error") return loaded.error;
      if (loaded.kind === "missing") return fail("RUNTIME_LEASE_NOT_FOUND");
      const { doc, nowMs, clockSource } = loaded;
      const denied = checkOwnership(doc, proof);
      if (denied) return denied;
      if (doc.status === "RELEASED") return fail("RUNTIME_LEASE_NOT_FOUND");
      if (isExpired(doc, nowMs)) return fail("RUNTIME_LEASE_EXPIRED");

      const renewedAt = new Date(nowMs).toISOString();
      const expiresAt = new Date(nowMs + durationMs).toISOString();
      tx.update(ref, { renewedAt, expiresAt, leaseDurationMs: durationMs, clockSource });
      return { ok: true, generation: doc.generation, expiresAt, clockSource };
    });
  } catch (err) {
    logLeaseError("VOICE_RUNTIME_LEASE_RENEW_FAILED", proof.bindingId, err);
    return fail("RUNTIME_LEASE_UPDATE_FAILED");
  }
}

/**
 * Strong ownership check before starting a business turn: current generation, owner and
 * token, ACTIVE, and at least `minRemainingMs` before expiry (server read time).
 */
export async function verifyRuntimeLease(
  deps: RuntimeLeaseDeps,
  proof: RuntimeLeaseProof,
  options: { minRemainingMs?: number } = {}
): Promise<VerifyRuntimeLeaseResult> {
  const minRemainingMs = options.minRemainingMs ?? 0;
  if (!isValidProof(proof) || !Number.isInteger(minRemainingMs) || minRemainingMs < 0) {
    return fail("RUNTIME_LEASE_INVALID_INPUT");
  }
  const db = deps.adminDb;
  if (!db) return fail("RUNTIME_LEASE_LOOKUP_FAILED");
  const ref = leaseRef(db, proof.bindingId);

  try {
    return await db.runTransaction<VerifyRuntimeLeaseResult>(async (tx) =>
      verifyLoaded(await load(tx, ref, proof.bindingId, deps), proof, minRemainingMs)
    );
  } catch (err) {
    logLeaseError("VOICE_RUNTIME_LEASE_VERIFY_FAILED", proof.bindingId, err);
    return fail("RUNTIME_LEASE_LOOKUP_FAILED");
  }
}

/**
 * Give up ownership so another worker can acquire immediately. Keeps a RELEASED record so
 * the generation never repeats. Repeating a release with the same proof returns
 * `alreadyReleased: true`; a stale proof can never release a newer generation.
 */
export async function releaseRuntimeLease(
  deps: RuntimeLeaseDeps,
  proof: RuntimeLeaseProof
): Promise<ReleaseRuntimeLeaseResult> {
  if (!isValidProof(proof)) return fail("RUNTIME_LEASE_INVALID_INPUT");
  const db = deps.adminDb;
  if (!db) return fail("RUNTIME_LEASE_LOOKUP_FAILED");
  const ref = leaseRef(db, proof.bindingId);

  try {
    return await db.runTransaction<ReleaseRuntimeLeaseResult>(async (tx) => {
      const loaded = await load(tx, ref, proof.bindingId, deps);
      if (loaded.kind === "error") return loaded.error;
      if (loaded.kind === "missing") return fail("RUNTIME_LEASE_NOT_FOUND");
      const { doc, nowMs } = loaded;
      const denied = checkOwnership(doc, proof);
      if (denied) return denied;
      if (doc.status === "RELEASED") return { ok: true, alreadyReleased: true };

      const nowIso = new Date(nowMs).toISOString();
      const expiresAt = isExpired(doc, nowMs) ? doc.expiresAt : nowIso;
      tx.update(ref, { status: "RELEASED", releasedAt: nowIso, expiresAt });
      return { ok: true, alreadyReleased: false };
    });
  } catch (err) {
    logLeaseError("VOICE_RUNTIME_LEASE_RELEASE_FAILED", proof.bindingId, err);
    return fail("RUNTIME_LEASE_UPDATE_FAILED");
  }
}

/** Diagnostic read (no token, no digest). */
export async function getRuntimeLease(
  deps: RuntimeLeaseDeps,
  input: { bindingId: string; clinicId: string }
): Promise<GetRuntimeLeaseResult> {
  if (!isValidCallBindingId(input?.bindingId) || !isValidClinicId(input.clinicId)) {
    return fail("RUNTIME_LEASE_INVALID_INPUT");
  }
  const db = deps.adminDb;
  if (!db) return fail("RUNTIME_LEASE_LOOKUP_FAILED");
  const { bindingId, clinicId } = input;

  try {
    return await db.runTransaction<GetRuntimeLeaseResult>(async (tx) => {
      const loaded = await load(tx, leaseRef(db, bindingId), bindingId, deps);
      if (loaded.kind === "error") return loaded.error;
      if (loaded.kind === "missing") return fail("RUNTIME_LEASE_NOT_FOUND");
      const { doc, nowMs } = loaded;
      if (doc.clinicId !== clinicId) return fail("RUNTIME_LEASE_TENANT_CONFLICT");
      const view: RuntimeLeaseView = {
        bindingId: doc.bindingId,
        clinicId: doc.clinicId,
        ownerId: doc.ownerId,
        status: doc.status,
        generation: doc.generation,
        acquiredAt: doc.acquiredAt,
        renewedAt: doc.renewedAt,
        expiresAt: doc.expiresAt,
        expired: doc.status === "RELEASED" || isExpired(doc, nowMs),
      };
      if (doc.releasedAt) view.releasedAt = doc.releasedAt;
      return { ok: true, lease: view };
    });
  } catch (err) {
    logLeaseError("VOICE_RUNTIME_LEASE_LOOKUP_FAILED", bindingId, err);
    return fail("RUNTIME_LEASE_LOOKUP_FAILED");
  }
}
