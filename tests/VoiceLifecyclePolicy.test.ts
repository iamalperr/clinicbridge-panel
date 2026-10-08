/**
 * Phase 3 Step 3 — voice call lifecycle / interruption policy (pure).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { AppointmentState } from "@/lib/agent/types";
import {
  DEFAULT_VOICE_LIFECYCLE_POLICY,
  INITIAL_SILENCE_STATE,
  IN_FLIGHT_TURN_POLICY,
  VOICE_CALL_END_REASONS,
  canStartAgentTurn,
  endReasonAfterFinalReply,
  evaluateCallDuration,
  fallbackForEndReason,
  getFallbackSpeech,
  isFailureEndReason,
  isSilenceTimerActive,
  onCallerSpeech,
  onSilenceTimeout,
  resolveBargeIn,
  resolveBufferedSpeechAfterTurn,
  resolveVoiceLifecyclePolicy,
  routeCallerSpeech,
  toSessionEndReason,
  type VoiceCallEndReason,
  type VoiceCallPhase,
} from "@/lib/voice/telephony/lifecyclePolicy";

const MIN = 60_000;

describe("policy defaults and configuration", () => {
  it("defaults: 15 min max, 2 reprompts, confirmation summary uninterruptible", () => {
    expect(DEFAULT_VOICE_LIFECYCLE_POLICY.maxCallDurationMs).toBe(15 * MIN);
    expect(DEFAULT_VOICE_LIFECYCLE_POLICY.maxSilenceReprompts).toBe(2);
    expect(DEFAULT_VOICE_LIFECYCLE_POLICY.uninterruptibleAppointmentStates).toEqual(["AWAITING_CONFIRMATION"]);
    expect(Object.isFrozen(DEFAULT_VOICE_LIFECYCLE_POLICY)).toBe(true);
  });

  it("overrides are merged and validated", () => {
    expect(resolveVoiceLifecyclePolicy({ maxCallDurationMs: 5 * MIN }).maxCallDurationMs).toBe(5 * MIN);
    expect(resolveVoiceLifecyclePolicy().silenceTimeoutMs).toBe(DEFAULT_VOICE_LIFECYCLE_POLICY.silenceTimeoutMs);
    expect(() => resolveVoiceLifecyclePolicy({ maxCallDurationMs: 0 })).toThrow(RangeError);
    expect(() => resolveVoiceLifecyclePolicy({ silenceTimeoutMs: 1.5 })).toThrow(RangeError);
    expect(() => resolveVoiceLifecyclePolicy({ maxSilenceReprompts: -1 })).toThrow(RangeError);
    expect(resolveVoiceLifecyclePolicy({ maxSilenceReprompts: 0 }).maxSilenceReprompts).toBe(0);
  });
});

describe("max duration", () => {
  const start = Date.parse("2026-10-07T09:00:00.000Z");

  it("continues before the limit and reports remaining time", () => {
    expect(evaluateCallDuration({ startedAtMs: start, nowMs: start + 14 * MIN })).toEqual({
      action: "CONTINUE",
      remainingMs: MIN,
    });
  });

  it("ends exactly at and after the limit", () => {
    for (const elapsed of [15 * MIN, 15 * MIN + 1, 60 * MIN]) {
      expect(evaluateCallDuration({ startedAtMs: start, nowMs: start + elapsed })).toEqual({
        action: "END_CALL",
        endReason: "MAX_DURATION",
      });
    }
  });

  it("is configurable and tolerates clock going backwards", () => {
    const policy = resolveVoiceLifecyclePolicy({ maxCallDurationMs: 2 * MIN });
    expect(evaluateCallDuration({ startedAtMs: start, nowMs: start + 2 * MIN }, policy).action).toBe("END_CALL");
    expect(evaluateCallDuration({ startedAtMs: start, nowMs: start - 1000 })).toEqual({
      action: "CONTINUE",
      remainingMs: 15 * MIN,
    });
  });
});

describe("silence", () => {
  it("reprompt, reprompt, then end politely on the third consecutive timeout", () => {
    const first = onSilenceTimeout(INITIAL_SILENCE_STATE);
    expect(first).toEqual({ action: "REPROMPT", state: { consecutiveSilenceTimeouts: 1 }, fallback: "NO_SPEECH_REPROMPT" });
    const second = onSilenceTimeout(first.state);
    expect(second).toEqual({ action: "REPROMPT", state: { consecutiveSilenceTimeouts: 2 }, fallback: "NO_SPEECH_REPROMPT" });
    const third = onSilenceTimeout(second.state);
    expect(third).toEqual({
      action: "END_CALL",
      state: { consecutiveSilenceTimeouts: 3 },
      endReason: "SILENCE_TIMEOUT",
      fallback: "SILENCE_GOODBYE",
    });
  });

  it("caller speech resets the consecutive count", () => {
    const afterTwo = onSilenceTimeout(onSilenceTimeout(INITIAL_SILENCE_STATE).state).state;
    const reset = onCallerSpeech();
    expect(reset).toEqual({ consecutiveSilenceTimeouts: 0 });
    expect(onSilenceTimeout(reset).action).toBe("REPROMPT");
    expect(onSilenceTimeout(afterTwo).action).toBe("END_CALL");
  });

  it("does not mutate the input state", () => {
    const state = { consecutiveSilenceTimeouts: 1 };
    onSilenceTimeout(state);
    expect(state).toEqual({ consecutiveSilenceTimeouts: 1 });
  });

  it("configurable reprompt count", () => {
    const strict = resolveVoiceLifecyclePolicy({ maxSilenceReprompts: 0 });
    expect(onSilenceTimeout(INITIAL_SILENCE_STATE, strict).action).toBe("END_CALL");
  });

  it("silence timer only runs while listening", () => {
    const phases: VoiceCallPhase[] = ["LISTENING", "PROCESSING", "SPEAKING", "ENDING", "ENDED"];
    expect(phases.filter(isSilenceTimerActive)).toEqual(["LISTENING"]);
  });
});

describe("barge-in", () => {
  it("default: interruption allowed", () => {
    expect(resolveBargeIn(undefined)).toEqual({ allowInterruptions: true, reason: "DEFAULT" });
    expect(resolveBargeIn(null)).toEqual({ allowInterruptions: true, reason: "DEFAULT" });
    expect(resolveBargeIn({ appointmentState: undefined })).toEqual({ allowInterruptions: true, reason: "DEFAULT" });
  });

  it("AWAITING_CONFIRMATION → interruption disabled for that reply", () => {
    expect(resolveBargeIn({ appointmentState: "AWAITING_CONFIRMATION" })).toEqual({
      allowInterruptions: false,
      reason: "APPOINTMENT_CONFIRMATION_SUMMARY",
    });
  });

  it("COLLECTING_DATE / COLLECTING_TIME → interruption allowed", () => {
    expect(resolveBargeIn({ appointmentState: "COLLECTING_DATE" }).allowInterruptions).toBe(true);
    expect(resolveBargeIn({ appointmentState: "COLLECTING_TIME" }).allowInterruptions).toBe(true);
  });

  it("every other real AppointmentState allows interruption", () => {
    const others: AppointmentState[] = [
      "IDLE",
      "COLLECTING_INFO",
      "COLLECTING_NAME",
      "COLLECTING_PHONE",
      "COLLECTING_EMAIL",
      "COLLECTING_TREATMENT",
      "AWAITING_DATE_CLARIFICATION",
      "SUBMITTING_APPOINTMENT",
      "APPOINTMENT_SUBMITTED",
      "APPOINTMENT_FAILED",
    ];
    for (const appointmentState of others) {
      expect(resolveBargeIn({ appointmentState }).allowInterruptions).toBe(true);
    }
  });

  it("decision uses structured state only — reply text is ignored", () => {
    const turn = { appointmentState: "COLLECTING_DATE" as const, replyText: "Onaylıyor musunuz? Evet/Hayır" };
    expect(resolveBargeIn(turn).allowInterruptions).toBe(true);
  });
});

describe("caller speech routing and in-flight protection", () => {
  const allow = resolveBargeIn(undefined);
  const block = resolveBargeIn({ appointmentState: "AWAITING_CONFIRMATION" });

  it("in-flight turns are never concurrent and never cancelled", () => {
    expect(IN_FLIGHT_TURN_POLICY).toEqual({
      allowConcurrentAgentTurns: false,
      cancelActiveTurnOnCallerSpeech: false,
      cancelActiveTurnOnHangup: false,
    });
    expect(Object.isFrozen(IN_FLIGHT_TURN_POLICY)).toBe(true);
    expect(canStartAgentTurn({ phase: "LISTENING", turnInFlight: true })).toBe(false);
    expect(canStartAgentTurn({ phase: "PROCESSING", turnInFlight: false })).toBe(false);
    expect(canStartAgentTurn({ phase: "SPEAKING", turnInFlight: false })).toBe(false);
    expect(canStartAgentTurn({ phase: "ENDING", turnInFlight: false })).toBe(false);
    expect(canStartAgentTurn({ phase: "LISTENING", turnInFlight: false })).toBe(true);
  });

  it("routes caller speech by phase", () => {
    expect(routeCallerSpeech({ phase: "LISTENING", turnInFlight: false, bargeIn: allow })).toBe("START_TURN");
    expect(routeCallerSpeech({ phase: "PROCESSING", turnInFlight: true, bargeIn: allow })).toBe("BUFFER");
    expect(routeCallerSpeech({ phase: "LISTENING", turnInFlight: true, bargeIn: allow })).toBe("BUFFER");
    expect(routeCallerSpeech({ phase: "SPEAKING", turnInFlight: false, bargeIn: allow })).toBe("INTERRUPT_PLAYBACK");
    expect(routeCallerSpeech({ phase: "SPEAKING", turnInFlight: false, bargeIn: block })).toBe("DISCARD");
    expect(routeCallerSpeech({ phase: "ENDING", turnInFlight: false, bargeIn: allow })).toBe("DISCARD");
    expect(routeCallerSpeech({ phase: "ENDED", turnInFlight: true, bargeIn: allow })).toBe("DISCARD");
  });

  it("speech buffered before a confirmation summary is discarded, otherwise submitted", () => {
    expect(resolveBufferedSpeechAfterTurn(block)).toBe("DISCARD");
    expect(resolveBufferedSpeechAfterTurn(allow)).toBe("SUBMIT");
  });
});

describe("end reasons", () => {
  it("is the provider-neutral closed set", () => {
    expect([...VOICE_CALL_END_REASONS]).toEqual([
      "CALLER_HANGUP",
      "SILENCE_TIMEOUT",
      "MAX_DURATION",
      "STT_FAILURE",
      "TTS_FAILURE",
      "AGENT_FAILURE",
      "TENANT_REJECTED",
      "RUNTIME_FAILURE",
      "AGENT_COMPLETED",
    ]);
  });

  it("failure classification", () => {
    const failures = VOICE_CALL_END_REASONS.filter(isFailureEndReason);
    expect(failures).toEqual(["STT_FAILURE", "TTS_FAILURE", "AGENT_FAILURE", "RUNTIME_FAILURE"]);
  });

  it("maps to Phase 2 endCallSession reasons", () => {
    expect(toSessionEndReason("CALLER_HANGUP", 3)).toBe("completed");
    expect(toSessionEndReason("CALLER_HANGUP", 0)).toBe("abandoned");
    expect(toSessionEndReason("SILENCE_TIMEOUT", 0)).toBe("abandoned");
    expect(toSessionEndReason("MAX_DURATION", 10)).toBe("completed");
    for (const r of ["STT_FAILURE", "TTS_FAILURE", "AGENT_FAILURE", "RUNTIME_FAILURE"] as VoiceCallEndReason[]) {
      expect(toSessionEndReason(r, 2)).toBe("failed");
    }
    expect(toSessionEndReason("TENANT_REJECTED", 0)).toBeNull();
  });

  it("AGENT_COMPLETED is canonical, distinct from CALLER_HANGUP and not a failure", () => {
    expect(VOICE_CALL_END_REASONS).toContain("AGENT_COMPLETED");
    expect(VOICE_CALL_END_REASONS).toContain("CALLER_HANGUP");
    expect(new Set(VOICE_CALL_END_REASONS).size).toBe(VOICE_CALL_END_REASONS.length);
    expect(isFailureEndReason("AGENT_COMPLETED")).toBe(false);
  });

  it("AGENT_COMPLETED uses the turn-count session mapping (zero turns never become completed)", () => {
    expect(toSessionEndReason("AGENT_COMPLETED", 1)).toBe("completed");
    expect(toSessionEndReason("AGENT_COMPLETED", 7)).toBe("completed");
    expect(toSessionEndReason("AGENT_COMPLETED", 0)).toBe("abandoned");
    for (const turns of [0, 1, 5]) {
      expect(toSessionEndReason("AGENT_COMPLETED", turns)).toBe(toSessionEndReason("CALLER_HANGUP", turns));
    }
  });
});

describe("final reply playback → end reason", () => {
  it("AGENT_COMPLETED only after the final reply was actually played", () => {
    expect(endReasonAfterFinalReply("PLAYED")).toBe("AGENT_COMPLETED");
  });

  it("final playback failure selects TTS_FAILURE (a failure), never AGENT_COMPLETED", () => {
    expect(endReasonAfterFinalReply("PLAYBACK_FAILED")).toBe("TTS_FAILURE");
    expect(isFailureEndReason(endReasonAfterFinalReply("PLAYBACK_FAILED"))).toBe(true);
    expect(toSessionEndReason(endReasonAfterFinalReply("PLAYBACK_FAILED"), 3)).toBe("failed");
  });

  it("caller hanging up during the final reply stays CALLER_HANGUP", () => {
    expect(endReasonAfterFinalReply("CALLER_HANGUP")).toBe("CALLER_HANGUP");
  });

  it("only a delivered final reply produces AGENT_COMPLETED", () => {
    const produced = (["PLAYED", "PLAYBACK_FAILED", "CALLER_HANGUP"] as const).map(endReasonAfterFinalReply);
    expect(produced).toEqual(["AGENT_COMPLETED", "TTS_FAILURE", "CALLER_HANGUP"]);
  });

  it("existing end reasons keep their session mapping and fallbacks", () => {
    expect(toSessionEndReason("SILENCE_TIMEOUT", 2)).toBe("completed");
    expect(toSessionEndReason("MAX_DURATION", 0)).toBe("abandoned");
    expect(fallbackForEndReason("SILENCE_TIMEOUT")).toBe("SILENCE_GOODBYE");
    expect(fallbackForEndReason("AGENT_FAILURE")).toBe("TECHNICAL_FAILURE");
    expect(fallbackForEndReason("TTS_FAILURE")).toBeNull();
  });
});

describe("fixed fallback behavior", () => {
  it("maps end reasons to fallback categories", () => {
    const mapping = Object.fromEntries(VOICE_CALL_END_REASONS.map((r) => [r, fallbackForEndReason(r)]));
    expect(mapping).toEqual({
      CALLER_HANGUP: null,
      SILENCE_TIMEOUT: "SILENCE_GOODBYE",
      MAX_DURATION: "MAX_DURATION_GOODBYE",
      STT_FAILURE: "TECHNICAL_FAILURE",
      TTS_FAILURE: null,
      AGENT_FAILURE: "TECHNICAL_FAILURE",
      TENANT_REJECTED: "TECHNICAL_FAILURE",
      RUNTIME_FAILURE: "TECHNICAL_FAILURE",
      AGENT_COMPLETED: null,
    });
  });

  it("returns short generic Turkish text by default and English for en locales", () => {
    expect(getFallbackSpeech("TECHNICAL_FAILURE")).toBe(
      "Üzgünüm, şu anda teknik bir sorun yaşıyoruz. Lütfen daha sonra tekrar deneyin."
    );
    expect(getFallbackSpeech("NO_SPEECH_REPROMPT", "tr-TR")).toBe("Sizi duyamadım. Size nasıl yardımcı olabilirim?");
    expect(getFallbackSpeech("SILENCE_GOODBYE", "en-GB")).toMatch(/end the call/);
    expect(getFallbackSpeech("MAX_DURATION_GOODBYE", "de")).toMatch(/Görüşme süremiz doldu/);
  });

  it("fallback text never mentions vendors or implementation details", () => {
    for (const locale of ["tr", "en"]) {
      for (const c of ["TECHNICAL_FAILURE", "NO_SPEECH_REPROMPT", "SILENCE_GOODBYE", "MAX_DURATION_GOODBYE"] as const) {
        const text = getFallbackSpeech(c, locale);
        expect(text.length).toBeLessThan(120);
        expect(text).not.toMatch(/livekit|openai|firebase|server|sunucu|api|stt|tts|yapay zeka|AI\b|hata kodu/i);
      }
    }
  });
});

describe("lifecyclePolicy module boundary", () => {
  const src = readFileSync(resolve(__dirname, "..", "lib/voice/telephony/lifecyclePolicy.ts"), "utf8");

  it("has no provider, network, persistence or framework references", () => {
    expect(src).not.toMatch(
      /livekit|verimor|openai|anthropic|elevenlabs|deepgram|azure|websocket|firestore|firebase|from ["']next|NextRequest|NextResponse|fetch\(|process\.env|handleClinicAgentTurn|appointment-service/i
    );
  });

  it("has only type-only imports (erased at runtime)", () => {
    const imports = [...src.matchAll(/^import\s+(type\s+)?.*from\s+["']([^"']+)["'];?$/gm)];
    expect(imports.length).toBeGreaterThan(0);
    for (const m of imports) expect(m[1]).toBe("type ");
    expect(src).not.toMatch(/require\(/);
  });
});
