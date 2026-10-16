/**
 * PII-safe server logging (product-global; the voice worker bundles these modules).
 *
 * Representative patient name / phone / email / message, assistant reply, KB content, LLM
 * reasons and provider error text are pushed through the production code paths. Every
 * console line produced is captured and must not contain any of them. A static guard keeps the
 * previously-leaking log statements closed.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { format } from "node:util";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { WeeklySchedule } from "@/lib/skills/ClinicWorkingHoursResolver";

const REPO = resolve(__dirname, "..");
const TZ = "Europe/Istanbul";
/** Thursday 8 Oct 2026, 12:00 Istanbul */
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

const PATIENT_NAME = "Zeynep Sentinelkaya";
const PATIENT_PHONE = "05329876543";
const PATIENT_PHONE_SPACED = "0532 987 65 43";
const PATIENT_EMAIL = "zeynep.sentinel@example.com";
const MESSAGE_MARKER = "SENTINELMSG";
const REPLY_MARKER = "SENTINELREPLY";
const KB_MARKER = "SENTINELKB";
const LLM_REASON_MARKER = "SENTINELREASON";
const TREATMENT_MARKER = "SENTINELTREAT";
const KEY_MARKER = "PKSECRET9";

const FORBIDDEN_FRAGMENTS = [
  "sentinelkaya",
  "zeynep.sentinel",
  "9876543",
  "987 65 43",
  "***6543",
  MESSAGE_MARKER,
  REPLY_MARKER,
  KB_MARKER,
  LLM_REASON_MARKER,
  TREATMENT_MARKER,
  KEY_MARKER,
];

function captureConsole() {
  const lines: string[] = [];
  const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines.push(format(...args));
    })
  );
  return {
    text: () => lines.join("\n"),
    restore: () => spies.forEach((spy) => spy.mockRestore()),
  };
}

function expectNoPii(output: string) {
  const lower = output.toLowerCase();
  for (const fragment of FORBIDDEN_FRAGMENTS) {
    expect(lower, `log output leaked "${fragment}"`).not.toContain(fragment.toLowerCase());
  }
}

function confirmationSummary() {
  return [
    "Randevu bilgileriniz:",
    `Ad: ${PATIENT_NAME}`,
    `Telefon: ${PATIENT_PHONE_SPACED}`,
    `E-posta: ${PATIENT_EMAIL}`,
    "Hizmet: İmplant",
    "Tarih: 2026-10-12",
    "Saat: 14:00",
    "Bilgiler doğru mu?",
  ].join("\n");
}

let logs: ReturnType<typeof captureConsole>;
beforeEach(() => {
  logs = captureConsole();
});
afterEach(() => {
  logs.restore();
});

describe("safeErrorMeta", () => {
  it("keeps only the error class and provider code", async () => {
    const { safeErrorMeta } = await import("@/lib/services/infrastructureErrors");
    const err = Object.assign(new TypeError(`Invalid recipient ${PATIENT_EMAIL} for ${PATIENT_NAME}`), {
      code: "validation_error",
      response: { body: { to: PATIENT_EMAIL } },
    });
    expect(safeErrorMeta(err)).toEqual({ errorType: "TypeError", errorCode: "validation_error" });
    expect(safeErrorMeta(`raw ${PATIENT_PHONE}`)).toEqual({ errorType: "string", errorCode: null });
    expect(safeErrorMeta(null)).toEqual({ errorType: "null", errorCode: null });
    expect(safeErrorMeta({ code: 7, message: PATIENT_EMAIL })).toEqual({ errorType: "object", errorCode: 7 });
    expect(String(safeErrorMeta({ code: "x".repeat(500) }).errorCode)).toHaveLength(64);
    expectNoPii(JSON.stringify([safeErrorMeta(err), safeErrorMeta(`raw ${PATIENT_PHONE}`)]));
  });

  it("voiceErrorLogMeta (dependency-free voice modules) has the same content-free shape", async () => {
    const { voiceErrorLogMeta } = await import("@/lib/voice/telephony/callBinding");
    const err = Object.assign(new Error(`write failed for ${PATIENT_EMAIL}`), { code: 14 });
    expect(voiceErrorLogMeta(err)).toEqual({ errorType: "Error", errorCode: "14" });
    expect(voiceErrorLogMeta(`raw ${PATIENT_NAME}`)).toEqual({ errorType: "string", errorCode: null });
    expectNoPii(JSON.stringify(voiceErrorLogMeta(err)));
  });
});

describe("appointmentParse: extractAppointmentFromHistory", () => {
  it("logs field presence only when a summary is recovered (parsing unchanged)", async () => {
    const { extractAppointmentFromHistory } = await import("@/lib/agent/appointmentParse");
    const result = extractAppointmentFromHistory([
      { role: "user", content: `Randevu istiyorum ${MESSAGE_MARKER}` },
      { role: "assistant", content: confirmationSummary() },
    ]);
    expect(result?.patientName).toBe(PATIENT_NAME);
    expect(result?.patientPhone).toBe(PATIENT_PHONE);
    expect(result?.patientEmail).toBe(PATIENT_EMAIL);
    expect(logs.text()).toContain("[appt-extract] Extracted:");
    expectNoPii(logs.text());
  });

  it("logs field presence only when required fields are missing", async () => {
    const { extractAppointmentFromHistory } = await import("@/lib/agent/appointmentParse");
    const result = extractAppointmentFromHistory([
      { role: "assistant", content: `Ad: ${PATIENT_NAME}\nE-posta: not-an-email-${MESSAGE_MARKER}` },
    ]);
    expect(result).toBeNull();
    expect(logs.text()).toContain("[appt-extract] Missing required fields:");
    expectNoPii(logs.text());
  });
});

describe("Agent Core turns (web + voice) never log patient content", () => {
  type Saved = Record<string, any>;
  let handleClinicAgentTurn: typeof import("@/lib/agent/handleClinicAgentTurn").handleClinicAgentTurn;
  let voice: typeof import("@/lib/voice");
  let RequestTimer: typeof import("@/lib/performance/requestTimer").RequestTimer;
  const createAppointmentAndNotify = vi.fn(async () => ({
    success: true,
    appointmentId: "appt_pii_test",
    status: "pending",
    clinicNotificationStatus: "sent",
    patientNotificationStatus: "SENT",
  }));

  beforeAll(async () => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.doMock("@/lib/services/aiGateway", () => ({
      trackableAIRequest: vi.fn(async () => ({
        content: `Merhaba ${PATIENT_NAME}, randevu onaylandı ${REPLY_MARKER} ${PATIENT_PHONE}`,
        durationMs: 1,
      })),
    }));
    vi.doMock("@/lib/services/retrievalService", () => ({
      hybridSearch: vi.fn(async () => [
        { title: "Otopark", text: `${KB_MARKER} otopark bilgisi`, score: 0.9, vectorScore: 0.8, keywordScore: 0.7 },
      ]),
      validateGroundedness: vi.fn(async () => ({
        isGrounded: false,
        reason: `${LLM_REASON_MARKER} reply mentions ${PATIENT_EMAIL}`,
      })),
    }));
    vi.doMock("@/lib/performance/clinicRuntimeCache", () => ({
      getCachedClinicRuntime: () => null,
      setCachedClinicRuntime: () => undefined,
    }));
    vi.doMock("@/lib/services/conversations/conversationTranscriptService", () => ({
      syncConversationLogMessagesFromHistory: vi.fn(async () => 2),
    }));
    vi.doMock("@/lib/appointment-service", () => ({ createAppointmentAndNotify }));
    ({ handleClinicAgentTurn } = await import("@/lib/agent/handleClinicAgentTurn"));
    voice = await import("@/lib/voice");
    ({ RequestTimer } = await import("@/lib/performance/requestTimer"));
  });

  afterAll(() => {
    vi.useRealTimers();
    vi.doUnmock("@/lib/services/aiGateway");
    vi.doUnmock("@/lib/services/retrievalService");
    vi.doUnmock("@/lib/performance/clinicRuntimeCache");
    vi.doUnmock("@/lib/services/conversations/conversationTranscriptService");
    vi.doUnmock("@/lib/appointment-service");
    vi.resetModules();
  });

  function makeDb(initial: Saved) {
    let saved: Saved = { ...initial };
    const logRef = {
      get: async () => ({ exists: true, data: () => saved }),
      set: async (data: Saved) => {
        saved = { ...saved, ...data };
      },
      create: async (_data: Saved) => {
        throw Object.assign(new Error("ALREADY_EXISTS"), { code: 6 });
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
                  docs: [{ id: "kb1", data: () => ({ title: "Otopark", content: `${KB_MARKER} otopark bilgisi`, clinicId: "clinic_test" }) }],
                }),
              }),
            }),
          };
        }
        if (name === "agencies") return { get: async () => ({ docs: [] }) };
        return { doc: () => ({ get: async () => ({ exists: false }) }) };
      },
    };
    return { adminDb, saved: () => saved };
  }

  async function webTurn(text: string, initial: Saved, history: Array<{ role: string; content: string }> = []) {
    const db = makeDb(initial);
    const result = await handleClinicAgentTurn({
      input: { clinicId: "clinic_test", conversationId: "conv_pii", channel: "web_widget", text, history, locale: "tr" },
      adminDb: db.adminDb,
      perf: new RequestTimer({}),
      debugLog: [],
      startTime: NOW.getTime(),
    });
    return { result, saved: db.saved() };
  }

  const draftReady = {
    requestedService: "İmplant",
    requestedDate: "2026-10-12",
    requestedTime: "14:00",
  };

  it("general question: RAG query, KB content, LLM reply, forbidden claim and groundedness reason stay out of logs", async () => {
    const { result } = await webTurn(`Kliniğinizde otopark var mı ${MESSAGE_MARKER}?`, { appointmentState: "IDLE", conversationLocale: "tr" });
    expect(result.payload).toBeTruthy();
    const out = logs.text();
    expect(out).toContain("[RAG-DEBUG] query_length:");
    expect(out).toContain("[FORBIDDEN_CLAIM_INTERCEPTED]");
    expect(out).toContain("[Groundedness Failed]");
    expect(out).toContain("replyLength=");
    expectNoPii(out);
  });

  it("message carrying name, phone and email is not logged; entity keys only", async () => {
    await webTurn(
      `Randevu istiyorum, adım ${PATIENT_NAME}, telefonum ${PATIENT_PHONE_SPACED}, e-postam ${PATIENT_EMAIL} ${MESSAGE_MARKER}`,
      { appointmentState: "COLLECTING_NAME", appointmentDraft: draftReady, conversationLocale: "tr" }
    );
    const out = logs.text();
    expect(out).toContain("APPT_01_CONFIRMATION_REQUEST_RECEIVED");
    expect(out).toContain("messageLength");
    expectNoPii(out);
  });

  it.each([
    ["COLLECTING_NAME", PATIENT_NAME, {}],
    ["COLLECTING_PHONE", PATIENT_PHONE_SPACED, { patientName: PATIENT_NAME }],
    ["COLLECTING_EMAIL", PATIENT_EMAIL, { patientName: PATIENT_NAME, patientPhone: PATIENT_PHONE }],
  ])("slot collection %s does not log the provided value", async (state, text, extra) => {
    const { saved } = await webTurn(text, {
      appointmentState: state,
      appointmentDraft: { ...draftReady, ...extra },
      conversationLocale: "tr",
    });
    expect(saved.appointmentDraft).toBeTruthy();
    expectNoPii(logs.text());
  });

  it("confirmation with a complete draft logs checkpoints, never the patient fields", async () => {
    createAppointmentAndNotify.mockClear();
    await webTurn("evet onaylıyorum", {
      appointmentState: "AWAITING_CONFIRMATION",
      appointmentDraft: { ...draftReady, patientName: PATIENT_NAME, patientPhone: PATIENT_PHONE, patientEmail: PATIENT_EMAIL },
      conversationLocale: "tr",
    });
    expect(createAppointmentAndNotify).toHaveBeenCalledTimes(1);
    const out = logs.text();
    expect(out).toContain("APPT_05_CREATE_APPOINTMENT_CALLED");
    expectNoPii(out);
  });

  it("confirmation recovered from the assistant summary in history logs keys only", async () => {
    await webTurn(
      "evet onaylıyorum",
      { appointmentState: "COLLECTING_EMAIL", appointmentDraft: {}, conversationLocale: "tr" },
      [
        { role: "user", content: `Randevu ${MESSAGE_MARKER}` },
        { role: "assistant", content: confirmationSummary() },
      ]
    );
    const out = logs.text();
    expect(out).toContain("[appt-extract] Extracted:");
    expectNoPii(out);
  });

  it("voice turn through processVoiceTurn logs no transcript or reply", async () => {
    const db = makeDb({ appointmentState: "COLLECTING_NAME", appointmentDraft: draftReady, conversationLocale: "tr" });
    const deps = {
      sessionStore: voice.createInMemoryCallSessionStore(),
      adminDb: db.adminDb,
      generateId: (prefix: string) => `${prefix}_t`,
      loadHistory: async () => [],
      runAgentTurn: handleClinicAgentTurn,
      now: () => NOW,
    };
    const started = await voice.startCallSession(deps as any, { clinicId: "clinic_test", locale: "tr" });
    if (!started.ok) throw new Error("start failed");
    const turn = await voice.processVoiceTurn(deps as any, {
      callSessionId: started.callSessionId,
      text: `Benim adım ${PATIENT_NAME}, numaram ${PATIENT_PHONE_SPACED} ${MESSAGE_MARKER}`,
      turnId: "v1",
    });
    expect(turn.ok).toBe(true);
    const out = logs.text();
    expect(out).toContain("VOICE_TURN_PROCESSED");
    expectNoPii(out);
  });
});

describe("Appointment + notification services never log contact data or provider text", () => {
  const sendClinicAppointmentEmail = vi.fn();
  let fakeDb: any = null;
  let throwOnGetAdminDb: Error | null = null;

  beforeAll(() => {
    vi.resetModules();
    vi.doMock("@/lib/firebase-admin", () => ({
      getAdminDb: () => {
        if (throwOnGetAdminDb) throw throwOnGetAdminDb;
        return fakeDb;
      },
    }));
  });

  afterAll(() => {
    vi.doUnmock("@/lib/firebase-admin");
    vi.doUnmock("@/lib/appointment-notifications");
    vi.resetModules();
  });

  afterEach(() => {
    fakeDb = null;
    throwOnGetAdminDb = null;
    sendClinicAppointmentEmail.mockReset();
  });

  function clinicDb() {
    return {
      collection: () => ({
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () => ({
              name: "Test Dental",
              notificationSettings: { clinic: { recipientEmails: ["klinik@klinik-test.invalid"] } },
            }),
          }),
        }),
      }),
    };
  }

  const appointment = {
    id: "appt_1",
    clinicId: "clinic_test",
    patientName: PATIENT_NAME,
    patientPhone: PATIENT_PHONE,
    patientEmail: PATIENT_EMAIL,
    requestedService: "İmplant",
    requestedDate: "2026-10-12",
    requestedTime: "14:00",
    source: "AI Assistant",
    status: "pending",
  } as any;

  async function loadAppointmentService() {
    vi.resetModules();
    vi.doMock("@/lib/appointment-notifications", () => ({ sendClinicAppointmentEmail }));
    return import("@/lib/appointment-service");
  }

  it("clinic email provider failure: response logged as flags, contract unchanged", async () => {
    const svc = await loadAppointmentService();
    fakeDb = clinicDb();
    sendClinicAppointmentEmail.mockResolvedValue({ success: false, error: `Resend rejected ${PATIENT_EMAIL} (${PATIENT_NAME})` });
    const res = await svc.sendClinicNewAppointmentNotification(appointment);
    expect(res.status).toBe("FAILED");
    expect(res.providerResponse.error).toContain(PATIENT_EMAIL);
    const out = logs.text();
    expect(out).toContain("[STEP 11] provider response:");
    expectNoPii(out);
  });

  it("clinic email provider exception: error meta only, contract unchanged", async () => {
    const svc = await loadAppointmentService();
    fakeDb = clinicDb();
    sendClinicAppointmentEmail.mockRejectedValue(new Error(`socket closed while sending to ${PATIENT_EMAIL}`));
    const res = await svc.sendClinicNewAppointmentNotification(appointment);
    expect(res.providerResponse.error).toContain(PATIENT_EMAIL);
    const out = logs.text();
    expect(out).toContain("[STEP 11] provider response (exception):");
    expectNoPii(out);
  });

  it("idempotent duplicate submission does not log the idempotency key (date + treatment)", async () => {
    const svc = await loadAppointmentService();
    const existing = { id: "appt_dup", status: "pending", clinicId: "clinic_test" };
    fakeDb = {
      collection: () => ({
        doc: () => ({
          collection: () => ({
            where: () => ({ limit: () => ({ get: async () => ({ empty: false, docs: [{ data: () => existing }] }) }) }),
          }),
        }),
      }),
    };
    const res = await svc.createAppointmentAndNotify({
      clinicId: "clinic_test",
      patientName: PATIENT_NAME,
      patientPhone: PATIENT_PHONE,
      patientEmail: PATIENT_EMAIL,
      requestedService: `İmplant ${TREATMENT_MARKER}`,
      requestedDate: "2026-10-12",
      requestedTime: "14:00",
      source: "AI Assistant",
      status: "pending",
      createdBy: "ai",
      conversationId: "conv_pii",
      idempotencyKey: `conv_pii_2026-10-12_İmplant ${TREATMENT_MARKER}`,
      clinicData: { timezone: TZ, workingHours: HOURS },
      now: NOW,
    });
    expect(res).toMatchObject({ success: true, appointmentId: "appt_dup", clinicNotificationStatus: "SKIPPED_DUPLICATE" });
    const out = logs.text();
    expect(out).toContain("[IDEMPOTENCY_HIT]");
    expect(out).toContain("APPT_DUPLICATE_SUBMISSION_PREVENTED");
    expectNoPii(out);
  });

  it("unexpected submission exception logs error meta only; returned reason unchanged", async () => {
    const svc = await loadAppointmentService();
    throwOnGetAdminDb = new Error(`Cannot write patientEmail=${PATIENT_EMAIL} name=${PATIENT_NAME}`);
    const res = await svc.createAppointmentAndNotify({
      clinicId: "clinic_test",
      patientName: PATIENT_NAME,
      patientPhone: PATIENT_PHONE,
      requestedService: "İmplant",
      requestedDate: "2026-10-12",
      requestedTime: "14:00",
      source: "AI Assistant",
      status: "pending",
      createdBy: "ai",
      conversationId: "conv_pii",
      clinicData: { timezone: TZ, workingHours: HOURS },
      now: NOW,
    });
    expect(res.success).toBe(false);
    expect(res.reason).toContain(PATIENT_EMAIL);
    const out = logs.text();
    expect(out).toContain("[APPOINTMENT_SUBMISSION_EXCEPTION]");
    expectNoPii(out);
  });

  async function loadStatusEmail(provider: { send: (...args: any[]) => Promise<any> }) {
    vi.resetModules();
    vi.doUnmock("@/lib/appointment-notifications");
    const notifications = await import("@/lib/appointment-notifications");
    const { notificationService } = await import("@/lib/services/notifications/NotificationService");
    notificationService.registerProvider({ channel: "email", ...provider } as any);
    return notifications;
  }

  const statusPayload = {
    patientEmail: PATIENT_EMAIL,
    patientName: PATIENT_NAME,
    clinicName: "Test Dental",
    treatment: "İmplant",
    requestedDate: "2026-10-12",
    requestedTime: "14:00",
    status: "CONFIRMED",
    appointmentId: "appt_1",
  };

  it("status email provider rejection: no recipient (masked or raw) and no provider text in logs", async () => {
    const notifications = await loadStatusEmail({
      send: async () => ({
        success: false,
        attempted: true,
        accepted: false,
        status: "FAILED",
        errorCode: "validation_error",
        errorMessage: `Invalid \`to\` field: ${PATIENT_EMAIL}`,
        rawResponse: { statusCode: 422, body: { to: PATIENT_EMAIL } },
      }),
    });
    const res = await notifications.sendPatientAppointmentStatusEmail(statusPayload);
    expect(res.success).toBe(false);
    expect(res.errorMessage).toContain(PATIENT_EMAIL);
    const out = logs.text();
    expect(out).toContain("PATIENT_STATUS_EMAIL_PROVIDER_RESPONSE");
    expect(out).toContain("[STATUS_EMAIL_PROVIDER_RESULT]");
    expect(out).not.toContain("z***");
    expectNoPii(out);
  });

  it("status email provider exception logs error meta only", async () => {
    const notifications = await loadStatusEmail({
      send: async () => {
        throw new Error(`TLS reset delivering to ${PATIENT_EMAIL}`);
      },
    });
    const res = await notifications.sendPatientAppointmentStatusEmail(statusPayload);
    expect(res.success).toBe(false);
    const out = logs.text();
    expect(out).toContain("PATIENT_STATUS_EMAIL_EXCEPTION");
    expectNoPii(out);
  });
});

describe("firebase-admin init failure never prints the raw error", () => {
  const ENV_KEYS = [
    "FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_PRIVATE_KEY",
    "FIREBASE_SERVICE_ACCOUNT_BASE64",
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const key of ENV_KEYS) saved[key] = process.env[key];
  });
  afterAll(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    vi.resetModules();
  });

  it("logs error meta only when the service-account payload is malformed", async () => {
    const malformed = `${KEY_MARKER} -----BEGIN PRIVATE KEY----- not json`;
    let rawMessage = "";
    try {
      JSON.parse(malformed);
    } catch (e) {
      rawMessage = (e as Error).message;
    }
    expect(rawMessage).toContain(KEY_MARKER.slice(0, 9));

    for (const key of ENV_KEYS) delete process.env[key];
    process.env.FIREBASE_PROJECT_ID = "pii-logging-test";
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 = Buffer.from(malformed, "utf8").toString("base64");
    vi.resetModules();
    vi.doUnmock("@/lib/firebase-admin");
    const { getAdminDb } = await import("@/lib/firebase-admin");
    expect(getAdminDb()).toBeNull();
    const out = logs.text();
    expect(out).toContain("[firebase-admin] Initialization failed:");
    expect(out).toContain("SyntaxError");
    expectNoPii(out);
  });
});

describe("Static guard: closed PII log statements stay closed", () => {
  const GUARDED_FILES = [
    "lib/agent/handleClinicAgentTurn.ts",
    "lib/agent/appointmentParse.ts",
    "lib/agent/persistence.ts",
    "lib/appointment-service.ts",
    "lib/appointment-notifications.ts",
    "lib/firebase-admin.ts",
    "lib/contact-request/service.ts",
    "lib/conversation/featureFlags.ts",
    "lib/services/aiGateway.ts",
    "lib/services/aiLimitService.ts",
    "lib/services/aiPricingService.ts",
    "lib/services/retrievalService.ts",
    "lib/services/notifications/NotificationService.ts",
    "lib/services/conversations/conversationTranscriptService.ts",
    "lib/voice/voiceAdapter.ts",
    "lib/voice/loadServerHistory.ts",
    "lib/voice/telephony/didResolver.ts",
    "lib/voice/telephony/callBinding.ts",
    "lib/voice/runtime/runtimeLease.ts",
    "lib/voice/runtime/voiceRuntimeBridge.ts",
    "app/api/public/chat/route.ts",
  ];

  function consoleStatements(source: string): string[] {
    const out: string[] = [];
    const re = /console\.(log|info|warn|error|debug)\s*\(/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(source))) {
      let i = match.index + match[0].length;
      let depth = 1;
      while (i < source.length && depth > 0) {
        const c = source[i];
        if (c === "(" || c === "{" || c === "[") depth++;
        else if (c === ")" || c === "}" || c === "]") depth--;
        i++;
      }
      out.push(source.slice(match.index, i).replace(/\s+/g, " "));
    }
    return out;
  }

  /** Keeps only interpolated / argument expressions and strips content-free uses (presence flags, lengths, key lists). */
  function contentBearingPart(statement: string): string {
    return statement
      .replace(/`((?:[^`\\]|\\.)*)`/g, (_m, body: string) => (body.match(/\$\{[^}]*\}/g) ?? []).join(" "))
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      .replace(/Boolean\([^()]*(\([^()]*\))?[^()]*\)/g, "")
      .replace(/!!\s*[\w.?]+/g, "")
      .replace(/Object\.keys\([^()]*(\([^()]*\))?[^()]*\)/g, "")
      .replace(/[\w.?]+\.length/g, "");
  }

  const FORBIDDEN_IN_LOGS: Array<[string, RegExp]> = [
    ["raw patient message", /\b(msgLower|message|userMessage|text|transcript)\b(?!\s*:)/],
    ["assistant reply", /\breply\b(?!\s*:)/],
    ["RAG query / KB content", /query_text|content_preview|\bd\.text\b(?!\.length)/],
    ["intent entities", /conversationIntent\.entities\b/],
    ["patient contact fields", /\b(patientName|patientPhone|patientEmail|patientEmailToUse|recipient|confirmMsg)\b(?!\s*:)/],
    ["masked contact values", /maskedRecipient|maskEmail|maskPhone|phoneMasked/],
    ["idempotency key value", /idempotencyKey\b(?!\s*:)|idempotency_key\b(?!\s*:)/],
    ["provider error text", /safeErrorMessage:\s*(?![\s"])|errorMessage\b(?!\s*:)|\.message\b/],
    ["raw error object argument", /,\s*(e|err|error|dbErr|lastError|policyErr)\s*\)\s*$/],
    ["raw date/time text", /\b(rawDateText|rawTimeStr|requestedDay|requestedTime|resolvedDate|resolvedTime)\b(?!\s*:)/],
  ];

  it.each(GUARDED_FILES)("%s has no content-bearing console output", (file) => {
    const source = readFileSync(resolve(REPO, file), "utf8");
    const offenders: string[] = [];
    for (const statement of consoleStatements(source)) {
      const part = contentBearingPart(statement);
      for (const [label, pattern] of FORBIDDEN_IN_LOGS) {
        if (pattern.test(part)) offenders.push(`${label}: ${statement.slice(0, 200)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("debugLog never receives the patient message or reply text", () => {
    for (const file of ["lib/agent/handleClinicAgentTurn.ts", "app/api/public/chat/route.ts"]) {
      const source = readFileSync(resolve(REPO, file), "utf8");
      const pushes = source.match(/debugLog\.push\([^;]*\);/g) ?? [];
      for (const push of pushes) {
        expect(contentBearingPart(push), `${file}: ${push}`).not.toMatch(/\b(message|reply|msgLower|text)\b|err\.message/);
      }
    }
  });
});
