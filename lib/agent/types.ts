/**
 * Channel-agnostic Agent Core types (Phase 1).
 * Operates on normalized text turns only — no audio/telephony concepts.
 */

/** Internal agent channel. Maps to AI usage / conversation enums without migrating them. */
export type AgentChannel = "web_widget" | "voice" | "api" | "other";

export type AppointmentState =
  | "IDLE"
  | "COLLECTING_INFO"
  | "COLLECTING_NAME"
  | "COLLECTING_PHONE"
  | "COLLECTING_EMAIL"
  | "COLLECTING_TREATMENT"
  | "COLLECTING_DATE"
  | "COLLECTING_TIME"
  | "AWAITING_DATE_CLARIFICATION"
  | "AWAITING_CONFIRMATION"
  | "SUBMITTING_APPOINTMENT"
  | "APPOINTMENT_SUBMITTED"
  | "APPOINTMENT_FAILED";

export interface AppointmentData {
  patientName: string;
  patientPhone: string;
  patientPhoneRaw?: string;
  patientEmail?: string;
  requestedService: string;
  requestedDate: string;
  preferredDateDisplay?: string;
  requestedTime: string | null;
  preferredTimeStart?: string | null;
  preferredTimeEnd?: string | null;
  preferredTimePeriod?: "morning" | "afternoon" | "evening" | "earliest_available" | null;
  preferredTimeText?: string | null;
  timezone?: string;
  originalText: string;
  emailValidationFails?: number;
  requestedDoctor?: {
    id?: string;
    name: string;
  };
  notes?: string;
}

/**
 * Normalized text turn input for the single-clinic Agent Core.
 * Web adapter may still pass history / pendingAppointmentData for backward compatibility.
 */
export interface AgentTurnInput {
  clinicId: string;
  conversationId: string;
  channel: AgentChannel;
  text: string;
  history?: Array<{ role?: string; content?: string }>;
  locale?: string;
  /** Widget-compat: client draft round-trip. Core prefers persisted server draft when present. */
  pendingAppointmentData?: Partial<AppointmentData> | Record<string, unknown> | null;
  widgetId?: string;
  traceId?: string;
  originUrl?: string;
  /** Raw HTTP origin/referer for logging only (web adapter). */
  sourceDomain?: string;
  context?: Record<string, unknown>;
}

export interface AgentTurnEscalation {
  kind: "live_support";
}

/**
 * Channel-agnostic turn result. Web adapter maps `payload` → HTTP JSON.
 * Future Voice adapter uses replyText (+ metadata) after TTS.
 */
export interface AgentTurnResult {
  replyText: string;
  conversationId: string;
  locale?: string;
  appointmentState?: AppointmentState;
  appointmentDraft?: Partial<AppointmentData> | null;
  /** Full widget-compatible response body (unchanged contract). */
  payload: Record<string, any>;
  httpStatus?: number;
  escalation?: AgentTurnEscalation;
  sideEffects?: {
    appointmentCreated?: boolean;
    appointmentId?: string;
  };
  metadata?: Record<string, unknown>;
}
