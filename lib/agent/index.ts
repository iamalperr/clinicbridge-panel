/**
 * Single-clinic Agent Core public surface (Phase 1).
 * Channel-agnostic text turns — no telephony/audio concepts.
 */

export type {
  AgentChannel,
  AgentTurnInput,
  AgentTurnResult,
  AgentTurnEscalation,
  AppointmentData,
  AppointmentState,
} from "./types";

export { toAIUsageChannel, resolveAgentChannel } from "./channel";
export { safeMergeDraft, normalizeIncomingAppointmentDraft, isAppointmentDraftComplete, mergeAppointmentDraftSources } from "./draft";
export { handleClinicAgentTurn } from "./handleClinicAgentTurn";
export type { HandleClinicAgentTurnParams } from "./handleClinicAgentTurn";
export { respondWithVisibleReply, saveAppointmentState, logConversation } from "./persistence";
