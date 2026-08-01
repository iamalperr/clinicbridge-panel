/**
 * Unified Conversation Schemas & Types for ClinicBridge AI Engine
 * Shared across Clinic Portal, Agency Portal, Public Widget, and Embedded Widget.
 *
 * Implements a generalized, scalable taxonomy:
 * Intent + Entity + InformationType + Multi-Turn Context
 */

export type ConversationIntent =
  | "greeting"
  | "casual_conversation"
  | "treatment_information"
  | "pricing_request"
  | "doctor_information"
  | "clinic_information"
  | "location_request"
  | "clinic_location" // backwards-compatible alias for location_request
  | "working_hours_request"
  | "clinic_working_hours" // backwards-compatible alias for working_hours_request
  | "availability_request"
  | "clinic_recommendation"
  | "clinic_comparison"
  | "appointment_start"
  | "appointment_continuation"
  | "appointment_correction"
  | "appointment_confirmation"
  | "quote_request"
  | "contact_request"
  | "live_support_request"
  | "complaint"
  | "confirmation"
  | "rejection"
  | "language_switch"
  | "cancel"
  | "restart"
  | "help"
  | "small_talk"
  | "emergency"
  | "off_topic"
  | "unknown";

export type InformationType =
  | "price"
  | "duration"
  | "suitability"
  | "recovery"
  | "process"
  | "material"
  | "warranty"
  | "availability"
  | "location"
  | "opening_hours"
  | "general"
  | string;

export type ContactTarget =
  | "clinic_team"
  | "doctor"
  | "human_agent"
  | "whatsapp"
  | "phone"
  | "email"
  | string;

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

export type ExpectedSlot =
  | "treatment"
  | "preferredDate"
  | "preferredTime"
  | "fullName"
  | "phone"
  | "email"
  | "confirmation"
  | "all_info_provided"
  | string;

export type PendingActionType =
  | "submit_appointment"
  | "show_doctor_information"
  | "request_quote"
  | "create_live_support_request"
  | "continue_clinic_selection"
  | "general_confirmation"
  | string;

export type PendingActionStatus = "pending" | "consumed" | "cancelled" | "expired";

export interface PendingAction {
  id: string;
  type: PendingActionType;
  createdAt: string; // ISO
  sourceAssistantMessageId?: string;
  payloadReference?: string;
  payload?: any;
  status: PendingActionStatus;
  description?: string;
}

export interface ConversationSlots {
  // Treatment & Clinical
  treatment?: string; // Canonical treatment identifier (e.g. "composite_filling", "implant", "zirconium", "root_canal")
  rawTreatmentText?: string;
  doctor?: string;
  clinic?: string;
  selectedClinicId?: string;
  selectedClinicName?: string;

  // Geographic
  city?: string;
  district?: string;
  country?: string;

  // Language & Financial
  language?: string;
  priceCurrency?: string; // e.g. "EUR", "USD", "TRY", "GBP"

  // Date & Time
  date?: string; // ISO YYYY-MM-DD
  preferredDate?: string; // ISO YYYY-MM-DD
  rawDateText?: string;
  preferredWeekday?: string;
  time?: string; // e.g. "14:00"
  preferredTime?: string; // e.g. "14:00", "sabah", "öğleden sonra", "morning"
  rawTimeText?: string;
  timePreference?: "morning" | "afternoon" | "evening" | "specific" | string;

  // Patient & Contact
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  contactTarget?: ContactTarget;
  visitType?: VisitType;
  informationType?: InformationType;

  // Consents & Flow
  kvkkConsent?: boolean;
  expectedSlot?: ExpectedSlot;
  notes?: string;

  [key: string]: any;
}

export type ConversationEntities = ConversationSlots;

export interface IntentClassificationResult {
  intent: ConversationIntent;
  confidence: number; // 0.0 - 1.0
  entities: Partial<ConversationSlots>;
  requiresKnowledgeBase: boolean;
  requiresPricingData?: boolean;
  shouldContinueActiveFlow: boolean;
  isInterruption?: boolean;
  interruptionReason?: string;
  clarificationNeeded?: boolean;
  clarificationPrompt?: string;
  suggestedOptions?: string[];
  matchedKeywords?: string[];
  explanation?: string;
  suggestedNextState?: ConversationState;
  validationError?: "invalid_email" | "invalid_phone" | "invalid_date" | "invalid_time" | string;
  allInfoProvidedIntent?: boolean;
  pendingAction?: PendingAction | null;

  // Explicit Slot & Locale Routing
  targetSlot?: ExpectedSlot;
  targetLocale?: string;

  // Multi-Intent Support (e.g. Confirmation + Question, Slot + Question)
  multiIntentDetected?: boolean;
  secondaryIntent?: ConversationIntent;
  secondaryQuery?: string;
  secondaryRequiresKnowledgeBase?: boolean;
}

export interface ConversationContext {
  clinicId?: string;
  clinicName?: string;
  agencyId?: string;
  agencySlug?: string;
  conversationId: string;
  sessionId?: string;
  channel: "admin" | "web_widget" | "agency_widget" | "embedded" | "whatsapp" | "other";
  locale: string;
  currentState: ConversationState;
  currentFlow?: "appointment" | "lead" | "quote" | "general";
  expectedSlot?: ExpectedSlot;
  slots: Partial<ConversationSlots>;

  // Pending Action Ownership
  pendingAction?: PendingAction | null;
  appointmentSubmitted?: boolean;
  submittedAppointmentId?: string;

  // Multi-Turn Context Memory
  activeTopic?: string;
  activeTreatment?: string;
  activeClinic?: string;
  lastIntent?: ConversationIntent;
  lastInformationType?: InformationType;
  offeredActions?: string[];
  pendingQuestion?: string;

  history?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  turkishContactNumber?: string;
  internationalContactNumber?: string;
  isAgencyClinic?: boolean;
}

export interface StateTransitionResult {
  previousState: ConversationState;
  nextState: ConversationState;
  updatedSlots: Partial<ConversationSlots>;
  missingRequiredSlots: (keyof ConversationSlots)[] | string[];
  expectedSlot?: ExpectedSlot;
  pendingAction?: PendingAction | null;
  nextPromptNeeded?: string;
  validationError?: string;
  isComplete: boolean;
}

export interface EngineExecutionOutput {
  reply: string;
  intent: ConversationIntent;
  previousState: ConversationState;
  nextState: ConversationState;
  slots: Partial<ConversationSlots>;
  expectedSlot?: ExpectedSlot;
  pendingAction?: PendingAction | null;
  requiresKnowledgeBase: boolean;
  requiresPricingData?: boolean;
  fallbackBlockedReason?: string;
  liveSupportRequired?: boolean;
  appointmentReadyForReview?: boolean;
  appointmentSubmitted?: boolean;
  leadCaptured?: boolean;
  quickReplies?: string[];
  debugTrace?: Record<string, any>;
}

