import { ConversationStateEngine } from "@/lib/conversation";
import type { AppointmentData } from "./types";

export function safeMergeDraft(
  currentDraft: Partial<AppointmentData>,
  llmExtractedData?: Partial<AppointmentData>
): Partial<AppointmentData> {
  if (!llmExtractedData) return currentDraft;
  const merged = { ...currentDraft };
  for (const key in llmExtractedData) {
    const val = (llmExtractedData as any)[key];
    if (val !== null && val !== undefined && val !== "") {
      (merged as any)[key] = val;
    }
  }
  return merged;
}

export function normalizeIncomingAppointmentDraft(
  raw: Record<string, any> | null | undefined
): Partial<AppointmentData> {
  if (!raw || typeof raw !== "object") return {};
  const out: Partial<AppointmentData> = { ...raw } as Partial<AppointmentData>;
  if (!out.requestedService && (raw.treatmentType || raw.treatment || raw.service)) {
    out.requestedService = raw.treatmentType || raw.treatment || raw.service;
  }
  if (!out.requestedDate && (raw.preferredDate || raw.date)) {
    out.requestedDate = raw.preferredDate || raw.date;
  }
  if (out.requestedTime == null && (raw.preferredTime || raw.time)) {
    out.requestedTime = raw.preferredTime || raw.time;
  }
  if (!out.patientEmail && raw.email) out.patientEmail = raw.email;
  if (!out.patientPhone && raw.phone) out.patientPhone = raw.phone;
  if (!out.patientName && (raw.fullName || raw.name)) {
    out.patientName = raw.fullName || raw.name;
  }
  return out;
}

/** Email as it may leave the draft: never a value the patient explicitly declined to give. */
export function draftPatientEmail(draft: Partial<AppointmentData> | null | undefined): string | undefined {
  if (!draft || draft.emailDisposition === "DECLINED") return undefined;
  return draft.patientEmail || undefined;
}

export type AppointmentDraftFieldLifecycle =
  | "PER_APPOINTMENT_RESET"
  | "SAFE_CONVERSATION_CONTEXT_CARRY_FORWARD"
  | "SYSTEM_METADATA";

/**
 * What happens to each draft field when a new independent appointment starts. Keyed by every
 * AppointmentData field so a new field cannot ship unclassified; untyped extras (startsAtUtc,
 * requestedWeekday, …) are never copied. Nothing carries forward: there is no product
 * requirement for it, and a second appointment may be for another person or another visit.
 */
export const APPOINTMENT_DRAFT_FIELD_LIFECYCLE: Record<keyof AppointmentData, AppointmentDraftFieldLifecycle> = {
  patientName: "PER_APPOINTMENT_RESET",
  patientPhone: "PER_APPOINTMENT_RESET",
  patientPhoneRaw: "PER_APPOINTMENT_RESET",
  patientEmail: "PER_APPOINTMENT_RESET",
  requestedService: "PER_APPOINTMENT_RESET",
  requestedDate: "PER_APPOINTMENT_RESET",
  preferredDateDisplay: "PER_APPOINTMENT_RESET",
  pendingAppointmentDate: "PER_APPOINTMENT_RESET",
  requestedTime: "PER_APPOINTMENT_RESET",
  preferredTimeStart: "PER_APPOINTMENT_RESET",
  preferredTimeEnd: "PER_APPOINTMENT_RESET",
  preferredTimePeriod: "PER_APPOINTMENT_RESET",
  preferredTimeText: "PER_APPOINTMENT_RESET",
  timezone: "PER_APPOINTMENT_RESET",
  originalText: "PER_APPOINTMENT_RESET",
  emailDisposition: "PER_APPOINTMENT_RESET",
  emailValidationFails: "PER_APPOINTMENT_RESET",
  requestedDoctor: "PER_APPOINTMENT_RESET",
  notes: "PER_APPOINTMENT_RESET",
};

/** Draft for a new independent appointment: only non-reset fields survive from `previous`. */
export function createFreshAppointmentDraft(
  previous?: Partial<AppointmentData> | null
): Partial<AppointmentData> {
  const fresh: Partial<AppointmentData> = { emailDisposition: "UNSET", emailValidationFails: 0 };
  for (const key of Object.keys(APPOINTMENT_DRAFT_FIELD_LIFECYCLE) as Array<keyof AppointmentData>) {
    if (APPOINTMENT_DRAFT_FIELD_LIFECYCLE[key] !== "PER_APPOINTMENT_RESET" && previous?.[key] !== undefined) {
      (fresh as Record<string, unknown>)[key] = previous[key];
    }
  }
  return fresh;
}

/** True when a draft holds anything beyond the values of a freshly created one. */
export function hasAppointmentDraftContent(draft: Partial<AppointmentData> | null | undefined): boolean {
  return Object.entries(draft || {}).some(
    ([key, value]) =>
      value !== undefined &&
      !(key === "emailDisposition" && value === "UNSET") &&
      !(key === "emailValidationFails" && value === 0)
  );
}

/**
 * Persisted on the conversation log when a draft is closed by cancel or replaced by a new
 * appointment. `afterAppointmentId` is the conversation appointmentId at that moment: from then
 * on it belongs to a closed draft, not to the one being collected.
 */
export interface AppointmentDraftBoundary {
  reason: "NEW_APPOINTMENT" | "CANCELLED";
  afterAppointmentId: string | null;
  at: string;
}

export function parseAppointmentDraftBoundary(raw: unknown): AppointmentDraftBoundary | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (b.reason !== "NEW_APPOINTMENT" && b.reason !== "CANCELLED") return null;
  return {
    reason: b.reason,
    afterAppointmentId: typeof b.afterAppointmentId === "string" && b.afterAppointmentId ? b.afterAppointmentId : null,
    at: typeof b.at === "string" ? b.at : "",
  };
}

/**
 * True when the conversation's appointmentId belongs to an earlier, completed appointment and
 * the draft now being collected was opened afterwards by an explicit new booking. Creating the
 * current draft's appointment replaces appointmentId, which makes this false again.
 */
export function isLoadedAppointmentFromClosedDraft(
  boundary: AppointmentDraftBoundary | null,
  loadedAppointmentId: string | null
): boolean {
  return (
    boundary?.reason === "NEW_APPOINTMENT" &&
    Boolean(loadedAppointmentId) &&
    boundary.afterAppointmentId === loadedAppointmentId
  );
}

/** Required-slot view of a draft, shared by every completeness / next-question check. */
export function appointmentDraftSlots(draft: Partial<AppointmentData> | null | undefined) {
  return {
    treatment: draft?.requestedService || undefined,
    preferredDate: draft?.requestedDate || undefined,
    preferredTime: draft?.requestedTime || undefined,
    fullName: draft?.patientName || undefined,
    phone: draft?.patientPhone || undefined,
    email: draftPatientEmail(draft),
    emailDeclined: draft?.emailDisposition === "DECLINED",
  };
}

export function isAppointmentDraftComplete(
  draft: Partial<AppointmentData> | null | undefined
): boolean {
  if (!draft) return false;
  return ConversationStateEngine.getMissingSlots(appointmentDraftSlots(draft)).length === 0;
}

export function mergeAppointmentDraftSources(
  ...sources: Array<Partial<AppointmentData> | Record<string, any> | null | undefined>
): Partial<AppointmentData> {
  let merged: Partial<AppointmentData> = {};
  for (const src of sources) {
    if (!src) continue;
    merged = safeMergeDraft(merged, normalizeIncomingAppointmentDraft(src));
  }
  return merged;
}
