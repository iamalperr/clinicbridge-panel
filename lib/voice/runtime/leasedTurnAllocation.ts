/**
 * Lease-verified turn id allocation: ONE Firestore transaction that
 *
 *   reads   voiceRuntimeLeases/{bindingId} and voiceCalls/{bindingId} (single getAll)
 *   checks  the runtime lease exactly like verifyRuntimeLease (tenant, generation, owner,
 *           token, ACTIVE, ≥ minRemainingMs left on the server read-time clock)
 *   applies the allocateNextTurnId rules and increments turnSeq
 *
 * Both documents are in the transaction's read set, so a concurrent takeover (lease
 * re-acquired by another worker) or a concurrent allocation forces a retry that re-reads
 * and re-checks; a turn id is only committed while this worker provably holds the lease.
 * The callback has no side effects besides `tx.update`, so Firestore retries can never run
 * Agent Core twice. Turn ids come only from the server-side sequence.
 */

import type { LeasedTurnAllocationResult, VoiceTurnLeaseCheck } from "../types";
import { isValidCallBindingId, planTurnAllocation, VOICE_CALLS_COLLECTION, voiceErrorLogMeta } from "../telephony/callBinding";
import {
  isValidRuntimeLeaseProof,
  verifyRuntimeLeaseSnapshot,
  VOICE_RUNTIME_LEASES_COLLECTION,
  type RuntimeLeaseErrorCode,
  type RuntimeLeaseSnapshot,
} from "./runtimeLease";

export interface LeasedTurnTransaction {
  getAll(...refs: object[]): Promise<RuntimeLeaseSnapshot[]>;
  update(ref: object, data: Record<string, unknown>): unknown;
}

/** Firestore subset used here; the Admin SDK `Firestore` satisfies it structurally. */
export interface LeasedTurnFirestore {
  collection(path: string): { doc(id: string): object };
  runTransaction<T>(fn: (tx: LeasedTurnTransaction) => Promise<T>): Promise<T>;
}

export interface LeasedTurnAllocationDeps {
  adminDb: LeasedTurnFirestore | null | undefined;
  now?: () => Date;
  /** Same meaning as RuntimeLeaseDeps.localClock: tests only; production uses server read time. */
  localClock?: () => Date;
}

function leaseRejected(leaseCode: RuntimeLeaseErrorCode): LeasedTurnAllocationResult {
  return { ok: false, code: "TURN_LEASE_REJECTED", leaseCode };
}

export async function allocateTurnIdUnderLease(
  deps: LeasedTurnAllocationDeps,
  input: { bindingId: string; clinicId: string; lease: VoiceTurnLeaseCheck }
): Promise<LeasedTurnAllocationResult> {
  const bindingId = input?.bindingId;
  const proof = input?.lease?.proof;
  const minRemainingMs = input?.lease?.minRemainingMs;
  if (
    !isValidCallBindingId(bindingId) ||
    typeof input.clinicId !== "string" ||
    !isValidRuntimeLeaseProof(proof) ||
    proof.bindingId !== bindingId ||
    proof.clinicId !== input.clinicId ||
    !Number.isInteger(minRemainingMs) ||
    (minRemainingMs as number) < 0
  ) {
    return leaseRejected("RUNTIME_LEASE_INVALID_INPUT");
  }
  const db = deps.adminDb;
  if (!db) return leaseRejected("RUNTIME_LEASE_LOOKUP_FAILED");
  const leaseRef = db.collection(VOICE_RUNTIME_LEASES_COLLECTION).doc(bindingId);
  const callRef = db.collection(VOICE_CALLS_COLLECTION).doc(bindingId);

  try {
    return await db.runTransaction<LeasedTurnAllocationResult>(async (tx) => {
      const [leaseSnap, callSnap] = await tx.getAll(leaseRef, callRef);
      if (!leaseSnap || !callSnap) return leaseRejected("RUNTIME_LEASE_LOOKUP_FAILED");
      const verified = verifyRuntimeLeaseSnapshot(
        leaseSnap,
        proof,
        { minRemainingMs: minRemainingMs as number },
        deps.localClock ? { localClock: deps.localClock } : {}
      );
      if (!verified.ok) return leaseRejected(verified.code);
      if (verified.generation !== proof.generation) return leaseRejected("RUNTIME_LEASE_GENERATION_MISMATCH");

      const planned = planTurnAllocation(callSnap, { bindingId, clinicId: input.clinicId }, deps);
      if (!planned.ok) return planned;
      tx.update(callRef, planned.patch);
      return planned.result;
    });
  } catch (err) {
    console.error(JSON.stringify({ checkpoint: "VOICE_LEASED_TURN_ALLOC_FAILED", bindingId, ...voiceErrorLogMeta(err) }));
    // Outcome unknown (contention exhausted, network, commit ambiguity): treated like a failed
    // lease lookup, so the turn is not processed. A committed-but-unacknowledged increment only
    // leaves a gap in turnSeq; it never yields a duplicate turn id.
    return leaseRejected("RUNTIME_LEASE_LOOKUP_FAILED");
  }
}
