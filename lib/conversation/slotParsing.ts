/**
 * Typed, expected-slot-aware slot parsers (product-global, deterministic).
 *
 * The caller's message is never rewritten for downstream consumers: every parser
 * derives its own view of `SlotInput` (names drop edge punctuation and politeness
 * tokens, phones keep spoken grouping, clocks keep ":"). Results distinguish
 * filled / ambiguous / declined / rejected, and reason codes are a finite,
 * PII-free vocabulary that is safe to persist and log.
 */

import { normalizeTurkishPhone } from "../phoneUtils";
import type { DayOfWeek, WeeklySchedule } from "../skills/ClinicWorkingHoursResolver";
import { spokenTurkishPhoneDigitCandidates } from "./turkishSpokenNumbers";

export interface SlotInput {
  /** The message exactly as received. */
  readonly raw: string;
  /** `raw` without surrounding whitespace; still punctuated and cased. */
  readonly trimmed: string;
}

export function toSlotInput(raw: string | null | undefined): SlotInput {
  const value = typeof raw === "string" ? raw : "";
  return { raw: value, trimmed: value.trim() };
}

export type SlotName = "treatment" | "preferredDate" | "preferredTime" | "fullName" | "phone" | "email";

export const SLOT_REASON_CODES = [
  "NAME_EXPLICIT",
  "NAME_BARE",
  "NAME_SINGLE_TOKEN",
  "NAME_TOO_MANY_TOKENS",
  "NAME_NON_NAME_TOKEN",
  "NAME_INVALID_CHARACTERS",
  "NAME_NO_CANDIDATE",
  "NAME_SURNAME_CORRECTION",
  "DATE_RESOLVED",
  "DATE_PARTIAL_MONTH",
  "DATE_INVALID_CALENDAR",
  "DATE_DAY_OF_MONTH_PASSED",
  "DATE_NOT_FOUND",
  "TIME_EXPLICIT",
  "TIME_DAYPART",
  "TIME_MERIDIEM_FROM_HOURS",
  "TIME_MERIDIEM_DEFAULT_WINDOW",
  "TIME_MERIDIEM_FROM_REPLY",
  "TIME_MERIDIEM_AMBIGUOUS",
  "TIME_NOT_FOUND",
  "PHONE_DIGITS",
  "PHONE_SPOKEN",
  "PHONE_AMBIGUOUS_GROUPING",
  "PHONE_INVALID",
  "PHONE_NOT_FOUND",
  "EMAIL_TYPED",
  "EMAIL_DICTATED",
  "EMAIL_DECLINED",
  "EMAIL_MALFORMED",
  "EMAIL_NOT_FOUND",
  "TREATMENT_MATCHED",
  "TREATMENT_NOT_FOUND",
  "NO_SLOT_VALUE",
] as const;

export type SlotReasonCode = (typeof SLOT_REASON_CODES)[number];

export type SlotParseResult<T> =
  | { status: "filled"; value: T; confidence: "high" | "medium"; reasonCode: SlotReasonCode }
  | { status: "ambiguous"; candidates?: T[]; reasonCode: SlotReasonCode }
  | { status: "declined"; reasonCode: SlotReasonCode }
  | { status: "rejected"; reasonCode: SlotReasonCode };

/** Value-free summary of one slot parse, carried on routing results and telemetry. */
export interface SlotOutcome {
  readonly status: SlotParseResult<unknown>["status"];
  readonly reasonCode: SlotReasonCode;
  readonly confidence?: "high" | "medium";
  /** Only ever clock times ("08:00"); never names, phones or addresses. */
  readonly candidates?: readonly string[];
}

export type SlotOutcomes = Partial<Record<SlotName, SlotOutcome>>;

export function filled<T>(value: T, reasonCode: SlotReasonCode, confidence: "high" | "medium" = "high"): SlotParseResult<T> {
  return { status: "filled", value, confidence, reasonCode };
}

export function rejected<T>(reasonCode: SlotReasonCode): SlotParseResult<T> {
  return { status: "rejected", reasonCode };
}

export function summarizeSlotResult(
  result: SlotParseResult<unknown>,
  options: { clockCandidates?: readonly string[] } = {}
): SlotOutcome {
  if (result.status === "filled") {
    return { status: "filled", reasonCode: result.reasonCode, confidence: result.confidence };
  }
  if (result.status === "ambiguous" && options.clockCandidates?.length) {
    return { status: "ambiguous", reasonCode: result.reasonCode, candidates: [...options.clockCandidates] };
  }
  return { status: result.status, reasonCode: result.reasonCode };
}

/** Maps the many expected-slot spellings used across surfaces onto the collected slot names. */
export function slotNameForExpected(expectedSlot?: string | null): SlotName | undefined {
  switch (expectedSlot) {
    case "fullName":
    case "name":
    case "patientName":
      return "fullName";
    case "phone":
    case "patientPhone":
      return "phone";
    case "email":
    case "patientEmail":
      return "email";
    case "preferredDate":
      return "preferredDate";
    case "preferredTime":
      return "preferredTime";
    case "treatment":
      return "treatment";
    default:
      return undefined;
  }
}

/* ── Full name ─────────────────────────────────────────────────────────── */

export interface ParsedFullName {
  fullName: string;
  firstName: string;
  lastName: string;
}

/**
 * Endings that only ever appear on a conjugated verb, never on a Turkish name.
 * These catch requests such as "implant yaptırmak istiyorum" without relying on
 * an exhaustive vocabulary list.
 */
const CONJUGATED_VERB_SUFFIX =
  /(?:yorum|yoruz|yorsun|yorsunuz|iyor|ıyor|uyor|üyor|acağım|eceğim|acagim|ecegim|malıyım|meliyim|maliyim|istiyor)$/;

/** Ability / question endings that never end a name ("söyleyebilirim", "duyuyor musunuz"). */
const NON_NAME_ENDING =
  /(?:abilir|ebilir|abilirim|ebilirim|abiliriz|ebiliriz|mısınız|misiniz|musunuz|müsünüz|mıyım|miyim|muyum|müyüm|madım|medim|amadım|emedim)$/;

/**
 * Words that describe an enquiry, a treatment or an attribute rather than a
 * person. A bare phrase containing any of them is never accepted as a name.
 */
const NON_NAME_WORDS = new Set([
  // Enquiry and conversational filler
  "randevu", "fiyat", "fiyatı", "fiyati", "tarih", "saat", "doktor", "klinik", "bilgi",
  "evet", "hayır", "hayir", "tamam", "merhaba", "selam", "hakkında", "hakkinda",
  "yes", "no", "okay", "please", "speak", "switch", "about", "price", "cost",
  // Language and question words
  "english", "turkish", "türkçe", "turkce", "deutsch", "french",
  "what", "who", "which", "where", "when", "how", "hangi", "nerede", "nasıl", "kim",
  // Gender and age tokens
  "erkek", "kadın", "kadin", "erkeğim", "erkeim", "kadınım", "kadinim",
  "male", "female", "bayan", "bay",
  "yaşındayım", "yasindayim", "yaşında", "yasinda",
  // Treatment vocabulary
  "implant", "implantı", "implanti", "tedavi", "tedavisi", "tedavim",
  "diş", "dis", "dişçi", "disci", "saç", "sac", "ekimi", "ekim",
  "estetik", "ameliyat", "operasyon", "burun", "protez", "dolgu", "kaplama",
  "zirkonyum", "botoks", "lazer", "muayene", "konsültasyon", "konsultasyon",
  "gülüş", "gulus", "tasarımı", "tasarimi",
  "treatment", "surgery", "dental", "hair", "transplant", "veneer", "crown",
  // Intent verbs that are not caught by the suffix rule
  "olmak", "yaptırmak", "yaptirmak", "almak", "yaptırmayı", "yaptirmayi",
  "want", "need", "looking", "would", "like",
]);

/**
 * Words that may legitimately appear around a name in speech but are never part
 * of one: numbers, scheduling words, contact nouns, pronouns and particles.
 */
const NAME_STOP_WORDS = new Set([
  "sıfır", "sifir", "bir", "iki", "üç", "uc", "dört", "dort", "beş", "bes", "altı", "alti",
  "yedi", "sekiz", "dokuz", "on", "yirmi", "otuz", "kırk", "kirk", "elli", "altmış", "altmis",
  "yetmiş", "yetmis", "seksen", "doksan", "yüz", "yuz", "bin",
  "günü", "gunu", "günde", "gunde", "hafta", "haftaya", "ayın", "ayin", "yarın", "yarin",
  "bugün", "bugun", "sabah", "öğle", "ogle", "öğlen", "oglen", "öğleden", "ogleden", "akşam", "aksam",
  "gece", "sonra", "önce", "once", "buçuk", "bucuk", "dakika", "saniye",
  "telefon", "telefonum", "numara", "numaram", "numarası", "numarasi", "mail", "maili", "mailim",
  "eposta", "e-posta", "email", "adres", "adresim", "adresi",
  "adım", "adim", "soyadım", "soyadim", "ismim", "isim", "benim", "sen", "siz", "biz",
  "bu", "şu", "daha", "çok", "cok", "acaba", "pardon", "tekrar", "anlamadım", "anlamadim",
  "bekleyin", "bekle", "ne", "neden", "niye", "nedir", "değil", "degil", "var", "yok",
  "mı", "mi", "mu", "mü", "ve", "veya", "ile", "için", "icin", "de", "da", "ki", "ama", "fakat",
  "lütfen", "lutfen", "efendim", "teşekkürler", "tesekkurler", "teşekkür", "tesekkur",
  "the", "and", "my", "is", "am", "name", "phone", "number", "thanks", "thank",
]);

/** Conversational openers stripped before a bare name ("Evet, …", "Tabii ki …"). */
const LEADING_FILLERS = new Set([
  "evet", "tamam", "tamamdır", "tamamdir", "tabii", "tabi", "olur", "peki", "şey", "sey",
  "ee", "eee", "ıı", "ııı", "ii", "hı", "hıhı", "hm", "hmm", "efendim", "buyurun", "buyrun",
  "elbette", "aynen", "yani", "hı-hı", "yes", "ok", "okay", "sure", "well", "yeah",
]);

const TRAILING_POLITE_SINGLE = new Set([
  "efendim", "lütfen", "lutfen", "teşekkürler", "tesekkurler", "sağolun", "sagolun", "sağol", "sagol",
  "please", "thanks",
]);

const TRAILING_POLITE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["teşekkür", "ederim"],
  ["tesekkur", "ederim"],
  ["sağ", "olun"],
  ["sag", "olun"],
  ["rica", "ederim"],
  ["thank", "you"],
];

/** Explicit introductions; matched on token keys anywhere in the message. */
const EXPLICIT_INTROS: ReadonlyArray<readonly string[]> = [
  ["benim", "adım", "soyadım"],
  ["benim", "adim", "soyadim"],
  ["adım", "soyadım"],
  ["adim", "soyadim"],
  ["adım", "ve", "soyadım"],
  ["benim", "adım"],
  ["benim", "adim"],
  ["benim", "ismim"],
  ["adım"],
  ["adim"],
  ["ismim"],
  ["my", "name", "is"],
  ["i", "am"],
  ["i'm"],
  ["i’m"],
];

const MAX_BARE_NAME_TOKENS = 4;
const MAX_EXPLICIT_NAME_TOKENS = 5;
const MAX_NAME_LENGTH = 60;

const NAME_WORD = /^[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*$/u;
const INITIAL_CORE = /^\p{Lu}$/u;
const COPULA_TAIL = /['’](?:um|üm|ım|im|dur|dür|dır|dir|tur|tür|tır|tir)$/u;
const EDGE_LEAD = /^["'“‘(«\[]+/u;
const EDGE_TRAIL = /["'”’)»\].!?…,;:]+$/u;

interface NameToken {
  /** Token without edge punctuation, original casing. */
  core: string;
  /** Lower-cased (tr) lookup key. */
  key: string;
  /** Punctuation after the token closes a clause ("Özgül." / "Özgül,"). */
  endsClause: boolean;
  isInitial: boolean;
}

function lowerTr(value: string): string {
  return value.toLocaleLowerCase("tr-TR").replace(/\u0307/g, "");
}

function tokenizeNameSegment(segment: string): NameToken[] {
  const tokens: NameToken[] = [];
  for (const piece of segment.split(/\s+/)) {
    if (!piece) continue;
    const lead = piece.replace(EDGE_LEAD, "");
    const trailMatch = lead.match(EDGE_TRAIL);
    const trail = trailMatch ? trailMatch[0] : "";
    const core = trail ? lead.slice(0, -trail.length) : lead;
    if (!core) continue;
    const isInitial = INITIAL_CORE.test(core) && trail.startsWith(".");
    const endsClause = !isInitial && /[.!?…,;]/.test(trail);
    tokens.push({ core, key: lowerTr(core), endsClause, isInitial });
  }
  return tokens;
}

/** Splits on separators that never occur inside a spoken name (";", "/", newline, spaced dashes). */
function nameSegments(text: string): NameToken[][] {
  return text
    .split(/[;\/\n]+|\s[-–—]+\s|\s[-–—]+$|^[-–—]+\s/)
    .map((segment) => tokenizeNameSegment(segment))
    .filter((tokens) => tokens.length > 0);
}

function clausesOf(tokens: NameToken[]): NameToken[][] {
  const clauses: NameToken[][] = [];
  let current: NameToken[] = [];
  for (const token of tokens) {
    current.push(token);
    if (token.endsClause) {
      clauses.push(current);
      current = [];
    }
  }
  if (current.length) clauses.push(current);
  return clauses;
}

function isNonNameKey(key: string): boolean {
  return (
    NON_NAME_WORDS.has(key) ||
    NAME_STOP_WORDS.has(key) ||
    CONJUGATED_VERB_SUFFIX.test(key) ||
    NON_NAME_ENDING.test(key)
  );
}

function stripPoliteTail(tokens: NameToken[]): NameToken[] {
  const out = [...tokens];
  let changed = true;
  while (changed && out.length) {
    changed = false;
    const last = out[out.length - 1];
    if (TRAILING_POLITE_SINGLE.has(last.key)) {
      out.pop();
      changed = true;
      continue;
    }
    if (out.length >= 2) {
      const prev = out[out.length - 2];
      if (TRAILING_POLITE_PAIRS.some(([a, b]) => prev.key === a && last.key === b)) {
        out.splice(-2, 2);
        changed = true;
      }
    }
  }
  return out;
}

function stripLeadingFillers(tokens: NameToken[]): NameToken[] {
  let i = 0;
  while (i < tokens.length) {
    const key = tokens[i].key;
    if (LEADING_FILLERS.has(key)) {
      i += 1;
      continue;
    }
    if (key === "ki" && i > 0 && ["tabii", "tabi", "elbette"].includes(tokens[i - 1].key)) {
      i += 1;
      continue;
    }
    break;
  }
  return tokens.slice(i);
}

function matchIntroAt(tokens: NameToken[], index: number): number {
  for (const intro of EXPLICIT_INTROS) {
    if (index + intro.length > tokens.length) continue;
    let ok = true;
    for (let k = 0; k < intro.length; k++) {
      const token = tokens[index + k];
      // An intro may not be split across a clause boundary ("Adım. Yusuf" is fine; "Benim, adım" is not).
      if (token.key !== intro[k] || (k < intro.length - 1 && token.endsClause)) {
        ok = false;
        break;
      }
    }
    if (ok) return intro.length;
  }
  return 0;
}

function stripIntroAtStart(tokens: NameToken[]): NameToken[] {
  const consumed = matchIntroAt(tokens, 0);
  if (consumed > 0) return tokens.slice(consumed);
  if (tokens.length > 1 && tokens[0].key === "ben" && !tokens[0].endsClause) return tokens.slice(1);
  return tokens;
}

function displayToken(token: NameToken, isLast: boolean): string {
  if (token.isInitial) return `${token.core}.`;
  return isLast ? token.core.replace(COPULA_TAIL, "") : token.core;
}

function buildName(tokens: NameToken[]): ParsedFullName {
  const words = tokens.map((t, i) => displayToken(t, i === tokens.length - 1));
  return { fullName: words.join(" "), firstName: words[0], lastName: words.slice(1).join(" ") };
}

function validateNameTokens(
  tokens: NameToken[],
  maxTokens: number,
  reasonCode: SlotReasonCode
): SlotParseResult<ParsedFullName> | null {
  if (tokens.length === 0) return null;
  for (const token of tokens) {
    if (token.isInitial) continue;
    const bare = token.core.replace(COPULA_TAIL, "");
    if (!NAME_WORD.test(bare)) return rejected("NAME_INVALID_CHARACTERS");
    if (isNonNameKey(lowerTr(bare)) || isNonNameKey(token.key)) return rejected("NAME_NON_NAME_TOKEN");
    if ([...bare].length < 2) return rejected("NAME_INVALID_CHARACTERS");
  }
  const words = tokens.filter((t) => !t.isInitial);
  if (words.length < 2) return rejected("NAME_SINGLE_TOKEN");
  if (tokens.length > maxTokens) return rejected("NAME_TOO_MANY_TOKENS");
  const name = buildName(tokens);
  if (name.fullName.length > MAX_NAME_LENGTH) return rejected("NAME_TOO_MANY_TOKENS");
  const capitalized = words.every((t) => /^\p{Lu}/u.test(t.core));
  return filled(name, reasonCode, reasonCode === "NAME_EXPLICIT" || capitalized ? "high" : "medium");
}

function explicitName(tokens: NameToken[]): SlotParseResult<ParsedFullName> | null {
  let failure: SlotParseResult<ParsedFullName> | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const introLength = matchIntroAt(tokens, i);
    if (!introLength) continue;
    const collected: NameToken[] = [];
    for (let j = i + introLength; j < tokens.length && collected.length < MAX_EXPLICIT_NAME_TOKENS + 2; j++) {
      const token = tokens[j];
      const bare = token.core.replace(COPULA_TAIL, "");
      if (!token.isInitial && (!NAME_WORD.test(bare) || isNonNameKey(lowerTr(bare)))) {
        if (TRAILING_POLITE_SINGLE.has(token.key) || TRAILING_POLITE_PAIRS.some(([a]) => a === token.key)) {
          collected.push(token);
          if (token.endsClause) break;
          continue;
        }
        break;
      }
      collected.push(token);
      if (token.endsClause) break;
    }
    const result = validateNameTokens(stripPoliteTail(collected), MAX_EXPLICIT_NAME_TOKENS, "NAME_EXPLICIT");
    if (result?.status === "filled") return result;
    failure ??= result;
  }
  return failure;
}

/**
 * Full-name slot. Explicit introductions ("Adım …", "Benim adım …", "My name is …")
 * are trusted anywhere in the message; a bare phrase is only read as a name when
 * `allowBare` says the turn is about the patient's identity. Casing is preserved,
 * edge punctuation and politeness tokens never become part of the name, and a
 * single word is reported as `NAME_SINGLE_TOKEN` rather than guessed.
 */
export function parseFullNameSlot(
  input: SlotInput,
  options: { allowBare: boolean }
): SlotParseResult<ParsedFullName> {
  const text = input.trimmed.normalize("NFC");
  if (!text) return rejected("NAME_NO_CANDIDATE");
  const segments = nameSegments(text);
  const allTokens = segments.flat();

  const explicit = explicitName(allTokens);
  if (explicit?.status === "filled") return explicit;
  if (!options.allowBare) return explicit ?? rejected("NAME_NO_CANDIDATE");

  let failure: SlotParseResult<ParsedFullName> | null = explicit;
  for (const segment of segments) {
    for (const clause of clausesOf(segment)) {
      const candidate = stripPoliteTail(stripIntroAtStart(stripLeadingFillers(clause)));
      const result = validateNameTokens(candidate, MAX_BARE_NAME_TOKENS, "NAME_BARE");
      if (result?.status === "filled") return result;
      if (result && (!failure || failure.reasonCode === "NAME_NON_NAME_TOKEN")) failure = result;
    }
  }
  return failure ?? rejected("NAME_NO_CANDIDATE");
}

const SURNAME_INTRO_KEYS = new Set(["soyadım", "soyadim"]);

/**
 * Surname-only correction against an already collected full name
 * ("Soyadım Kaya olacaktı", "Soyadım Kaya'dır"). Only the last word of the existing
 * name is replaced; without an existing name nothing is guessed.
 */
export function parseSurnameCorrection(
  input: SlotInput,
  existingFullName: string | null | undefined
): SlotParseResult<ParsedFullName> | null {
  const existing = String(existingFullName || "").normalize("NFC").trim().split(/\s+/).filter(Boolean);
  if (existing.length < 2) return null;
  const tokens = nameSegments(input.trimmed.normalize("NFC")).flat();
  // "Adım Yusuf soyadım Özgül" restates the whole name; that is not a surname-only edit.
  if (tokens.some((t) => t.key === "adım" || t.key === "adim" || t.key === "ismim")) return null;
  for (let i = 0; i < tokens.length - 1; i++) {
    const intro = tokens[i];
    const isSurnameIntro =
      (SURNAME_INTRO_KEYS.has(intro.key) && !intro.endsClause) ||
      (intro.key === "soy" && tokens[i + 1]?.key.startsWith("ad") && !intro.endsClause);
    if (!isSurnameIntro) continue;
    const surname = tokens[intro.key === "soy" ? i + 2 : i + 1];
    if (!surname || surname.isInitial) return null;
    const bare = surname.core.replace(COPULA_TAIL, "");
    if (!NAME_WORD.test(bare) || [...bare].length < 2 || isNonNameKey(lowerTr(bare))) {
      return rejected("NAME_NON_NAME_TOKEN");
    }
    const words = [...existing.slice(0, -1), bare];
    return filled(
      { fullName: words.join(" "), firstName: words[0], lastName: words.slice(1).join(" ") },
      "NAME_SURNAME_CORRECTION"
    );
  }
  return null;
}

/* ── Utterance clauses (statement vs question) ─────────────────────────── */

const DISCOURSE_SPLIT = /[,;]?\s+(?=(?:bu arada|ayrıca|ayrica|by the way)(?![\p{L}\p{N}]))/giu;
const QUESTION_PARTICLE =
  /(?<![\p{L}\p{N}])m[ıiuü](?:s[ıiuü]n[ıiuü]z|s[ıiuü]n|y[ıiuü]m|y[ıiuü]z|d[ıiuü]r)?(?![\p{L}\p{N}])/u;
const QUESTION_WORDS =
  /(?<![\p{L}\p{N}])(?:ne kadar|ne zaman|nedir|neden|niye|nasıl|nasil|nerede|nereden|hangi|hangisi|kim|kimdir|kaç|kac|what|who|which|where|when|why|how|is there|are there|do you|does|can you|could you)(?![\p{L}\p{N}])/iu;

/**
 * Splits an utterance into clauses at sentence punctuation followed by whitespace and at
 * discourse markers ("bu arada", "ayrıca"). Emails, decimals and clock times stay intact
 * because they never contain punctuation followed by whitespace.
 */
export function splitUtteranceClauses(text: string): string[] {
  return String(text || "")
    .normalize("NFC")
    .split(/(?<=[.!?…])\s+/u)
    .flatMap((sentence) => sentence.split(DISCOURSE_SPLIT))
    .map((clause) => clause.trim())
    .filter(Boolean);
}

export function isQuestionClause(clause: string): boolean {
  const text = clause.trim();
  if (!text) return false;
  if (/[?？]\s*$/u.test(text)) return true;
  const lower = text.toLocaleLowerCase("tr-TR");
  return QUESTION_PARTICLE.test(lower) || QUESTION_WORDS.test(lower);
}

/**
 * The statement part of a mixed turn. Slot values are only ever read from clauses that
 * are not questions, so wording inside "İmplant fiyatınız ne kadar?" never becomes a slot.
 */
export function statementClauses(utterance: string): { text: string; hadQuestion: boolean } {
  const clauses = splitUtteranceClauses(utterance);
  const statements = clauses.filter((clause) => !isQuestionClause(clause));
  // Each clause keeps a terminator so name parsing never joins words across clauses.
  const text = statements.map((clause) => (/[.!?…]$/u.test(clause) ? clause : `${clause}.`)).join(" ");
  return { text, hadQuestion: statements.length < clauses.length };
}

/**
 * True when a phrase reads as a request or description instead of a name.
 * Exported so callers that receive a name from a model can reject text such as
 * "implant yaptırmak istiyorum" before storing it as patient information.
 */
export function looksLikeRequestPhrase(segment: string): boolean {
  if (!segment) return false;
  return segment
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .some((token) => NON_NAME_WORDS.has(token) || CONJUGATED_VERB_SUFFIX.test(token));
}

/* ── Phone ─────────────────────────────────────────────────────────────── */

function typedPhone(raw: string): string | null {
  const norm = normalizeTurkishPhone(raw);
  if (norm.valid) return norm.display;

  // International format with country code (+44 7911 123456, +90 532 123 45 67)
  const intlMatch = raw.match(/\+\d{1,4}(?:[\s.-]?\(?\d{1,4}\)?)*(?:[\s.-]?\d{1,4}){2,5}/);
  if (intlMatch) {
    const digits = intlMatch[0].replace(/\D/g, "");
    if (digits.length >= 9 && digits.length <= 16) return intlMatch[0].trim();
  }

  // Local format with optional leading zero or parentheses
  const localMatch =
    raw.match(/(?:\+?\d{1,3}[\s-]?)?\(?0?\d{2,4}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/) ||
    raw.match(/\b(?:\+\d{1,3}[\s-]?)?\d{9,14}\b/);
  if (localMatch) {
    const digits = localMatch[0].replace(/[\s()\-]/g, "").replace(/\D/g, "");
    if (digits.length >= 9 && digits.length <= 16) return localMatch[0].trim();
  }

  // The message itself is a clean phone number
  const allDigits = raw.replace(/\D/g, "");
  if (allDigits.length >= 9 && allDigits.length <= 16 && (raw.startsWith("+") || raw.startsWith("0") || raw.startsWith("5"))) {
    return raw.trim();
  }
  return null;
}

/**
 * Phone slot. Typed digits keep their existing normalization. Spoken Turkish numbers
 * are accepted only when every grouping of the speech resolves to the same valid
 * mobile; competing readings ("beş yüz otuz iki yüz …") are `ambiguous`, never picked.
 */
export function parsePhoneSlot(input: SlotInput): SlotParseResult<string> {
  const raw = input.trimmed;
  if (!raw) return rejected("PHONE_NOT_FOUND");
  const typed = typedPhone(raw);
  if (typed) return filled(typed, "PHONE_DIGITS");

  const readings = spokenTurkishPhoneDigitCandidates(raw);
  if (readings.length === 0) {
    return rejected(raw.replace(/\D/g, "").length >= 7 ? "PHONE_INVALID" : "PHONE_NOT_FOUND");
  }
  const valid = Array.from(
    new Set(
      readings
        .map((digits) => normalizeTurkishPhone(digits))
        .filter((norm) => norm.valid)
        .map((norm) => norm.display)
    )
  );
  if (valid.length === 1 && readings.length === 1) return filled(valid[0], "PHONE_SPOKEN");
  if (valid.length === 1) return filled(valid[0], "PHONE_SPOKEN", "medium");
  if (valid.length > 1) return { status: "ambiguous", candidates: valid, reasonCode: "PHONE_AMBIGUOUS_GROUPING" };
  return rejected("PHONE_INVALID");
}

/* ── Clock meridiem ────────────────────────────────────────────────────── */

export interface MeridiemContext {
  workingHours?: WeeklySchedule | null;
  is24_7?: boolean;
  /** Candidates offered on the previous turn ("08:00", "20:00"); a daypart reply selects one. */
  pendingCandidates?: readonly string[] | null;
}

const WEEKDAYS: DayOfWeek[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DEFAULT_WINDOW: readonly [string, string] = ["08:00", "20:00"];

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  return h * 60 + (m || 0);
}

function withinWindow(time: string, window: readonly [string, string]): boolean {
  const t = minutesOf(time);
  return t >= minutesOf(window[0]) && t < minutesOf(window[1]);
}

function windowsFor(schedule: WeeklySchedule, isoDate?: string | null): Array<readonly [string, string]> {
  if (isoDate && /^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    const [y, m, d] = isoDate.split("-").map((n) => parseInt(n, 10));
    const day = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    const hours = schedule[day];
    return hours ? [hours] : [];
  }
  return Object.values(schedule).filter((h): h is [string, string] => Array.isArray(h));
}

function pad(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Resolves a 12-hour-ambiguous clock ("saat iki", "iki buçuk") without guessing: the
 * reading inside clinic hours wins; with both readings plausible the result is
 * `ambiguous` with both candidates. With no plausible reading the literal clock is
 * kept so the existing working-hours validation explains the rejection.
 */
export function resolveClockMeridiem(
  time: string,
  context: MeridiemContext & { isoDate?: string | null }
): SlotParseResult<string> {
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return filled(time, "TIME_EXPLICIT");
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 1 || h > 11) return filled(time, "TIME_EXPLICIT");
  const am = pad(h, m);
  const pm = pad(h + 12, m);

  if (context.is24_7) return { status: "ambiguous", candidates: [am, pm], reasonCode: "TIME_MERIDIEM_AMBIGUOUS" };

  const schedule = context.workingHours;
  const windows = schedule ? windowsFor(schedule, context.isoDate) : [DEFAULT_WINDOW];
  const reason: SlotReasonCode = schedule ? "TIME_MERIDIEM_FROM_HOURS" : "TIME_MERIDIEM_DEFAULT_WINDOW";
  const amOk = windows.some((w) => withinWindow(am, w));
  const pmOk = windows.some((w) => withinWindow(pm, w));
  if (amOk && pmOk) return { status: "ambiguous", candidates: [am, pm], reasonCode: "TIME_MERIDIEM_AMBIGUOUS" };
  if (pmOk) return filled(pm, reason);
  if (amOk) return filled(am, reason);
  return filled(am, "TIME_EXPLICIT", "medium");
}

const AM_REPLY = /(?<![\p{L}\p{N}])(sabah|sabahleyin|öğleden önce|ogleden once|morning|am|a\.m\.)(?![\p{L}\p{N}])/iu;
const PM_REPLY =
  /(?<![\p{L}\p{N}])(öğleden sonra|ogleden sonra|öğlen|oglen|öğle|ogle|akşam|aksam|akşamüstü|aksamustu|gece|afternoon|evening|night|pm|p\.m\.)(?![\p{L}\p{N}])/iu;

/** A reply to "08:00 mi, 20:00 mi?" — daypart word or one of the offered clocks. */
export function selectPendingClockCandidate(
  message: string,
  candidates: readonly string[],
  parsedTime?: string | null
): string | null {
  if (candidates.length !== 2) return null;
  if (parsedTime && candidates.includes(parsedTime)) return parsedTime;
  const lower = lowerTr(message);
  const am = AM_REPLY.test(lower);
  const pm = PM_REPLY.test(lower);
  if (am && !pm) return candidates[0];
  if (pm && !am) return candidates[1];
  return null;
}
