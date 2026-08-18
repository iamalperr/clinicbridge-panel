/**
 * Requested doctor + appointment note: matching, draft preservation,
 * persistence mapping, and clinic notification email.
 */
import { describe, it, expect } from "vitest";
import {
  applyDoctorPreferenceToDraft,
  foldDoctorName,
  matchClinicDoctors,
  resolveDoctorPreference,
  toPersistedRequestedDoctor,
  type ClinicDoctorMatchInput,
} from "../lib/appointment/requestedDoctorPreference";
import {
  applyConfirmationAmendment,
  buildAppointmentReviewMessage,
  type AppointmentDraftLike,
} from "../lib/conversation";
import { buildClinicAppointmentRequestEmailHtml } from "../lib/appointment-notifications";
import type { Appointment } from "../lib/types";
import type { WeeklySchedule } from "../lib/skills/ClinicWorkingHoursResolver";

const FIXED_NOW = new Date("2026-08-19T08:00:00.000Z");
const CLINIC_TZ = "Europe/Istanbul";

const IDA_DOCTORS: ClinicDoctorMatchInput[] = [
  { id: "doc_ahmet", fullName: "Ahmet Yılmaz", title: "Dr.", isActive: true },
  { id: "doc_ahmet_d", fullName: "Ahmet Demir", title: "Dr.", isActive: true },
  { id: "doc_elif", fullName: "Elif Kaya", title: "Dt.", isActive: true },
];

const OTHER_CLINIC_DOCTORS: ClinicDoctorMatchInput[] = [
  { id: "other_selim", fullName: "Selim Koç", title: "Dr.", isActive: true },
];

const IDA_HOURS: WeeklySchedule = {
  monday: ["09:00", "18:00"],
  tuesday: ["09:00", "18:00"],
  wednesday: ["09:00", "18:00"],
  thursday: ["09:00", "18:00"],
  friday: ["09:00", "18:00"],
  saturday: ["10:00", "14:00"],
  sunday: null,
};

const BASE_DRAFT: AppointmentDraftLike = {
  patientName: "Nathan Ashdown",
  patientPhone: "+447700900123",
  patientEmail: "nathan@example.com",
  requestedService: "implant",
  requestedDate: "2026-08-21",
  requestedTime: "14:00",
};

function prefer(message: string, doctors = IDA_DOCTORS, locale = "en") {
  return resolveDoctorPreference({ message, doctors, locale });
}

function amend(message: string, draft: AppointmentDraftLike = BASE_DRAFT) {
  return applyConfirmationAmendment({
    message,
    locale: "en",
    draft,
    clinicTimeZone: CLINIC_TZ,
    now: FIXED_NOW,
    workingHours: IDA_HOURS,
    doctors: IDA_DOCTORS,
  });
}

function clinicEmail(overrides: Partial<Parameters<typeof buildClinicAppointmentRequestEmailHtml>[0]> = {}) {
  return buildClinicAppointmentRequestEmailHtml({
    clinicId: "ida",
    clinicName: "İstanbul Diş Akademisi",
    clinicEmails: ["clinic@example.com"],
    patientName: "Nathan Ashdown",
    patientPhone: "+447700900123",
    patientEmail: "nathan@example.com",
    requestedService: "İmplant",
    requestedDate: "2026-08-21",
    requestedTime: "14:00",
    appointmentId: "appt_1",
    source: "ai_chatbot",
    status: "PENDING_REVIEW",
    ...overrides,
  });
}

describe("Requested doctor matching", () => {
  it("1. exact known doctor with Dr. prefix", () => {
    const res = prefer("I'd like to book with Dr. Ahmet Yılmaz.");
    expect(res.kind).toBe("matched");
    if (res.kind === "matched") {
      expect(res.doctor.id).toBe("doc_ahmet");
      expect(res.doctor.name).toMatch(/Ahmet Yılmaz/);
    }
  });

  it("2. names doctor without Dr. prefix", () => {
    const res = prefer("I'd like to book with Ahmet Yılmaz");
    expect(res.kind).toBe("matched");
    if (res.kind === "matched") expect(res.doctor.id).toBe("doc_ahmet");
  });

  it("3. Turkish character variation (Yılmaz / Yilmaz)", () => {
    expect(foldDoctorName("Ahmet Yılmaz")).toBe(foldDoctorName("Ahmet Yilmaz"));
    const res = prefer("Can I see Dr. Ahmet Yilmaz?");
    expect(res.kind).toBe("matched");
    if (res.kind === "matched") expect(res.doctor.id).toBe("doc_ahmet");
  });

  it("4. doctor + date/time in the same message", () => {
    const res = amend("Can I book for Friday at 2pm with Dr. Ahmet Yılmaz?");
    expect(res.outcome).toBe("applied");
    expect(res.nextDraft.requestedDate).toBe("2026-08-21");
    expect(res.nextDraft.requestedTime).toBe("14:00");
    expect(res.nextDraft.requestedDoctor?.id).toBe("doc_ahmet");
    expect(res.amendedFields).toEqual(expect.arrayContaining(["preferredTime", "requestedDoctor"]));
  });

  it("5. doctor first, date/time later — doctor is preserved", () => {
    const first = applyDoctorPreferenceToDraft({
      draft: { ...BASE_DRAFT },
      message: "I'd like to book with Dr. Ahmet Yılmaz.",
      doctors: IDA_DOCTORS,
      locale: "en",
    });
    expect(first.draft.requestedDoctor?.id).toBe("doc_ahmet");
    const later = applyConfirmationAmendment({
      message: "Friday at 12pm please",
      locale: "en",
      draft: { ...BASE_DRAFT, requestedDoctor: first.draft.requestedDoctor },
      clinicTimeZone: CLINIC_TZ,
      now: FIXED_NOW,
      workingHours: IDA_HOURS,
      doctors: IDA_DOCTORS,
    });
    expect(later.nextDraft.requestedTime).toBe("12:00");
    expect(later.nextDraft.requestedDoctor?.id).toBe("doc_ahmet");
  });

  it("6. time change preserves requested doctor", () => {
    const draft = { ...BASE_DRAFT, requestedDoctor: { id: "doc_ahmet", name: "Dr. Ahmet Yılmaz" } };
    const res = amend("Could we do 12pm instead?", draft);
    expect(res.outcome).toBe("applied");
    expect(res.nextDraft.requestedTime).toBe("12:00");
    expect(res.nextDraft.requestedDoctor).toEqual(draft.requestedDoctor);
  });

  it("7. date change preserves requested doctor", () => {
    const draft = { ...BASE_DRAFT, requestedDoctor: { id: "doc_ahmet", name: "Dr. Ahmet Yılmaz" } };
    const res = amend("Could we do August 20 instead?", draft);
    expect(res.outcome).toBe("applied");
    expect(res.nextDraft.requestedDate).toBe("2026-08-20");
    expect(res.nextDraft.requestedDoctor).toEqual(draft.requestedDoctor);
  });

  it("8. change preferred doctor before submission", () => {
    const draft = { ...BASE_DRAFT, requestedDoctor: { id: "doc_ahmet", name: "Dr. Ahmet Yılmaz" } };
    const res = amend("Can I have Dt. Elif Kaya instead?", draft);
    expect(res.outcome).toBe("applied");
    expect(res.nextDraft.requestedDoctor?.id).toBe("doc_elif");
    expect(res.nextDraft.requestedDate).toBe(BASE_DRAFT.requestedDate);
    expect(res.nextDraft.requestedTime).toBe(BASE_DRAFT.requestedTime);
  });

  it("9. unknown doctor name is not hallucinated", () => {
    const res = prefer("I'd like to book with Dr. Selim Koç.");
    expect(res.kind).toBe("unresolved_note");
    if (res.kind === "unresolved_note") {
      expect(res.note).toMatch(/Selim/i);
    }
    const applied = applyDoctorPreferenceToDraft({
      draft: { ...BASE_DRAFT },
      message: "I'd like to book with Dr. Selim Koç.",
      doctors: IDA_DOCTORS,
      locale: "en",
    });
    expect(applied.draft.requestedDoctor).toBeUndefined();
    expect(applied.draft.notes).toBeTruthy();
    expect(JSON.stringify(applied.draft)).not.toContain("other_selim");
    expect(JSON.stringify(applied.draft)).not.toContain("doc_ahmet");
  });

  it("10. ambiguous first name asks for clarification", () => {
    const res = prefer("Is Dr. Ahmet available on Friday?");
    expect(res.kind).toBe("ambiguous");
    if (res.kind === "ambiguous") {
      expect(res.candidates.length).toBeGreaterThanOrEqual(2);
    }
    const applied = applyDoctorPreferenceToDraft({
      draft: { ...BASE_DRAFT },
      message: "Is Dr. Ahmet available on Friday?",
      doctors: IDA_DOCTORS,
      locale: "en",
    });
    expect(applied.draft.requestedDoctor).toBeUndefined();
    expect(applied.clarification).toMatch(/more than one doctor/i);
  });

  it("11. no doctor preference leaves the field empty", () => {
    const res = prefer("Can I book Friday at 2pm?");
    expect(res.kind).toBe("none");
    const applied = applyDoctorPreferenceToDraft({
      draft: { ...BASE_DRAFT },
      message: "Can I book Friday at 2pm?",
      doctors: IDA_DOCTORS,
      locale: "en",
    });
    expect(applied.draft.requestedDoctor).toBeUndefined();
  });

  it("does not match a doctor from another clinic", () => {
    const hits = matchClinicDoctors("Selim Koç", IDA_DOCTORS);
    expect(hits).toHaveLength(0);
    const otherHits = matchClinicDoctors("Selim Koç", OTHER_CLINIC_DOCTORS);
    expect(otherHits).toHaveLength(1);
  });

  it("unmappable preference is stored as a note, not a fake doctor", () => {
    const res = prefer("I want the female dentist I spoke with last time.");
    expect(res.kind).toBe("unresolved_note");
    const applied = applyDoctorPreferenceToDraft({
      draft: { ...BASE_DRAFT },
      message: "I want the female dentist I spoke with last time.",
      doctors: IDA_DOCTORS,
      locale: "en",
    });
    expect(applied.draft.requestedDoctor).toBeUndefined();
    expect(applied.draft.notes).toBeTruthy();
  });
});

describe("Legacy appointments and persistence", () => {
  it("12. existing appointment without requestedDoctor remains valid", () => {
    const legacy: Partial<Appointment> = {
      id: "legacy_1",
      clinicId: "ida",
      patientName: "Eski Hasta",
      requestedService: "Muayene",
      requestedDate: "2026-01-10",
      status: "pending",
      source: "ai_chatbot",
    };
    expect(legacy.requestedDoctor).toBeUndefined();
    const html = clinicEmail({
      patientName: legacy.patientName!,
      requestedService: legacy.requestedService!,
      requestedDate: legacy.requestedDate!,
      appointmentId: legacy.id!,
    });
    expect(html).toContain("Eski Hasta");
    expect(html).not.toContain("Talep Edilen Doktor");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain(">null<");
  });

  it("17. requested doctor survives persist and retrieve mapping", () => {
    const captured = prefer("I'd like to book with Dr. Ahmet Yılmaz.");
    expect(captured.kind).toBe("matched");
    const stored = toPersistedRequestedDoctor(
      captured.kind === "matched" ? captured.doctor : undefined
    );
    expect(stored).toEqual({ id: "doc_ahmet", name: expect.stringMatching(/Ahmet Yılmaz/) });
    const retrieved: Partial<Appointment> = { requestedDoctor: stored };
    expect(retrieved.requestedDoctor?.id).toBe("doc_ahmet");
    expect(toPersistedRequestedDoctor(undefined)).toBeUndefined();
    expect(toPersistedRequestedDoctor({ name: "  " })).toBeUndefined();
  });
});

describe("Clinic appointment notification email", () => {
  it("13. requested doctor appears in clinic email", () => {
    const html = clinicEmail({
      requestedDoctor: { id: "doc_ahmet", name: "Dr. Ahmet Yılmaz" },
    });
    expect(html).toContain("Talep Edilen Doktor");
    expect(html).toContain("Dr. Ahmet Yılmaz");
    expect(html.indexOf("Talep Edilen Doktor")).toBeGreaterThan(html.indexOf("Hizmet / İşlem"));
    expect(html.indexOf("Talep Edilen Doktor")).toBeLessThan(html.indexOf("Tercih Edilen Tarih"));
  });

  it("14. no requested doctor → email remains valid without empty doctor row", () => {
    const html = clinicEmail();
    expect(html).toContain("Hizmet / İşlem");
    expect(html).toContain("Tercih Edilen Tarih");
    expect(html).not.toContain("Talep Edilen Doktor");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain(">null<");
    expect(html).not.toMatch(/Talep Edilen Doktor[\s\S]*>\s*-\s*</);
  });

  it("15. appointment note appears correctly", () => {
    const html = clinicEmail({
      notes: "Lütfen randevudan önce arayın.",
    });
    expect(html).toContain("Randevu Notu");
    expect(html).toContain("Lütfen randevudan önce arayın.");
  });

  it("16. no appointment note → no empty/broken email row", () => {
    const html = clinicEmail({ notes: "" });
    expect(html).not.toContain("Randevu Notu");
    expect(html).not.toContain("Notlar");
    const htmlUndefined = clinicEmail({ notes: undefined });
    expect(htmlUndefined).not.toContain("Randevu Notu");
  });

  it("does not duplicate structured doctor into the note row", () => {
    const html = clinicEmail({
      requestedDoctor: { id: "doc_ahmet", name: "Dr. Ahmet Yılmaz" },
      notes: "Hasta özellikle Dr. Ahmet Yılmaz ile görüşmek istiyor.",
    });
    expect(html).toContain("Talep Edilen Doktor");
    expect(html).toContain("Dr. Ahmet Yılmaz");
    expect(html).not.toContain("Randevu Notu");
  });
});

describe("Review language does not guarantee doctor availability", () => {
  it("review lists preferred doctor without claiming confirmation", () => {
    const review = buildAppointmentReviewMessage({
      locale: "en",
      appointmentData: {
        ...BASE_DRAFT,
        requestedDoctor: { id: "doc_ahmet", name: "Dr. Ahmet Yılmaz" },
      },
      clinicName: "İstanbul Diş Akademisi",
    });
    expect(review).toContain("Preferred doctor: Dr. Ahmet Yılmaz");
    expect(review).toMatch(/clinic will confirm availability/i);
    expect(review).not.toMatch(/your appointment with Dr\. Ahmet Yılmaz is confirmed/i);
  });

  it("contact and treatment corrections preserve requested doctor", () => {
    const draft = { ...BASE_DRAFT, requestedDoctor: { id: "doc_ahmet", name: "Dr. Ahmet Yılmaz" } };
    const email = amend("please use nathan.updated@example.com", draft);
    expect(email.nextDraft.patientEmail).toBe("nathan.updated@example.com");
    expect(email.nextDraft.requestedDoctor?.id).toBe("doc_ahmet");
    const treatment = amend("make it a consultation instead", draft);
    expect(treatment.nextDraft.requestedDoctor?.id).toBe("doc_ahmet");
  });
});
