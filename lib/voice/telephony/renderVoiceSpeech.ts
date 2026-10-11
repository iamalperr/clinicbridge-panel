/**
 * Canonical Voice Presentation Layer (output-only).
 *
 *   Agent Core canonical reply → renderVoiceSpeech → TTS
 *
 * Never writes back into conversation history, Agent Core state, appointment drafts, RAG or
 * training data. Deterministic: no LLM, no retrieval, no network.
 *
 * Locale routing: tr / tr-TR / unlabelled → Turkish rules. Other locales keep markdown-stripped
 * text without language-specific rewriting (future en-US / de-DE / ar-SA slots).
 *
 * URL policy: bare URLs become the spoken placeholder "bağlantı" (or `urlPlaceholder`). This does
 * not claim a link was sent. Leftover URLs after markdown stripping are replaced the same way in
 * Turkish so Cartesia never reads slashes as words.
 */

import { toSpeechText } from "./speechText";
import {
  isTurkishVoiceLocale,
  renderTurkishSpeechWithMeta,
  type TurkishSpeechApplied,
} from "./turkishSpeechRenderer";

export const URL_SPEECH_PLACEHOLDER = "bağlantı";

export interface RenderVoiceSpeechInput {
  readonly text: string;
  readonly locale?: string;
}

export interface VoiceSpeechTelemetry {
  readonly locale: string;
  readonly canonicalLength: number;
  readonly spokenLength: number;
  readonly hasMarkdownTransformation: boolean;
  readonly hasDateTransformation: boolean;
  readonly hasTimeTransformation: boolean;
  readonly hasPhoneTransformation: boolean;
  readonly hasEmailTransformation: boolean;
  readonly hasLabelColonTransformation: boolean;
  readonly rendererStatus: "OK" | "PASSTHROUGH";
}

export interface VoiceSpeechPresentation {
  readonly spokenText: string;
  readonly telemetry: VoiceSpeechTelemetry;
}

const LEFTOVER_URL = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;

function replaceLeftoverUrls(text: string, placeholder: string): string {
  return text.replace(LEFTOVER_URL, () => placeholder);
}

function telemetryFromApplied(
  locale: string,
  canonicalLength: number,
  spokenLength: number,
  markdown: boolean,
  applied: TurkishSpeechApplied | null,
  passthrough: boolean
): VoiceSpeechTelemetry {
  return {
    locale,
    canonicalLength,
    spokenLength,
    hasMarkdownTransformation: markdown,
    hasDateTransformation: Boolean(applied?.date || applied?.namedDate),
    hasTimeTransformation: Boolean(applied?.time),
    hasPhoneTransformation: Boolean(applied?.phone),
    hasEmailTransformation: Boolean(applied?.email),
    hasLabelColonTransformation: Boolean(applied?.labelColon),
    rendererStatus: passthrough ? "PASSTHROUGH" : "OK",
  };
}

/** PII-safe log fields. Never includes canonicalText, spokenText, names, numbers or secrets. */
export function voiceSpeechPresentationLogFields(telemetry: VoiceSpeechTelemetry): Record<string, string | number | boolean> {
  return {
    locale: telemetry.locale,
    canonicalLength: telemetry.canonicalLength,
    spokenLength: telemetry.spokenLength,
    hasMarkdownTransformation: telemetry.hasMarkdownTransformation,
    hasDateTransformation: telemetry.hasDateTransformation,
    hasTimeTransformation: telemetry.hasTimeTransformation,
    hasPhoneTransformation: telemetry.hasPhoneTransformation,
    hasEmailTransformation: telemetry.hasEmailTransformation,
    hasLabelColonTransformation: telemetry.hasLabelColonTransformation,
    rendererStatus: telemetry.rendererStatus,
  };
}

export function renderVoiceSpeech(input: RenderVoiceSpeechInput): VoiceSpeechPresentation {
  const canonical = typeof input?.text === "string" ? input.text : "";
  const locale = typeof input?.locale === "string" ? input.locale : "";
  const markdownSafe = toSpeechText(canonical);
  const hasMarkdown = markdownSafe !== canonical.trim();

  if (!isTurkishVoiceLocale(locale || undefined)) {
    const spokenText = markdownSafe;
    return {
      spokenText,
      telemetry: telemetryFromApplied(locale || "und", canonical.length, spokenText.length, hasMarkdown, null, true),
    };
  }

  const withoutUrls = replaceLeftoverUrls(markdownSafe, URL_SPEECH_PLACEHOLDER);
  const turkish = renderTurkishSpeechWithMeta(withoutUrls);
  return {
    spokenText: turkish.spokenText,
    telemetry: telemetryFromApplied(locale || "tr", canonical.length, turkish.spokenText.length, hasMarkdown, turkish.applied, false),
  };
}
