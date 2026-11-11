/**
 * LLM emergency signal alongside the keyword detector (OR logic, keyword fail-open).
 * The classifier is mocked; Agent Core runs end-to-end on widget and voice.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestTimer } from "@/lib/performance/requestTimer";
import { IntentRouter } from "@/lib/conversation/intentRouter";
import {
  LLM_EMERGENCY_TIMEOUT_MS,
  readEmergencySignal,
  startLlmEmergencyCheck,
} from "@/lib/agent/llmEmergencySignal";

const TR_EMERGENCY = "Acil bir durumsa lütfen hemen 112'yi arayın (Türkiye dışındaysanız bulunduğunuz ülkenin acil numarasını).";
const CHAT_REPLY = "Normal asistan yanıtı.";
/** Not caught by the keyword detector, so only the LLM can flag it. */
const AMBIGUOUS_MESSAGE = "İmplanttan sonra kendimi hiç iyi hissetmiyorum, sol tarafım uyuşuyor";
const KEYWORD_MESSAGE = "Şiddetli kanama var";

type GatewayRequest = { requestType: string; responseFormat?: unknown; model?: string; messages: Array<{ role: string; content: string }> };
type GatewayResponse = { content: string; durationMs: number };

describe("readEmergencySignal (schema validation)", () => {
  it("accepts exactly {emergency: boolean}", () => {
    expect(readEmergencySignal('{"emergency":true}')).toBe(true);
    expect(readEmergencySignal('{"emergency":false}')).toBe(false);
  });

  it.each([
    ["not JSON", "Evet acil"],
    ["string boolean", '{"emergency":"true"}'],
    ["extra key", '{"emergency":true,"reason":"bleeding"}'],
    ["missing key", "{}"],
    ["array", "[true]"],
    ["null", "null"],
    ["empty", ""],
  ])("rejects %s", (_label, content) => {
    expect(readEmergencySignal(content)).toBeNull();
  });

  it("rejects non-string content", () => {
    expect(readEmergencySignal(undefined)).toBeNull();
    expect(readEmergencySignal({ emergency: true })).toBeNull();
  });
});

describe("startLlmEmergencyCheck", () => {
  const run = (impl: (req: GatewayRequest) => Promise<GatewayResponse>, timeoutMs = 200) => {
    const request = vi.fn(impl);
    const result = startLlmEmergencyCheck({
      message: "x".repeat(800),
      clinicId: "clinic_1",
      conversationId: "conv_1",
      channel: "web_widget",
      timeoutMs,
      request: request as never,
    });
    return { request, result };
  };

  it("maps true / false / invalid / error", async () => {
    expect((await run(async () => ({ content: '{"emergency":true}', durationMs: 1 })).result).status).toBe("emergency");
    expect((await run(async () => ({ content: '{"emergency":false}', durationMs: 1 })).result).status).toBe("not_emergency");
    expect((await run(async () => ({ content: "oops", durationMs: 1 })).result).status).toBe("invalid");
    expect(
      (await run(async () => {
        throw new Error("OpenAI Request Failed: OPENAI_TIMEOUT");
      }).result).status
    ).toBe("error");
  });

  it("resolves as timeout without waiting for a slow model, and a late failure stays contained", async () => {
    const started = Date.now();
    const { result } = run(
      () => new Promise((_resolve, reject) => setTimeout(() => reject(new Error("late")), 300)),
      30
    );
    const outcome = await result;
    expect(outcome.status).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(250);
    await new Promise((r) => setTimeout(r, 320));
  });

  it("sends a strict JSON-schema safety_check request with the truncated message only", async () => {
    const { request, result } = run(async () => ({ content: '{"emergency":false}', durationMs: 1 }));
    await result;
    const [req] = request.mock.calls[0] as unknown as [GatewayRequest & Record<string, unknown>];
    expect(req.requestType).toBe("safety_check");
    expect(req.model).toBe("gpt-4o-mini");
    expect(req.temperature).toBe(0);
    expect(req.responseFormat).toMatchObject({
      type: "json_schema",
      json_schema: {
        strict: true,
        schema: { required: ["emergency"], additionalProperties: false, properties: { emergency: { type: "boolean" } } },
      },
    });
    expect(req.messages).toHaveLength(2);
    expect(req.messages[1]).toEqual({ role: "user", content: "x".repeat(500) });
  });

  it("prompt flags acute symptoms in any language and excludes informational / urgent-booking messages", async () => {
    const { request, result } = run(async () => ({ content: '{"emergency":false}', durationMs: 1 }));
    await result;
    const system = (request.mock.calls[0] as unknown as [GatewayRequest])[0].messages[0].content;
    expect(system).toMatch(/any language/);
    expect(system).toMatch(/acute symptom/);
    expect(system).toMatch(/urgent or emergency appointment without an acute symptom/);
    expect(system).toMatch(/will it hurt\?/);
    expect(system).toMatch(/allergic to penicillin/);
  });

  it("uses tight timeouts, shorter on voice", () => {
    expect(LLM_EMERGENCY_TIMEOUT_MS).toEqual({ web: 1500, voice: 1000 });
  });
});

describe("Agent Core: keyword OR LLM emergency (widget + voice)", () => {
  const logLines: string[] = [];
  let safetyCheck: ReturnType<typeof vi.fn<(req: GatewayRequest) => Promise<GatewayResponse>>>;
  let chat: ReturnType<typeof vi.fn<(req: GatewayRequest) => Promise<GatewayResponse>>>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    logLines.length = 0;
    for (const level of ["log", "warn", "error", "info"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logLines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
      });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function logged(checkpoint: string): Record<string, unknown>[] {
    return logLines
      .filter((line) => line.includes(`"checkpoint":"${checkpoint}"`))
      .map((line) => JSON.parse(line.slice(line.indexOf("{"))));
  }

  async function runTurn(
    text: string,
    channel: "web_widget" | "voice",
    classifier: (req: GatewayRequest) => Promise<GatewayResponse>
  ) {
    const logDoc = {
      get: async () => ({ exists: false, data: () => undefined }),
      set: async () => undefined,
      collection: () => ({ doc: () => ({ set: async () => undefined }) }),
    };
    const adminDb = {
      collection: (name: string) => {
        if (name === "clinics") {
          return {
            doc: () => ({
              get: async () => ({
                exists: true,
                id: "clinic_llm",
                data: () => ({ name: "Test Dental", language: "tr", timezone: "Europe/Istanbul" }),
              }),
              collection: (sub: string) => {
                if (sub === "conversationLogs") return { doc: () => logDoc };
                if (sub === "doctors") return { where: () => ({ get: async () => ({ empty: true, docs: [] }) }) };
                return { doc: () => ({ get: async () => ({ exists: false }) }) };
              },
            }),
          };
        }
        if (name === "promptSettings") {
          return {
            doc: () => ({
              get: async () => ({ exists: true, data: () => ({ systemPrompt: "Asistan", model: "gpt-4o-mini" }) }),
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

    safetyCheck = vi.fn(classifier);
    chat = vi.fn(async () => ({ content: CHAT_REPLY, durationMs: 1 }));
    vi.doMock("@/lib/services/aiGateway", () => ({
      trackableAIRequest: (req: GatewayRequest) => (req.requestType === "safety_check" ? safetyCheck(req) : chat(req)),
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

    const { handleClinicAgentTurn } = await import("@/lib/agent/handleClinicAgentTurn");
    const started = Date.now();
    const result = await handleClinicAgentTurn({
      input: {
        clinicId: "clinic_llm",
        conversationId: `conv_llm_${Math.random().toString(36).slice(2)}`,
        channel,
        text,
        history: [],
        locale: "tr",
      },
      adminDb,
      perf: new RequestTimer({}),
      debugLog: [],
      startTime: Date.now(),
    });
    return { result, elapsedMs: Date.now() - started };
  }

  it("the ambiguous test message is not caught by keywords", () => {
    expect(IntentRouter.isEmergency(AMBIGUOUS_MESSAGE.toLowerCase())).toBe(false);
  });

  describe.each(["web_widget", "voice"] as const)("%s", (channel) => {
    const timeoutMs = channel === "voice" ? LLM_EMERGENCY_TIMEOUT_MS.voice : LLM_EMERGENCY_TIMEOUT_MS.web;

    it("classifier true → fixed 112 reply, no chat call, trigger=llm", async () => {
      const { result } = await runTurn(AMBIGUOUS_MESSAGE, channel, async () => ({ content: '{"emergency":true}', durationMs: 1 }));
      expect(String(result.payload.reply).startsWith(TR_EMERGENCY)).toBe(true);
      expect(chat).not.toHaveBeenCalled();
      expect(logged("EMERGENCY_GUIDANCE")).toEqual([expect.objectContaining({ trigger: "llm", llmStatus: "emergency", channel })]);
    });

    it("classifier false → normal LLM reply", async () => {
      const { result } = await runTurn(AMBIGUOUS_MESSAGE, channel, async () => ({ content: '{"emergency":false}', durationMs: 1 }));
      expect(result.payload.reply).toBe(CHAT_REPLY);
      expect(chat).toHaveBeenCalledTimes(1);
      expect(logged("EMERGENCY_GUIDANCE")).toHaveLength(0);
      expect(logged("EMERGENCY_LLM_CHECK")).toEqual([expect.objectContaining({ llmStatus: "not_emergency", keywordEmergency: false })]);
    });

    it("classifier timeout → keyword decision stands, reply not delayed past the timeout", async () => {
      const { result, elapsedMs } = await runTurn(AMBIGUOUS_MESSAGE, channel, () => new Promise(() => undefined));
      expect(result.payload.reply).toBe(CHAT_REPLY);
      expect(elapsedMs).toBeLessThan(timeoutMs + 1000);
      expect(logged("EMERGENCY_LLM_CHECK")).toEqual([expect.objectContaining({ llmStatus: "timeout" })]);
    }, 10_000);

    it("classifier invalid JSON → keyword decision stands", async () => {
      const { result } = await runTurn(AMBIGUOUS_MESSAGE, channel, async () => ({ content: "emergency: yes", durationMs: 1 }));
      expect(result.payload.reply).toBe(CHAT_REPLY);
      expect(logged("EMERGENCY_LLM_CHECK")).toEqual([expect.objectContaining({ llmStatus: "invalid" })]);
    });

    it("classifier error → keyword decision stands", async () => {
      const { result } = await runTurn(AMBIGUOUS_MESSAGE, channel, async () => {
        throw new Error("OpenAI Request Failed: OPENAI_RATE_LIMITED");
      });
      expect(result.payload.reply).toBe(CHAT_REPLY);
      expect(logged("EMERGENCY_LLM_CHECK")).toEqual([expect.objectContaining({ llmStatus: "error" })]);
    });

    it("keyword hit → fixed reply immediately; classifier never called (even if it would say false)", async () => {
      const { result } = await runTurn(KEYWORD_MESSAGE, channel, async () => ({ content: '{"emergency":false}', durationMs: 1 }));
      expect(String(result.payload.reply).startsWith(TR_EMERGENCY)).toBe(true);
      expect(safetyCheck).not.toHaveBeenCalled();
      expect(chat).not.toHaveBeenCalled();
      expect(logged("EMERGENCY_GUIDANCE")).toEqual([expect.objectContaining({ trigger: "keyword", llmStatus: "not_run" })]);
    });

    it("emergency logs carry no patient text", async () => {
      await runTurn(AMBIGUOUS_MESSAGE, channel, async () => ({ content: '{"emergency":true}', durationMs: 1 }));
      const lines = logLines.filter((l) => l.includes("EMERGENCY_"));
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line).not.toContain("uyuşuyor");
        expect(line).not.toContain("hissetmiyorum");
      }
    });
  });
});
