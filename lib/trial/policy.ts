export type TrialLanguage = "tr" | "en";
export type UsageNotice = "80" | "100";
export type TrialReminder = "3" | "1";

const ISTANBUL = "Europe/Istanbul";

export function monthKey(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ISTANBUL,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  return `${year}-${month}`;
}

export function istanbulDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ISTANBUL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function daysUntil(endsAt: Date, now: Date): number {
  const end = Date.parse(`${istanbulDay(endsAt)}T00:00:00Z`);
  const start = Date.parse(`${istanbulDay(now)}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

export function parseTimestamp(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "object" && value && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (typeof value === "object" && value && "seconds" in value && typeof (value as { seconds: unknown }).seconds === "number") {
    return new Date((value as { seconds: number }).seconds * 1000);
  }
  return null;
}

export function trialLanguage(requestLanguage: unknown, clinicLanguage: unknown): TrialLanguage {
  const requested = typeof requestLanguage === "string" ? requestLanguage.toLowerCase() : "";
  if (requested.startsWith("en")) return "en";
  if (requested.startsWith("tr")) return "tr";
  return clinicLanguage === "en" ? "en" : "tr";
}

export interface DirectClinicFields {
  acquisition?: unknown;
  plan?: unknown;
  trialEndsAt?: unknown;
  chatLimit?: unknown;
  language?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  whatsappNumber?: unknown;
  appointmentEmail?: unknown;
}

export type DirectChatGate =
  | { kind: "skip" }
  | { kind: "closed"; reply: string; language: TrialLanguage }
  | { kind: "track"; language: TrialLanguage };

export function directClinicChatGate(
  clinic: DirectClinicFields | null | undefined,
  now: Date,
  requestLanguage?: unknown
): DirectChatGate {
  if (!clinic || clinic.acquisition !== "direct") return { kind: "skip" };
  const language = trialLanguage(requestLanguage, clinic.language);
  const endsAt = parseTimestamp(clinic.trialEndsAt);
  if (clinic.plan === "trial" && endsAt && endsAt.getTime() <= now.getTime()) {
    return { kind: "closed", language, reply: trialClosedReply(language, clinic) };
  }
  const limit = typeof clinic.chatLimit === "number" ? clinic.chatLimit : 0;
  if (limit <= 0) return { kind: "skip" };
  return { kind: "track", language };
}

export function trialClosedReply(language: TrialLanguage, clinic: DirectClinicFields): string {
  const contact = clinicContact(clinic);
  if (language === "en") {
    return contact
      ? `Our assistant is temporarily closed. You can reach the clinic here: ${contact}`
      : "Our assistant is temporarily closed. Please contact the clinic directly.";
  }
  return contact
    ? `Asistanımız şu an geçici olarak kapalı. Kliniğe buradan ulaşabilirsiniz: ${contact}`
    : "Asistanımız şu an geçici olarak kapalı. Lütfen kliniğe doğrudan ulaşın.";
}

export function clinicContact(clinic: DirectClinicFields): string {
  const values = [clinic.phone, clinic.whatsappNumber, clinic.appointmentEmail, clinic.email];
  const unique: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || unique.includes(trimmed)) continue;
    unique.push(trimmed);
  }
  return unique.join(" · ");
}

export function planUsageNotification(input: {
  count: number;
  limit: number;
  warned80: boolean;
  warned100: boolean;
}): { notify: UsageNotice | null; warned80: boolean; warned100: boolean } {
  if (input.limit <= 0) return { notify: null, warned80: input.warned80, warned100: input.warned100 };
  if (input.count >= input.limit && !input.warned100) {
    return { notify: "100", warned80: true, warned100: true };
  }
  if (input.count / input.limit >= 0.8 && !input.warned80) {
    return { notify: "80", warned80: true, warned100: input.warned100 };
  }
  return { notify: null, warned80: input.warned80, warned100: input.warned100 };
}

export function usageWarningLevel(input: {
  acquisition?: string;
  count?: number;
  limit?: number;
  month?: string | null;
  now?: Date;
}): UsageNotice | null {
  if (input.acquisition !== "direct") return null;
  if (!input.limit || input.limit <= 0 || !input.count || input.count <= 0) return null;
  if (input.month !== monthKey(input.now || new Date())) return null;
  if (input.count >= input.limit) return "100";
  if (input.count / input.limit >= 0.8) return "80";
  return null;
}

export function dueTrialReminder(input: {
  plan?: unknown;
  acquisition?: unknown;
  trialEndsAt: Date | null;
  now: Date;
  sent3: boolean;
  sent1: boolean;
}): TrialReminder | null {
  if (input.acquisition !== "direct" || input.plan !== "trial" || !input.trialEndsAt) return null;
  const days = daysUntil(input.trialEndsAt, input.now);
  if (days === 3 && !input.sent3) return "3";
  if (days === 1 && !input.sent1) return "1";
  return null;
}
