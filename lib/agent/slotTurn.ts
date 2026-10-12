/**
 * Appointment slot-collection turn transition helpers for Agent Core (product-global).
 *
 * One turn = current draft + safe slot updates + corrections + declines → next draft.
 * These helpers compute what changed, the bounded per-slot retry state, and the next
 * reply from the NEW draft. They never touch persistence or call a model.
 */

import { controlPhraseKey } from "@/lib/conversation/controlPhrase";
import { PendingActionManager } from "@/lib/conversation/PendingActionManager";
import { SlotExtractor } from "@/lib/conversation/slotExtractor";
import { applyAppointmentSchedulingAmendment } from "@/lib/conversation/appointmentSchedulingAmendment";
import type { AppointmentDraftLike } from "@/lib/conversation/appointmentConfirmationAmendment";
import type { ConversationSlots, PendingAction } from "@/lib/conversation/types";
import type { WeeklySchedule } from "@/lib/skills/ClinicWorkingHoursResolver";
import type { MeridiemContext, SlotName, SlotOutcome, SlotOutcomes, SlotReasonCode } from "@/lib/conversation/slotParsing";
import { SLOT_REASON_CODES, statementClauses } from "@/lib/conversation/slotParsing";
import {
  slotAcknowledgement,
  slotHandoffDeclinedPrompt,
  slotRecoveryPrompt,
  slotRecoveryStage,
  voiceSlotQuestion,
  SLOT_HANDOFF_ATTEMPT,
} from "@/lib/conversation/slotRecoveryPrompts";
import type { AppointmentData, AppointmentState } from "./types";

export const COLLECTED_SLOTS: readonly SlotName[] = [
  "treatment",
  "preferredDate",
  "preferredTime",
  "fullName",
  "phone",
  "email",
];

/** Collection sub-state that asks for `slot` (the earliest missing slot). */
export function collectingStateForSlot(slot: string | number | symbol | undefined): AppointmentState {
  switch (slot) {
    case "treatment":
      return "COLLECTING_TREATMENT";
    case "preferredDate":
      return "COLLECTING_DATE";
    case "preferredTime":
      return "COLLECTING_TIME";
    case "fullName":
      return "COLLECTING_NAME";
    case "phone":
      return "COLLECTING_PHONE";
    case "email":
      return "COLLECTING_EMAIL";
    default:
      return "COLLECTING_INFO";
  }
}

/** Persisted, PII-free retry state for one slot. `candidates` only ever holds clock times. */
export interface SlotAttemptState {
  count: number;
  lastReasonCode: SlotReasonCode;
  candidates?: string[];
}

export type SlotAttempts = Partial<Record<SlotName, SlotAttemptState>>;

const REASON_SET = new Set<string>(SLOT_REASON_CODES);
const CLOCK = /^\d{2}:\d{2}$/;

export function normalizeSlotAttempts(raw: unknown): SlotAttempts {
  const out: SlotAttempts = {};
  if (!raw || typeof raw !== "object") return out;
  for (const slot of COLLECTED_SLOTS) {
    const entry = (raw as Record<string, unknown>)[slot] as Record<string, unknown> | null | undefined;
    if (!entry || typeof entry !== "object") continue;
    const count = typeof entry.count === "number" && entry.count > 0 ? Math.floor(entry.count) : 0;
    if (!count) continue;
    const reason = typeof entry.lastReasonCode === "string" && REASON_SET.has(entry.lastReasonCode)
      ? (entry.lastReasonCode as SlotReasonCode)
      : "NO_SLOT_VALUE";
    const candidates = Array.isArray(entry.candidates)
      ? entry.candidates.filter((c): c is string => typeof c === "string" && CLOCK.test(c)).slice(0, 2)
      : undefined;
    out[slot] = { count, lastReasonCode: reason, ...(candidates?.length ? { candidates } : {}) };
  }
  return out;
}

/**
 * Full replacement patch for the persisted `slotAttempts` map. Conversation logs are
 * written with merge semantics, so cleared slots are written as null explicitly.
 */
export function slotAttemptsPatch(attempts: SlotAttempts): Record<SlotName, SlotAttemptState | null> {
  const patch = {} as Record<SlotName, SlotAttemptState | null>;
  for (const slot of COLLECTED_SLOTS) patch[slot] = attempts[slot] ?? null;
  return patch;
}

function slotValue(draft: Partial<AppointmentData>, slot: SlotName): string {
  switch (slot) {
    case "treatment":
      return String(draft.requestedService || "");
    case "preferredDate":
      return String(draft.requestedDate || "");
    case "preferredTime":
      return String(draft.requestedTime || "");
    case "fullName":
      return String(draft.patientName || "");
    case "phone":
      return String(draft.patientPhone || "");
    case "email":
      if (draft.patientEmail) return String(draft.patientEmail);
      return draft.emailDisposition === "DECLINED" ? "__declined__" : "";
  }
}

/** Which slots this turn filled (empty → value) and corrected (value → different value). */
export function diffDraftSlots(
  before: Partial<AppointmentData>,
  after: Partial<AppointmentData>
): { filled: SlotName[]; corrected: SlotName[] } {
  const filled: SlotName[] = [];
  const corrected: SlotName[] = [];
  for (const slot of COLLECTED_SLOTS) {
    const prev = slotValue(before, slot);
    const next = slotValue(after, slot);
    if (!next || prev === next) continue;
    if (prev) corrected.push(slot);
    else filled.push(slot);
  }
  return { filled, corrected };
}

export function isSlotRecoveryOffer(pendingAction: PendingAction | null | undefined): boolean {
  return (
    pendingAction?.status === "pending" &&
    pendingAction.type === "create_contact_request" &&
    (pendingAction.payload as { origin?: string } | undefined)?.origin === "slot_recovery"
  );
}

const BARE_DECLINE = /^(hayır|hayir|yok|istemiyorum|gerek yok|kalsın|kalsin|hayır teşekkürler|hayir tesekkurler|no|no thanks|nope|nein|non|لا)$/i;

/** A bare "no" to the slot-recovery handoff offer: keep collecting, never cancel the booking. */
export function isBareSlotRecoveryDecline(message: string): boolean {
  return BARE_DECLINE.test(controlPhraseKey(message).replace(/[,;]+/g, " ").replace(/\s+/g, " "));
}

export function createSlotRecoveryHandoffAction(params: { locale: string; clinicId: string; conversationId: string }): PendingAction {
  return PendingActionManager.createPendingAction(
    "create_contact_request",
    {
      origin: "slot_recovery",
      preferredContactMethod: "unspecified",
      language: params.locale,
      clinicId: params.clinicId,
      conversationId: params.conversationId,
    },
    undefined,
    "Offer clinic contact after repeated slot failures"
  );
}

function sameReply(a: string, b: string | null | undefined): boolean {
  const norm = (s: string) => s.toLocaleLowerCase("tr-TR").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return Boolean(b) && norm(a) === norm(String(b));
}

export interface SlotCollectionReply {
  reply: string;
  attempt: number;
  handoffOffered: boolean;
  nextAttempts: SlotAttempts;
}

/**
 * Next reply for a collection turn that still has missing slots, computed from the NEW
 * draft. A failed answer to the expected slot climbs the ladder clarify → guide →
 * handoff offer; email keeps its own validation policy and is never counted here.
 */
export function composeSlotCollectionReply(params: {
  channel: string;
  locale: string;
  expectedSlot: SlotName | undefined;
  nextSlot: SlotName;
  slotOutcomes: SlotOutcomes | undefined;
  filled: readonly SlotName[];
  corrected: readonly SlotName[];
  attempts: SlotAttempts;
  draft: Partial<AppointmentData>;
  /** The channel's normal question for `nextSlot` (web: `generateNextSlotPrompt`). */
  webPrompt: string;
  previousReply: string | null;
  /** The previous turn's slot-recovery offer was declined by the caller. */
  handoffDeclined?: boolean;
}): SlotCollectionReply {
  const isVoice = params.channel === "voice";
  const nextAttempts: SlotAttempts = { ...params.attempts };
  for (const slot of [...params.filled, ...params.corrected]) delete nextAttempts[slot];

  const voiceQuestion = isVoice ? voiceSlotQuestion(params.nextSlot, params.locale) : null;
  const basePrompt = voiceQuestion ?? params.webPrompt;
  const expectedOutcome: SlotOutcome | undefined = params.expectedSlot ? params.slotOutcomes?.[params.expectedSlot] : undefined;

  if (params.handoffDeclined) {
    nextAttempts[params.nextSlot] = {
      count: Math.max(1, SLOT_HANDOFF_ATTEMPT - 2),
      lastReasonCode: params.attempts[params.nextSlot]?.lastReasonCode ?? "NO_SLOT_VALUE",
    };
    return {
      reply: slotHandoffDeclinedPrompt(params.nextSlot, params.locale, basePrompt),
      attempt: 0,
      handoffOffered: false,
      nextAttempts,
    };
  }

  const progressed = params.filled.length > 0 || params.corrected.length > 0;
  const failedExpected =
    Boolean(params.expectedSlot) &&
    params.expectedSlot !== "email" &&
    params.expectedSlot === params.nextSlot &&
    !progressed;

  let reply: string;
  let attempt = 0;
  let handoffOffered = false;

  if (failedExpected) {
    attempt = (params.attempts[params.nextSlot]?.count ?? 0) + 1;
    const clockCandidates =
      params.nextSlot === "preferredTime" && expectedOutcome?.status === "ambiguous" && expectedOutcome.candidates?.length === 2
        ? [...expectedOutcome.candidates]
        : undefined;
    nextAttempts[params.nextSlot] = {
      count: attempt,
      lastReasonCode: expectedOutcome?.reasonCode ?? "NO_SLOT_VALUE",
      ...(clockCandidates ? { candidates: clockCandidates } : {}),
    };
    reply = slotRecoveryPrompt({
      slot: params.nextSlot,
      attempt,
      outcome: expectedOutcome,
      locale: params.locale,
      basePrompt,
    });
    handoffOffered = !clockCandidates && slotRecoveryStage(attempt) === "handoff";
  } else if (isVoice) {
    const ack = slotAcknowledgement({
      filledSlots: params.filled,
      correctedSlots: params.corrected,
      draft: {
        requestedDate: params.draft.requestedDate ?? undefined,
        requestedWeekday: (params.draft as { requestedWeekday?: string }).requestedWeekday,
        requestedTime: params.draft.requestedTime ?? undefined,
      },
      locale: params.locale,
      previousReply: params.previousReply,
    });
    reply = ack ? `${ack} ${basePrompt}` : basePrompt;
  } else {
    reply = params.webPrompt;
  }

  if (sameReply(reply, params.previousReply)) {
    const alternate = isVoice ? voiceSlotQuestion(params.nextSlot, params.locale, 1) : null;
    reply = alternate && !sameReply(alternate, params.previousReply)
      ? alternate
      : slotRecoveryPrompt({ slot: params.nextSlot, attempt: 2, outcome: expectedOutcome, locale: params.locale, basePrompt });
  }

  return { reply, attempt, handoffOffered, nextAttempts };
}

/**
 * Merges the non-scheduling slot entities (name, phone, email / decline, treatment) of one
 * turn into the draft. Scheduling fields go through `applyAppointmentSchedulingAmendment`.
 */
export function mergeSafeSlotEntities(
  draft: Partial<AppointmentData>,
  entities: Partial<ConversationSlots> | undefined,
  locale: string,
  options: { treatmentOnlyIfMissing?: boolean } = {}
): void {
  if (!entities) return;
  if (entities.fullName) draft.patientName = entities.fullName;
  if (entities.phone) draft.patientPhone = entities.phone;
  if (entities.email) {
    draft.patientEmail = entities.email;
    draft.emailDisposition = "PROVIDED";
  } else if (entities.emailDeclined === true) {
    // Persisted drafts merge, so an earlier address is blanked rather than omitted.
    draft.patientEmail = "";
    draft.emailDisposition = "DECLINED";
  }
  if (entities.treatment && !(options.treatmentOnlyIfMissing && draft.requestedService)) {
    const treatmentIds = [
      entities.treatment,
      ...(((entities as { additionalTreatments?: string[] }).additionalTreatments) || []),
    ].filter(Boolean);
    const primaryId = treatmentIds[0];
    const label = SlotExtractor.formatMultiTreatmentLabel(treatmentIds, locale);
    const primaryLabel = SlotExtractor.formatMultiTreatmentLabel([primaryId], locale);
    draft.requestedService = primaryLabel || primaryId;
    if (treatmentIds.length > 1) {
      const proceduresNote = locale.startsWith("en")
        ? `Requested procedures: ${label}`
        : `Talep edilen işlemler: ${label}`;
      draft.notes = [draft.notes, proceduresNote].filter(Boolean).join("\n");
    }
  }
}

export interface MixedTurnCapture {
  draft: Partial<AppointmentData>;
  filled: SlotName[];
  corrected: SlotName[];
  slotOutcomes?: SlotOutcomes;
  /** Deterministic scheduling copy when a stated date/time was rejected or needs a day. */
  schedulingNotice: string | null;
  schedulingHandled: boolean;
}

/**
 * Slot information stated alongside an informational question ("Yusuf Alper Özgül. Bu arada
 * implant fiyatınız ne kadar?"). Values are read only from the statement clauses, through the
 * same extractor and scheduling validation as a normal collection turn; the question itself
 * is left to the existing knowledge answer. Ambiguous values stay unfilled.
 */
export function captureMixedTurnSlots(params: {
  message: string;
  draft: Partial<AppointmentData>;
  collectedSlots: Partial<ConversationSlots>;
  expectedSlot?: string;
  locale: string;
  clinicTimeZone: string;
  now: Date;
  workingHours: WeeklySchedule | null | undefined;
  is24_7?: boolean;
  meridiem: MeridiemContext;
}): MixedTurnCapture | null {
  const statement = statementClauses(params.message);
  if (!statement.text) return null;

  const { extracted, slotOutcomes } = SlotExtractor.extractSlots(
    statement.text,
    params.collectedSlots,
    params.locale,
    params.clinicTimeZone,
    params.expectedSlot,
    params.now,
    { meridiem: params.meridiem, surnameCorrection: true }
  );
  const draft: Partial<AppointmentData> = { ...params.draft };
  mergeSafeSlotEntities(draft, extracted, params.locale, { treatmentOnlyIfMissing: true });

  let schedulingNotice: string | null = null;
  const schedulingHandled = Boolean(
    extracted.preferredDate || extracted.preferredTime || extracted.pendingAppointmentDate || extracted.invalidCivilDate
  );
  if (schedulingHandled) {
    const amendment = applyAppointmentSchedulingAmendment({
      message: statement.text,
      draft: draft as AppointmentDraftLike,
      extracted,
      locale: params.locale,
      clinicTimeZone: params.clinicTimeZone,
      now: params.now,
      workingHours: params.workingHours,
      is24_7: params.is24_7,
      expectedSlot: params.expectedSlot,
      meridiem: params.meridiem,
    });
    if (amendment.outcome === "applied" || amendment.outcome === "invalid" || amendment.outcome === "partial_month") {
      Object.assign(draft, amendment.draft);
    }
    if (amendment.outcome === "invalid" || amendment.outcome === "partial_month") {
      schedulingNotice = amendment.message || null;
    }
  }

  const { filled, corrected } = diffDraftSlots(params.draft, draft);
  return { draft, filled, corrected, slotOutcomes, schedulingNotice, schedulingHandled };
}

export function lastAssistantReply(history: ReadonlyArray<{ role?: string; content?: string }>): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn?.role === "assistant" && typeof turn.content === "string") return turn.content;
  }
  return null;
}
