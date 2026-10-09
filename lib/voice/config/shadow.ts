/**
 * Phase 4B shadow validation: compares the resolved voice configuration with what the
 * production speech runtime actually does today, without letting it control anything.
 *
 * The comparison output is closed-set codes only. Log fields never include the called or
 * caller number, transcripts, greeting text, DID profile labels, provider voice ids,
 * consent/storage refs or validation field paths.
 */

import type { VoiceLocale } from "./languageRegistry";
import type { ResolveVoiceConfigurationResult } from "./resolveVoiceConfiguration";
import { toRuntimeVoiceConfig, type RuntimeVoiceConfig } from "./runtimeContract";
import type { ProviderVoiceRef, VoiceConfigErrorCode, VoiceLanguageMode } from "./types";

/** The production speech stack (workers/voice/src/call/speechStack.ts) ignores configuration. */
export const CURRENT_RUNTIME_VOICE_BEHAVIOR: Readonly<{
  enabled: true;
  languageMode: VoiceLanguageMode;
  defaultLanguage: VoiceLocale;
  fallbackLanguage: VoiceLocale;
  supportedLanguages: readonly VoiceLocale[];
  allowLanguageSwitch: boolean;
  voiceReference: ProviderVoiceRef["kind"];
}> = Object.freeze({
  enabled: true,
  languageMode: "FIXED",
  defaultLanguage: "tr-TR",
  fallbackLanguage: "tr-TR",
  supportedLanguages: Object.freeze(["tr-TR"] as const),
  allowLanguageSwitch: false,
  voiceReference: "WORKER_ENV",
});

export type VoiceConfigShadowResult = "MATCH" | "MISMATCH" | "RESOLUTION_FALLBACK" | "RESOLUTION_ERROR";

export type VoiceConfigShadowMismatch =
  | "ENABLED"
  | "LANGUAGE_MODE"
  | "DEFAULT_LANGUAGE"
  | "FALLBACK_LANGUAGE"
  | "SUPPORTED_LANGUAGES"
  | "LANGUAGE_SWITCH"
  | "VOICE_REFERENCE";

export type VoiceConfigShadowErrorCode =
  | VoiceConfigErrorCode
  | "VOICE_CONFIG_SHADOW_TIMEOUT"
  | "VOICE_CONFIG_SHADOW_FAILED";

export interface VoiceConfigShadowOutcome {
  readonly result: VoiceConfigShadowResult;
  readonly mismatches: readonly VoiceConfigShadowMismatch[];
  readonly errorCode: VoiceConfigShadowErrorCode | null;
  /** Per-call snapshot; null when resolution failed. */
  readonly config: RuntimeVoiceConfig | null;
}

export type VoiceConfigShadowInput = ResolveVoiceConfigurationResult | { ok: false; code: VoiceConfigShadowErrorCode };

export type VoiceConfigResolver = (input: { clinicId: string; calledDid: string }) => Promise<ResolveVoiceConfigurationResult>;

export interface VoiceConfigShadowRun {
  readonly outcome: VoiceConfigShadowOutcome;
  /** Resolver duration, or time until the wait bound expired. */
  readonly resolveMs: number;
}

export interface PendingVoiceConfigShadow {
  /** Never rejects; waits at most `maxWaitMs` from this call, then reports a timeout. */
  settle(maxWaitMs: number): Promise<VoiceConfigShadowRun>;
}

const LANGUAGE_MISMATCHES: readonly VoiceConfigShadowMismatch[] = [
  "LANGUAGE_MODE",
  "DEFAULT_LANGUAGE",
  "FALLBACK_LANGUAGE",
  "SUPPORTED_LANGUAGES",
  "LANGUAGE_SWITCH",
];

/** The trusted DID no longer maps to the call's tenant: a security failure, never a fallback. */
export function isVoiceConfigTenantViolation(outcome: VoiceConfigShadowOutcome): boolean {
  return outcome.errorCode === "VOICE_DID_TENANT_MISMATCH";
}

export function compareWithCurrentRuntime(config: RuntimeVoiceConfig): VoiceConfigShadowMismatch[] {
  const current = CURRENT_RUNTIME_VOICE_BEHAVIOR;
  const mismatches: VoiceConfigShadowMismatch[] = [];
  if (config.enabled !== current.enabled) mismatches.push("ENABLED");
  if (config.languageMode !== current.languageMode) mismatches.push("LANGUAGE_MODE");
  if (config.defaultLanguage !== current.defaultLanguage) mismatches.push("DEFAULT_LANGUAGE");
  if (config.fallbackLanguage !== current.fallbackLanguage) mismatches.push("FALLBACK_LANGUAGE");
  if (
    config.supportedLanguages.length !== current.supportedLanguages.length ||
    config.supportedLanguages.some((locale, i) => locale !== current.supportedLanguages[i])
  ) {
    mismatches.push("SUPPORTED_LANGUAGES");
  }
  if (config.allowLanguageSwitch !== current.allowLanguageSwitch) mismatches.push("LANGUAGE_SWITCH");
  if (config.languages[config.defaultLanguage]?.providerVoice.kind !== current.voiceReference) {
    mismatches.push("VOICE_REFERENCE");
  }
  return mismatches;
}

export function evaluateVoiceConfigShadow(input: VoiceConfigShadowInput): VoiceConfigShadowOutcome {
  if (!input.ok) {
    return Object.freeze({ result: "RESOLUTION_ERROR", mismatches: Object.freeze([]), errorCode: input.code, config: null });
  }
  const config = toRuntimeVoiceConfig(input.config);
  const mismatches = Object.freeze(compareWithCurrentRuntime(config));
  const result: VoiceConfigShadowResult =
    config.issues.length > 0 ? "RESOLUTION_FALLBACK" : mismatches.length > 0 ? "MISMATCH" : "MATCH";
  return Object.freeze({ result, mismatches, errorCode: null, config });
}

/**
 * Starts one shadow resolution immediately, so it overlaps other call-start work. The wait
 * bound applies only when the caller settles it; a late resolver result is discarded.
 */
export function startVoiceConfigShadow(
  resolve: VoiceConfigResolver,
  input: { clinicId: string; calledDid: string }
): PendingVoiceConfigShadow {
  const startedAt = performance.now();
  const elapsed = () => Math.round(performance.now() - startedAt);
  const resolved = Promise.resolve()
    .then(() => resolve({ clinicId: input.clinicId, calledDid: input.calledDid }))
    .catch((): VoiceConfigShadowInput => ({ ok: false, code: "VOICE_CONFIG_SHADOW_FAILED" }))
    .then((result) => ({ result, resolveMs: elapsed() }));
  return {
    settle(maxWaitMs) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<{ result: VoiceConfigShadowInput; resolveMs: number }>((done) => {
        timer = setTimeout(
          () => done({ result: { ok: false, code: "VOICE_CONFIG_SHADOW_TIMEOUT" }, resolveMs: elapsed() }),
          maxWaitMs
        );
      });
      return Promise.race([resolved, timeout]).then(({ result, resolveMs }) => {
        clearTimeout(timer);
        return { outcome: evaluateVoiceConfigShadow(result), resolveMs };
      });
    },
  };
}

/** Closed-set codes, locale codes, counts and booleans only. */
export function voiceConfigShadowLogFields(outcome: VoiceConfigShadowOutcome): Record<string, unknown> {
  const config = outcome.config;
  const defaultVoice = config?.languages[config.defaultLanguage];
  return {
    result: outcome.result,
    mismatches: [...outcome.mismatches],
    errorCode: outcome.errorCode,
    languageMatch: config ? !outcome.mismatches.some((m) => LANGUAGE_MISMATCHES.includes(m)) : null,
    voiceMatch: config ? !outcome.mismatches.includes("VOICE_REFERENCE") : null,
    ...(config
      ? {
          source: config.source,
          version: config.version,
          enabled: config.enabled,
          languageMode: config.languageMode,
          defaultLanguage: config.defaultLanguage,
          fallbackLanguage: config.fallbackLanguage,
          supportedLanguages: [...config.supportedLanguages],
          supportedLanguageCount: config.supportedLanguages.length,
          allowLanguageSwitch: config.allowLanguageSwitch,
          defaultVoiceReference: defaultVoice?.providerVoice.kind ?? null,
          defaultVoiceType: defaultVoice?.voiceType ?? null,
          didProfileApplied: config.didProfileKey !== null,
          issues: [...config.issues],
        }
      : {}),
  };
}
