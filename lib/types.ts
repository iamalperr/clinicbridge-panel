export type Plan = "starter" | "pro" | "enterprise";
export type ClinicStatus = "active" | "inactive" | "trial";

export type UserRole = "admin" | "clinicUser";

export interface UserProfile {
  id?: string;
  uid: string;
  name?: string;
  email: string;
  role: UserRole;
  status?: "active" | "pending" | "suspended";
  clinicId?: string;
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
  };
  messages?: number;
  conversations?: number;
  appointmentCount?: number;
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
  createdAt: string | number | object;
  updatedAt: string | number | object;
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

export interface WidgetSettings {
  title: string;
  welcomeMessage: string;
  primaryColor: string;
  position: "bottom-right" | "bottom-left";
  showAvatar: boolean;
  showOnlineStatus: boolean;
  placeholder: string;
  showBubbles?: ShowBubblesConfig;
  quickActions?: QuickAction[];
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
  patientEmail?: string;
  service?: string;
  requestedService?: string;
  treatmentType?: string;
  reason?: string;
  preferredDate?: string;
  requestedDate?: string;
  preferredTime?: string;
  requestedTime?: string;
  appointmentDateTime?: string;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  source: "ai_chat" | "manual" | "widget" | string;
  notes?: string;
  originalText?: string;
  rawConversationSummary?: string;
  conversationId?: string;
  notificationStatus?: {
    smsToPatient: "pending" | "sent" | "failed" | "skipped";
    emailToClinic: "pending" | "sent" | "failed" | "skipped";
  };
  smsNotificationStatus?: "sent" | "failed" | "skipped" | "invalid_phone";
  smsNotificationLastSentAt?: string;
  smsNotificationLastType?: string;
  smsNotificationError?: string;
  smsNotificationMessagePreview?: string;
  createdBy?: string;
  language?: string;
  createdAt: any;
  updatedAt?: any;
}
