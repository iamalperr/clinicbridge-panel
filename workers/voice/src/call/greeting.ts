/**
 * Call-opening greeting. Not an Agent Core turn: no turn ID, no conversation message, no
 * transcript. Pure and provider-neutral.
 */

import type { StartRuntimeCallResult, VoiceRuntimeCall } from "@/lib/voice/runtime/voiceRuntimeBridge";

const FALLBACK_GREETING = {
  tr: "Merhaba, size nasıl yardımcı olabilirim?",
  en: "Hello, how can I help you?",
} as const;

/** The trusted DID mapping's greetingText, else a short generic locale fallback (Turkish by default). */
export function resolveCallGreeting(call: Pick<VoiceRuntimeCall, "greetingText" | "locale">): string {
  const configured = call.greetingText?.trim();
  if (configured) return configured;
  const lang = (call.locale ?? "").toLowerCase().startsWith("en") ? "en" : "tr";
  return FALLBACK_GREETING[lang];
}

/** Only the dispatch that created the call greets; a re-dispatch of an existing call never replays it. */
export function greetingForStartedCall(started: Extract<StartRuntimeCallResult, { ok: true }>): string | null {
  return started.created ? resolveCallGreeting(started.call) : null;
}
