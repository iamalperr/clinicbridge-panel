import type { CanonicalConversationStatus } from "@/lib/services/conversations/conversationStatusResolver";

export type { CanonicalConversationStatus };
export type LogStatus = CanonicalConversationStatus | "answered" | "liveSupport" | "unanswered" | "appointment" | "collecting" | "open" | string;

export interface CustomLabel {
  id: string;
  labelTr: string;
  labelEn: string;
  color: string;
  isPreset: boolean;
  isActive: boolean;
  order?: number;
}

export interface ConversationLog {
  id: string;
  clinicId: string;
  patientName?: string;
  patientPhone?: string;
  patientEmail?: string;
  language: string;
  status: LogStatus;
  createdAt: string; 
  updatedAt: string;
  totalMessages: number;
  lastMessagePreview: string;
  needsTraining: boolean;
  trainingTopic?: string;
  convertedToAppointment: boolean;
  appointmentId?: string;
  // Custom label & manual conversion fields
  customLabelId?: string | null;
  customLabelName?: string | null;
  customLabel?: string | null;
  manualConversionStatus?: "converted_to_appointment" | null;
  manualConversionMarkedAt?: string | null;
  manualConversionMarkedBy?: string | null;
  manualConversionRemovedAt?: string | null;
  manualConversionRemovedBy?: string | null;
}

export interface ConversationMessage {
  id: string;
  sender: "patient" | "assistant" | "system";
  content: string;
  createdAt: string;
  confidenceScore?: number;
  wasAnswered: boolean;
  intent?: string;
  needsTraining: boolean;
}
