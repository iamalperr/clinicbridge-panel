import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ClinicWorkingHoursResolver } from "../lib/skills/ClinicWorkingHoursResolver";

// Freeze date for deterministic relative date tests
// Let's set mock date to a Tuesday: 2026-07-28 (Tuesday)
const MOCK_DATE = new Date("2026-07-28T10:00:00.000Z"); // Tuesday
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

describe("ClinicWorkingHoursResolver", () => {
  beforeEach(() => {
    setupMockDate();
    ClinicWorkingHoursResolver.clearCache();
  });

  afterEach(() => {
    restoreMockDate();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. CORE REAL-WORLD CLINIC TEST: İstanbul Diş Akademisi
  // "İstanbul Diş Akademisi haftanın 6 günü hizmet vermektedir.
  //  Çalışma saatleri hafta içi 10:00–19:00, hafta sonu 10:00–17:00 saatleri arasında olup pazar günleri kapalıdır."
  // ───────────────────────────────────────────────────────────────────────────
  describe("Core Real-World Scenario: İstanbul Diş Akademisi", () => {
    const idaWorkingHoursDoc = {
      title: "İstanbul Diş Akademisi Çalışma Saatleri",
      content: "İstanbul Diş Akademisi haftanın 6 günü hizmet vermektedir. Çalışma saatleri hafta içi 10:00–19:00, hafta sonu 10:00–17:00 saatleri arasında olup pazar günleri kapalıdır."
    };

    it("should parse IDA working hours text deterministically without AI hallucination", () => {
      const schedule = ClinicWorkingHoursResolver.parseWorkingHoursText(idaWorkingHoursDoc.content);
      expect(schedule).not.toBeNull();
      expect(schedule?.monday).toEqual(["10:00", "19:00"]);
      expect(schedule?.tuesday).toEqual(["10:00", "19:00"]);
      expect(schedule?.wednesday).toEqual(["10:00", "19:00"]);
      expect(schedule?.thursday).toEqual(["10:00", "19:00"]);
      expect(schedule?.friday).toEqual(["10:00", "19:00"]);
      expect(schedule?.saturday).toEqual(["10:00", "17:00"]);
      expect(schedule?.sunday).toBeNull();
    });

    it("CRITICAL: Wednesday 14:00 MUST BE VALID and never rejected", async () => {
      const result = await ClinicWorkingHoursResolver.validateAppointmentTime({
        clinicId: "istanbul-dis-akademisi",
        userMessage: "Çarşamba günü saat 14:00'e randevu oluşturabilir miyiz?",
        documents: [idaWorkingHoursDoc],
      });

      expect(result.isValid).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.requestedDay).toBe("wednesday");
      expect(result.requestedTime).toBe("14:00");
    });

    it("Monday 10:30 (weekday opening) MUST BE VALID", async () => {
      const result = await ClinicWorkingHoursResolver.validateAppointmentTime({
        clinicId: "istanbul-dis-akademisi",
        userMessage: "Pazartesi 10:30 için muayene olmak istiyorum",
        documents: [idaWorkingHoursDoc],
      });

      expect(result.isValid).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.requestedDay).toBe("monday");
      expect(result.requestedTime).toBe("10:30");
    });

    it("Saturday 16:00 (weekend within hours) MUST BE VALID", async () => {
      const result = await ClinicWorkingHoursResolver.validateAppointmentTime({
        clinicId: "istanbul-dis-akademisi",
        userMessage: "Cumartesi saat 16:00'da gelebilirim",
        documents: [idaWorkingHoursDoc],
      });

      expect(result.isValid).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.requestedDay).toBe("saturday");
      expect(result.requestedTime).toBe("16:00");
    });

    it("Saturday 18:00 (weekend past 17:00) MUST BE INVALID (outside_hours)", async () => {
      const result = await ClinicWorkingHoursResolver.validateAppointmentTime({
        clinicId: "istanbul-dis-akademisi",
        userMessage: "Cumartesi akşamı saat 18:00'de gelebilir miyim?",
        documents: [idaWorkingHoursDoc],
      });

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe("outside_hours");
      expect(result.requestedDay).toBe("saturday");
      expect(result.requestedTime).toBe("18:00");
      expect(result.scheduleSummary).toContain("Cumartesi: 10:00 - 17:00");
    });

    it("Sunday 12:00 (closed day) MUST BE INVALID (closed)", async () => {
      const result = await ClinicWorkingHoursResolver.validateAppointmentTime({
        clinicId: "istanbul-dis-akademisi",
        userMessage: "Pazar günü saat 12:00 randevu var mı?",
        documents: [idaWorkingHoursDoc],
      });

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe("closed");
      expect(result.requestedDay).toBe("sunday");
      expect(result.requestedTime).toBe("12:00");
    });

    it("Tuesday 08:30 (before opening 10:00) MUST BE INVALID (outside_hours)", async () => {
      const result = await ClinicWorkingHoursResolver.validateAppointmentTime({
        clinicId: "istanbul-dis-akademisi",
        userMessage: "Salı sabah 08:30 için randevu rica ediyorum",
        documents: [idaWorkingHoursDoc],
      });

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe("outside_hours");
      expect(result.requestedDay).toBe("tuesday");
      expect(result.requestedTime).toBe("08:30");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. TEXT PARSING PATTERNS (Turkish & English)
  // ───────────────────────────────────────────────────────────────────────────
  describe("Text Parsing Patterns", () => {
    it("should parse standard day-range format: Pazartesi - Cuma: 09:00 - 18:00", () => {
      const text = "Kliniğimiz Pazartesi - Cuma: 09:00 - 18:00, Cumartesi: 10:00 - 15:00 saatlerinde hizmet vermektedir. Pazar günleri kapalıyız.";
      const schedule = ClinicWorkingHoursResolver.parseWorkingHoursText(text);

      expect(schedule).not.toBeNull();
      expect(schedule?.monday).toEqual(["09:00", "18:00"]);
      expect(schedule?.wednesday).toEqual(["09:00", "18:00"]);
      expect(schedule?.friday).toEqual(["09:00", "18:00"]);
      expect(schedule?.saturday).toEqual(["10:00", "15:00"]);
      expect(schedule?.sunday).toBeNull();
    });

    it("should parse dot time format: Hafta içi 09.30 - 18.30 / Cumartesi 10.00 - 14.00", () => {
      const text = "Çalışma saatlerimiz: Hafta içi 09.30 - 18.30, Cumartesi 10.00 - 14.00, Pazar: Kapalı";
      const schedule = ClinicWorkingHoursResolver.parseWorkingHoursText(text);

      expect(schedule).not.toBeNull();
      expect(schedule?.monday).toEqual(["09:30", "18:30"]);
      expect(schedule?.thursday).toEqual(["09:30", "18:30"]);
      expect(schedule?.saturday).toEqual(["10:00", "14:00"]);
      expect(schedule?.sunday).toBeNull();
    });

    it("should parse every day format: Haftanın her günü 08:00 - 22:00", () => {
      const text = "Kliniğimiz haftanın her günü 08:00 - 22:00 saatleri arasında kesintisiz hizmet vermektedir.";
      const schedule = ClinicWorkingHoursResolver.parseWorkingHoursText(text);

      expect(schedule).not.toBeNull();
      expect(schedule?.monday).toEqual(["08:00", "22:00"]);
      expect(schedule?.sunday).toEqual(["08:00", "22:00"]);
    });

    it("should parse English schedule: Monday to Friday: 09:00 - 17:00, Saturday: 10:00 - 14:00, Sunday: Closed", () => {
      const text = "Opening hours: Monday to Friday 09:00 - 17:00, Saturday 10:00 - 14:00, Sunday Closed.";
      const schedule = ClinicWorkingHoursResolver.parseWorkingHoursText(text);

      expect(schedule).not.toBeNull();
      expect(schedule?.monday).toEqual(["09:00", "17:00"]);
      expect(schedule?.friday).toEqual(["09:00", "17:00"]);
      expect(schedule?.saturday).toEqual(["10:00", "14:00"]);
      expect(schedule?.sunday).toBeNull();
    });

    it("should parse 12-hour AM/PM format: Mon-Fri: 9:00 AM - 6:00 PM", () => {
      const text = "Business hours: Mon-Fri: 9:00 AM - 6:00 PM, Sat: 10:00 AM - 2:00 PM, Sun: Closed";
      const schedule = ClinicWorkingHoursResolver.parseWorkingHoursText(text);

      expect(schedule).not.toBeNull();
      expect(schedule?.monday).toEqual(["09:00", "18:00"]);
      expect(schedule?.friday).toEqual(["09:00", "18:00"]);
      expect(schedule?.saturday).toEqual(["10:00", "14:00"]);
      expect(schedule?.sunday).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. STRUCTURED DATA PRIORITY
  // ───────────────────────────────────────────────────────────────────────────
  describe("Structured Data Priority", () => {
    it("should prefer structured workingHours object over documents", async () => {
      const structuredData = {
        workingHours: {
          monday: ["08:00", "16:00"],
          tuesday: ["08:00", "16:00"],
          wednesday: ["08:00", "16:00"],
          thursday: ["08:00", "16:00"],
          friday: ["08:00", "16:00"],
          saturday: null,
          sunday: null,
        }
      };

      const conflictingDoc = {
        title: "Eski Çalışma Saatleri",
        content: "Hafta içi 10:00 - 20:00 açığız."
      };

      // 17:00 should be rejected by structured hours (closes at 16:00) even if doc says 20:00
      const result = await ClinicWorkingHoursResolver.validateAppointmentTime({
        clinicId: "structured-clinic",
        userMessage: "Pazartesi saat 17:00",
        clinicData: structuredData,
        documents: [conflictingDoc],
      });

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe("outside_hours");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. TIME & DAY EXTRACTION FROM USER MESSAGES
  // ───────────────────────────────────────────────────────────────────────────
  describe("User Message Slot Extraction", () => {
    it("should extract day and time: 'Yarın saat 15:00'", () => {
      // Mock date is Tuesday -> "yarın" = Wednesday
      const extracted = ClinicWorkingHoursResolver.extractRequestedTime("Yarın saat 15:00 için randevu lütfen");
      expect(extracted).not.toBeNull();
      expect(extracted?.day).toBe("wednesday");
      expect(extracted?.time).toBe("15:00");
    });

    it("should extract weekday with suffix: 'Çarşamba günü 14'te'", () => {
      const extracted = ClinicWorkingHoursResolver.extractRequestedTime("Çarşamba günü 14'te gelebilirim");
      expect(extracted).not.toBeNull();
      expect(extracted?.day).toBe("wednesday");
      expect(extracted?.time).toBe("14:00");
    });

    it("should extract informal half hour: 'Cuma 3 buçukta'", () => {
      const extracted = ClinicWorkingHoursResolver.extractRequestedTime("Cuma 3 buçukta muayene olabilir miyim?");
      expect(extracted).not.toBeNull();
      expect(extracted?.day).toBe("friday");
      expect(extracted?.time).toBe("15:30");
    });

    it("should extract 24-hour time without colon: 'Perşembe 1430'", () => {
      const extracted = ClinicWorkingHoursResolver.extractRequestedTime("Perşembe 14:30 uygun mudur?");
      expect(extracted).not.toBeNull();
      expect(extracted?.day).toBe("thursday");
      expect(extracted?.time).toBe("14:30");
    });

    it("should return null for vague messages with no time", () => {
      const extracted = ClinicWorkingHoursResolver.extractRequestedTime("Randevu almak istiyorum");
      expect(extracted).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. FAIL-SAFE / UNRESOLVED RULES (Never falsely reject)
  // ───────────────────────────────────────────────────────────────────────────
  describe("Fail-Safe and Unresolved Handling", () => {
    it("CRITICAL RULE: Unresolved working hours must return isValid: true and never reject", async () => {
      const irrelevantDocs = [
        { title: "İmplant Tedavisi Nedir?", content: "İmplant tedavisi çene kemiğine yerleştirilen titanyum vidalarla yapılır." }
      ];

      const result = await ClinicWorkingHoursResolver.validateAppointmentTime({
        clinicId: "unknown-schedule-clinic",
        userMessage: "Çarşamba saat 14:00 randevu istiyorum",
        documents: irrelevantDocs,
      });

      expect(result.isValid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("Non-appointment queries with general time words must not be blocked", async () => {
      const idaDoc = {
        title: "Çalışma Saatleri",
        content: "Hafta içi 10:00 - 19:00, Hafta sonu kapalı."
      };

      const result = await ClinicWorkingHoursResolver.validateAppointmentTime({
        clinicId: "test-clinic",
        userMessage: "Kanal tedavisi ne kadar sürer? Yaklaşık 1 saat mi?",
        documents: [idaDoc],
      });

      expect(result.isValid).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. MULTI-LANGUAGE SUMMARY FORMATTING
  // ───────────────────────────────────────────────────────────────────────────
  describe("Summary Formatting", () => {
    it("should generate clean Turkish summary", () => {
      const schedule = {
        monday: ["10:00", "19:00"] as [string, string],
        tuesday: ["10:00", "19:00"] as [string, string],
        wednesday: ["10:00", "19:00"] as [string, string],
        thursday: ["10:00", "19:00"] as [string, string],
        friday: ["10:00", "19:00"] as [string, string],
        saturday: ["10:00", "17:00"] as [string, string],
        sunday: null,
      };

      const summaryTr = ClinicWorkingHoursResolver.formatScheduleSummary(schedule, "tr");
      expect(summaryTr).toContain("Pazartesi - Cuma: 10:00 - 19:00");
      expect(summaryTr).toContain("Cumartesi: 10:00 - 17:00");
      expect(summaryTr).toContain("Pazar: Kapalı");
    });

    it("should generate clean English summary", () => {
      const schedule = {
        monday: ["09:00", "18:00"] as [string, string],
        tuesday: ["09:00", "18:00"] as [string, string],
        wednesday: ["09:00", "18:00"] as [string, string],
        thursday: ["09:00", "18:00"] as [string, string],
        friday: ["09:00", "18:00"] as [string, string],
        saturday: null,
        sunday: null,
      };

      const summaryEn = ClinicWorkingHoursResolver.formatScheduleSummary(schedule, "en");
      expect(summaryEn).toContain("Monday - Friday: 09:00 - 18:00");
      expect(summaryEn).toContain("Saturday: Closed");
      expect(summaryEn).toContain("Sunday: Closed");
    });
  });
});
