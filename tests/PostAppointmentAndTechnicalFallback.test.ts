/**
 * Regression: post-appointment silent turn, EN technical fallback, outcome status.
 * Behavioural coverage only — no source-grepping.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatTechnicalFallbackReply,
  formatPostAppointmentAnythingElse,
  looksLikeTechnicalFallbackReply,
  resolveClinicPhoneForFallback,
  classifyTechnicalFallbackError,
  fallbackReasonForErrorCategory,
  logTechnicalFallbackEvent,
} from "@/lib/agent/technicalFallback";
import { IntentRouter } from "@/lib/conversation/intentRouter";
import { evaluateAppointmentCollectionGate } from "@/lib/conversation/appointmentIntentGate";
import { applyAppointmentSchedulingAmendment } from "@/lib/conversation";
import { RequestTimer } from "@/lib/performance/requestTimer";

const CLINIC_TZ = "Europe/Istanbul";
/** Tuesday 2026-11-24 08:00 Istanbul = 05:00 UTC */
const FIXED_NOW = new Date("2026-11-24T05:00:00.000Z");
const HOURS = {
  monday: ["09:00", "18:00"] as [string, string],
  tuesday: ["09:00", "18:00"] as [string, string],
  wednesday: ["09:00", "18:00"] as [string, string],
  thursday: ["09:00", "18:00"] as [string, string],
  friday: ["09:00", "18:00"] as [string, string],
  saturday: ["09:00", "14:00"] as [string, string],
  sunday: null,
};

type Saved = Record<string, any>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepMerge(target: Saved, patch: Saved): Saved {
  const out: Saved = { ...target };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out;
}

describe("technical fallback i18n (Bug 2 / 3)", () => {
  it("EN fallback includes handoff offer and optional clinic phone", () => {
    const reply = formatTechnicalFallbackReply({
      locale: "en",
      clinicPhone: "+90 212 000 00 00",
    });
    expect(reply).toMatch(/technical issue/i);
    expect(reply).toContain("+90 212 000 00 00");
    expect(reply).toMatch(/name and phone/i);
    expect(reply).not.toMatch(/teknik bir sorun|doğrudan arayın/i);
  });

  it("looksLikeTechnicalFallbackReply detects EN and TR", () => {
    expect(looksLikeTechnicalFallbackReply(formatTechnicalFallbackReply({ locale: "en" }))).toBe(true);
    expect(looksLikeTechnicalFallbackReply(formatTechnicalFallbackReply({ locale: "tr" }))).toBe(true);
    expect(looksLikeTechnicalFallbackReply("Composite bonding is 150 EUR.")).toBe(false);
  });

  it("resolveClinicPhoneForFallback picks a configured number", () => {
    expect(
      resolveClinicPhoneForFallback({
        whatsappNumber: "+905551112233",
        turkishContactNumber: "0212",
      })
    ).toBe("+905551112233");
  });

  it("classifies timeout vs llm vs rag without leaking message text into category", () => {
    expect(classifyTechnicalFallbackError(new Error("OPENAI_TIMEOUT"), "llm")).toBe("timeout");
    expect(fallbackReasonForErrorCategory("timeout", "llm")).toBe("timeout");
    expect(classifyTechnicalFallbackError(new Error("boom"), "llm")).toBe("llm");
    expect(fallbackReasonForErrorCategory("llm", "llm")).toBe("llm_failure");
    expect(classifyTechnicalFallbackError(new Error("boom"), "rag")).toBe("rag");
    expect(fallbackReasonForErrorCategory("rag", "rag")).toBe("rag_failure");
  });

  it("logTechnicalFallbackEvent emits structured JSON with no message/PII fields", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logTechnicalFallbackEvent({
      category: "timeout",
      fallbackReason: "timeout",
      clinicId: "clinic_test",
      conversationId: "conv_x",
    });
    expect(spy).toHaveBeenCalled();
    const line = String(spy.mock.calls[0]?.[0] || "");
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({
      event: "technical_fallback",
      category: "timeout",
      fallbackReason: "timeout",
      clinicId: "clinic_test",
      conversationId: "conv_x",
    });
    expect(parsed).not.toHaveProperty("message");
    expect(parsed).not.toHaveProperty("userMessage");
    expect(parsed).not.toHaveProperty("patientName");
    expect(parsed).not.toHaveProperty("patientPhone");
    spy.mockRestore();
  });
});

describe("post-appointment wording (minor)", () => {
  it("uses the natural Turkish follow-up phrase", () => {
    expect(formatPostAppointmentAnythingElse("tr")).toBe(
      "Başka bir konuda yardımcı olabileceğim bir şey var mı?"
    );
    expect(formatPostAppointmentAnythingElse("en")).toMatch(/anything else/i);
  });
});

describe("scheduling helpers (Bug 1 outside-hours + date parse)", () => {
  it("classifies 'Yarın sabah saat 10 muayene için gelebilir miyim?' as booking with date/time", () => {
    const classified = IntentRouter.classifyConversationIntent({
      message: "Yarın sabah saat 10 muayene için gelebilir miyim?",
      currentState: "APPOINTMENT_SUBMITTED",
      appointmentSubmitted: true,
      locale: "tr",
      clinicTimeZone: CLINIC_TZ,
      now: FIXED_NOW,
      meridiem: { workingHours: HOURS, is24_7: false },
    });
    const gate = evaluateAppointmentCollectionGate({
      message: "Yarın sabah saat 10 muayene için gelebilir miyim?",
      intent: classified.intent,
      isAppointmentFlowActive: false,
      entities: classified.entities,
    });
    expect(gate.allowed).toBe(true);
    expect(gate.mode).toBe("start");

    const amended = applyAppointmentSchedulingAmendment({
      message: "Yarın sabah saat 10 muayene için gelebilir miyim?",
      draft: {},
      extracted: classified.entities,
      locale: "tr",
      clinicTimeZone: CLINIC_TZ,
      now: FIXED_NOW,
      workingHours: HOURS,
      is24_7: false,
      meridiem: { workingHours: HOURS, is24_7: false },
    });
    expect(amended.outcome).toBe("applied");
    expect(amended.draft.requestedDate).toBe("2026-11-25");
    expect(amended.draft.requestedTime).toBe("10:00");
  });

  it("rejects 'yarın saat 23' outside working hours with a non-empty clarification", () => {
    const amended = applyAppointmentSchedulingAmendment({
      message: "Yarın saat 23 muayene için gelebilir miyim?",
      draft: { patientName: "Ayşe Yılmaz", patientPhone: "+905551112233", requestedService: "Muayene" },
      locale: "tr",
      clinicTimeZone: CLINIC_TZ,
      now: FIXED_NOW,
      workingHours: HOURS,
      is24_7: false,
      meridiem: { workingHours: HOURS, is24_7: false },
    });
    expect(amended.outcome).toBe("invalid");
    const msg = String(amended.message || "").trim();
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).toMatch(/saat|çalışma|uygun|working|hours|closed|outside/i);
  });

  it("post-submit 'Tamam' is casual_conversation (deterministic anything-else path)", () => {
    const classified = IntentRouter.classifyConversationIntent({
      message: "Tamam",
      currentState: "APPOINTMENT_SUBMITTED",
      appointmentSubmitted: true,
      locale: "tr",
    });
    expect(classified.intent).toBe("casual_conversation");
  });
});

describe("empty reply guard", () => {
  it("respondWithVisibleReply never leaves an empty replyText", async () => {
    const { respondWithVisibleReply } = await import("@/lib/agent/persistence");
    const result = await respondWithVisibleReply(
      { reply: "" },
      {
        clinicId: "",
        convId: "",
        userMessage: "hi",
        skipPersist: true,
        detectedLanguage: "en",
      }
    );
    expect(String(result.replyText || "").trim().length).toBeGreaterThan(0);
    expect(result.payload.reply).toMatch(/technical issue/i);
  });
});

describe("pricing without KB should not use technical-only path (Bug 2)", () => {
  it("pricing intent is information-seeking (gate blocked → normal LLM/info path)", () => {
    const classified = IntentRouter.classifyConversationIntent({
      message: "Hi how much cost composite bonding per tooth?",
      currentState: "INITIAL",
      locale: "en",
    });
    expect(classified.intent).toBe("pricing_request");
    const gate = evaluateAppointmentCollectionGate({
      message: "Hi how much cost composite bonding per tooth?",
      intent: classified.intent,
      isAppointmentFlowActive: false,
      entities: classified.entities,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/information_seeking/);
  });
});

describe("handleClinicAgentTurn — LLM/RAG failure and pricing (Bug 2/3)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  function mockClinicDb(clinicFields: Record<string, unknown> = {}) {
    const logState: Saved = {
      status: "open",
      language: "en",
      conversationLocale: "en",
    };
    const logRef = {
      get: async () => ({ exists: Object.keys(logState).length > 0, data: () => ({ ...logState }) }),
      set: async (data: Saved, options?: { merge?: boolean; mergeFields?: string[] }) => {
        if (options?.mergeFields) {
          for (const field of options.mergeFields) logState[field] = data[field];
        } else {
          Object.assign(logState, deepMerge(logState, data));
        }
      },
      create: async (data: Saved) => {
        if (Object.keys(logState).length > 2) {
          // already has more than the seed fields
          throw Object.assign(new Error("ALREADY_EXISTS"), { code: 6 });
        }
        Object.assign(logState, deepMerge(logState, data));
      },
      collection: () => ({
        doc: () => ({ set: async () => undefined, get: async () => ({ exists: false }) }),
        get: async () => ({ docs: [], size: 0 }),
        select: () => ({ get: async () => ({ docs: [] }) }),
      }),
    };
    const adminDb = {
      collection: (name: string) => {
        if (name === "clinics") {
          return {
            doc: () => ({
              get: async () => ({
                exists: true,
                id: "clinic_test",
                data: () => ({
                  name: "Test Dental",
                  language: "en",
                  timezone: CLINIC_TZ,
                  whatsappNumber: "+905551112233",
                  workingHours: HOURS,
                  ...clinicFields,
                }),
              }),
              collection: (sub: string) => {
                if (sub === "conversationLogs") return { doc: () => logRef };
                if (sub === "doctors") return { where: () => ({ get: async () => ({ empty: true, docs: [] }) }) };
                if (sub === "knowledgeBase") return { where: () => ({ get: async () => ({ docs: [] }) }) };
                return { doc: () => ({ get: async () => ({ exists: false }) }) };
              },
            }),
          };
        }
        if (name === "promptSettings") {
          return {
            doc: () => ({
              get: async () => ({
                exists: true,
                data: () => ({ systemPrompt: "You are a helpful clinic assistant.", model: "gpt-4o-mini" }),
              }),
            }),
          };
        }
        if (name === "trainingMaterials") {
          return { where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) };
        }
        if (name === "agencies") return { get: async () => ({ docs: [] }) };
        return { doc: () => ({ get: async () => ({ exists: false }) }) };
      },
    };
    return { logState, adminDb };
  }

  async function wireCommonMocks(adminDb: unknown) {
    vi.doMock("@/lib/firebase-admin", () => ({ getAdminDb: () => adminDb }));
    vi.doMock("@/lib/performance/clinicRuntimeCache", () => ({
      getCachedClinicRuntime: () => null,
      setCachedClinicRuntime: () => undefined,
    }));
    vi.doMock("@/lib/services/conversations/conversationTranscriptService", () => ({
      syncConversationLogMessagesFromHistory: vi.fn(async () => 2),
      commitConversationLogTurnInSingleBatch: vi.fn(async () => ({ committed: false })),
    }));
    vi.doMock("@/lib/agent/llmEmergencySignal", () => ({
      LLM_EMERGENCY_TIMEOUT_MS: { web: 50, voice: 50 },
      startLlmEmergencyCheck: () => Promise.resolve({ status: "not_emergency", latencyMs: 1 }),
    }));
  }

  it("forced LLM exception → EN fallback with phone + handoff; stored log status unanswered", async () => {
    const { adminDb, logState } = mockClinicDb();
    await wireCommonMocks(adminDb);
    vi.doMock("@/lib/services/aiGateway", () => ({
      trackableAIRequest: vi.fn(async () => {
        throw new Error("OPENAI_TIMEOUT");
      }),
    }));
    vi.doMock("@/lib/services/retrievalService", () => ({
      hybridSearch: vi.fn(async () => []),
      validateGroundedness: vi.fn(async () => ({ isGrounded: true })),
    }));

    const { handleClinicAgentTurn } = await import("@/lib/agent/handleClinicAgentTurn");
    const result = await handleClinicAgentTurn({
      input: {
        clinicId: "clinic_test",
        conversationId: "conv_llm_fail",
        channel: "web_widget",
        text: "Hi how much cost composite bonding per tooth?",
        history: [],
        locale: "en",
      },
      adminDb,
      perf: new RequestTimer({}),
      debugLog: [],
      startTime: Date.now(),
    });

    expect(result.replyText).toMatch(/technical issue/i);
    expect(result.replyText).toContain("+905551112233");
    expect(result.replyText).toMatch(/name and phone/i);
    expect(result.replyText).not.toMatch(/teknik|doğrudan arayın/i);
    expect(looksLikeTechnicalFallbackReply(result.replyText)).toBe(true);

    // Prove from the stored conversation log — not by calling normalizeConversationStatus.
    expect(logState.status).toBe("unanswered");
    expect(logState.fallbackReason).toBe("timeout");
    expect(logState.failureKind).toBe("technical_failure");
    // Technical failures are not training topics.
    expect(logState.needsTraining).toBe(false);
    expect(logState.trainingTopic).toBeUndefined();
  });

  it("composite bonding with KB price → normal EN answer, not technical fallback", async () => {
    const { adminDb } = mockClinicDb();
    await wireCommonMocks(adminDb);
    vi.doMock("@/lib/services/aiGateway", () => ({
      trackableAIRequest: vi.fn(async () => ({
        content: "Composite bonding is typically 150 EUR per tooth at our clinic.",
        durationMs: 1,
      })),
    }));
    vi.doMock("@/lib/services/retrievalService", () => ({
      hybridSearch: vi.fn(async () => [
        {
          title: "Composite bonding",
          text: "Composite bonding: 150 EUR per tooth.",
          score: 0.9,
          vectorScore: 0.9,
          keywordScore: 0.8,
        },
      ]),
      validateGroundedness: vi.fn(async () => ({ isGrounded: true, ok: true })),
    }));

    const { handleClinicAgentTurn } = await import("@/lib/agent/handleClinicAgentTurn");
    const result = await handleClinicAgentTurn({
      input: {
        clinicId: "clinic_test",
        conversationId: "conv_price_ok",
        channel: "web_widget",
        text: "Hi how much cost composite bonding per tooth?",
        history: [],
        locale: "en",
      },
      adminDb,
      perf: new RequestTimer({}),
      debugLog: [],
      startTime: Date.now(),
    });

    expect(result.replyText).toMatch(/150|EUR|composite/i);
    expect(looksLikeTechnicalFallbackReply(result.replyText)).toBe(false);
  });

  it("composite bonding absent from KB → safe no-price EN answer, no invented EUR amount from fallback", async () => {
    const { adminDb } = mockClinicDb();
    await wireCommonMocks(adminDb);
    vi.doMock("@/lib/services/aiGateway", () => ({
      trackableAIRequest: vi.fn(async () => ({
        content:
          "I don't have a fixed list price for composite bonding in the clinic records. The clinic can give you a personalized quote after evaluation.",
        durationMs: 1,
      })),
    }));
    vi.doMock("@/lib/services/retrievalService", () => ({
      hybridSearch: vi.fn(async () => []),
      validateGroundedness: vi.fn(async () => ({ isGrounded: false })),
    }));

    const { handleClinicAgentTurn } = await import("@/lib/agent/handleClinicAgentTurn");
    const result = await handleClinicAgentTurn({
      input: {
        clinicId: "clinic_test",
        conversationId: "conv_price_missing",
        channel: "web_widget",
        text: "Hi how much cost composite bonding per tooth?",
        history: [],
        locale: "en",
      },
      adminDb,
      perf: new RequestTimer({}),
      debugLog: [],
      startTime: Date.now(),
    });

    expect(looksLikeTechnicalFallbackReply(result.replyText)).toBe(false);
    expect(result.replyText).toMatch(/quote|evaluation|fixed|list price|records/i);
    expect(result.replyText).not.toMatch(/\b€\s*\d|\b\d+\s*EUR\b/i);
  });
});

describe("same-patient reschedule helpers", () => {
  it("detects aynı tedavi / same treatment phrases", async () => {
    const { detectSameTreatmentReference, shouldApplyExtractedTreatmentOnReschedule } = await import(
      "@/lib/agent/samePatientReschedule"
    );
    expect(detectSameTreatmentReference("aynı tedavi")).toBe(true);
    expect(detectSameTreatmentReference("aynısı")).toBe(true);
    expect(detectSameTreatmentReference("önceki gibi")).toBe(true);
    expect(detectSameTreatmentReference("same treatment")).toBe(true);
    expect(detectSameTreatmentReference("same as before")).toBe(true);
    expect(detectSameTreatmentReference("implant")).toBe(false);
    expect(
      shouldApplyExtractedTreatmentOnReschedule({
        previousService: "Diş İmplantı",
        extractedTreatment: "general_consultation",
      })
    ).toBe(false);
    expect(
      shouldApplyExtractedTreatmentOnReschedule({
        previousService: "Diş İmplantı",
        extractedTreatment: "teeth_whitening",
      })
    ).toBe(true);
  });
});

describe("E2E: post-appointment same-patient reschedule carry-over", () => {
  let handleClinicAgentTurn: typeof import("@/lib/agent/handleClinicAgentTurn").handleClinicAgentTurn;
  const createCalls: Array<Record<string, any>> = [];
  let activeAdminDb: unknown = null;

  beforeAll(async () => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_NOW);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
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
      commitConversationLogTurnInSingleBatch: vi.fn(async () => ({ committed: false })),
    }));
    vi.doMock("@/lib/agent/llmEmergencySignal", () => ({
      LLM_EMERGENCY_TIMEOUT_MS: { web: 50, voice: 50 },
      startLlmEmergencyCheck: () => Promise.resolve({ status: "not_emergency", latencyMs: 1 }),
    }));
    vi.doMock("@/lib/appointment-service", () => ({
      createAppointmentAndNotify: vi.fn(async (payload: Record<string, any>) => {
        createCalls.push(payload);
        if (payload.requestKind === "change" && payload.replacesAppointmentId) {
          return {
            success: true,
            appointmentId: payload.replacesAppointmentId,
            status: "PENDING_REVIEW",
            clinicNotificationStatus: "SENT",
            patientNotificationStatus: "SKIPPED",
            requestKind: "change",
          };
        }
        return {
          success: true,
          appointmentId: `apt_${createCalls.length}`,
          status: "PENDING_REVIEW",
          clinicNotificationStatus: "SENT",
          patientNotificationStatus: "SKIPPED",
          requestKind: payload.requestKind || "new",
        };
      }),
    }));
    vi.doMock("@/lib/firebase-admin", () => ({
      getAdminDb: () => activeAdminDb,
    }));
    ({ handleClinicAgentTurn } = await import("@/lib/agent/handleClinicAgentTurn"));
  });

  afterAll(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.doUnmock("@/lib/services/aiGateway");
    vi.doUnmock("@/lib/services/retrievalService");
    vi.doUnmock("@/lib/performance/clinicRuntimeCache");
    vi.doUnmock("@/lib/services/conversations/conversationTranscriptService");
    vi.doUnmock("@/lib/agent/llmEmergencySignal");
    vi.doUnmock("@/lib/appointment-service");
    vi.doUnmock("@/lib/firebase-admin");
  });

  let messageSeq = 0;
  function makeConversation(conversationId = "conv_post_appt_e2e") {
    let saved: Saved = {};
    const logRef = {
      get: async () => ({ exists: Object.keys(saved).length > 0, data: () => ({ ...saved }) }),
      set: async (data: Saved, options?: { merge?: boolean; mergeFields?: string[] }) => {
        if (options?.mergeFields) {
          saved = { ...saved };
          for (const field of options.mergeFields) saved[field] = data[field];
        } else {
          saved = deepMerge(saved, data);
        }
      },
      create: async (data: Saved) => {
        if (Object.keys(saved).length > 0) {
          throw Object.assign(new Error("ALREADY_EXISTS"), { code: 6 });
        }
        saved = deepMerge(saved, data);
      },
      collection: () => ({
        doc: () => ({ set: async () => undefined, get: async () => ({ exists: false }) }),
        get: async () => ({ docs: [], size: 0 }),
        select: () => ({ get: async () => ({ docs: [] }) }),
      }),
    };
    const adminDb = {
      collection: (name: string) => {
        if (name === "clinics") {
          return {
            doc: () => ({
              get: async () => ({
                exists: true,
                id: "clinic_test",
                data: () => ({
                  name: "Test Dental",
                  language: "tr",
                  timezone: CLINIC_TZ,
                  workingHours: HOURS,
                  whatsappNumber: "+905551112233",
                  notificationSettings: {},
                }),
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
          return {
            doc: () => ({
              get: async () => ({
                exists: true,
                data: () => ({ systemPrompt: "Asistan", model: "gpt-4o-mini" }),
              }),
            }),
          };
        }
        if (name === "trainingMaterials") {
          return { where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) };
        }
        if (name === "agencies") return { get: async () => ({ docs: [] }) };
        return { doc: () => ({ get: async () => ({ exists: false }) }) };
      },
    };
    activeAdminDb = adminDb;
    const history: Array<{ role: string; content: string }> = [];
    const say = async (text: string) => {
      messageSeq += 1;
      const result = await handleClinicAgentTurn({
        input: {
          clinicId: "clinic_test",
          conversationId,
          channel: "web_widget",
          text,
          history: [...history],
          locale: "tr",
          context: { messageId: `m${messageSeq}` },
        },
        adminDb,
        perf: new RequestTimer({}),
        debugLog: [],
        startTime: FIXED_NOW.getTime(),
      });
      history.push({ role: "user", content: text }, { role: "assistant", content: result.replyText });
      return {
        reply: result.replyText,
        state: saved.appointmentState as string,
        draft: (saved.appointmentDraft || {}) as Saved,
        saved: () => ({ ...saved }),
      };
    };
    const patchSaved = (patch: Saved) => {
      saved = deepMerge(saved, patch);
    };
    return { say, saved: () => saved, patchSaved };
  }

  async function completeImplantAppointment(
    say: (t: string) => Promise<{ reply: string; state: string; draft: Saved }>
  ) {
    expect((await say("İmplant için randevu almak istiyorum.")).state).toBe("COLLECTING_DATE");
    expect((await say("25 Kasım")).state).toBe("COLLECTING_TIME");
    expect((await say("saat 14:00")).state).toBe("COLLECTING_NAME");
    expect((await say("Ayşe Yılmaz")).state).toBe("COLLECTING_PHONE");
    expect((await say("0532 111 22 33")).state).toBe("COLLECTING_EMAIL");
    expect((await say("E-posta vermek istemiyorum.")).state).toBe("AWAITING_CONFIRMATION");
    const submitted = await say("Onaylıyorum");
    expect(submitted.state).toBe("APPOINTMENT_SUBMITTED");
  }

  it("case1: implant submitted → Tamam → yarın 10 → summary keeps implant, no treatment/name/phone ask", async () => {
    createCalls.length = 0;
    const { say, saved } = makeConversation("conv_case1");
    await completeImplantAppointment(say);
    expect(createCalls).toHaveLength(1);
    expect(String(createCalls[0].requestedService).toLocaleLowerCase("tr-TR")).toContain("implant");
    const firstId = String(saved().appointmentId || "");

    expect((await say("Tamam")).reply).toMatch(/Başka bir konuda yardımcı olabileceğim bir şey var mı/);

    const reschedule = await say("Yarın sabah saat 10 muayene için gelebilir miyim?");
    expect(reschedule.reply).not.toMatch(/hangi tedavi|adınız|isminiz|telefon\s*numaran/i);
    expect(reschedule.state).toBe("AWAITING_CONFIRMATION");
    expect(String(reschedule.draft.requestedService).toLocaleLowerCase("tr-TR")).toContain("implant");
    expect(reschedule.draft.requestedDate).toBe("2026-11-25");
    expect(reschedule.draft.requestedTime).toBe("10:00");
    expect(reschedule.draft.patientName).toBe("Ayşe Yılmaz");
    expect(reschedule.reply).toMatch(/güncelliyorum/i);
    expect(reschedule.reply).toMatch(/10:00/);
    expect(reschedule.reply.toLocaleLowerCase("tr-TR")).toContain("implant");
    expect(saved().appointmentRequestKind).toBe("change");
    expect(saved().replacesAppointmentId).toBe(firstId);
  });

  it("case2: treatment missing from prior → aynı tedavi → clear clarification, no loop", async () => {
    createCalls.length = 0;
    const { say, saved, patchSaved } = makeConversation("conv_case2");
    await completeImplantAppointment(say);
    await say("Tamam");
    // Force prior treatment to be unknown for the reschedule path.
    patchSaved({
      lastSubmittedAppointment: {
        ...(saved().lastSubmittedAppointment || {}),
        requestedService: "",
      },
      requestedService: "",
      appointmentDraft: {},
    });

    const reschedule = await say("Yarın sabah saat 10 muayene için gelebilir miyim?");
    // Without a prior treatment, generic booking may ask once — then aynı tedavi clarifies.
    if (reschedule.state === "COLLECTING_TREATMENT" || /hangi tedavi/i.test(reschedule.reply)) {
      const same = await say("aynı tedavi");
      expect(same.reply).toMatch(/kayıtlı bir tedavi bulamadım|couldn't find a treatment/i);
      expect(same.reply).not.toMatch(/hangi tedavi veya işlem için randevu almak istersiniz/i);
      const again = await say("aynı tedavi");
      expect(again.reply).toMatch(/kayıtlı bir tedavi bulamadım|couldn't find a treatment/i);
      expect(again.state).toBe("COLLECTING_TREATMENT");
    } else {
      // If the turn somehow retained treatment, force a collecting turn via patch then aynı tedavi.
      patchSaved({
        appointmentState: "COLLECTING_TREATMENT",
        appointmentDraft: {
          ...(saved().appointmentDraft || {}),
          requestedService: undefined,
          requestedDate: "2026-11-25",
          requestedTime: "10:00",
          patientName: "Ayşe Yılmaz",
          patientPhone: createCalls[0].patientPhone,
          emailDisposition: "DECLINED",
        },
        lastSubmittedAppointment: {
          ...(saved().lastSubmittedAppointment || {}),
          requestedService: "",
        },
        appointmentRequestKind: "change",
      });
      const same = await say("aynı tedavi");
      expect(same.reply).toMatch(/kayıtlı bir tedavi bulamadım|couldn't find a treatment/i);
    }
  });

  it("case3: known prior treatment + aynı tedavi / aynısı / same treatment resolves", async () => {
    createCalls.length = 0;
    const { say, saved, patchSaved } = makeConversation("conv_case3");
    await completeImplantAppointment(say);
    await say("Tamam");
    // Start a change draft that is missing treatment but keeps date/time/contact.
    patchSaved({
      appointmentState: "COLLECTING_TREATMENT",
      appointmentRequestKind: "change",
      replacesAppointmentId: saved().appointmentId,
      appointmentDraft: {
        requestedDate: "2026-11-25",
        requestedTime: "10:00",
        patientName: "Ayşe Yılmaz",
        patientPhone: createCalls[0].patientPhone,
        emailDisposition: "DECLINED",
      },
      lastSubmittedAppointment: {
        ...(saved().lastSubmittedAppointment || {}),
        requestedService: createCalls[0].requestedService,
      },
    });

    for (const phrase of ["aynı tedavi", "aynısı", "same treatment"] as const) {
      // Reset to collecting treatment between phrases.
      patchSaved({
        appointmentState: "COLLECTING_TREATMENT",
        appointmentDraft: {
          requestedDate: "2026-11-25",
          requestedTime: "10:00",
          patientName: "Ayşe Yılmaz",
          patientPhone: createCalls[0].patientPhone,
          emailDisposition: "DECLINED",
        },
      });
      const r = await say(phrase);
      expect(
        String(r.draft.requestedService || saved().appointmentDraft?.requestedService).toLocaleLowerCase("tr-TR")
      ).toContain("implant");

      expect(r.reply).not.toMatch(/kayıtlı bir tedavi bulamadım/i);
      expect(r.draft.requestedDate).toBe("2026-11-25");
      expect(r.draft.requestedTime).toBe("10:00");
    }
  });

  it("case4: update message names a different treatment → new treatment used", async () => {
    createCalls.length = 0;
    const { say } = makeConversation("conv_case4");
    await completeImplantAppointment(say);
    await say("Tamam");

    const reschedule = await say("Yarın sabah saat 10 diş beyazlatma için gelebilir miyim?");
    expect(reschedule.state).toBe("AWAITING_CONFIRMATION");
    expect(reschedule.draft.requestedService).toMatch(/beyazlat/i);
    expect(reschedule.draft.requestedService).not.toMatch(/implant/i);
    expect(reschedule.draft.requestedDate).toBe("2026-11-25");
    expect(reschedule.draft.requestedTime).toBe("10:00");
    expect(reschedule.reply).toMatch(/beyazlat/i);
  });

  it("case5: confirmation updates existing request once with CHANGE + old/new date-time", async () => {
    createCalls.length = 0;
    const { say, saved } = makeConversation("conv_case5");
    await completeImplantAppointment(say);
    const firstId = String(saved().appointmentId || "");
    const oldDate = createCalls[0].requestedDate;
    const oldTime = createCalls[0].requestedTime;
    await say("Tamam");

    const reschedule = await say("Yarın sabah saat 10 muayene için gelebilir miyim?");
    expect(reschedule.state).toBe("AWAITING_CONFIRMATION");

    const changed = await say("Onaylıyorum");
    expect(changed.state).toBe("APPOINTMENT_SUBMITTED");
    expect(createCalls).toHaveLength(2);
    expect(createCalls[1].requestKind).toBe("change");
    expect(createCalls[1].replacesAppointmentId).toBe(firstId);
    expect(createCalls[1].previousRequestedDate).toBe(oldDate);
    expect(createCalls[1].previousRequestedTime).toBe(oldTime);
    expect(createCalls[1].requestedDate).toBe("2026-11-25");
    expect(createCalls[1].requestedTime).toBe("10:00");
    expect(String(createCalls[1].requestedService).toLocaleLowerCase("tr-TR")).toContain("implant");
    expect(saved().appointmentId).toBe(firstId);
  });
});
