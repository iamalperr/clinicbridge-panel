/**
 * Deterministic email-slot interpretation for clinic appointment collection (product-global).
 *
 * Email is optional for a clinic appointment request: name, phone, treatment, date and time are
 * required. A patient may explicitly decline email; that is recorded as a disposition, never as an
 * email value. Spoken dictation ("yusuf nokta alper et gmail nokta com") is normalized only when the
 * caller is answering the email question or names email in the same message, and the result must
 * pass the canonical validator. Nothing here guesses a missing local part or domain.
 */
import { isValidEmail } from "@/lib/utils/emailValidation";

/** UNSET is represented by absence on the persisted draft. */
export type EmailDisposition = "UNSET" | "PROVIDED" | "DECLINED";

export interface EmailSlotContext {
  /** True when the assistant's pending question is the email slot. */
  expectingEmail: boolean;
}

const EMAIL_WORD = /(?:^|[^\p{L}])(?:e-?\s?posta|e-?\s?mail|mail)\p{L}*/u;

const KEYWORDED_REFUSAL_TR =
  /(?:^|[^\p{L}])(?:vermek\s+istemiyorum|vermeyeyim|vermeyece[gğ]im|vermiyorum|payla[sş]mak\s+istemiyorum|payla[sş]may[ae]y[ıi]m|payla[sş]m[ıi]yorum|istemiyorum|kullanm[ıi]yorum|yok|ge[cç]elim|atlayal[ıi]m|atla|gerek\s+yok|olmas[ıi]n|kals[ıi]n)(?![\p{L}])/u;
const KEYWORDED_REFUSAL_EN =
  /\b(?:don'?t|do not|won'?t|will not|rather not|no|skip|without)\b/;

/** Words that may make up a bare refusal reply to the email question. */
const BARE_REFUSAL_CORE = new Set([
  "hayır", "hayir", "yok", "istemiyorum", "vermeyeyim", "vermeyeceğim", "vermeyecegim", "vermiyorum",
  "paylaşmayayım", "paylasmayayim", "paylaşmıyorum", "paylasmiyorum", "geçelim", "gecelim", "geç", "gec",
  "atla", "atlayalım", "atlayalim", "olmasın", "olmasin", "kalsın", "kalsin", "kullanmıyorum", "kullanmiyorum",
  "no", "skip", "none",
]);
const BARE_REFUSAL_FILLER = new Set([
  "vermek", "paylaşmak", "paylasmak", "gerek", "teşekkürler", "tesekkurler", "teşekkür", "tesekkur",
  "ederim", "sağ", "sag", "olun", "sağol", "sagol", "ben", "şimdilik", "simdilik", "thanks", "thank", "you", "it",
]);

const QUESTION = /\?|(?:^|\s)m[ıiuü](?:\s|$|[.,!])/u;

function lowerTr(text: string): string {
  return text.toLocaleLowerCase("tr-TR");
}

/** True when the message names email (e-posta, mail, e-mail, email). */
export function mentionsEmail(message: string): boolean {
  return EMAIL_WORD.test(lowerTr(String(message || "")));
}

/**
 * Explicit email decline.
 * - Anywhere: a refusal that names email ("E-posta vermek istemiyorum", "Mail kullanmıyorum").
 * - Only while the email question is pending: a bare refusal ("Hayır", "İstemiyorum", "Yok, geçelim").
 * Questions and messages that contain an address are never a decline.
 */
export function detectEmailDecline(message: string, ctx: EmailSlotContext): boolean {
  const lower = lowerTr(String(message || "")).trim();
  if (!lower || lower.length > 160 || lower.includes("@") || QUESTION.test(lower)) return false;

  if (EMAIL_WORD.test(lower) && (KEYWORDED_REFUSAL_TR.test(lower) || KEYWORDED_REFUSAL_EN.test(lower))) {
    return true;
  }
  if (!ctx.expectingEmail) return false;

  const words = lower.replace(/[.,!;:…]+/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 6) return false;
  let hasCore = false;
  for (const w of words) {
    if (BARE_REFUSAL_CORE.has(w)) hasCore = true;
    else if (!BARE_REFUSAL_FILLER.has(w)) return false;
  }
  return hasCore;
}

type SpokenItem = { sym: "@" | "." | "_" | "-" } | { word: string };

const SYMBOL_WORDS: Record<string, "@" | "." | "_" | "-"> = {
  et: "@",
  at: "@",
  "@": "@",
  nokta: ".",
  dot: ".",
  ".": ".",
  altçizgi: "_",
  underscore: "_",
  _: "_",
  tire: "-",
  dash: "-",
  hyphen: "-",
  "-": "-",
};
const SYMBOL_BIGRAMS: Record<string, "_" | "-"> = {
  "alt çizgi": "_",
  "alt tire": "_",
  "kısa çizgi": "-",
};
/** Words that bound the dictated address; never part of it. */
const BOUNDARY_WORDS = new Set([
  "e-posta", "eposta", "e-postam", "epostam", "e-postamı", "epostami", "e-posta'm", "mail", "maili", "mailim",
  "mailimi", "email", "emailim", "e-mail", "e-mailim", "adres", "adresi", "adresim", "adresimi", "adresimiz",
  "benim", "şu", "su", "şöyle", "soyle", "şudur", "sudur", "evet", "tamam", "peki", "yani", "olarak", "buyrun",
  "buyurun", "yazın", "yazin", "yazabilirsiniz", "olacak", "olsun", "dır", "dir", "tır", "tir", "lütfen",
  "lutfen", "teşekkürler", "tesekkurler", "işareti", "isareti",
]);
const EMAIL_WORD_TOKEN = /^[a-z0-9]+(?:[._+-][a-z0-9]+)*$/;
const DOMAIN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const MAX_LOCAL_WORDS = 4;

/** Address characters are ASCII: dotted and dotless capital I both lowercase to "i". */
function lowerForAddress(text: string): string {
  return text.replace(/[İI]/g, "i").toLowerCase();
}

function tokenizeSpoken(text: string): SpokenItem[] {
  const raw = lowerForAddress(text)
    .replace(/[.!?…]+\s*$/u, "")
    .replace(/[,;:"“”()]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const items: SpokenItem[] = [];
  for (let i = 0; i < raw.length; i++) {
    const bigram = i + 1 < raw.length ? `${raw[i]} ${raw[i + 1]}` : "";
    if (bigram && SYMBOL_BIGRAMS[bigram]) {
      items.push({ sym: SYMBOL_BIGRAMS[bigram] });
      i++;
      continue;
    }
    const sym = SYMBOL_WORDS[raw[i]];
    if (sym) {
      items.push({ sym });
      if (sym === "@" && (raw[i + 1] === "işareti" || raw[i + 1] === "isareti")) i++;
      continue;
    }
    items.push({ word: raw[i] });
  }
  return items;
}

function joinItems(items: SpokenItem[]): string {
  return items.map((it) => ("sym" in it ? it.sym : it.word)).join("");
}

/**
 * Normalize a dictated address ("yusuf alt çizgi alper et gmail nokta com") to its canonical
 * form, or null when it is absent, ambiguous or invalid. The caller decides whether the message
 * is in email context; this function never applies outside it.
 */
export function normalizeSpokenEmail(message: string): string | null {
  const text = String(message || "").trim();
  if (!text || text.length > 200) return null;
  const items = tokenizeSpoken(text);
  const atIndexes = items.flatMap((it, i) => ("sym" in it && it.sym === "@" ? [i] : []));
  if (atIndexes.length !== 1) return null;
  const at = atIndexes[0];

  let start = at;
  let localWords = 0;
  while (start > 0) {
    const prev = items[start - 1];
    if ("word" in prev) {
      if (BOUNDARY_WORDS.has(prev.word)) break;
      if (!EMAIL_WORD_TOKEN.test(prev.word)) return null;
      if (++localWords > MAX_LOCAL_WORDS) return null;
    }
    start--;
  }

  let end = at + 1;
  while (end < items.length) {
    const next = items[end];
    if ("word" in next) {
      if (BOUNDARY_WORDS.has(next.word)) break;
      if (!EMAIL_WORD_TOKEN.test(next.word)) return null;
    }
    end++;
  }
  if (end < items.length && items.slice(end).some((it) => "sym" in it && it.sym !== ".")) return null;

  const local = joinItems(items.slice(start, at));
  const domain = joinItems(items.slice(at + 1, end));
  if (!local || !domain) return null;
  if (/^[._-]|[._-]$|\.\./.test(local)) return null;
  if (!DOMAIN.test(domain) || !/\.[a-z]{2,}$/.test(domain)) return null;

  const candidate = `${local}@${domain}`;
  return isValidEmail(candidate) ? candidate : null;
}
