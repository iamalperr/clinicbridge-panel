/**
 * Global appointment treatment context continuity.
 * Product-wide — no clinic-specific fixtures.
 */
import { describe, expect, it } from "vitest";
import {
  ConversationStateEngine,
  IntentRouter,
  SlotExtractor,
  evaluateAppointmentCollectionGate,
  resolveAppointmentTreatmentCarryForward,
  applyConfirmationAmendment,
  applyAppointmentSchedulingAmendment,
  type AppointmentDraftLike,
} from "../lib/conversation";
import type { WeeklySchedule } from "../lib/skills/ClinicWorkingHoursResolver";

const FIXED_NOW = new Date("2026-08-29T07:00:00.000Z"); // Saturday 10:00 Istanbul
const CLINIC_TZ = "Europe/Istanbul";
const HOURS: WeeklySchedule = {
  monday: ["10:00", "19:00"],
  tuesday: ["10:00", "19:00"],
  wednesday: ["10:00", "19:00"],
  thursday: ["10:00", "19:00"],
  friday: ["10:00", "19:00"],
  saturday: ["10:00", "17:00"],
  sunday: null,
};

function normalizeService(value: string | null | undefined): string {
  return String(value || "")
    .toLocaleLowerCase("en-US")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Mirrors Agent Core wiring: resolve carry-forward → classify → gate → promote → missing slots.
 */
function simulateBookingTurn(params: {
  message: string;
  history: Array<{ role: string; content: string }>;
  draft?: AppointmentDraftLike;
  locale?: string;
  clinicId?: string;
}) {
  const locale = params.locale || "tr";
  const draft: AppointmentDraftLike = { ...(params.draft || {}) };

  const carry = resolveAppointmentTreatmentCarryForward({
    draftRequestedService: draft.requestedService,
    history: params.history,
    locale,
  });
  const activeTreatment =
    !carry.ambiguous && carry.treatmentId ? carry.treatmentId : undefined;

  const intent = IntentRouter.classifyConversationIntent({
    message: params.message,
    conversationHistory: params.history as Array<{
      role: "user" | "assistant" | "system";
      content: string;
    }>,
    currentState: "INITIAL",
    collectedSlots: {
      treatment: draft.requestedService || activeTreatment || undefined,
      preferredDate: draft.requestedDate || undefined,
      preferredTime: draft.requestedTime || undefined,
      fullName: draft.patientName || undefined,
      phone: draft.patientPhone || undefined,
      email: draft.patientEmail || undefined,
    },
    activeTreatment,
    locale,
    clinicContext: {
      clinicId: params.clinicId || "clinic_any",
      clinicName: "Any Clinic",
    },
  });

  const gate = evaluateAppointmentCollectionGate({
    message: params.message,
    intent: intent.intent,
    isAppointmentFlowActive: false,
    entities: intent.entities,
  });

  if (gate.allowed && intent.entities) {
    if (intent.entities.preferredDate) draft.requestedDate = intent.entities.preferredDate;
    if (intent.entities.preferredTime) draft.requestedTime = intent.entities.preferredTime;
    if (intent.entities.treatment) {
      const treatmentIds = [
        intent.entities.treatment,
        ...(((intent.entities as any).additionalTreatments as string[]) || []),
      ].filter(Boolean);
      const primaryId = treatmentIds[0];
      draft.requestedService =
        SlotExtractor.formatMultiTreatmentLabel([primaryId], locale) || primaryId;
    }
  }

  const missing = ConversationStateEngine.getMissingSlots({
    treatment: draft.requestedService || undefined,
    preferredDate: draft.requestedDate || undefined,
    preferredTime: draft.requestedTime || undefined,
    fullName: draft.patientName || undefined,
    phone: draft.patientPhone || undefined,
    email: draft.patientEmail || undefined,
  });

  const nextPrompt = ConversationStateEngine.generateNextSlotPrompt(
    {
      treatment: draft.requestedService || undefined,
      preferredDate: draft.requestedDate || undefined,
      preferredTime: draft.requestedTime || undefined,
      fullName: draft.patientName || undefined,
      phone: draft.patientPhone || undefined,
      email: draft.patientEmail || undefined,
    },
    missing,
    locale
  );

  return { carry, intent, gate, draft, missing, nextPrompt, clinicId: params.clinicId };
}

describe("resolveAppointmentTreatmentCarryForward", () => {
  it("carries unambiguous implant from prior user Q&A", () => {
    const res = resolveAppointmentTreatmentCarryForward({
      history: [{ role: "user", content: "İmplant tedavisi yapıyor musunuz?" }],
      locale: "tr",
    });
    expect(res.ambiguous).toBe(false);
    expect(res.treatmentId).toBe("implant");
    expect(res.source).toBe("history");
  });

  it("does not guess when multiple treatments were discussed", () => {
    const res = resolveAppointmentTreatmentCarryForward({
      history: [
        {
          role: "user",
          content: "Do you provide implants and teeth whitening?",
        },
      ],
      locale: "en",
    });
    expect(res.ambiguous).toBe(true);
    expect(res.treatmentId).toBeNull();
  });

  it("prefers draft over history", () => {
    const res = resolveAppointmentTreatmentCarryForward({
      draftRequestedService: "teeth_whitening",
      history: [{ role: "user", content: "İmplant tedavisi yapıyor musunuz?" }],
      locale: "tr",
    });
    expect(res.treatmentId).toBe("teeth_whitening");
    expect(res.source).toBe("draft");
  });

  it("latest explicit single treatment wins after earlier multi-treatment", () => {
    const res = resolveAppointmentTreatmentCarryForward({
      history: [
        { role: "user", content: "Do you provide implants and whitening?" },
        { role: "user", content: "Actually this is for teeth whitening." },
      ],
      locale: "en",
    });
    expect(res.ambiguous).toBe(false);
    expect(res.treatmentId).toBe("teeth_whitening");
  });
});

describe("CASE 1 — Turkish implant continuity (Nova incident)", () => {
  it("does not re-ask treatment after implant Q&A then Saturday 14:00", () => {
    const history = [
      { role: "user", content: "İmplant tedavisi yapıyor musunuz?" },
      {
        role: "assistant",
        content:
          "Evet, implant tedavisi sunuyoruz. Dilerseniz ön randevu talebi oluşturabiliriz. Hangi gün sizin için uygundur?",
      },
    ];

    const turn = simulateBookingTurn({
      message: "Cumartesi saat 14:00 uygun olur.",
      history,
      locale: "tr",
      clinicId: "nova_dental",
    });

    expect(turn.gate.allowed).toBe(true);
    expect(turn.draft.requestedService).toBeTruthy();
    expect(normalizeService(turn.draft.requestedService)).toMatch(/implant/);
    expect(turn.draft.requestedDate).toBeTruthy();
    expect(turn.draft.requestedTime).toBe("14:00");
    expect(turn.missing[0]).not.toBe("treatment");
    expect(turn.nextPrompt).not.toMatch(/Hangi tedavi veya işlem/i);
  });
});

describe("CASE 2 — English equivalent", () => {
  it("carries dental implants into booking after Saturday at 2 PM", () => {
    const turn = simulateBookingTurn({
      message: "Saturday at 2 PM.",
      history: [
        { role: "user", content: "Do you provide dental implants?" },
        {
          role: "assistant",
          content: "Yes, we offer implants. Would you like an appointment?",
        },
      ],
      locale: "en",
      clinicId: "clinic_en_1",
    });

    expect(turn.gate.allowed).toBe(true);
    expect(turn.draft.requestedService).toBeTruthy();
    expect(normalizeService(turn.draft.requestedService)).toMatch(/implant/);
    expect(turn.draft.requestedTime).toBe("14:00");
    expect(turn.missing[0]).not.toBe("treatment");
    expect(turn.nextPrompt).not.toMatch(/which (treatment|procedure)/i);
  });
});

describe("CASE 3 — Ambiguous treatments", () => {
  it("asks for treatment when implant and whitening were both discussed", () => {
    const turn = simulateBookingTurn({
      message: "I'd like an appointment Saturday.",
      history: [
        {
          role: "user",
          content: "Do you provide implants and teeth whitening?",
        },
        { role: "assistant", content: "Yes, we offer both." },
      ],
      locale: "en",
    });

    expect(turn.carry.ambiguous).toBe(true);
    expect(turn.gate.allowed).toBe(true);
    expect(turn.draft.requestedService).toBeFalsy();
    expect(turn.missing[0]).toBe("treatment");
    expect(turn.nextPrompt.toLowerCase()).toMatch(/treatment|procedure|tedavi/);
  });
});

describe("CASE 4 — Explicit correction", () => {
  it("latest explicit treatment replaces implant", () => {
    const afterCorrection = resolveAppointmentTreatmentCarryForward({
      history: [
        { role: "user", content: "Do you provide dental implants?" },
        { role: "user", content: "Actually this is for teeth whitening." },
      ],
      locale: "en",
    });
    expect(afterCorrection.treatmentId).toBe("teeth_whitening");

    const turn = simulateBookingTurn({
      message: "Saturday at 2 PM.",
      history: [
        { role: "user", content: "Do you provide dental implants?" },
        { role: "assistant", content: "Yes." },
        { role: "user", content: "Actually this is for teeth whitening." },
        { role: "assistant", content: "Sure — which day works?" },
      ],
      locale: "en",
    });
    expect(normalizeService(turn.draft.requestedService)).toMatch(/whiten/);
    expect(turn.missing[0]).not.toBe("treatment");
  });
});

describe("CASE 5 — No treatment context", () => {
  it("asks for treatment when booking starts with only date/time", () => {
    const turn = simulateBookingTurn({
      message: "I'd like an appointment Saturday at 2.",
      history: [],
      locale: "en",
    });
    expect(turn.gate.allowed).toBe(true);
    expect(turn.missing[0]).toBe("treatment");
  });
});

describe("CASE 6 — Full appointment request still works", () => {
  it("extracts implant + date + time from one message", () => {
    const turn = simulateBookingTurn({
      message: "I want an implant appointment Saturday at 2 PM.",
      history: [],
      locale: "en",
    });
    expect(turn.gate.allowed).toBe(true);
    expect(turn.draft.requestedService).toBeTruthy();
    expect(normalizeService(turn.draft.requestedService)).toMatch(/implant/);
    expect(turn.draft.requestedTime).toBe("14:00");
    expect(turn.missing[0]).not.toBe("treatment");
  });
});

describe("CASE 7 — Confirmation-stage amendment keeps treatment", () => {
  it("time change does not wipe implant", () => {
    const draft: AppointmentDraftLike = {
      patientName: "Ada Lovelace",
      patientPhone: "+905551112233",
      patientEmail: "ada@example.com",
      requestedService: SlotExtractor.formatMultiTreatmentLabel(["implant"], "en"),
      requestedDate: "2026-08-29",
      requestedTime: "14:00",
    };
    const amended = applyConfirmationAmendment({
      message: "Could I do 12pm please",
      draft,
      locale: "en",
      clinicTimeZone: CLINIC_TZ,
      now: FIXED_NOW,
      workingHours: HOURS,
    });
    expect(amended.outcome).toBe("applied");
    expect(amended.nextDraft.requestedService?.toLowerCase()).toMatch(/implant/);
    expect(amended.nextDraft.requestedTime).toBe("12:00");
  });
});

describe("CASE 8 — Clinic independence", () => {
  it("same continuity for two different clinic ids", () => {
    const history = [
      { role: "user", content: "İmplant tedavisi yapıyor musunuz?" },
      { role: "assistant", content: "Evet. Hangi gün uygun?" },
    ];
    const a = simulateBookingTurn({
      message: "Cumartesi saat 14:00 uygun olur.",
      history,
      locale: "tr",
      clinicId: "nova_dental",
    });
    const b = simulateBookingTurn({
      message: "Cumartesi saat 14:00 uygun olur.",
      history,
      locale: "tr",
      clinicId: "istanbul_dis_akademisi",
    });
    expect(a.draft.requestedService).toBe(b.draft.requestedService);
    expect(a.missing[0]).toBe(b.missing[0]);
    expect(a.missing[0]).not.toBe("treatment");
    expect(a.nextPrompt).not.toMatch(/Hangi tedavi/);
    expect(b.nextPrompt).not.toMatch(/Hangi tedavi/);
  });
});

describe("Preserves gate: treatment Q&A alone does not start collection", () => {
  it("blocks bare implant information seeking", () => {
    const turn = simulateBookingTurn({
      message: "İmplant tedavisi yapıyor musunuz?",
      history: [],
      locale: "tr",
    });
    expect(turn.gate.allowed).toBe(false);
    expect(turn.draft.requestedService).toBeFalsy();
  });
});

describe("Scheduling amendment keeps carried treatment", () => {
  it("Saturday 2pm → 12pm keeps implant on draft", () => {
    const draft: AppointmentDraftLike = {
      requestedService: "Diş İmplantı",
      requestedDate: "2026-08-29",
      requestedTime: "14:00",
    };
    const first = applyAppointmentSchedulingAmendment({
      message: "Actually make it 12 PM",
      draft,
      locale: "en",
      clinicTimeZone: CLINIC_TZ,
      now: FIXED_NOW,
      workingHours: HOURS,
    });
    expect(first.outcome).toBe("applied");
    expect(first.draft.requestedService).toBe("Diş İmplantı");
    expect(first.draft.requestedTime).toBe("12:00");
  });
});
