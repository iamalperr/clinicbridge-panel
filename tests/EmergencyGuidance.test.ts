/**
 * Emergency guidance (product-global): every emergency reply points to 112 / the local
 * emergency number first; the clinic number follows only when a real one exists, and
 * no reply ever references a missing number ("telefon numaramızdan").
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequestTimer } from "@/lib/performance/requestTimer";
import { formatEmergencyResponse } from "@/lib/conversation/formatters";

const FIRST_SENTENCE: Record<string, string> = {
  tr: "Acil bir durumsa lütfen hemen 112'yi arayın (Türkiye dışındaysanız bulunduğunuz ülkenin acil numarasını).",
  en: "If this is an emergency, please call 112 immediately (or your local emergency number if you are outside Türkiye).",
  de: "Wenn es sich um einen Notfall handelt, rufen Sie bitte sofort die 112 an (außerhalb der Türkei die Notrufnummer Ihres Landes).",
  ar: "إذا كانت حالة طارئة، يرجى الاتصال فوراً بالرقم 112 (أو برقم الطوارئ في بلدك إذا كنت خارج تركيا).",
  ru: "Если это экстренная ситуация, немедленно позвоните по номеру 112 (или по номеру экстренной службы вашей страны, если вы находитесь за пределами Турции).",
  fr: "S'il s'agit d'une urgence, appelez immédiatement le 112 (ou le numéro d'urgence de votre pays si vous êtes hors de Turquie).",
};
const LOCALES = Object.keys(FIRST_SENTENCE);
const CLINIC_PHONE = "+90 212 555 01 01";

describe("formatEmergencyResponse", () => {
  it.each(LOCALES)("%s: no valid clinic number → only the emergency-services sentence", (locale) => {
    for (const phone of [undefined, null, "", "   ", "abc", "12", "+90"]) {
      expect(formatEmergencyResponse(phone, locale)).toBe(FIRST_SENTENCE[locale]);
    }
  });

  it.each(LOCALES)("%s: valid clinic number is mentioned after 112", (locale) => {
    const reply = formatEmergencyResponse(` ${CLINIC_PHONE} `, locale);
    expect(reply.startsWith(FIRST_SENTENCE[locale])).toBe(true);
    expect(reply).toContain(CLINIC_PHONE);
    expect(reply.indexOf("112")).toBeLessThan(reply.indexOf(CLINIC_PHONE));
  });

  it("uses the exact Turkish wording and never refers to a missing number", () => {
    expect(formatEmergencyResponse(CLINIC_PHONE, "tr")).toBe(
      `${FIRST_SENTENCE.tr} Kliniğimize ayrıca ${CLINIC_PHONE} numarasından ulaşabilirsiniz.`
    );
    for (const locale of LOCALES) {
      expect(formatEmergencyResponse("", locale)).not.toMatch(/numaramızdan|our phone line/);
    }
  });

  it("falls back to Turkish for unknown locales and is voice-safe (no emoji)", () => {
    expect(formatEmergencyResponse(undefined, "xx")).toBe(FIRST_SENTENCE.tr);
    for (const locale of LOCALES) {
      expect(formatEmergencyResponse(CLINIC_PHONE, locale)).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

describe("IntentRouter.isEmergency (Turkish letters at word edges)", () => {
  it.each(["dayanılmaz ağrı var", "şiddetli ağrı", "Şiddetli kanama oldu", "tıbbi acil durum", "bayılma hissi var", "nefes alamıyorum"])(
    "detects %s",
    async (text) => {
      const { IntentRouter } = await import("@/lib/conversation/intentRouter");
      expect(IntentRouter.isEmergency(text.toLowerCase())).toBe(true);
    }
  );

  it.each(["acil dönüş yapar mısınız", "acil temsilci istiyorum", "implant fiyatı nedir", "ağrısız tedavi var mı", "kanamalı diş eti için randevu"])(
    "does not flag %s",
    async (text) => {
      const { IntentRouter } = await import("@/lib/conversation/intentRouter");
      expect(IntentRouter.isEmergency(text.toLowerCase())).toBe(false);
    }
  );
});

describe("emergency reply call sites", () => {
  const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

  it("AI test route and agency matching chat use the shared formatter", () => {
    const aiTest = read("app/api/ai/test/route.ts");
    expect(aiTest).toContain("formatEmergencyResponse(effectivePhone, clinicLanguage)");
    expect(aiTest).not.toContain("telefon numaramızdan");
    expect(aiTest).not.toContain("our phone line");

    const agency = read("app/api/public/agency/[slug]/matching-chat/route.ts");
    expect(agency.match(/formatEmergencyResponse\(null, agencyData\.defaultLanguage \|\| "tr"\)/g)).toHaveLength(2);
    expect(agency).not.toContain("112 Acil Yardım hattını");
  });

  it("standalone demo widget tells the patient to call 112 first", () => {
    const demo = read("nova-dental-demo/clinicbridge-widget.js");
    expect(demo).toContain(FIRST_SENTENCE.tr);
    expect(demo).toContain(FIRST_SENTENCE.en);
  });
});

describe("Agent Core emergency turn (widget + voice)", () => {
  let aiRequest: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function runTurn(
    text: string,
    clinicFields: Record<string, unknown>,
    channel: "web_widget" | "voice" = "web_widget",
    locale = "tr"
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
                id: "clinic_em",
                data: () => ({ name: "Test Dental", language: "tr", timezone: "Europe/Istanbul", ...clinicFields }),
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

    aiRequest = vi.fn(async () => ({ content: "LLM reply", durationMs: 1 }));
    vi.doMock("@/lib/services/aiGateway", () => ({ trackableAIRequest: aiRequest }));
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
    return handleClinicAgentTurn({
      input: {
        clinicId: "clinic_em",
        conversationId: `conv_em_${Math.random().toString(36).slice(2)}`,
        channel,
        text,
        history: [],
        locale,
      },
      adminDb,
      perf: new RequestTimer({}),
      debugLog: [],
      startTime: Date.now(),
    });
  }

  it("widget: 112 first, then the clinic number; the LLM is not called", async () => {
    const result = await runTurn("Şiddetli kanama var ne yapmalıyım", { turkishContactNumber: CLINIC_PHONE });
    expect(result.payload.reply).toBe(
      `${FIRST_SENTENCE.tr} Kliniğimize ayrıca ${CLINIC_PHONE} numarasından ulaşabilirsiniz.`
    );
    expect(aiRequest).not.toHaveBeenCalled();
  });

  it("widget: no clinic number → only the 112 sentence", async () => {
    const result = await runTurn("Dayanılmaz ağrı var", {
      turkishContactNumber: "",
      internationalContactNumber: "",
      whatsappNumber: "",
    });
    expect(result.payload.reply).toBe(FIRST_SENTENCE.tr);
  });

  it("widget: English patient gets the English guidance", async () => {
    const result = await runTurn("I have severe bleeding after my extraction, what should I do?", {}, "web_widget", "en");
    expect(result.payload.reply).toBe(FIRST_SENTENCE.en);
  });

  it("voice: same deterministic guidance on the phone channel", async () => {
    const result = await runTurn("Şiddetli ağrı var nefes alamıyorum", { turkishContactNumber: CLINIC_PHONE }, "voice");
    expect(String(result.payload.reply).startsWith(FIRST_SENTENCE.tr)).toBe(true);
    expect(aiRequest).not.toHaveBeenCalled();
  });
});
