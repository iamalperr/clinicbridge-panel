/**
 * Unified Conversation Schemas & Types for ClinicBridge AI Engine
 * Shared across Clinic Portal, Agency Portal, Public Widget, and Embedded Widget.
 */

export type ConversationIntent =
  | "greeting"
  | "casual_conversation"
  | "treatment_information"
  | "pricing_request"
  | "doctor_information"
  | "clinic_information"
  | "clinic_location"
  | "clinic_working_hours"
  | "clinic_recommendation"
  | "clinic_comparison"
  | "appointment_start"
  | "appointment_continuation"
  | "appointment_correction"
  | "appointment_confirmation"
  | "confirmation"
  | "rejection"
  | "complaint"
  | "contact_request"
  | "live_support_request"
  | "emergency"
  | "unknown";

export type ConversationState =
  | "INITIAL"
  | "GENERAL_CONVERSATION"
  | "TREATMENT_DISCOVERY"
  | "CLINIC_MATCHING"
  | "CLINIC_SELECTED"
  | "APPOINTMENT_COLLECTION"
  | "APPOINTMENT_REVIEW"
  | "APPOINTMENT_SUBMITTED"
  | "LEAD_COLLECTION"
  | "LIVE_SUPPORT_REQUIRED"
  | "COMPLETED";

export type VisitType = "first_visit" | "follow_up" | "control" | "unknown";

export interface ConversationSlots {
  treatment?: string;
  preferredDate?: string; // ISO YYYY-MM-DD
  rawDateText?: string;
  preferredWeekday?: string;
  preferredTime?: string; // e.g. "14:00", "10:00-12:00", "sabah", "öğleden_sonra", "morning"
  rawTimeText?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  visitType?: VisitType;
  language?: string;
  country?: string;
  notes?: string;
  selectedClinicId?: string;
  selectedClinicName?: string;
  kvkkConsent?: boolean;
  [key: string]: any;
}

export interface IntentClassificationResult {
  intent: ConversationIntent;
  confidence: number; // 0.0 - 1.0
  entities: Partial<ConversationSlots>;
  requiresKnowledgeBase: boolean;
  shouldContinueActiveFlow: boolean;
  isInterruption?: boolean;
  interruptionReason?: string;
  matchedKeywords?: string[];
  explanation?: string;
  suggestedNextState?: ConversationState;
}

export interface ConversationContext {
  clinicId?: string;
  clinicName?: string;
  agencyId?: string;
  conversationId: string;
  sessionId?: string;
  channel: "admin" | "web_widget" | "agency_widget" | "embedded" | "whatsapp" | "other";
  locale: string;
  currentState: ConversationState;
  slots: Partial<ConversationSlots>;
  history?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  turkishContactNumber?: string;
  internationalContactNumber?: string;
  isAgencyClinic?: boolean;
}

export interface StateTransitionResult {
  previousState: ConversationState;
  nextState: ConversationState;
  updatedSlots: Partial<ConversationSlots>;
  missingRequiredSlots: string[];
  nextPromptNeeded?: string;
  isComplete: boolean;
}

export interface EngineExecutionOutput {
  reply: string;
  intent: ConversationIntent;
  previousState: ConversationState;
  nextState: ConversationState;
  slots: Partial<ConversationSlots>;
  requiresKnowledgeBase: boolean;
  liveSupportRequired?: boolean;
  appointmentReadyForReview?: boolean;
  appointmentSubmitted?: boolean;
  leadCaptured?: boolean;
  quickReplies?: string[];
  debugTrace?: Record<string, any>;
}
