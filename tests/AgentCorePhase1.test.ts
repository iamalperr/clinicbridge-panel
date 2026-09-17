/**
 * Phase 1 — Agent Core boundary tests.
 * Calls the shared core without HTTP / browser / telephony.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequestTimer } from "@/lib/performance/requestTimer";
import {
  applyAppointmentSchedulingAmendment,
  applyConfirmationAmendment,
  type AppointmentDraftLike,
} from "@/lib/conversation";
import {
  resolveAgentChannel,
  safeMergeDraft,
  toAIUsageChannel,
  type AppointmentData,
} from "@/lib/agent";

const REPO = resolve(__dirname, "..");
const CLINIC_TZ = "Europe/Istanbul";
const FIXED_NOW = new Date("2026-08-29T07:00:00.000Z");

const PRODUCTION_HOURS = {
  monday: ["10:00", "19:00"] as [string, string],
  tuesday: ["10:00", "19:00"] as [string, string],
  wednesday: ["10:00", "19:00"] as [string, string],
  thursday: ["10:00", "19:00"] as [string, string],
  friday: ["10:00", "19:00"] as [string, string],
  saturday: ["10:00", "17:00"] as [string, string],
  sunday: null,
};

describe("Agent Core — channel mapping", () => {
  it("maps web_widget and voice to AI usage channels without enum migration", () => {
    expect(toAIUsageChannel("web_widget")).toBe("web_widget");
    expect(toAIUsageChannel("voice")).toBe("voice");
    expect(toAIUsageChannel("api")).toBe("api");
    expect(resolveAgentChannel(undefined)).toBe("web_widget");
    expect(resolveAgentChannel("voice")).toBe("voice");
  });
});

describe("Agent Core — server draft preference helpers", () => {
  it("safeMergeDraft does not erase existing fields with empty client values", () => {
    const server: Partial<AppointmentData> = {
      patientName: "Ada",
      patientPhone: "+905551112233",
      requestedService: "Implant",
      requestedDate: "2026-08-29",
      requestedTime: "14:00",
      originalText: "Saturday 2pm",
    };
    const merged = safeMergeDraft(server, {
      requestedTime: "12:00",
      patientName: "",
    } as any);
    expect(merged.requestedTime).toBe("12:00");
    expect(merged.patientName).toBe("Ada");
  });
});

describe("Agent Core — appointment corrections (shared libs, no browser)", () => {
  it("B/D: Saturday 2pm then make it 12pm keeps date and updates time", () => {
    const first = applyAppointmentSchedulingAmendment({
      message: "I want an appointment Saturday at 2 PM",
      draft: {},
      locale: "en",
      clinicTimeZone: CLINIC_TZ,
      now: FIXED_NOW,
      workingHours: PRODUCTION_HOURS,
    });
    expect(first.outcome).toBe("applied");
    expect(first.draft.requestedDate).toBe("2026-08-29");
    expect(first.draft.requestedTime).toBe("14:00");

    const second = applyAppointmentSchedulingAmendment({
      message: "Actually make it 12 PM",
      draft: first.draft,
      locale: "en",
      clinicTimeZone: CLINIC_TZ,
      now: FIXED_NOW,
      workingHours: PRODUCTION_HOURS,
    });
    expect(second.outcome).toBe("applied");
    expect(second.draft.requestedDate).toBe("2026-08-29");
    expect(second.draft.requestedTime).toBe("12:00");
  });

  it("E: confirmation amendment updates time only", () => {
    const draft: AppointmentDraftLike = {
      patientName: "Nathan Ashdown",
      patientPhone: "+447700900123",
      patientEmail: "nathan@example.com",
      requestedService: "implant",
      requestedDate: "2026-08-19",
      requestedTime: "14:00",
    };
    const amended = applyConfirmationAmendment({
      message: "Could I do 12pm please",
      draft,
      locale: "en",
      clinicTimeZone: CLINIC_TZ,
      now: new Date("2026-08-19T08:00:00.000Z"),
      workingHours: {
        monday: ["09:00", "18:00"],
        tuesday: ["09:00", "18:00"],
        wednesday: ["09:00", "18:00"],
        thursday: ["09:00", "18:00"],
        friday: ["09:00", "18:00"],
        saturday: ["10:00", "14:00"],
        sunday: null,
      },
    });
    expect(amended.outcome).toBe("applied");
    expect(amended.nextDraft.requestedTime).toBe("12:00");
    expect(amended.nextDraft.requestedDate).toBe("2026-08-19");
  });
});

describe("Agent Core — architecture boundary", () => {
  it("Web adapter delegates to handleClinicAgentTurn; no telephony/TTS deps", () => {
    const route = readFileSync(resolve(REPO, "app/api/public/chat/route.ts"), "utf8");
    const core = readFileSync(resolve(REPO, "lib/agent/handleClinicAgentTurn.ts"), "utf8");
    const index = readFileSync(resolve(REPO, "lib/agent/index.ts"), "utf8");

    expect(route).toContain("handleClinicAgentTurn");
    expect(route).toContain('resolveAgentChannel("web_widget")');
    expect(index).toContain("handleClinicAgentTurn");
    expect(core).toContain("toAIUsageChannel(channel)");

    for (const src of [route, core, index]) {
      expect(src).not.toMatch(/twilio|elevenlabs|WebSocket|mediaStreams|speechToText|textToSpeech/i);
    }
  });

  it("Agent Core has no NextResponse / CORS transport coupling", () => {
    const core = readFileSync(resolve(REPO, "lib/agent/handleClinicAgentTurn.ts"), "utf8");
    expect(core).not.toContain("NextResponse");
    expect(core).not.toContain("Access-Control-Allow-Origin");
  });
});

describe("Agent Core — handleClinicAgentTurn direct call (mocked I/O)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("A/J: general clinic question returns LLM reply without inventing knowledge", async () => {
    const store: Record<string, any> = {};

    const logDoc = {
      exists: false,
      data: () => undefined,
      get: async () => ({ exists: false, data: () => undefined }),
      set: async (data: any, _opts?: any) => {
        store.log = { ...(store.log || {}), ...data };
      },
      collection: () => ({
        doc: () => ({
          set: async () => undefined,
        }),
      }),
    };

    const clinicDoc = {
      exists: true,
      data: () => ({
        name: "Test Dental",
        language: "en",
        whatsappNumber: "",
        telegramUsername: "",
        timezone: CLINIC_TZ,
        workingHours: PRODUCTION_HOURS,
      }),
      id: "clinic_test",
    };

    const adminDb = {
      collection: (name: string) => {
        if (name === "clinics") {
          return {
            doc: () => ({
              get: async () => clinicDoc,
              collection: (sub: string) => {
                if (sub === "conversationLogs") {
                  return {
                    doc: () => logDoc,
                  };
                }
                if (sub === "doctors") {
                  return {
                    where: () => ({
                      get: async () => ({ empty: true, docs: [] }),
                    }),
                  };
                }
                return { doc: () => ({ get: async () => ({ exists: false }) }) };
              },
            }),
          };
        }
        if (name === "promptSettings") {
          return {
            doc: () => ({
              exists: true,
              get: async () => ({
                exists: true,
                data: () => ({
                  systemPrompt: "You are a clinic assistant.",
                  model: "gpt-4o-mini",
                  temperature: 0.3,
                  guardrails: { noDiagnosis: { enabled: true, text: "" } },
                }),
              }),
            }),
          };
        }
        if (name === "trainingMaterials") {
          return {
            where: () => ({
              limit: () => ({
                get: async () => ({
                  docs: [
                    {
                      id: "kb1",
                      data: () => ({
                        title: "Services",
                        content: "We offer professional teeth cleaning and implants.",
                        embeddingChunks: [],
                      }),
                    },
                  ],
                }),
              }),
            }),
          };
        }
        if (name === "agencies") {
          return { get: async () => ({ docs: [] }) };
        }
        return {
          doc: () => ({ get: async () => ({ exists: false }) }),
        };
      },
    };

    vi.doMock("@/lib/services/aiGateway", () => ({
      trackableAIRequest: vi.fn(async () => ({
        content: "We offer professional teeth cleaning and implants.",
        durationMs: 1,
      })),
    }));
    vi.doMock("@/lib/services/retrievalService", () => ({
      hybridSearch: vi.fn(async () => []),
      validateGroundedness: vi.fn(async () => ({ ok: true })),
    }));
    vi.doMock("@/lib/performance/clinicRuntimeCache", () => ({
      getCachedClinicRuntime: () => null,
      setCachedClinicRuntime: () => undefined,
    }));
    vi.doMock("@/lib/services/conversations/conversationTranscriptService", () => ({
      syncConversationLogMessagesFromHistory: vi.fn(async () => 2),
    }));

    const { handleClinicAgentTurn } = await import("@/lib/agent/handleClinicAgentTurn");

    const result = await handleClinicAgentTurn({
      input: {
        clinicId: "clinic_test",
        conversationId: "conv_core_1",
        channel: "web_widget",
        text: "What services do you offer?",
        history: [],
        locale: "en",
      },
      adminDb,
      perf: new RequestTimer({}),
      debugLog: [],
      startTime: Date.now(),
    });

    expect(result.httpStatus ?? 200).toBe(200);
    expect(result.conversationId).toBe("conv_core_1");
    expect(result.replyText.toLowerCase()).toMatch(/cleaning|implant|service/);
    expect(result.payload.reply).toBe(result.replyText);
    // No false appointment success
    expect(result.payload.appointmentCreated).not.toBe(true);
  });

  it("G: appointment creation failure never reports success", async () => {
    const draft = {
      patientName: "Ada Lovelace",
      patientPhone: "+905551112233",
      patientEmail: "ada@example.com",
      requestedService: "Cleaning",
      requestedDate: "2026-09-22",
      requestedTime: "11:00",
      originalText: "yes",
    };

    let savedState: any = {
      appointmentState: "AWAITING_CONFIRMATION",
      appointmentDraft: draft,
      conversationLocale: "en",
      pendingAction: {
        type: "submit_appointment",
        status: "pending",
        payload: draft,
      },
    };

    const logRef = {
      get: async () => ({
        exists: true,
        data: () => savedState,
      }),
      set: async (data: any) => {
        savedState = { ...savedState, ...data };
      },
      collection: () => ({
        doc: () => ({ set: async () => undefined }),
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
                  workingHours: PRODUCTION_HOURS,
                  notificationSettings: {},
                }),
              }),
              collection: (sub: string) => {
                if (sub === "conversationLogs") {
                  return { doc: () => logRef };
                }
                if (sub === "doctors") {
                  return {
                    where: () => ({ get: async () => ({ empty: true, docs: [] }) }),
                  };
                }
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
                data: () => ({ systemPrompt: "Assistant", model: "gpt-4o-mini" }),
              }),
            }),
          };
        }
        if (name === "trainingMaterials") {
          return {
            where: () => ({
              limit: () => ({ get: async () => ({ docs: [] }) }),
            }),
          };
        }
        if (name === "agencies") {
          return { get: async () => ({ docs: [] }) };
        }
        return { doc: () => ({ get: async () => ({ exists: false }) }) };
      },
    };

    vi.doMock("@/lib/appointment-service", () => ({
      createAppointmentAndNotify: vi.fn(async () => ({
        success: false,
        appointmentId: null,
        error: "CREATE_FAILED",
      })),
    }));
    vi.doMock("@/lib/performance/clinicRuntimeCache", () => ({
      getCachedClinicRuntime: () => null,
      setCachedClinicRuntime: () => undefined,
    }));
    vi.doMock("@/lib/services/conversations/conversationTranscriptService", () => ({
      syncConversationLogMessagesFromHistory: vi.fn(async () => 2),
    }));
    vi.doMock("@/lib/services/aiGateway", () => ({
      trackableAIRequest: vi.fn(async () => ({ content: "should not be needed", durationMs: 1 })),
    }));

    const { handleClinicAgentTurn } = await import("@/lib/agent/handleClinicAgentTurn");

    const result = await handleClinicAgentTurn({
      input: {
        clinicId: "clinic_test",
        conversationId: "conv_confirm_fail",
        channel: "web_widget",
        text: "yes",
        history: [],
        locale: "en",
        pendingAppointmentData: draft,
      },
      adminDb,
      perf: new RequestTimer({}),
      debugLog: [],
      startTime: Date.now(),
    });

    expect(result.payload.appointmentCreated).not.toBe(true);
    expect(result.sideEffects?.appointmentCreated).not.toBe(true);
    const blob = JSON.stringify(result.payload).toLowerCase();
    expect(blob).not.toMatch(/appointment_created/);
    // Failure path should keep user informed (failed type or non-success reply)
    expect(
      result.payload.responseType === "appointment_creation_failed" ||
        result.payload.success === false ||
        /unable|fail|sorun|oluşturulamadı|could not/i.test(result.replyText)
    ).toBe(true);
  });
});
