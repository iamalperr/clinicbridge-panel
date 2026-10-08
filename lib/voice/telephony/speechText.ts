/**
 * Speech-safe presentation of a visible Agent Core reply (Phase 3, pure).
 *
 * Removes chat formatting that sounds wrong when spoken (markdown, HTML tags, URLs,
 * decorative emoji, list markers) and turns line breaks into sentence boundaries.
 * It never rewrites words, numbers, dates, times, prices, phone numbers or emails.
 */

export interface SpeechTextOptions {
  /** Spoken replacement for bare URLs. */
  urlPlaceholder?: string;
}

const DEFAULT_URL_PLACEHOLDER = "bağlantı";

/** Marks a line that was a list item so consecutive items join with commas. */
const LIST_ITEM_MARK = "\u0001";

const EMOJI_SEQ =
  "(?:[\\p{Extended_Pictographic}\\u{1F1E6}-\\u{1F1FF}](?:[\\u{FE0F}\\u{20E3}\\u{1F3FB}-\\u{1F3FF}]|\\u{200D}\\p{Extended_Pictographic})*)";
const EMOJI_BEFORE_SENTENCE = new RegExp(`([\\p{L}\\p{N}\\p{M})\\]"'»”])[ \\t]*(?:${EMOJI_SEQ}[ \\t]*)+[ \\t](?=\\p{Lu})`, "gu");
const EMOJI_ANY = new RegExp(`${EMOJI_SEQ}|[\\u{FE0F}\\u{20E3}\\u{200D}]`, "gu");

const HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

const TERMINAL_PUNCTUATION = /[.!?…:;,]$/;

function replaceUrl(match: string, placeholder: string): string {
  const trailing = match.match(/[.,;:!?)\]]+$/)?.[0] ?? "";
  return placeholder + trailing;
}

function stripHtml(text: string): string {
  return text
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*li\b[^<>]*>/gi, `\n${LIST_ITEM_MARK}`)
    .replace(/<\s*\/\s*(?:p|div|li|ul|ol|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?\/?>/g, "")
    .replace(/&(?:nbsp|amp|lt|gt|quot|apos|#39);/g, (e) => HTML_ENTITIES[e] ?? e);
}

function stripMarkdownInline(text: string): string {
  return text
    .replace(/```[a-zA-Z0-9_-]*\n?/g, "")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)\s]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1")
    .replace(/~~(?=\S)([^~\n]*?\S)~~/g, "$1")
    .replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, "$1")
    .replace(/(?<![\p{L}\p{N}_])__(?=\S)([^\n]*?\S)__(?![\p{L}\p{N}_])/gu, "$1")
    .replace(/(?<![\p{L}\p{N}*])\*(?=\S)([^*\n]*?\S)\*(?![\p{L}\p{N}*])/gu, "$1")
    .replace(/(?<![\p{L}\p{N}_])_(?=\S)([^_\n]*?\S)_(?![\p{L}\p{N}_])/gu, "$1")
    .replace(/\*+/g, "");
}

function stripLineSyntax(line: string): string {
  if (/^\s*(?:[-*_]\s*){3,}$/.test(line)) return "";
  let out = line.replace(/^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/, "$1");
  out = out.replace(/^\s*>\s?/, "");
  const listItem = out.match(/^\s*(?:[-*+•▪◦‣–]|\d{1,3}[.)])\s+(.*)$/);
  if (listItem) out = LIST_ITEM_MARK + listItem[1];
  return out;
}

function joinLines(lines: string[]): string {
  let out = "";
  for (let i = 0; i < lines.length; i++) {
    const isItem = lines[i].startsWith(LIST_ITEM_MARK);
    const line = lines[i].replace(LIST_ITEM_MARK, "").trim();
    out += line;
    if (i === lines.length - 1) break;
    const nextIsItem = lines[i + 1].startsWith(LIST_ITEM_MARK);
    if (!TERMINAL_PUNCTUATION.test(line)) out += isItem && nextIsItem ? "," : ".";
    out += " ";
  }
  return out;
}

export function toSpeechText(input: string, options: SpeechTextOptions = {}): string {
  if (typeof input !== "string" || !input) return "";
  const placeholder = options.urlPlaceholder ?? DEFAULT_URL_PLACEHOLDER;

  let text = input.replace(/\r\n?/g, "\n").replace(/[\u200B\u200C\u2060\uFEFF]/g, "");
  text = text.replace(/<(https?:\/\/[^>\s]+)>/gi, placeholder);
  text = stripHtml(text);

  const lines = text
    .split("\n")
    .map(stripLineSyntax)
    .map((line) =>
      stripMarkdownInline(line)
        .replace(/\bhttps?:\/\/[^\s<>"]+/gi, (m) => replaceUrl(m, placeholder))
        .replace(/(?<![@\p{L}\p{N}.])www\.[^\s<>"]+/giu, (m) => replaceUrl(m, placeholder))
        .replace(EMOJI_BEFORE_SENTENCE, "$1. ")
        .replace(EMOJI_ANY, " ")
        .replace(/[ \t\u00A0]+/g, " ")
    )
    .filter((l) => l.replace(LIST_ITEM_MARK, "").trim().length > 0);

  return joinLines(lines)
    .replace(/ +([,.!?;:])(?=\s|$)/g, "$1")
    .replace(/ {2,}/g, " ")
    .trim();
}
