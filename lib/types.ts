export type Plan = "trial" | "pro" | "enterprise";
export type ClinicStatus = "active" | "inactive" | "trial";

export type UserRole = "superAdmin" | "admin" | "agencyAdmin" | "agencyUser" | "clinicAdmin" | "clinicUser" | "viewer";

export type PermissionTab = 
  | "dashboard"          // Global Clinics
  | "analytics"          // Global Analytics
  | "demo_requests"      // Global Demo Requests
  | "ai_usage"           // Global AI Usage
  | "agency_portal"      // Global Agency Portal
  | "users"              // Global Users
  | "system_settings"    // Global Settings
  | "clinic_overview"    // Clinic Dashboard (Overview)
  | "clinic_prompt"      // AI Prompt Ayarları (Prompt Studio)
  | "clinic_voice"       // Voice
  | "clinic_widget"      // Widget Ayarları
  | "clinic_training"    // AI Bilgi Havuzu (Training)
  | "clinic_notes"       // Notes
  | "clinic_usage"       // Usage
  | "clinic_logs"        // Konuşmalar (Logs)
  | "clinic_appointments"// Randevu Talepleri (Appointments)
  | "clinic_settings";   // Sistem Ayarları (Settings)

export const AGENCY_PORTAL_BUNDLE: PermissionTab[] = [
  "agency_portal",
  "clinic_overview",
  "clinic_prompt",
  "clinic_voice",
  "clinic_widget",
  "clinic_training",
  "clinic_notes",
  "clinic_usage",
  "clinic_logs",
  "clinic_appointments",
  "clinic_settings"
];

export const DEFAULT_PERMISSIONS: Record<UserRole, PermissionTab[]> = {
  superAdmin: ["dashboard", "analytics", "demo_requests", "ai_usage", "agency_portal", "users", "system_settings", "clinic_overview", "clinic_prompt", "clinic_voice", "clinic_widget", "clinic_training", "clinic_notes", "clinic_usage", "clinic_logs", "clinic_appointments", "clinic_settings"],
  admin: ["dashboard", "analytics", "demo_requests", "ai_usage", "agency_portal", "users", "system_settings", "clinic_overview", "clinic_prompt", "clinic_voice", "clinic_widget", "clinic_training", "clinic_notes", "clinic_usage", "clinic_logs", "clinic_appointments", "clinic_settings"],
  agencyAdmin: [...AGENCY_PORTAL_BUNDLE],
  agencyUser: [...AGENCY_PORTAL_BUNDLE],
  clinicAdmin: ["clinic_overview", "clinic_prompt", "clinic_voice", "clinic_widget", "clinic_training", "clinic_notes", "clinic_usage", "clinic_logs", "clinic_appointments", "clinic_settings"],
  clinicUser: ["clinic_overview", "clinic_logs", "clinic_appointments", "clinic_training"],
  viewer: ["clinic_overview", "clinic_logs", "clinic_appointments"]
};

// ─── Role Helpers ─────────────────────────────────────────────────────────────
// "admin" is a backward-compatible alias for "superAdmin" in Firestore.
// Both grant full platform access.

export function isSuperAdmin(role?: string): boolean {
  return role === "superAdmin" || role === "admin";
}

export function isAgencyRole(role?: string): boolean {
  return role === "agencyAdmin" || role === "agencyUser";
}

export function isClinicRole(role?: string): boolean {
  return role === "clinicAdmin" || role === "clinicUser" || role === "viewer";
}

export function getRoleDisplayName(role?: string): string {
  switch (role) {
    case "superAdmin":
    case "admin":
      return "Super Admin";
    case "agencyAdmin":
      return "Agency Admin";
    case "agencyUser":
      return "Agency User";
    case "clinicAdmin":
      return "Clinic Admin";
    case "clinicUser":
      return "Clinic User";
    case "viewer":
      return "Viewer";
    default:
      return role || "Unknown";
  }
}

export interface UserProfile {
  id?: string;
  uid: string;
  name?: string;
  email: string;
  role: UserRole;
  permissions?: PermissionTab[];
  status?: "active" | "pending" | "suspended";
  clinicId?: string;
  agencyId?: string;
  createdAt?: string | number | { seconds: number; nanoseconds: number } | object;
}

export interface Clinic {
  id: string;
  name: string;
  domain?: string;
  plan?: Plan;
  status?: ClinicStatus;
  language?: string;
  timezone?: string;
  email?: string;
  phone?: string;
  whatsappNumber?: string;
  turkishContactNumber?: string;
  internationalContactNumber?: string;
  telegramUsername?: string;
  enableHumanHandoff?: boolean;
  aiEnabled?: "active" | "inactive";
  kvkkRequired?: boolean;
  welcomeMessage?: string;
  createdAt?: string | number | { seconds: number; nanoseconds: number } | object;
  lastActive?: string;
  modules?: {
    ai: boolean;
    widget: boolean;
    voice: boolean;
    sms?: boolean; // ileride SMS / Notifications için
  };
  messages?: number;
  conversations?: number;
  appointmentCount?: number;
  aiUsageSettings?: {
    budgetLimitUsd: number;
    showCostToClinicUsers: boolean;
    notifyOnLimits: boolean;
  };
}

export interface ConversationLog {
  id: string;
  userName: string;
  firstMessage: string;
  messageCount: number;
  status: "resolved" | "open" | "escalated";
  timestamp: string;
  durationSec: number;
}

export interface TrainingEntry {
  id: string;
  type: "url" | "file" | "text";
  title: string;
  source: string;
  status: "indexed" | "pending" | "failed";
  createdAt: string;
}

export interface TrainingMaterial {
  id: string;
  title: string;
  content: string;
  category?: string;
  tags?: string[];
  type: "note";
  status: "learned" | "pending";
  clinicId: string;
  entity_type?: "doctor_profile" | "treatment_profile" | "clinic_general_information" | "pricing_information" | "appointment_information" | "policy_information" | "general";
  embedding_status?: "pending" | "indexing" | "indexed" | "failed";
  last_error?: string | null;
  createdAt: string | number | object;
  updatedAt: string | number | object;
}

// ─── Structured Doctor Record ────────────────────────────────────────────────
export interface ClinicDoctor {
  id?: string;
  clinic_id: string;
  full_name: string;
  doctorName?: string;
  title?: string;
  professional_title: string;
  doctor_type: "specialist_dentist" | "general_dentist" | "dentist";
  is_active: boolean;
  specialist_status: boolean | null;
  primary_specialization_code?: string;
  clinical_field_codes: string[];
  treatment_codes: string[];
  treatments?: string[] | string;
  specialty?: string;
  primary_specialization?: string;
  department?: string;
  education?: string;
  experienceYears?: number;
  languages: string[];
  biography?: string;
  display_order?: number;
  order?: number;
  createdAt?: any;
  updatedAt?: any;
}

// ─── Structured Treatment Record ─────────────────────────────────────────────
export interface ClinicTreatment {
  id?: string;
  clinic_id: string;
  treatment_code: string;
  treatment_name: string;
  treatment_category?: string;
  is_active: boolean;
  definition?: string;
  indications?: string;
  suitability_factors?: string;
  process?: string;
  estimated_duration_rule?: string;
  safety_rules?: string;
  assigned_doctor_ids: string[];
  before_after_url?: string;
  patient_phrase_synonyms?: string[];
  createdAt?: any;
  updatedAt?: any;
}

export interface ShowBubblesConfig {
  enabled: boolean;
  displayMode: "rotate" | "show-all" | "disabled";
  messages: {
    tr: string[];
    en: string[];
  };
  timing: {
    initialDelaySeconds: number;
    rotationIntervalSeconds: number;
    autoHideSeconds: number;
  };
  behavior: {
    hideAfterOpen: boolean;
    showOncePerSession: boolean;
    disableOnMobile: boolean;
  };
}

export type QuickActionType =
  | "appointment_request"
  | "treatment_info"
  | "describe_complaint"
  | "clinic_services"
  | "pricing_info"
  | "contact_request"
  | "custom_prompt";

export interface QuickAction {
  id: string;
  labelTR: string;
  labelEN: string;
  emoji: string;
  actionType: QuickActionType;
  isActive: boolean;
  sortOrder: number;
  customPrompt?: string; // used when actionType === 'custom_prompt'
}

export type WidgetAvatarType = 
  | "default" 
  | "female_doctor" 
  | "male_doctor" 
  | "clinic_assistant" 
  | "minimal" 
  | "custom";

export type WidgetLanguage = "auto" | "tr" | "en";

export interface WidgetMessageLocale {
  greetingMessage: string;
  inputPlaceholder: string;
  tooltipMessage: string;
  quickActions: string[];
}

export interface WidgetMessages {
  tr: WidgetMessageLocale;
  en: WidgetMessageLocale;
}

export interface WidgetLauncherConfig {
  shape: "rounded_square" | "circle" | "square" | "pill" | "minimal" | "chat_bubble";
  position: "bottom_right" | "bottom_left" | "middle_right" | "middle_left";
  size: "small" | "medium" | "large";
  icon: "tooth" | "chat" | "ai_sparkle" | "medical_plus" | "heart" | "assistant" | "psychology" | "beauty" | "clinic" | "calendar" | "smile" | "minimal";
  text: {
    tr: string;
    en: string;
  };
  showText: boolean;
  showOnlineIndicator: boolean;
  showNotificationDot: boolean;
  tooltipEnabled: boolean;
  tooltipMessage: string;
  tooltipDelaySeconds: number;
  tooltipAutoHide: boolean;
}

export interface WidgetPrivacyConfig {
  enabled: boolean;
  privacyUrl: string;
  requireConsent: boolean;
}

export interface WidgetSettings {
  title: string;
  assistantName?: string;
  welcomeMessage: string;
  primaryColor: string;
  privacy?: WidgetPrivacyConfig;
  position: "bottom-right" | "bottom-left";
  showAvatar: boolean;
  avatarType?: WidgetAvatarType;
  customAvatarUrl?: string;
  showOnlineStatus: boolean;
  placeholder: string;
  showBubbles?: ShowBubblesConfig;
  quickActions?: QuickAction[];
  launcher?: WidgetLauncherConfig;
  /** Multi-language message config */
  defaultLanguage?: WidgetLanguage;
  messages?: WidgetMessages;
  /** Test Mode config */
  testMode?: boolean;
  testModeMessage?: {
    tr: string;
    en: string;
  };
  updatedAt?: any;
}

export interface PromptSettings {
  systemPrompt: string;
  welcomeMessage: string;
  fallbackMessage: string;
  model: string;
  temperature: number;
  qualityCriteria?: {
    accuracy: boolean;
    noGuessing: boolean;
    appointmentRouting: boolean;
    patientSatisfaction: boolean;
    consistency: boolean;
    fastResolution: boolean;
  };
  guardrails?: {
    noDiagnosis: { enabled: boolean; text: string };
    noAssumptions: { enabled: boolean; text: string };
    emergencyRouting: { enabled: boolean; text: string };
    dataPrivacy: { enabled: boolean; text: string };
  };
  /** Per-skill enabled/disabled state — stored in Firestore, read by chat API */
  aiSkills?: Record<string, boolean>;
  updatedAt?: any;
}

export interface Patient {
  id: string;
  clinicId: string;
  fullName: string;
  phone: string;
  email?: string;
  createdAt: any;
  updatedAt: any;
}

export interface Appointment {
  id: string;
  clinicId: string;
  patientId?: string;
  patientName: string;
  patientPhone?: string;
  patientPhoneRaw?: string;
  patientEmail?: string;
  service?: string;
  requestedService?: string;
  treatmentType?: string;
  reason?: string;
  preferredDate?: string;
  preferredDateDisplay?: string;
  requestedDate?: string;
  preferredTime?: string | null;
  requestedTime?: string | null;
  preferredTimeStart?: string | null;
  preferredTimeEnd?: string | null;
  preferredTimePeriod?: "morning" | "afternoon" | "evening" | "earliest_available" | null;
  preferredTimeText?: string | null;
  timezone?: string;
  appointmentDateTime?: string;
  status: "pending" | "PENDING_REVIEW" | "confirmed" | "cancelled" | "completed";
  source: "ai_chat" | "ai_chatbot" | "AI Chatbot" | "manual" | "widget" | string;
  notes?: string;
  originalText?: string;
  rawConversationSummary?: string;
  conversationId?: string;
  idempotencyKey?: string;
  notificationStatus?: {
    smsToPatient: "pending" | "sent" | "failed" | "skipped";
    emailToClinic: "pending" | "sent" | "failed" | "skipped";
  };
  clinicNotificationStatus?: "SENT" | "FAILED" | "NOT_CONFIGURED" | "DISABLED";
  patientNotificationStatusResult?: "SENT" | "FAILED";
  smsNotificationStatus?: "sent" | "failed" | "skipped" | "invalid_phone";
  smsNotificationLastSentAt?: string;
  smsNotificationLastType?: string;
  smsNotificationError?: string;
  smsNotificationMessagePreview?: string;
  notificationChannel?: string;
  patientNotificationStatus?: "NOT_CONFIGURED" | "NOT_REQUESTED" | "MISSING_RECIPIENT" | "QUEUED" | "ACCEPTED" | "SENT" | "DELIVERED" | "FAILED" | "UNKNOWN" | string;
  notificationSentAt?: string;
  notificationError?: string;
  createdBy?: string;
  language?: string;
  createdAt: any;
  updatedAt?: any;
}
