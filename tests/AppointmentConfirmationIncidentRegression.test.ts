/**
 * Regression: İstanbul Diş Akademisi incident — 11,00 sabah → 10:00
 * and confirmation while appointmentDraft failed to persist.
 */
import { describe, it, expect } from "vitest";
import { SlotExtractor, PendingActionManager } from "../lib/conversation";
import { stripUndefinedDeep } from "../lib/firestore/stripUndefined";
import { applyConfirmationAmendment } from "../lib/conversation/appointmentConfirmationAmendment";
import type { WeeklySchedule } from "../lib/skills/ClinicWorkingHoursResolver";

const FIXED_NOW = new Date("2026-08-20T08:00:00.000Z");
const HOURS: WeeklySchedule = {
  monday: ["09:00", "21:00"],
  tuesday: ["09:00", "21:00"],
  wednesday: ["09:00", "21:00"],
  thursday: ["09:00", "21:00"],
  friday: ["09:00", "21:00"],
  saturday: ["09:00", "21:00"],
  sunday: ["09:00", "21:00"],
};

describe("Incident time parsing (11:00 must not become 10:00)", () => {
  it.each([
    ["11", "11:00"],
    ["11.00", "11:00"],
    ["11,00", "11:00"],
    ["11:00", "11:00"],
    ["11,00 sabah", "11:00"],
    ["saat 11", "11:00"],
    ["saat 11.00", "11:00"],
    ["sabah 11", "11:00"],
    ["11 am", "11:00"],
  ])("%j → %s", (raw, expected) => {
    const res = SlotExtractor.parseTime(raw, raw.toLowerCase());
    expect(res?.time).toBe(expected);
  });

  it("bare sabah without hour still maps to morning default 10:00", () => {
    expect(SlotExtractor.parseTime("sabah", "sabah")?.time).toBe("10:00");
  });
});

describe("Confirmation robustness", () => {
  it.each([
    "evet",
    "onaylıyorum",
    "onayliyorum",
    "evet onaylıyorum",
    "tamam",
    "bilgiler doğru",
    "iletebilirsiniz",
    "uygundur",
    "kabul ediyorum",
    "gönder",
    "doğru",
  ])("recognizes %j as confirmation", (msg) => {
    expect(PendingActionManager.isConfirmation(msg)).toBe(true);
  });
});

describe("Confirmation-stage time correction then confirm", () => {
  it("saat 11.00 amends 10:00 draft to 11:00 and keeps review state fields", () => {
    const draft = {
      patientName: "arzu baran",
      patientPhone: "+905327257229",
      patientEmail: "ekvatorarzu@hotmail.com",
      requestedService: "Genel Muayene",
      requestedDate: "2026-08-26",
      requestedTime: "10:00",
    };
    const amended = applyConfirmationAmendment({
      message: "saat 11.00",
      locale: "tr",
      draft,
      clinicTimeZone: "Europe/Istanbul",
      now: FIXED_NOW,
      workingHours: HOURS,
    });
    expect(amended.outcome).toBe("applied");
    expect(amended.nextDraft.requestedTime).toBe("11:00");
    expect(amended.nextDraft.requestedDate).toBe("2026-08-26");
    expect(amended.nextDraft.patientEmail).toBe("ekvatorarzu@hotmail.com");
    expect(amended.nextDraft.patientName).toBe("arzu baran");
  });
});

describe("Firestore undefined strip for appointment draft persistence", () => {
  it("removes undefined nested fields so Firestore writes succeed", () => {
    const cleaned = stripUndefinedDeep({
      appointmentState: "AWAITING_CONFIRMATION",
      appointmentDraft: {
        patientName: "arzu baran",
        patientEmail: "ekvatorarzu@hotmail.com",
        requestedTime: "11:00",
        preferredTimeStart: undefined,
        preferredTimeEnd: undefined,
        notes: undefined,
      },
    });
    expect(cleaned.appointmentDraft).toEqual({
      patientName: "arzu baran",
      patientEmail: "ekvatorarzu@hotmail.com",
      requestedTime: "11:00",
    });
    expect(JSON.stringify(cleaned)).not.toContain("undefined");
  });

  it("keeps null values (Firestore-legal) while dropping undefined", () => {
    const cleaned = stripUndefinedDeep({ a: null, b: undefined, c: "x" });
    expect(cleaned).toEqual({ a: null, c: "x" });
  });
});
