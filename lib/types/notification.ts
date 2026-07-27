export type NotificationChannel = 'email' | 'whatsapp' | 'sms';

export type NotificationStatus = 
  | 'queued'
  | 'processing'
  | 'sent'
  | 'delivered'
  | 'bounced'
  | 'complained'
  | 'failed'
  | 'retrying'
  | 'permanently_failed';

export type AppointmentEventType =
  | 'appointment.request.created'
  | 'appointment.review.started'
  | 'appointment.clinic.approved'
  | 'appointment.alternative.proposed'
  | 'appointment.patient.accepted'
  | 'appointment.patient.declined'
  | 'appointment.confirmed'
  | 'appointment.rejected'
  | 'appointment.cancelled'
  | 'appointment.expired';

export interface NotificationEvent {
  id?: string;
  tenant_id: string;
  agency_id?: string;
  clinic_id: string;
  appointment_id?: string;
  patient_id?: string;
  event_type: AppointmentEventType;
  channel: NotificationChannel;
  recipient: string; // email address, phone number
  template_id?: string;
  provider_message_id?: string;
  status: NotificationStatus;
  attempt_count: number;
  idempotency_key?: string;
  sent_at?: Date;
  delivered_at?: Date;
  failed_at?: Date;
  failure_reason?: string;
  created_at: Date;
  updated_at: Date;
}

export interface PatientNotificationPreferences {
  patient_id: string;
  clinic_id: string;
  email_enabled: boolean;
  whatsapp_enabled: boolean;
  sms_enabled: boolean;
  preferred_language: string;
  created_at: Date;
  updated_at: Date;
}

export interface AppointmentActionToken {
  id?: string;
  token: string;
  appointment_id: string;
  clinic_id: string;
  patient_id: string;
  action_type: 'accept_time' | 'request_alternative' | 'confirm_appointment';
  expires_at: Date;
  used: boolean;
  used_at?: Date;
  created_at: Date;
}

export interface NotificationChannelConfig {
  channel: NotificationChannel;
  enabled: boolean;
  provider: string; // 'resend', 'twilio', etc.
  sender_name?: string;
  sender_address?: string; // e.g. "no-reply@clinicbridge-ai.com"
  reply_to?: string;
  signature?: string;
  default_language: string;
}

export interface ClinicNotificationSettings {
  clinic_id: string;
  patient_notifications_enabled: boolean;
  channels: NotificationChannelConfig[];
  enabled_events: AppointmentEventType[];
  created_at: Date;
  updated_at: Date;
}

export interface ClinicEmailSettings {
  id?: string;
  tenantId: string;
  clinicId: string;
  emailEnabled: boolean;
  senderDisplayName: string;
  replyToEmail: string;
  defaultLocale: 'tr' | 'en';
  emailSignature: string;
  logoUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}
