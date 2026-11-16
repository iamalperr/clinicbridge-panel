/** Public marketing hosts. The clinic panel and widget domains stay outside this set. */
const MARKETING_HOSTS = new Set(["clinicbridge-ai.com", "www.clinicbridge-ai.com"]);

/** App host where conversion events (sign_up) must still reach gtag. */
const APP_CONVERSION_HOSTS = new Set(["app.clinicbridge-ai.com"]);

/** Paths on the app host that should load the marketing GA4 tag. */
const APP_CONVERSION_PATHS = new Set(["/kayit"]);

export function isMarketingAnalyticsHost(host: string | null | undefined): boolean {
  const hostname = (host ?? "").split(":")[0].trim().toLowerCase();
  return MARKETING_HOSTS.has(hostname);
}

/**
 * Marketing site, or app conversion paths such as /kayit.
 * Used for direct GA4 + Meta Pixel (not for the whole clinic panel).
 */
export function shouldLoadMarketingPixels(
  host: string | null | undefined,
  pathname: string | null | undefined = ""
): boolean {
  if (isMarketingAnalyticsHost(host)) return true;
  const hostname = (host ?? "").split(":")[0].trim().toLowerCase();
  const path = (pathname || "").split("?")[0] || "";
  return APP_CONVERSION_HOSTS.has(hostname) && APP_CONVERSION_PATHS.has(path);
}

/** @deprecated Prefer shouldLoadMarketingPixels */
export const shouldLoadMarketingGoogleTag = shouldLoadMarketingPixels;

/** Digits-only Meta Pixel ID; empty/invalid → do not render the pixel. */
export function sanitizeMetaPixelId(raw: string | null | undefined): string | null {
  const id = String(raw || "").trim();
  if (!/^\d{5,20}$/.test(id)) return null;
  return id;
}
