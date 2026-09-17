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

export function isAppointmentDraftComplete(
  draft: Partial<AppointmentData> | null | undefined
): boolean {
  if (!draft) return false;
  return (
    ConversationStateEngine.getMissingSlots({
      treatment: draft.requestedService || undefined,
      preferredDate: draft.requestedDate || undefined,
      preferredTime: draft.requestedTime || undefined,
      fullName: draft.patientName || undefined,
      phone: draft.patientPhone || undefined,
      email: draft.patientEmail || undefined,
    }).length === 0
  );
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
