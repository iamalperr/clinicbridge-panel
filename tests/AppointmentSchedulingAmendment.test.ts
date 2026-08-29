/**
 * Early appointment scheduling validation + atomic date/time corrections.
 */
import { describe, it, expect } from "vitest";
import {
  SlotExtractor,
  applyAppointmentSchedulingAmendment,
  applyConfirmationAmendment,
  ConversationStateEngine,
  evaluateAppointmentCollectionGate,
  type AppointmentDraftLike,
} from "../lib/conversation";
import {
  validateAppointmentDateOnly,
} from "../lib/appointment/appointmentDateTimePolicy";
import type { WeeklySchedule } from "../lib/skills/ClinicWorkingHoursResolver";

const CLINIC_TZ = "Europe/Istanbul";

/** Saturday 29 Aug 2026, 10:00 clinic-local — day before the production Sunday case. */
const FIXED_NOW = new Date("2026-08-29T07:00:00.000Z");

const PRODUCTION_HOURS: WeeklySchedule = {
  monday: ["10:00", "19:00"],
  tuesday: ["10:00", "19:00"],
  wednesday: ["10:00", "19:00"],
  thursday: ["10:00", "19:00"],
  friday: ["10:00", "19:00"],
  saturday: ["10:00", "17:00"],
  sunday: null,
};

function schedule(
  message: string,
  draft: AppointmentDraftLike = {},
  now = FIXED_NOW
) {
  return applyAppointmentSchedulingAmendment({
    message,
    draft,
    locale: "en",
    clinicTimeZone: CLINIC_TZ,
    now,
    workingHours: PRODUCTION_HOURS,
  });
}

function extract(message: string, now = FIXED_NOW) {
  return SlotExtractor.extractSlots(message, {}, "en", CLINIC_TZ, undefined, now);
}

describe("SlotExtractor weekday + combined date/time parsing", () => {
  it("parses 30th August as 2026-08-30 (Sunday)", () => {
    const { extracted } = extract("30th August");
    expect(extracted.preferredDate).toBe("2026-08-30");
  });

  it("parses Saturday 3pm as date + 15:00 atomically", () => {
    const { extracted } = extract("Saturday 3pm");
    expect(extracted.preferredDate).toBe("2026-08-29");
    expect(extracted.preferredTime).toBe("15:00");
  });

  it("parses next Saturday deterministically", () => {
    const { extracted } = extract("next Saturday");
    expect(extracted.preferredDate).toBe("2026-09-05");
  });

  it("parses Monday morning as date + morning period", () => {
    const { extracted } = extract("Actually Monday morning");
    expect(extracted.preferredDate).toBe("2026-08-31");
    expect(extracted.preferredTime).toBeTruthy();
  });
});

describe("validateAppointmentDateOnly", () => {
  it("rejects closed Sunday with nearby alternatives", () => {
    const res = validateAppointmentDateOnly({
      localDate: "2026-08-30",
      clinicTimeZone: CLINIC_TZ,
      now: FIXED_NOW,
      workingHours: PRODUCTION_HOURS,
      locale: "en",
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("CLOSED_DAY");
    expect(res.message).toMatch(/closed on Sunday/i);
    expect(res.message).toMatch(/Saturday|Monday/i);
  });

  it("rejects past dates immediately", () => {
    const res = validateAppointmentDateOnly({
      localDate: "2026-08-28",
      clinicTimeZone: CLINIC_TZ,
      now: FIXED_NOW,
      workingHours: PRODUCTION_HOURS,
      locale: "en",
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("PAST_DATE");
  });
});

describe("Early scheduling validation during collection", () => {
  it("1. closed Sunday (30th August) → immediate rejection, date not persisted", () => {
    const res = schedule("30th August");
    expect(res.outcome).toBe("invalid");
    expect(res.validationReason).toBe("CLOSED_DAY");
    expect(res.draft.requestedDate).toBeUndefined();
    expect(res.draft.requestedTime).toBeUndefined();
    expect(res.message).toMatch(/closed on Sunday/i);
  });

  it("2. existing Sunday draft + Saturday → date becomes Saturday", () => {
    const res = schedule("Saturday", { requestedDate: "2026-08-30", requestedTime: "10:00" });
    expect(res.outcome).toBe("applied");
    expect(res.draft.requestedDate).toBe("2026-08-29");
  });

  it("3. existing Sunday + morning + Saturday 3pm → Saturday + 15:00", () => {
    const res = schedule("Saturday 3pm", {
      requestedDate: "2026-08-30",
      requestedTime: "10:00",
    });
    expect(res.outcome).toBe("applied");
    expect(res.draft.requestedDate).toBe("2026-08-29");
    expect(res.draft.requestedTime).toBe("15:00");
  });

  it("4. valid Saturday then Actually Monday → Monday replaces Saturday", () => {
    const first = schedule("Saturday", {});
    expect(first.outcome).toBe("applied");
    const second = schedule("Actually Monday", {
      requestedDate: first.draft.requestedDate,
      requestedTime: "10:00",
    });
    expect(second.outcome).toBe("applied");
    expect(second.draft.requestedDate).toBe("2026-08-31");
  });

  it("5. Make it 4pm instead → only time changes", () => {
    const res = schedule("Make it 4pm instead", {
      requestedDate: "2026-08-31",
      requestedTime: "10:00",
    });
    expect(res.outcome).toBe("applied");
    expect(res.draft.requestedDate).toBe("2026-08-31");
    expect(res.draft.requestedTime).toBe("16:00");
  });

  it("6. closed Sunday then valid Saturday → Sunday cannot remain", () => {
    const rejected = schedule("30th August");
    expect(rejected.draft.requestedDate).toBeUndefined();
    const fixed = schedule("Saturday", rejected.draft as any);
    expect(fixed.outcome).toBe("applied");
    expect(fixed.draft.requestedDate).toBe("2026-08-29");
    expect(fixed.draft.requestedDate).not.toBe("2026-08-30");
  });

  it("7. Saturday 18:00 → outside hours, immediate rejection", () => {
    const res = schedule("Saturday 6pm", { requestedDate: "2026-08-29" });
    expect(res.outcome).toBe("invalid");
    expect(res.validationReason).toBe("OUTSIDE_WORKING_HOURS");
  });

  it("8. past date → immediate rejection", () => {
    const res = schedule("28th August");
    expect(res.outcome).toBe("invalid");
    expect(res.validationReason).toBe("PAST_DATE");
  });

  it("9. today with past clock time → immediate rejection", () => {
    const lateMorning = new Date("2026-08-29T10:00:00.000Z"); // 13:00 Istanbul
    const res = schedule("10am", { requestedDate: "2026-08-29" }, lateMorning);
    expect(res.outcome).toBe("invalid");
    expect(res.validationReason).toBe("PAST_TIME");
  });

  it("10. next Saturday → 2026-09-05", () => {
    const res = schedule("next Saturday");
    expect(res.outcome).toBe("applied");
    expect(res.draft.requestedDate).toBe("2026-09-05");
  });

  it("11. Saturday 3pm updates date and time in the same turn", () => {
    const res = schedule("Saturday 3pm", { requestedDate: "2026-08-30" });
    expect(res.outcome).toBe("applied");
    expect(res.amendedFields).toEqual(expect.arrayContaining(["preferredDate", "preferredTime"]));
    expect(res.draft.requestedDate).toBe("2026-08-29");
    expect(res.draft.requestedTime).toBe("15:00");
  });

  it("12. repeated corrections: Sunday → Saturday → Monday → Saturday 3pm", () => {
    let draft: AppointmentDraftLike = {};
    const steps = [
      { msg: "30th August", expectInvalid: true },
      { msg: "Saturday", expectDate: "2026-08-29" },
      { msg: "Actually Monday", expectDate: "2026-08-31" },
      { msg: "Saturday 3pm", expectDate: "2026-08-29", expectTime: "15:00" },
    ];
    for (const step of steps) {
      const res = schedule(step.msg, draft);
      if (step.expectInvalid) {
        expect(res.outcome).toBe("invalid");
      } else {
        expect(res.outcome).toBe("applied");
        if (step.expectDate) expect(res.draft.requestedDate).toBe(step.expectDate);
        if (step.expectTime) expect(res.draft.requestedTime).toBe(step.expectTime);
      }
      draft = { ...res.draft };
    }
  });

  it("13. valid request still reaches complete draft for confirmation", () => {
    let draft: AppointmentDraftLike = { requestedService: "implant" };
    const dateRes = schedule("Monday 2pm", draft);
    expect(dateRes.outcome).toBe("applied");
    draft = { ...draft, ...dateRes.draft };
    draft.patientName = "Jane Doe";
    draft.patientPhone = "+447700900123";
    draft.patientEmail = "jane@example.com";
    const missing = ConversationStateEngine.getMissingSlots({
      treatment: draft.requestedService,
      preferredDate: draft.requestedDate,
      preferredTime: draft.requestedTime || undefined,
      fullName: draft.patientName,
      phone: draft.patientPhone,
      email: draft.patientEmail,
    });
    expect(missing).toHaveLength(0);
  });
});

describe("Confirmation-stage scheduling uses shared amendment path", () => {
  const BASE = {
    patientName: "Jane",
    patientPhone: "+447700900123",
    patientEmail: "jane@example.com",
    requestedService: "implant",
    requestedDate: "2026-08-30",
    requestedTime: "10:00",
  };

  it("Saturday 3pm at confirmation replaces stale Sunday date and time", () => {
    const res = applyConfirmationAmendment({
      message: "Saturday 3pm",
      locale: "en",
      draft: BASE,
      clinicTimeZone: CLINIC_TZ,
      now: FIXED_NOW,
      workingHours: PRODUCTION_HOURS,
    });
    expect(res.outcome).toBe("applied");
    expect(res.nextDraft.requestedDate).toBe("2026-08-29");
    expect(res.nextDraft.requestedTime).toBe("15:00");
  });
});

describe("Non-appointment flows unaffected", () => {
  it("14. pricing intent does not open appointment collection", () => {
    const gate = evaluateAppointmentCollectionGate({
      message: "How much is an implant?",
      intent: "pricing_request",
      isAppointmentFlowActive: false,
      entities: { treatment: "implant" },
    });
    expect(gate.allowed).toBe(false);
  });
});
