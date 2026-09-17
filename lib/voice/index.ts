/**
 * Provider-independent Voice Adapter (Phase 2).
 * Text turns → Agent Core. No telephony/STT/TTS.
 */

export type {
  CallSession,
  CallSessionStatus,
  StartCallSessionInput,
  StartCallSessionResult,
  VoiceTurnInput,
  VoiceTurnResult,
  VoiceErrorResult,
  VoiceErrorCode,
  EndCallSessionInput,
  EndCallSessionResult,
  VoiceAdapterResult,
} from "./types";

export {
  createInMemoryCallSessionStore,
  createFirestoreCallSessionStore,
  type CallSessionStore,
} from "./callSessionStore";

export { loadServerAgentHistory } from "./loadServerHistory";

export {
  startCallSession,
  processVoiceTurn,
  endCallSession,
  type VoiceAdapterDeps,
} from "./voiceAdapter";

export { runVoiceConversationHarness } from "./testHarness";
