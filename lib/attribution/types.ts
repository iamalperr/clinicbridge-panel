/**
 * Lead attribution types for ClinicBridge marketing demo requests.
 * First-party acquisition tracking only — not auth/tenant related.
 */

export interface AttributionTouch {
  source: string;
  medium: string;
  campaign: string;
  term?: string;
  content?: string;
  referrer: string;
  landingPage?: string;
  page?: string;
  capturedAt: string;
}

export interface AttributionIdentifiers {
  gclid?: string;
  fbclid?: string;
  msclkid?: string;
}

export interface LeadAttributionPayload {
  firstTouch: AttributionTouch;
  lastTouch: AttributionTouch;
  identifiers: AttributionIdentifiers;
  /** Human-readable classification for first-touch (or last if first missing). */
  leadSourceLabel: string;
  capturedAt: string;
  version: 1;
}

export interface StoredLeadAttribution {
  version: 1;
  firstTouch: AttributionTouch;
  lastTouch: AttributionTouch;
  identifiers: AttributionIdentifiers;
  expiresAt: number;
}

export const ATTRIBUTION_STORAGE_KEY = "cb_lead_attribution_v1";
/** 90 days */
export const ATTRIBUTION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export const MAX_ATTR_STRING_LEN = 200;
export const MAX_REFERRER_LEN = 300;
export const MAX_PATH_LEN = 200;
