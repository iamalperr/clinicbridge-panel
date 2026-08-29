/**
 * Appointment scheduling amendments during collection and confirmation.
 *
 * Order: extract → resolve → apply to draft → validate changed scheduling fields.
 * Latest explicit user message always wins over stale draft scheduling state.
 */

import { SlotExtractor } from "./slotExtractor";
import type { ConversationSlots } from "./types";
import type { AppointmentDraftLike } from "./appointmentConfirmationAmendment";
import {
  validateAppointmentDateOnly,
  validateAppointmentDateTime,
  type AppointmentDateTimeValidationResult,
} from "@/lib/appointment/appointmentDateTimePolicy";
import type { WeeklySchedule } from "@/lib/skills/ClinicWorkingHoursResolver";

export type SchedulingAmendmentOutcome = "applied" | "invalid" | "none";

export type SchedulingAmendmentResult = {
  outcome: SchedulingAmendmentOutcome;
  draft: AppointmentDraftLike;
  amendedFields: Array<"preferredDate" | "preferredTime">;
  validationReason?: string;
  message?: string;
  suggestions?: AppointmentDateTimeValidationResult["suggestions"];
};

function cloneDraft(draft: AppointmentDraftLike): AppointmentDraftLike {
  return { ...draft };
}

function clearSchedulingFields(draft: AppointmentDraftLike): AppointmentDraftLike {
  const next = cloneDraft(draft);
  delete next.requestedDate;
  delete next.preferredDateDisplay;
  delete next.requestedWeekday;
  delete next.requestedTime;
  return next;
}

function applyTimePreferenceFields(
  draft: AppointmentDraftLike,
  extracted: Partial<ConversationSlots>,
  locale: string
): AppointmentDraftLike {
  const next = cloneDraft(draft);
  if (!extracted.preferredTime) return next;
  next.requestedTime = extracted.preferredTime;
  const pref = String(extracted.timePreference || "");
  if (pref === "morning" || pref === "afternoon" || pref === "evening") {
    (next as any).preferredTimePeriod = pref;
    next.preferredTimeText = extracted.rawTimeText || extracted.preferredTime;
  } else if (pref === "after" || pref === "before") {
    next.preferredTimeText = extracted.rawTimeText || extracted.preferredTime;
  } else {
    next.preferredTimeText = extracted.rawTimeText || extracted.preferredTime;
  }
  return next;
}

function mergeExtractedScheduling(
  draft: AppointmentDraftLike,
  extracted: Partial<ConversationSlots>,
  locale: string
): AppointmentDraftLike {
  let next = cloneDraft(draft);
  if (extracted.preferredDate) {
    next.requestedDate = extracted.preferredDate;
    next.preferredDateDisplay = extracted.preferredDate;
    if (extracted.preferredWeekday) next.requestedWeekday = extracted.preferredWeekday;
  }
  if (extracted.preferredTime) {
    next = applyTimePreferenceFields(next, extracted, locale);
  }
  return next;
}

function detectSchedulingFields(
  extracted: Partial<ConversationSlots>
): Array<"preferredDate" | "preferredTime"> {
  const fields: Array<"preferredDate" | "preferredTime"> = [];
  if (extracted.preferredDate) fields.push("preferredDate");
  if (extracted.preferredTime) fields.push("preferredTime");
  return fields;
}

function validateSchedulingDraft(params: {
  draft: AppointmentDraftLike;
  dateAmended: boolean;
  timeAmended: boolean;
  rawUserInput: string;
  clinicTimeZone: string;
  now: Date;
  workingHours?: WeeklySchedule | null;
  is24_7?: boolean;
  locale: string;
}): AppointmentDateTimeValidationResult {
  const { draft, dateAmended, timeAmended } = params;

  if (dateAmended && timeAmended && draft.requestedDate && draft.requestedTime) {
    return validateAppointmentDateTime({
      localDate: draft.requestedDate,
      localTime: draft.requestedTime,
      rawUserInput: params.rawUserInput,
      clinicTimeZone: params.clinicTimeZone,
      now: params.now,
      workingHours: params.workingHours ?? null,
      is24_7: params.is24_7,
      minimumNoticeMinutes: 0,
      locale: params.locale,
      resolutionSource: "deterministic_parser",
    });
  }

  if (dateAmended && draft.requestedDate) {
    return validateAppointmentDateOnly({
      localDate: draft.requestedDate,
      rawUserInput: params.rawUserInput,
      clinicTimeZone: params.clinicTimeZone,
      now: params.now,
      workingHours: params.workingHours ?? null,
      is24_7: params.is24_7,
      locale: params.locale,
      resolutionSource: "deterministic_parser",
    });
  }

  if (timeAmended && draft.requestedDate && draft.requestedTime) {
    return validateAppointmentDateTime({
      localDate: draft.requestedDate,
      localTime: draft.requestedTime,
      rawUserInput: params.rawUserInput,
      clinicTimeZone: params.clinicTimeZone,
      now: params.now,
      workingHours: params.workingHours ?? null,
      is24_7: params.is24_7,
      minimumNoticeMinutes: 0,
      locale: params.locale,
      resolutionSource: "deterministic_parser",
    });
  }

  return { ok: true, message: "", suggestions: [], clinicTimeZone: params.clinicTimeZone, clinicTimeZoneSource: "provided" };
}

function buildInvalidDraft(
  original: AppointmentDraftLike,
  dateAmended: boolean,
  timeAmended: boolean,
  validateCtx: {
    clinicTimeZone: string;
    now: Date;
    workingHours?: WeeklySchedule | null;
    is24_7?: boolean;
    locale: string;
  }
): AppointmentDraftLike {
  const cleaned = cloneDraft(original);

  const originalDateOk =
    original.requestedDate &&
    validateAppointmentDateOnly({
      localDate: original.requestedDate,
      clinicTimeZone: validateCtx.clinicTimeZone,
      now: validateCtx.now,
      workingHours: validateCtx.workingHours,
      is24_7: validateCtx.is24_7,
      locale: validateCtx.locale,
    }).ok;

  if (dateAmended) {
    if (originalDateOk) {
      cleaned.requestedDate = original.requestedDate;
      cleaned.preferredDateDisplay = original.preferredDateDisplay;
      cleaned.requestedWeekday = original.requestedWeekday;
    } else {
      delete cleaned.requestedDate;
      delete cleaned.preferredDateDisplay;
      delete cleaned.requestedWeekday;
    }
    if (timeAmended) {
      if (original.requestedTime) {
        cleaned.requestedTime = original.requestedTime;
        cleaned.preferredTimeText = original.preferredTimeText;
      } else {
        delete cleaned.requestedTime;
        delete cleaned.preferredTimeText;
      }
    }
  } else if (timeAmended) {
    cleaned.requestedTime = original.requestedTime;
    cleaned.preferredTimeText = original.preferredTimeText;
  }

  return cleaned;
}

/**
 * Extract scheduling amendments from the latest message, apply atomically, validate.
 */
export function applyAppointmentSchedulingAmendment(params: {
  message: string;
  draft: AppointmentDraftLike;
  extracted?: Partial<ConversationSlots>;
  locale?: string;
  clinicTimeZone: string;
  now?: Date;
  workingHours?: WeeklySchedule | null;
  is24_7?: boolean;
}): SchedulingAmendmentResult {
  const locale = params.locale || "tr";
  const now = params.now ?? new Date();
  const original = cloneDraft(params.draft);
  const raw = String(params.message || "").trim();

  if (!raw) {
    return { outcome: "none", draft: original, amendedFields: [] };
  }

  const extracted =
    params.extracted && (params.extracted.preferredDate || params.extracted.preferredTime)
      ? params.extracted
      : SlotExtractor.extractSlots(raw, {}, locale, params.clinicTimeZone, undefined, now).extracted;

  const amendedFields = detectSchedulingFields(extracted);
  if (amendedFields.length === 0) {
    return { outcome: "none", draft: original, amendedFields: [] };
  }

  const candidate = mergeExtractedScheduling(original, extracted, locale);
  const dateAmended = amendedFields.includes("preferredDate");
  const timeAmended = amendedFields.includes("preferredTime");

  const validation = validateSchedulingDraft({
    draft: candidate,
    dateAmended,
    timeAmended,
    rawUserInput: raw,
    clinicTimeZone: params.clinicTimeZone,
    now,
    workingHours: params.workingHours,
    is24_7: params.is24_7,
    locale,
  });

  if (!validation.ok) {
    return {
      outcome: "invalid",
      draft: buildInvalidDraft(original, dateAmended, timeAmended, {
        clinicTimeZone: params.clinicTimeZone,
        now,
        workingHours: params.workingHours,
        is24_7: params.is24_7,
        locale,
      }),
      amendedFields: [],
      validationReason: validation.reason,
      message: validation.message,
      suggestions: validation.suggestions,
    };
  }

  const nextDraft = cloneDraft(candidate);
  if (validation.resolved?.localDate && dateAmended) {
    nextDraft.requestedDate = validation.resolved.localDate;
    nextDraft.preferredDateDisplay = validation.resolved.localDate;
  }
  if (validation.resolved?.localTime && timeAmended) {
    nextDraft.requestedTime = validation.resolved.localTime;
  }

  return {
    outcome: "applied",
    draft: nextDraft,
    amendedFields,
  };
}

export { clearSchedulingFields };
