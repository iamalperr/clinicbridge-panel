export type LogStatus = "answered" | "liveSupport" | "unanswered" | "appointment" | "collecting";

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
