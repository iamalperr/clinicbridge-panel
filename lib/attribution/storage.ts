/**
 * Client-side first/last-touch attribution storage (localStorage).
 * All operations are fail-soft — never throw to callers.
 */

import type { LeadAttributionPayload, StoredLeadAttribution } from "./types";
import { ATTRIBUTION_STORAGE_KEY, ATTRIBUTION_TTL_MS } from "./types";
import { classifyAcquisition } from "./classify";

function safeParse(raw: string | null): StoredLeadAttribution | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredLeadAttribution;
    if (!parsed || parsed.version !== 1 || !parsed.firstTouch || !parsed.lastTouch) {
      return null;
    }
    if (typeof parsed.expiresAt === "number" && Date.now() > parsed.expiresAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function readStoredAttribution(): StoredLeadAttribution | null {
  if (typeof window === "undefined") return null;
  try {
    return safeParse(window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeStoredAttribution(data: StoredLeadAttribution): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearStoredAttribution(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ATTRIBUTION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Build submit-ready payload from storage (or null). Never throws. */
export function getAttributionForSubmit(): LeadAttributionPayload | null {
  try {
    const stored = readStoredAttribution();
    if (!stored) return null;

    const leadSourceLabel = labelFromTouch(stored.firstTouch);

    return {
      firstTouch: stored.firstTouch,
      lastTouch: stored.lastTouch,
      identifiers: stored.identifiers || {},
      leadSourceLabel,
      capturedAt: new Date().toISOString(),
      version: 1,
    };
  } catch {
    return null;
  }
}

function labelFromTouch(touch: StoredLeadAttribution["firstTouch"]): string {
  return classifyAcquisition({
    utmSource: touch.source === "direct" ? "" : touch.source,
    utmMedium: touch.medium === "none" ? "" : touch.medium,
    utmCampaign: touch.campaign,
    referrer: touch.referrer,
  }).label;
}

export function freshExpiry(now: number = Date.now()): number {
  return now + ATTRIBUTION_TTL_MS;
}
