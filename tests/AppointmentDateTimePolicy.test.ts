import { describe, it, expect } from "vitest";
import {
  validateAppointmentDateTime,
  resolveClinicTimeZone,
  detectTimeZoneAbbreviation,
  convertUserWallTimeToClinicLocal,
  clinicLocalDateTimeToUtcIso,
  evaluateRawAppointmentTimeZoneAmbiguity,
  suggestNextValidAppointmentTimes,
} from "../lib/appointment/appointmentDateTimePolicy";
import { AppointmentDateValidator } from "../lib/skills/AppointmentDateValidator";
import type { WeeklySchedule } from "../lib/skills/ClinicWorkingHoursResolver";
import { validateAppointmentPayload } from "../lib/appointment-service";

/** Fixed clock: 2026-08-06T19:42:00+03:00 (Europe/Istanbul) */
const FIXED_NOW = new Date("2026-08-06T16:42:00.000Z");

const IDA_HOURS: WeeklySchedule = {
  monday: ["09:00", "18:00"],
  tuesday: ["09:00", "18:00"],
  wednesday: ["09:00", "18:00"],
  thursday: ["09:00", "18:00"],
  friday: ["09:00", "18:00"],
  saturday: ["10:00", "14:00"],
  sunday: null,
};

describe("AppointmentDateTimePolicy — past time & clinic hours", () => {
  it("1. past calendar date → rejected", () => {
    const res = validateAppointmentDateTime({
      localDate: "2026-08-05",
      localTime: "10:00",
      clinicTimeZone: "Europe/Istanbul",
      now: FIXED_NOW,
      workingHours: IDA_HOURS,
      locale: "tr",
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("PAST_DATE");
    expect(res.message).toMatch(/geçmiş/i);
  });

  it("2. today earlier time (incident: 14:00 at 19:42) → rejected PAST_TIME", () => {
    const res = validateAppointmentDateTime({
      localDate: "2026-08-06",
      localTime: "14:00",
      clinicTimeZone: "Europe/Istanbul",
      now: FIXED_NOW,
      workingHours: IDA_HOURS,
      locale: "tr",
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("PAST_TIME");
    expect(res.message).toMatch(/geçmiş görünüyor/i);
    expect(res.message).not.toMatch(/Invalid date|Validation failed/i);
  });

  it("3. today exact current minute → rejected", () => {
    const res = validateAppointmentDateTime({
      localDate: "2026-08-06",
      localTime: "19:42",
      clinicTimeZone: "Europe/Istanbul",
      now: FIXED_NOW,
      workingHours: IDA_HOURS,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("PAST_TIME");
  });

  it("4. today future time inside working hours → allowed", () => {
    const morning = new Date("2026-08-06T07:00:00.000Z"); // 10:00 Istanbul
    const res = validateAppointmentDateTime({
      localDate: "2026-08-06",
      localTime: "14:00",
      clinicTimeZone: "Europe/Istanbul",
      now: morning,
      workingHours: IDA_HOURS,
    });
    expect(res.ok).toBe(true);
    expect(res.resolved?.localDate).toBe("2026-08-06");
    expect(res.resolved?.localTime).toBe("14:00");
    expect(res.resolved?.clinicTimeZone).toBe("Europe/Istanbul");
    expect(res.resolved?.startsAtUtc).toBeTruthy();
  });

  it("5. today future time after closing → rejected", () => {
    const afternoon = new Date("2026-08-06T12:00:00.000Z"); // 15:00 Istanbul
    const res = validateAppointmentDateTime({
      localDate: "2026-08-06",
      localTime: "20:00",
      clinicTimeZone: "Europe/Istanbul",
      now: afternoon,
      workingHours: IDA_HOURS,
      locale: "tr",
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("OUTSIDE_WORKING_HOURS");
  });

  it("6. future Sunday closed → rejected with guidance", () => {
    const res = validateAppointmentDateTime({
      localDate: "2026-08-09", // Sunday
      localTime: "11:00",
      clinicTimeZone: "Europe/Istanbul",
      now: FIXED_NOW,
      workingHours: IDA_HOURS,
      locale: "tr",
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("CLOSED_DAY");
    expect(res.suggestions.length).toBeGreaterThan(0);
  });

  it("7. future weekday inside hours → allowed", () => {
    const res = validateAppointmentDateTime({
      localDate: "2026-08-07",
      localTime: "11:00",
      clinicTimeZone: "Europe/Istanbul",
      now: FIXED_NOW,
      workingHours: IDA_HOURS,
    });
    expect(res.ok).toBe(true);
  });

  it("8. missing working hours → past rejected; future allowed for clinic confirmation", () => {
    const past = validateAppointmentDateTime({
      localDate: "2026-08-06",
      localTime: "14:00",
      clinicTimeZone: "Europe/Istanbul",
      now: FIXED_NOW,
      workingHours: null,
    });
    expect(past.ok).toBe(false);
    expect(past.reason).toBe("PAST_TIME");

    const future = validateAppointmentDateTime({
      localDate: "2026-08-10",
      localTime: "11:00",
      clinicTimeZone: "Europe/Istanbul",
      now: FIXED_NOW,
      workingHours: null,
    });
    expect(future.ok).toBe(true);
  });

  it("9. minimum notice violation → rejected when configured", () => {
    const morning = new Date("2026-08-06T07:00:00.000Z"); // 10:00 TR
    const res = validateAppointmentDateTime({
      localDate: "2026-08-06",
      localTime: "10:30",
      clinicTimeZone: "Europe/Istanbul",
      now: morning,
      workingHours: IDA_HOURS,
      minimumNoticeMinutes: 120,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("MINIMUM_NOTICE");
  });

  it("10–11. 2:00pm EST converts into clinic-local before validation", () => {
    const converted = convertUserWallTimeToClinicLocal({
      localDate: "2026-08-06",
      localTime: "14:00",
      sourceTimeZone: "America/New_York",
      clinicTimeZone: "Europe/Istanbul",
    });
    expect(converted).not.toBeNull();
    // 14:00 America/New_York in August (EDT, UTC-4) → 21:00 Istanbul
    expect(converted!.localTime).toBe("21:00");

    const res = validateAppointmentDateTime({
      localDate: "2026-08-06",
      localTime: "14:00",
      rawUserInput: "August 6th 2:00pm EST",
      clinicTimeZone: "Europe/Istanbul",
      now: FIXED_NOW,
      workingHours: IDA_HOURS,
    });
    // Converted 21:00 Istanbul is still after 19:42 but outside 18:00 close → reject hours
    expect(res.ok).toBe(false);
    expect(["OUTSIDE_WORKING_HOURS", "PAST_TIME"]).toContain(res.reason);
    expect(detectTimeZoneAbbreviation("August 6th 2:00pm EST").iana).toBe("America/New_York");
  });

  it("12. ambiguous IST abbreviation → clarification, no ok", () => {
    const amb = evaluateRawAppointmentTimeZoneAmbiguity("tomorrow 3pm IST", "tr");
    expect(amb?.ok).toBe(false);
    expect(amb?.reason).toBe("AMBIGUOUS_TIMEZONE");
    expect(amb?.requiresTimezoneClarification).toBe(true);

    const res = validateAppointmentDateTime({
      localDate: "2026-08-07",
      localTime: "15:00",
      rawUserInput: "August 7th 3:00pm IST",
      clinicTimeZone: "Europe/Istanbul",
      now: FIXED_NOW,
      workingHours: IDA_HOURS,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("AMBIGUOUS_TIMEZONE");
  });

  it("13. İstanbul clinic resolves Europe/Istanbul", () => {
    expect(
      resolveClinicTimeZone({ city: "İstanbul", country: "Türkiye" }).timeZone
    ).toBe("Europe/Istanbul");
    expect(
      resolveClinicTimeZone({ timezone: "Europe/Istanbul" }).source
    ).toBe("explicit_clinic_config");
  });

  it("14. non-Türkiye clinic does not inherit İstanbul timezone", () => {
    const r = resolveClinicTimeZone({ city: "Berlin", country: "Germany" });
    expect(r.timeZone).not.toBe("Europe/Istanbul");
    expect(r.confident).toBe(false);
  });

  it("21. suggested times are within clinic working hours", () => {
    const suggestions = suggestNextValidAppointmentTimes({
      now: FIXED_NOW,
      clinicTimeZone: "Europe/Istanbul",
      workingHours: IDA_HOURS,
      locale: "tr",
      maxSuggestions: 3,
    });
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.length).toBeLessThanOrEqual(3);
    for (const s of suggestions) {
      expect(s.localDate >= "2026-08-07").toBe(true); // clinic already closed today
      expect(s.label).toMatch(/\d{2}:\d{2}/);
    }
  });

  it("22. guidance does not claim confirmed availability", () => {
    const res = validateAppointmentDateTime({
      localDate: "2026-08-06",
      localTime: "14:00",
      clinicTimeZone: "Europe/Istanbul",
      now: FIXED_NOW,
      workingHours: IDA_HOURS,
      locale: "tr",
    });
    expect(res.message).toMatch(/Klinik onayına sunabileceğimiz|geçmiş görünüyor/);
    expect(res.message).not.toMatch(/Kesin boş randevu/);
  });
});

describe("AppointmentDateValidator PAST_TIME regression", () => {
  it("same-day past ISO date+time sets PAST_TIME", () => {
    const res = AppointmentDateValidator.validateAppointmentDateConsistency({
      rawDateText: "2026-08-06",
      rawTimeText: "14:00",
      inferredDate: "2026-08-06",
      inferredTime: "14:00",
      currentClinicDateTime: FIXED_NOW,
      timeZone: "Europe/Istanbul",
    });
    expect(res.hasConflict).toBe(true);
    expect(res.conflictType).toBe("PAST_TIME");
    expect(res.isValid).toBe(false);
  });
});

describe("Persistence side-effect gate (mocked)", () => {
  it("15–18. rejected request throws before create; no success path", () => {
    expect(() =>
      validateAppointmentPayload({
        clinicId: "ida",
        patientName: "Edward Williams",
        patientPhone: "+15550001111",
        requestedService: "Implant",
        requestedDate: "2026-08-06",
        requestedTime: "14:00",
        source: "ai_chatbot",
        status: "PENDING_REVIEW",
        createdBy: "test",
        clinicData: { city: "Istanbul", country: "Turkey", timezone: "Europe/Istanbul" },
        now: FIXED_NOW,
      })
    ).toThrow(/geçmiş|PAST|çalışma/i);
  });

  it("future valid payload passes policy gate", () => {
    const payload = validateAppointmentPayload({
      clinicId: "ida",
      patientName: "Jane Doe",
      patientPhone: "+15550001111",
      requestedService: "Implant",
      requestedDate: "2026-08-07",
      requestedTime: "11:00",
      source: "ai_chatbot",
      status: "PENDING_REVIEW",
      createdBy: "test",
      clinicData: {
        city: "Istanbul",
        country: "Turkey",
        timezone: "Europe/Istanbul",
        workingHours: IDA_HOURS,
      },
      now: FIXED_NOW,
    });
    expect(payload.requestedDate).toBe("2026-08-07");
    expect(payload.startsAtUtc).toBeTruthy();
    expect(payload.clinicTimeZone).toBe("Europe/Istanbul");
  });

  it("24. tenant isolation: clinic TZ comes from clinicData not globals", () => {
    const berlin = resolveClinicTimeZone({
      timezone: "Europe/Berlin",
      country: "Germany",
    });
    const istanbul = resolveClinicTimeZone({
      timezone: "Europe/Istanbul",
      country: "Turkey",
    });
    expect(berlin.timeZone).toBe("Europe/Berlin");
    expect(istanbul.timeZone).toBe("Europe/Istanbul");
    expect(berlin.timeZone).not.toBe(istanbul.timeZone);
  });
});

describe("UTC conversion helpers", () => {
  it("clinicLocalDateTimeToUtcIso round-trips Istanbul wall time", () => {
    const iso = clinicLocalDateTimeToUtcIso("2026-08-07", "11:00", "Europe/Istanbul");
    expect(iso).toBeTruthy();
    // 11:00 +03:00 → 08:00Z
    expect(iso!.startsWith("2026-08-07T08:00")).toBe(true);
  });
});
