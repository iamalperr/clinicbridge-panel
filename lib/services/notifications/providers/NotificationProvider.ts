import { NotificationChannel, AppointmentEventType } from '../../../types/notification';

export interface NotificationPayload {
  to: string;
  templateId?: string;
  subject?: string; // primarily for email
  language: string;
  variables: Record<string, any>;
  idempotencyKey?: string;
}

export interface NotificationProviderResult {
  success: boolean;
  attempted: boolean;
  accepted: boolean;
  status: "ACCEPTED" | "FAILED" | "MISSING_RECIPIENT" | "NOT_CONFIGURED" | "UNKNOWN";
  messageId?: string; // corresponds to providerMessageId
  errorCode?: string | null;
  errorMessage?: string | null;
  rawResponse?: any;
}

export interface NotificationProvider {
  channel: NotificationChannel;
  send(payload: NotificationPayload): Promise<NotificationProviderResult>;
}
