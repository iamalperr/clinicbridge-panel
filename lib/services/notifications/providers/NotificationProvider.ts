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
  messageId?: string;
  error?: string;
  rawResponse?: any;
}

export interface NotificationProvider {
  channel: NotificationChannel;
  send(payload: NotificationPayload): Promise<NotificationProviderResult>;
}
