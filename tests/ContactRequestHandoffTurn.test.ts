/**
 * Agent-level Contact Handoff turn handler tests
 * (phone reuse, ask-for-phone, no false success).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("tryHandleContactHandoffTurn", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("@/lib/contact-request/service");
    vi.doUnmock("@/lib/agent/persistence");
  });

  function baseParams(overrides: Record<string, any> = {}) {
    return {
      message: "",
      intent: "contact_handoff_request",
      entities: {},
      locale: "en",
      clinicId: "clinic_1",
      conversationId: "conv_1",
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
      basePersist: (extra: any = {}) => ({
        clinicId: "clinic_1",
        convId: "conv_1",
        userMessage: overrides.message || "",
        history: [],
        ...extra,
      }),
      ...overrides,
    };
  }

  it("asks for phone when call-me has no number", async () => {
    vi.doMock("@/lib/agent/persistence", () => ({
      respondWithVisibleReply: async (payload: any) => ({
        replyText: payload.reply,
        conversationId: "conv_1",
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
        message: "Please call me.",
        entities: { preferredContactMethod: "phone" },
      }) as any
    );

    expect(result).not.toBeNull();
    expect(result!.replyText.toLowerCase()).toMatch(/phone number/);
    expect(result!.payload.contactRequestCreated).not.toBe(true);
  });

  it("reuses phone from earlier history for text-me", async () => {
    const createFn = vi.fn(async () => ({
      success: true,
      contactRequestId: "cr_99",
      record: {
        id: "cr_99",
        status: "pending",
        preferredContactMethod: "sms",
      },
      isDuplicate: false,
      clinicNotificationStatus: "SENT",
    }));

    vi.doMock("@/lib/agent/persistence", () => ({
      respondWithVisibleReply: async (payload: any, persist: any) => ({
        replyText: payload.reply,
        conversationId: "conv_1",
        payload: { ...payload, _persist: persist },
      }),
      saveAppointmentState: vi.fn(async () => true),
    }));
    vi.doMock("@/lib/contact-request/service", () => ({
      createContactRequestAndNotify: createFn,
      findUnresolvedContactRequest: vi.fn(async () => null),
      cancelUnresolvedContactRequest: vi.fn(),
      updateContactRequestPreference: vi.fn(),
      buildContactRequestIdempotencyKey: () => "cr:conv_1:203816:noemail",
    }));

    const { tryHandleContactHandoffTurn } = await import(
      "@/lib/contact-request/handleContactHandoffTurn"
    );
    const result = await tryHandleContactHandoffTurn(
      baseParams({
        message: "Please ask them to text me.",
        entities: { preferredContactMethod: "sms" },
        history: [
          { role: "user", content: "My number is 07743203816" },
          { role: "assistant", content: "Thanks, noted." },
        ],
      }) as any
    );

    expect(result).not.toBeNull();
    expect(createFn).toHaveBeenCalled();
    const calls = createFn.mock.calls as unknown as Array<[any]>;
    expect(String(calls[0]?.[0]?.patientPhone || "")).toMatch(/07743203816|7743203816/);
    expect(result!.replyText.toLowerCase()).toMatch(/forward/);
    expect(result!.payload.contactRequestCreated).toBe(true);
  });

  it("does not claim success when create fails", async () => {
    vi.doMock("@/lib/agent/persistence", () => ({
      respondWithVisibleReply: async (payload: any) => ({
        replyText: payload.reply,
        conversationId: "conv_1",
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
    const result = await tryHandleContactHandoffTurn(
      baseParams({
        message: "Please ask them to text me.",
        entities: { preferredContactMethod: "sms", phone: "07743203816" },
      }) as any
    );

    expect(result!.replyText.toLowerCase()).not.toContain("forwarded");
    expect(result!.payload.contactRequestCreated).toBe(false);
  });

  it("accepts voice channel without telephony", async () => {
    const createFn = vi.fn(async () => ({
      success: true,
      contactRequestId: "cr_voice",
      record: { id: "cr_voice", status: "pending", preferredContactMethod: "phone" },
      clinicNotificationStatus: "DISABLED",
    }));

    vi.doMock("@/lib/agent/persistence", () => ({
      respondWithVisibleReply: async (payload: any) => ({
        replyText: payload.reply,
        conversationId: "conv_1",
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
        channel: "voice",
        message: "Please call me.",
        entities: { preferredContactMethod: "phone", phone: "+905551112233" },
      }) as any
    );

    expect(createFn).toHaveBeenCalled();
    const voiceCalls = createFn.mock.calls as unknown as Array<[any]>;
    expect(voiceCalls[0]?.[0]?.channel).toBe("voice");
  });

  it("phone-only disclosure returns null (no handoff handling)", async () => {
    vi.doMock("@/lib/agent/persistence", () => ({
      respondWithVisibleReply: async (payload: any) => ({
        replyText: payload.reply,
        conversationId: "conv_1",
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
        message: "My number is 07743203816.",
        intent: "unknown",
      }) as any
    );
    expect(result).toBeNull();
  });
});
