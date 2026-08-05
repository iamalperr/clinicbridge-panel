/**
 * Pure helpers for FeelinHealthy / agency quote-request email notifications.
 * Kept separate from Firestore/Resend I/O so unit tests do not need Firebase.
 */

import { isValidEmail, normalizeEmail } from "../utils/emailValidation";

export type AgencyNotificationStatus =
  | "pending"
  | "sent"
  | "failed"
  | "retrying"
  | "skipped"
  | "config_missing";

export const AGENCY_LEAD_NOTIFICATION_EVENT = "agency_lead_submitted" as const;

export interface QuoteNotificationSettingsNormalized {
  enabled: boolean;
  recipients: string[];
  cc: string[];
  replyTo?: string;
}

export type QuoteNotificationDeliveryOutcome = "ready" | "disabled" | "config_missing";

export interface QuoteNotificationDelivery {
  enabled: boolean;
  recipients: string[];
  cc: string[];
  replyTo?: string;
  source: string | null;
  outcome: QuoteNotificationDeliveryOutcome;
  configError?: string;
}

export function buildAgencyLeadNotificationJobId(leadId: string): string {
  return `job_${leadId}_${AGENCY_LEAD_NOTIFICATION_EVENT}`;
}

export function buildQuoteRequestPortalUrl(agencyId: string, leadId: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://app.clinicbridge-ai.com").replace(/\/$/, "");
  // Authenticated Portal lead detail — related conversation/quote request record.
  return `${base}/agency/agencies/${agencyId}/leads/${leadId}`;
}

/** Trim, validate, dedupe email lists. Drops empty / invalid entries. */
export function normalizeRecipientList(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,;]+/)
      : value
        ? [value]
        : [];
  const out: string[] = [];
  for (const item of raw) {
    const normalized = normalizeEmail(typeof item === "string" ? item : String(item || ""));
    if (normalized && isValidEmail(normalized) && !out.includes(normalized)) {
      out.push(normalized);
    }
  }
  return out;
}

export function normalizeReplyTo(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const normalized = normalizeEmail(typeof value === "string" ? value : String(value));
  if (!normalized || !isValidEmail(normalized)) return undefined;
  return normalized;
}

/**
 * Normalize Portal-saved quoteNotificationSettings.
 * Invalid emails are dropped; empty strings removed; lists deduped.
 */
export function normalizeQuoteNotificationSettings(
  raw: unknown
): QuoteNotificationSettingsNormalized {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const recipients = normalizeRecipientList(obj.recipients);
  const cc = normalizeRecipientList(obj.cc).filter((email) => !recipients.includes(email));
  const replyTo = normalizeReplyTo(obj.replyTo);
  return {
    enabled: obj.enabled === true,
    recipients,
    cc,
    replyTo,
  };
}

export function validateQuoteNotificationSettingsInput(raw: unknown): {
  settings: QuoteNotificationSettingsNormalized;
  errors: string[];
  warnings: string[];
} {
  const settings = normalizeQuoteNotificationSettings(raw);
  const errors: string[] = [];
  const warnings: string[] = [];
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  // Surface invalid reply-to if user typed something that didn't validate
  if (obj.replyTo && String(obj.replyTo).trim() && !settings.replyTo) {
    errors.push("INVALID_REPLY_TO");
  }

  if (settings.enabled && settings.recipients.length === 0) {
    warnings.push("ENABLED_WITHOUT_RECIPIENTS");
  }

  return { settings, errors, warnings };
}

/**
 * Resolve delivery from canonical quoteNotificationSettings first,
 * then legacy quoteNotificationEmails / notificationEmail.
 * Never invents hard-coded personal addresses.
 */
export function resolveQuoteNotificationDelivery(params: {
  quoteNotificationSettings?: unknown;
  quoteNotificationEmails?: unknown;
  notificationEmail?: unknown;
}): QuoteNotificationDelivery {
  if (params.quoteNotificationSettings != null) {
    const settings = normalizeQuoteNotificationSettings(params.quoteNotificationSettings);
    if (!settings.enabled) {
      return {
        enabled: false,
        recipients: [],
        cc: [],
        replyTo: undefined,
        source: "quoteNotificationSettings",
        outcome: "disabled",
      };
    }
    if (settings.recipients.length === 0) {
      return {
        enabled: true,
        recipients: [],
        cc: settings.cc,
        replyTo: settings.replyTo,
        source: "quoteNotificationSettings",
        outcome: "config_missing",
        configError: "NO_RECIPIENTS_CONFIGURED",
      };
    }
    return {
      enabled: true,
      recipients: settings.recipients,
      cc: settings.cc,
      replyTo: settings.replyTo,
      source: "quoteNotificationSettings",
      outcome: "ready",
    };
  }

  // Legacy fallback for agencies that have not migrated to quoteNotificationSettings yet.
  const legacy = collectQuoteNotificationRecipients({
    quoteNotificationEmails: params.quoteNotificationEmails,
    notificationEmail: params.notificationEmail,
  });
  if (legacy.recipients.length === 0) {
    return {
      enabled: true,
      recipients: [],
      cc: [],
      replyTo: undefined,
      source: null,
      outcome: "config_missing",
      configError: legacy.configError || "NO_RECIPIENTS_CONFIGURED",
    };
  }
  return {
    enabled: true,
    recipients: legacy.recipients,
    cc: [],
    replyTo: undefined,
    source: legacy.source,
    outcome: "ready",
  };
}

/** Collect and validate notification recipients from agency config (no invented addresses). */
export function collectQuoteNotificationRecipients(params: {
  quoteNotificationEmails?: unknown;
  notificationEmail?: unknown;
  ownerEmail?: unknown;
  agencyEmail?: unknown;
  adminEmails?: unknown;
}): { recipients: string[]; source: string | null; configError?: string } {
  const buckets: Array<{ source: string; values: unknown }> = [
    { source: "quoteNotificationEmails", values: params.quoteNotificationEmails },
    { source: "settings.notificationEmail", values: params.notificationEmail },
  ];

  for (const bucket of buckets) {
    const list = normalizeRecipientList(bucket.values);
    if (list.length > 0) {
      return { recipients: list, source: bucket.source };
    }
  }

  return {
    recipients: [],
    source: null,
    configError: "NO_RECIPIENTS_CONFIGURED",
  };
}

export function formatIstanbulSideLabel(side?: string | null, lang: "tr" | "en" = "tr"): string | null {
  const s = String(side || "").toLowerCase();
  if (!s) return null;
  if (s === "european" || s === "avrupa") return lang === "tr" ? "Avrupa Yakası" : "European Side";
  if (s === "anatolian" || s === "anadolu" || s === "asian") {
    return lang === "tr" ? "Anadolu Yakası" : "Anatolian Side";
  }
  return side || null;
}

export function buildAgencyQuoteNotificationContent(params: {
  lang: "tr" | "en";
  patientName?: string | null;
  patientEmail?: string | null;
  patientPhone?: string | null;
  patientCountry?: string | null;
  treatmentLabel?: string | null;
  preferredCity?: string | null;
  istanbulSide?: string | null;
  travelDate?: string | null;
  clinicNames: string[];
  quoteRequestId: string;
  conversationId?: string | null;
  portalUrl: string;
  createdAt?: string | null;
  status?: string | null;
}): { subject: string; html: string; text: string } {
  const name = params.patientName || (params.lang === "tr" ? "Bilinmiyor" : "Unknown");
  const treatment = params.treatmentLabel || (params.lang === "tr" ? "Belirtilmedi" : "Not specified");
  const sideLabel = formatIstanbulSideLabel(params.istanbulSide, params.lang);
  const city = params.preferredCity || (params.lang === "tr" ? "Belirtilmedi" : "Not specified");
  const travel = params.travelDate || (params.lang === "tr" ? "Belirtilmedi" : "Not specified");
  const created = params.createdAt || new Date().toISOString();
  const status = params.status || "requested";
  const clinics =
    params.clinicNames.length > 0
      ? params.clinicNames
      : [params.lang === "tr" ? "Klinik adı çözümlenemedi" : "Clinic name unresolved"];

  const subject =
    params.lang === "tr"
      ? `Yeni Teklif Talebi – ${name} – ${treatment}`
      : `New Quote Request – ${name} – ${treatment}`;

  const clinicListHtml = clinics.map((c) => `<li>${escapeHtml(c)}</li>`).join("");
  const clinicListText = clinics.map((c) => `- ${c}`).join("\n");

  if (params.lang === "tr") {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
        <h2 style="color: #0d9488;">Yeni Teklif Talebi</h2>
        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Hasta</h3>
        <p><strong>Ad Soyad:</strong> ${escapeHtml(name)}</p>
        <p><strong>E-posta:</strong> ${escapeHtml(params.patientEmail || "-")}</p>
        <p><strong>Telefon:</strong> ${escapeHtml(params.patientPhone || "-")}</p>
        <p><strong>Ülke:</strong> ${escapeHtml(params.patientCountry || "-")}</p>
        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Talep</h3>
        <p><strong>Tedavi:</strong> ${escapeHtml(treatment)}</p>
        <p><strong>Tercih edilen şehir:</strong> ${escapeHtml(city)}</p>
        ${sideLabel ? `<p><strong>İstanbul yakası:</strong> ${escapeHtml(sideLabel)}</p>` : ""}
        <p><strong>Planlanan seyahat:</strong> ${escapeHtml(travel)}</p>
        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Talep edilen klinikler</h3>
        <ul>${clinicListHtml}</ul>
        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Konuşma</h3>
        <p><a href="${escapeHtml(params.portalUrl)}" style="color:#0d9488;font-weight:700;">Portalda kaydı aç</a></p>
        ${params.conversationId ? `<p style="font-size:12px;color:#64748b;">Konuşma ID: ${escapeHtml(params.conversationId)}</p>` : ""}
        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Teklif kaydı</h3>
        <p><strong>Teklif talebi ID:</strong> ${escapeHtml(params.quoteRequestId)}</p>
        <p><strong>Oluşturulma:</strong> ${escapeHtml(created)}</p>
        <p><strong>Durum:</strong> ${escapeHtml(status)}</p>
      </div>`;
    const text = [
      "Yeni Teklif Talebi",
      `Ad Soyad: ${name}`,
      `E-posta: ${params.patientEmail || "-"}`,
      `Telefon: ${params.patientPhone || "-"}`,
      `Ülke: ${params.patientCountry || "-"}`,
      `Tedavi: ${treatment}`,
      `Şehir: ${city}`,
      sideLabel ? `İstanbul yakası: ${sideLabel}` : null,
      `Seyahat: ${travel}`,
      "Talep edilen klinikler:",
      clinicListText,
      `Portal: ${params.portalUrl}`,
      `Teklif talebi ID: ${params.quoteRequestId}`,
      `Oluşturulma: ${created}`,
      `Durum: ${status}`,
    ]
      .filter(Boolean)
      .join("\n");
    return { subject, html, text };
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
      <h2 style="color: #0d9488;">New Quote Request</h2>
      <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Patient</h3>
      <p><strong>Full name:</strong> ${escapeHtml(name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(params.patientEmail || "-")}</p>
      <p><strong>Phone:</strong> ${escapeHtml(params.patientPhone || "-")}</p>
      <p><strong>Country:</strong> ${escapeHtml(params.patientCountry || "-")}</p>
      <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Request</h3>
      <p><strong>Treatment:</strong> ${escapeHtml(treatment)}</p>
      <p><strong>Preferred city:</strong> ${escapeHtml(city)}</p>
      ${sideLabel ? `<p><strong>Istanbul side:</strong> ${escapeHtml(sideLabel)}</p>` : ""}
      <p><strong>Planned travel:</strong> ${escapeHtml(travel)}</p>
      <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Requested clinics</h3>
      <ul>${clinicListHtml}</ul>
      <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Conversation</h3>
      <p><a href="${escapeHtml(params.portalUrl)}" style="color:#0d9488;font-weight:700;">Open record in Portal</a></p>
      ${params.conversationId ? `<p style="font-size:12px;color:#64748b;">Conversation ID: ${escapeHtml(params.conversationId)}</p>` : ""}
      <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Quote</h3>
      <p><strong>Quote request ID:</strong> ${escapeHtml(params.quoteRequestId)}</p>
      <p><strong>Created:</strong> ${escapeHtml(created)}</p>
      <p><strong>Status:</strong> ${escapeHtml(status)}</p>
    </div>`;
  const text = [
    "New Quote Request",
    `Full name: ${name}`,
    `Email: ${params.patientEmail || "-"}`,
    `Phone: ${params.patientPhone || "-"}`,
    `Country: ${params.patientCountry || "-"}`,
    `Treatment: ${treatment}`,
    `City: ${city}`,
    sideLabel ? `Istanbul side: ${sideLabel}` : null,
    `Travel: ${travel}`,
    "Requested clinics:",
    clinicListText,
    `Portal: ${params.portalUrl}`,
    `Quote request ID: ${params.quoteRequestId}`,
    `Created: ${created}`,
    `Status: ${status}`,
  ]
    .filter(Boolean)
    .join("\n");
  return { subject, html, text };
}

export function pickOfficialClinicName(clinicDoc: Record<string, any> | null | undefined, fallbackId: string): string {
  if (!clinicDoc) return fallbackId;
  return (
    clinicDoc.clinicName ||
    clinicDoc.name ||
    clinicDoc.displayName ||
    clinicDoc.title ||
    fallbackId
  );
}

export function computeNextRetryAt(attemptCount: number, nowMs = Date.now()): string {
  const minutes = Math.pow(5, Math.max(1, attemptCount));
  return new Date(nowMs + minutes * 60_000).toISOString();
}

/** Jobs left in `processing` after a serverless freeze/timeout can be reclaimed. */
export const STALE_PROCESSING_NOTIFICATION_MS = 90_000;

export function isRetryableNotificationJob(job: {
  status?: string;
  attemptCount?: number;
  maxAttempts?: number;
  nextAttemptAt?: string | null;
  updatedAt?: string | null;
  lastAttemptAt?: string | null;
}, nowMs = Date.now()): boolean {
  if (!job) return false;
  if (job.status === "sent") return false;
  if (job.status === "skipped" || job.status === "config_missing") return false;

  // Fresh `processing` is owned by an in-flight worker; stale ones must be reclaimable
  // (Vercel often freezes fire-and-forget work after the HTTP response returns).
  if (job.status === "processing") {
    const marker = job.lastAttemptAt || job.updatedAt;
    if (!marker) return true;
    return nowMs - new Date(marker).getTime() >= STALE_PROCESSING_NOTIFICATION_MS;
  }

  const attempts = Number(job.attemptCount || 0);
  const max = Number(job.maxAttempts || 3);
  if (attempts >= max) return false;
  if (job.status === "pending") return true;
  if (job.status === "failed" || job.status === "retrying") {
    if (!job.nextAttemptAt) return true;
    return new Date(job.nextAttemptAt).getTime() <= nowMs;
  }
  return false;
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
