/**
 * Server-side composition of the Voice Runtime Bridge capabilities from the existing
 * implementations (DID resolver, call binding, Phase 2 voice adapter).
 *
 * The Admin Firestore handle is injected by the server runtime; nothing here reads
 * environment variables or initializes Firebase.
 */

import { warmClinicRuntime } from "../../performance/clinicRuntimeLoader";
import { createFirestoreCallSessionStore, type CallSessionStore } from "../callSessionStore";
import { resolveVoiceConfiguration } from "../config/resolveVoiceConfiguration";
import type { VoiceConfigReadFirestore } from "../config/store";
import {
  allocateNextTurnId,
  endCallBinding,
  failCallBinding,
  getOrCreateCallBinding,
  type CallBindingFirestore,
} from "../telephony/callBinding";
import { resolveClinicByDid, type DidResolverFirestore } from "../telephony/didResolver";
import { createPhase2BoundSessionStarter } from "../telephony/phase2SessionStarter";
import {
  endCallSession,
  prefetchVoiceTurnContext,
  processVoiceTurn,
  type VoiceAdapterDeps,
} from "../voiceAdapter";
import { allocateTurnIdUnderLease, type LeasedTurnFirestore } from "./leasedTurnAllocation";
import type { VoiceRuntimeCapabilities } from "./voiceRuntimeBridge";

/** Refresh the clinic runtime cache ahead of the next turn when less than this is left. */
export const VOICE_CLINIC_RUNTIME_REFRESH_AHEAD_MS = 25_000;

export interface VoiceRuntimeCompositionDeps {
  adminDb: CallBindingFirestore & DidResolverFirestore & LeasedTurnFirestore & VoiceConfigReadFirestore;
  /** Defaults to the Firestore-backed `voiceCallSessions` store. */
  sessionStore?: CallSessionStore;
  runAgentTurn?: VoiceAdapterDeps["runAgentTurn"];
  loadHistory?: VoiceAdapterDeps["loadHistory"];
  now?: () => Date;
  /** Default true: post-turn session bookkeeping is written after the reply, in order. */
  deferSessionBookkeeping?: boolean;
  /** Default true: pre-warm the clinic runtime cache for the trusted clinicId. */
  warmClinicRuntime?: boolean;
  /** Default true: resolve the voice configuration once per call in shadow mode (observed only). */
  voiceConfigShadow?: boolean;
}

export function composeVoiceRuntimeCapabilities(deps: VoiceRuntimeCompositionDeps): VoiceRuntimeCapabilities {
  const { adminDb, now } = deps;
  const voiceDeps: VoiceAdapterDeps = {
    sessionStore: deps.sessionStore ?? createFirestoreCallSessionStore(adminDb),
    adminDb,
    ...(deps.runAgentTurn ? { runAgentTurn: deps.runAgentTurn } : {}),
    ...(deps.loadHistory ? { loadHistory: deps.loadHistory } : {}),
    ...(now ? { now } : {}),
    deferSessionBookkeeping: deps.deferSessionBookkeeping ?? true,
  };
  const bindingDeps = { adminDb, ...(now ? { now } : {}) };
  const startSession = createPhase2BoundSessionStarter(voiceDeps);

  return {
    resolveDid: (input) => resolveClinicByDid({ adminDb }, input),
    getOrCreateBinding: (input) => getOrCreateCallBinding({ ...bindingDeps, startSession }, input),
    allocateTurnId: (input) => allocateNextTurnId(bindingDeps, input),
    allocateTurnIdUnderLease: (input) => allocateTurnIdUnderLease(bindingDeps, input),
    endBinding: (input) => endCallBinding(bindingDeps, input),
    failBinding: (input) => failCallBinding(bindingDeps, input),
    processTurn: (input, options) => processVoiceTurn(voiceDeps, input, options),
    prefetchTurn: (input) => prefetchVoiceTurnContext(voiceDeps, input),
    endSession: (input) => endCallSession(voiceDeps, input),
    ...(deps.voiceConfigShadow ?? true
      ? { resolveVoiceConfig: (input: { clinicId: string; calledDid: string }) => resolveVoiceConfiguration({ adminDb }, input) }
      : {}),
    ...(deps.warmClinicRuntime ?? true
      ? {
          warmClinicRuntime: async ({ clinicId }: { clinicId: string }) => {
            const startedAt = performance.now();
            const outcome = await warmClinicRuntime(voiceDeps.adminDb, clinicId, {
              minRemainingMs: VOICE_CLINIC_RUNTIME_REFRESH_AHEAD_MS,
            });
            console.log(JSON.stringify({
              checkpoint: "VOICE_CLINIC_RUNTIME_WARM",
              clinicId,
              outcome,
              warmMs: Math.round(performance.now() - startedAt),
            }));
          },
        }
      : {}),
  };
}
