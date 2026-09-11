/**
 * Authoritative conversation-language policy for ClinicBridge agents.
 *
 * All user-facing deterministic replies and locale resolution for LLM turns
 * must go through this module so short / language-neutral messages cannot
 * silently reset an established conversation language to English.
 */

export type LanguageConfidence = "high" | "medium" | "low" | "none";

export type LanguageSource =
  | "explicit_switch"
  | "intentional_switch"
  | "persisted"
  | "message_detected"
  | "history_detected"
  | "request_language"
  | "clinic_default"
  | "product_fallback";

export interface LocaleResolutionParams {
  requestLanguage?: string | null;
  persistedLocale?: string | null;
  currentMessage?: string | null;
  history?: Array<{ role: "user" | "assistant" | "system" | string; content: string }> | null;
  clinicDefaultLocale?: string | null;
}

export interface LocaleResolutionResult {
  locale: string;
  reason: string;
  confidence: LanguageConfidence;
  source: LanguageSource;
  detectedFromMessage: string | null;
  messageAmbiguous: boolean;
  switchAccepted: boolean;
  switchRejected: boolean;
}

export interface TextLanguageDetection {
  locale: string | null;
  confidence: LanguageConfidence;
  ambiguous: boolean;
  source: "script" | "lexicon" | "none";
}

const SUPPORTED_LOCALES = new Set(["en", "tr", "de", "fr", "ar", "ru", "es", "it"]);

/** Brands / channels that are language-neutral even when Latin-script. */
const LANGUAGE_NEUTRAL_TOKENS = new Set([
  "whatsapp",
  "telegram",
  "instagram",
  "facebook",
  "email",
  "e-mail",
  "sms",
  "ok",
  "okay",
  "id",
  "ida",
  "clinicbridge",
]);

const YES_NO_RE =
  /^(да|нет|evet|hayır|hayir|yes|no|ja|nein|oui|non|sí|si|ok|okay|yep|nope|👍|👎|✅|❌)\.?$/i;

export function normalizeLocaleCode(value?: string | null): string | null {
  if (!value || typeof value !== "string") return null;
  const clean = value.trim().toLowerCase().slice(0, 2);
  return SUPPORTED_LOCALES.has(clean) ? clean : null;
}

export function wordCount(text?: string | null): number {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * Detect an explicit user request to switch conversation language.
 */
export function detectExplicitLanguageSwitch(raw?: string | null): string | null {
  const currentMsg = String(raw || "").trim().toLowerCase();
  if (!currentMsg) return null;

  if (
    /(?:can\s+we\s+continue\s+in\s+english|speak\s+in\s+english|switch\s+to\s+english|english\s+please|let'?s\s+speak\s+in\s+english|can\s+we\s+(?:speak|talk)\s+(?:in\s+)?english|in\s+english\s+please|answer\s+in\s+english|please\s+answer\s+in\s+english)/i.test(
      currentMsg
    ) ||
    currentMsg.includes("speak in english") ||
    currentMsg.includes("english please") ||
    currentMsg.includes("switch to english") ||
    /\bin\s+english\b/i.test(currentMsg)
  ) {
    return "en";
  }
  if (
    currentMsg.includes("türkçe konuşalım") ||
    currentMsg.includes("türkçe lütfen") ||
    currentMsg.includes("türkçe devam edelim") ||
    currentMsg.includes("turkce devam edelim") ||
    (currentMsg.includes("türkçe") && (currentMsg.includes("geç") || currentMsg.includes("konuş"))) ||
    (currentMsg.includes("turkce") && (currentMsg.includes("gec") || currentMsg.includes("konus")))
  ) {
    return "tr";
  }
  if (currentMsg.includes("auf deutsch") || currentMsg.includes("deutsch bitte")) {
    return "de";
  }
  if (currentMsg.includes("en français") || currentMsg.includes("français s'il vous plaît")) {
    return "fr";
  }
  if (
    currentMsg.includes("باللغة العربية") ||
    currentMsg.includes("تكلم بالعربية") ||
    currentMsg.includes("بالعربية")
  ) {
    return "ar";
  }
  if (
    /(?:давайте\s+на\s+русском|говорите\s+по-русски|на\s+русском\s+пожалуйста|перейдём\s+на\s+русский)/i.test(
      currentMsg
    )
  ) {
    return "ru";
  }
  return null;
}

/**
 * Messages that should inherit the active conversation language rather than
 * re-detect (or fall back to English / widget language).
 */
export function isLanguageAmbiguousMessage(text?: string | null): boolean {
  const raw = String(text || "").trim();
  if (!raw) return true;

  // Pure numbers / phone / date-like tokens
  if (/^[\d\s+\-()./:]+$/.test(raw)) return true;
  if (/^\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?$/.test(raw)) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return true;

  // Yes/no / emoji-only acknowledgements across languages
  if (YES_NO_RE.test(raw)) return true;

  const tokens = raw
    .toLowerCase()
    .replace(/[?!.,;:]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) return true;

  const contentTokens = tokens.filter((t) => !LANGUAGE_NEUTRAL_TOKENS.has(t));
  if (contentTokens.length === 0) return true;

  // Short brand + punctuation ("WhatsApp?", "Есть WhatsApp?") handled via script/lexicon below;
  // treat as ambiguous only when remaining tokens are also language-neutral.
  if (tokens.length <= 2 && contentTokens.every((t) => LANGUAGE_NEUTRAL_TOKENS.has(t))) {
    return true;
  }

  return false;
}

/**
 * Lightweight heuristic text language detector with confidence metadata.
 */
export function detectTextLanguageWithMeta(text: string): TextLanguageDetection {
  if (!text || typeof text !== "string") {
    return { locale: null, confidence: "none", ambiguous: true, source: "none" };
  }
  const raw = text.trim();
  if (raw.length < 1) {
    return { locale: null, confidence: "none", ambiguous: true, source: "none" };
  }

  const ambiguous = isLanguageAmbiguousMessage(raw);
  const t = raw.toLowerCase();

  // Script-based detection is high confidence even for short messages.
  if (/[\u0600-\u06FF]/.test(raw)) {
    return { locale: "ar", confidence: "high", ambiguous: false, source: "script" };
  }
  if (/[\u0400-\u04FF]/.test(raw)) {
    return { locale: "ru", confidence: "high", ambiguous: false, source: "script" };
  }

  if (ambiguous) {
    return { locale: null, confidence: "none", ambiguous: true, source: "none" };
  }

  const enPatterns = [
    /\b(i want|i would like|i need|can i|appointment|book|schedule|consultation|implant|doctor|dentist|teeth|tooth|filling|whitening|crown|checkup|tomorrow|today|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|evening|please|thank you|thanks|hello|hi|good morning|my name is|my phone is|my email is)\b/i,
    /\b(cost|price|how much|location|where are you|contact|whatsapp)\b/i,
  ];
  // Note: bare yes/no intentionally excluded from EN scoring — they are ambiguous.

  const trPatterns = [
    /\b(merhaba|selam|randevu|almak istiyorum|muayene|doktor|diş|dolgu|beyazlatma|kaplama|implant|zirkonyum|kanal|tedavi|yarın|bugün|pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar|sabah|öğleden sonra|akşam|saat|lütfen|teşekkürler|teşekkür ederim|adım|telefonum|eposta|fiyat|ne kadar|ücret|neredesiniz|var mı|var mi)\b/i,
    /[çğıöşü]/i,
  ];

  const dePatterns = [
    /\b(ich möchte|termin|vereinbaren|untersuchung|zahnarzt|zahn|füllung|bleaching|krone|morgen|heute|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|vormittag|nachmittag|bitte|danke|hallo|guten tag|mein name ist|meine telefonnummer|kosten|wie viel)\b/i,
    /[äöüß]/i,
  ];

  const frPatterns = [
    /\b(bonjour|rendez-vous|je voudrais|combien|merci|s'il vous plaît|docteur|dentiste)\b/i,
  ];

  const ruPatterns = [
    /\b(здравствуйте|привет|запись|прием|приём|доктор|цена|сколько|пожалуйста|спасибо|можно|хочу|есть)\b/i,
  ];

  let enScore = 0;
  let trScore = 0;
  let deScore = 0;
  let frScore = 0;
  let ruScore = 0;

  for (const p of enPatterns) {
    const matches = t.match(new RegExp(p.source, "gi"));
    if (matches) enScore += matches.length;
  }
  for (const p of trPatterns) {
    const matches = t.match(new RegExp(p.source, "gi"));
    if (matches) trScore += matches.length;
  }
  for (const p of dePatterns) {
    const matches = t.match(new RegExp(p.source, "gi"));
    if (matches) deScore += matches.length;
  }
  for (const p of frPatterns) {
    const matches = t.match(new RegExp(p.source, "gi"));
    if (matches) frScore += matches.length;
  }
  for (const p of ruPatterns) {
    const matches = t.match(new RegExp(p.source, "gi"));
    if (matches) ruScore += matches.length;
  }

  const scores: Array<{ locale: string; score: number }> = [
    { locale: "tr", score: trScore },
    { locale: "en", score: enScore },
    { locale: "de", score: deScore },
    { locale: "fr", score: frScore },
    { locale: "ru", score: ruScore },
  ].sort((a, b) => b.score - a.score);

  const best = scores[0];
  const second = scores[1];
  if (!best || best.score < 1) {
    return { locale: null, confidence: "none", ambiguous: true, source: "none" };
  }

  const confidence: LanguageConfidence =
    best.score >= 2 || (best.score === 1 && wordCount(raw) >= 4)
      ? "high"
      : best.score === 1 && (!second || second.score === 0)
        ? "medium"
        : "low";

  return {
    locale: best.locale,
    confidence,
    ambiguous: confidence === "low",
    source: "lexicon",
  };
}

/**
 * Lightweight heuristic text language detector (locale code or null).
 */
export function detectTextLanguage(text: string): string | null {
  return detectTextLanguageWithMeta(text).locale;
}

function detectFromHistory(
  history?: LocaleResolutionParams["history"]
): string | null {
  if (!history || !Array.isArray(history) || history.length === 0) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    const item = history[i];
    if (item && item.role === "user" && item.content) {
      const detected = detectTextLanguageWithMeta(item.content);
      if (detected.locale && detected.confidence !== "low" && !detected.ambiguous) {
        return detected.locale;
      }
    }
  }
  return null;
}

/**
 * Resolves the conversation locale with an inspectable reason and metadata.
 *
 * Priority:
 * 1. Explicit language-switch command in the current message
 * 2. Strong intentional language switch (high-confidence, non-ambiguous)
 * 3. Persisted conversation active language
 * 4. Confident detection from the current message
 * 5. Prior reliable language from conversation history
 * 6. Soft widget / browser requestLanguage
 * 7. Clinic / tenant default
 * 8. Product fallback ("tr")
 *
 * A low-confidence or ambiguous short message NEVER overrides persisted language
 * and NEVER selects English merely because the widget browser language is "en".
 */
export function resolveConversationLocaleWithMeta(
  params: LocaleResolutionParams
): LocaleResolutionResult {
  const detection = detectTextLanguageWithMeta(params.currentMessage || "");
  const requestLang = normalizeLocaleCode(params.requestLanguage);
  const persistedLang = normalizeLocaleCode(params.persistedLocale);
  const clinicLang = normalizeLocaleCode(params.clinicDefaultLocale);
  const historyLang = detectFromHistory(params.history);
  const words = wordCount(params.currentMessage);

  const base = (
    locale: string,
    reason: string,
    source: LanguageSource,
    confidence: LanguageConfidence,
    extras?: Partial<Pick<LocaleResolutionResult, "switchAccepted" | "switchRejected">>
  ): LocaleResolutionResult => ({
    locale,
    reason,
    confidence,
    source,
    detectedFromMessage: detection.locale,
    messageAmbiguous: detection.ambiguous || isLanguageAmbiguousMessage(params.currentMessage),
    switchAccepted: extras?.switchAccepted ?? false,
    switchRejected: extras?.switchRejected ?? false,
  });

  // 1. Explicit command
  const explicit = detectExplicitLanguageSwitch(params.currentMessage);
  if (explicit) {
    return base(explicit, `explicit_switch_command:${explicit}`, "explicit_switch", "high", {
      switchAccepted: Boolean(persistedLang && persistedLang !== explicit),
    });
  }

  // 2. Strong intentional switch away from persisted language
  if (
    persistedLang &&
    detection.locale &&
    detection.locale !== persistedLang &&
    detection.confidence === "high" &&
    !detection.ambiguous &&
    (detection.source === "script" || words >= 3)
  ) {
    return base(
      detection.locale,
      `intentional_switch:${persistedLang}->${detection.locale}`,
      "intentional_switch",
      "high",
      { switchAccepted: true }
    );
  }

  // Reject weak "switches" (e.g. WhatsApp? while conversation is Russian)
  if (
    persistedLang &&
    detection.locale &&
    detection.locale !== persistedLang &&
    (detection.ambiguous || detection.confidence === "low" || words < 3)
  ) {
    return base(persistedLang, `switch_rejected_keep_persisted:${persistedLang}`, "persisted", "high", {
      switchRejected: true,
    });
  }

  // 3. Persisted active language
  if (persistedLang) {
    return base(persistedLang, `persisted:${persistedLang}`, "persisted", "high");
  }

  // 4. Confident current-message detection (establishes language on first turns)
  if (detection.locale && !detection.ambiguous && detection.confidence !== "low") {
    return base(
      detection.locale,
      `message_detected:${detection.locale}`,
      "message_detected",
      detection.confidence
    );
  }

  // Even a medium script/lexicon hit with ≥2 words may establish language when nothing is persisted.
  if (detection.locale && words >= 2 && detection.confidence !== "none") {
    return base(
      detection.locale,
      `message_detected:${detection.locale}`,
      "message_detected",
      detection.confidence
    );
  }

  // 5. History
  if (historyLang) {
    return base(historyLang, `history_detected:${historyLang}`, "history_detected", "medium");
  }

  // 6. Soft widget / browser preference
  if (requestLang) {
    return base(requestLang, `request_language:${requestLang}`, "request_language", "low");
  }

  // 7. Clinic default
  if (clinicLang) {
    return base(clinicLang, `clinic_default:${clinicLang}`, "clinic_default", "low");
  }

  // 8. Product fallback — Turkish is the historical ClinicBridge default.
  // English is intentionally NOT the silent product fallback.
  return base("tr", "fallback:tr", "product_fallback", "none");
}

export function resolveConversationLocale(params: LocaleResolutionParams): string {
  return resolveConversationLocaleWithMeta(params).locale;
}

/**
 * Observability payload for server logs (never shown to patients).
 */
export function languageResolutionLogFields(result: LocaleResolutionResult): Record<string, unknown> {
  return {
    resolvedLocale: result.locale,
    localeReason: result.reason,
    languageConfidence: result.confidence,
    languageSource: result.source,
    detectedFromMessage: result.detectedFromMessage,
    messageAmbiguous: result.messageAmbiguous,
    languageSwitchAccepted: result.switchAccepted,
    languageSwitchRejected: result.switchRejected,
  };
}
