/**
 * Canonical appointment date resolution — yearless next-future-occurrence,
 * explicit year, month-only pending context, calendar validity, clinic TZ.
 */
import { describe, it, expect } from "vitest";
import {
  canonicalResolveAppointmentDate,
  composeDayWithPendingAppointmentDate,
  isBareDayOfMonthMessage,
  isValidCivilDate,
} from "../lib/appointment/canonicalAppointmentDate";
import {
  SlotExtractor,
  applyAppointmentSchedulingAmendment,
  applyConfirmationAmendment,
  reactivatePendingAppointmentDay,
} from "../lib/conversation";
import { validateAppointmentDateOnly } from "../lib/appointment/appointmentDateTimePolicy";
import { AppointmentDateValidator } from "../lib/skills/AppointmentDateValidator";
import type { WeeklySchedule } from "../lib/skills/ClinicWorkingHoursResolver";

const CLINIC_TZ = "Europe/Istanbul";
/** Thursday 24 Sep 2026, 12:00 clinic-local (09:00Z). */
const FIXED_NOW = new Date("2026-09-24T09:00:00.000Z");

const HOURS: WeeklySchedule = {
  monday: ["09:00", "18:00"],
  tuesday: ["09:00", "18:00"],
  wednesday: ["09:00", "18:00"],
  thursday: ["09:00", "18:00"],
  friday: ["09:00", "18:00"],
  saturday: ["09:00", "14:00"],
  sunday: null,
};

function extract(
  message: string,
  existing: Record<string, unknown> = {},
  now = FIXED_NOW,
  expectedSlot: string | undefined = "preferredDate"
) {
  return SlotExtractor.extractSlots(
    message,
    existing as any,
    "en",
    CLINIC_TZ,
    expectedSlot,
    now
  );
}

function schedule(
  message: string,
  draft: Record<string, unknown> = {},
  now = FIXED_NOW,
  locale = "en",
  expectedSlot: string | undefined = "preferredDate"
) {
  return applyAppointmentSchedulingAmendment({
    message,
    draft: draft as any,
    locale,
    clinicTimeZone: CLINIC_TZ,
    now,
    workingHours: HOURS,
    expectedSlot,
  });
}

describe("canonicalResolveAppointmentDate (frozen 2026-09-24 Istanbul)", () => {
  it("February 5 → 2027-02-05", () => {
    const r = canonicalResolveAppointmentDate({
      month: 2,
      day: 5,
      yearExplicit: false,
      clinicTimeZone: CLINIC_TZ,
      now: FIXED_NOW,
    });
    expect(r).toMatchObject({ status: "complete", isoDate: "2027-02-05", yearExplicit: false });
  });

  it("October 5 → 2026-10-05", () => {
    const r = canonicalResolveAppointmentDate({
      month: 10,
      day: 5,
      yearExplicit: false,
      clinicTimeZone: CLINIC_TZ,
      now: FIXED_NOW,
    });
    expect(r).toMatchObject({ status: "complete", isoDate: "2026-10-05" });
  });

  it("September 30 → 2026-09-30", () => {
    const r = canonicalResolveAppointmentDate({
      month: 9,
      day: 30,
      yearExplicit: false,
      clinicTimeZone: CLINIC_TZ,
      now: FIXED_NOW,
    });
    expect(r).toMatchObject({ status: "complete", isoDate: "2026-09-30" });
  });

  it("September 20 → 2027-09-20", () => {
    const r = canonicalResolveAppointmentDate({
      month: 9,
      day: 20,
      yearExplicit: false,
      clinicTimeZone: CLINIC_TZ,
      now: FIXED_NOW,
    });
    expect(r).toMatchObject({ status: "complete", isoDate: "2027-09-20" });
  });

  it("explicit February 5 2026 stays 2026-02-05 (year never rewritten)", () => {
    const r = canonicalResolveAppointmentDate({
      month: 2,
      day: 5,
      year: 2026,
      yearExplicit: true,
      clinicTimeZone: CLINIC_TZ,
      now: FIXED_NOW,
    });
    expect(r).toMatchObject({ status: "complete", isoDate: "2026-02-05", yearExplicit: true });
  });

  it("explicit February 5 2027 → 2027-02-05", () => {
    const r = canonicalResolveAppointmentDate({
      month: 2,
      day: 5,
      year: 2027,
      yearExplicit: true,
      clinicTimeZone: CLINIC_TZ,
      now: FIXED_NOW,
    });
    expect(r).toMatchObject({ status: "complete", isoDate: "2027-02-05", yearExplicit: true });
  });

  it("month-only February → pending 2027-02 without fabricating a day", () => {
    const r = canonicalResolveAppointmentDate({
      month: 2,
      day: null,
      yearExplicit: false,
      clinicTimeZone: CLINIC_TZ,
      now: FIXED_NOW,
    });
    expect(r.status).toBe("partial_month");
    if (r.status === "partial_month") {
      expect(r.pending).toEqual({
        month: 2,
        year: 2027,
        yearExplicit: false,
        awaitingDayReply: true,
      });
    }
  });

  it("month-only October → pending 2026-10", () => {
    const r = canonicalResolveAppointmentDate({
      month: 10,
      day: null,
      yearExplicit: false,
      clinicTimeZone: CLINIC_TZ,
      now: FIXED_NOW,
    });
    expect(r).toMatchObject({
      status: "partial_month",
      pending: { month: 10, year: 2026, yearExplicit: false, awaitingDayReply: true },
    });
  });

  it("rejects February 30 / April 31 / non-leap Feb 29; accepts leap Feb 29", () => {
    expect(isValidCivilDate(2026, 2, 30)).toBe(false);
    expect(isValidCivilDate(2026, 4, 31)).toBe(false);
    expect(isValidCivilDate(2026, 2, 29)).toBe(false);
    expect(isValidCivilDate(2028, 2, 29)).toBe(true);

    expect(
      canonicalResolveAppointmentDate({
        month: 2,
        day: 30,
        year: 2026,
        yearExplicit: true,
        clinicTimeZone: CLINIC_TZ,
        now: FIXED_NOW,
      }).status
    ).toBe("invalid_calendar");

    expect(
      canonicalResolveAppointmentDate({
        month: 2,
        day: 29,
        year: 2028,
        yearExplicit: true,
        clinicTimeZone: CLINIC_TZ,
        now: FIXED_NOW,
      })
    ).toMatchObject({ status: "complete", isoDate: "2028-02-29" });
  });

  it("year boundary: Dec 31 → Jan 1 yearless January 5", () => {
    const nye = new Date("2026-12-31T12:00:00.000Z"); // 15:00 Istanbul
    const r = canonicalResolveAppointmentDate({
      month: 1,
      day: 5,
      yearExplicit: false,
      clinicTimeZone: CLINIC_TZ,
      now: nye,
    });
    expect(r).toMatchObject({ status: "complete", isoDate: "2027-01-05" });

    const jan1 = new Date("2026-12-31T21:30:00.000Z"); // 2027-01-01 00:30 Istanbul
    const r2 = canonicalResolveAppointmentDate({
      month: 1,
      day: 5,
      yearExplicit: false,
      clinicTimeZone: CLINIC_TZ,
      now: jan1,
    });
    expect(r2).toMatchObject({ status: "complete", isoDate: "2027-01-05" });
  });

  it("clinic TZ vs UTC: near midnight America/New_York vs UTC date", () => {
    // Instant is 2026-09-25 02:00 UTC = still 2026-09-24 evening in New York
    const instant = new Date("2026-09-25T02:00:00.000Z");
    const nyc = canonicalResolveAppointmentDate({
      month: 9,
      day: 24,
      yearExplicit: false,
      clinicTimeZone: "America/New_York",
      now: instant,
    });
    // NYC local today is 2026-09-24 → same-day yearless is today (not past)
    expect(nyc).toMatchObject({ status: "complete", isoDate: "2026-09-24" });

    const utcClinic = canonicalResolveAppointmentDate({
      month: 9,
      day: 24,
      yearExplicit: false,
      clinicTimeZone: "UTC",
      now: instant,
    });
    // UTC today is already 2026-09-25 → Sep 24 is past → 2027-09-24
    expect(utcClinic).toMatchObject({ status: "complete", isoDate: "2027-09-24" });
  });
});

describe("SlotExtractor yearless + multi-turn (2026-09-24)", () => {
  it("parses February 5 / 5 February / Feb 5 → 2027-02-05", () => {
    expect(extract("February 5").extracted.preferredDate).toBe("2027-02-05");
    expect(extract("5 February").extracted.preferredDate).toBe("2027-02-05");
    expect(extract("Feb 5").extracted.preferredDate).toBe("2027-02-05");
  });

  it("parses October 5 / September 30 / September 20", () => {
    expect(extract("October 5").extracted.preferredDate).toBe("2026-10-05");
    expect(extract("September 30").extracted.preferredDate).toBe("2026-09-30");
    expect(extract("September 20").extracted.preferredDate).toBe("2027-09-20");
  });

  it("explicit years", () => {
    expect(extract("February 5 2026").extracted.preferredDate).toBe("2026-02-05");
    expect(extract("February 5 2027").extracted.preferredDate).toBe("2027-02-05");
  });

  it("Turkish 5 Şubat variants", () => {
    expect(extract("5 Şubat", {}, FIXED_NOW).extracted.preferredDate).toBe("2027-02-05");
    const tr = SlotExtractor.extractSlots("5 Şubat", {}, "tr", CLINIC_TZ, undefined, FIXED_NOW);
    expect(tr.extracted.preferredDate).toBe("2027-02-05");
    expect(
      SlotExtractor.extractSlots("5 Şubat 2026", {}, "tr", CLINIC_TZ, undefined, FIXED_NOW).extracted
        .preferredDate
    ).toBe("2026-02-05");
    expect(
      SlotExtractor.extractSlots("5 Şubat 2027", {}, "tr", CLINIC_TZ, undefined, FIXED_NOW).extracted
        .preferredDate
    ).toBe("2027-02-05");
  });

  it("February → pending; February → 5 → 2027-02-05", () => {
    const monthOnly = extract("February");
    expect(monthOnly.extracted.preferredDate).toBeUndefined();
    expect(monthOnly.extracted.pendingAppointmentDate).toEqual({
      month: 2,
      year: 2027,
      yearExplicit: false,
      awaitingDayReply: true,
    });

    const composed = extract("5", {
      pendingAppointmentDate: monthOnly.extracted.pendingAppointmentDate,
    });
    expect(composed.extracted.preferredDate).toBe("2027-02-05");
  });

  it("January → February → 5 → 2027-02-05 (latest month wins)", () => {
    const jan = extract("January");
    expect(jan.extracted.pendingAppointmentDate?.month).toBe(1);
    expect(jan.extracted.pendingAppointmentDate?.year).toBe(2027);

    const feb = extract("February", {
      pendingAppointmentDate: jan.extracted.pendingAppointmentDate,
    });
    expect(feb.extracted.pendingAppointmentDate).toEqual({
      month: 2,
      year: 2027,
      yearExplicit: false,
      awaitingDayReply: true,
    });

    const day = extract("5", { pendingAppointmentDate: feb.extracted.pendingAppointmentDate });
    expect(day.extracted.preferredDate).toBe("2027-02-05");
  });

  it("bare '5' without pending must NOT become a date", () => {
    const r = extract("5");
    expect(r.extracted.preferredDate).toBeUndefined();
    expect(r.extracted.pendingAppointmentDate).toBeUndefined();
    expect(isBareDayOfMonthMessage("5")).toBe(5);
  });

  it("gelecek Şubat / next February → pending 2027", () => {
    const tr = SlotExtractor.extractSlots(
      "gelecek Şubat",
      {},
      "tr",
      CLINIC_TZ,
      "preferredDate",
      FIXED_NOW
    );
    expect(tr.extracted.pendingAppointmentDate).toEqual({
      month: 2,
      year: 2027,
      yearExplicit: false,
      awaitingDayReply: true,
    });
    const en = extract("next February");
    expect(en.extracted.pendingAppointmentDate?.month).toBe(2);
    expect(en.extracted.pendingAppointmentDate?.year).toBe(2027);
    expect(en.extracted.pendingAppointmentDate?.awaitingDayReply).toBe(true);
  });

  it("invalid February 30", () => {
    const r = extract("February 30 2026");
    expect(r.extracted.invalidCivilDate).toBe(true);
    expect(r.extracted.preferredDate).toBeUndefined();
  });

  it("relative today / tomorrow / next Monday do not regress", () => {
    expect(extract("today").extracted.preferredDate).toBe("2026-09-24");
    expect(extract("tomorrow").extracted.preferredDate).toBe("2026-09-25");
    // Existing product: "next" forces +7 even when the weekday is still ahead this week
    expect(extract("next Monday").extracted.preferredDate).toBe("2026-10-05");
    expect(extract("Monday").extracted.preferredDate).toBe("2026-09-28");
    const tr = SlotExtractor.extractSlots("yarın", {}, "tr", CLINIC_TZ, undefined, FIXED_NOW);
    expect(tr.extracted.preferredDate).toBe("2026-09-25");
    const trMon = SlotExtractor.extractSlots("pazartesi", {}, "tr", CLINIC_TZ, undefined, FIXED_NOW);
    expect(trMon.extracted.preferredDate).toBe("2026-09-28");
  });
});

describe("scheduling amendment + past policy order", () => {
  it("yearless February 5 applies as 2027-02-05 (not PAST_DATE)", () => {
    const res = schedule("February 5");
    expect(res.outcome).toBe("applied");
    expect(res.draft.requestedDate).toBe("2027-02-05");
  });

  it("explicit February 5 2026 → PAST_DATE", () => {
    const res = schedule("February 5 2026");
    expect(res.outcome).toBe("invalid");
    expect(res.validationReason).toBe("PAST_DATE");
  });

  it("explicit February 5 2027 → applied", () => {
    const res = schedule("February 5 2027");
    expect(res.outcome).toBe("applied");
    expect(res.draft.requestedDate).toBe("2027-02-05");
  });

  it("Turkish 5 Şubat 2026 → PAST_DATE; 5 Şubat → applied 2027", () => {
    expect(schedule("5 Şubat 2026", {}, FIXED_NOW, "tr").validationReason).toBe("PAST_DATE");
    const ok = schedule("5 Şubat", {}, FIXED_NOW, "tr");
    expect(ok.outcome).toBe("applied");
    expect(ok.draft.requestedDate).toBe("2027-02-05");
  });

  it("multi-turn February → 5 through scheduling draft", () => {
    const first = schedule("February");
    expect(first.outcome).toBe("partial_month");
    expect(first.draft.pendingAppointmentDate?.month).toBe(2);
    expect(first.message?.toLowerCase()).toMatch(/day|gün/);

    const second = schedule("5", first.draft);
    expect(second.outcome).toBe("applied");
    expect(second.draft.requestedDate).toBe("2027-02-05");
    expect(second.draft.pendingAppointmentDate).toBeUndefined();
  });

  it("January → February → 5 through scheduling", () => {
    const a = schedule("January");
    const b = schedule("February", a.draft);
    expect(b.draft.pendingAppointmentDate?.month).toBe(2);
    const c = schedule("5", b.draft);
    expect(c.draft.requestedDate).toBe("2027-02-05");
  });

  it("resolved ISO survives validateAppointmentDateOnly without reinterpretation", () => {
    const res = schedule("February 5");
    expect(res.draft.requestedDate).toBe("2027-02-05");
    const policy = validateAppointmentDateOnly({
      localDate: res.draft.requestedDate,
      clinicTimeZone: CLINIC_TZ,
      now: FIXED_NOW,
      workingHours: HOURS,
      locale: "en",
    });
    expect(policy.ok).toBe(true);
    expect(policy.resolved?.localDate).toBe("2027-02-05");
  });

  it("composeDayWithPending re-applies yearless rule (September + 20)", () => {
    const composed = composeDayWithPendingAppointmentDate({
      day: 20,
      pending: { month: 9, year: 2026, yearExplicit: false, awaitingDayReply: true },
      clinicTimeZone: CLINIC_TZ,
      now: FIXED_NOW,
    });
    expect(composed).toMatchObject({ status: "complete", isoDate: "2027-09-20" });
  });
});

describe("pending day eligibility / bare-number safety", () => {
  it("A) February → 5 → 2027-02-05", () => {
    const a = schedule("February");
    const b = schedule("5", a.draft);
    expect(b.draft.requestedDate).toBe("2027-02-05");
  });

  it("B) Şubat → 5 → 2027-02-05", () => {
    const a = schedule("Şubat", {}, FIXED_NOW, "tr");
    expect(a.outcome).toBe("partial_month");
    const b = schedule("5", a.draft, FIXED_NOW, "tr");
    expect(b.draft.requestedDate).toBe("2027-02-05");
  });

  it("C) February → I need 5 implants → no requestedDate from 5", () => {
    const a = schedule("February");
    const b = schedule("I need 5 implants", a.draft);
    expect(b.draft.requestedDate).toBeUndefined();
    expect(b.draft.pendingAppointmentDate?.month).toBe(2);
    expect(b.draft.pendingAppointmentDate?.awaitingDayReply).toBe(false);
  });

  it("D) February → treatment info → bare 5 must NOT create February 5", () => {
    const a = schedule("February");
    const b = schedule("I want information about implants", a.draft);
    expect(b.draft.pendingAppointmentDate?.awaitingDayReply).toBe(false);
    const c = schedule("5", b.draft);
    expect(c.draft.requestedDate).toBeUndefined();
    expect(c.draft.requestedTime).toBeUndefined();
    expect(c.outcome).not.toBe("applied");
  });

  it("E) February → actually March → 5 → 2027-03-05", () => {
    const a = schedule("February");
    const b = schedule("actually March", a.draft);
    expect(b.draft.pendingAppointmentDate?.month).toBe(3);
    expect(b.draft.pendingAppointmentDate?.awaitingDayReply).toBe(true);
    const c = schedule("5", b.draft);
    expect(c.draft.requestedDate).toBe("2027-03-05");
  });

  it("F) January → February → 5 → 2027-02-05", () => {
    const a = schedule("January");
    const b = schedule("February", a.draft);
    const c = schedule("5", b.draft);
    expect(c.draft.requestedDate).toBe("2027-02-05");
  });

  it("G/H/I) 5 implants / tooth 5 / age 25 do not create dates", () => {
    const base = schedule("February").draft;
    for (const msg of ["5 implants", "tooth 5", "age 25"]) {
      const res = schedule(msg, base);
      expect(res.draft.requestedDate).toBeUndefined();
      expect(res.draft.pendingAppointmentDate?.awaitingDayReply).toBe(false);
    }
  });

  it("J) interruption then resume day collection → 5 completes", () => {
    const a = schedule("February");
    const interrupted = schedule("I need information about implants", a.draft);
    expect(interrupted.draft.pendingAppointmentDate?.awaitingDayReply).toBe(false);
    expect(schedule("5", interrupted.draft).draft.requestedDate).toBeUndefined();

    const resumed = reactivatePendingAppointmentDay(interrupted.draft);
    expect(resumed.pendingAppointmentDate?.awaitingDayReply).toBe(true);
    const done = schedule("5", resumed);
    expect(done.draft.requestedDate).toBe("2027-02-05");
  });

  it("K) resolved date + expected time + stale pending → bare 5 is not a day", () => {
    const draft = {
      requestedDate: "2027-02-05",
      pendingAppointmentDate: {
        month: 2,
        year: 2027,
        yearExplicit: false,
        awaitingDayReply: true,
      },
    };
    const res = schedule("5", draft, FIXED_NOW, "en", "preferredTime");
    // Must not invent a new calendar day from pending; date stays resolved
    expect(res.draft.requestedDate).toBe("2027-02-05");
    expect(res.draft.pendingAppointmentDate).toBeUndefined();
    expect(res.amendedFields.includes("preferredDate")).toBe(false);
  });

  it("same-day September 24 → 2026-09-24", () => {
    expect(extract("September 24").extracted.preferredDate).toBe("2026-09-24");
    const res = schedule("September 24");
    expect(res.outcome).toBe("applied");
    expect(res.draft.requestedDate).toBe("2026-09-24");
  });

  it("31 June / 31 Nisan / 29 Şubat 2026 are invalid", () => {
    expect(schedule("31 June").outcome).toBe("invalid");
    expect(schedule("31 June").validationReason).toBe("INVALID_DATE");
    expect(schedule("31 Nisan", {}, FIXED_NOW, "tr").validationReason).toBe("INVALID_DATE");
    expect(schedule("29 Şubat 2026", {}, FIXED_NOW, "tr").validationReason).toBe("INVALID_DATE");
    expect(isValidCivilDate(2026, 6, 31)).toBe(false);
    expect(isValidCivilDate(2026, 4, 31)).toBe(false);
    expect(isValidCivilDate(2026, 2, 29)).toBe(false);
  });

  it("pending existence alone is insufficient without expectedSlot preferredDate", () => {
    const pending = {
      month: 2,
      year: 2027,
      yearExplicit: false,
      awaitingDayReply: true,
    };
    const noSlot = SlotExtractor.extractSlots(
      "5",
      { pendingAppointmentDate: pending },
      "en",
      CLINIC_TZ,
      undefined,
      FIXED_NOW
    );
    expect(noSlot.extracted.preferredDate).toBeUndefined();

    const wrongSlot = SlotExtractor.extractSlots(
      "5",
      { pendingAppointmentDate: pending },
      "en",
      CLINIC_TZ,
      "preferredTime",
      FIXED_NOW
    );
    expect(wrongSlot.extracted.preferredDate).toBeUndefined();
  });
});

describe("single authoritative path: extractor ≡ scheduling ≡ confirmation ≡ validator (frozen 2026-10-08 Istanbul)", () => {
  /** Thursday 8 Oct 2026, 12:00 clinic-local. */
  const NOW = new Date("2026-10-08T09:00:00.000Z");

  const trExtract = (message: string, existing: Record<string, unknown> = {}, expectedSlot = "preferredDate", now = NOW) =>
    SlotExtractor.extractSlots(message, existing as any, "tr", CLINIC_TZ, expectedSlot, now).extracted;
  const trSchedule = (message: string, draft: Record<string, unknown> = {}, expectedSlot = "preferredDate") =>
    schedule(message, draft, NOW, "tr", expectedSlot);
  const validate = (rawDateText: string, now = NOW) =>
    AppointmentDateValidator.validateAppointmentDateConsistency({
      rawDateText,
      rawTimeText: "14:00",
      inferredDate: null,
      inferredTime: "14:00",
      currentClinicDateTime: now,
      timeZone: CLINIC_TZ,
    });

  it.each([
    ["5 Şubat", "2027-02-05"],
    ["5 Şubat 2027", "2027-02-05"],
    ["12 Ekim", "2026-10-12"],
    ["5 Şubat 2028", "2028-02-05"],
  ])("%s resolves to %s in every layer", (text, iso) => {
    expect(trExtract(text).preferredDate).toBe(iso);
    const sched = trSchedule(text);
    expect(sched.outcome).toBe("applied");
    expect(sched.draft.requestedDate).toBe(iso);
    const v = validate(text);
    expect(v.resolvedDate).toBe(iso);
    expect(v.hasConflict).toBe(false);
  });

  it("validator never rewrites an explicit past year into the next occurrence", () => {
    const v = validate("7 Ekim 2026");
    expect(v.resolvedDate).toBe("2026-10-07");
    expect(v.conflictType).toBe("PAST_DATE");
    expect(validate("7 Ekim").resolvedDate).toBe("2027-10-07");
    expect(trSchedule("7 Ekim 2026").validationReason).toBe("PAST_DATE");
  });

  it("weekday/date mismatch with digits is flagged by the validator", () => {
    const v = validate("12 Ekim Salı");
    expect(v.resolvedDate).toBe("2026-10-12");
    expect(v.hasConflict).toBe(true);
    expect(v.requiresClarification).toBe(true);
  });

  it("Istanbul just after midnight uses the clinic-local date, not UTC", () => {
    const justAfterMidnight = new Date("2026-10-07T21:30:00.000Z"); // 8 Oct 00:30 Istanbul
    expect(trExtract("8 Ekim", {}, "preferredDate", justAfterMidnight).preferredDate).toBe("2026-10-08");
    expect(trExtract("7 Ekim", {}, "preferredDate", justAfterMidnight).preferredDate).toBe("2027-10-07");
    expect(validate("8 Ekim", justAfterMidnight).resolvedDate).toBe("2026-10-08");
  });

  it("month first, day later: Şubat → 5 → 2027-02-05", () => {
    const a = trSchedule("Şubat");
    expect(a.outcome).toBe("partial_month");
    expect(a.draft.requestedDate).toBeUndefined();
    expect(trSchedule("5", a.draft).draft.requestedDate).toBe("2027-02-05");
  });

  it("topic change stales the pending month; explicit month restatement reactivates it", () => {
    const a = trSchedule("Şubat");
    const interrupted = trSchedule("implant fiyatları hakkında bilgi alabilir miyim", a.draft);
    expect(interrupted.draft.pendingAppointmentDate?.awaitingDayReply).toBe(false);
    const stale = trSchedule("5", interrupted.draft);
    expect(stale.draft.requestedDate).toBeUndefined();
    expect(stale.draft.requestedTime).toBeUndefined();

    const restated = trSchedule("Şubat", interrupted.draft);
    expect(restated.outcome).toBe("partial_month");
    expect(restated.draft.pendingAppointmentDate?.awaitingDayReply).toBe(true);
    expect(trSchedule("5", restated.draft).draft.requestedDate).toBe("2027-02-05");
  });

  it("bare '5' while preferredDate is expected never becomes 05:00", () => {
    expect(trExtract("5").preferredTime).toBeUndefined();
    expect(trExtract("5").preferredDate).toBeUndefined();
    const pending = { month: 2, year: 2027, yearExplicit: false, awaitingDayReply: false };
    const res = trSchedule("5", { pendingAppointmentDate: pending });
    expect(res.draft.requestedTime).toBeUndefined();
    expect(res.draft.requestedDate).toBeUndefined();
  });

  it("year rollover: on 31 Dec a yearless 5 Ocak lands in the next year", () => {
    const dec31 = new Date("2026-12-31T09:00:00.000Z");
    expect(trExtract("5 Ocak", {}, "preferredDate", dec31).preferredDate).toBe("2027-01-05");
    expect(validate("5 Ocak", dec31).resolvedDate).toBe("2027-01-05");
  });

  describe("confirmation correction", () => {
    const confirmedDraft = {
      patientName: "Test Hasta",
      patientPhone: "+905320000000",
      requestedService: "İmplant",
      requestedDate: "2026-10-12",
      requestedTime: "14:00",
    };
    const confirm = (message: string) =>
      applyConfirmationAmendment({
        message,
        locale: "tr",
        draft: confirmedDraft,
        clinicTimeZone: CLINIC_TZ,
        now: NOW,
        workingHours: HOURS,
      });

    it("explicit-year correction keeps the stated year", () => {
      const res = confirm("tarihi 5 Şubat 2028 yapalım");
      expect(res.outcome).toBe("applied");
      expect(res.nextDraft.requestedDate).toBe("2028-02-05");
      expect(res.nextDraft.patientPhone).toBe(confirmedDraft.patientPhone);
    });

    it("yearless correction resolves to the next future occurrence", () => {
      const res = confirm("tarihi 5 Şubat yapalım");
      expect(res.outcome).toBe("applied");
      expect(res.nextDraft.requestedDate).toBe("2027-02-05");
    });

    it("past explicit-year correction is rejected, not silently moved", () => {
      const res = confirm("tarihi 7 Ekim 2026 yapalım");
      expect(res.outcome).toBe("invalid");
      expect(res.nextDraft.requestedDate).not.toBe("2027-10-07");
    });
  });
});
