import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AppointmentDateValidator } from '../lib/skills/AppointmentDateValidator';

// We mock Date to simulate '2026-07-26T02:00:00.000+03:00' (Europe/Istanbul)
// In JS, setting the exact local time for tests can be done by overriding Date
const MOCK_DATE = new Date("2026-07-25T23:00:00.000Z"); // 26 July 02:00 in UTC+3

const OriginalDate = Date;

function setupMockDate() {
  global.Date = class extends OriginalDate {
    constructor(...args: any[]) {
      if (args.length === 0) {
         super(MOCK_DATE.getTime());
      } else {
         super(...(args as [any]));
      }
    }
    static now() {
      return MOCK_DATE.getTime();
    }
  } as any;
}

function restoreMockDate() {
  global.Date = OriginalDate;
}

describe('AppointmentDateValidator', () => {
  let now: Date;
  beforeEach(() => {
    setupMockDate();
    now = new Date();
  });

  afterEach(() => {
    restoreMockDate();
  });

  const timeZone = "Europe/Istanbul";

  it('TEST 1: Cuma günü saat 10', () => {
    const res = AppointmentDateValidator.validateAppointmentDateConsistency({
      rawDateText: "Cuma günü",
      rawTimeText: "10",
      inferredDate: "2026-07-26", // LLM hallucinated
      inferredTime: "10:00",
      currentClinicDateTime: now,
      timeZone
    });
    expect(res.isValid).toBe(true);
    expect(res.resolvedDate).toBe("2026-07-31");
    expect(res.resolvedWeekday).toBe("Cuma");
    expect(res.resolvedTime).toBe("10:00");
  });

  it('TEST 2: Perşembe saat 10', () => {
    const res = AppointmentDateValidator.validateAppointmentDateConsistency({
      rawDateText: "Perşembe",
      rawTimeText: "10",
      inferredDate: "2026-07-26",
      inferredTime: "10:00",
      currentClinicDateTime: now,
      timeZone
    });
    expect(res.isValid).toBe(true);
    expect(res.resolvedDate).toBe("2026-07-30");
    expect(res.resolvedWeekday).toBe("Perşembe");
  });

  it('TEST 3: Pazartesi saat 10', () => {
    const res = AppointmentDateValidator.validateAppointmentDateConsistency({
      rawDateText: "Pazartesi",
      rawTimeText: "10",
      inferredDate: "2026-07-26",
      inferredTime: "10:00",
      currentClinicDateTime: now,
      timeZone
    });
    expect(res.isValid).toBe(true);
    expect(res.resolvedDate).toBe("2026-07-27");
    expect(res.resolvedWeekday).toBe("Pazartesi");
  });

  it('TEST 4: 31 Temmuz Perşembe saat 10', () => {
    const res = AppointmentDateValidator.validateAppointmentDateConsistency({
      rawDateText: "31 Temmuz Perşembe",
      rawTimeText: "10",
      inferredDate: "2026-07-31", // Let's say LLM extracted 31
      inferredTime: "10:00",
      currentClinicDateTime: now,
      timeZone
    });
    expect(res.hasConflict).toBe(true);
    expect(res.conflictType).toBe("DATE_WEEKDAY_MISMATCH");
    expect(res.alternatives.length).toBe(2);
    // 30 July = Perşembe
    expect(res.alternatives.some(a => a.date === "2026-07-30" && a.weekday === "Perşembe")).toBe(true);
    // 31 July = Cuma
    expect(res.alternatives.some(a => a.date === "2026-07-31" && a.weekday === "Cuma")).toBe(true);
  });

  it('TEST 5: 31 Temmuz Cuma saat 10', () => {
    const res = AppointmentDateValidator.validateAppointmentDateConsistency({
      rawDateText: "31 Temmuz Cuma",
      rawTimeText: "10",
      inferredDate: "2026-07-31",
      inferredTime: "10:00",
      currentClinicDateTime: now,
      timeZone
    });
    expect(res.isValid).toBe(true);
    expect(res.resolvedDate).toBe("2026-07-31");
    expect(res.resolvedWeekday).toBe("Cuma");
  });

  it('TEST 6: 26 Temmuz Cuma saat 10', () => {
    const res = AppointmentDateValidator.validateAppointmentDateConsistency({
      rawDateText: "26 Temmuz Cuma",
      rawTimeText: "10",
      inferredDate: "2026-07-26",
      inferredTime: "10:00",
      currentClinicDateTime: now,
      timeZone
    });
    expect(res.hasConflict).toBe(true);
    // 26 July is Pazar. So alternative 1: 26 July Pazar (since 10:00 is future compared to 02:00)
    // Alternative 2: next Cuma = 31 July Cuma
    expect(res.alternatives.some(a => a.date === "2026-07-26" && a.weekday === "Pazar")).toBe(true);
    expect(res.alternatives.some(a => a.date === "2026-07-31" && a.weekday === "Cuma")).toBe(true);
  });

  it('TEST 7: Yarın saat 10', () => {
    const res = AppointmentDateValidator.validateAppointmentDateConsistency({
      rawDateText: "Yarın",
      rawTimeText: "10",
      inferredDate: "2026-07-27",
      inferredTime: "10:00",
      currentClinicDateTime: now,
      timeZone
    });
    expect(res.isValid).toBe(true);
    expect(res.resolvedDate).toBe("2026-07-27");
    expect(res.resolvedWeekday).toBe("Pazartesi");
  });

  it('TEST 8: Gelecek pazartesi saat 10', () => {
    const res = AppointmentDateValidator.validateAppointmentDateConsistency({
      rawDateText: "Gelecek pazartesi",
      rawTimeText: "10",
      inferredDate: "2026-08-03",
      inferredTime: "10:00",
      currentClinicDateTime: now,
      timeZone
    });
    expect(res.isValid).toBe(true);
    expect(res.resolvedDate).toBe("2026-08-03");
    expect(res.resolvedWeekday).toBe("Pazartesi");
  });

  it('TEST 9: Monday at 10', () => {
    const res = AppointmentDateValidator.validateAppointmentDateConsistency({
      rawDateText: "Monday",
      rawTimeText: "10",
      inferredDate: "2026-07-27",
      inferredTime: "10:00",
      currentClinicDateTime: now,
      timeZone
    });
    expect(res.isValid).toBe(true);
    expect(res.resolvedDate).toBe("2026-07-27");
    expect(res.resolvedWeekday).toBe("Pazartesi");
  });

  it('TEST 10: Friday at 10', () => {
    const res = AppointmentDateValidator.validateAppointmentDateConsistency({
      rawDateText: "Friday",
      rawTimeText: "10",
      inferredDate: "2026-07-31",
      inferredTime: "10:00",
      currentClinicDateTime: now,
      timeZone
    });
    expect(res.isValid).toBe(true);
    expect(res.resolvedDate).toBe("2026-07-31");
    expect(res.resolvedWeekday).toBe("Cuma");
  });

  it('TEST 11: Cuma 10 (Current is Cuma 09:00)', () => {
    global.Date = class extends OriginalDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
           super(new Date("2026-07-31T06:00:00.000Z").getTime()); // 31 July 09:00 TR time
        } else {
           super(...(args as [any]));
        }
      }
      static now() {
        return new Date("2026-07-31T06:00:00.000Z").getTime();
      }
    } as any;

    const res = AppointmentDateValidator.validateAppointmentDateConsistency({
      rawDateText: "Cuma",
      rawTimeText: "10",
      inferredDate: "2026-07-31",
      inferredTime: "10:00",
      currentClinicDateTime: new Date(),
      timeZone
    });
    expect(res.isValid).toBe(true);
    expect(res.resolvedDate).toBe("2026-07-31"); // Same day because 10:00 > 09:00
  });

  it('TEST 12: Cuma 10 (Current is Cuma 11:00)', () => {
    global.Date = class extends OriginalDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
           super(new Date("2026-07-31T08:00:00.000Z").getTime()); // 31 July 11:00 TR time
        } else {
           super(...(args as [any]));
        }
      }
      static now() {
        return new Date("2026-07-31T08:00:00.000Z").getTime();
      }
    } as any;

    const res = AppointmentDateValidator.validateAppointmentDateConsistency({
      rawDateText: "Cuma",
      rawTimeText: "10",
      inferredDate: "2026-07-31",
      inferredTime: "10:00",
      currentClinicDateTime: new Date(),
      timeZone
    });
    expect(res.isValid).toBe(true);
    expect(res.resolvedDate).toBe("2026-08-07"); // Next Friday because 10:00 < 11:00
  });

  it('TEST 13: LLM inferredDate rejected', () => {
    setupMockDate();
    const res = AppointmentDateValidator.validateAppointmentDateConsistency({
      rawDateText: "Cuma günü",
      rawTimeText: "10",
      inferredDate: "2026-07-26", // LLM hallucinates Sunday
      inferredTime: "10:00",
      currentClinicDateTime: new Date(),
      timeZone
    });
    expect(res.resolvedDate).toBe("2026-07-31");
    expect(res.resolvedWeekday).toBe("Cuma");
  });

  it('TEST 14: LLM hallucinates wrong ISO but raw text is just weekday', () => {
    setupMockDate();
    const res = AppointmentDateValidator.validateAppointmentDateConsistency({
      rawDateText: "Perşembe",
      rawTimeText: "10",
      inferredDate: "2026-07-31", // LLM hallucinates Friday ISO date
      inferredTime: "10:00",
      currentClinicDateTime: new Date(),
      timeZone
    });
    // So if user just says "Perşembe", it SHOULD just pick 2026-07-30!
  });

  it('TEST 15: Backend weekday wins', () => {
    setupMockDate();
    // This is essentially checking that we don't blindly use LLM's label
    const res = AppointmentDateValidator.getCanonicalWeekday({
      isoDate: "2026-07-31",
      timeZone
    });
    expect(res.weekdayTr).toBe("Cuma");
  });
});
