/**
 * Sanitize / whitelist attribution values.
 * Never persist arbitrary query strings or sensitive params.
 */

import {
  MAX_ATTR_STRING_LEN,
  MAX_PATH_LEN,
  MAX_REFERRER_LEN,
} from "./types";

const ALLOWED_QUERY_KEYS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "msclkid",
]);

export function clampString(
  value: unknown,
  maxLen: number = MAX_ATTR_STRING_LEN
): string {
  if (value === null || value === undefined) return "";
  let s = String(value).trim();
  // Strip control characters
  s = s.replace(/[\u0000-\u001F\u007F]/g, "");
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

export function sanitizePathname(input: unknown): string {
  const raw = clampString(input, MAX_PATH_LEN);
  if (!raw) return "/";
  try {
    // Absolute URL → pathname only
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      return clampString(u.pathname || "/", MAX_PATH_LEN) || "/";
    }
  } catch {
    // fall through
  }
  // Ensure path-like; drop query/hash if somehow present
  const path = raw.split("?")[0].split("#")[0];
  if (!path.startsWith("/")) return clampString(`/${path}`, MAX_PATH_LEN);
  return clampString(path, MAX_PATH_LEN) || "/";
}

export function sanitizeReferrer(input: unknown): string {
  const raw = clampString(input, MAX_REFERRER_LEN);
  if (!raw) return "";
  try {
    const u = new URL(raw);
    // Origin + pathname only — drop query (may contain PII tokens)
    return clampString(`${u.origin}${u.pathname}`, MAX_REFERRER_LEN);
  } catch {
    return clampString(raw, MAX_REFERRER_LEN);
  }
}

export interface WhitelistedTrackingParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;
  fbclid?: string;
  msclkid?: string;
}

/** Extract only allowlisted tracking params from a query string or URLSearchParams. */
export function extractWhitelistedParams(
  search: string | URLSearchParams | Record<string, string> | null | undefined
): WhitelistedTrackingParams {
  const out: WhitelistedTrackingParams = {};
  if (!search) return out;

  let entries: Array<[string, string]> = [];
  try {
    if (typeof search === "string") {
      const q = search.startsWith("?") ? search.slice(1) : search;
      entries = Array.from(new URLSearchParams(q).entries());
    } else if (search instanceof URLSearchParams) {
      entries = Array.from(search.entries());
    } else if (typeof search === "object") {
      entries = Object.entries(search).map(([k, v]) => [k, String(v)]);
    }
  } catch {
    return out;
  }

  for (const [key, value] of entries) {
    const k = key.toLowerCase();
    if (!ALLOWED_QUERY_KEYS.has(k)) continue;
    const cleaned = clampString(value);
    if (!cleaned) continue;
    (out as Record<string, string>)[k] = cleaned;
  }
  return out;
}

/**
 * Server-side: coerce unknown client attribution into a safe plain object.
 * Returns null if nothing usable — never throws.
 * Never emits `undefined` property values (Firestore rejects them).
 */
export function sanitizeAttributionPayload(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  try {
    const obj = raw as Record<string, any>;
    const touch = (t: any, kind: "first" | "last") => {
      if (!t || typeof t !== "object") return null;
      const base: Record<string, string> = {
        source: clampString(t.source) || "direct",
        medium: clampString(t.medium) || "none",
        campaign: clampString(t.campaign) || "",
        referrer: sanitizeReferrer(t.referrer),
        capturedAt: clampString(t.capturedAt, 40) || new Date().toISOString(),
      };
      const term = clampString(t.term);
      const content = clampString(t.content);
      if (term) base.term = term;
      if (content) base.content = content;
      if (kind === "first") {
        base.landingPage = sanitizePathname(t.landingPage || t.page || "/");
      } else {
        base.page = sanitizePathname(t.page || t.landingPage || "/");
      }
      return base;
    };

    const firstTouch = touch(obj.firstTouch, "first");
    const lastTouch = touch(obj.lastTouch, "last");
    if (!firstTouch && !lastTouch) return null;

    const idsRaw = obj.identifiers && typeof obj.identifiers === "object" ? obj.identifiers : {};
    const identifiers: Record<string, string> = {};
    const gclid = clampString(idsRaw.gclid);
    const fbclid = clampString(idsRaw.fbclid);
    const msclkid = clampString(idsRaw.msclkid);
    if (gclid) identifiers.gclid = gclid;
    if (fbclid) identifiers.fbclid = fbclid;
    if (msclkid) identifiers.msclkid = msclkid;

    return {
      firstTouch: firstTouch || lastTouch,
      lastTouch: lastTouch || firstTouch,
      identifiers,
      leadSourceLabel: clampString(obj.leadSourceLabel, 80) || "Direct / Unknown",
      capturedAt: clampString(obj.capturedAt, 40) || new Date().toISOString(),
      version: 1,
    };
  } catch {
    return null;
  }
}

/** True if any nested own-property is strictly `undefined` (Firestore-unsafe). */
export function attributionContainsUndefined(value: unknown): boolean {
  if (value === undefined) return true;
  if (value === null || typeof value !== "object") return false;
  for (const nested of Object.values(value as Record<string, unknown>)) {
    if (nested === undefined) return true;
    if (nested !== null && typeof nested === "object" && attributionContainsUndefined(nested)) {
      return true;
    }
  }
  return false;
}
