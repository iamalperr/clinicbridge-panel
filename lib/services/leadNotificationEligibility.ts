/**
 * Pure eligibility helpers for lead notification gates.
 * Kept free of Firebase/Resend so unit tests stay lightweight.
 */

/** Canonical agency lead statuses that mean the lead was actually submitted. */
const SUBMITTED_LIKE_STATUSES = new Set([
  "submitted", // legacy literal (no longer written by submitAgencyLead)
  "new",
  "pre_qualified",
  "waiting_for_assignment",
  "assigned_to_clinic",
  "clinic_contacted",
  "quote_requested",
  "appointment_requested",
  "converted",
]);

/**
 * Agency leads never use the legacy status literal "submitted".
 * Treat post-create operational statuses (+ submittedAt) as eligible.
 */
export function isLeadSubmittedForPatientNotification(lead: {
  status?: string | null;
  submittedAt?: unknown;
}): boolean {
  if (lead?.submittedAt) return true;
  const status = String(lead?.status || "").toLowerCase();
  if (!status || status === "lost") return false;
  return SUBMITTED_LIKE_STATUSES.has(status);
}
