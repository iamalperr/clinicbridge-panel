/**
 * Voice RAG fast path: spoken turns skip the LLM query rewrite and bound the query embedding.
 * On timeout/failure retrieval degrades to keyword scoring over the same clinic documents
 * (never invented content). Web retrieval is unchanged.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const rewriteCreate = vi.fn();
const generateEmbeddings = vi.fn();

vi.mock("@/lib/services/embeddingService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/embeddingService")>();
  return {
    ...actual,
    generateEmbeddings: (...args: unknown[]) => generateEmbeddings(...args),
    getOpenAI: () => ({ chat: { completions: { create: rewriteCreate } } }),
  };
});

import { hybridSearch, VOICE_RAG_EMBED_BUDGET_MS } from "@/lib/services/retrievalService";

const DIMS = 8;
const unit = (i: number) => Array.from({ length: DIMS }, (_, k) => (k === i ? 1 : 0));

const CLINIC_DOCS = [
  {
    id: "implant",
    title: "Implant",
    content: "",
    embeddingChunks: [{ chunk_index: 0, text: "Implant tedavisi fiyatı muayene sonrası belirlenir.", embedding: unit(0) }],
  },
  {
    id: "hours",
    title: "Saatler",
    content: "",
    embeddingChunks: [{ chunk_index: 0, text: "Klinik hafta içi 09:00-18:00 açıktır.", embedding: unit(1) }],
  },
];
const DOC_TEXTS = new Set(CLINIC_DOCS.flatMap((d) => d.embeddingChunks.map((c) => c.text)));
const QUESTION = "implant fiyatı ne kadar";

let previousKey: string | undefined;
let logs: string[] = [];

beforeEach(() => {
  previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-placeholder-not-a-key";
  rewriteCreate.mockReset();
  generateEmbeddings.mockReset();
  rewriteCreate.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ queries: ["implant ücreti"] }) } }] });
  logs = [];
  const push = (...a: unknown[]) => logs.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
  vi.spyOn(console, "log").mockImplementation(push);
  vi.spyOn(console, "warn").mockImplementation(push);
  vi.spyOn(console, "error").mockImplementation(push);
});

afterEach(() => {
  if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousKey;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function ragPerf(): Record<string, unknown>[] {
  return logs.filter((l) => l.startsWith("{")).map((l) => JSON.parse(l)).filter((o) => o.checkpoint === "RAG_PERF");
}

describe("voice budget retrieval", () => {
  it("no LLM rewrite; one bounded embedding of the raw message; vector-ranked clinic chunks", async () => {
    generateEmbeddings.mockResolvedValue([unit(0)]);
    const top = await hybridSearch(QUESTION, CLINIC_DOCS, "Nova", 5, { voiceBudget: {} });
    expect(rewriteCreate).not.toHaveBeenCalled();
    expect(generateEmbeddings).toHaveBeenCalledTimes(1);
    expect(generateEmbeddings).toHaveBeenCalledWith([QUESTION], { timeoutMs: VOICE_RAG_EMBED_BUDGET_MS, maxRetries: 0 });
    expect(top[0].doc_id).toBe("implant");
    expect(top[0].vectorScore).toBeCloseTo(1);
    expect(ragPerf()[0]).toMatchObject({ mode: "voice_budget", outcome: "VECTOR", rewriteMs: 0, queryCount: 1, embedBudgetMs: VOICE_RAG_EMBED_BUDGET_MS });
  });

  it("embedding past the budget → keyword scoring over the same clinic docs, nothing invented", async () => {
    vi.useFakeTimers();
    generateEmbeddings.mockImplementation(() => new Promise(() => undefined));
    const pending = hybridSearch(QUESTION, CLINIC_DOCS, "Nova", 5, { voiceBudget: {} });
    await vi.advanceTimersByTimeAsync(VOICE_RAG_EMBED_BUDGET_MS);
    const top = await pending;
    expect(top.length).toBeGreaterThan(0);
    for (const chunk of top) {
      expect(DOC_TEXTS.has(chunk.text)).toBe(true);
      expect(chunk.vectorScore).toBe(0);
    }
    expect(top[0].doc_id).toBe("implant");
    expect(ragPerf()[0]).toMatchObject({ outcome: "KEYWORD_TIMEOUT" });
  });

  it("embedding failure → keyword scoring; no retries; no message text in logs", async () => {
    generateEmbeddings.mockRejectedValue(Object.assign(new Error("Connection error."), { status: 500 }));
    const top = await hybridSearch(QUESTION, CLINIC_DOCS, "Nova", 5, { voiceBudget: {} });
    expect(generateEmbeddings).toHaveBeenCalledTimes(1);
    for (const chunk of top) expect(DOC_TEXTS.has(chunk.text)).toBe(true);
    expect(ragPerf()[0]).toMatchObject({ outcome: "KEYWORD_ERROR" });
    expect(logs.join("\n")).not.toContain(QUESTION);
  });

  it("a question with no matching clinic knowledge yields only zero-score chunks of this clinic's own docs", async () => {
    generateEmbeddings.mockRejectedValue(new Error("down"));
    const top = await hybridSearch("zzz qqq www", CLINIC_DOCS, "Nova", 5, { voiceBudget: {} });
    for (const chunk of top) {
      expect(DOC_TEXTS.has(chunk.text)).toBe(true);
      expect(chunk.score).toBe(0);
    }
  });
});

describe("web retrieval is unchanged", () => {
  it("rewrite runs, then one embedding call with the rewritten + raw queries and no request options", async () => {
    generateEmbeddings.mockResolvedValue([unit(0), unit(0)]);
    await hybridSearch(QUESTION, CLINIC_DOCS, "Nova", 5);
    expect(rewriteCreate).toHaveBeenCalledTimes(1);
    expect(generateEmbeddings).toHaveBeenCalledTimes(1);
    expect(generateEmbeddings.mock.calls[0]).toEqual([["implant ücreti", QUESTION]]);
    expect(ragPerf()[0]).not.toHaveProperty("mode");
  });
});

/* ── Agent Core routes only the voice channel to the budgeted retrieval ─── */

describe("Agent Core channel routing", () => {
  const hybridSearchMock = vi.fn<(...args: unknown[]) => Promise<never[]>>(async () => []);
  let handleClinicAgentTurn: typeof import("@/lib/agent/handleClinicAgentTurn").handleClinicAgentTurn;
  let RequestTimer: typeof import("@/lib/performance/requestTimer").RequestTimer;

  beforeAll(async () => {
    vi.resetModules();
    vi.doMock("@/lib/services/aiGateway", () => ({
      trackableAIRequest: vi.fn(async () => ({ content: "Implant ve diş temizliği hizmetlerimiz var.", durationMs: 1 })),
    }));
    vi.doMock("@/lib/services/retrievalService", () => ({
      hybridSearch: hybridSearchMock,
      validateGroundedness: vi.fn(async () => ({ isGrounded: true })),
    }));
    vi.doMock("@/lib/services/conversations/conversationTranscriptService", () => ({
      syncConversationLogMessagesFromHistory: vi.fn(async () => 2),
    }));
    ({ handleClinicAgentTurn } = await import("@/lib/agent/handleClinicAgentTurn"));
    ({ RequestTimer } = await import("@/lib/performance/requestTimer"));
  });

  afterAll(() => {
    vi.doUnmock("@/lib/services/aiGateway");
    vi.doUnmock("@/lib/services/retrievalService");
    vi.doUnmock("@/lib/services/conversations/conversationTranscriptService");
  });

  function adminDb() {
    const logDoc = {
      get: async () => ({ exists: false, data: () => undefined }),
      set: async () => undefined,
      collection: () => ({ doc: () => ({ set: async () => undefined }) }),
    };
    return {
      collection: (name: string) => {
        if (name === "clinics") {
          return {
            doc: () => ({
              get: async () => ({ exists: true, id: "clinic_rag", data: () => ({ name: "Nova Dent", language: "tr" }) }),
              collection: (sub: string) =>
                sub === "conversationLogs"
                  ? { doc: () => logDoc }
                  : sub === "doctors"
                    ? { where: () => ({ get: async () => ({ empty: true, docs: [] }) }) }
                    : { doc: () => ({ get: async () => ({ exists: false }) }) },
            }),
          };
        }
        if (name === "promptSettings") {
          return { doc: () => ({ get: async () => ({ exists: true, data: () => ({ systemPrompt: "Klinik asistanı.", model: "gpt-4o-mini" }) }) }) };
        }
        if (name === "trainingMaterials") {
          return {
            where: () => ({
              limit: () => ({
                get: async () => ({ docs: [{ id: "kb1", data: () => ({ title: "Hizmetler", content: "Implant ve temizlik.", embeddingChunks: [] }) }] }),
              }),
            }),
          };
        }
        if (name === "agencies") return { get: async () => ({ docs: [] }) };
        return { doc: () => ({ get: async () => ({ exists: false }) }) };
      },
    };
  }

  async function runTurn(channel: "voice" | "web_widget") {
    const { invalidateClinicRuntimeCache } = await import("@/lib/performance/clinicRuntimeCache");
    invalidateClinicRuntimeCache();
    hybridSearchMock.mockClear();
    return handleClinicAgentTurn({
      input: {
        clinicId: "clinic_rag",
        conversationId: `conv_${channel}`,
        channel,
        text: "Implant fiyatınız ne kadar?",
        history: [],
        locale: "tr",
      },
      adminDb: adminDb(),
      perf: new RequestTimer({}),
      debugLog: [],
      startTime: Date.now(),
    });
  }

  it("voice passes the voice budget; web calls hybridSearch with the original four arguments", async () => {
    await runTurn("web_widget");
    expect(hybridSearchMock).toHaveBeenCalledTimes(1);
    expect(hybridSearchMock.mock.calls[0]).toHaveLength(4);

    await runTurn("voice");
    expect(hybridSearchMock).toHaveBeenCalledTimes(1);
    expect(hybridSearchMock.mock.calls[0]).toHaveLength(5);
    expect(hybridSearchMock.mock.calls[0][4]).toEqual({ voiceBudget: {} });
  });
});
