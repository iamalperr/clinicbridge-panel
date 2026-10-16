/**
 * Phase 3 Step 6B.4.1 — Turkish spoken-number compatibility.
 *
 * Voice STT runs with numerals/smart_format off, so Agent Core receives
 * "on iki ekim saat üç" instead of "12 Ekim saat 15:00". Every assertion here
 * goes through the production extractor / amendment / validator / Agent Core;
 * no parallel parser is used.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SlotExtractor } from "@/lib/conversation/slotExtractor";
import { IntentRouter } from "@/lib/conversation/intentRouter";
import { applyAppointmentSchedulingAmendment } from "@/lib/conversation/appointmentSchedulingAmendment";
import {
  normalizeTurkishSpokenTemporal,
  spokenTurkishPhoneDigits,
} from "@/lib/conversation/turkishSpokenNumbers";
import { AppointmentDateValidator } from "@/lib/skills/AppointmentDateValidator";
import type { WeeklySchedule } from "@/lib/skills/ClinicWorkingHoursResolver";
import { RequestTimer } from "@/lib/performance/requestTimer";
import { createInMemoryCallSessionStore, processVoiceTurn, startCallSession } from "@/lib/voice";

const REPO = resolve(__dirname, "..");
const TZ = "Europe/Istanbul";
/** Thursday 8 Oct 2026, 12:00 Istanbul */
const NOW = new Date("2026-10-08T09:00:00.000Z");

const HOURS: WeeklySchedule = {
  monday: ["10:00", "19:00"],
  tuesday: ["10:00", "19:00"],
  wednesday: ["10:00", "19:00"],
  thursday: ["10:00", "19:00"],
  friday: ["10:00", "19:00"],
  saturday: ["10:00", "17:00"],
  sunday: null,
};

function extract(message: string, opts: { expectedSlot?: string; existing?: Record<string, unknown> } = {}) {
  return SlotExtractor.extractSlots(message, (opts.existing || {}) as any, "tr", TZ, opts.expectedSlot, NOW);
}

function scheduling(message: string) {
  const { extracted } = extract(message, { expectedSlot: "preferredDate" });
  return {
    preferredDate: extracted.preferredDate,
    preferredTime: extracted.preferredTime,
    pendingMonth: extracted.pendingAppointmentDate?.month,
    invalidCivilDate: extracted.invalidCivilDate,
  };
}

function amend(message: string, draft: Record<string, unknown> = {}, extra: { workingHours?: WeeklySchedule; expectedSlot?: string } = {}) {
  return applyAppointmentSchedulingAmendment({
    message,
    draft: draft as any,
    locale: "tr",
    clinicTimeZone: TZ,
    now: NOW,
    workingHours: extra.workingHours ?? null,
    is24_7: extra.workingHours ? false : true,
    expectedSlot: extra.expectedSlot ?? "preferredDate",
  });
}

describe("A. spoken dates", () => {
  it.each([
    ["on iki ekim", "2026-10-12", "Pazartesi"],
    ["on ikinci ekim", "2026-10-12", "Pazartesi"],
    ["ekimin on ikisi", "2026-10-12", "Pazartesi"],
    ["ekimin on ikisinde", "2026-10-12", "Pazartesi"],
    ["yirmi beş aralık", "2026-12-25", "Cuma"],
    ["beş şubat", "2027-02-05", "Cuma"],
    ["on iki ekimde gelebilirim", "2026-10-12", "Pazartesi"],
    ["ekim on iki", "2026-10-12", "Pazartesi"],
    ["on iki ekim iki bin yirmi yedi", "2027-10-12", "Salı"],
  ])("%s → %s", (input, iso, weekday) => {
    const { extracted } = extract(input, { expectedSlot: "preferredDate" });
    expect(extracted.preferredDate).toBe(iso);
    expect(extracted.preferredWeekday).toBe(weekday);
    expect(extracted.pendingAppointmentDate).toBeUndefined();
    expect(extracted.preferredTime).toBeUndefined();
  });

  it("day is no longer dropped into a month-only pending date", () => {
    const res = amend("on iki ekim");
    expect(res.outcome).toBe("applied");
    expect(res.draft.requestedDate).toBe("2026-10-12");
    expect(res.draft.pendingAppointmentDate).toBeUndefined();
  });
});

describe("B. spoken clock times", () => {
  it.each([
    ["saat üç", "03:00"],
    ["saat on dört", "14:00"],
    ["saat on dört otuz", "14:30"],
    ["üç buçuk", "03:30"],
    ["öğleden sonra üç", "15:00"],
    ["akşam yedi", "19:00"],
    ["akşam yedide", "19:00"],
    ["sabah dokuz buçuk", "09:30"],
    ["öğlen bir", "13:00"],
    ["saat üçü çeyrek geçe", "03:15"],
    ["saat dörde on var", "03:50"],
    ["öğleden sonra saat dörde çeyrek var", "15:45"],
  ])("%s → %s", (input, time) => {
    const { extracted } = extract(input, { expectedSlot: "preferredTime" });
    expect(extracted.preferredTime).toBe(time);
    expect(extracted.preferredDate).toBeUndefined();
  });

  it("possessive hour without geçe never silently drops minutes", () => {
    expect(extract("saat üçü", { expectedSlot: "preferredTime" }).extracted.preferredTime).toBeUndefined();
  });

  it("bare 'saat üç' keeps the same 24h reading as typed 'saat 3' (no invented PM)", () => {
    expect(scheduling("saat üç")).toEqual(scheduling("saat 3"));
  });
});

describe("C. combined date + time", () => {
  it("on iki ekim saat üç uygun mu", () => {
    const res = amend("on iki ekim saat üç uygun mu");
    expect(res.outcome).toBe("applied");
    expect(res.draft.requestedDate).toBe("2026-10-12");
    expect(res.draft.requestedTime).toBe("03:00");
  });

  it("on iki ekim pazartesi saat üçte — explicit date wins, weekday consistent", () => {
    const { extracted } = extract("on iki ekim pazartesi saat üçte", { expectedSlot: "preferredDate" });
    expect(extracted.preferredDate).toBe("2026-10-12");
    expect(extracted.preferredWeekday).toBe("Pazartesi");
    expect(extracted.preferredTime).toBe("03:00");
  });

  it("cumartesi öğleden sonra üç", () => {
    const res = amend("cumartesi öğleden sonra üç", {}, { workingHours: HOURS });
    expect(res.outcome).toBe("applied");
    expect(res.draft.requestedDate).toBe("2026-10-10");
    expect(res.draft.requestedTime).toBe("15:00");
  });

  it("randevumu saat on dörtten on ikiye alabilir miyiz → target 12:00", () => {
    const res = amend(
      "randevumu saat on dörtten on ikiye alabilir miyiz",
      { requestedDate: "2026-10-12", requestedTime: "14:00" },
      { workingHours: HOURS, expectedSlot: "confirmation" }
    );
    expect(res.outcome).toBe("applied");
    expect(res.draft.requestedDate).toBe("2026-10-12");
    expect(res.draft.requestedTime).toBe("12:00");
  });

  it("yarın on dört otuz → tomorrow 14:30", () => {
    const res = amend("yarın on dört otuz", {}, { workingHours: HOURS });
    expect(res.outcome).toBe("applied");
    expect(res.draft.requestedDate).toBe("2026-10-09");
    expect(res.draft.requestedTime).toBe("14:30");
  });

  it("IntentRouter classifies spoken and digit combined requests identically", () => {
    const route = (message: string) => {
      const r = IntentRouter.classifyConversationIntent({
        message,
        currentState: "APPOINTMENT_COLLECTION",
        currentFlow: "appointment",
        expectedSlot: "preferredDate",
        collectedSlots: {},
        locale: "tr",
        clinicTimeZone: TZ,
        now: NOW,
      } as any);
      return { intent: r.intent, isInterruption: r.isInterruption, d: r.entities?.preferredDate, t: r.entities?.preferredTime };
    };
    expect(route("on iki ekim saat on dört uygun mu")).toEqual(route("12 ekim saat 14 uygun mu"));
    expect(route("on iki ekim saat on dört uygun mu").d).toBe("2026-10-12");
    expect(route("cumartesi öğleden sonra üç").t).toBe("15:00");
  });
});

describe("D. corrections", () => {
  it("'on iki ekim saat üç' then 'hayır saat on iki olsun' keeps date, uses corrected time", () => {
    const first = amend("on iki ekim saat üç");
    expect(first.outcome).toBe("applied");
    expect(first.draft.requestedTime).toBe("03:00");

    const second = amend("hayır saat on iki olsun", first.draft, { expectedSlot: "confirmation" });
    expect(second.outcome).toBe("applied");
    expect(second.draft.requestedDate).toBe("2026-10-12");
    expect(second.draft.requestedTime).toBe("12:00");
  });

  it("'X değil Y olsun' correction with spoken dates", () => {
    const res = extract("on iki ekim değil on üç ekim olsun");
    expect(res.isCorrection).toBe(true);
    expect(res.correctedSlotKey).toBe("preferredDate");
    expect(res.extracted.preferredDate).toBe("2026-10-13");
  });

  it("'X değil Y olsun' correction with spoken times", () => {
    const res = extract("saat üç değil saat dört olsun");
    expect(res.isCorrection).toBe(true);
    expect(res.extracted.preferredTime).toBe("04:00");
  });
});

describe("E. spoken phone numbers", () => {
  it("complete local mobile", () => {
    expect(SlotExtractor.parsePhone("telefon numaram sıfır beş yüz otuz iki iki yüz doksan bir kırk beş altmış yedi")).toBe(
      "+90 532 291 45 67"
    );
  });

  it("complete +90 mobile ('artı doksan beş yüz otuz iki ...')", () => {
    expect(SlotExtractor.parsePhone("artı doksan beş yüz otuz iki iki yüz doksan bir kırk beş altmış yedi")).toBe(
      "+90 532 291 45 67"
    );
  });

  it("incomplete numbers are never completed", () => {
    expect(SlotExtractor.parsePhone("telefon numaram sıfır beş yüz otuz bir iki yüz doksan")).toBeNull();
    expect(SlotExtractor.parsePhone("artı doksan beş yüz otuz iki")).toBeNull();
    expect(extract("telefon numaram sıfır beş yüz otuz bir iki yüz doksan").extracted.phone).toBeUndefined();
  });

  it("spoken phone reaches the phone slot through extractSlots", () => {
    expect(extract("numaram sıfır beş yüz otuz iki iki yüz doksan bir kırk beş altmış yedi", { expectedSlot: "phone" }).extracted.phone).toBe(
      "+90 532 291 45 67"
    );
  });

  it("date/time speech never becomes a phone", () => {
    expect(extract("on iki ekim saat on dört otuz").extracted.phone).toBeUndefined();
    expect(spokenTurkishPhoneDigits("on iki ekim saat on dört otuz")).toBeNull();
  });

  it("typed phones are unchanged", () => {
    expect(SlotExtractor.parsePhone("0532 291 45 67")).toBe("+90 532 291 45 67");
    expect(SlotExtractor.parsePhone("+905322914567")).toBe("+90 532 291 45 67");
  });
});

describe("F. prices and percentages stay inert", () => {
  it.each(["iki bin beş yüz TL", "yüzde yirmi", "iki buçuk bin TL", "iki buçuk saat sürer mi", "yarın iki üç kişi geliriz"])(
    "%s → no time; prices/percent no date",
    (input) => {
      const { extracted } = extract(input, { expectedSlot: "preferredTime" });
      expect(extracted.preferredTime).toBeUndefined();
      expect(extracted.phone).toBeUndefined();
    }
  );

  it("price and percent text is not rewritten", () => {
    for (const s of ["iki bin beş yüz TL", "yüzde yirmi", "iki buçuk bin TL"]) {
      expect(normalizeTurkishSpokenTemporal(s)).toBe(s);
    }
    expect(extract("iki bin beş yüz TL").extracted.preferredDate).toBeUndefined();
    expect(extract("iki bin beş yüz TL").extracted.priceCurrency).toBe("TRY");
  });

  it("'saç ekimi' is a treatment, never a month", () => {
    for (const s of ["iki bin greft saç ekimi istiyorum", "saç ekimi on iki ay sonra", "saç ekim üç kere"]) {
      const { extracted } = extract(s);
      expect(extracted.preferredDate).toBeUndefined();
      expect(extracted.pendingAppointmentDate).toBeUndefined();
    }
  });
});

describe("Date safety preserved for spoken input", () => {
  it("impossible date → invalid_calendar, identical to digits", () => {
    expect(scheduling("otuz bir kasım")).toEqual(scheduling("31 kasım"));
    expect(scheduling("otuz bir kasım").invalidCivilDate).toBe(true);
    const res = amend("otuz bir kasım");
    expect(res.outcome).toBe("invalid");
    expect(res.validationReason).toBe("INVALID_DATE");
  });

  it("past explicit-year date is rejected, identical to digits", () => {
    const spoken = amend("beş ekim iki bin yirmi altı");
    const digits = amend("5 ekim 2026");
    expect(spoken.outcome).toBe("invalid");
    expect(spoken.outcome).toBe(digits.outcome);
    expect(spoken.validationReason).toBe(digits.validationReason);
  });

  it("weekday/date mismatch is flagged by the date validator", () => {
    const check = (rawDateText: string) =>
      AppointmentDateValidator.validateAppointmentDateConsistency({
        rawDateText,
        rawTimeText: null,
        inferredDate: null,
        inferredTime: null,
        currentClinicDateTime: NOW,
        timeZone: TZ,
      });
    const spoken = check("on üç ekim pazartesi");
    expect(spoken.hasConflict).toBe(true);
    expect(spoken.conflictType).toBe("DATE_WEEKDAY_MISMATCH");
    expect(spoken.conflictType).toBe(check("13 ekim pazartesi").conflictType);
    expect(check("on üç ekim").resolvedDate).toBe("2026-10-13");
    expect(check("on üç ekim").isValid).toBe(true);
  });

  it("outside-hours spoken time is rejected, not booked", () => {
    const spoken = amend("on iki ekim saat üç", {}, { workingHours: HOURS });
    const digits = amend("12 ekim saat 3", {}, { workingHours: HOURS });
    expect(spoken.outcome).toBe("invalid");
    expect(spoken.validationReason).toBe(digits.validationReason);
    expect(spoken.draft.requestedTime).toBeUndefined();
  });

  describe("pending month / bare spoken day", () => {
    const pending = { month: 10, year: 2026, yearExplicit: false, awaitingDayReply: true };

    it("eligible pending month + 'on iki' composes the day (same as '12')", () => {
      const spoken = extract("on iki", { expectedSlot: "preferredDate", existing: { pendingAppointmentDate: pending } });
      const digits = extract("12", { expectedSlot: "preferredDate", existing: { pendingAppointmentDate: pending } });
      const pick = (e: typeof spoken.extracted) => ({
        preferredDate: e.preferredDate,
        preferredWeekday: e.preferredWeekday,
        preferredTime: e.preferredTime,
        pendingAppointmentDate: e.pendingAppointmentDate,
        invalidCivilDate: e.invalidCivilDate,
      });
      expect(spoken.extracted.preferredDate).toBe("2026-10-12");
      expect(pick(spoken.extracted)).toEqual(pick(digits.extracted));
      expect(spoken.extracted.preferredTime).toBeUndefined();
    });

    it("possessive and ordinal day replies compose too", () => {
      for (const reply of ["on ikisi", "on ikinci"]) {
        const res = extract(reply, { expectedSlot: "preferredDate", existing: { pendingAppointmentDate: pending } });
        expect(res.extracted.preferredDate).toBe("2026-10-12");
      }
    });

    it("ineligible pending (awaitingDayReply false) does not compose", () => {
      const res = extract("on iki", {
        expectedSlot: "preferredDate",
        existing: { pendingAppointmentDate: { ...pending, awaitingDayReply: false } },
      });
      expect(res.extracted.preferredDate).toBeUndefined();
      expect(res.extracted.preferredTime).toBeUndefined();
    });

    it("collecting time: bare spoken number is not a day", () => {
      const spoken = extract("on iki", { expectedSlot: "preferredTime", existing: { pendingAppointmentDate: pending } });
      const digits = extract("12", { expectedSlot: "preferredTime", existing: { pendingAppointmentDate: pending } });
      expect(spoken.extracted.preferredDate).toBeUndefined();
      expect(spoken.extracted.preferredTime).toBe(digits.extracted.preferredTime);
    });

    it("topic interruption invalidates the pending day; a later 'on iki' does not compose", () => {
      const draft = { pendingAppointmentDate: pending };
      const topic = amend("implant fiyatı ne kadar", draft);
      expect(topic.draft.pendingAppointmentDate?.awaitingDayReply).toBe(false);
      const later = amend("on iki", topic.draft);
      expect(later.draft.requestedDate).toBeUndefined();
    });

    it("bare spoken number while collecting a date without pending month is not a time", () => {
      expect(scheduling("on iki")).toEqual(scheduling("12"));
      expect(scheduling("on iki").preferredTime).toBeUndefined();
    });
  });
});

describe("Digit input is unchanged", () => {
  const DIGIT_INPUTS = [
    "12 Ekim saat 15:00",
    "12 ekim saat 3 uygun mu",
    "Cumartesi saat 14:00 uygun olur.",
    "11,00 sabah",
    "sabah 11",
    "14:00'ten sonra",
    "0532 291 45 67",
    "+905551112233",
    "31 kasım",
    "5 ekim 2026",
    "12",
    "1 Ağustos değil 3 Ağustos olsun",
    "I want an appointment Saturday at 2 PM",
    "Actually make it 12 PM",
    "on Monday at 3pm",
    "İmplant tedavisi yapıyor musunuz?",
    "test@example.com",
    "saç ekimi fiyatı nedir",
  ];

  it.each(DIGIT_INPUTS)("normalizer returns the identical string: %s", (input) => {
    expect(normalizeTurkishSpokenTemporal(input)).toBe(input);
  });

  it.each([
    ["on iki ekim", "12 ekim"],
    ["yirmi beş aralık", "25 aralık"],
    ["saat on dört otuz", "saat 14:30"],
    ["saat üç", "saat 3"],
    ["on iki ekim saat üç uygun mu", "12 ekim saat 3 uygun mu"],
    ["on iki ekim iki bin yirmi yedi", "12 ekim 2027"],
    ["ekim on iki", "ekim 12"],
    ["üç buçuk", "3:30"],
    ["otuz bir kasım", "31 kasım"],
  ])("spoken '%s' ≡ typed '%s'", (spoken, typed) => {
    expect(scheduling(spoken)).toEqual(scheduling(typed));
  });
});

describe("Scope guards", () => {
  const src = readFileSync(resolve(REPO, "lib/conversation/turkishSpokenNumbers.ts"), "utf8");

  it("normalizer is pure: no I/O, LLM, Firestore, clinic, or channel coupling", () => {
    expect(src).not.toMatch(/^import /m);
    expect(src).not.toMatch(/fetch\(|firebase|openai|adminDb|clinicId|channel|process\.env/i);
  });

  it("extractor has no voice-only branch", () => {
    const extractor = readFileSync(resolve(REPO, "lib/conversation/slotExtractor.ts"), "utf8");
    expect(extractor).not.toMatch(/channel\s*===\s*["']voice["']/);
  });

  it("voice adapter still forwards transcripts without rewriting", () => {
    const adapter = readFileSync(resolve(REPO, "lib/voice/voiceAdapter.ts"), "utf8");
    expect(adapter).toMatch(/Transport-level only: trim; do not rewrite patient language\./);
    expect(adapter).not.toMatch(/turkishSpokenNumbers/);
  });
});

describe("Agent Core end-to-end: spoken voice turn ≡ typed web turn", () => {
  type Saved = Record<string, any>;
  let handleClinicAgentTurn: typeof import("@/lib/agent/handleClinicAgentTurn").handleClinicAgentTurn;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.doMock("@/lib/services/aiGateway", () => ({
      trackableAIRequest: vi.fn(async () => ({ content: "Tamam.", durationMs: 1 })),
    }));
    vi.doMock("@/lib/services/retrievalService", () => ({
      hybridSearch: vi.fn(async () => []),
      validateGroundedness: vi.fn(async () => ({ isGrounded: true })),
    }));
    vi.doMock("@/lib/performance/clinicRuntimeCache", () => ({
      getCachedClinicRuntime: () => null,
      setCachedClinicRuntime: () => undefined,
    }));
    vi.doMock("@/lib/services/conversations/conversationTranscriptService", () => ({
      syncConversationLogMessagesFromHistory: vi.fn(async () => 2),
    }));
    vi.doMock("@/lib/appointment-service", () => ({
      createAppointmentAndNotify: vi.fn(async () => {
        throw new Error("appointment creation must not run in this test");
      }),
    }));
    ({ handleClinicAgentTurn } = await import("@/lib/agent/handleClinicAgentTurn"));
  });

  afterAll(() => {
    vi.useRealTimers();
    vi.doUnmock("@/lib/services/aiGateway");
    vi.doUnmock("@/lib/services/retrievalService");
    vi.doUnmock("@/lib/performance/clinicRuntimeCache");
    vi.doUnmock("@/lib/services/conversations/conversationTranscriptService");
    vi.doUnmock("@/lib/appointment-service");
  });

  function makeDb(initial: Saved) {
    let saved: Saved = { ...initial };
    const logRef = {
      get: async () => ({ exists: true, data: () => saved }),
      set: async (data: Saved) => {
        saved = { ...saved, ...data };
      },
      create: async (_data: Saved) => {
        throw Object.assign(new Error("ALREADY_EXISTS"), { code: 6 });
      },
      collection: () => ({ doc: () => ({ set: async () => undefined, get: async () => ({ exists: false }) }) }),
    };
    const adminDb = {
      collection: (name: string) => {
        if (name === "clinics") {
          return {
            doc: () => ({
              get: async () => ({
                exists: true,
                id: "clinic_test",
                data: () => ({ name: "Test Dental", language: "tr", timezone: TZ, workingHours: HOURS, notificationSettings: {} }),
              }),
              collection: (sub: string) => {
                if (sub === "conversationLogs") return { doc: () => logRef };
                if (sub === "doctors") return { where: () => ({ get: async () => ({ empty: true, docs: [] }) }) };
                return { doc: () => ({ get: async () => ({ exists: false }) }) };
              },
            }),
          };
        }
        if (name === "promptSettings") {
          return { doc: () => ({ get: async () => ({ exists: true, data: () => ({ systemPrompt: "Asistan", model: "gpt-4o-mini" }) }) }) };
        }
        if (name === "trainingMaterials") {
          return { where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) };
        }
        if (name === "agencies") return { get: async () => ({ docs: [] }) };
        return { doc: () => ({ get: async () => ({ exists: false }) }) };
      },
    };
    return { adminDb, saved: () => saved };
  }

  const collectingDate = () => ({
    appointmentState: "COLLECTING_DATE",
    appointmentDraft: { requestedService: "İmplant" },
    conversationLocale: "tr",
  });

  async function voiceTurn(text: string) {
    const db = makeDb(collectingDate());
    const deps = {
      sessionStore: createInMemoryCallSessionStore(),
      adminDb: db.adminDb,
      generateId: (prefix: string) => `${prefix}_t`,
      loadHistory: async () => [],
      runAgentTurn: handleClinicAgentTurn,
      now: () => NOW,
    };
    const started = await startCallSession(deps as any, { clinicId: "clinic_test", locale: "tr" });
    if (!started.ok) throw new Error("start failed");
    const turn = await processVoiceTurn(deps as any, { callSessionId: started.callSessionId, text, turnId: "v1" });
    expect(turn.ok).toBe(true);
    return db.saved().appointmentDraft || {};
  }

  async function webTurn(text: string) {
    const db = makeDb(collectingDate());
    await handleClinicAgentTurn({
      input: { clinicId: "clinic_test", conversationId: "conv_web", channel: "web_widget", text, history: [], locale: "tr" },
      adminDb: db.adminDb,
      perf: new RequestTimer({}),
      debugLog: [],
      startTime: NOW.getTime(),
    });
    return db.saved().appointmentDraft || {};
  }

  it("voice 'on iki ekim saat on dört' and web '12 Ekim saat 14:00' persist the same draft", async () => {
    const voice = await voiceTurn("on iki ekim saat on dört");
    const web = await webTurn("12 Ekim saat 14:00");
    expect(voice.requestedDate).toBe("2026-10-12");
    expect(voice.requestedTime).toBe("14:00");
    expect(web.requestedDate).toBe(voice.requestedDate);
    expect(web.requestedTime).toBe(voice.requestedTime);
  });

  it("web Agent Core also accepts the spoken form identically (product-global parser)", async () => {
    const web = await webTurn("on iki ekim saat on dört");
    expect(web.requestedDate).toBe("2026-10-12");
    expect(web.requestedTime).toBe("14:00");
  });

  it("voice 'saat üç' outside working hours is not persisted as 03:00", async () => {
    const voice = await voiceTurn("on iki ekim saat üç");
    const web = await webTurn("12 Ekim saat 3");
    expect(voice.requestedTime).not.toBe("03:00");
    expect(voice.requestedTime).toBe(web.requestedTime);
  });
});
