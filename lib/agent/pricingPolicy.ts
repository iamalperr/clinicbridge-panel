/**
 * Clinic-chat price handling (product-global for single-clinic / Clinic Portal chat).
 * One place for: price-question detection, the price instruction block sent to the model,
 * and the deterministic "never invent a price" check on the model reply.
 */

export type PriceIntent = "examination_fee" | "xray_fee" | "treatment_price" | "";

const L = "(?<![\\p{L}\\p{N}])";
const R = "(?![\\p{L}\\p{N}])";

const PRICE_TERM = new RegExp(
  `${L}(?:` +
    [
      "fiyat\\p{L}*",
      "ücret\\p{L}*",
      "ucret\\p{L}*",
      "maliyet\\p{L}*",
      "bedel\\p{L}*",
      "paras[ıi]",
      "ka[çc]\\s+(?:tl|lira|para|euro|dolar)",
      "ne\\s+tutar",
      "ne\\s+kadara",
      // "ne kadar sürer" / "how much time" ask about duration, not price
      "ne\\s+kadar(?!\\s+(?:sür|sur|zaman|vakit|uzun))",
      "how\\s+much(?!\\s+(?:time|longer))",
      "prices?",
      "priced",
      "pricing",
      "costs?",
      "costing",
      "fees?",
      "preis\\p{L}*",
      "kosten",
      "wie\\s+viel",
      "prix",
      "tarifs?",
      "combien",
    ].join("|") +
    `)${R}`,
  "iu"
);

const FREE_TERM = new RegExp(
  `${L}(?:ücretsiz\\p{L}*|ucretsiz\\p{L}*|bedava\\p{L}*|(?<!feel\\s)free|kostenlos|gratuit|gratis)${R}`,
  "iu"
);
const EXAM_TERM = new RegExp(
  `${L}(?:muayene\\p{L}*|kontrol\\p{L}*|ilk\\s+değerlendirme|ilk\\s+randevu|consultation|examination|check-?up)${R}`,
  "iu"
);
const XRAY_TERM = new RegExp(`${L}(?:röntgen\\p{L}*|rontgen\\p{L}*|x-?ray|film\\p{L}*|tomografi\\p{L}*)${R}`, "iu");

/** Deterministic price-question detection (any wording of the treatment name). */
export function detectPriceIntent(message: string): PriceIntent {
  const text = String(message || "");
  const asksPrice = PRICE_TERM.test(text);
  const asksFree = FREE_TERM.test(text);
  if (!asksPrice && !asksFree) return "";
  if (EXAM_TERM.test(text)) return "examination_fee";
  if (XRAY_TERM.test(text)) return "xray_fee";
  return asksPrice ? "treatment_price" : "";
}

/** Price instruction block for the clinic-chat system prompt. */
export function buildPricePolicyPromptBlock(): string {
  return `\nFİYAT POLİTİKASI (tüm dillerde geçerli):
1. Fiyat/ücret YALNIZCA KLİNİK BİLGİ HAVUZU, klinik kayıtları veya kliniğin kendi talimatlarında açıkça yazılıysa paylaşılır. Tutarı ve para birimini değiştirmeden aktar. Kliniğin talimatlarında doğrulanmış fiyat için bir anlatım kuralı varsa ona uy.
2. "Ücretsiz" (free) geçerli ve doğrulanmış bir fiyat türüdür. Bilgi Havuzunda geçiyorsa (örn. "İlk muayene ücretsizdir") doğrudan net cevap ver; "doğrulanmış bilgi mevcut değil" veya "fiyatlar muayene sonrası belli olur" DEME.
3. Doğrulanmış fiyat YOKSA: tutar, aralık, tahmin veya piyasa ortalaması VERME. Hastanın dilinde bu tedavi için doğrulanmış fiyat bilgisi olmadığını ve doğru fiyatı klinik ekibinin vereceğini söyle; ardından tek bir sonraki adım öner (kliniğin talimatındaki adım, yoksa sorusunu klinik ekibine iletmeyi teklif et). Bu durumu asla "teknik sorun" olarak anlatma.
4. Önce sorulan fiyat bilgisini (veya doğrulanmış fiyat olmadığını) söyle; randevu akışını veya iletişim bilgisini bunun önüne koyma.`;
}

const PREFIX_AMOUNT = /([€$£₺₽])\s?(\d[\d.,]*)/gu;
const SUFFIX_AMOUNT =
  /(\d[\d.,]*)\s?(?:€|\$|£|₺|₽|tl|try|eur|euros?|usd|dollars?|dolar|gbp|pounds?|lira|rub|руб\p{L}*)(?![\p{L}\p{N}])/giu;

function normalizeAmount(raw: string): string {
  return raw
    .replace(/[.,]$/, "")
    .replace(/[.,]0{1,2}$/, "")
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "");
}

function extractAmounts(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(PREFIX_AMOUNT)) out.push(normalizeAmount(m[2]));
  for (const m of text.matchAll(SUFFIX_AMOUNT)) out.push(normalizeAmount(m[1]));
  return out.filter(Boolean);
}

/** True when the text quotes at least one money amount. */
export function containsPriceAmount(text: string): boolean {
  return extractAmounts(String(text || "")).length > 0;
}

/** True when the text gives "free" as the price. */
export function statesFreePrice(text: string): boolean {
  return FREE_TERM.test(String(text || ""));
}

/**
 * Money amounts in `reply` whose number does not appear in any verified source
 * (knowledge base, clinic records/instructions, or the patient's own messages).
 */
export function findUnverifiedPriceAmounts(reply: string, verifiedSources: string[]): string[] {
  const amounts = extractAmounts(String(reply || ""));
  if (amounts.length === 0) return [];
  const known = new Set<string>();
  for (const source of verifiedSources) {
    for (const m of String(source || "").matchAll(/\d[\d.,]*/g)) {
      const n = normalizeAmount(m[0]);
      if (n) known.add(n);
    }
  }
  return amounts.filter((a) => !known.has(a));
}
