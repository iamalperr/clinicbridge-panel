/**
 * Product-supported voice languages (product-global, shared by future admin UI and runtime).
 *
 * Describes languages only. Provider-specific STT/TTS model choices do not belong here; the
 * worker's speech stack decides how (and whether) a locale can actually be served.
 *
 * Status:
 *   AVAILABLE  live in production voice today (Turkish only)
 *   PREVIEW    configurable in the control plane; not yet served by the voice runtime
 *   RETIRED    kept for reading old configuration; rejected for new configuration
 */

export const VOICE_LOCALES = ["tr-TR", "en-US", "en-GB", "de-DE", "ar-SA", "ru-RU", "fr-FR"] as const;

export type VoiceLocale = (typeof VOICE_LOCALES)[number];

export type VoiceLanguageStatus = "AVAILABLE" | "PREVIEW" | "RETIRED";

export interface VoiceLanguageDefinition {
  readonly locale: VoiceLocale;
  readonly displayName: string;
  readonly nativeName: string;
  readonly rtl: boolean;
  readonly status: VoiceLanguageStatus;
}

export const VOICE_LANGUAGE_REGISTRY: Readonly<Record<VoiceLocale, VoiceLanguageDefinition>> = Object.freeze({
  "tr-TR": Object.freeze({ locale: "tr-TR", displayName: "Turkish", nativeName: "Türkçe", rtl: false, status: "AVAILABLE" }),
  "en-US": Object.freeze({ locale: "en-US", displayName: "English (US)", nativeName: "English", rtl: false, status: "PREVIEW" }),
  "en-GB": Object.freeze({ locale: "en-GB", displayName: "English (UK)", nativeName: "English", rtl: false, status: "PREVIEW" }),
  "de-DE": Object.freeze({ locale: "de-DE", displayName: "German", nativeName: "Deutsch", rtl: false, status: "PREVIEW" }),
  "ar-SA": Object.freeze({ locale: "ar-SA", displayName: "Arabic", nativeName: "العربية", rtl: true, status: "PREVIEW" }),
  "ru-RU": Object.freeze({ locale: "ru-RU", displayName: "Russian", nativeName: "Русский", rtl: false, status: "PREVIEW" }),
  "fr-FR": Object.freeze({ locale: "fr-FR", displayName: "French", nativeName: "Français", rtl: false, status: "PREVIEW" }),
} satisfies Record<VoiceLocale, VoiceLanguageDefinition>);

/** The production voice language and the safe default for every unconfigured clinic. */
export const SYSTEM_DEFAULT_VOICE_LOCALE: VoiceLocale = "tr-TR";

export function isVoiceLocale(value: unknown): value is VoiceLocale {
  return typeof value === "string" && (VOICE_LOCALES as readonly string[]).includes(value);
}

/** Configurable = known and not retired. Exact canonical spelling only (no case or "_" repair). */
export function isConfigurableVoiceLocale(value: unknown): value is VoiceLocale {
  return isVoiceLocale(value) && VOICE_LANGUAGE_REGISTRY[value].status !== "RETIRED";
}

/** Bare language codes that unambiguously denote one registry locale (legacy mapping data only). */
const LEGACY_LANGUAGE_ONLY: Readonly<Record<string, VoiceLocale>> = Object.freeze({
  tr: "tr-TR",
  de: "de-DE",
  ar: "ar-SA",
  ru: "ru-RU",
  fr: "fr-FR",
});

/**
 * Lenient reading of legacy `voiceNumbers/{DID}.defaultLocale` ("tr", "tr-TR", "tr_tr").
 * Returns null for anything that does not map to exactly one registry locale. Never used to
 * accept admin input, which must already be canonical.
 */
export function canonicalizeLegacyLocale(raw: unknown): VoiceLocale | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace("_", "-");
  const match = trimmed.match(/^([A-Za-z]{2})(?:-([A-Za-z]{2}))?$/);
  if (!match) return null;
  const language = match[1].toLowerCase();
  if (!match[2]) return LEGACY_LANGUAGE_ONLY[language] ?? null;
  const candidate = `${language}-${match[2].toUpperCase()}`;
  return isVoiceLocale(candidate) ? candidate : null;
}
