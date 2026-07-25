/**
 * phoneUtils.ts
 *
 * Turkish phone number validation and normalization utility.
 * Used by the AI Chatbot appointment flow to ensure valid patient contact info.
 */

export interface PhoneValidationResult {
  valid: boolean;
  normalized: string;   // +905XXXXXXXXX canonical format
  display: string;      // +90 5XX XXX XX XX display format
  raw: string;          // Original input
  error?: string;
}

/**
 * Normalize and validate a Turkish mobile phone number.
 *
 * Supported input formats:
 *   0531 462 99 21
 *   05314629921
 *   +90 531 462 99 21
 *   905314629921
 *   5314629921
 *   +90(531)462-99-21
 *
 * Returns canonical format: +905314629921
 */
export function normalizeTurkishPhone(raw: string): PhoneValidationResult {
  const original = raw;

  // Reject empty or clearly non-phone input
  if (!raw || typeof raw !== "string") {
    return { valid: false, normalized: "", display: "", raw: original, error: "EMPTY_INPUT" };
  }

  // Strip all whitespace, parentheses, hyphens, dots, en-dashes, em-dashes
  let cleaned = raw.replace(/[\s()\-–—.]/g, "");

  // Reject if contains alphabetic characters (except the leading '+')
  if (/[a-zA-ZğüşıöçĞÜŞİÖÇ]/.test(cleaned)) {
    return { valid: false, normalized: "", display: "", raw: original, error: "CONTAINS_ALPHA" };
  }

  // Handle leading + (only +90 is valid for Turkey)
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }

  // Now cleaned should be digits only
  if (!/^\d+$/.test(cleaned)) {
    return { valid: false, normalized: "", display: "", raw: original, error: "INVALID_CHARS" };
  }

  // Normalize to 10-digit national number (5XXXXXXXXX)
  let national = "";

  if (cleaned.startsWith("90") && cleaned.length === 12) {
    // 905XXXXXXXXX → 5XXXXXXXXX
    national = cleaned.substring(2);
  } else if (cleaned.startsWith("0") && cleaned.length === 11) {
    // 05XXXXXXXXX → 5XXXXXXXXX
    national = cleaned.substring(1);
  } else if (cleaned.length === 10 && cleaned.startsWith("5")) {
    // 5XXXXXXXXX → already national
    national = cleaned;
  } else {
    return { valid: false, normalized: "", display: "", raw: original, error: "INVALID_LENGTH" };
  }

  // Validate Turkish mobile prefix (5XX)
  if (!national.startsWith("5")) {
    return { valid: false, normalized: "", display: "", raw: original, error: "NOT_MOBILE" };
  }

  // Validate length
  if (national.length !== 10) {
    return { valid: false, normalized: "", display: "", raw: original, error: "INVALID_LENGTH" };
  }

  const normalized = `+90${national}`;
  const display = `+90 ${national.substring(0, 3)} ${national.substring(3, 6)} ${national.substring(6, 8)} ${national.substring(8, 10)}`;

  return { valid: true, normalized, display, raw: original };
}

/**
 * Quick check if a string looks like it could be a phone number attempt.
 * Used to decide whether to try normalization.
 */
export function looksLikePhoneNumber(text: string): boolean {
  const stripped = text.replace(/[\s()\-–—.+]/g, "");
  // At least 7 digits, primarily numeric
  const digitCount = (stripped.match(/\d/g) || []).length;
  return digitCount >= 7 && digitCount / stripped.length > 0.7;
}
