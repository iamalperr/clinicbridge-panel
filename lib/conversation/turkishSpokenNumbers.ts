/**
 * Contextual reading of Turkish spoken numbers for appointment dates, clock
 * times and phone numbers.
 *
 * Voice STT runs with numerals/smart_format off, so callers arrive as
 * "on iki ekim saat üç". `normalizeTurkishSpokenTemporal` produces the digit
 * view ("12 ekim saat 3") consumed by the existing digit parsers, so every
 * canonical date/time safety rule still applies. Number words are rewritten
 * only when anchored by a month, "saat", a day-period word, "buçuk" /
 * "geçe" / "var", a preceding date, or when the whole message is a number.
 * Text without a rewrite is returned unchanged.
 */

type SuffixType = "none" | "case" | "possessive" | "ordinal";
type CaseKind = "loc" | "abl" | "dat" | null;
type Period = "am" | "noon" | "pm" | "night";

interface NumberToken {
  value: number;
  kind: "zero" | "unit" | "ten" | "hundred" | "thousand";
  suffixType: SuffixType;
  /** Folded suffix as spoken, e.g. "te", "ye", "si" */
  suffix: string;
  caseKind: CaseKind;
}

interface WordItem {
  type: "word";
  raw: string;
  lower: string;
  folded: string;
  trailing: string;
}

interface GroupItem {
  type: "group";
  raw: string;
  value: number;
  last: NumberToken;
  trailing: string;
}

type Item = WordItem | GroupItem;

const TRAILING_PUNCT = /[.,!?;:…"'”’)]+$/u;
const LEADING_PUNCT = /^["'“‘(]+/u;

function lowerTr(s: string): string {
  return s.toLocaleLowerCase("tr-TR").replace(/\u0307/g, "");
}

function foldTr(s: string): string {
  return lowerTr(s)
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .replace(/[’']/g, "");
}

interface NumberStem {
  stem: string;
  value: number;
  /** Back-vowel harmony selects -da/-dan/-a instead of -de/-den/-e */
  back: boolean;
  /** dört → dörd- before a vowel suffix */
  vowelSuffixOnly?: boolean;
  consonantSuffixOnly?: boolean;
  /** yüz / bin carry no suffix here ("yüzde" is percent) */
  bareOnly?: boolean;
}

const NUMBER_STEMS: NumberStem[] = [
  { stem: "sifir", value: 0, back: true },
  { stem: "bir", value: 1, back: false },
  { stem: "iki", value: 2, back: false },
  { stem: "uc", value: 3, back: false },
  { stem: "dort", value: 4, back: false, consonantSuffixOnly: true },
  { stem: "dord", value: 4, back: false, vowelSuffixOnly: true },
  { stem: "bes", value: 5, back: false },
  { stem: "alti", value: 6, back: true },
  { stem: "yedi", value: 7, back: false },
  { stem: "sekiz", value: 8, back: false },
  { stem: "dokuz", value: 9, back: true },
  { stem: "on", value: 10, back: true },
  { stem: "yirmi", value: 20, back: false },
  { stem: "otuz", value: 30, back: true },
  { stem: "kirk", value: 40, back: true },
  { stem: "elli", value: 50, back: false },
  { stem: "altmis", value: 60, back: true },
  { stem: "yetmis", value: 70, back: false },
  { stem: "seksen", value: 80, back: false },
  { stem: "doksan", value: 90, back: true },
  { stem: "yuz", value: 100, back: false, bareOnly: true },
  { stem: "bin", value: 1000, back: false, bareOnly: true },
].sort((a, b) => b.stem.length - a.stem.length);

const CASE_BACK: Record<string, CaseKind> = { da: "loc", ta: "loc", dan: "abl", tan: "abl", a: "dat", ya: "dat" };
const CASE_FRONT: Record<string, CaseKind> = { de: "loc", te: "loc", den: "abl", ten: "abl", e: "dat", ye: "dat" };
const ORDINAL_SUFFIXES = new Set(["inci", "nci", "uncu", "ncu"]);
const POSSESSIVE_SUFFIXES = ["si", "yi", "i", "u"];
const POSSESSIVE_CASE_TAILS = new Set(["", "nde", "nda", "ne", "na", "nden", "ndan"]);

function kindOf(value: number): NumberToken["kind"] {
  if (value === 0) return "zero";
  if (value < 10) return "unit";
  if (value < 100) return "ten";
  return value === 100 ? "hundred" : "thousand";
}

function parseNumberToken(folded: string): NumberToken | null {
  if (!folded || !/^[a-z]+$/.test(folded)) return null;
  for (const s of NUMBER_STEMS) {
    if (!folded.startsWith(s.stem)) continue;
    const rest = folded.slice(s.stem.length);
    if (s.bareOnly && rest !== "") continue;
    if (s.vowelSuffixOnly && !/^[aeiu]/.test(rest)) continue;
    if (s.consonantSuffixOnly && /^[aeiu]/.test(rest)) continue;
    const kind = kindOf(s.value);
    if (rest === "") return { value: s.value, kind, suffixType: "none", suffix: "", caseKind: null };
    const caseTable = s.back ? CASE_BACK : CASE_FRONT;
    if (rest in caseTable) {
      return { value: s.value, kind, suffixType: "case", suffix: rest, caseKind: caseTable[rest] };
    }
    if (ORDINAL_SUFFIXES.has(rest)) {
      return { value: s.value, kind, suffixType: "ordinal", suffix: rest, caseKind: null };
    }
    for (const p of POSSESSIVE_SUFFIXES) {
      if (rest.startsWith(p) && POSSESSIVE_CASE_TAILS.has(rest.slice(p.length))) {
        return { value: s.value, kind, suffixType: "possessive", suffix: rest, caseKind: null };
      }
    }
  }
  return null;
}

const MONTHS: Array<{ stem: string; mutated?: string; name: string }> = [
  { stem: "ocak", mutated: "ocag", name: "ocak" },
  { stem: "subat", name: "şubat" },
  { stem: "mart", name: "mart" },
  { stem: "nisan", name: "nisan" },
  { stem: "mayis", name: "mayıs" },
  { stem: "haziran", name: "haziran" },
  { stem: "temmuz", name: "temmuz" },
  { stem: "agustos", name: "ağustos" },
  { stem: "eylul", name: "eylül" },
  { stem: "ekim", name: "ekim" },
  { stem: "kasim", name: "kasım" },
  { stem: "aralik", mutated: "aralig", name: "aralık" },
];

/**
 * Month as a date head: bare, locative or dative ("ekim", "ekimde", "ekime").
 * Accusative/possessive forms ("saç ekimi") are never a month.
 */
function monthHead(folded: string): { name: string; bare: boolean } | null {
  for (const m of MONTHS) {
    if (folded === m.stem) return { name: m.name, bare: true };
    const rest = folded.startsWith(m.stem) ? folded.slice(m.stem.length) : null;
    if (rest !== null && ["da", "de", "ta", "te"].includes(rest)) return { name: m.name, bare: false };
    const vowelStem = m.mutated ?? m.stem;
    const vowelRest = folded.startsWith(vowelStem) ? folded.slice(vowelStem.length) : null;
    if (vowelRest !== null && ["a", "e"].includes(vowelRest)) return { name: m.name, bare: false };
  }
  return null;
}

/** Genitive month ("ekimin", "ağustosun", "aralığın"). */
function monthGenitive(folded: string): string | null {
  for (const m of MONTHS) {
    const stem = m.mutated ?? m.stem;
    if (folded.startsWith(stem) && ["in", "un"].includes(folded.slice(stem.length))) return m.name;
  }
  return null;
}

const PERIOD_WORDS: Record<string, Period> = {
  sabah: "am", sabahleyin: "am", sabahi: "am",
  ogle: "noon", oglen: "noon", ogleyin: "noon",
  ikindi: "pm",
  aksam: "pm", aksami: "pm", aksamleyin: "pm", aksamustu: "pm",
};

/** Words that make a preceding number a quantity, not a clock time or day. */
const QUANTITY_WORDS = new Set([
  "gun", "gunluk", "gece", "hafta", "haftalik", "ay", "aylik", "yil", "yillik", "sene", "dakika", "saat", "saniye",
  "kisi", "tane", "adet", "kere", "kez", "defa", "sefer", "greft", "implant", "dis", "seans",
  "lira", "tl", "euro", "avro", "dolar", "sterlin", "kilo", "kg", "cm", "mm", "metre",
  "yas", "yasinda", "yasindayim", "numara", "milyon",
]);

const DATE_CONTEXT_WORDS = new Set([
  "pazartesi", "sali", "carsamba", "persembe", "cuma", "cumartesi", "pazar", "gunu", "yarin", "bugun",
]);

interface RawToken {
  raw: string;
  lower: string;
  folded: string;
  trailing: string;
  num: NumberToken | null;
}

function tokenize(text: string): RawToken[] {
  return text.split(/\s+/).filter(Boolean).map((raw) => {
    const trailingMatch = raw.match(TRAILING_PUNCT);
    const trailing = trailingMatch ? trailingMatch[0] : "";
    const core = raw.slice(0, raw.length - trailing.length).replace(LEADING_PUNCT, "");
    const folded = foldTr(core);
    return { raw, lower: lowerTr(core), folded, trailing, num: parseNumberToken(folded) };
  });
}

/**
 * Group consecutive number words into numbers ("beş yüz otuz bir" → 531).
 * A suffixed word or punctuation ends a number; a unit followed by "yüz" /
 * "bin" starts a new number once tens/hundreds are present
 * ("doksan beş yüz otuz iki" → 90 | 532).
 */
function buildItems(text: string): Item[] {
  const tokens = tokenize(text);
  const items: Item[] = [];
  type Acc = { th: number | null; h: number | null; t: number | null; u: number | null; closed: boolean; raws: string[]; last: NumberToken; trailing: string };
  let acc: Acc | null = null;

  const flush = () => {
    if (!acc) return;
    items.push({
      type: "group",
      raw: acc.raws.join(" "),
      value: (acc.th ?? 0) + (acc.h ?? 0) + (acc.t ?? 0) + (acc.u ?? 0),
      last: acc.last,
      trailing: acc.trailing,
    });
    acc = null;
  };

  tokens.forEach((tok, idx) => {
    const num = tok.num;
    if (!num) {
      flush();
      items.push({ type: "word", raw: tok.raw, lower: tok.lower, folded: tok.folded, trailing: tok.trailing });
      return;
    }
    const nextKind = tokens[idx + 1]?.num?.kind;
    const joins = (g: Acc): boolean => {
      if (g.closed) return false;
      switch (num.kind) {
        case "zero":
          return false;
        case "unit":
          if (g.u !== null) return false;
          if (nextKind === "hundred" && (g.t !== null || g.h !== null)) return false;
          if (nextKind === "thousand" && (g.t !== null || g.h !== null || g.th !== null)) return false;
          return true;
        case "ten":
          return g.t === null && g.u === null;
        case "hundred":
          return g.h === null && g.t === null && (g.u === null || g.u >= 2);
        case "thousand":
          return g.th === null;
      }
    };

    if (acc && joins(acc)) {
      const g: Acc = acc;
      if (num.kind === "unit") g.u = num.value;
      else if (num.kind === "ten") g.t = num.value;
      else if (num.kind === "hundred") {
        g.h = (g.u ?? 1) * 100;
        g.u = null;
      } else if (num.kind === "thousand") {
        g.th = ((g.h ?? 0) + (g.t ?? 0) + (g.u ?? 0) || 1) * 1000;
        g.h = g.t = g.u = null;
      }
      g.raws.push(tok.raw);
      g.last = num;
      g.trailing = tok.trailing;
      if (num.suffixType !== "none" || tok.trailing) g.closed = true;
      return;
    }

    flush();
    acc = {
      th: num.kind === "thousand" ? 1000 : null,
      h: num.kind === "hundred" ? 100 : null,
      t: num.kind === "ten" ? num.value : null,
      u: num.kind === "unit" || num.kind === "zero" ? num.value : null,
      closed: num.kind === "zero" || num.suffixType !== "none" || Boolean(tok.trailing),
      raws: [tok.raw],
      last: num,
      trailing: tok.trailing,
    };
  });
  flush();
  return items;
}

interface SpokenTime {
  h: number;
  m: number | null;
  /** Folded suffix carried by the last consumed word (e.g. "te", "ye") */
  suffix: string;
  caseKind: CaseKind;
  consumed: number;
  /** Minutes came from buçuk / geçe / var or a second number */
  explicitMinutes: boolean;
  /** Minutes came from a marker word, not a bare second number */
  byMarker: boolean;
  trailing: string;
}

function isWord(item: Item | undefined, folded: string): item is WordItem {
  return Boolean(item && item.type === "word" && item.folded === folded);
}

function isGece(item: Item | undefined): item is WordItem {
  return Boolean(item && item.type === "word" && item.lower === "geçe");
}

/** A number followed by a unit word or another number is a quantity. */
function quantityFollows(items: Item[], idx: number): boolean {
  const next = items[idx];
  if (!next) return false;
  return next.type === "group" || QUANTITY_WORDS.has(next.folded);
}

function parseBucuk(item: Item | undefined): { suffix: string; caseKind: CaseKind } | null {
  if (!item || item.type !== "word") return null;
  switch (item.folded) {
    case "bucuk":
      return { suffix: "", caseKind: null };
    case "bucukta":
      return { suffix: "ta", caseKind: "loc" };
    case "bucuktan":
      return { suffix: "tan", caseKind: "abl" };
    case "bucuga":
      return { suffix: "a", caseKind: "dat" };
    default:
      return null;
  }
}

/** Clock expression at items[idx]: "on dört otuz", "üç buçuk", "üçü çeyrek geçe", "dörde on var". */
function parseSpokenTime(items: Item[], idx: number): SpokenTime | null {
  const g1 = items[idx];
  if (!g1 || g1.type !== "group" || g1.value > 23) return null;
  const h = g1.value;
  const s1 = g1.last;
  const a = items[idx + 1];
  const b = items[idx + 2];

  if (s1.suffixType === "ordinal") return null;

  if (s1.suffixType === "possessive") {
    if (isWord(a, "ceyrek") && isGece(b)) {
      return { h, m: 15, suffix: "", caseKind: null, consumed: 3, explicitMinutes: true, byMarker: true, trailing: b.trailing };
    }
    if (a?.type === "group" && a.last.suffixType === "none" && a.value >= 1 && a.value <= 59 && isGece(b)) {
      return { h, m: a.value, suffix: "", caseKind: null, consumed: 3, explicitMinutes: true, byMarker: true, trailing: b.trailing };
    }
    // "saat üçü" without minutes is not a clock; never drop minutes silently.
    return null;
  }

  if (s1.suffixType === "case") {
    if (s1.caseKind === "dat") {
      const prevHour = h <= 1 ? 12 : h - 1;
      if (isWord(a, "ceyrek") && isWord(b, "var")) {
        return { h: prevHour, m: 45, suffix: "", caseKind: null, consumed: 3, explicitMinutes: true, byMarker: true, trailing: b.trailing };
      }
      if (a?.type === "group" && a.last.suffixType === "none" && a.value >= 1 && a.value <= 59 && isWord(b, "var")) {
        return { h: prevHour, m: 60 - a.value, suffix: "", caseKind: null, consumed: 3, explicitMinutes: true, byMarker: true, trailing: b.trailing };
      }
    }
    return { h, m: null, suffix: s1.suffix, caseKind: s1.caseKind, consumed: 1, explicitMinutes: false, byMarker: false, trailing: g1.trailing };
  }

  const bucuk = !g1.trailing ? parseBucuk(a) : null;
  if (bucuk) {
    return {
      h,
      m: 30,
      suffix: bucuk.suffix,
      caseKind: bucuk.caseKind,
      consumed: 2,
      explicitMinutes: true,
      byMarker: true,
      trailing: (a as WordItem).trailing,
    };
  }

  if (
    !g1.trailing &&
    a?.type === "group" &&
    a.value <= 59 &&
    (a.last.suffixType === "none" || a.last.suffixType === "case") &&
    !quantityFollows(items, idx + 2)
  ) {
    return {
      h,
      m: a.value,
      suffix: a.last.suffix,
      caseKind: a.last.caseKind,
      consumed: 2,
      explicitMinutes: true,
      byMarker: false,
      trailing: a.trailing,
    };
  }

  return { h, m: null, suffix: "", caseKind: null, consumed: 1, explicitMinutes: false, byMarker: false, trailing: g1.trailing };
}

function withSuffix(core: string, suffix: string): string {
  return suffix ? `${core}'${suffix}` : core;
}

function clock(h: number, m: number | null): string {
  return m === null ? String(h) : `${h}:${String(m).padStart(2, "0")}`;
}

function paddedClock(h: number, m: number | null): string {
  return `${String(h).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}`;
}

function applyPeriod(period: Period, h: number): number {
  if (period === "pm" && h >= 1 && h <= 11) return h + 12;
  if (period === "noon" && h >= 1 && h <= 6) return h + 12;
  if (period === "night") {
    if (h >= 8 && h <= 11) return h + 12;
    if (h === 12) return 0;
  }
  return h;
}

function parsePeriod(items: Item[], idx: number): { period: Period; consumed: number } | null {
  const a = items[idx];
  if (!a || a.type !== "word") return null;
  if (a.folded === "ogleden") {
    const b = items[idx + 1];
    if (isWord(b, "sonra")) return { period: "pm", consumed: 2 };
    if (isWord(b, "once")) return { period: "am", consumed: 2 };
    return null;
  }
  if (a.lower === "gece" || a.lower === "geceleyin") return { period: "night", consumed: 1 };
  const period = PERIOD_WORDS[a.folded];
  return period ? { period, consumed: 1 } : null;
}

function bareDigits(g: GroupItem): string {
  const core = g.last.suffixType === "ordinal" ? `${g.value}.` : String(g.value);
  return withSuffix(core, g.last.suffixType === "case" ? g.last.suffix : "") + g.trailing;
}

/**
 * Digit view of spoken Turkish dates and clock times for the deterministic
 * slot parsers. Returns `text` itself when nothing was rewritten.
 */
export function normalizeTurkishSpokenTemporal(text: string): string {
  const source = String(text ?? "");
  if (!source.trim()) return text;
  const items = buildItems(source);
  if (!items.some((i) => i.type === "group")) return text;

  // Whole message is a number or a clock: the digit form a typed reply would have.
  if (items.length === 1 && items[0].type === "group") {
    return items[0].value <= 31 ? bareDigits(items[0]) : text;
  }
  const whole = parseSpokenTime(items, 0);
  if (whole && whole.explicitMinutes && whole.consumed === items.length && whole.m !== null && (whole.byMarker || whole.m >= 10)) {
    return withSuffix(clock(whole.h, whole.m), whole.suffix) + whole.trailing;
  }

  const out: string[] = [];
  let changed = false;
  let afterDate = false;
  let i = 0;

  while (i < items.length) {
    const item = items[i];

    if (item.type === "group") {
      // "<gün> <ay> [yıl]" — day immediately before a month head.
      const month = items[i + 1];
      const head = month?.type === "word" ? monthHead(month.folded) : null;
      if (
        head &&
        item.value >= 1 &&
        item.value <= 31 &&
        (item.last.suffixType === "none" || item.last.suffixType === "ordinal") &&
        !item.trailing
      ) {
        let piece = `${item.value} ${head.name}`;
        let consumed = 2;
        let trailing = (month as WordItem).trailing;
        const yearItem = items[i + 2];
        if (head.bare && !trailing && yearItem?.type === "group" && yearItem.value >= 1900 && yearItem.value <= 2100) {
          piece += ` ${yearItem.value}`;
          consumed = 3;
          trailing = yearItem.trailing;
        }
        out.push(piece + trailing);
        i += consumed;
        changed = true;
        afterDate = true;
        continue;
      }

      // Unanchored clock with a minute marker ("üç buçuk", "üçü çeyrek geçe"),
      // or a two-number clock right after a date ("yarın on dört otuz").
      const prev = items[i - 1];
      const percent = prev?.type === "word" && prev.folded === "yuzde";
      const t = percent ? null : parseSpokenTime(items, i);
      if (t && t.explicitMinutes && t.m !== null && !quantityFollows(items, i + t.consumed)) {
        if (t.byMarker || (afterDate && t.m >= 10)) {
          out.push(withSuffix(clock(t.h, t.m), t.suffix) + t.trailing);
          i += t.consumed;
          changed = true;
          continue;
        }
      }

      out.push(item.raw);
      afterDate = false;
      i += 1;
      continue;
    }

    const next = items[i + 1];

    // "ekimin on ikisi" / "ekimin on ikisinde"
    const genitive = monthGenitive(item.folded);
    if (
      genitive &&
      !item.trailing &&
      next?.type === "group" &&
      next.value >= 1 &&
      next.value <= 31 &&
      (next.last.suffixType === "possessive" || next.last.suffixType === "none")
    ) {
      out.push(`${next.value} ${genitive}${next.trailing}`);
      i += 2;
      changed = true;
      afterDate = true;
      continue;
    }

    // "ekim on iki" — same shape as typed "ekim 12".
    const head = monthHead(item.folded);
    if (
      head?.bare &&
      !item.trailing &&
      next?.type === "group" &&
      next.value >= 1 &&
      next.value <= 31 &&
      next.last.suffixType === "none" &&
      !quantityFollows(items, i + 2)
    ) {
      out.push(`${head.name} ${next.value}${next.trailing}`);
      i += 2;
      changed = true;
      afterDate = true;
      continue;
    }

    // Day period [+ "saat"] + clock → explicit 24h clock ("akşam yedi" → 19:00).
    const period = parsePeriod(items, i);
    if (period) {
      let j = i + period.consumed;
      if (isWord(items[j], "saat")) j += 1;
      const t = parseSpokenTime(items, j);
      if (t && !quantityFollows(items, j + t.consumed)) {
        out.push(withSuffix(`saat ${paddedClock(applyPeriod(period.period, t.h), t.m)}`, t.suffix) + t.trailing);
        i = j + t.consumed;
        changed = true;
        continue;
      }
    }

    // "saat <clock>"; "saat X'ten Y'ye" keeps only the requested target.
    if (item.folded === "saat" && !item.trailing) {
      const t = parseSpokenTime(items, i + 1);
      if (t) {
        const afterIdx = i + 1 + t.consumed;
        const target = t.caseKind === "abl" ? parseSpokenTime(items, afterIdx) : null;
        if (target && target.caseKind === "dat") {
          out.push(withSuffix(`saat ${clock(target.h, target.m)}`, target.suffix) + target.trailing);
          i = afterIdx + target.consumed;
        } else {
          out.push(withSuffix(`saat ${clock(t.h, t.m)}`, t.suffix) + t.trailing);
          i = afterIdx;
        }
        changed = true;
        continue;
      }
    }

    if (DATE_CONTEXT_WORDS.has(item.folded)) afterDate = true;
    out.push(item.raw);
    i += 1;
  }

  return changed ? out.join(" ") : text;
}

/**
 * Digits of a spoken Turkish phone number ("sıfır beş yüz otuz iki ...",
 * "artı doksan beş yüz otuz iki ..."): the longest contiguous spoken run,
 * or null. Callers must validate the result; nothing is completed or guessed.
 */
export function spokenTurkishPhoneDigits(text: string): string | null {
  const items = buildItems(String(text ?? ""));
  let best = "";
  let bestLen = 0;
  let i = 0;
  while (i < items.length) {
    const plus = isWord(items[i], "arti");
    let j = plus ? i + 1 : i;
    let digits = "";
    while (j < items.length) {
      const g = items[j];
      if (g.type !== "group" || g.last.suffixType === "ordinal" || g.value >= 1000) break;
      digits += String(g.value);
      j += 1;
      if (g.last.suffixType !== "none") break;
    }
    if (digits.length > bestLen) {
      best = plus ? `+${digits}` : digits;
      bestLen = digits.length;
    }
    i = Math.max(j, i + 1);
  }
  return bestLen >= 7 ? best : null;
}
