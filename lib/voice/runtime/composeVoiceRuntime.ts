/**
 * Server-side composition of the Voice Runtime Bridge capabilities from the existing
 * implementations (DID resolver, call binding, Phase 2 voice adapter).
 *
 * The Admin Firestore handle is injected by the server runtime; nothing here reads
 * environment variables or initializes Firebase.
 */

import { createFirestoreCallSessionStore, type CallSessionStore } from "../callSessionStore";
import {
  allocateNextTurnId,
  endCallBinding,
  failCallBinding,
  getOrCreateCallBinding,
  type CallBindingFirestore,
} from "../telephony/callBinding";
import { resolveClinicByDid, type DidResolverFirestore } from "../telephony/didResolver";
import { createPhase2BoundSessionStarter } from "../telephony/phase2SessionStarter";
import { endCallSession, processVoiceTurn, type VoiceAdapterDeps } from "../voiceAdapter";
import type { VoiceRuntimeCapabilities } from "./voiceRuntimeBridge";

export interface VoiceRuntimeCompositionDeps {
  adminDb: CallBindingFirestore & DidResolverFirestore;
  /** Defaults to the Firestore-backed `voiceCallSessions` store. */
  sessionStore?: CallSessionStore;
  runAgentTurn?: VoiceAdapterDeps["runAgentTurn"];
  loadHistory?: VoiceAdapterDeps["loadHistory"];
  now?: () => Date;
}

export function composeVoiceRuntimeCapabilities(deps: VoiceRuntimeCompositionDeps): VoiceRuntimeCapabilities {
  const { adminDb, now } = deps;
  const voiceDeps: VoiceAdapterDeps = {
    sessionStore: deps.sessionStore ?? createFirestoreCallSessionStore(adminDb),
    adminDb,
    ...(deps.runAgentTurn ? { runAgentTurn: deps.runAgentTurn } : {}),
    ...(deps.loadHistory ? { loadHistory: deps.loadHistory } : {}),
    ...(now ? { now } : {}),
  };
  const bindingDeps = { adminDb, ...(now ? { now } : {}) };
  const startSession = createPhase2BoundSessionStarter(voiceDeps);

  return {
    resolveDid: (input) => resolveClinicByDid({ adminDb }, input),
    getOrCreateBinding: (input) => getOrCreateCallBinding({ ...bindingDeps, startSession }, input),
    allocateTurnId: (input) => allocateNextTurnId(bindingDeps, input),
    endBinding: (input) => endCallBinding(bindingDeps, input),
    failBinding: (input) => failCallBinding(bindingDeps, input),
    processTurn: (input) => processVoiceTurn(voiceDeps, input),
    endSession: (input) => endCallSession(voiceDeps, input),
  };
}
