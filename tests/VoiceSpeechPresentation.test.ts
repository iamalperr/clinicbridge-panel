/**
 * Voice Presentation Layer: canonical Agent Core text is unchanged; only the TTS copy is spoken.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import { buildAppointmentReviewMessage } from "@/lib/conversation/formatters";
import { renderVoiceSpeech, voiceSpeechPresentationLogFields } from "@/lib/voice/telephony/renderVoiceSpeech";
import { RequestTimer } from "@/lib/performance/requestTimer";
import type { WeeklySchedule } from "@/lib/skills/ClinicWorkingHoursResolver";

const REPO = resolve(__dirname, "..");
const TZ = "Europe/Istanbul";
const NOW = new Date("2026-10-08T09:00:00.000Z");
const HOURS: WeeklySchedule = {
  monday: ["10:00", "19:00"],
  tuesday: ["10:00", "19:00"],
  wednesday: ["10:00", "19:00"],
  thursday: ["10:00", "19:00"],
  friday: ["10:00", "19:00"],
  saturday: ["10:00", "17:00"],
  sunday: null,
};

const FACT_PARAGRAPH =
  "İmplant tedavisi Dr. Ahmet Yılmaz tarafından uygulanır. İmplant fiyatı 500 EUR'dur (%20 peşin indirim). " +
  "Kliniğimiz Kadıköy, Bağdat Caddesi No 12 adresindedir. Çalışma saatleri 09:00-18:00. " +
  "Randevu iptali 24 saat önceden yapılmalıdır. Telefon 0216 555 11 22, e-posta info@ida-dental.example, " +
  "web https://ida-dental.example/implant.";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("production colon defect (iki nokta)", () => {
  it("confirmation labels keep ':' on the canonical reply and never send ':' to TTS", () => {
    const canonical = buildAppointmentReviewMessage({
      locale: "tr",
      appointmentData: {
        patientName: "Ayşe Yılmaz",
        patientPhone: "05321234567",
        emailDisposition: "DECLINED",
        requestedService: "implant",
        requestedDate: "2026-10-12",
        requestedTime: "14:00",
      },
    });
    expect(canonical).toContain("Tercih Edilen Saat: 14:00");
    expect(canonical).toContain("Ad Soyad:");
    const frozen = canonical;

    const { spokenText, telemetry } = renderVoiceSpeech({ text: canonical, locale: "tr-TR" });

    expect(canonical).toBe(frozen);
    expect(spokenText).not.toMatch(/:/);
    expect(spokenText).not.toMatch(/iki nokta/i);
    expect(spokenText).not.toContain("14:00");
    expect(spokenText).toMatch(/saat on dört|on dört/);
    expect(spokenText).toMatch(/on iki Ekim iki bin yirmi altı/);
    expect(spokenText).toContain("Ayşe Yılmaz");
    expect(telemetry.hasTimeTransformation).toBe(true);
    expect(telemetry.hasLabelColonTransformation).toBe(true);
    expect(telemetry.hasDateTransformation).toBe(true);
  });
});

describe("deterministic appointment / date / time speech", () => {
  it.each([
    ["14:00", "saat on dört"],
    ["14:30", "saat on dört otuz"],
    ["09:00", "saat dokuz"],
    ["12:00", "saat on iki"],
    ["14:00'te", "saat on dörtte"],
    ["09:00'da", "saat dokuzda"],
    ["14:00 - 15:00", "saat on dört ile on beş"],
    ["12.10.2026", "on iki Ekim iki bin yirmi altı"],
    ["2026-10-12", "on iki Ekim iki bin yirmi altı"],
    ["12.10.2026 14:00", "on iki Ekim iki bin yirmi altı saat on dört"],
  ])("%s → %s", (input, spoken) => {
    expect(renderVoiceSpeech({ text: input, locale: "tr" }).spokenText).toBe(spoken);
  });
});

describe("markdown is presentation-only", () => {
  it("speaks bold/lists as sentences, never star or dash names", () => {
    const canonical =
      "**İmplant Tedavisi**\n- Muayene gereklidir.\n- Tedavi planı kişiye göre belirlenir.";
    const { spokenText } = renderVoiceSpeech({ text: canonical, locale: "tr" });
    expect(canonical).toContain("**");
    expect(spokenText).not.toMatch(/\*|yıldız|tire/i);
    expect(spokenText).toMatch(/İmplant Tedavisi/);
    expect(spokenText).toMatch(/Muayene gereklidir/);
    expect(spokenText).toMatch(/Tedavi planı kişiye göre belirlenir/);
  });
});

describe("phone / email / URL policy", () => {
  it("PHONE: every digit is preserved, grouped, never reordered", () => {
    const canonical = "Bize 0532 123 45 67 numarasından ulaşın.";
    const { spokenText } = renderVoiceSpeech({ text: canonical, locale: "tr" });
    expect(canonical).toContain("0532 123 45 67");
    expect(spokenText).toBe(
      "Bize sıfır beş yüz otuz iki, yüz yirmi üç, kırk beş, altmış yedi numarasından ulaşın."
    );
  });

  it("EMAIL: @ and dots become speech-safe words without changing the local/domain identity", () => {
    const canonical = "Yazın: info@klinik.example.";
    const { spokenText } = renderVoiceSpeech({ text: canonical, locale: "tr" });
    expect(canonical).toContain("info@klinik.example");
    expect(spokenText).toBe("Yazın, info et klinik nokta example.");
  });

  it("URL: never reads slashes; does not claim a link was sent", () => {
    const canonical = "Detaylar için https://klinik.example.com/randevu/2026-10-12?saat=14:00 bakın.";
    const { spokenText } = renderVoiceSpeech({ text: canonical, locale: "tr" });
    expect(spokenText).toMatch(/bağlantı/);
    expect(spokenText).not.toMatch(/https?:|iki nokta|\//);
    expect(spokenText).not.toMatch(/gönderdim|ilettim|attım/i);
  });
});

describe("structured fact preservation", () => {
  const CASES = [
    {
      name: "price + percent + doctor",
      canonical: "İmplant fiyatı 500 EUR'dur (%20). Dr. Ahmet Yılmaz uygular.",
      // The doctor fact survives; only the written title is spoken ("Dr." → "Doktor").
      mustKeep: ["500 EUR", "%20", "Doktor Ahmet Yılmaz", "İmplant"],
      spokenMustNot: ["Dr."],
    },
    {
      name: "working hours as a range",
      canonical: "Çalışma saatlerimiz 09:00-18:00.",
      mustKeep: ["Çalışma saatlerimiz"],
      spokenMust: [/saat dokuz ile on sekiz/],
      spokenMustNot: ["09:00", "18:00"],
    },
    {
      name: "address",
      canonical: "Adres: Kadıköy, Bağdat Caddesi No 12.",
      mustKeep: ["Kadıköy", "Bağdat Caddesi", "No 12"],
    },
    {
      name: "duration",
      canonical: "Tedavi yaklaşık 3.5 gün sürer.",
      mustKeep: ["3.5 gün"],
    },
  ];

  it.each(CASES)("$name: canonical byte-for-byte; spoken keeps the same facts", (row) => {
    const before = row.canonical;
    const { spokenText } = renderVoiceSpeech({ text: row.canonical, locale: "tr" });
    expect(row.canonical).toBe(before);
    for (const fact of row.mustKeep) expect(spokenText).toContain(fact);
    for (const re of row.spokenMust ?? []) expect(spokenText).toMatch(re);
    for (const frag of row.spokenMustNot ?? []) expect(spokenText).not.toContain(frag);
  });

  it("ordinary prose with no speech-sensitive structure is unchanged", () => {
    const prose = "Merhaba, implant tedavisi hakkında bilgi verebilirim. Kliniğimiz Kadıköy'de, 3 doktorumuz var.";
    expect(renderVoiceSpeech({ text: prose, locale: "tr" }).spokenText).toBe(prose);
  });
});

describe("locale architecture", () => {
  it("unsupported locales keep markdown-stripped text without Turkish rewriting", () => {
    const text = "Appointment at 14:00 on 12.10.2026.";
    expect(renderVoiceSpeech({ text, locale: "en-US" }).spokenText).toBe(text);
    expect(renderVoiceSpeech({ text, locale: "de-DE" }).telemetry.rendererStatus).toBe("PASSTHROUGH");
  });
});

describe("PII-safe presentation telemetry", () => {
  it("log fields never include canonical or spoken text", () => {
    const secret = "Ayşe Yılmaz 0532 111 22 33 14:00 secret-token";
    const presented = renderVoiceSpeech({ text: secret, locale: "tr" });
    const fields = voiceSpeechPresentationLogFields(presented.telemetry);
    const blob = JSON.stringify(fields);
    expect(blob).not.toContain("Ayşe");
    expect(blob).not.toContain("0532");
    expect(blob).not.toContain("14:00");
    expect(blob).not.toContain("secret-token");
    expect(fields).toEqual(expect.objectContaining({
      canonicalLength: secret.length,
      spokenLength: presented.spokenText.length,
      rendererStatus: "OK",
    }));
  });
});

describe("presentation modules do not call retrieval or an LLM", () => {
  it("renderVoiceSpeech and locale renderers have no RAG/LLM/network imports", () => {
    for (const rel of [
      "lib/voice/telephony/renderVoiceSpeech.ts",
      "lib/voice/telephony/turkishSpeechRenderer.ts",
      "lib/voice/telephony/speechText.ts",
    ]) {
      const src = readFileSync(resolve(REPO, rel), "utf8");
      expect(src).not.toMatch(/retrievalService|hybridSearch|handleClinicAgentTurn|openai|fetch\(|firebase|firestore|process\.env/i);
    }
  });
});

describe("TTS path audit (every LiveKit say / speak site)", () => {
  it("agent replies, greetings and fallbacks go through renderVoiceSpeech; canonical replyText is untouched", () => {
    const bridge = readFileSync(resolve(REPO, "lib/voice/runtime/voiceRuntimeBridge.ts"), "utf8");
    expect(bridge).toContain("renderVoiceSpeech");
    expect(bridge).toContain("replyText: result.replyText");
    expect(bridge).toContain("speechText: presented.spokenText");

    const call = readFileSync(resolve(REPO, "workers/voice/src/call/voiceCall.ts"), "utf8");
    expect(call).toContain("renderVoiceSpeech");
    expect(call).toMatch(/speech\.say\(presented\.spokenText/);

    const session = readFileSync(resolve(REPO, "workers/voice/src/livekit/speechSession.ts"), "utf8");
    expect(session).toMatch(/session\.say\(text/);
    expect(session).not.toMatch(/replyText/);
  });
});

describe("Agent Core appointment flow → presentation → TTS copy", () => {
  let handleClinicAgentTurn: typeof import("@/lib/agent/handleClinicAgentTurn").handleClinicAgentTurn;
  const createCalls: Array<Record<string, any>> = [];
  const hybridSearch = vi.fn(async (): Promise<unknown[]> => []);
  const trackableAIRequest = vi.fn(async () => ({ content: "Tamam.", durationMs: 1 }));

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.doMock("@/lib/services/aiGateway", () => ({ trackableAIRequest }));
    vi.doMock("@/lib/services/retrievalService", () => ({
      hybridSearch,
      validateGroundedness: vi.fn(async () => ({ isGrounded: true })),
    }));
    vi.doMock("@/lib/performance/clinicRuntimeCache", () => ({
      getCachedClinicRuntime: () => null,
      setCachedClinicRuntime: () => undefined,
    }));
    vi.doMock("@/lib/services/conversations/conversationTranscriptService", () => ({
      syncConversationLogMessagesFromHistory: vi.fn(async () => 2),
    }));
    vi.doMock("@/lib/appointment-service", () => ({
      createAppointmentAndNotify: vi.fn(async (payload: Record<string, any>) => {
        createCalls.push(payload);
        return { success: true, appointmentId: `apt_${createCalls.length}` };
      }),
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
    vi.doUnmock("@/lib/appointment-service");
  });

  beforeEach(() => {
    createCalls.length = 0;
    hybridSearch.mockClear();
    trackableAIRequest.mockClear();
    trackableAIRequest.mockImplementation(async () => ({ content: "Tamam.", durationMs: 1 }));
    hybridSearch.mockImplementation(async () => []);
  });

  type Saved = Record<string, any>;
  let messageSeq = 0;

  function makeConversation() {
    let saved: Saved = {};
    const logRef = {
      get: async () => ({ exists: true, data: () => saved }),
      set: async (data: Saved, options?: { merge?: boolean; mergeFields?: string[] }) => {
        if (options?.mergeFields) {
          saved = { ...saved };
          for (const field of options.mergeFields) saved[field] = data[field];
        } else {
          saved = { ...saved, ...data, appointmentDraft: { ...(saved.appointmentDraft || {}), ...(data.appointmentDraft || {}) } };
        }
      },
      create: async (data: Saved) => {
        if (Object.keys(saved).length > 0) {
          throw Object.assign(new Error("ALREADY_EXISTS"), { code: 6 });
        }
        saved = { ...saved, ...data, appointmentDraft: { ...(saved.appointmentDraft || {}), ...(data.appointmentDraft || {}) } };
      },
      collection: () => ({ doc: () => ({ set: async () => undefined, get: async () => ({ exists: false }) }) }),
    };
    const adminDb = {
      collection: (name: string) => {
        if (name === "clinics") {
          return {
            doc: () => ({
              get: async () => ({
                exists: true,
                id: "clinic_test",
                data: () => ({ name: "Test Dental", language: "tr", timezone: TZ, workingHours: HOURS, notificationSettings: {} }),
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
          return { doc: () => ({ get: async () => ({ exists: true, data: () => ({ systemPrompt: "Asistan", model: "gpt-4o-mini" }) }) }) };
        }
        if (name === "trainingMaterials") {
          return {
            where: () => ({
              limit: () => ({
                get: async () => ({
                  docs: [
                    {
                      id: "doc_prices",
                      data: () => ({ clinicId: "clinic_test", title: "Fiyatlar ve ekip", content: FACT_PARAGRAPH }),
                    },
                  ],
                }),
              }),
            }),
          };
        }
        if (name === "agencies") return { get: async () => ({ docs: [] }) };
        return { doc: () => ({ get: async () => ({ exists: false }) }) };
      },
    };
    const say = async (text: string) => {
      messageSeq += 1;
      const result = await handleClinicAgentTurn({
        input: {
          clinicId: "clinic_test",
          conversationId: "conv_voice_speech",
          channel: "voice",
          text,
          history: [],
          locale: "tr",
          context: { messageId: `m${messageSeq}` },
        },
        adminDb,
        perf: new RequestTimer({}),
        debugLog: [],
        startTime: NOW.getTime(),
      });
      const presented = renderVoiceSpeech({ text: result.replyText, locale: result.locale ?? "tr" });
      return {
        canonical: result.replyText,
        spoken: presented.spokenText,
        telemetry: presented.telemetry,
        state: saved.appointmentState as string,
        draft: (saved.appointmentDraft || {}) as Saved,
      };
    };
    return { say, saved: () => saved };
  }

  it("implant / 12 Ekim / 14:00 / email declined / confirm, then time correction to 12:00", async () => {
    const { say, saved } = makeConversation();
    expect((await say("İmplant için randevu almak istiyorum.")).state).toBe("COLLECTING_DATE");
    expect((await say("12 Ekim")).state).toBe("COLLECTING_TIME");
    expect((await say("saat 14:00")).state).toBe("COLLECTING_NAME");
    expect((await say("Yusuf Alper")).state).toBe("COLLECTING_PHONE");
    expect((await say("0532 123 45 67")).state).toBe("COLLECTING_EMAIL");

    const review = await say("E-posta vermek istemiyorum.");
    expect(review.state).toBe("AWAITING_CONFIRMATION");
    expect(review.draft).toMatchObject({
      requestedService: "Diş İmplantı",
      requestedDate: "2026-10-12",
      requestedTime: "14:00",
      emailDisposition: "DECLINED",
      patientName: "Yusuf Alper",
    });
    expect(review.canonical).toContain("14:00");
    expect(review.canonical).toMatch(/:/);
    expect(review.spoken).not.toMatch(/:/);
    expect(review.spoken).not.toContain("14:00");
    expect(review.spoken).not.toMatch(/iki nokta/i);

    const corrected = await say("Hayır, saat on iki olsun.");
    expect(corrected.state).toBe("AWAITING_CONFIRMATION");
    expect(corrected.draft.requestedTime).toBe("12:00");
    expect(corrected.draft.requestedDate).toBe("2026-10-12");
    expect(corrected.draft.requestedService).toBe("Diş İmplantı");
    expect(corrected.draft.emailDisposition).toBe("DECLINED");
    expect(corrected.draft.patientName).toBe("Yusuf Alper");
    expect(corrected.canonical).toMatch(/12:00|saat 12/);
    expect(corrected.canonical).not.toMatch(/14:00/);
    expect(corrected.spoken).not.toContain("12:00");
    expect(corrected.spoken).not.toContain("14:00");
    expect(corrected.spoken).not.toMatch(/:/);
    expect(corrected.spoken).toMatch(/on iki/);

    const submitted = await say("Evet");
    expect(submitted.state).toBe("APPOINTMENT_SUBMITTED");
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0]).toMatchObject({
      requestedDate: "2026-10-12",
      requestedTime: "12:00",
      requestedService: "Diş İmplantı",
      patientName: "Yusuf Alper",
    });
    expect(createCalls[0].patientEmail).toBeUndefined();
    expect(saved().appointmentDraft?.requestedTime).toBe("12:00");
  });

  it("training/RAG facts survive presentation; rendering does not retrieve or call an LLM", async () => {
    hybridSearch.mockImplementation(async () => [
      {
        text: FACT_PARAGRAPH,
        chunk_index: 0,
        doc_id: "doc_prices",
        title: "Fiyatlar ve ekip",
        score: 1,
        vectorScore: 1,
        keywordScore: 1,
      },
    ]);
    trackableAIRequest.mockImplementation(async () => ({
      content:
        "**İmplant Tedavisi**\nİmplant fiyatı 500 EUR'dur. Dr. Ahmet Yılmaz. Çalışma saatleri 09:00-18:00. Detay: https://ida-dental.example/implant",
      durationMs: 1,
    }));

    const { say } = makeConversation();
    const searchesBefore = hybridSearch.mock.calls.length;
    const llmBefore = trackableAIRequest.mock.calls.length;
    const turn = await say("İmplant fiyatı nedir?");
    const searchesAfterTurn = hybridSearch.mock.calls.length;
    const llmAfterTurn = trackableAIRequest.mock.calls.length;
    expect(searchesAfterTurn).toBeGreaterThan(searchesBefore);
    expect(llmAfterTurn).toBeGreaterThan(llmBefore);

    expect(turn.canonical).toContain("500 EUR");
    expect(turn.canonical).toContain("Dr. Ahmet Yılmaz");
    expect(turn.canonical).toContain("09:00-18:00");
    expect(turn.canonical).toContain("İmplant Tedavisi");

    const again = renderVoiceSpeech({ text: turn.canonical, locale: "tr" });
    expect(hybridSearch.mock.calls.length).toBe(searchesAfterTurn);
    expect(trackableAIRequest.mock.calls.length).toBe(llmAfterTurn);
    expect(again.spokenText).toContain("500 EUR");
    expect(again.spokenText).toContain("Doktor Ahmet Yılmaz");
    expect(again.spokenText).not.toContain("Dr.");
    expect(again.spokenText).toMatch(/saat dokuz ile on sekiz/);
    expect(again.spokenText).not.toContain("09:00");
    expect(again.spokenText).not.toMatch(/\*\*|https?:/);
    expect(again.spokenText).not.toMatch(/gönderdim|ilettim/i);
    expect(turn.canonical).toContain("500 EUR");
  });
});

describe("web Agent Core replies are not rewritten by the presentation layer", () => {
  it("the layer is not imported from Agent Core or conversation formatters", () => {
    for (const file of [
      ...sourceFiles(resolve(REPO, "lib/agent")),
      ...sourceFiles(resolve(REPO, "lib/conversation")),
    ]) {
      expect(readFileSync(file, "utf8")).not.toMatch(/renderVoiceSpeech|turkishSpeechRenderer/);
    }
  });
});
