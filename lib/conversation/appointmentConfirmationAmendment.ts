/**
 * Confirmation-stage appointment draft amendments.
 *
 * An appointment draft remains mutable until final submission. A patient
 * message at AWAITING_CONFIRMATION / APPOINTMENT_REVIEW is not yes/no-only:
 * date, time, contact, and treatment corrections reuse the same extractors
 * and the same date/time policy as initial collection.
 */

import { SlotExtractor } from "./slotExtractor";
import type { ConversationSlots } from "./types";
import { PendingActionManager } from "./PendingActionManager";
import { IntentRouter } from "./intentRouter";
import {
  validateAppointmentDateTime,
  type AppointmentDateTimeValidationResult,
} from "@/lib/appointment/appointmentDateTimePolicy";
import type { WeeklySchedule } from "@/lib/skills/ClinicWorkingHoursResolver";
import {
  applyDoctorPreferenceToDraft,
  looksLikeDoctorPreference,
  type ClinicDoctorMatchInput,
  type RequestedDoctorPreference,
} from "@/lib/appointment/requestedDoctorPreference";

export type ConfirmationAmendmentField =
  | "preferredDate"
  | "preferredTime"
  | "email"
  | "phone"
  | "fullName"
  | "treatment"
  | "requestedDoctor"
  | "notes";

export type AppointmentDraftLike = {
  patientName?: string;
  patientPhone?: string;
  patientEmail?: string;
  requestedService?: string;
  requestedDate?: string;
  requestedTime?: string | null;
  preferredDateDisplay?: string;
  requestedWeekday?: string;
  requestedDoctor?: RequestedDoctorPreference;
  notes?: string;
};

export type ConfirmationAmendmentOutcome =
  | "applied"
  | "invalid"
  | "unparsed_datetime"
  | "none";

export type ConfirmationAmendmentResult = {
  outcome: ConfirmationAmendmentOutcome;
  nextDraft: AppointmentDraftLike;
  amendedFields: ConfirmationAmendmentField[];
  preservedFields: string[];
  validationReason?: string;
  message?: string;
  suggestions?: AppointmentDateTimeValidationResult["suggestions"];
  doctorAck?: string;
  doctorClarification?: string;
};

const PRESERVED_FIELD_KEYS = [
  "patientName",
  "patientPhone",
  "patientEmail",
  "requestedService",
  "requestedDate",
  "requestedTime",
  "requestedDoctor",
  "notes",
] as const;

const DATETIME_AMENDMENT_RE =
  /\b(\d{1,2}\s*(?:a\.?m\.?|p\.?m\.?)|noon|midday|öğle|ogle|öğlen|o['’]?clock|saat\s*\d{1,2}|\d{1,2}[:.]\d{2}|tomorrow|today|yarın|yarin|bugün|bugun|pazartesi|salı|sali|çarşamba|carsamba|perşembe|persembe|cuma|cumartesi|pazar|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|june|july|august|september|october|november|december|ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)\b/i;

function cloneDraft(draft: AppointmentDraftLike): AppointmentDraftLike {
  return { ...draft };
}

export function looksLikeDateTimeAmendment(message: string): boolean {
  return DATETIME_AMENDMENT_RE.test(String(message || ""));
}

export function detectConfirmationAmendmentFields(
  extracted: Partial<ConversationSlots>
): ConfirmationAmendmentField[] {
  const fields: ConfirmationAmendmentField[] = [];
  if (extracted.preferredTime) fields.push("preferredTime");
  if (extracted.preferredDate) fields.push("preferredDate");
  if (extracted.email) fields.push("email");
  if (extracted.phone) fields.push("phone");
  if (extracted.fullName) fields.push("fullName");
  if (extracted.treatment) fields.push("treatment");
  return fields;
}

function applySlotsToDraft(
  draft: AppointmentDraftLike,
  extracted: Partial<ConversationSlots>
): AppointmentDraftLike {
  const next = cloneDraft(draft);
  if (extracted.preferredTime) next.requestedTime = extracted.preferredTime;
  if (extracted.preferredDate) {
    next.requestedDate = extracted.preferredDate;
    next.preferredDateDisplay = extracted.preferredDate;
    if (extracted.preferredWeekday) next.requestedWeekday = extracted.preferredWeekday;
  }
  if (extracted.email) next.patientEmail = extracted.email;
  if (extracted.phone) next.patientPhone = extracted.phone;
  if (extracted.fullName) next.patientName = extracted.fullName;
  if (extracted.treatment) next.requestedService = extracted.treatment;
  return next;
}

function preservedFieldList(
  before: AppointmentDraftLike,
  after: AppointmentDraftLike,
  amended: ConfirmationAmendmentField[]
): string[] {
  const mapped: Record<ConfirmationAmendmentField, string> = {
    preferredDate: "requestedDate",
    preferredTime: "requestedTime",
    email: "patientEmail",
    phone: "patientPhone",
    fullName: "patientName",
    treatment: "requestedService",
    requestedDoctor: "requestedDoctor",
    notes: "notes",
  };
  const changedKeys = new Set(amended.map((f) => mapped[f]));
  return PRESERVED_FIELD_KEYS.filter((key) => {
    if (changedKeys.has(key)) return false;
    if (key === "requestedDoctor") {
      return JSON.stringify(before.requestedDoctor || null) === JSON.stringify(after.requestedDoctor || null);
    }
    return String(before[key] ?? "") === String(after[key] ?? "");
  });
}

function unparsedDateTimeMessage(locale: string): string {
  if (locale.toLowerCase().startsWith("en")) {
    return "I could not read a valid appointment time from that. Please share a future time, for example 12:00 PM or 14:00.";
  }
  return "Geçerli bir randevu saati anlayamadım. Lütfen gelecek bir saat paylaşın, örneğin 12:00 veya 14:00.";
}

/**
 * Apply a confirmation-stage amendment. Date/time changes go through
 * validateAppointmentDateTime — the same policy as initial collection / submit.
 * Invalid values are rejected; unrelated valid fields are left intact.
 */
export function applyConfirmationAmendment(params: {
  message: string;
  locale?: string;
  draft: AppointmentDraftLike;
  extracted?: Partial<ConversationSlots>;
  clinicTimeZone: string;
  now?: Date;
  workingHours?: WeeklySchedule | null;
  is24_7?: boolean;
  doctors?: ClinicDoctorMatchInput[];
}): ConfirmationAmendmentResult {
  const locale = params.locale || "tr";
  const original = cloneDraft(params.draft);
  const raw = String(params.message || "").trim();

  if (!raw) {
    return {
      outcome: "none",
      nextDraft: original,
      amendedFields: [],
      preservedFields: [...PRESERVED_FIELD_KEYS],
    };
  }

  if (PendingActionManager.isConfirmation(raw) || PendingActionManager.isRejection(raw)) {
    return {
      outcome: "none",
      nextDraft: original,
      amendedFields: [],
      preservedFields: [...PRESERVED_FIELD_KEYS],
    };
  }

  const question = IntentRouter.isInformationalQuestion(raw.toLowerCase());
  if (
    question.isQuestion &&
    !looksLikeDateTimeAmendment(raw) &&
    !looksLikeDoctorPreference(raw)
  ) {
    return {
      outcome: "none",
      nextDraft: original,
      amendedFields: [],
      preservedFields: [...PRESERVED_FIELD_KEYS],
    };
  }

  const extracted =
    params.extracted && Object.keys(params.extracted).length > 0
      ? params.extracted
      : SlotExtractor.extractSlots(raw, {}, locale, params.clinicTimeZone || "Europe/Istanbul").extracted;

  const amendedFields = detectConfirmationAmendmentFields(extracted);
  const doctorPref = applyDoctorPreferenceToDraft({
    draft: original,
    message: raw,
    doctors: params.doctors || [],
    locale,
  });

  if (amendedFields.length === 0 && !doctorPref.changed && !doctorPref.clarification) {
    if (looksLikeDateTimeAmendment(raw)) {
      return {
        outcome: "unparsed_datetime",
        nextDraft: original,
        amendedFields: [],
        preservedFields: [...PRESERVED_FIELD_KEYS],
        validationReason: "UNPARSED_DATETIME",
        message: unparsedDateTimeMessage(locale),
      };
    }
    return {
      outcome: "none",
      nextDraft: original,
      amendedFields: [],
      preservedFields: [...PRESERVED_FIELD_KEYS],
    };
  }

  const nextDraft = applySlotsToDraft(
    { ...original, requestedDoctor: doctorPref.draft.requestedDoctor, notes: doctorPref.draft.notes },
    extracted
  );
  if (doctorPref.changed) {
    if (doctorPref.outcome.kind === "matched") amendedFields.push("requestedDoctor");
    if (doctorPref.outcome.kind === "unresolved_note") amendedFields.push("notes");
  }

  const dateOrTimeChanged =
    amendedFields.includes("preferredDate") || amendedFields.includes("preferredTime");

  if (dateOrTimeChanged) {
    const policy = validateAppointmentDateTime({
      localDate: nextDraft.requestedDate,
      localTime: nextDraft.requestedTime || "",
      rawUserInput: raw,
      clinicTimeZone: params.clinicTimeZone,
      now: params.now ?? new Date(),
      workingHours: params.workingHours ?? null,
      is24_7: params.is24_7,
      minimumNoticeMinutes: 0,
      locale,
      resolutionSource: "deterministic_parser",
    });

    if (!policy.ok) {
      return {
        outcome: "invalid",
        nextDraft: original,
        amendedFields: [],
        preservedFields: [...PRESERVED_FIELD_KEYS],
        validationReason: policy.reason,
        message: policy.message,
        suggestions: policy.suggestions,
      };
    }

    if (policy.resolved?.localDate) nextDraft.requestedDate = policy.resolved.localDate;
    if (policy.resolved?.localTime) nextDraft.requestedTime = policy.resolved.localTime;
  }

  return {
    outcome: "applied",
    nextDraft,
    amendedFields,
    preservedFields: preservedFieldList(original, nextDraft, amendedFields),
    doctorAck: doctorPref.ack,
    doctorClarification: doctorPref.clarification,
    message: doctorPref.clarification,
  };
}
