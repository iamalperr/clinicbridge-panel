/**
 * `VOICE_SLOT_TURN` — one PII-free record per voice appointment-collection turn.
 *
 * Only structural facts are logged: slot names, outcome statuses, finite reason codes,
 * counters and buckets. Names, phone numbers, email addresses, transcripts, treatment
 * text, replies and slot values never enter this event; the session id is hashed.
 */

import { createHash } from "crypto";
import type { SlotName, SlotOutcome, SlotReasonCode } from "@/lib/conversation/slotParsing";

export type TokenCountBucket = "0" | "1" | "2" | "3-4" | "5-8" | "9+";

export interface VoiceSlotTurnEvent {
  event: "VOICE_SLOT_TURN";
  sessionRef: string;
  turnSeq: number | null;
  expectedSlot: SlotName | null;
  resolvedSlotNames: SlotName[];
  expectedSlotOutcome: SlotOutcome["status"] | "none";
  reasonCode: SlotReasonCode | null;
  attempt: number;
  progressed: boolean;
  correctionApplied: boolean;
  multiSlotCount: number;
  handoffOffered: boolean;
  latencyMs: number;
  hadTerminalPunctuation: boolean;
  tokenCountBucket: TokenCountBucket;
}

export function tokenCountBucket(text: string): TokenCountBucket {
  const count = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  if (count <= 0) return "0";
  if (count === 1) return "1";
  if (count === 2) return "2";
  if (count <= 4) return "3-4";
  if (count <= 8) return "5-8";
  return "9+";
}

/** Voice message ids are `voice:<binding>:<turnSeq>`. */
export function turnSeqFromMessageId(messageId: string | null | undefined): number | null {
  const match = String(messageId || "").match(/:(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

export function hashSessionRef(conversationId: string): string {
  return createHash("sha256").update(`voice-slot:${conversationId}`).digest("hex").slice(0, 16);
}

export function buildVoiceSlotTurnEvent(input: {
  conversationId: string;
  messageId: string;
  message: string;
  expectedSlot: SlotName | null;
  expectedOutcome?: SlotOutcome;
  resolvedSlotNames: readonly SlotName[];
  correctedSlotNames: readonly SlotName[];
  attempt: number;
  handoffOffered: boolean;
  startTime: number;
  now?: number;
}): VoiceSlotTurnEvent {
  const resolved = Array.from(new Set(input.resolvedSlotNames));
  return {
    event: "VOICE_SLOT_TURN",
    sessionRef: hashSessionRef(input.conversationId),
    turnSeq: turnSeqFromMessageId(input.messageId),
    expectedSlot: input.expectedSlot,
    resolvedSlotNames: resolved,
    expectedSlotOutcome: input.expectedOutcome?.status ?? "none",
    reasonCode: input.expectedOutcome?.reasonCode ?? (input.expectedSlot && !resolved.includes(input.expectedSlot) ? "NO_SLOT_VALUE" : null),
    attempt: input.attempt,
    progressed: resolved.length > 0 || input.correctedSlotNames.length > 0,
    correctionApplied: input.correctedSlotNames.length > 0,
    multiSlotCount: resolved.length,
    handoffOffered: input.handoffOffered,
    latencyMs: Math.max(0, Math.round((input.now ?? Date.now()) - input.startTime)),
    hadTerminalPunctuation: /[.!?…]\s*$/.test(String(input.message || "")),
    tokenCountBucket: tokenCountBucket(input.message),
  };
}
