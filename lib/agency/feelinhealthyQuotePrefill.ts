/**
 * Cross-page quote prefill for FeelinHealthy demo → clinic profile.
 *
 * IMPORTANT: Do NOT use sessionStorage alone — window.open() tabs do not
 * reliably share sessionStorage. Use localStorage + URL payload backup.
 */

import {
  getAgencyIstanbulSide,
  getAgencyPatientName,
  getAgencySelectedCity,
  getAgencySelectedClinicIds,
  getAgencySessionId,
  getAgencyTravelDate,
  getAgencyTreatmentContext,
} from "./agencySessionState";
import {
  isCurrentTreatmentQuoteLocked,
  recordTreatmentQuoteSuccess,
} from "./treatmentQuoteCycle";

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
  const patientName = getAgencyPatientName(ctx);
  const sessionId = getAgencySessionId(ctx);
  const istanbulSide = getAgencyIstanbulSide(ctx);
  const treatment = getAgencyTreatmentContext(ctx);
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    sessionId: sessionId ? String(sessionId) : undefined,
    agencySlug: "feelinhealthy",
    clinicId: clinic?.clinicId ? String(clinic.clinicId) : undefined,
    clinicName: clinic?.clinicName ? String(clinic.clinicName) : undefined,
    clinicSlug: clinic?.clinicSlug ? String(clinic.clinicSlug) : undefined,
    patientName: patientName ? String(patientName) : undefined,
    patientEmail: ctx.patientEmail ? String(ctx.patientEmail) : undefined,
    patientPhone: ctx.patientPhone ? String(ctx.patientPhone) : undefined,
    patientCountry: ctx.patientCountry ? String(ctx.patientCountry) : undefined,
    patientAge: ctx.patientAge ?? ctx.age ?? undefined,
    patientGender: ctx.patientGender || ctx.gender || undefined,
    treatmentCategory: treatment.category || undefined,
    treatmentSubcategory: treatment.subcategory || undefined,
    selectedCity: getAgencySelectedCity(ctx) || undefined,
    istanbulSide: istanbulSide || undefined,
    travelDate: getAgencyTravelDate(ctx) || undefined,
    language: locale || ctx.language || "tr",
    message: undefined,
  };
}

function encodePrefillPayload(prefill: FeelinHealthyQuotePrefill): string {
  const json = JSON.stringify(prefill);
  if (typeof window !== "undefined" && typeof window.btoa === "function") {
    // base64url
    return window
      .btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodePrefillPayload(raw: string | null | undefined): FeelinHealthyQuotePrefill | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    let b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json =
      typeof window !== "undefined" && typeof window.atob === "function"
        ? decodeURIComponent(escape(window.atob(b64)))
        : Buffer.from(b64, "base64").toString("utf8");
    const parsed = JSON.parse(json) as FeelinHealthyQuotePrefill;
    if (!parsed || parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveQuotePrefill(prefill: FeelinHealthyQuotePrefill): void {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(prefill);
  try {
    window.localStorage.setItem(FEELINHEALTHY_QUOTE_PREFILL_KEY, serialized);
  } catch {
    /* ignore */
  }
  try {
    // Keep sessionStorage too for same-tab consumers.
    window.sessionStorage.setItem(FEELINHEALTHY_QUOTE_PREFILL_KEY, serialized);
  } catch {
    /* ignore */
  }
}

export function loadQuotePrefill(search?: string): FeelinHealthyQuotePrefill | null {
  if (typeof window === "undefined") return null;

  // 1) URL payload (most reliable across window.open tabs)
  try {
    const sp = new URLSearchParams(search || window.location.search);
    const fromUrl = decodePrefillPayload(sp.get("cbp"));
    if (fromUrl && (fromUrl.patientName || fromUrl.patientEmail)) {
      // Mirror into storage for subsequent modal opens on this page.
      saveQuotePrefill(fromUrl);
      return fromUrl;
    }
  } catch {
    /* ignore */
  }

  // 2) localStorage (shared across tabs on same origin)
  try {
    const rawLocal = window.localStorage.getItem(FEELINHEALTHY_QUOTE_PREFILL_KEY);
    if (rawLocal) {
      const parsed = JSON.parse(rawLocal) as FeelinHealthyQuotePrefill;
      if (parsed?.version === 1) return parsed;
    }
  } catch {
    /* ignore */
  }

  // 3) sessionStorage fallback
  try {
    const rawSession = window.sessionStorage.getItem(FEELINHEALTHY_QUOTE_PREFILL_KEY);
    if (rawSession) {
      const parsed = JSON.parse(rawSession) as FeelinHealthyQuotePrefill;
      if (parsed?.version === 1) return parsed;
    }
  } catch {
    /* ignore */
  }

  return null;
}

export function clearQuotePrefill(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(FEELINHEALTHY_QUOTE_PREFILL_KEY);
  } catch {
    /* ignore */
  }
  try {
    window.sessionStorage.removeItem(FEELINHEALTHY_QUOTE_PREFILL_KEY);
  } catch {
    /* ignore */
  }
}

/** Append agent markers + compact prefill payload for the profile page. */
export function appendAgentPrefillQuery(
  profileUrl: string,
  prefill?: FeelinHealthyQuotePrefill | null
): string {
  try {
    const url = new URL(
      profileUrl,
      typeof window !== "undefined" ? window.location.origin : "https://app.clinicbridge-ai.com"
    );
    url.searchParams.set("from", "agent");
    url.searchParams.set("prefill", "1");
    if (prefill && (prefill.patientName || prefill.patientEmail)) {
      url.searchParams.set("cbp", encodePrefillPayload(prefill));
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    const join = profileUrl.includes("?") ? "&" : "?";
    return `${profileUrl}${join}from=agent&prefill=1`;
  }
}

/**
 * Cross-tab signal: profile page quote submit → agent chat locks Teklif İste.
 * Same origin localStorage so window.open tabs can notify the agent tab.
 */
export const FEELINHEALTHY_QUOTE_SUBMITTED_KEY = "feelinhealthy_agent_quote_submitted_v1";

export interface FeelinHealthyQuoteSubmittedSignal {
  version: 1;
  sessionId: string;
  clinicIds: string[];
  leadId?: string;
  quoteId?: string;
  submittedAt: string;
}

export function markAgentQuoteSubmitted(signal: {
  sessionId?: string | null;
  clinicIds?: string[] | null;
  leadId?: string | null;
  quoteId?: string | null;
}): void {
  if (typeof window === "undefined") return;
  const sessionId = String(signal.sessionId || "").trim();
  if (!sessionId) return;
  const clinicIds = Array.from(
    new Set((signal.clinicIds || []).map((id) => String(id || "").trim()).filter(Boolean))
  );
  const payload: FeelinHealthyQuoteSubmittedSignal = {
    version: 1,
    sessionId,
    clinicIds,
    leadId: signal.leadId ? String(signal.leadId) : undefined,
    quoteId: signal.quoteId ? String(signal.quoteId) : undefined,
    submittedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(FEELINHEALTHY_QUOTE_SUBMITTED_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function readAgentQuoteSubmitted(
  sessionId?: string | null
): FeelinHealthyQuoteSubmittedSignal | null {
  if (typeof window === "undefined") return null;
  const want = String(sessionId || "").trim();
  if (!want) return null;
  try {
    const raw = window.localStorage.getItem(FEELINHEALTHY_QUOTE_SUBMITTED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FeelinHealthyQuoteSubmittedSignal;
    if (!parsed || parsed.version !== 1) return null;
    if (String(parsed.sessionId || "") !== want) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** True when guest quote CTA must stay closed on clinic cards. */
export function isQuoteRequestLocked(sessionContext: Record<string, any> | null | undefined): boolean {
  return isCurrentTreatmentQuoteLocked(sessionContext);
}

/** Merge a cross-tab submitted signal into agent session context. */
export function applyQuoteSubmittedSignalToSession(
  sessionContext: Record<string, any>,
  signal: FeelinHealthyQuoteSubmittedSignal
): Record<string, any> {
  const existing = getAgencySelectedClinicIds(sessionContext);
  const merged = Array.from(new Set([...existing, ...(signal.clinicIds || [])]));
  const withIds = {
    ...sessionContext,
    selectedClinicIds: merged,
    leadId: signal.leadId || sessionContext.leadId,
    quoteId: signal.quoteId || sessionContext.quoteId,
    clinicSelectionStatus: "completed",
  };
  return recordTreatmentQuoteSuccess(withIds, {
    treatment: getAgencyTreatmentContext(withIds).category,
    quoteId: String(signal.quoteId || withIds.quoteId || ""),
    leadId: signal.leadId || withIds.leadId,
  });
}
