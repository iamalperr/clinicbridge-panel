export type PreviewUiLanguage = "tr" | "en" | "de" | "ar" | "ru";

const ARABIC = /[\u0600-\u06FF]/;
const CYRILLIC = /[\u0400-\u04FF]/;
const TURKISH_LETTERS = /[ğĞşŞıİ]/;
const GERMAN_MARK = /ß|straße/i;

function hasWord(text: string, words: string[]): boolean {
  const folded = text.toLocaleLowerCase("tr-TR");
  return words.some((word) => folded.includes(word));
}

export function previewLanguageSignal(text: string): PreviewUiLanguage | null {
  const value = text.trim();
  if (!value) return null;
  if (ARABIC.test(value)) return "ar";
  if (CYRILLIC.test(value)) return "ru";
  if (TURKISH_LETTERS.test(value) || hasWord(value, ["randevu", "doktor", "fiyat", "merhaba", "nedir", "misiniz"])) return "tr";
  if (GERMAN_MARK.test(value) || hasWord(value, ["wie ", "für", "ich ", "und ", "preis", "öffnungs", "zähne", "muss ich", "kosten", "termin", "möglich"])) return "de";
  if (hasWord(value, ["how ", "what ", "price", "appointment", "doctor", "please", "crown"])) return "en";
  return null;
}

export function detectPreviewLanguage(text: string, previous?: string | null): PreviewUiLanguage {
  return previewLanguageSignal(text)
    || (previous === "tr" || previous === "en" || previous === "de" || previous === "ar" || previous === "ru" ? previous : null)
    || "en";
}

export function previewLanguageLabel(language: PreviewUiLanguage): string {
  if (language === "tr") return "Türkçe";
  if (language === "de") return "Deutsch";
  if (language === "ar") return "العربية";
  if (language === "ru") return "Русский";
  return "English";
}
