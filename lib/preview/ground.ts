import type { PreviewFacts, PreviewFaq, PreviewTreatment } from "./types";

const LANGUAGE_CODES = new Set(["tr", "en", "de", "ar", "ru", "fr", "es", "it", "nl", "fa"]);

function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || text.length > max) return null;
  if (/^(null|n\/a|unknown|bilinmiyor|yok)$/i.test(text)) return null;
  return text;
}

function corpusHas(corpus: string, value: string): boolean {
  return corpus.toLowerCase().includes(value.toLowerCase());
}

function digitsInCorpus(corpus: string, value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 6) return false;
  return corpus.replace(/\D/g, "").includes(digits);
}

function wordsOverlap(corpus: string, value: string): boolean {
  const words = value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 4);
  if (!words.length) return false;
  const haystack = corpus.toLowerCase();
  const hits = words.filter((word) => haystack.includes(word)).length;
  return hits >= Math.min(2, words.length) && hits / words.length >= 0.4;
}

/**
 * Drops any model output that is not supported by the crawled text or page signals.
 * Logo and color come only from the page, never from the model.
 */
export function groundPreviewFacts(
  raw: unknown,
  corpus: string,
  signals: { languages: string[]; logoUrl: string | null; primaryColor: string | null }
): PreviewFacts {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const clinicName = clean(data.clinicName, 120);
  const address = clean(data.address, 240);
  const hours = clean(data.hours, 240);
  const phone = clean(data.phone, 40);
  const whatsapp = clean(data.whatsapp, 40);

  const treatments: PreviewTreatment[] = [];
  if (Array.isArray(data.treatments)) {
    for (const entry of data.treatments) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const name = clean(record.name, 120);
      if (!name || !corpusHas(corpus, name)) continue;
      const priceRange = clean(record.priceRange, 80);
      treatments.push({
        name,
        priceRange: priceRange && digitsInCorpus(corpus, priceRange) ? priceRange : null,
      });
      if (treatments.length >= 40) break;
    }
  }

  const faq: PreviewFaq[] = [];
  if (Array.isArray(data.faq)) {
    for (const entry of data.faq) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const question = clean(record.question, 200);
      const answer = clean(record.answer, 600);
      if (!question || !answer) continue;
      if (!wordsOverlap(corpus, question) || !wordsOverlap(corpus, answer)) continue;
      faq.push({ question, answer });
      if (faq.length >= 20) break;
    }
  }

  const languages = signals.languages.filter((code) => LANGUAGE_CODES.has(code.toLowerCase()));

  return {
    clinicName: clinicName && (corpusHas(corpus, clinicName) || wordsOverlap(corpus, clinicName)) ? clinicName : null,
    treatments,
    address: address && wordsOverlap(corpus, address) ? address : null,
    hours: hours && wordsOverlap(corpus, hours) ? hours : null,
    phone: phone && digitsInCorpus(corpus, phone) ? phone : null,
    whatsapp: whatsapp && digitsInCorpus(corpus, whatsapp) ? whatsapp : null,
    languages,
    faq,
    logoUrl: signals.logoUrl,
    primaryColor: signals.primaryColor,
  };
}
