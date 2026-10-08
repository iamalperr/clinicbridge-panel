/**
 * Per-turn latency, as non-PII integers for structured worker logs only (never persisted).
 *
 *   eouToFinalMs           caller stopped speaking (VAD) → committed final transcript
 *                          (endpointing + turn detection + STT finalization)
 *   finalToAgentStartMs    final transcript → Agent Core turn starts (queue + lease verify)
 *   agentCoreMs            Agent Core turn duration (bridge → processVoiceTurn → result)
 *   ttsFirstAudioMs        reply handed to TTS → first reply audio played out
 *   userTurnToFirstAudioMs caller stopped speaking (or final transcript) → first reply audio
 */

export interface TurnLatencyMarks {
  callerStoppedAt: number | null;
  finalTranscriptAt: number;
  agentStartAt?: number;
  agentEndAt?: number;
  speakRequestedAt?: number;
}

export interface TurnLatencyFields {
  eouToFinalMs?: number;
  finalToAgentStartMs?: number;
  agentCoreMs?: number;
  ttsFirstAudioMs?: number;
  userTurnToFirstAudioMs?: number;
}

function span(from: number | null | undefined, to: number | null | undefined): number | undefined {
  if (typeof from !== "number" || typeof to !== "number") return undefined;
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return undefined;
  return Math.round(to - from);
}

export function computeTurnLatency(marks: TurnLatencyMarks, firstAudioAt: number | null): TurnLatencyFields {
  const fields: TurnLatencyFields = {};
  const entries: [keyof TurnLatencyFields, number | undefined][] = [
    ["eouToFinalMs", span(marks.callerStoppedAt, marks.finalTranscriptAt)],
    ["finalToAgentStartMs", span(marks.finalTranscriptAt, marks.agentStartAt)],
    ["agentCoreMs", span(marks.agentStartAt, marks.agentEndAt)],
    ["ttsFirstAudioMs", span(marks.speakRequestedAt, firstAudioAt)],
    ["userTurnToFirstAudioMs", span(marks.callerStoppedAt ?? marks.finalTranscriptAt, firstAudioAt)],
  ];
  for (const [key, value] of entries) {
    if (value !== undefined) fields[key] = value;
  }
  return fields;
}
