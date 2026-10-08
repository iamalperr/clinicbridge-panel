/**
 * Idempotent Phase 2 session start for a call binding.
 *
 * Reuses `startCallSession` unchanged: the binding's pre-assigned conversationId is
 * passed as input and its callSessionId is supplied through the `generateId` hook.
 * An existing session with matching identity is returned as-is (never re-created).
 * If another worker creates it between the lookup and the create, the store's strict
 * create rejects with SESSION_ALREADY_EXISTS and the winner's session is re-read.
 */

import { isSessionAlreadyExistsError } from "../callSessionStore";
import type { CallSession } from "../types";
import { startCallSession, type VoiceAdapterDeps } from "../voiceAdapter";
import type { StartBoundSession, StartBoundSessionInput } from "./callBinding";

type StartBoundSessionResult = Awaited<ReturnType<StartBoundSession>>;

function matchExisting(existing: CallSession, expected: StartBoundSessionInput): StartBoundSessionResult {
  if (
    existing.callSessionId !== expected.callSessionId ||
    existing.clinicId !== expected.clinicId ||
    existing.conversationId !== expected.conversationId
  ) {
    return { ok: false, reason: "SESSION_IDENTITY_MISMATCH" };
  }
  return {
    ok: true,
    clinicId: expected.clinicId,
    callSessionId: expected.callSessionId,
    conversationId: expected.conversationId,
  };
}

export function createPhase2BoundSessionStarter(
  voiceDeps: Pick<VoiceAdapterDeps, "sessionStore" | "adminDb" | "now">
): StartBoundSession {
  return async (expected) => {
    const { clinicId, callSessionId, conversationId, locale } = expected;
    const existing = await voiceDeps.sessionStore.get(callSessionId);
    if (existing) return matchExisting(existing, expected);

    let result: Awaited<ReturnType<typeof startCallSession>>;
    try {
      result = await startCallSession(
        {
          sessionStore: voiceDeps.sessionStore,
          adminDb: voiceDeps.adminDb,
          now: voiceDeps.now,
          generateId: (prefix) => {
            if (prefix === "call") return callSessionId;
            throw new Error(`Unexpected Phase 2 id request: ${prefix}`);
          },
        },
        { clinicId, conversationId, ...(locale ? { locale } : {}) }
      );
    } catch (err) {
      if (!isSessionAlreadyExistsError(err)) throw err;
      const raced = await voiceDeps.sessionStore.get(callSessionId);
      if (!raced) throw err;
      return matchExisting(raced, expected);
    }
    if (!result.ok) return { ok: false, reason: result.errorCode };
    if (
      result.clinicId !== clinicId ||
      result.callSessionId !== callSessionId ||
      result.conversationId !== conversationId
    ) {
      return { ok: false, reason: "SESSION_IDENTITY_MISMATCH" };
    }
    return { ok: true, clinicId, callSessionId, conversationId };
  };
}
