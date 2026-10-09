/**
 * PII-safe structured worker logging. Only allowlisted operational fields are ever written:
 * never caller number, room name, participant identity, raw SIP attributes, transcript, reply,
 * speech text, lease tokens or raw errors. Unknown fields are dropped at runtime as well.
 */

import type { CallControllerLogger } from "@/lib/voice/runtime/callController";

export const WORKER_LOG_FIELDS = [
  "jobId",
  "bindingId",
  "clinicId",
  "callSessionId",
  "conversationId",
  "didE164",
  "turnSeq",
  "leaseGeneration",
  "state",
  "code",
  "reason",
  "disposition",
  "outcome",
  "eouToFinalMs",
  "finalToAgentStartMs",
  "agentCoreMs",
  "ttsFirstAudioMs",
  "userTurnToFirstAudioMs",
  "verifyMs",
  "bridgeMs",
  "eventLoopMaxMs",
  "eventLoopP99Ms",
  "speechKind",
  "playoutMs",
  "durationMs",
] as const;

export type WorkerLogField = (typeof WORKER_LOG_FIELDS)[number];
export type WorkerLogFields = Partial<Record<WorkerLogField, string | number | boolean>>;
export type WorkerLogger = (checkpoint: string, fields?: WorkerLogFields) => void;

export function createWorkerLogger(sink: (line: string) => void = (line) => console.log(line)): WorkerLogger {
  return (checkpoint, fields = {}) => {
    const entry: Record<string, string | number | boolean> = { checkpoint };
    for (const key of WORKER_LOG_FIELDS) {
      const value: unknown = fields[key];
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") entry[key] = value;
    }
    try {
      sink(JSON.stringify(entry));
    } catch {
      // Logging must never break the call.
    }
  };
}

export function controllerLogger(log: WorkerLogger): CallControllerLogger {
  return (entry) =>
    log(entry.checkpoint, {
      state: entry.state,
      bindingId: entry.bindingId,
      clinicId: entry.clinicId,
      callSessionId: entry.callSessionId,
      conversationId: entry.conversationId,
      leaseGeneration: entry.leaseGeneration,
      turnSeq: entry.turnSeq,
      code: entry.code,
      reason: entry.reason,
      verifyMs: entry.verifyMs,
      bridgeMs: entry.bridgeMs,
    });
}
