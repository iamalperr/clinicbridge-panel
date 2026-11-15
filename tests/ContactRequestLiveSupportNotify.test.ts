/**
 * Regression: live-support / contact-request notify gaps
 * (international phone, anonymous name, second-turn handoff, multilingual, idempotency).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  detectContactHandoff,
  detectPreferredContactMethod,
  isClinicForwardOffer,
  isPatientContactHandoffIntent,
  isInformationalClinicContactQuery,
} from "@/lib/contact-request/intent";
import { anonymousVisitorName, resolvePatientDisplayName } from "@/lib/contact-request/anonymousVisitor";
import { buildContactRequestIdempotencyKey } from "@/lib/contact-request/service";
import { normalizeToE164, maskPhoneForLogs } from "@/lib/phone/e164";
import { SlotExtractor } from "@/lib/conversation/slotExtractor";
import { IntentRouter } from "@/lib/conversation/intentRouter";

describe("E.164 phone normalization", () => {
  it("accepts TR mobile as E.164", () => {
    const r = normalizeToE164("0532 123 45 67", "TR");
    expect(r.ok).toBe(true);
    expect(r.e164).toBe("+905321234567");
  });

  it("accepts Senegal (+221), UK (+44), Germany (+49)", () => {
    expect(normalizeToE164("+221 77 123 45 67").e164).toBe("+221771234567");
    expect(normalizeToE164("+44 7911 123456").e164).toBe("+447911123456");
    expect(normalizeToE164("+49 151 12345678").e164).toBe("+4915112345678");
  });

  it("SlotExtractor returns E.164 for international handoff numbers", () => {
    expect(SlotExtractor.parsePhone("Send me a whatsapp mess on +221 77 123 45 67")).toBe(
      "+221771234567"
    );
    expect(SlotExtractor.parsePhone("WhatsApp me on +44 7911 123456")).toBe("+447911123456");
    expect(SlotExtractor.parsePhone("Ruf mich an unter +49 151 12345678")).toBe("+4915112345678");
  });

  it("masks phones in logs (no full plaintext)", () => {
    const masked = maskPhoneForLogs("+221771234567");
    expect(masked).not.toContain("771234567");
    expect(masked).toMatch(/\*\*\*/);
  });
});

describe("Anonymous visitor name", () => {
  it("fills locale-aware anonymous label when name missing", () => {
    expect(resolvePatientDisplayName(undefined, "tr")).toBe("Anonim Ziyaretçi");
    expect(resolvePatientDisplayName("  ", "en")).toBe("Anonymous Visitor");
    expect(resolvePatientDisplayName("Ayşe", "tr")).toBe("Ayşe");
    expect(anonymousVisitorName("de")).toBe("Anonymer Besucher");
    expect(anonymousVisitorName("ar")).toMatch(/زائر/);
  });
});

describe("Failing EN WhatsApp handoff regression", () => {
  it("informational 'Do you have a whatsapp number' is NOT handoff", () => {
    const msg = "Do you have a whatsapp number";
    expect(isInformationalClinicContactQuery(msg.toLowerCase())).toBe(true);
    expect(isPatientContactHandoffIntent(msg)).toBe(false);
    const intent = IntentRouter.classifyConversationIntent({
      message: msg,
      currentState: "INITIAL",
    });
    expect(intent.intent).not.toBe("contact_handoff_request");
  });

  it("Send me a whatsapp mess on +221… is handoff with WhatsApp preference", () => {
    const msg = "Send me a whatsapp mess on +221 77 123 45 67";
    expect(isPatientContactHandoffIntent(msg)).toBe(true);
    expect(detectPreferredContactMethod(msg)).toBe("whatsapp");
    expect(detectContactHandoff(msg).needsConfirmation).toBe(false);
    const intent = IntentRouter.classifyConversationIntent({
      message: msg,
      currentState: "INITIAL",
    });
    expect(intent.intent).toBe("contact_handoff_request");
    expect(intent.entities.preferredContactMethod).toBe("whatsapp");
    expect(intent.entities.phone || SlotExtractor.parsePhone(msg)).toBe("+221771234567");
  });

  it("assistant representative-contact offer + patient phone → handoff", () => {
    const assistant =
      "Would you like us to have a representative contact you, or would you like help with booking an appointment?";
    expect(isClinicForwardOffer(assistant)).toBe(true);

    const intent = IntentRouter.classifyConversationIntent({
      message: "Send me a whatsapp mess on +221 77 123 45 67",
      currentState: "INITIAL",
      conversationHistory: [
        { role: "user", content: "Do you have a whatsapp number" },
        { role: "assistant", content: assistant },
      ],
    });
    expect(intent.intent).toBe("contact_handoff_request");
  });
});

describe("Multilingual contact / live-support intents", () => {
  it("EN live support without contact details", () => {
    const msg = "I want to talk to a human";
    expect(IntentRouter.isLiveSupport(msg.toLowerCase()) || isPatientContactHandoffIntent(msg)).toBe(
      true
    );
  });

  it("TR insanla konuşmak istiyorum", () => {
    const msg = "insanla konuşmak istiyorum";
    expect(
      IntentRouter.isLiveSupport(msg.toLowerCase()) || isPatientContactHandoffIntent(msg)
    ).toBe(true);
  });

  it("DE WhatsApp handoff", () => {
    const msg = "Bitte schreib mir auf WhatsApp unter +49 151 12345678";
    expect(isPatientContactHandoffIntent(msg) || detectPreferredContactMethod(msg) === "whatsapp").toBe(
      true
    );
    expect(detectPreferredContactMethod(msg)).toBe("whatsapp");
    expect(SlotExtractor.parsePhone(msg)).toBe("+4915112345678");
  });

  it("AR contact preference", () => {
    expect(detectPreferredContactMethod("تواصل معي على واتساب +221771234567")).toBe("whatsapp");
  });
});

describe("TR name + phone working path still classifies as handoff", () => {
  it("bana yazın with TR phone", () => {
    const msg = "Adım Ayşe, numaram 0532 123 45 67, bana yazın";
    expect(isPatientContactHandoffIntent(msg)).toBe(true);
    expect(SlotExtractor.parsePhone(msg)).toBe("+905321234567");
    const intent = IntentRouter.classifyConversationIntent({
      message: msg,
      currentState: "INITIAL",
    });
    expect(intent.intent).toBe("contact_handoff_request");
  });
});

describe("Idempotency key — same conversation double number → same key base", () => {
  it("same phone twice yields identical idempotency key", () => {
    const a = buildContactRequestIdempotencyKey({
      conversationId: "conv_x",
      preferredContactMethod: "whatsapp",
      patientPhone: "+221771234567",
    });
    const b = buildContactRequestIdempotencyKey({
      conversationId: "conv_x",
      preferredContactMethod: "whatsapp",
      patientPhone: "+221 77 123 45 67",
    });
    expect(a).toBe(b);
  });
});

describe("tryHandleContactHandoffTurn — second-turn intl + anonymous + live-only", () => {
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
      locale: "en",
      clinicId: "clinic_1",
      conversationId: "conv_live",
      channel: "web_widget" as const,
      clinicData: { enableHumanHandoff: true },
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
        clinicId: "clinic_1",
        convId: "conv_live",
        userMessage: "",
        history: [],
        ...extra,
      }),
      ...overrides,
    };
  }

  it("creates CR for anonymous intl WhatsApp handoff and notifies once", async () => {
    const createFn = vi.fn(async (payload: Record<string, unknown>) => ({
      success: true,
      contactRequestId: "cr_1",
      record: {
        id: "cr_1",
        status: "pending",
        preferredContactMethod: "whatsapp",
        patientName: payload.patientName,
        patientPhone: payload.patientPhone,
      },
      isDuplicate: false,
      clinicNotificationStatus: "SENT",
    }));

    vi.doMock("@/lib/agent/persistence", () => ({
      respondWithVisibleReply: async (payload: Record<string, unknown>, persist: unknown) => ({
        replyText: payload.reply,
        conversationId: "conv_live",
        payload: { ...payload, _persist: persist },
      }),
      saveAppointmentState: vi.fn(async () => true),
    }));
    vi.doMock("@/lib/contact-request/service", () => ({
      createContactRequestAndNotify: createFn,
      findUnresolvedContactRequest: vi.fn(async () => null),
      cancelUnresolvedContactRequest: vi.fn(),
      updateContactRequestPreference: vi.fn(),
      buildContactRequestIdempotencyKey: (p: {
        conversationId: string;
        preferredContactMethod: string;
        patientPhone?: string;
        patientEmail?: string;
      }) =>
        `cr:${p.conversationId}:${(p.patientPhone || "").replace(/\D/g, "").slice(-10) || "nophone"}:${
          p.patientEmail || "noemail"
        }`,
    }));

    const { tryHandleContactHandoffTurn } = await import(
      "@/lib/contact-request/handleContactHandoffTurn"
    );
    const msg = "Send me a whatsapp mess on +221 77 123 45 67";
    const result = await tryHandleContactHandoffTurn(
      baseParams({
        message: msg,
        locale: "en",
        entities: { preferredContactMethod: "whatsapp" },
        history: [
          {
            role: "assistant",
            content:
              "Would you like us to have a representative contact you, or would you like help with booking an appointment?",
          },
        ],
      }) as any
    );

    expect(result).not.toBeNull();
    expect(createFn).toHaveBeenCalledTimes(1);
    const payload = createFn.mock.calls[0][0];
    expect(payload.patientPhone).toBe("+221771234567");
    expect(payload.patientName).toBe("Anonymous Visitor");
    expect(payload.preferredContactMethod).toBe("whatsapp");
    expect(result!.payload.contactRequestCreated).toBe(true);
  });

  it("TR named path still creates with E.164 phone", async () => {
    const createFn = vi.fn(async () => ({
      success: true,
      contactRequestId: "cr_tr",
      record: { id: "cr_tr", status: "pending", preferredContactMethod: "sms" },
      isDuplicate: false,
      clinicNotificationStatus: "SENT",
    }));

    vi.doMock("@/lib/agent/persistence", () => ({
      respondWithVisibleReply: async (payload: Record<string, unknown>) => ({
        replyText: payload.reply,
        conversationId: "conv_live",
        payload,
      }),
      saveAppointmentState: vi.fn(async () => true),
    }));
    vi.doMock("@/lib/contact-request/service", () => ({
      createContactRequestAndNotify: createFn,
      findUnresolvedContactRequest: vi.fn(async () => null),
      cancelUnresolvedContactRequest: vi.fn(),
      updateContactRequestPreference: vi.fn(),
      buildContactRequestIdempotencyKey: () => "k",
    }));

    const { tryHandleContactHandoffTurn } = await import(
      "@/lib/contact-request/handleContactHandoffTurn"
    );
    await tryHandleContactHandoffTurn(
      baseParams({
        message: "Bana yazın, 0532 123 45 67",
        locale: "tr",
        entities: { preferredContactMethod: "sms", fullName: "Ayşe Yılmaz" },
      }) as any
    );

    expect(createFn).toHaveBeenCalledTimes(1);
    expect(createFn.mock.calls[0][0].patientName).toBe("Ayşe Yılmaz");
    expect(createFn.mock.calls[0][0].patientPhone).toBe("+905321234567");
  });

  it("live-agent without contact details still notifies after confirmation", async () => {
    const createFn = vi.fn(async (payload: Record<string, unknown>) => ({
      success: true,
      contactRequestId: "cr_live",
      record: {
        id: "cr_live",
        status: "pending",
        preferredContactMethod: "unspecified",
        patientName: payload.patientName,
      },
      isDuplicate: false,
      clinicNotificationStatus: "SENT",
    }));

    vi.doMock("@/lib/agent/persistence", () => ({
      respondWithVisibleReply: async (payload: Record<string, unknown>) => ({
        replyText: payload.reply,
        conversationId: "conv_live",
        payload,
      }),
      saveAppointmentState: vi.fn(async () => true),
    }));
    vi.doMock("@/lib/contact-request/service", () => ({
      createContactRequestAndNotify: createFn,
      findUnresolvedContactRequest: vi.fn(async () => null),
      cancelUnresolvedContactRequest: vi.fn(),
      updateContactRequestPreference: vi.fn(),
      buildContactRequestIdempotencyKey: () => "cr:conv_live:nophone:noemail",
    }));

    const { tryHandleContactHandoffTurn } = await import(
      "@/lib/contact-request/handleContactHandoffTurn"
    );
    const { PendingActionManager } = await import("@/lib/conversation");

    const pending = PendingActionManager.createPendingAction(
      "create_contact_request",
      { preferredContactMethod: "unspecified", language: "tr" },
      undefined,
      "Confirm"
    );

    const result = await tryHandleContactHandoffTurn(
      baseParams({
        message: "Evet",
        locale: "tr",
        intent: "contact_handoff_request",
        confirmationAffirmed: true,
        loadedPendingAction: pending,
      }) as any
    );

    expect(result).not.toBeNull();
    expect(createFn).toHaveBeenCalledTimes(1);
    expect(createFn.mock.calls[0][0].patientPhone).toBeUndefined();
    expect(createFn.mock.calls[0][0].patientName).toBe("Anonim Ziyaretçi");
    expect(result!.payload.contactRequestCreated).toBe(true);
  });

  it("second number disclosure in same conversation skips duplicate notify", async () => {
    const createFn = vi.fn(async () => ({
      success: true,
      contactRequestId: "cr_dup",
      record: { id: "cr_dup", status: "pending", preferredContactMethod: "whatsapp" },
      isDuplicate: true,
      clinicNotificationStatus: "SKIPPED_DUPLICATE",
    }));

    vi.doMock("@/lib/agent/persistence", () => ({
      respondWithVisibleReply: async (payload: Record<string, unknown>) => ({
        replyText: payload.reply,
        conversationId: "conv_live",
        payload,
      }),
      saveAppointmentState: vi.fn(async () => true),
    }));
    vi.doMock("@/lib/contact-request/service", () => ({
      createContactRequestAndNotify: createFn,
      findUnresolvedContactRequest: vi.fn(async () => ({
        id: "cr_dup",
        status: "pending",
        preferredContactMethod: "whatsapp",
        clinicNotificationStatus: "sent",
      })),
      cancelUnresolvedContactRequest: vi.fn(),
      updateContactRequestPreference: vi.fn(),
      buildContactRequestIdempotencyKey: () => "k",
    }));

    const { tryHandleContactHandoffTurn } = await import(
      "@/lib/contact-request/handleContactHandoffTurn"
    );

    await tryHandleContactHandoffTurn(
      baseParams({
        message: "Send me a whatsapp mess on +221 77 123 45 67",
        entities: { preferredContactMethod: "whatsapp" },
      }) as any
    );
    await tryHandleContactHandoffTurn(
      baseParams({
        message: "Send me a whatsapp mess on +221 77 123 45 67",
        entities: { preferredContactMethod: "whatsapp" },
      }) as any
    );

    expect(createFn).toHaveBeenCalledTimes(2);
    const statuses = await Promise.all(
      createFn.mock.results.map(async (r) => (await r.value)?.clinicNotificationStatus)
    );
    expect(statuses.every((s) => s === "SKIPPED_DUPLICATE")).toBe(true);
  });
});
