/**
 * Classify acquisition source from UTM + referrer.
 * Deterministic only — no invented channels.
 */

import { clampString, sanitizeReferrer } from "./sanitize";

export interface ClassificationInput {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrer?: string;
}

export interface ClassificationResult {
  source: string;
  medium: string;
  campaign: string;
  /** Short human label for email / admin */
  label: string;
}

function hostFromReferrer(referrer: string): string {
  const cleaned = sanitizeReferrer(referrer);
  if (!cleaned) return "";
  try {
    return new URL(cleaned).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Map known referrer hosts → source/medium/label.
 * Returns null when referrer is empty or unrecognized (caller uses Direct).
 */
export function classifyFromReferrer(referrer: string): ClassificationResult | null {
  const host = hostFromReferrer(referrer);
  if (!host) return null;

  if (/(^|\.)google\./i.test(host) || host === "google.com") {
    return { source: "google", medium: "organic", campaign: "", label: "Google Organic" };
  }
  if (/(^|\.)bing\./i.test(host) || host === "bing.com") {
    return { source: "bing", medium: "organic", campaign: "", label: "Bing Organic" };
  }
  if (/(^|\.)yahoo\./i.test(host)) {
    return { source: "yahoo", medium: "organic", campaign: "", label: "Yahoo Organic" };
  }
  if (/(^|\.)duckduckgo\./i.test(host)) {
    return { source: "duckduckgo", medium: "organic", campaign: "", label: "DuckDuckGo Organic" };
  }
  if (/(^|\.)linkedin\./i.test(host) || host === "lnkd.in") {
    return { source: "linkedin", medium: "referral", campaign: "", label: "LinkedIn" };
  }
  if (/(^|\.)instagram\./i.test(host)) {
    return { source: "instagram", medium: "referral", campaign: "", label: "Instagram" };
  }
  if (/(^|\.)facebook\./i.test(host) || host === "fb.com" || host === "m.facebook.com") {
    return { source: "facebook", medium: "referral", campaign: "", label: "Facebook" };
  }
  if (/(^|\.)twitter\./i.test(host) || host === "x.com" || /(^|\.)t\.co$/i.test(host)) {
    return { source: "twitter", medium: "referral", campaign: "", label: "X / Twitter" };
  }
  if (/(^|\.)youtube\./i.test(host) || host === "youtu.be") {
    return { source: "youtube", medium: "referral", campaign: "", label: "YouTube" };
  }
  if (
    host === "wa.me" ||
    /(^|\.)whatsapp\./i.test(host) ||
    host === "api.whatsapp.com" ||
    host === "web.whatsapp.com"
  ) {
    return { source: "whatsapp", medium: "referral", campaign: "", label: "WhatsApp" };
  }

  // Generic external referrer — use host as source, no invented brand name
  return {
    source: clampString(host, 80) || "referral",
    medium: "referral",
    campaign: "",
    label: `Referral (${host})`,
  };
}

function labelFromUtm(source: string, medium: string): string {
  const s = source.toLowerCase();
  const m = medium.toLowerCase();
  if (s === "google" && (m === "cpc" || m === "ppc" || m === "paid")) {
    return "Google Ads";
  }
  if (s === "google" && m === "organic") return "Google Organic";
  if (s === "bing" && (m === "cpc" || m === "ppc")) return "Bing Ads";
  if (s === "linkedin") return "LinkedIn";
  if (s === "facebook" || s === "fb" || s === "meta") return "Facebook";
  if (s === "instagram" || s === "ig") return "Instagram";
  if (s === "whatsapp") return "WhatsApp";
  if (!s || s === "direct") return "Direct / Unknown";
  const parts = [source];
  if (medium && medium !== "none") parts.push(medium);
  return parts.join(" / ");
}

/**
 * UTM values take priority when present.
 * Otherwise classify from referrer.
 * Otherwise Direct / Unknown.
 */
export function classifyAcquisition(input: ClassificationInput): ClassificationResult {
  const utmSource = clampString(input.utmSource).toLowerCase();
  const utmMedium = clampString(input.utmMedium).toLowerCase();
  const utmCampaign = clampString(input.utmCampaign);

  if (utmSource) {
    return {
      source: utmSource,
      medium: utmMedium || "none",
      campaign: utmCampaign,
      label: labelFromUtm(utmSource, utmMedium || "none"),
    };
  }

  const fromRef = classifyFromReferrer(input.referrer || "");
  if (fromRef) {
    return {
      ...fromRef,
      campaign: utmCampaign || fromRef.campaign,
    };
  }

  return {
    source: "direct",
    medium: "none",
    campaign: "",
    label: "Direct / Unknown",
  };
}
