/**
 * Turkish speech rendering for voice TTS (pure).
 *
 * Runs after `toSpeechText` on the speech copy only; the canonical Agent Core reply and stored
 * appointment values are never touched. Machine/display formats that TTS would read as
 * punctuation become natural Turkish words:
 *   14:00 → "saat on dört", 14:30'da → "saat on dört otuzda", 12.10.2026 / 2026-10-12 →
 *   "on iki Ekim iki bin yirmi altı", 0532 123 45 67 → grouped digits, a@b.com → "a et b nokta com".
 * Recognizers are anchored on boundaries: URLs are left alone, decimals, versions, prices and
 * partial dates never become dates, and invalid clock times or calendar dates are left as written.
 */

const ONES = ["sıfır", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];
const TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"];
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

/** Turkish cardinal for 0..9999. */
export function turkishCardinal(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 9999) return String(n);
  if (n === 0) return ONES[0];
  const words: string[] = [];
  const thousands = Math.floor(n / 1000);
  const hundreds = Math.floor((n % 1000) / 100);
  const tens = Math.floor((n % 100) / 10);
  const ones = n % 10;
  if (thousands) words.push(thousands === 1 ? "bin" : `${ONES[thousands]} bin`);
  if (hundreds) words.push(hundreds === 1 ? "yüz" : `${ONES[hundreds]} yüz`);
  if (tens) words.push(TENS[tens]);
  if (ones) words.push(ONES[ones]);
  return words.join(" ");
}

/** Digit group as spoken in phone numbers: leading zeros are "sıfır", the rest is a cardinal. */
function digitGroup(group: string): string {
  const lead = group.match(/^0*/)?.[0].length ?? 0;
  const zeros = Array(Math.min(lead, group.length)).fill(ONES[0]);
  const rest = group.slice(lead);
  return [...zeros, ...(rest ? [turkishCardinal(Number(rest))] : [])].join(" ");
}

/** Turkish case suffix written after a numeral ("14:00'te") is attached to the spoken words. */
function withSuffix(words: string, suffix: string | undefined): string {
  return suffix ? `${words}${suffix}` : words;
}

const SUFFIX = "(?:['’]([a-zçğıöşü]{1,6}))?";

function spokenClock(h: number, m: number): string | null {
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  const hour = turkishCardinal(h);
  if (m === 0) return hour;
  return `${hour} ${m < 10 ? `sıfır ${ONES[m]}` : turkishCardinal(m)}`;
}

function precededBySaat(source: string, offset: number): boolean {
  return /(?:^|[^\p{L}])saat[\s:,]*$/iu.test(source.slice(Math.max(0, offset - 12), offset));
}

function spokenDate(day: number, month: number, year: number): string | null {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1) return null;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return `${turkishCardinal(day)} ${MONTHS[month - 1]} ${turkishCardinal(year)}`;
}

const EMAIL = /(?<![\p{L}\p{N}._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?![\p{L}\p{N}-])/gu;
const URL = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;
const ISO_DATE = new RegExp(`(?<![\\p{L}\\p{N}._/:-])(\\d{4})-(\\d{2})-(\\d{2})(?![\\p{L}\\p{N}]|[-./:]\\d)${SUFFIX}`, "gu");
const DMY_DATE = new RegExp(`(?<![\\p{L}\\p{N}._/:-])(\\d{1,2})([./-])(\\d{1,2})\\2(\\d{4})(?![\\p{L}\\p{N}]|[-./:]\\d)${SUFFIX}`, "gu");
const TIME_RANGE = new RegExp(`(?<![\\p{L}\\p{N}.:/])(\\d{1,2}):(\\d{2})\\s*[-–]\\s*(\\d{1,2}):(\\d{2})(?![\\p{N}]|[:.]\\d)${SUFFIX}`, "gu");
const TIME = new RegExp(`(?<![\\p{L}\\p{N}.:/])(\\d{1,2}):(\\d{2})(?![\\p{N}]|[:.]\\d)${SUFFIX}`, "gu");
const TR_PHONE = /(?<![\p{L}\p{N}+])(?:(\+90)[\s.-]?|(0)[\s.-]?)?\(?([2-58]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{2})[\s.-]?(\d{2})(?![\p{L}\p{N}])/gu;

function renderEmail(address: string): string {
  return address
    .replace(/@/g, " et ")
    .replace(/\./g, " nokta ")
    .replace(/_/g, " alt çizgi ")
    .replace(/-/g, " tire ")
    .replace(/\+/g, " artı ")
    .replace(/ {2,}/g, " ")
    .trim();
}

function renderSegment(text: string): string {
  let out = text.replace(EMAIL, (m) => renderEmail(m));

  out = out.replace(ISO_DATE, (m, y: string, mo: string, d: string, suffix?: string) => {
    const spoken = spokenDate(Number(d), Number(mo), Number(y));
    return spoken ? withSuffix(spoken, suffix) : m;
  });
  out = out.replace(DMY_DATE, (m, d: string, _sep: string, mo: string, y: string, suffix?: string) => {
    const spoken = spokenDate(Number(d), Number(mo), Number(y));
    return spoken ? withSuffix(spoken, suffix) : m;
  });

  out = out.replace(TIME_RANGE, (m, h1: string, m1: string, h2: string, m2: string, suffix: string | undefined, offset: number, src: string) => {
    const a = spokenClock(Number(h1), Number(m1));
    const b = spokenClock(Number(h2), Number(m2));
    if (!a || !b) return m;
    const prefix = precededBySaat(src, offset) ? "" : "saat ";
    return `${prefix}${a} ile ${withSuffix(b, suffix)}`;
  });
  out = out.replace(TIME, (m, h: string, mm: string, suffix: string | undefined, offset: number, src: string) => {
    const spoken = spokenClock(Number(h), Number(mm));
    if (!spoken) return m;
    const prefix = precededBySaat(src, offset) ? "" : "saat ";
    return `${prefix}${withSuffix(spoken, suffix)}`;
  });

  out = out.replace(TR_PHONE, (_m, plus90: string | undefined, zero: string | undefined, area: string, a: string, b: string, c: string) => {
    const groups = [digitGroup(`${zero ?? ""}${area}`), digitGroup(a), digitGroup(b), digitGroup(c)];
    return `${plus90 ? "artı doksan, " : ""}${groups.join(", ")}`;
  });

  return out;
}

/** Render machine/display formatting in a Turkish speech string as natural spoken Turkish. */
export function renderTurkishSpeech(text: string): string {
  if (typeof text !== "string" || !text) return "";
  let out = "";
  let last = 0;
  for (const match of text.matchAll(URL)) {
    const start = match.index ?? 0;
    out += renderSegment(text.slice(last, start)) + match[0];
    last = start + match[0].length;
  }
  return out + renderSegment(text.slice(last));
}

/** Turkish rendering applies to Turkish (or unlabelled, Turkish-default) voice replies only. */
export function renderSpeechForLocale(speechText: string, locale?: string): string {
  if (locale && !/^tr(?:$|[-_])/i.test(locale.trim())) return speechText;
  return renderTurkishSpeech(speechText);
}
