/**
 * Appointment confirmation / rejection keyword detection (channel-agnostic).
 */

const CONFIRM_KEYWORDS = [
  "evet", "yes", "onaylıyorum", "onayliyorum", "tamam", "olur",
  "kabul", "evet lütfen", "evet lutfen", "tamamdır", "tamamdir",
  "harika", "ilerleyelim", "oluştur", "olustur", "yap", "e", "uygun", "uygundur",
  "gönder", "gonder", "kabul ediyorum", "confirm", "doğru", "dogru",
  "bilgiler doğru", "bilgiler dogru", "iletebilirsiniz",
  "evet onaylıyorum", "evet onayliyorum",
];

export function normalizeConfirmationInput(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[.!?,;:\s]+$/g, "");
}

export function isConfirmation(msg: string): boolean {
  const lower = normalizeConfirmationInput(msg);
  return CONFIRM_KEYWORDS.some(k =>
    lower === k || lower.startsWith(k + " ")
  );
}
