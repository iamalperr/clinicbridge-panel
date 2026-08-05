/**
 * Cross-page quote prefill for FeelinHealthy demo → clinic profile.
 *
 * IMPORTANT: Do NOT use sessionStorage alone — window.open() tabs do not
 * reliably share sessionStorage. Use localStorage + URL payload backup.
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
  const patientName =
    ctx.patientName ||
    [ctx.firstName, ctx.lastName].filter(Boolean).join(" ").trim() ||
    undefined;
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    sessionId: ctx.sessionId ? String(ctx.sessionId) : undefined,
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
    treatmentCategory: ctx.lastTreatmentCategory || undefined,
    treatmentSubcategory: ctx.lastSubTreatment || undefined,
    selectedCity: ctx.selectedCity || undefined,
    istanbulSide: ctx.istanbul_side || ctx.istanbulSide || undefined,
    travelDate: ctx.travelDate || undefined,
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
