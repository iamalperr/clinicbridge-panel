import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEY = "OPENAI_API_KEY";

function providerError(status: number, code: string, type = "") {
  return Object.assign(new Error(`${status} provider error`), { status, code, type });
}

describe("aiGateway — OpenAI credit/quota exhaustion is not a retryable rate limit", () => {
  let previousKey: string | undefined;
  let createImpl: () => Promise<unknown>;
  let createCalls = 0;

  beforeEach(() => {
    vi.resetModules();
    previousKey = process.env[ENV_KEY];
    process.env[ENV_KEY] = "test-placeholder-not-a-key";
    createCalls = 0;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.doMock("openai", () => ({
      default: class {
        chat = {
          completions: {
            create: async () => {
              createCalls += 1;
              return createImpl();
            },
          },
        };
      },
    }));
    vi.doMock("@/lib/services/aiPricingService", () => ({
      getModelPricing: async () => null,
      calculateCost: () => ({ inputCostUsd: 0, cachedInputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0 }),
    }));
    vi.doMock("@/lib/services/aiLimitService", () => ({ checkLimitsAndNotify: vi.fn() }));
    vi.doMock("@/lib/firebase-admin", () => ({ getAdminDb: () => null }));
  });

  afterEach(() => {
    if (previousKey === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = previousKey;
    vi.restoreAllMocks();
    vi.doUnmock("openai");
    vi.doUnmock("@/lib/firebase-admin");
    vi.doUnmock("@/lib/services/aiPricingService");
    vi.doUnmock("@/lib/services/aiLimitService");
  });

  async function callGateway() {
    const { trackableAIRequest } = await import("@/lib/services/aiGateway");
    return trackableAIRequest({
      clinicId: "clinic_a",
      conversationId: "conv_a",
      model: "gpt-4o",
      requestType: "chat",
      channel: "web_widget",
      messages: [{ role: "user", content: "How much is composite bonding" }],
    } as Parameters<typeof trackableAIRequest>[0]);
  }

  it.each(["credit_balance_exhausted", "insufficient_quota", "billing_hard_limit_reached", "billing_not_active"])(
    "429 %s → OPENAI_QUOTA_EXCEEDED after a single attempt, provider code preserved",
    async (code) => {
      createImpl = async () => {
        throw providerError(429, code);
      };
      const err = (await callGateway().catch((e: unknown) => e)) as Record<string, unknown>;
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe("OPENAI_QUOTA_EXCEEDED");
      expect(err.providerErrorCode).toBe(code);
      expect(err.httpStatus).toBe(429);
      expect(createCalls).toBe(1);
    }
  );

  it("quota signalled only via error type is also classified as quota", async () => {
    createImpl = async () => {
      throw providerError(429, "", "insufficient_quota");
    };
    const err = (await callGateway().catch((e: unknown) => e)) as Record<string, unknown>;
    expect(err.code).toBe("OPENAI_QUOTA_EXCEEDED");
    expect(createCalls).toBe(1);
  });

  it("real 429 rate_limit_exceeded still retries (3 attempts) and stays OPENAI_RATE_LIMITED", async () => {
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
      fn();
      return 0;
    }) as unknown as typeof setTimeout);
    createImpl = async () => {
      throw providerError(429, "rate_limit_exceeded");
    };
    const err = (await callGateway().catch((e: unknown) => e)) as Record<string, unknown>;
    expect(err.code).toBe("OPENAI_RATE_LIMITED");
    expect(err.providerErrorCode).toBe("rate_limit_exceeded");
    expect(createCalls).toBe(3);
  });

  it("gateway failure log carries the provider code but no prompt content", async () => {
    createImpl = async () => {
      throw providerError(429, "credit_balance_exhausted");
    };
    await callGateway().catch(() => undefined);
    const logged = vi
      .mocked(console.error)
      .mock.calls.map((args) => args.map(String).join(" "))
      .join("\n");
    expect(logged).toContain("credit_balance_exhausted");
    expect(logged).toContain("OPENAI_QUOTA_EXCEEDED");
    expect(logged).not.toMatch(/composite bonding/i);
  });
});
