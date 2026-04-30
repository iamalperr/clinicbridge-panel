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

export interface WidgetSettings {
  title: string;
  welcomeMessage: string;
  primaryColor: string;
  position: "bottom-right" | "bottom-left";
  showAvatar: boolean;
  showOnlineStatus: boolean;
  placeholder: string;
  showBubbles?: ShowBubblesConfig;
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
  patientId: string;
  patientName: string;
  service: string;
  preferredDate: string;
  preferredTime: string;
  status: "pending" | "confirmed" | "cancelled";
  source: "ai-chat" | "manual";
  notes?: string;
  createdAt: any;
  updatedAt: any;
}
