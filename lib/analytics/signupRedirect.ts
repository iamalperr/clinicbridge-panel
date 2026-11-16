/**
 * Build app signup URLs while preserving allowlisted attribution params (UTM, gclid, fbclid).
 */

import { extractWhitelistedParams } from "@/lib/attribution/sanitize";

export const APP_SIGNUP_BASE_URL = "https://app.clinicbridge-ai.com/kayit";

export function buildAppSignupUrl(options?: {
  search?: string | URLSearchParams | null;
  extra?: Record<string, string | undefined | null>;
}): string {
  const params = new URLSearchParams();

  const fromSearch = extractWhitelistedParams(
    options?.search ?? (typeof window !== "undefined" ? window.location.search : "")
  );
  for (const [key, value] of Object.entries(fromSearch)) {
    if (value) params.set(key, value);
  }

  if (options?.extra) {
    for (const [key, value] of Object.entries(options.extra)) {
      const trimmed = String(value || "").trim();
      if (trimmed) params.set(key, trimmed);
    }
  }

  const qs = params.toString();
  return qs ? `${APP_SIGNUP_BASE_URL}?${qs}` : APP_SIGNUP_BASE_URL;
}
