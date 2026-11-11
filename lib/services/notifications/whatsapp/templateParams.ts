/**
 * Builds the body parameters for the "new_appointment_request" WhatsApp template.
 *
 * {{1}} patient display name (first name + last initial), {{2}} treatment, {{3}} preferred
 * date, {{4}} panel deep link. Never carries health notes, patient phone, email or message text.
 */

export type WhatsAppTemplateLanguage = "tr" | "en";

const E164 = /^\+[1-9]\d{7,14}$/;

/** Accepts only strict E.164 ("+905321112233"). Returns digits for the Graph API "to" field. */
export function toWhatsAppRecipient(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return E164.test(value) ? value.slice(1) : null;
}

export function isValidE164(raw: unknown): boolean {
  return toWhatsAppRecipient(raw) !== null;
}

export function maskPhone(digits: string): string {
  return digits.length > 2 ? `***${digits.slice(-2)}` : "***";
}

export function resolveTemplateLanguage(clinicData: Record<string, unknown> | null | undefined): WhatsAppTemplateLanguage {
  const candidates = [clinicData?.defaultLanguage, clinicData?.language];
  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const primary = value.trim().toLowerCase().split(/[-_]/)[0];
    if (primary === "tr" || primary === "en") return primary;
    if (primary && primary !== "auto") return "en";
  }
  return "en";
}

/** Meta rejects newlines, tabs and runs of 4+ spaces in text parameters. */
function cleanParam(value: string, maxLength: number): string {
  const cleaned = value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1).trim()}…` : cleaned;
}

/** "Ahmet Can Yılmaz" → "Ahmet Y."; digits, emails and symbols are dropped. */
export function redactPatientName(raw: unknown, language: WhatsAppTemplateLanguage): string {
  if (typeof raw !== "string") return "-";
  const words = raw
    .split(/\s+/)
    .filter((word) => word && !/[\d@]/.test(word))
    .map((word) => word.replace(/[^\p{L}'’-]/gu, ""))
    .filter((word) => /\p{L}/u.test(word));
  if (words.length === 0) return "-";
  const locale = language === "tr" ? "tr-TR" : "en-US";
  const first = cleanParam(words[0], 30);
  if (words.length === 1) return first;
  const lastInitial = Array.from(words[words.length - 1].replace(/^['’-]+/, ""))[0] || "";
  return lastInitial ? `${first} ${lastInitial.toLocaleUpperCase(locale)}.` : first;
}

export function formatTreatment(raw: unknown): string {
  if (typeof raw !== "string") return "-";
  const value = cleanParam(raw, 60);
  return value || "-";
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)/;

/** Formats a YYYY-MM-DD date (and optional HH:mm) for the template language; anything else → "-". */
export function formatPreferredDate(
  date: unknown,
  time: unknown,
  language: WhatsAppTemplateLanguage
): string {
  if (typeof date !== "string") return "-";
  const match = date.trim().match(ISO_DATE);
  if (!match) return "-";
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(parsed.getTime()) || parsed.getUTCDate() !== Number(match[3])) return "-";
  const formatted = new Intl.DateTimeFormat(language === "tr" ? "tr-TR" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
  const timeMatch = typeof time === "string" ? time.trim().match(TIME) : null;
  return timeMatch ? `${formatted} ${timeMatch[1]}:${timeMatch[2]}` : formatted;
}

export type ClinicStaffNotificationKind = "appointment" | "contact_request" | "test";

export function buildPanelLink(params: {
  baseUrl: string;
  clinicId: string;
  kind: ClinicStaffNotificationKind;
  recordId?: string;
  conversationId?: string;
}): string {
  const clinic = encodeURIComponent(params.clinicId);
  if (params.kind === "contact_request") {
    const query = params.conversationId ? `?conversationId=${encodeURIComponent(params.conversationId)}` : "";
    return `${params.baseUrl}/clinics/${clinic}/logs${query}`;
  }
  const query = params.recordId ? `?appointmentId=${encodeURIComponent(params.recordId)}` : "";
  return `${params.baseUrl}/clinics/${clinic}/appointments${query}`;
}

export const CONTACT_REQUEST_TREATMENT_LABEL: Record<WhatsAppTemplateLanguage, string> = {
  tr: "İletişim talebi",
  en: "Contact request",
};

export interface TemplateBodyInput {
  language: WhatsAppTemplateLanguage;
  patientName: unknown;
  treatment: unknown;
  preferredDate: unknown;
  preferredTime?: unknown;
  panelLink: string;
}

export function buildTemplateBodyParams(input: TemplateBodyInput): [string, string, string, string] {
  return [
    redactPatientName(input.patientName, input.language),
    formatTreatment(input.treatment),
    formatPreferredDate(input.preferredDate, input.preferredTime, input.language),
    input.panelLink,
  ];
}
