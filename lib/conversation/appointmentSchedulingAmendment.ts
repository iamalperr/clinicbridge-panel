/**
 * Appointment scheduling amendments during collection and confirmation.
 *
 * Order: extract → canonical resolve → apply to draft → validate changed scheduling fields.
 * Latest explicit user message always wins over stale draft scheduling state.
 *
 * Pending month invariant:
 *   pendingAppointmentDate existing is NOT enough to treat a bare number as a day.
 *   Bare day completion requires awaitingDayReply === true AND expectedSlot === "preferredDate".
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
import {
  isBareDayOfMonthMessage,
  markPendingDayEligible,
  markPendingDayIneligible,
  withPendingDayEligibility,
  type PendingAppointmentDate,
} from "@/lib/appointment/canonicalAppointmentDate";

export type SchedulingAmendmentOutcome = "applied" | "invalid" | "none" | "partial_month";

export type SchedulingAmendmentResult = {
  outcome: SchedulingAmendmentOutcome;
  draft: AppointmentDraftLike;
  amendedFields: Array<"preferredDate" | "preferredTime">;
  validationReason?: string;
  message?: string;
  suggestions?: AppointmentDateTimeValidationResult["suggestions"];
};

const MONTH_LABEL_EN: Record<number, string> = {
  1: "January",
  2: "February",
  3: "March",
  4: "April",
  5: "May",
  6: "June",
  7: "July",
  8: "August",
  9: "September",
  10: "October",
  11: "November",
  12: "December",
};

const MONTH_LABEL_TR: Record<number, string> = {
  1: "Ocak",
  2: "Şubat",
  3: "Mart",
  4: "Nisan",
  5: "Mayıs",
  6: "Haziran",
  7: "Temmuz",
  8: "Ağustos",
  9: "Eylül",
  10: "Ekim",
  11: "Kasım",
  12: "Aralık",
};

/**
 * Explicitly resume day collection for an existing pending month
 * (e.g. after an interruption, when the assistant re-asks for the day).
 */
export function reactivatePendingAppointmentDay(
  draft: AppointmentDraftLike
): AppointmentDraftLike {
  if (!draft.pendingAppointmentDate) return { ...draft };
  return {
    ...draft,
    pendingAppointmentDate: markPendingDayEligible(
      draft.pendingAppointmentDate as PendingAppointmentDate
    ),
  };
}

/**
 * Mark pending month so bare numerals can no longer complete it.
 * Keeps month/year context for later explicit date/month refresh.
 */
export function invalidatePendingAppointmentDayReply(
  draft: AppointmentDraftLike
): AppointmentDraftLike {
  if (!draft.pendingAppointmentDate) return { ...draft };
  return {
    ...draft,
    pendingAppointmentDate: markPendingDayIneligible(
      draft.pendingAppointmentDate as PendingAppointmentDate
    ),
  };
}

/**
 * Non-date / topic turns that must make bare-day completion ineligible.
 * Does not clear the pending month itself.
 */
function shouldInvalidatePendingDayEligibility(
  raw: string,
  extracted: Partial<ConversationSlots>
): boolean {
  if (extracted.preferredDate || extracted.pendingAppointmentDate || extracted.invalidCivilDate) {
    return false;
  }
  // Bare day attempts are gated by eligibility — do not auto-stale solely for "5".
  if (isBareDayOfMonthMessage(raw) != null) {
    return false;
  }

  if (extracted.treatment || extracted.informationType) {
    return true;
  }

  const lower = raw.toLowerCase();
  if (
    /\b(\d+)\s*(implants?|veneers?|fillings?|crowns?|teeth|tooth)\b/i.test(lower) ||
    /\b(tooth|diş|dis)\s*#?\s*\d+\b/i.test(lower) ||
    /\b(age|yaş|yas)\s*\d+\b/i.test(lower) ||
    /\b(number|numara)\s*\d+\b/i.test(lower)
  ) {
    return true;
  }

  if (
    /\b(implant|veneer|whitening|price|cost|fiyat|ücret|ucret|how long|weekend|weekends|open|hours|çalışma|calisma|bilgi|information about|tell me about)\b/i.test(
      lower
    )
  ) {
    return true;
  }

  return false;
}

function cloneDraft(draft: AppointmentDraftLike): AppointmentDraftLike {
  return { ...draft };
}

function clearSchedulingFields(draft: AppointmentDraftLike): AppointmentDraftLike {
  const next = cloneDraft(draft);
  delete next.requestedDate;
  delete next.preferredDateDisplay;
  delete next.requestedWeekday;
  delete next.requestedTime;
  delete next.pendingAppointmentDate;
  return next;
}

function askForDayMessage(
  pending: NonNullable<AppointmentDraftLike["pendingAppointmentDate"]>,
  locale: string
): string {
  const isEn = locale.toLowerCase().startsWith("en");
  const monthLabel = isEn
    ? MONTH_LABEL_EN[pending.month] || String(pending.month)
    : MONTH_LABEL_TR[pending.month] || String(pending.month);
  if (isEn) {
    return `Which day in ${monthLabel} ${pending.year} works for you?`;
  }
  return `${monthLabel} ${pending.year} ayının hangi günü uygun olur?`;
}

function invalidCivilDateMessage(locale: string): string {
  const isEn = locale.toLowerCase().startsWith("en");
  return isEn
    ? "That date is not a valid calendar day. Please share a real day and month."
    : "Bu tarih geçerli bir takvim günü değil. Lütfen gerçek bir gün ve ay belirtin.";
}

function applyTimePreferenceFields(
  draft: AppointmentDraftLike,
  extracted: Partial<ConversationSlots>,
  _locale: string
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
    delete next.pendingAppointmentDate;
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

  return {
    ok: true,
    message: "",
    suggestions: [],
    clinicTimeZone: params.clinicTimeZone,
    clinicTimeZoneSource: "provided",
  };
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

function resolveExtractedSlots(params: {
  message: string;
  draft: AppointmentDraftLike;
  extracted?: Partial<ConversationSlots>;
  locale: string;
  clinicTimeZone: string;
  now: Date;
  expectedSlot?: string;
}): Partial<ConversationSlots> {
  const hasUsableExtracted =
    params.extracted &&
    (params.extracted.preferredDate ||
      params.extracted.preferredTime ||
      params.extracted.pendingAppointmentDate ||
      params.extracted.invalidCivilDate);

  if (hasUsableExtracted) {
    return params.extracted!;
  }

  return SlotExtractor.extractSlots(
    params.message,
    {
      pendingAppointmentDate: params.draft.pendingAppointmentDate,
      preferredDate: params.draft.requestedDate,
    },
    params.locale,
    params.clinicTimeZone,
    params.expectedSlot,
    params.now
  ).extracted;
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
  /** Active collection slot — required for bare-day completion eligibility. */
  expectedSlot?: string;
}): SchedulingAmendmentResult {
  const locale = params.locale || "tr";
  const now = params.now ?? new Date();
  const original = cloneDraft(params.draft);
  const raw = String(params.message || "").trim();

  if (!raw) {
    return { outcome: "none", draft: original, amendedFields: [] };
  }

  // Resolved date + collecting time: never keep a consumable pending month
  if (
    original.requestedDate &&
    original.pendingAppointmentDate &&
    params.expectedSlot === "preferredTime"
  ) {
    delete original.pendingAppointmentDate;
  }

  const extracted = resolveExtractedSlots({
    message: raw,
    draft: original,
    extracted: params.extracted,
    locale,
    clinicTimeZone: params.clinicTimeZone,
    now,
    expectedSlot: params.expectedSlot,
  });

  if (extracted.invalidCivilDate) {
    return {
      outcome: "invalid",
      draft: original,
      amendedFields: [],
      validationReason: "INVALID_DATE",
      message: invalidCivilDateMessage(locale),
      suggestions: [],
    };
  }

  if (extracted.pendingAppointmentDate && !extracted.preferredDate) {
    const nextDraft = cloneDraft(original);
    nextDraft.pendingAppointmentDate = withPendingDayEligibility(
      extracted.pendingAppointmentDate as PendingAppointmentDate,
      true
    );
    delete nextDraft.requestedDate;
    delete nextDraft.preferredDateDisplay;
    delete nextDraft.requestedWeekday;
    return {
      outcome: "partial_month",
      draft: nextDraft,
      amendedFields: [],
      message: askForDayMessage(nextDraft.pendingAppointmentDate!, locale),
    };
  }

  // Topic / treatment turns must make bare-day completion ineligible even if a
  // time token was also parsed from the same message.
  let draftBase = original;
  if (
    original.pendingAppointmentDate?.awaitingDayReply &&
    !extracted.preferredDate &&
    !extracted.pendingAppointmentDate &&
    shouldInvalidatePendingDayEligibility(raw, extracted)
  ) {
    draftBase = invalidatePendingAppointmentDayReply(original);
  }

  const amendedFields = detectSchedulingFields(extracted);
  if (amendedFields.length === 0) {
    return { outcome: "none", draft: draftBase, amendedFields: [] };
  }

  const candidate = mergeExtractedScheduling(draftBase, extracted, locale);
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
    delete nextDraft.pendingAppointmentDate;
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
