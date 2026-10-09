/**
 * Comparison key for deterministic control phrases (cancel / reset replies).
 * Product-global. Used only to compare a message against a phrase list: never store,
 * display or apply it to names, emails, phone numbers, appointment values or transcripts.
 */

const HARMLESS_TERMINAL_PUNCTUATION = /[\s.!…,;:]+$/u;

/**
 * Default `toLowerCase()` turns Turkish "İ" into "i" + U+0307, so "İptal" never equals "iptal".
 * "İ" maps to "i" here; ASCII "I" still lowercases to "i" (not "ı"), so Turkish phrase lists keep
 * an ASCII variant of words containing "ı" (hayir, onaylamiyorum). "?" is kept: "İptal?" is a
 * question, not a command.
 */
export function controlPhraseKey(text: string): string {
  return text
    .normalize("NFC")
    .replace(/İ/g, "i")
    .toLowerCase()
    .replace(/\u0307/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(HARMLESS_TERMINAL_PUNCTUATION, "");
}
