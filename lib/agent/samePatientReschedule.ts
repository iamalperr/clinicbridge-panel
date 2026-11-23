/**
 * Same-patient post-submit reschedule helpers.
 * Carry over known slots from the prior preliminary request; only replace what the patient changed.
 */
import { matchCanonicalTreatmentId } from "@/lib/conversation/appointmentContextCarryForward";
import { formatLocalizedDate, formatLocalizedTime, formatLocalizedTreatment } from "@/lib/conversation/formatters";
import type { AppointmentData } from "./types";

export type LastSubmittedAppointment = {
  patientName?: string;
  patientPhone?: string;
  patientEmail?: string;
  emailDisposition?: AppointmentData["emailDisposition"];
  requestedService?: string;
  requestedDoctor?: AppointmentData["requestedDoctor"];
  notes?: string;
  requestedDate?: string;
  requestedTime?: string;
};

const GENERIC_VISIT_IDS = new Set([
  "general",
  "general_consultation",
  "consultation",
  "checkup",
  "check-up",
  "muayene",
  "kontrol",
]);

/** ASCII-fold Turkish so regex /i matching is reliable for ı/İ. */
function foldTr(value: string): string {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .trim();
}

export function buildLastSubmittedAppointmentSnapshot(
  draft: Partial<AppointmentData> | null | undefined
): LastSubmittedAppointment | null {
  if (!draft) return null;
  const snap: LastSubmittedAppointment = {};
  if (draft.patientName) snap.patientName = draft.patientName;
  if (draft.patientPhone) snap.patientPhone = draft.patientPhone;
  if (draft.patientEmail) snap.patientEmail = draft.patientEmail;
  if (draft.emailDisposition) snap.emailDisposition = draft.emailDisposition;
  if (draft.requestedService) snap.requestedService = draft.requestedService;
  if (draft.requestedDoctor) snap.requestedDoctor = draft.requestedDoctor;
  if (draft.notes) snap.notes = draft.notes;
  if (draft.requestedDate) snap.requestedDate = draft.requestedDate;
  if (draft.requestedTime) snap.requestedTime = draft.requestedTime;
  return Object.keys(snap).length > 0 ? snap : null;
}

/** Prefer an explicit snapshot; fall back to log fields left after conversion. */
export function resolveLastSubmittedAppointment(log: Record<string, any> | null | undefined): LastSubmittedAppointment | null {
  if (!log) return null;
  const snap = log.lastSubmittedAppointment;
  if (snap && typeof snap === "object") {
    const fromSnap = buildLastSubmittedAppointmentSnapshot(snap as Partial<AppointmentData>);
    if (fromSnap) return fromSnap;
  }
  const pending = log.pendingAppointmentData;
  const draft = log.appointmentDraft;
  return buildLastSubmittedAppointmentSnapshot({
    patientName: log.patientName || draft?.patientName || pending?.patientName,
    patientPhone: log.patientPhone || draft?.patientPhone || pending?.patientPhone,
    patientEmail: log.patientEmail || draft?.patientEmail || pending?.patientEmail,
    emailDisposition: draft?.emailDisposition,
    requestedService:
      draft?.requestedService ||
      pending?.treatmentType ||
      pending?.requestedService ||
      log.requestedService,
    requestedDoctor: draft?.requestedDoctor || pending?.requestedDoctor,
    notes: draft?.notes || pending?.notes,
    requestedDate: draft?.requestedDate || pending?.preferredDate || log.requestedDate,
    requestedTime: draft?.requestedTime || pending?.preferredTime || log.requestedTime,
  });
}

export function detectSameTreatmentReference(message: string): boolean {
  const t = foldTr(message);
  return (
    /^(ayni\s*tedavi|aynisi|ayni\s*islem|onceki\s*gibi|same\s*treatment|same\s*as\s*before|same\s*procedure|same\s*one)([.!?\s]|$)/.test(
      t
    ) ||
    /(^|\s)(ayni\s*tedavi|aynisi|ayni\s*islem|onceki\s*gibi|same\s*treatment|same\s*as\s*before)([.!?\s]|$)/.test(t)
  );
}

function isGenericVisitTreatment(service: string | null | undefined): boolean {
  if (!service || !String(service).trim()) return false;
  const id = matchCanonicalTreatmentId(service) || normalizeLoose(service);
  return GENERIC_VISIT_IDS.has(id) || /\b(genel\s*)?(muayene|konsültasyon|consultation|check[- ]?up)\b/i.test(service);
}

function normalizeLoose(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Booking idioms like "muayene için gelebilir miyim" extract a generic visit treatment.
 * On a same-patient date/time update, that must not wipe a known specific treatment
 * (e.g. implant). An explicit different treatment in the message still wins.
 */
export function shouldApplyExtractedTreatmentOnReschedule(params: {
  previousService?: string | null;
  extractedTreatment?: string | null;
}): boolean {
  const extracted = params.extractedTreatment ? String(params.extractedTreatment).trim() : "";
  if (!extracted) return false;
  const previous = params.previousService ? String(params.previousService).trim() : "";
  if (!previous) return true;
  if (isGenericVisitTreatment(extracted) && !isGenericVisitTreatment(previous)) return false;
  return true;
}

function emailDispositionUnset(value: AppointmentData["emailDisposition"] | undefined): boolean {
  return !value || value === "UNSET";
}

/** Seed carried-over fields into a freshly cleared draft for a same-patient date/time update. */
export function applySamePatientRescheduleCarryover(
  draft: Partial<AppointmentData>,
  prior: LastSubmittedAppointment | null
): void {
  if (!prior) return;
  if (!draft.patientName && prior.patientName) draft.patientName = prior.patientName;
  if (!draft.patientPhone && prior.patientPhone) draft.patientPhone = prior.patientPhone;
  if (prior.emailDisposition === "DECLINED" && emailDispositionUnset(draft.emailDisposition)) {
    draft.emailDisposition = "DECLINED";
    draft.patientEmail = "";
  } else if (!draft.patientEmail && prior.patientEmail) {
    draft.patientEmail = prior.patientEmail;
    draft.emailDisposition = "PROVIDED";
  }
  if (!draft.requestedService && prior.requestedService) draft.requestedService = prior.requestedService;
  if (!draft.requestedDoctor && prior.requestedDoctor) draft.requestedDoctor = prior.requestedDoctor;
  if (!draft.notes && prior.notes) draft.notes = prior.notes;
}

export function formatRescheduleConfirmationMessage(params: {
  locale?: string | null;
  appointmentData: Partial<AppointmentData>;
  timeZone?: string;
}): string {
  const locale = String(params.locale || "tr").toLowerCase();
  const draft = params.appointmentData;
  const tz = params.timeZone || "Europe/Istanbul";
  const treatment = formatLocalizedTreatment(draft.requestedService, locale) || draft.requestedService || "-";
  const date = formatLocalizedDate(draft.requestedDate, locale, tz);
  const time = formatLocalizedTime(draft.requestedTime || "", locale);

  if (locale.startsWith("en")) {
    return (
      `I'm updating your preliminary appointment request to ${date} at ${time}: ${treatment}. ` +
      `Do you confirm?`
    );
  }
  if (locale.startsWith("de")) {
    return (
      `Ich aktualisiere Ihre vorläufige Terminanfrage auf ${date} um ${time}: ${treatment}. ` +
      `Bestätigen Sie?`
    );
  }
  return (
    `Ön randevu talebinizi ${date} saat ${time} olarak güncelliyorum: ${treatment}. ` +
    `Onaylıyor musunuz?`
  );
}

export function formatSameTreatmentMissingClarification(locale?: string | null): string {
  const lang = String(locale || "tr").toLowerCase();
  if (lang.startsWith("en")) {
    return "I couldn't find a treatment on your previous request. Which treatment or procedure should I use?";
  }
  if (lang.startsWith("de")) {
    return "In Ihrer vorherigen Anfrage finde ich keine Behandlung. Welche Behandlung oder welchen Eingriff soll ich verwenden?";
  }
  return "Önceki talebinizde kayıtlı bir tedavi bulamadım. Hangi tedavi veya işlem için güncelleyelim?";
}
