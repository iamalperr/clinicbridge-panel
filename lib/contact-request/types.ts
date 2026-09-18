/**
 * Contact Request / Human Handoff domain types.
 * Sibling to appointments — never creates appointment records.
 */

export type ContactRequestStatus =
  | "pending"
  | "acknowledged"
  | "contacted"
  | "resolved"
  | "cancelled";

export type PreferredContactMethod =
  | "phone"
  | "sms"
  | "whatsapp"
  | "email"
  | "unspecified";

/** Channel that originated the request (extensible; not web-widget-only). */
export type ContactRequestChannel =
  | "web_widget"
  | "voice"
  | "whatsapp"
  | "api"
  | "other";

export const UNRESOLVED_CONTACT_REQUEST_STATUSES: ContactRequestStatus[] = [
  "pending",
  "acknowledged",
  "contacted",
];

export interface ContactRequest {
  id: string;
  clinicId: string;
  conversationId: string;
  patientName?: string;
  patientPhone?: string;
  patientEmail?: string;
  preferredContactMethod: PreferredContactMethod;
  patientNote?: string;
  language: string;
  channel: ContactRequestChannel;
  source: string;
  status: ContactRequestStatus;
  idempotencyKey: string;
  clinicNotificationStatus?: string;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt?: string;
  contactedAt?: string;
  resolvedAt?: string;
  cancelledAt?: string;
}

export interface CreateContactRequestPayload {
  clinicId: string;
  conversationId: string;
  patientName?: string;
  patientPhone?: string;
  patientEmail?: string;
  preferredContactMethod: PreferredContactMethod;
  patientNote?: string;
  language: string;
  channel: ContactRequestChannel;
  source?: string;
  idempotencyKey: string;
}

export interface CreateContactRequestResult {
  success: boolean;
  contactRequestId?: string;
  record?: ContactRequest;
  isDuplicate?: boolean;
  clinicNotificationStatus?: string;
  reason?: string;
  code?: string;
}

export interface UpdateContactRequestStatusResult {
  success: boolean;
  record?: ContactRequest;
  reason?: string;
}
