import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  IntentRouter,
  PendingActionManager,
  evaluateAppointmentCollectionGate,
} from "../lib/conversation";
import {
  isClinicForwardOffer,
  isCoverageVerificationQuery,
  detectContactHandoff,
} from "../lib/contact-request/intent";

const INSURANCE_Q =
  "Anadolu Hayat tamamlayıcı sağlık sigorta poliçemde diş paketi de var kliniğinizde kullanabilir miyim?";
const OFFER_TR =
  "Bu bilgi şu anda doğrulanmış klinik bilgilerim arasında bulunmuyor. Yanlış yönlendirmemek için klinik ekibimizden teyit edilmesi gerekir. Dilerseniz sorunuzu ekibimize iletmeniz için yardımcı olabilirim.";
const ASK_CONTACT = "Elbette. Size dönüş yapabilmemiz için adınızı ve telefon numaranızı paylaşabilir misiniz?";

describe("Contact Request vs appointment routing (insurance handoff)", () => {
  it("detects the production KB-miss wording as a Contact Request offer", () => {
    expect(isClinicForwardOffer(OFFER_TR)).toBe(true);
    expect(PendingActionManager.detectOfferedAction(OFFER_TR)).toBe("create_contact_request");
    expect(isCoverageVerificationQuery(INSURANCE_Q)).toBe(true);
  });

  it("binds Lütfen to the clinic-forward offer, not to appointment start", () => {
    const classified = IntentRouter.classifyConversationIntent({
      message: "Lütfen.",
      currentState: "INITIAL",
      locale: "tr",
      conversationHistory: [
        { role: "user", content: INSURANCE_Q },
        { role: "assistant", content: OFFER_TR },
      ],
    });
    expect(classified.intent).toBe("contact_handoff_request");
    const gate = evaluateAppointmentCollectionGate({
      message: "Lütfen.",
      intent: classified.intent,
      isAppointmentFlowActive: false,
      entities: classified.entities,
      activeContactHandoff: true,
    });
    expect(gate.allowed).toBe(false);
  });

  it("does not start appointment collection when name and phone are given after the offer", () => {
    const classified = IntentRouter.classifyConversationIntent({
      message: "Telefonum 05326430553 Adem Gül",
      currentState: "INITIAL",
      locale: "tr",
      conversationHistory: [
        { role: "user", content: INSURANCE_Q },
        { role: "assistant", content: OFFER_TR },
        { role: "user", content: "Lütfen." },
        { role: "assistant", content: ASK_CONTACT },
      ],
    });
    expect(classified.intent).toBe("contact_handoff_request");
    expect(classified.entities?.phone).toBeTruthy();
    const gate = evaluateAppointmentCollectionGate({
      message: "Telefonum 05326430553 Adem Gül",
      intent: classified.intent,
      isAppointmentFlowActive: false,
      entities: classified.entities,
      activeContactHandoff: true,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reason).not.toMatch(/scheduling_commitment|appointment_intent|booking_signal/);
  });

  it("keeps a pure booking request on the appointment path", () => {
    const classified = IntentRouter.classifyConversationIntent({
      message: "Yarın diş temizliği için randevu almak istiyorum.",
      currentState: "INITIAL",
      locale: "tr",
    });
    expect(classified.intent).toBe("appointment_start");
    const gate = evaluateAppointmentCollectionGate({
      message: "Yarın diş temizliği için randevu almak istiyorum.",
      intent: classified.intent,
      isAppointmentFlowActive: false,
      entities: classified.entities,
    });
    expect(gate.allowed).toBe(true);
  });

  it("does not start appointment when insurance coverage is bound to a possible booking", () => {
    const message =
      "Sigortam geçerli mi öğrenmek istiyorum, uygunsa randevu da alacağım.";
    const classified = IntentRouter.classifyConversationIntent({
      message,
      currentState: "INITIAL",
      locale: "tr",
    });
    expect(classified.intent).not.toBe("appointment_start");
    const gate = evaluateAppointmentCollectionGate({
      message,
      intent: classified.intent,
      isAppointmentFlowActive: false,
      entities: classified.entities,
    });
    expect(gate.allowed).toBe(false);
  });

  it("classifies EN/DE clinic-contact phrasing as handoff, not booking", () => {
    expect(
      IntentRouter.classifyConversationIntent({
        message: "Please ask the clinic to call me.",
        currentState: "INITIAL",
        locale: "en",
      }).intent
    ).toBe("contact_handoff_request");
    expect(
      IntentRouter.classifyConversationIntent({
        message: "Können Sie mich kontaktieren?",
        currentState: "INITIAL",
        locale: "de",
      }).intent
    ).toBe("contact_handoff_request");
    expect(detectContactHandoff("Bana dönüş yapın.").isHandoffIntent).toBe(true);
  });
});

describe("tryHandleContactHandoffTurn insurance sequence", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("@/lib/contact-request/service");
    vi.doUnmock("@/lib/agent/persistence");
  });

  function baseParams(overrides: Record<string, unknown> = {}) {
    return {
      message: "",
      intent: "contact_handoff_request",
      entities: {},
      locale: "tr",
      clinicId: "clinic_ida",
      conversationId: "conv_ida",
      channel: "web_widget" as const,
      clinicData: { enableHumanHandoff: true, phone: "+902125550101" },
      appointmentDraft: {},
      appointmentState: "IDLE" as const,
      appointmentVersion: 0,
      history: [] as Array<{ role?: string; content?: string }>,
      loadedPendingAction: null,
      loadedConversationLogData: null,
      adminDb: {
        collection: () => ({
          doc: () => ({
            set: async () => undefined,
            collection: () => ({ doc: () => ({ set: async () => undefined }) }),
          }),
        }),
      },
      basePersist: (extra: Record<string, unknown> = {}) => ({
        clinicId: "clinic_ida",
        convId: "conv_ida",
        userMessage: overrides.message || "",
        history: [],
        ...extra,
      }),
      ...overrides,
    };
  }

  it("Lütfen after the offer asks for contact details and never mentions treatment", async () => {
    vi.doMock("@/lib/agent/persistence", () => ({
      respondWithVisibleReply: async (payload: any) => ({
        replyText: payload.reply,
        conversationId: "conv_ida",
        payload,
      }),
      saveAppointmentState: vi.fn(async () => true),
    }));
    vi.doMock("@/lib/contact-request/service", () => ({
      createContactRequestAndNotify: vi.fn(),
      findUnresolvedContactRequest: vi.fn(async () => null),
      cancelUnresolvedContactRequest: vi.fn(),
      updateContactRequestPreference: vi.fn(),
      buildContactRequestIdempotencyKey: () => "k",
    }));

    const { tryHandleContactHandoffTurn } = await import(
      "@/lib/contact-request/handleContactHandoffTurn"
    );
    const result = await tryHandleContactHandoffTurn(
      baseParams({
        message: "Lütfen.",
        confirmationAffirmed: true,
        history: [
          { role: "user", content: INSURANCE_Q },
          { role: "assistant", content: OFFER_TR },
        ],
      }) as any
    );

    expect(result).not.toBeNull();
    expect(result!.payload.contactRequestCreated).not.toBe(true);
    expect(result!.replyText.toLowerCase()).toMatch(/telefon/);
    expect(result!.replyText.toLowerCase()).not.toMatch(/tedavi|randevu almak/);
    expect(result!.payload.pendingAction?.type).toBe("collect_contact_phone");
  });

  it("name + phone creates a Contact Request with the insurance question preserved", async () => {
    const createFn = vi.fn(async () => ({
      success: true,
      contactRequestId: "cr_ida",
      record: { id: "cr_ida", status: "pending", preferredContactMethod: "unspecified" },
      isDuplicate: false,
      clinicNotificationStatus: "SENT",
    }));

    vi.doMock("@/lib/agent/persistence", () => ({
      respondWithVisibleReply: async (payload: any) => ({
        replyText: payload.reply,
        conversationId: "conv_ida",
        payload,
      }),
      saveAppointmentState: vi.fn(async () => true),
    }));
    vi.doMock("@/lib/contact-request/service", () => ({
      createContactRequestAndNotify: createFn,
      findUnresolvedContactRequest: vi.fn(async () => null),
      cancelUnresolvedContactRequest: vi.fn(),
      updateContactRequestPreference: vi.fn(),
      buildContactRequestIdempotencyKey: () => "k-ida",
    }));

    const { tryHandleContactHandoffTurn } = await import(
      "@/lib/contact-request/handleContactHandoffTurn"
    );
    const pending = PendingActionManager.createPendingAction(
      "collect_contact_phone",
      { originalQuestion: INSURANCE_Q, preferredContactMethod: "unspecified" }
    );
    const result = await tryHandleContactHandoffTurn(
      baseParams({
        message: "Telefonum 05326430553 Adem Gül",
        entities: { fullName: "Adem Gül", phone: "05326430553" },
        loadedPendingAction: pending,
        history: [
          { role: "user", content: INSURANCE_Q },
          { role: "assistant", content: OFFER_TR },
          { role: "user", content: "Lütfen." },
          { role: "assistant", content: ASK_CONTACT },
        ],
      }) as any
    );

    expect(createFn).toHaveBeenCalledTimes(1);
    const [payload] = createFn.mock.calls[0] as unknown as [Record<string, any>];
    expect(payload.patientName).toMatch(/Adem/i);
    expect(String(payload.patientPhone || "")).toMatch(/532\s*643\s*05\s*53|05326430553/);
    expect(payload.patientNote).toContain("Anadolu Hayat");
    expect(payload.clinicId).toBe("clinic_ida");
    expect(result!.payload.contactRequestCreated).toBe(true);
    expect(result!.replyText.toLowerCase()).toMatch(/ilettim|iletişim/);
    expect(result!.replyText.toLowerCase()).not.toMatch(/hangi tedavi/);
  });

  it("does not claim success when clinic notification fails", async () => {
    vi.doMock("@/lib/agent/persistence", () => ({
      respondWithVisibleReply: async (payload: any) => ({
        replyText: payload.reply,
        conversationId: "conv_ida",
        payload,
      }),
      saveAppointmentState: vi.fn(async () => true),
    }));
    vi.doMock("@/lib/contact-request/service", () => ({
      createContactRequestAndNotify: vi.fn(async () => ({
        success: false,
        code: "NOTIFICATION_FAILED",
        reason: "NOTIFICATION_FAILED",
      })),
      findUnresolvedContactRequest: vi.fn(async () => null),
      cancelUnresolvedContactRequest: vi.fn(),
      updateContactRequestPreference: vi.fn(),
      buildContactRequestIdempotencyKey: () => "k",
    }));

    const { tryHandleContactHandoffTurn } = await import(
      "@/lib/contact-request/handleContactHandoffTurn"
    );
    const pending = PendingActionManager.createPendingAction("collect_contact_phone", {
      originalQuestion: INSURANCE_Q,
    });
    const result = await tryHandleContactHandoffTurn(
      baseParams({
        message: "Adem Gül 05326430553",
        entities: { fullName: "Adem Gül", phone: "05326430553" },
        loadedPendingAction: pending,
        history: [{ role: "user", content: INSURANCE_Q }],
      }) as any
    );
    expect(result!.payload.contactRequestCreated).toBe(false);
    expect(result!.replyText.toLowerCase()).not.toMatch(/ilettim/);
  });

  it("does not create a second request when the same details are replayed", async () => {
    const createFn = vi.fn(async () => ({
      success: true,
      contactRequestId: "cr_ida",
      record: { id: "cr_ida", status: "pending", preferredContactMethod: "unspecified" },
      isDuplicate: true,
      clinicNotificationStatus: "SKIPPED_DUPLICATE",
    }));
    vi.doMock("@/lib/agent/persistence", () => ({
      respondWithVisibleReply: async (payload: any) => ({
        replyText: payload.reply,
        conversationId: "conv_ida",
        payload,
      }),
      saveAppointmentState: vi.fn(async () => true),
    }));
    vi.doMock("@/lib/contact-request/service", () => ({
      createContactRequestAndNotify: createFn,
      findUnresolvedContactRequest: vi.fn(async () => null),
      cancelUnresolvedContactRequest: vi.fn(),
      updateContactRequestPreference: vi.fn(),
      buildContactRequestIdempotencyKey: () => "k-ida",
    }));

    const { tryHandleContactHandoffTurn } = await import(
      "@/lib/contact-request/handleContactHandoffTurn"
    );
    const pending = PendingActionManager.createPendingAction("collect_contact_phone", {
      originalQuestion: INSURANCE_Q,
    });
    const result = await tryHandleContactHandoffTurn(
      baseParams({
        message: "Adem Gül 05326430553",
        entities: { fullName: "Adem Gül", phone: "05326430553" },
        loadedPendingAction: pending,
        history: [{ role: "user", content: INSURANCE_Q }],
      }) as any
    );
    expect(createFn).toHaveBeenCalledTimes(1);
    expect(result!.payload.contactRequestCreated).toBe(true);
  });

  it("returns null for a new question while waiting for a phone number", async () => {
    vi.doMock("@/lib/agent/persistence", () => ({
      respondWithVisibleReply: async (payload: any) => ({
        replyText: payload.reply,
        conversationId: "conv_ida",
        payload,
      }),
      saveAppointmentState: vi.fn(async () => true),
    }));
    vi.doMock("@/lib/contact-request/service", () => ({
      createContactRequestAndNotify: vi.fn(),
      findUnresolvedContactRequest: vi.fn(async () => null),
      cancelUnresolvedContactRequest: vi.fn(),
      updateContactRequestPreference: vi.fn(),
      buildContactRequestIdempotencyKey: () => "k",
    }));

    const { tryHandleContactHandoffTurn } = await import(
      "@/lib/contact-request/handleContactHandoffTurn"
    );
    const pending = PendingActionManager.createPendingAction("collect_contact_phone", {
      originalQuestion: INSURANCE_Q,
    });
    const result = await tryHandleContactHandoffTurn(
      baseParams({
        message: "İmplant tedavisi kaç ziyaret sürer acaba?",
        intent: "treatment_information",
        loadedPendingAction: pending,
        history: [{ role: "assistant", content: ASK_CONTACT }],
      }) as any
    );
    expect(result).toBeNull();
  });
});
