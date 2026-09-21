/**
 * Capture first-touch / last-touch attribution from the current browser location.
 * Pure-ish core is testable; browser I/O is fail-soft.
 */

import { classifyAcquisition } from "./classify";
import {
  extractWhitelistedParams,
  sanitizePathname,
  sanitizeReferrer,
  clampString,
} from "./sanitize";
import {
  freshExpiry,
  readStoredAttribution,
  writeStoredAttribution,
} from "./storage";
import type {
  AttributionIdentifiers,
  AttributionTouch,
  StoredLeadAttribution,
} from "./types";

export interface CaptureContext {
  href: string;
  pathname: string;
  search: string;
  referrer: string;
  now?: Date;
}

function buildTouch(
  ctx: CaptureContext,
  classification: ReturnType<typeof classifyAcquisition>,
  params: ReturnType<typeof extractWhitelistedParams>,
  kind: "first" | "last"
): AttributionTouch {
  const capturedAt = (ctx.now || new Date()).toISOString();
  const path = sanitizePathname(ctx.pathname);
  const base: AttributionTouch = {
    source: classification.source,
    medium: classification.medium,
    campaign: classification.campaign || clampString(params.utm_campaign),
    referrer: sanitizeReferrer(ctx.referrer),
    capturedAt,
  };
  const term = clampString(params.utm_term);
  const content = clampString(params.utm_content);
  if (term) base.term = term;
  if (content) base.content = content;
  if (kind === "first") {
    return { ...base, landingPage: path };
  }
  return { ...base, page: path };
}

function mergeIdentifiers(
  prev: AttributionIdentifiers | undefined,
  params: ReturnType<typeof extractWhitelistedParams>
): AttributionIdentifiers {
  const next: AttributionIdentifiers = { ...(prev || {}) };
  const gclid = clampString(params.gclid);
  const fbclid = clampString(params.fbclid);
  const msclkid = clampString(params.msclkid);
  if (gclid) next.gclid = gclid;
  if (fbclid) next.fbclid = fbclid;
  if (msclkid) next.msclkid = msclkid;
  // Drop empties so JSON/storage never retain undefined-like holes
  const cleaned: AttributionIdentifiers = {};
  if (next.gclid) cleaned.gclid = next.gclid;
  if (next.fbclid) cleaned.fbclid = next.fbclid;
  if (next.msclkid) cleaned.msclkid = next.msclkid;
  return cleaned;
}

/**
 * Apply a page visit to stored attribution.
 * - First visit (or expired): set firstTouch + lastTouch
 * - Later visits: keep firstTouch; refresh lastTouch; merge click ids
 * - Same-session internal navigation without new UTM: still update last page
 */
export function applyVisitToAttribution(
  existing: StoredLeadAttribution | null,
  ctx: CaptureContext
): StoredLeadAttribution {
  const now = ctx.now || new Date();
  const params = extractWhitelistedParams(ctx.search);
  const classification = classifyAcquisition({
    utmSource: params.utm_source,
    utmMedium: params.utm_medium,
    utmCampaign: params.utm_campaign,
    referrer: ctx.referrer,
  });

  const hasUtmOrClickId = Boolean(
    params.utm_source ||
      params.utm_medium ||
      params.utm_campaign ||
      params.gclid ||
      params.fbclid ||
      params.msclkid
  );

  // Prefer external referrer classification over "direct" when no UTM,
  // but do not invent — classifyAcquisition already handles this.

  if (!existing) {
    const firstTouch = buildTouch(ctx, classification, params, "first");
    const lastTouch = buildTouch(ctx, classification, params, "last");
    return {
      version: 1,
      firstTouch,
      lastTouch,
      identifiers: mergeIdentifiers(undefined, params),
      expiresAt: freshExpiry(now.getTime()),
    };
  }

  // Refresh last touch always (page path); upgrade last source when new UTM/click id arrives
  let lastClassification = classification;
  if (!hasUtmOrClickId && !sanitizeReferrer(ctx.referrer)) {
    // Internal navigation — keep previous last-touch channel, update page only
    lastClassification = {
      source: existing.lastTouch.source,
      medium: existing.lastTouch.medium,
      campaign: existing.lastTouch.campaign,
      label: "",
    };
  }

  const lastTouch = buildTouch(ctx, lastClassification, params, "last");
  // Preserve earlier last referrer if this nav has none
  if (!lastTouch.referrer && existing.lastTouch.referrer) {
    lastTouch.referrer = existing.lastTouch.referrer;
  }

  return {
    version: 1,
    firstTouch: existing.firstTouch,
    lastTouch,
    identifiers: mergeIdentifiers(existing.identifiers, params),
    expiresAt: existing.expiresAt || freshExpiry(now.getTime()),
  };
}

/** Browser entry: read location + referrer, update storage. Never throws. */
export function captureLeadAttributionFromBrowser(): StoredLeadAttribution | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = readStoredAttribution();
    const ctx: CaptureContext = {
      href: window.location.href,
      pathname: window.location.pathname || "/",
      search: window.location.search || "",
      referrer: typeof document !== "undefined" ? document.referrer || "" : "",
    };
    const next = applyVisitToAttribution(existing, ctx);
    writeStoredAttribution(next);
    return next;
  } catch {
    return null;
  }
}

/** Marketing paths where we actively refresh attribution. */
export function isMarketingCapturePath(pathname: string): boolean {
  const p = sanitizePathname(pathname);
  if (p === "/") return true;
  const allowed = [
    "/privacy",
    "/kvkk",
    "/terms",
    "/thank-you",
    "/landing",
    "/showcase-demo",
    "/showcase-patient-questions",
  ];
  return allowed.some((a) => p === a || p.startsWith(`${a}/`));
}
