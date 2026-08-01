export type CanonicalAppointmentStatus = 
  | "pending"
  | "under_review"
  | "approved"
  | "confirmed"
  | "rejected"
  | "cancelled"
  | "reschedule_requested"
  | "completed";

export const APPOINTMENT_STATUS_LABELS: Record<CanonicalAppointmentStatus, { tr: string; en: string }> = {
  pending: {
    tr: "Beklemede",
    en: "Pending"
  },
  under_review: {
    tr: "İnceleniyor",
    en: "Under review"
  },
  approved: {
    tr: "Onaylandı",
    en: "Approved"
  },
  confirmed: {
    tr: "Kesinleşti",
    en: "Confirmed"
  },
  rejected: {
    tr: "Reddedildi",
    en: "Rejected"
  },
  cancelled: {
    tr: "İptal edildi",
    en: "Cancelled"
  },
  reschedule_requested: {
    tr: "Yeni tarih talep edildi",
    en: "Reschedule requested"
  },
  completed: {
    tr: "Tamamlandı",
    en: "Completed"
  }
};

export const APPOINTMENT_STATUS_TRANSITIONS: Record<CanonicalAppointmentStatus, CanonicalAppointmentStatus[]> = {
  pending: ["under_review", "approved", "confirmed", "rejected", "cancelled"],
  under_review: ["approved", "confirmed", "rejected", "cancelled"],
  approved: ["confirmed", "cancelled", "reschedule_requested"],
  confirmed: ["confirmed", "cancelled", "completed", "reschedule_requested"],
  reschedule_requested: ["approved", "confirmed", "rejected", "cancelled"],
  rejected: ["pending", "approved", "confirmed"], // Admin might reconsider
  cancelled: ["pending", "approved", "confirmed"], // Admin might reconsider
  completed: ["confirmed"]
};

export interface AppointmentAuditLog {
  id?: string;
  appointmentId: string;
  clinicId: string;
  tenantId?: string;
  oldStatus: CanonicalAppointmentStatus;
  newStatus: CanonicalAppointmentStatus;
  previousConfirmedDate?: string | null;
  previousConfirmedTime?: string | null;
  newConfirmedDate?: string | null;
  newConfirmedTime?: string | null;
  changeReason?: string | null;
  changedByUserId: string;
  changedAt: string;
  notificationAttempted: boolean;
  notificationSucceeded?: boolean;
}

export function isValidTransition(oldStatus: CanonicalAppointmentStatus, newStatus: CanonicalAppointmentStatus): boolean {
  // If staying the same, it's valid (idempotency or reschedule)
  if (oldStatus === newStatus) return true;
  return APPOINTMENT_STATUS_TRANSITIONS[oldStatus]?.includes(newStatus) ?? false;
}

export const isValidStatusTransition = isValidTransition;

// Function to map legacy uppercase/mixed statuses to canonical status
export function mapToCanonicalStatus(rawStatus: string | undefined | null): CanonicalAppointmentStatus {
  if (!rawStatus) return "pending";
  
  const normalized = rawStatus.toLowerCase().trim();
  
  // Direct matches
  if (normalized === "pending") return "pending";
  if (normalized === "under_review" || normalized === "pending_review") return "under_review";
  if (normalized === "approved") return "approved";
  if (normalized === "confirmed") return "confirmed";
  if (normalized === "rejected") return "rejected";
  if (normalized === "cancelled" || normalized === "canceled") return "cancelled";
  if (normalized === "reschedule_requested" || normalized === "reschedule") return "reschedule_requested";
  if (normalized === "completed") return "completed";
  
  // Default fallback
  return "pending";
}
