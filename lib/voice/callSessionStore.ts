/**
 * Call session persistence (Phase 2).
 *
 * Business conversation truth remains:
 *   clinics/{clinicId}/conversationLogs/{conversationId}
 *
 * Transport/session state (provider-independent) lives in:
 *   voiceCallSessions/{callSessionId}
 *
 * No Redis. No telephony provider fields.
 */

import { stripUndefinedDeep } from "@/lib/firestore/stripUndefined";
import type { CallSession } from "./types";

const MAX_PROCESSED_TURN_IDS = 50;
const MAX_CACHED_TURN_RESULTS = 20;

/** Thrown by `CallSessionStore.create` when the session id already exists (both stores). */
export const SESSION_ALREADY_EXISTS = "SESSION_ALREADY_EXISTS";

const GRPC_ALREADY_EXISTS = 6;

/** Native Firestore "document already exists" (Admin SDK gRPC code 6). */
export function isFirestoreAlreadyExistsError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  return code === GRPC_ALREADY_EXISTS || code === "already-exists" || code === "ALREADY_EXISTS";
}

export function isSessionAlreadyExistsError(err: unknown): boolean {
  return err instanceof Error && err.message === SESSION_ALREADY_EXISTS;
}

export interface CallSessionStore {
  create(session: CallSession): Promise<void>;
  get(callSessionId: string): Promise<CallSession | null>;
  update(callSessionId: string, patch: Partial<CallSession>): Promise<CallSession | null>;
}

export function createInMemoryCallSessionStore(): CallSessionStore {
  const map = new Map<string, CallSession>();
  return {
    async create(session) {
      if (map.has(session.callSessionId)) {
        throw new Error(SESSION_ALREADY_EXISTS);
      }
      map.set(session.callSessionId, structuredClone(session));
    },
    async get(callSessionId) {
      const s = map.get(callSessionId);
      return s ? structuredClone(s) : null;
    },
    async update(callSessionId, patch) {
      const existing = map.get(callSessionId);
      if (!existing) return null;
      const next: CallSession = {
        ...existing,
        ...patch,
        callSessionId: existing.callSessionId,
        clinicId: existing.clinicId,
        conversationId: existing.conversationId,
        channel: "voice",
        processedTurnIds: patch.processedTurnIds ?? existing.processedTurnIds,
        turnResultCache: patch.turnResultCache ?? existing.turnResultCache,
      };
      map.set(callSessionId, next);
      return structuredClone(next);
    },
  };
}

/**
 * Firestore-backed store using Admin SDK.
 * Collection: voiceCallSessions/{callSessionId}
 */
export function createFirestoreCallSessionStore(adminDb: any): CallSessionStore {
  const col = () => adminDb.collection("voiceCallSessions");

  return {
    async create(session) {
      // Atomic create-if-absent: an existing session must never be overwritten.
      try {
        await col().doc(session.callSessionId).create(stripUndefinedDeep(session));
      } catch (err) {
        if (isFirestoreAlreadyExistsError(err)) throw new Error(SESSION_ALREADY_EXISTS, { cause: err });
        throw err;
      }
    },
    async get(callSessionId) {
      const snap = await col().doc(callSessionId).get();
      if (!snap.exists) return null;
      return snap.data() as CallSession;
    },
    async update(callSessionId, patch) {
      const ref = col().doc(callSessionId);
      const snap = await ref.get();
      if (!snap.exists) return null;
      const existing = snap.data() as CallSession;
      const next: CallSession = {
        ...existing,
        ...patch,
        callSessionId: existing.callSessionId,
        clinicId: existing.clinicId,
        conversationId: existing.conversationId,
        channel: "voice",
        processedTurnIds: patch.processedTurnIds ?? existing.processedTurnIds,
        turnResultCache: patch.turnResultCache ?? existing.turnResultCache,
      };
      await ref.set(stripUndefinedDeep(next), { merge: true });
      return next;
    },
  };
}

export function appendProcessedTurnId(
  processedTurnIds: string[],
  turnId: string
): string[] {
  const next = [...processedTurnIds.filter((id) => id !== turnId), turnId];
  if (next.length > MAX_PROCESSED_TURN_IDS) {
    return next.slice(next.length - MAX_PROCESSED_TURN_IDS);
  }
  return next;
}

export function putTurnResultCache(
  cache: Record<string, import("./types").VoiceTurnResult> | undefined,
  turnId: string,
  result: import("./types").VoiceTurnResult
): Record<string, import("./types").VoiceTurnResult> {
  const next = { ...(cache || {}), [turnId]: result };
  const keys = Object.keys(next);
  if (keys.length <= MAX_CACHED_TURN_RESULTS) return next;
  const drop = keys.slice(0, keys.length - MAX_CACHED_TURN_RESULTS);
  for (const k of drop) delete next[k];
  return next;
}
