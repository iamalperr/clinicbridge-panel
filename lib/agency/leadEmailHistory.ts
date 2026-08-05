/**
 * Pure helpers for lead detail "E-posta Geçmişi" badges.
 * Source of truth: notification_jobs, then lead.notificationStatus / legacy flags.
 */

export type LeadEmailHistoryKind = "agency" | "patient";
export type LeadEmailHistoryBadge = "sent" | "failed" | "processing" | "skipped" | "not_sent";

/** Keep in sync with AGENCY_LEAD_NOTIFICATION_EVENT in agencyQuoteNotificationContent. */
export const AGENCY_LEAD_EMAIL_EVENT = "agency_lead_submitted";
export const PATIENT_LEAD_NOTIFICATION_EVENT = "patient_request_received";

export function isAgencyNotificationJob(job: {
  eventType?: string;
  notificationType?: string;
  templateKey?: string;
}): boolean {
  const event = String(job.eventType || job.notificationType || "");
  return (
    event === AGENCY_LEAD_EMAIL_EVENT ||
    String(job.templateKey || "") === "agency_new_quote_request"
  );
}

export function isPatientNotificationJob(job: {
  eventType?: string;
  notificationType?: string;
  templateKey?: string;
}): boolean {
  const event = String(job.eventType || job.notificationType || "");
  return (
    event === PATIENT_LEAD_NOTIFICATION_EVENT ||
    String(job.templateKey || "") === "patient_request_received"
  );
}

function badgeFromJobStatus(status?: string): LeadEmailHistoryBadge | null {
  const s = String(status || "").toLowerCase();
  if (s === "sent") return "sent";
  if (s === "failed") return "failed";
  if (s === "processing" || s === "pending" || s === "retrying") return "processing";
  if (s === "skipped" || s === "config_missing") return "skipped";
  return null;
}

/**
 * Resolve agency/patient email history badge for the lead detail UI.
 */
export function resolveLeadEmailHistoryBadge(params: {
  kind: LeadEmailHistoryKind;
  jobs?: Array<{
    eventType?: string;
    notificationType?: string;
    templateKey?: string;
    status?: string;
  }>;
  lead?: {
    notificationStatus?: string | null;
    notificationSentAt?: unknown;
    notificationEmailSent?: boolean;
    patientEmailSent?: boolean;
  } | null;
}): LeadEmailHistoryBadge {
  const jobs = Array.isArray(params.jobs) ? params.jobs : [];
  const matching = jobs.filter((job) =>
    params.kind === "agency" ? isAgencyNotificationJob(job) : isPatientNotificationJob(job)
  );

  // Prefer an explicit sent job if any exist (retries may leave older failed docs).
  if (matching.some((j) => String(j.status || "").toLowerCase() === "sent")) {
    return "sent";
  }

  // Latest matching job by array order (caller usually unordered — pick best signal).
  for (const job of matching) {
    const fromJob = badgeFromJobStatus(job.status);
    if (fromJob === "failed" || fromJob === "processing" || fromJob === "skipped") {
      // Continue scanning for a better status; keep as fallback below.
    }
  }

  const nonSent = matching
    .map((j) => badgeFromJobStatus(j.status))
    .filter((b): b is LeadEmailHistoryBadge => Boolean(b));
  if (nonSent.includes("processing")) return "processing";
  if (nonSent.includes("failed")) return "failed";
  if (nonSent.includes("skipped")) return "skipped";

  const lead = params.lead || {};
  if (params.kind === "agency") {
    if (
      lead.notificationEmailSent === true ||
      Boolean(lead.notificationSentAt) ||
      String(lead.notificationStatus || "").toLowerCase() === "sent"
    ) {
      return "sent";
    }
    const ns = String(lead.notificationStatus || "").toLowerCase();
    if (ns === "failed") return "failed";
    if (ns === "pending" || ns === "retrying") return "processing";
    if (ns === "skipped" || ns === "config_missing") return "skipped";
  } else if (lead.patientEmailSent === true) {
    return "sent";
  }

  return "not_sent";
}

export function leadEmailHistoryBadgeLabel(
  badge: LeadEmailHistoryBadge,
  locale: string = "tr"
): string {
  const isEn = locale.toLowerCase().startsWith("en");
  switch (badge) {
    case "sent":
      return isEn ? "Sent" : "Gönderildi";
    case "failed":
      return isEn ? "Failed" : "Başarısız";
    case "processing":
      return isEn ? "Sending…" : "Gönderiliyor…";
    case "skipped":
      return isEn ? "Skipped" : "Atlandı";
    default:
      return isEn ? "Not sent" : "Gönderilmedi";
  }
}

export function leadEmailHistoryBadgeVariant(
  badge: LeadEmailHistoryBadge
): "success" | "danger" | "warning" | "default" {
  if (badge === "sent") return "success";
  if (badge === "failed") return "danger";
  if (badge === "processing" || badge === "skipped") return "warning";
  return "default";
}
