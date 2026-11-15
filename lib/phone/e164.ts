/**
 * International phone normalization via libphonenumber-js (E.164).
 * Prefer this over Turkey-only regex for contact-request / handoff flows.
 */

import {
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

export interface E164Result {
  ok: boolean;
  e164: string;
  display: string;
  country?: string;
  error?: string;
}

function extractCandidate(raw: string): string | null {
  const text = String(raw || "").trim();
  if (!text) return null;

  const intl = text.match(/\+\d[\d\s().-]{6,22}\d/);
  if (intl) return intl[0].trim();

  const local = text.match(/(?:\b0?\d{2,4}[\s().-]*){2,5}\d{2,4}\b/);
  if (local) {
    const digits = local[0].replace(/\D/g, "");
    if (digits.length >= 9 && digits.length <= 15) return local[0].trim();
  }

  const digitsOnly = text.replace(/\D/g, "");
  if (digitsOnly.length >= 9 && digitsOnly.length <= 15 && /^[+0-9\s().-]+$/.test(text)) {
    return text;
  }
  return null;
}

/**
 * Parse and validate a phone number to E.164.
 * @param defaultCountry Used when the number has no country code (e.g. 05xx → TR).
 */
export function normalizeToE164(
  raw: string,
  defaultCountry: CountryCode = "TR"
): E164Result {
  const original = String(raw || "").trim();
  if (!original) return { ok: false, e164: "", display: "", error: "EMPTY" };

  const candidate = extractCandidate(original) || original;
  let parsed = parsePhoneNumberFromString(candidate, defaultCountry);

  // Numbers that start with + must be interpreted as international even if default is TR.
  if ((!parsed || !parsed.isValid()) && candidate.includes("+")) {
    parsed = parsePhoneNumberFromString(candidate);
  }

  // Bare international without +: if longer than TR national and starts with country-looking prefix
  if ((!parsed || !parsed.isValid()) && /^\d{10,15}$/.test(candidate.replace(/\D/g, ""))) {
    parsed = parsePhoneNumberFromString(`+${candidate.replace(/\D/g, "")}`);
  }

  if (!parsed || !parsed.isValid()) {
    return { ok: false, e164: "", display: "", error: "INVALID" };
  }

  return {
    ok: true,
    e164: parsed.format("E.164"),
    display: parsed.formatInternational(),
    country: parsed.country,
  };
}

/** Mask phone for logs: keep country + last 2 digits. */
export function maskPhoneForLogs(value: string | null | undefined): string {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "(none)";
  if (digits.length <= 4) return `***${digits.slice(-1)}`;
  return `+${digits.slice(0, Math.min(3, digits.length - 2))}***${digits.slice(-2)}`;
}
