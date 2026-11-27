/**
 * Regression: "no verified information" must not be answered with the technical-issue
 * fallback, technical failures must not land in the training box, and price answers
 * may only quote verified amounts (EN + TR, any spelling of composite bonding).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { RequestTimer } from "@/lib/performance/requestTimer";
import { looksLikeTechnicalFallbackReply } from "@/lib/agent/technicalFallback";
import { formatNoVerifiedInfoReply, looksLikeNoVerifiedInfoReply } from "@/lib/agent/noVerifiedInfoReply";
import {
  containsPriceAmount,
  detectPriceIntent,
  findUnverifiedPriceAmounts,
  statesFreePrice,
} from "@/lib/agent/pricingPolicy";
import {
  failureKindForReason,
  resolveConversationFailureKind,
  shouldShowTrainingTopic,
} from "@/lib/services/conversations/conversationFailureKind";
import { PendingActionManager } from "@/lib/conversation/PendingActionManager";

const CLINIC_TZ = "Europe/Istanbul";
/** Tuesday 2026-11-24 08:00 Istanbul */
const FIXED_NOW = new Date("2026-11-24T05:00:00.000Z");
const CLINIC_PHONE = "+90 533 000 00 00";
const HOURS = {
  monday: ["09:00", "18:00"] as [string, string],
  tuesday: ["09:00", "18:00"] as [string, string],
  wednesday: ["09:00", "18:00"] as [string, string],
  thursday: ["09:00", "18:00"] as [string, string],
  friday: ["09:00", "18:00"] as [string, string],
  saturday: ["09:00", "14:00"] as [string, string],
  sunday: null,
};
const TECHNICAL_TEXT = /technical issue|teknik (bir )?sorun|temporary technical/i;

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

describe("no-verified-info reply (knowledge gap) vs technical fallback", () => {
  it.each(["en", "tr", "de", "fr", "ar", "ru"])("%s reply never reads as a technical failure", (locale) => {
    for (const topic of ["price", "general"] as const) {
      const reply = formatNoVerifiedInfoReply({ locale, topic, clinicPhone: CLINIC_PHONE });
      expect(looksLikeTechnicalFallbackReply(reply)).toBe(false);
      expect(looksLikeNoVerifiedInfoReply(reply)).toBe(true);
      expect(reply).toContain(CLINIC_PHONE);
    }
  });

  it("EN/TR handoff offer opens the existing contact-request flow", () => {
    for (const locale of ["en", "tr", "de"]) {
      const reply = formatNoVerifiedInfoReply({ locale, topic: "price", clinicPhone: CLINIC_PHONE });
      expect(PendingActionManager.detectOfferedAction(reply)).toBe("create_contact_request");
    }
    const en = formatNoVerifiedInfoReply({ locale: "en", topic: "price" });
    expect(en).toMatch(/verified price/i);
    expect(en).toMatch(/clinic team can give you accurate pricing/i);
    expect(en).toMatch(/name and phone number/i);
    const tr = formatNoVerifiedInfoReply({ locale: "tr", topic: "price" });
    expect(tr).toMatch(/doğrulanmış bir fiyat bilgim bulunmuyor/);
    expect(tr).toMatch(/klinik ekibimiz/);
  });

  it("mid-flow variant has no contact offer (appointment flow keeps the turn)", () => {
    const reply = formatNoVerifiedInfoReply({ locale: "tr", topic: "price", offerHandoff: false });
    expect(PendingActionManager.detectOfferedAction(reply)).toBeNull();
    expect(reply).not.toMatch(/telefon numaranızı/);
  });
});

describe("price question detection and verified-amount guard", () => {
  it.each([
    ["How much is composite bonding", "treatment_price"],
    ["how much is composite bonding?", "treatment_price"],
    ["Composite bonding prices", "treatment_price"],
    ["Kompozit bonding fiyatı ne kadar?", "treatment_price"],
    ["kompozit bonding ücreti nedir", "treatment_price"],
    ["bonding kaç para", "treatment_price"],
    ["What does bonding cost?", "treatment_price"],
    ["İlk muayene ücretli mi?", "examination_fee"],
    ["Is the first consultation free?", "examination_fee"],
    ["Röntgen ücreti ne kadar?", "xray_fee"],
  ])("%s → %s", (message, expected) => {
    expect(detectPriceIntent(message.toLowerCase())).toBe(expected);
  });

  it.each(["Kanal tedavisi ne kadar sürer?", "How long does bonding take?", "Kliniğiniz nerede?"])(
    "%s is not a price question",
    (message) => {
      expect(detectPriceIntent(message.toLowerCase())).toBe("");
    }
  );

  it("flags only amounts absent from verified sources", () => {
    const kb = "Composite bonding: 150 EUR per tooth. İmplant 1.500 € başlangıç.";
    expect(findUnverifiedPriceAmounts("Composite bonding is 150 EUR per tooth.", [kb])).toEqual([]);
    expect(findUnverifiedPriceAmounts("Implant starts from €1,500.", [kb])).toEqual([]);
    expect(findUnverifiedPriceAmounts("Bonding costs around 200 EUR.", [kb])).toEqual(["200"]);
    expect(findUnverifiedPriceAmounts("Diş başı 3.000 TL civarındadır.", [kb])).toEqual(["3000"]);
    expect(findUnverifiedPriceAmounts("It takes 2 sessions.", [kb])).toEqual([]);
  });

  it("recognises quoted amounts and free prices", () => {
    expect(containsPriceAmount("150 EUR")).toBe(true);
    expect(containsPriceAmount("$99")).toBe(true);
    expect(containsPriceAmount("depends on the number of teeth")).toBe(false);
    expect(statesFreePrice("İlk muayene ücretsizdir.")).toBe(true);
    expect(statesFreePrice("Feel free to ask.")).toBe(false);
  });
});

describe("conversation failure kind (log schema, backward compatible)", () => {
  it("maps fallback reasons", () => {
    expect(failureKindForReason("timeout")).toBe("technical_failure");
    expect(failureKindForReason("llm_failure")).toBe("technical_failure");
    expect(failureKindForReason("technical_fallback_dual_write")).toBe("technical_failure");
    expect(failureKindForReason("price_not_verified")).toBe("knowledge_gap");
    expect(failureKindForReason("groundedness_failure")).toBe("knowledge_gap");
    expect(failureKindForReason("")).toBeNull();
  });

  it("legacy technical log (production shape) is not shown as a training topic", () => {
    const legacy = {
      status: "unanswered",
      needsTraining: true,
      trainingTopic: "How much is composite bonding",
      fallbackReason: "technical_fallback_dual_write",
    };
    expect(resolveConversationFailureKind(legacy)).toBe("technical_failure");
    expect(shouldShowTrainingTopic(legacy)).toBe(false);
  });

  it("legacy knowledge-gap log keeps its training topic", () => {
    const legacy = { status: "unanswered", needsTraining: true, trainingTopic: "x" };
    expect(shouldShowTrainingTopic(legacy)).toBe(true);
    expect(shouldShowTrainingTopic({ ...legacy, fallbackReason: "groundedness_failure" })).toBe(true);
  });

  it("new-schema logs trust needsTraining", () => {
    expect(shouldShowTrainingTopic({ needsTraining: true, failureKind: "knowledge_gap" })).toBe(true);
    expect(shouldShowTrainingTopic({ needsTraining: false, failureKind: "technical_failure" })).toBe(false);
    expect(resolveConversationFailureKind({ failureKind: null, fallbackReason: "timeout" })).toBeNull();
  });
});

describe("E2E handleClinicAgentTurn — no knowledge vs technical failure", () => {
  let handleClinicAgentTurn: typeof import("@/lib/agent/handleClinicAgentTurn").handleClinicAgentTurn;
  let llmImpl: () => Promise<{ content: string; durationMs: number }> = async () => ({
    content: "Tamam.",
    durationMs: 1,
  });
  const llmCalls: Array<{ messages: Array<{ role: string; content: string }> }> = [];
  let kbDocs: Array<Record<string, unknown>> = [];
  let grounded = true;
  let activeAdminDb: unknown = null;

  beforeAll(async () => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_NOW);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.doMock("@/lib/services/aiGateway", () => ({
      trackableAIRequest: vi.fn(async (req: { messages: Array<{ role: string; content: string }> }) => {
        llmCalls.push({ messages: req.messages });
        return llmImpl();
      }),
    }));
    vi.doMock("@/lib/services/retrievalService", () => ({
      hybridSearch: vi.fn(async () => kbDocs),
      validateGroundedness: vi.fn(async () => ({ isGrounded: grounded, reason: "" })),
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
      createAppointmentAndNotify: vi.fn(async () => {
        throw new Error("appointment side effects are not expected in these tests");
      }),
    }));
    vi.doMock("@/lib/firebase-admin", () => ({ getAdminDb: () => activeAdminDb }));
    ({ handleClinicAgentTurn } = await import("@/lib/agent/handleClinicAgentTurn"));
  });

  afterAll(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    for (const m of [
      "@/lib/services/aiGateway",
      "@/lib/services/retrievalService",
      "@/lib/performance/clinicRuntimeCache",
      "@/lib/services/conversations/conversationTranscriptService",
      "@/lib/agent/llmEmergencySignal",
      "@/lib/appointment-service",
      "@/lib/firebase-admin",
    ]) {
      vi.doUnmock(m);
    }
  });

  let messageSeq = 0;
  function makeConversation(conversationId: string, language: "en" | "tr") {
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
        if (Object.keys(saved).length > 0) throw Object.assign(new Error("ALREADY_EXISTS"), { code: 6 });
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
                  language,
                  timezone: CLINIC_TZ,
                  workingHours: HOURS,
                  whatsappNumber: CLINIC_PHONE,
                  notificationSettings: {},
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
          locale: language,
          context: { messageId: `nk${messageSeq}` },
        },
        adminDb,
        perf: new RequestTimer({}),
        debugLog: [],
        startTime: FIXED_NOW.getTime(),
      });
      history.push({ role: "user", content: text }, { role: "assistant", content: result.replyText });
      return { reply: result.replyText, payload: result.payload as Saved, saved: () => ({ ...saved }) };
    };
    return { say, saved: () => saved };
  }

  function useLlmReply(content: string) {
    llmImpl = async () => ({ content, durationMs: 1 });
  }

  it("EN price, no KB price, model invents an amount → no technical text, verified-info reply, handoff, knowledge gap logged", async () => {
    kbDocs = [];
    grounded = true;
    useLlmReply("Composite bonding usually costs around 200 EUR per tooth.");
    const { say, saved } = makeConversation("conv_nk_en", "en");
    const r = await say("How much is composite bonding");

    expect(r.reply).not.toMatch(TECHNICAL_TEXT);
    expect(r.reply).not.toMatch(/200\s*EUR/i);
    expect(r.reply).toMatch(/verified price/i);
    expect(r.reply).toMatch(/clinic team/i);
    expect(r.reply).toContain(CLINIC_PHONE);
    expect(r.payload.pendingAction?.type).toBe("create_contact_request");

    expect(saved().status).toBe("unanswered");
    expect(saved().failureKind).toBe("knowledge_gap");
    expect(saved().fallbackReason).toBe("price_not_verified");
    expect(saved().needsTraining).toBe(true);
    expect(saved().trainingTopic).toBe("How much is composite bonding");
  });

  it.each(["Kompozit bonding fiyatı ne kadar?", "Composite bonding fiyatı nedir?", "Bonding ücreti ne kadar?"])(
    "TR price (%s), model invents an amount → blocked, no technical text, handoff",
    async (question) => {
      kbDocs = [];
      grounded = true;
      useLlmReply("Kompozit bonding diş başı 3.000 TL civarındadır.");
      const { say, saved } = makeConversation(`conv_nk_tr_${question.length}`, "tr");
      const r = await say(question);

      expect(r.reply).not.toMatch(TECHNICAL_TEXT);
      expect(r.reply).not.toMatch(/3\.000\s*TL/);
      expect(r.reply).toMatch(/doğrulanmış bir fiyat bilgim bulunmuyor/);
      expect(r.reply).toMatch(/klinik ekibimiz/);
      expect(r.payload.pendingAction?.type).toBe("create_contact_request");
      expect(saved().failureKind).toBe("knowledge_gap");
      expect(saved().needsTraining).toBe(true);
    }
  );

  it("price question sends the single price policy block to the model (EN 'how much')", async () => {
    kbDocs = [];
    useLlmReply("The price of composite bonding depends on the number of teeth; our clinic team can confirm it.");
    llmCalls.length = 0;
    const { say, saved } = makeConversation("conv_nk_policy", "en");
    const r = await say("How much is composite bonding");
    const system = llmCalls.at(-1)?.messages[0]?.content || "";
    expect(system).toContain("FİYAT POLİTİKASI");
    expect(system).not.toContain("ÖNEMLİ FİYATLANDIRMA KURALLARI");
    // A model answer without an amount is kept, but logged as a knowledge gap.
    expect(r.reply).toMatch(/depends on the number of teeth/);
    expect(saved().failureKind).toBe("knowledge_gap");
    expect(saved().needsTraining).toBe(true);
  });

  it("verified KB price → exact price, answered, no training topic", async () => {
    kbDocs = [
      { title: "Composite bonding", text: "Composite bonding: 150 EUR per tooth.", score: 0.9, vectorScore: 0.9, keywordScore: 0.8 },
    ];
    grounded = true;
    useLlmReply("Composite bonding is 150 EUR per tooth at our clinic.");
    const { say, saved } = makeConversation("conv_nk_kb", "en");
    const r = await say("How much is composite bonding");

    expect(r.reply).toMatch(/150 EUR per tooth/);
    expect(r.reply).not.toMatch(TECHNICAL_TEXT);
    expect(saved().status).toBe("answered");
    expect(saved().failureKind).toBeNull();
    expect(saved().needsTraining).toBe(false);
  });

  it("simulated LLM error → technical message, logged as technical failure, NOT a training topic", async () => {
    kbDocs = [];
    llmImpl = async () => {
      throw new Error("OpenAI Request Failed: OPENAI_ERROR_500");
    };
    const { say, saved } = makeConversation("conv_nk_llm_err", "en");
    const r = await say("How much is composite bonding");

    expect(r.reply).toMatch(/temporary technical issue/i);
    expect(r.reply).toContain(CLINIC_PHONE);
    expect(saved().status).toBe("unanswered");
    expect(saved().failureKind).toBe("technical_failure");
    expect(saved().fallbackReason).toBe("llm_failure");
    expect(saved().needsTraining).toBe(false);
    expect(saved().trainingTopic).toBeUndefined();
    expect(shouldShowTrainingTopic(saved())).toBe(false);
  });

  function gatewayQuotaError() {
    // Shape thrown by trackableAIRequest when OpenAI answers 429 credit_balance_exhausted.
    return Object.assign(new Error("OpenAI Request Failed: OPENAI_QUOTA_EXCEEDED"), {
      code: "OPENAI_QUOTA_EXCEEDED",
      providerErrorCode: "credit_balance_exhausted",
      httpStatus: 429,
    });
  }

  function technicalFallbackLogs(): Array<Record<string, unknown>> {
    return vi
      .mocked(console.error)
      .mock.calls.map((args) => args[0])
      .filter((a): a is string => typeof a === "string" && a.includes('"event":"technical_fallback"'))
      .map((a) => JSON.parse(a) as Record<string, unknown>);
  }

  it.each([
    ["with KB match (production: keyword hit on 'Kompozit Bonding')", true],
    ["without KB", false],
  ])(
    "'How much is composite bonding' + OpenAI credit_balance_exhausted %s → technical message, real error code logged, not training",
    async (_label, withKb) => {
      kbDocs = withKb
        ? [{ title: "Kompozit Bonding", text: "Kompozit bonding estetik bir uygulamadır.", score: 0.4, vectorScore: 0, keywordScore: 0.8 }]
        : [];
      llmImpl = async () => {
        throw gatewayQuotaError();
      };
      vi.mocked(console.error).mockClear();
      const convId = `conv_nk_quota_${withKb ? "kb" : "nokb"}`;
      const { say, saved } = makeConversation(convId, "en");
      const r = await say("How much is composite bonding");

      expect(r.reply).toMatch(/temporary technical issue/i);
      expect(r.reply).toContain(CLINIC_PHONE);
      expect(r.reply).not.toMatch(/verified price/i);
      expect(saved().failureKind).toBe("technical_failure");
      expect(saved().fallbackReason).toBe("llm_failure");
      expect(saved().technicalErrorCode).toBe("OPENAI_QUOTA_EXCEEDED");
      expect(saved().needsTraining).toBe(false);
      expect(saved().trainingTopic).toBeUndefined();
      expect(shouldShowTrainingTopic(saved())).toBe(false);

      const events = technicalFallbackLogs();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        category: "llm",
        fallbackReason: "llm_failure",
        step: "llm_call",
        errorType: "Error",
        errorCode: "OPENAI_QUOTA_EXCEEDED",
        providerErrorCode: "credit_balance_exhausted",
        httpStatus: 429,
        clinicId: "clinic_test",
        conversationId: convId,
      });
      const raw = JSON.stringify(events[0]);
      expect(raw).not.toMatch(/composite bonding/i);
      expect(raw).not.toContain(CLINIC_PHONE);
    }
  );

  it("RAG failure → technical message, step rag_retrieval + code on the log, not training", async () => {
    const { hybridSearch } = await import("@/lib/services/retrievalService");
    vi.mocked(hybridSearch).mockImplementationOnce(async () => {
      throw gatewayQuotaError();
    });
    vi.mocked(console.error).mockClear();
    const { say, saved } = makeConversation("conv_nk_rag_err", "en");
    const r = await say("How much is composite bonding");

    expect(r.reply).toMatch(/temporary technical issue/i);
    expect(saved().failureKind).toBe("technical_failure");
    expect(saved().fallbackReason).toBe("rag_failure");
    expect(saved().technicalErrorCode).toBe("OPENAI_QUOTA_EXCEEDED");
    expect(saved().needsTraining).toBe(false);
    expect(technicalFallbackLogs()[0]).toMatchObject({
      step: "rag_retrieval",
      providerErrorCode: "credit_balance_exhausted",
      conversationId: "conv_nk_rag_err",
    });
  });

  it("knowledge-gap turns never carry a technicalErrorCode", async () => {
    kbDocs = [];
    grounded = true;
    useLlmReply("Composite bonding usually costs around 200 EUR per tooth.");
    const { say, saved } = makeConversation("conv_nk_gap_code", "en");
    await say("How much is composite bonding");
    expect(saved().failureKind).toBe("knowledge_gap");
    expect(saved().technicalErrorCode).toBeNull();
  });

  it("empty model content → no technical text, logged as technical (not training)", async () => {
    kbDocs = [];
    useLlmReply("");
    const { say, saved } = makeConversation("conv_nk_empty", "en");
    const r = await say("How much is composite bonding");

    expect(r.reply).not.toMatch(TECHNICAL_TEXT);
    expect(r.reply).toMatch(/verified price/i);
    expect(saved().fallbackReason).toBe("empty_model_reply");
    expect(saved().failureKind).toBe("technical_failure");
    expect(saved().needsTraining).toBe(false);
  });

  it("ungrounded general answer → verified-info reply, unanswered + training topic", async () => {
    kbDocs = [
      { title: "Hours", text: "We are open Monday to Saturday.", score: 0.5, vectorScore: 0.5, keywordScore: 0.2 },
    ];
    grounded = false;
    useLlmReply("Yes, there is free valet parking right in front of the clinic.");
    const { say, saved } = makeConversation("conv_nk_grounded", "en");
    const r = await say("Is there parking near the clinic?");

    expect(r.reply).not.toMatch(TECHNICAL_TEXT);
    expect(r.reply).toMatch(/verified information/i);
    expect(saved().status).toBe("unanswered");
    expect(saved().failureKind).toBe("knowledge_gap");
    expect(saved().fallbackReason).toBe("groundedness_failure");
    expect(saved().needsTraining).toBe(true);
    grounded = true;
  });

  it("mid-flow price question without verified price → slots kept, flow resumes at the right slot", async () => {
    kbDocs = [];
    grounded = true;
    useLlmReply("Tamam.");
    const { say, saved } = makeConversation("conv_nk_midflow", "tr");
    await say("İmplant için randevu almak istiyorum.");
    await say("25 Kasım");
    expect(saved().appointmentState).toBe("COLLECTING_TIME");
    const draftBefore = { ...(saved().appointmentDraft || {}) };

    useLlmReply("Kompozit bonding diş başı 3.000 TL civarındadır.");
    const r = await say("Bu arada kompozit bonding fiyatı ne kadar?");

    expect(r.reply).not.toMatch(TECHNICAL_TEXT);
    expect(r.reply).not.toMatch(/3\.000\s*TL/);
    expect(r.reply).toMatch(/doğrulanmış bir fiyat bilgim bulunmuyor/);
    expect(r.reply).toMatch(/kaldığımız yerden devam/i);
    expect(r.reply).toMatch(/saat/i);
    expect(r.payload.pendingAction?.type).not.toBe("create_contact_request");
    expect(saved().appointmentState).toBe("COLLECTING_TIME");
    expect(saved().appointmentDraft?.requestedService).toBe(draftBefore.requestedService);
    expect(saved().appointmentDraft?.requestedDate).toBe(draftBefore.requestedDate);
    expect(saved().needsTraining).toBe(true);

    useLlmReply("Tamam.");
    const next = await say("saat 14:00");
    expect(saved().appointmentState).toBe("COLLECTING_NAME");
    expect(saved().appointmentDraft?.requestedTime).toBe("14:00");
    expect(next.reply).not.toMatch(TECHNICAL_TEXT);
  });
});

describe("conversation-log dual-write keeps technical failures out of training", () => {
  function makeDualWriteDb(existingLog: Saved | null) {
    let log: Saved | null = existingLog ? { ...existingLog } : null;
    const conv: { data: Saved | null } = { data: null };
    const messages = new Map<string, Saved>();
    const db = {
      collection: () => ({
        doc: () => ({
          collection: (sub: string) => ({
            doc: () => {
              if (sub === "conversations") {
                return {
                  get: async () => ({ exists: Boolean(conv.data), data: () => conv.data }),
                  set: async (d: Saved) => {
                    conv.data = { ...d };
                  },
                  update: async (d: Saved) => {
                    conv.data = { ...(conv.data || {}), ...d };
                  },
                  collection: () => ({ add: async () => undefined }),
                };
              }
              return {
                get: async () => ({ exists: Boolean(log), data: () => (log ? { ...log } : undefined) }),
                set: async (d: Saved) => {
                  log = deepMerge(log || {}, d);
                },
                collection: () => ({
                  doc: (id: string) => ({
                    get: async () => ({ exists: messages.has(id), data: () => messages.get(id) }),
                    set: async (d: Saved) => {
                      messages.set(id, d);
                    },
                  }),
                  select: () => ({ get: async () => ({ docs: [] }) }),
                  get: async () => ({ size: messages.size, docs: [] }),
                }),
              };
            },
          }),
        }),
      }),
    };
    return { db, log: () => log };
  }

  async function postTurn(db: unknown, assistantMessage: string) {
    vi.resetModules();
    vi.doMock("@/lib/firebase-admin", () => ({ getAdminDb: () => db }));
    const { POST } = await import("@/app/api/public/conversation-log/route");
    const res = await POST(
      new Request("http://localhost/api/public/conversation-log", {
        method: "POST",
        body: JSON.stringify({
          clinicId: "clinic_test",
          sessionId: "sess_dual",
          userMessage: "How much is composite bonding",
          assistantMessage,
        }),
      })
    );
    vi.doUnmock("@/lib/firebase-admin");
    return res;
  }

  it("preserves the server's technical reason and does not set needsTraining", async () => {
    const { db, log } = makeDualWriteDb({
      status: "unanswered",
      fallbackReason: "timeout",
      failureKind: "technical_failure",
      needsTraining: false,
      createdAt: "2026-11-24T05:00:00.000Z",
    });
    const res = await postTurn(db, "We're experiencing a temporary technical issue.");
    expect(res.status).toBe(200);
    expect(log()?.fallbackReason).toBe("timeout");
    expect(log()?.failureKind).toBe("technical_failure");
    expect(log()?.needsTraining).toBe(false);
  });

  it("first write of a technical turn is technical, not a training topic", async () => {
    const { db, log } = makeDualWriteDb(null);
    await postTurn(db, "We're experiencing a temporary technical issue.");
    expect(log()?.status).toBe("unanswered");
    expect(log()?.failureKind).toBe("technical_failure");
    expect(log()?.fallbackReason).toBe("technical_fallback_dual_write");
    expect(log()?.needsTraining).not.toBe(true);
  });

  it("replaces a stale non-technical reason when this turn is technical", async () => {
    const { db, log } = makeDualWriteDb({
      status: "answered",
      fallbackReason: "price_not_verified",
      createdAt: "2026-11-24T05:00:00.000Z",
    });
    await postTurn(db, "Şu an geçici bir teknik sorun yaşıyoruz.");
    expect(log()?.fallbackReason).toBe("technical_fallback_dual_write");
    expect(log()?.failureKind).toBe("technical_failure");
  });
});
