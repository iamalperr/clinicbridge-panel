/**
 * Google Consent Mode v2 helpers (marketing).
 * Defaults are denied; accept upgrades storage; page_view still loads for modeled measurement.
 */

export const COOKIE_CONSENT_STORAGE_KEY = "cb-cookie-consent";

export type CookieConsentValue = "accepted" | "rejected";

export const CONSENT_DENIED = {
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  analytics_storage: "denied",
} as const;

export const CONSENT_GRANTED = {
  ad_storage: "granted",
  ad_user_data: "granted",
  ad_personalization: "granted",
  analytics_storage: "granted",
} as const;

type GtagFn = (...args: unknown[]) => void;
type FbqFn = (...args: unknown[]) => void;

function existingGtag(): GtagFn | undefined {
  if (typeof window === "undefined") return undefined;
  const candidate = (window as Window & { gtag?: unknown }).gtag;
  return typeof candidate === "function" ? (candidate as GtagFn) : undefined;
}

function existingFbq(): FbqFn | undefined {
  if (typeof window === "undefined") return undefined;
  const candidate = (window as Window & { fbq?: unknown }).fbq;
  return typeof candidate === "function" ? (candidate as FbqFn) : undefined;
}

/** Meta Pixel consent API — revoke by default, grant after accept. */
export function applyMetaPixelConsent(
  value: CookieConsentValue,
  fbq: FbqFn | undefined = existingFbq()
): void {
  if (!fbq) return;
  fbq("consent", value === "accepted" ? "grant" : "revoke");
}

export function readStoredCookieConsent(): CookieConsentValue | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (raw === "accepted" || raw === "rejected") return raw;
  } catch {
    // ignore
  }
  return null;
}

/** Apply Google Consent Mode + Meta Pixel consent after the visitor accepts or rejects. */
export function applyConsentModeUpdate(
  value: CookieConsentValue,
  send: GtagFn | undefined = existingGtag(),
  fbq: FbqFn | undefined = existingFbq()
): void {
  if (send) {
    send("consent", "update", value === "accepted" ? { ...CONSENT_GRANTED } : { ...CONSENT_DENIED });
  }
  applyMetaPixelConsent(value, fbq);
}

/**
 * Inline head bootstrap: stub gtag + default denied (+ restore prior accept).
 * Must run before GTM / gtag.js so the first config respects Consent Mode v2.
 */
export function consentModeBootstrapScript(): string {
  return [
    "window.dataLayer = window.dataLayer || [];",
    "function gtag(){dataLayer.push(arguments);}",
    "window.gtag = gtag;",
    "gtag('consent', 'default', {",
    "  ad_storage: 'denied',",
    "  ad_user_data: 'denied',",
    "  ad_personalization: 'denied',",
    "  analytics_storage: 'denied',",
    "  wait_for_update: 500",
    "});",
    "gtag('set', 'url_passthrough', true);",
    "gtag('set', 'ads_data_redaction', true);",
    "(function(){",
    "  try {",
    "    var c = localStorage.getItem('cb-cookie-consent');",
    "    if (c === 'accepted') {",
    "      gtag('consent', 'update', {",
    "        ad_storage: 'granted',",
    "        ad_user_data: 'granted',",
    "        ad_personalization: 'granted',",
    "        analytics_storage: 'granted'",
    "      });",
    "    }",
    "  } catch (e) {}",
    "})();",
  ].join("\n");
}
