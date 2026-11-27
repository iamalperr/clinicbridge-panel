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
export {
  formatTechnicalFallbackReply,
  formatPostAppointmentAnythingElse,
  formatPriorAppointmentRescheduleNotice,
  looksLikeTechnicalFallbackReply,
  resolveClinicPhoneForFallback,
  classifyTechnicalFallbackError,
  fallbackReasonForErrorCategory,
  logTechnicalFallbackEvent,
  describeTechnicalError,
  technicalErrorCodeFor,
  type TechnicalErrorDetails,
  type TechnicalFailureStep,
  type TechnicalFallbackCategory,
  type TechnicalFallbackErrorCategory,
} from "./technicalFallback";
export {
  applySamePatientRescheduleCarryover,
  buildLastSubmittedAppointmentSnapshot,
  detectSameTreatmentReference,
  formatRescheduleConfirmationMessage,
  formatSameTreatmentMissingClarification,
  resolveLastSubmittedAppointment,
  shouldApplyExtractedTreatmentOnReschedule,
  type LastSubmittedAppointment,
} from "./samePatientReschedule";
