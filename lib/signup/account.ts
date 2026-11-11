import type { PermissionTab } from "@/lib/types";
import { DEFAULT_PERMISSIONS } from "@/lib/types";
import type { PreviewKnowledgeItem } from "@/lib/preview/types";

export const DIRECT_CLINIC_ROLE = "clinicUser" as const;
export const TRIAL_DAYS = 14;
export const SIGNUP_LIMIT_PER_HOUR = 5;

export function directClinicPermissions(): PermissionTab[] {
  return [...DEFAULT_PERMISSIONS.clinicUser, "clinic_widget", "clinic_settings"];
}

export function trialEndsAtFrom(start: Date): Date {
  return new Date(start.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

export function domainFromSourceUrl(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return "";
  }
}

export function trainingDocsFromPreview(items: PreviewKnowledgeItem[]): PreviewKnowledgeItem[] {
  return items.filter((item) => item.title.trim() && item.content.trim()).slice(0, 80);
}

export interface SignupAttributionInput {
  utmSource?: unknown;
  utmMedium?: unknown;
  utmCampaign?: unknown;
  referrer?: unknown;
  landingPage?: unknown;
}

export interface SignupInput {
  name?: unknown;
  clinicName?: unknown;
  email?: unknown;
  password?: unknown;
  phone?: unknown;
  acceptedTerms?: unknown;
  acceptedDistanceSales?: unknown;
  acceptedKvkk?: unknown;
  previewId?: unknown;
  language?: unknown;
  attribution?: SignupAttributionInput;
}

export interface ValidSignup {
  name: string;
  clinicName: string;
  email: string;
  password: string;
  phone: string;
  previewId: string | null;
  language: "tr" | "en";
  attribution: {
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
    referrer: string;
    landingPage: string;
  };
}

export type SignupValidationError = "invalid" | "consent_required";

function text(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length < min || trimmed.length > max) return null;
  return trimmed;
}

export function validateSignup(input: SignupInput): { ok: true; value: ValidSignup } | { ok: false; error: SignupValidationError } {
  if (input.acceptedTerms !== true || input.acceptedDistanceSales !== true || input.acceptedKvkk !== true) {
    return { ok: false, error: "consent_required" };
  }
  const name = text(input.name, 2, 80);
  const clinicName = text(input.clinicName, 2, 120);
  const emailRaw = text(input.email, 6, 200);
  const password = typeof input.password === "string" ? input.password : "";
  const phone = text(input.phone, 8, 24);
  const email = emailRaw?.toLowerCase() ?? "";
  const phoneDigits = phone?.replace(/\D/g, "") ?? "";
  if (!name || !clinicName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "invalid" };
  }
  if (password.length < 8 || password.length > 128) return { ok: false, error: "invalid" };
  if (phoneDigits.length < 8 || phoneDigits.length > 15) return { ok: false, error: "invalid" };
  let previewId: string | null = null;
  if (typeof input.previewId === "string" && input.previewId.trim()) {
    const id = input.previewId.trim();
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(id)) return { ok: false, error: "invalid" };
    previewId = id;
  }
  const language = input.language === "en" ? "en" : "tr";
  const attr = input.attribution && typeof input.attribution === "object" ? input.attribution : {};
  const attribution = {
    utmSource: text(attr.utmSource, 1, 120) || "",
    utmMedium: text(attr.utmMedium, 1, 120) || "",
    utmCampaign: text(attr.utmCampaign, 1, 120) || "",
    referrer: text(attr.referrer, 1, 500) || "",
    landingPage: text(attr.landingPage, 1, 300) || "/",
  };
  return { ok: true, value: { name, clinicName, email, password, phone: phone!, previewId, language, attribution } };
}

export function nextRateWindow(
  existing: { windowStart: number; count: number } | null,
  now: number,
  limit = SIGNUP_LIMIT_PER_HOUR,
  windowMs = 60 * 60 * 1000
): { allowed: boolean; windowStart: number; count: number } {
  if (!existing || now - existing.windowStart >= windowMs) {
    return { allowed: true, windowStart: now, count: 1 };
  }
  if (existing.count >= limit) {
    return { allowed: false, windowStart: existing.windowStart, count: existing.count };
  }
  return { allowed: true, windowStart: existing.windowStart, count: existing.count + 1 };
}
