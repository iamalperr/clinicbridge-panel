/**
 * Cross-page quote prefill for FeelinHealthy demo → clinic profile.
 * Stored in sessionStorage so the profile "Teklif İste" modal can auto-fill
 * the patient fields collected by the matching agent.
 */

export const FEELINHEALTHY_QUOTE_PREFILL_KEY = "feelinhealthy_agent_quote_prefill_v1";

export interface FeelinHealthyQuotePrefill {
  version: 1;
  savedAt: string;
  sessionId?: string;
  agencySlug: "feelinhealthy";
  clinicId?: string;
  clinicName?: string;
  clinicSlug?: string;
  patientName?: string;
  patientEmail?: string;
  patientPhone?: string;
  patientCountry?: string;
  patientAge?: number | string;
  patientGender?: string;
  treatmentCategory?: string;
  treatmentSubcategory?: string;
  selectedCity?: string;
  istanbulSide?: string;
  travelDate?: string;
  language?: string;
  message?: string;
}

export function buildQuotePrefillFromSession(
  sessionContext: Record<string, any> | null | undefined,
  clinic?: { clinicId?: string; clinicName?: string; clinicSlug?: string },
  locale?: string
): FeelinHealthyQuotePrefill {
  const ctx = sessionContext || {};
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    sessionId: ctx.sessionId ? String(ctx.sessionId) : undefined,
    agencySlug: "feelinhealthy",
    clinicId: clinic?.clinicId ? String(clinic.clinicId) : undefined,
    clinicName: clinic?.clinicName ? String(clinic.clinicName) : undefined,
    clinicSlug: clinic?.clinicSlug ? String(clinic.clinicSlug) : undefined,
    patientName: ctx.patientName ? String(ctx.patientName) : undefined,
    patientEmail: ctx.patientEmail ? String(ctx.patientEmail) : undefined,
    patientPhone: ctx.patientPhone ? String(ctx.patientPhone) : undefined,
    patientCountry: ctx.patientCountry ? String(ctx.patientCountry) : undefined,
    patientAge: ctx.patientAge ?? ctx.age ?? undefined,
    patientGender: ctx.patientGender || ctx.gender || undefined,
    treatmentCategory: ctx.lastTreatmentCategory || undefined,
    treatmentSubcategory: ctx.lastSubTreatment || undefined,
    selectedCity: ctx.selectedCity || undefined,
    istanbulSide: ctx.istanbul_side || ctx.istanbulSide || undefined,
    travelDate: ctx.travelDate || undefined,
    language: locale || ctx.language || "tr",
    message: undefined,
  };
}

export function saveQuotePrefill(prefill: FeelinHealthyQuotePrefill): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(FEELINHEALTHY_QUOTE_PREFILL_KEY, JSON.stringify(prefill));
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadQuotePrefill(): FeelinHealthyQuotePrefill | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(FEELINHEALTHY_QUOTE_PREFILL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FeelinHealthyQuotePrefill;
    if (!parsed || parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearQuotePrefill(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(FEELINHEALTHY_QUOTE_PREFILL_KEY);
  } catch {
    /* ignore */
  }
}

/** Append from=agent so the profile page knows to hydrate the quote modal. */
export function appendAgentPrefillQuery(profileUrl: string): string {
  try {
    const url = new URL(profileUrl, typeof window !== "undefined" ? window.location.origin : "https://app.clinicbridge-ai.com");
    url.searchParams.set("from", "agent");
    url.searchParams.set("prefill", "1");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    const join = profileUrl.includes("?") ? "&" : "?";
    return `${profileUrl}${join}from=agent&prefill=1`;
  }
}
