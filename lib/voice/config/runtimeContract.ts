/**
 * Runtime-facing voice configuration contract (Phase 4B).
 *
 * The voice runtime depends only on RuntimeVoiceConfig: never on stored VoiceSettings
 * documents, audit metadata, updatedBy, consent or sample storage refs, DID profile labels,
 * validation field paths or credentials. Built by explicit field copy, never by spreading.
 */

import type { VoiceLocale } from "./languageRegistry";
import type {
  ProviderVoiceRef,
  ResolvedVoiceConfiguration,
  VoiceConfigIssueCode,
  VoiceConfigSource,
  VoiceLanguageMode,
  VoiceProfileType,
  VoiceProvider,
} from "./types";

export interface RuntimeVoiceLanguage {
  readonly locale: VoiceLocale;
  readonly rtl: boolean;
  readonly voiceProfileId: string;
  readonly voiceType: VoiceProfileType;
  readonly provider: VoiceProvider;
  /** Provider reference for a future TTS switch. Never logged or returned by public APIs. */
  readonly providerVoice: ProviderVoiceRef;
  /** Never logged. */
  readonly greeting: string | null;
}

export interface RuntimeVoiceConfig {
  readonly clinicId: string;
  readonly didE164: string | null;
  readonly source: VoiceConfigSource;
  readonly version: number;
  readonly enabled: boolean;
  readonly languageMode: VoiceLanguageMode;
  readonly defaultLanguage: VoiceLocale;
  readonly fallbackLanguage: VoiceLocale;
  readonly supportedLanguages: readonly VoiceLocale[];
  readonly allowLanguageSwitch: boolean;
  readonly languages: Readonly<Partial<Record<VoiceLocale, RuntimeVoiceLanguage>>>;
  /** Key of the applied DID profile, null when none applied. */
  readonly didProfileKey: string | null;
  readonly issues: readonly VoiceConfigIssueCode[];
}

function copyProviderVoice(ref: ProviderVoiceRef): ProviderVoiceRef {
  return ref.kind === "PROVIDER_VOICE_ID"
    ? Object.freeze({ kind: ref.kind, providerVoiceId: ref.providerVoiceId })
    : Object.freeze({ kind: ref.kind });
}

export function toRuntimeVoiceConfig(resolved: ResolvedVoiceConfiguration): RuntimeVoiceConfig {
  const languages: Partial<Record<VoiceLocale, RuntimeVoiceLanguage>> = {};
  for (const locale of resolved.supportedLanguages) {
    const profile = resolved.languageProfiles[locale];
    if (!profile) continue;
    languages[locale] = Object.freeze({
      locale: profile.locale,
      rtl: profile.rtl,
      voiceProfileId: profile.voiceProfileId,
      voiceType: profile.voiceType,
      provider: profile.provider,
      providerVoice: copyProviderVoice(profile.providerVoice),
      greeting: profile.greeting,
    });
  }
  return Object.freeze({
    clinicId: resolved.clinicId,
    didE164: resolved.didE164,
    source: resolved.source,
    version: resolved.version,
    enabled: resolved.enabled,
    languageMode: resolved.languageMode,
    defaultLanguage: resolved.defaultLanguage,
    fallbackLanguage: resolved.fallbackLanguage,
    supportedLanguages: Object.freeze([...resolved.supportedLanguages]),
    allowLanguageSwitch: resolved.allowLanguageSwitch,
    languages: Object.freeze(languages),
    didProfileKey: resolved.resolvedDidProfile?.key ?? null,
    issues: Object.freeze([...resolved.issues]),
  });
}
