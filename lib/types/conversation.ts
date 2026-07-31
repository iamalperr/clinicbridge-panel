export type ConversationStatus = 
  | "active" 
  | "qualified" 
  | "clinic_recommended" 
  | "quote_requested" 
  | "appointment_scheduled" 
  | "abandoned";

export interface ChatMessageSummary {
  role: "user" | "assistant" | "system";
  content: string;
  type?: string;
  timestamp: any;
}

export interface Conversation {
  id: string; // Typically maps to sessionId
  agencyId: string;
  
  // Patient & Context Data
  patientName?: string;
  language: string;
  treatmentCategory?: string;
  subTreatment?: string;
  location?: string;
  
  // Status & Funnel
  status: ConversationStatus;
  leadStage?: string; // e.g. "discovery", "collecting_email", "completed"
  
  // Stats
  messagesCount: number;
  aiCompletionRate: number; // 0-100 based on funnel progress
  
  // Entity References
  leadId?: string;
  quoteRequestId?: string;
  appointmentId?: string;
  recommendedClinicIds?: string[];
  selectedClinicId?: string;
  
  // Future proofing metrics
  rating?: number;
  sentiment?: "positive" | "neutral" | "negative";
  durationSeconds?: number;
  
  // Conversation Data
  history: ChatMessageSummary[];
  extractedIntake?: Record<string, any>;
  
  // Timestamps
  createdAt: any;
  updatedAt: any;
  lastActivityAt: any;
}
