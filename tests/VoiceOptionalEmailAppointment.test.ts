/**
 * Optional email in clinic appointment collection (product-global: web + voice Agent Core).
 *
 * Real staff call: the caller dictated an address ("… et gmail nokta com"), got the malformed-email
 * prompt, then said they did not want to give an email; the flow stayed in COLLECTING_EMAIL with
 * every other field collected. Email is optional in the appointment service, schema, notifications
 * and panel; only conversation orchestration required it.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { detectEmailDecline, normalizeSpokenEmail } from "@/lib/conversation/emailCollection";
import { SlotExtractor } from "@/lib/conversation/slotExtractor";
import { IntentRouter } from "@/lib/conversation/intentRouter";
import { ConversationStateEngine } from "@/lib/conversation/stateEngine";
import { buildAppointmentReviewMessage } from "@/lib/conversation/formatters";
import {
  APPOINTMENT_DRAFT_FIELD_LIFECYCLE,
  appointmentDraftSlots,
  createFreshAppointmentDraft,
  isAppointmentDraftComplete,
  isLoadedAppointmentFromClosedDraft,
  parseAppointmentDraftBoundary,
} from "@/lib/agent/draft";
import type { WeeklySchedule } from "@/lib/skills/ClinicWorkingHoursResolver";
import { RequestTimer } from "@/lib/performance/requestTimer";

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

const DECLINES = [
  "E-posta vermek istemiyorum.",
  "Mail adresi vermek istemiyorum.",
  "E-postam yok.",
  "Mail kullanmıyorum.",
  "E-postayı geçelim.",
];

describe("explicit email decline (deterministic)", () => {
  it.each(DECLINES)("'%s' is a decline with or without a pending email question", (msg) => {
    expect(detectEmailDecline(msg, { expectingEmail: true })).toBe(true);
    expect(detectEmailDecline(msg, { expectingEmail: false })).toBe(true);
  });

  it.each(["İstemiyorum", "Hayır.", "Yok, geçelim", "vermek istemiyorum", "Hayır, teşekkürler"])(
    "bare refusal '%s' is a decline only while the email question is pending",
    (msg) => {
      expect(detectEmailDecline(msg, { expectingEmail: true })).toBe(true);
      expect(detectEmailDecline(msg, { expectingEmail: false })).toBe(false);
    }
  );

  it.each([
    "yusuf et gmail",
    "yusuf@gmail",
    "E-posta zorunlu mu?",
    "Mail adresim yok mu gerekiyor?",
    "e-posta adresim yusuf@gmail.com, yok başka",
    "Pazartesi uygun",
  ])("'%s' is never a decline", (msg) => {
    expect(detectEmailDecline(msg, { expectingEmail: true })).toBe(false);
  });
});

describe("spoken email normalization (email context only)", () => {
  it.each([
    ["yusuf nokta alper et gmail nokta com", "yusuf.alper@gmail.com"],
    ["yusuf alper et gmail nokta com", "yusufalper@gmail.com"],
    ["yusuf alt çizgi alper et gmail nokta com", "yusuf_alper@gmail.com"],
    ["Yusuf tire alper at hotmail dot com", "yusuf-alper@hotmail.com"],
    ["E-posta adresim yusuf et gmail nokta com nokta tr", "yusuf@gmail.com.tr"],
    ["Info et klinik nokta com.", "info@klinik.com"],
    ["yusuf at işareti gmail.com", "yusuf@gmail.com"],
  ])("'%s' → %s", (spoken, email) => {
    expect(normalizeSpokenEmail(spoken)).toBe(email);
  });

  it.each([
    "yusuf et gmail",
    "et gmail nokta com",
    "yusuf et",
    "yusuf özgül et gmail nokta com",
    "kayıt et yusuf et gmail nokta com",
    "yusuf nokta et gmail nokta com",
    "E-posta vermek istemiyorum",
  ])("never invents missing parts: '%s' → null", (spoken) => {
    expect(normalizeSpokenEmail(spoken)).toBeNull();
  });

  it("extractor normalizes dictation only in email context", () => {
    const spoken = "yusuf nokta alper et gmail nokta com";
    expect(SlotExtractor.extractSlots(spoken, {}, "tr", TZ, "email", NOW).extracted.email).toBe("yusuf.alper@gmail.com");
    expect(SlotExtractor.extractSlots(spoken, {}, "tr", TZ, "fullName", NOW).extracted.email).toBeUndefined();
    expect(
      SlotExtractor.extractSlots(`mail adresim ${spoken}`, {}, "tr", TZ, "confirmation", NOW).extracted.email
    ).toBe("yusuf.alper@gmail.com");
  });

  it("decline is a disposition, malformed is a malformed attempt — never mixed", () => {
    const declined = SlotExtractor.extractSlots("E-posta vermek istemiyorum.", {}, "tr", TZ, "email", NOW);
    expect(declined.extracted.emailDeclined).toBe(true);
    expect(declined.extracted.email).toBeUndefined();
    expect(declined.invalidEmailAttempt).toBe(false);

    const malformed = SlotExtractor.extractSlots("yusuf et gmail", {}, "tr", TZ, "email", NOW);
    expect(malformed.extracted.emailDeclined).toBeUndefined();
    expect(malformed.invalidEmailAttempt).toBe(true);
  });
});

describe("intent routing of email answers", () => {
  const route = (message: string, expectedSlot?: string) =>
    IntentRouter.classifyConversationIntent({
      message,
      currentState: expectedSlot ? "APPOINTMENT_COLLECTION" : "INITIAL",
      expectedSlot,
      collectedSlots: {},
      locale: "tr",
      now: NOW,
    } as any);

  it.each([...DECLINES, "İstemiyorum", "Hayır"])("'%s' during the email question → continuation + decline", (msg) => {
    const r = route(msg, "email");
    expect(r.intent).toBe("appointment_continuation");
    expect(r.entities?.emailDeclined).toBe(true);
    expect(r.validationError).toBeUndefined();
  });

  it("'Mail adresi …' is not a location question and dictation is not a malformed email", () => {
    expect(route("Mail adresi vermek istemiyorum.", "email").intent).toBe("appointment_continuation");
    const dictated = route("yusuf nokta alper et gmail nokta com", "email");
    expect(dictated.intent).toBe("appointment_continuation");
    expect(dictated.entities?.email).toBe("yusuf.alper@gmail.com");
    expect(dictated.validationError).toBeUndefined();
  });

  it("bare 'istemiyorum' outside the email question still cancels (unchanged)", () => {
    expect(route("istemiyorum", "preferredTime").intent).toBe("cancel");
    expect(route("istemiyorum").intent).toBe("cancel");
  });

  it("malformed email is still a validation error (one natural retry)", () => {
    expect(route("yusuf et gmail", "email").validationError).toBe("invalid_email");
  });
});

describe("required-slot policy", () => {
  const full = { treatment: "implant", preferredDate: "2026-10-12", preferredTime: "14:00", fullName: "A B", phone: "05321234567" };

  it("declined email satisfies the optional email slot; unset email is still asked", () => {
    expect(ConversationStateEngine.getMissingSlots(full)).toEqual(["email"]);
    expect(ConversationStateEngine.getMissingSlots({ ...full, emailDeclined: true })).toEqual([]);
  });

  it("phone and name are not weakened by declining email", () => {
    expect(ConversationStateEngine.getMissingSlots({ ...full, phone: undefined, emailDeclined: true })).toEqual(["phone"]);
    expect(ConversationStateEngine.getMissingSlots({ ...full, fullName: undefined, emailDeclined: true })).toEqual(["fullName"]);
    expect(
      isAppointmentDraftComplete({
        requestedService: "implant",
        requestedDate: "2026-10-12",
        requestedTime: "14:00",
        patientName: "A B",
        emailDisposition: "DECLINED",
      })
    ).toBe(false);
  });

  it("review summary omits email only when declined", () => {
    const base = { patientName: "A B", patientPhone: "05321234567", requestedService: "implant", requestedDate: "2026-10-12", requestedTime: "14:00" };
    expect(buildAppointmentReviewMessage({ locale: "tr", appointmentData: { ...base, emailDisposition: "DECLINED" } })).not.toContain("E-posta");
    expect(buildAppointmentReviewMessage({ locale: "en", appointmentData: { ...base, emailDisposition: "DECLINED" } })).not.toContain("Email");
    expect(buildAppointmentReviewMessage({ locale: "tr", appointmentData: { ...base, patientEmail: "a@b.co" } })).toContain("E-posta: a@b.co");
    expect(buildAppointmentReviewMessage({ locale: "tr", appointmentData: base })).toContain("E-posta: -");
  });

  it("a fresh draft resets every per-appointment field, including untyped extras", () => {
    const declined = {
      requestedService: "implant",
      requestedDate: "2026-10-12",
      requestedTime: "14:00",
      patientName: "A B",
      patientPhone: "05321234567",
      patientEmail: "",
      emailDisposition: "DECLINED" as const,
      emailValidationFails: 2,
      startsAtUtc: "2026-10-12T11:00:00.000Z",
      requestedWeekday: "Pazartesi",
    };
    const fresh = createFreshAppointmentDraft(declined);
    expect(fresh).toEqual({ emailDisposition: "UNSET", emailValidationFails: 0 });
    expect(declined.emailDisposition).toBe("DECLINED");
    expect(appointmentDraftSlots(fresh).emailDeclined).toBe(false);
    expect(ConversationStateEngine.getMissingSlots(appointmentDraftSlots(fresh))).toEqual([
      "treatment", "preferredDate", "preferredTime", "fullName", "phone", "email",
    ]);
  });

  it("every AppointmentData field is classified, and none carries into a new appointment", () => {
    expect(Object.keys(APPOINTMENT_DRAFT_FIELD_LIFECYCLE).sort()).toEqual([
      "emailDisposition", "emailValidationFails", "notes", "originalText", "patientEmail", "patientName",
      "patientPhone", "patientPhoneRaw", "pendingAppointmentDate", "preferredDateDisplay", "preferredTimeEnd",
      "preferredTimePeriod", "preferredTimeStart", "preferredTimeText", "requestedDate", "requestedDoctor",
      "requestedService", "requestedTime", "timezone",
    ]);
    expect(new Set(Object.values(APPOINTMENT_DRAFT_FIELD_LIFECYCLE))).toEqual(new Set(["PER_APPOINTMENT_RESET"]));
  });

  it("the submission guard only ignores an appointmentId that a later explicit booking closed", () => {
    const boundary = (reason: "NEW_APPOINTMENT" | "CANCELLED", afterAppointmentId: string | null) =>
      parseAppointmentDraftBoundary({ reason, afterAppointmentId, at: "x" });
    expect(isLoadedAppointmentFromClosedDraft(boundary("NEW_APPOINTMENT", "apt_1"), "apt_1")).toBe(true);
    expect(isLoadedAppointmentFromClosedDraft(boundary("NEW_APPOINTMENT", "apt_1"), "apt_2")).toBe(false);
    expect(isLoadedAppointmentFromClosedDraft(boundary("CANCELLED", "apt_1"), "apt_1")).toBe(false);
    expect(isLoadedAppointmentFromClosedDraft(boundary("NEW_APPOINTMENT", null), null)).toBe(false);
    expect(isLoadedAppointmentFromClosedDraft(null, "apt_1")).toBe(false);
    expect(parseAppointmentDraftBoundary({ reason: "OTHER" })).toBeNull();
  });
});

type Saved = Record<string, any>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Firestore set(..., { merge: true }) semantics: nested maps merge, absent keys survive. */
function deepMerge(target: Saved, patch: Saved): Saved {
  const out: Saved = { ...target };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out;
}

describe("Agent Core end-to-end: appointment without email (voice and web)", () => {
  let handleClinicAgentTurn: typeof import("@/lib/agent/handleClinicAgentTurn").handleClinicAgentTurn;
  const createCalls: Array<Record<string, any>> = [];
  const logs: string[] = [];

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    for (const level of ["log", "warn", "error", "info"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
      });
    }
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

  let messageSeq = 0;
  function makeConversation(channel: "voice" | "web_widget", initial: Saved = {}, opts: { history?: boolean } = {}) {
    let saved: Saved = { ...initial };
    const logRef = {
      get: async () => ({ exists: true, data: () => saved }),
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
          return { where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) };
        }
        if (name === "agencies") return { get: async () => ({ docs: [] }) };
        return { doc: () => ({ get: async () => ({ exists: false }) }) };
      },
    };
    const history: Array<{ role: string; content: string }> = [];
    const say = async (text: string) => {
      messageSeq += 1;
      const result = await handleClinicAgentTurn({
        input: {
          clinicId: "clinic_test",
          conversationId: `conv_${channel}`,
          channel,
          text,
          history: opts.history ? [...history] : [],
          locale: "tr",
          context: { messageId: `m${messageSeq}` },
        },
        adminDb,
        perf: new RequestTimer({}),
        debugLog: [],
        startTime: NOW.getTime(),
      });
      history.push({ role: "user", content: text }, { role: "assistant", content: result.replyText });
      return {
        reply: result.replyText,
        state: saved.appointmentState as string,
        draft: (saved.appointmentDraft || {}) as Saved,
        memDraft: (result.appointmentDraft || null) as Saved | null,
      };
    };
    return { say, saved: () => saved };
  }

  async function collectUpToEmail(say: (t: string) => Promise<{ reply: string; state: string; draft: Saved }>) {
    expect((await say("İmplant için randevu almak istiyorum.")).state).toBe("COLLECTING_DATE");
    expect((await say("12 Ekim")).state).toBe("COLLECTING_TIME");
    expect((await say("saat 14:00")).state).toBe("COLLECTING_NAME");
    expect((await say("Yusuf Alper")).state).toBe("COLLECTING_PHONE");
    const askEmail = await say("0532 123 45 67");
    expect(askEmail.state).toBe("COLLECTING_EMAIL");
    expect(askEmail.reply).toMatch(/e-posta adresinizi/i);
  }

  const EXPECTED_FIELDS = {
    patientName: "Yusuf Alper",
    requestedDate: "2026-10-12",
    requestedTime: "14:00",
  };

  it.each(["voice", "web_widget"] as const)(
    "%s: 'E-posta vermek istemiyorum.' → DECLINED, confirmation, appointment created without email",
    async (channel) => {
      createCalls.length = 0;
      const { say } = makeConversation(channel);
      await collectUpToEmail(say);

      const declined = await say("E-posta vermek istemiyorum.");
      expect(declined.state).toBe("AWAITING_CONFIRMATION");
      expect(declined.draft.emailDisposition).toBe("DECLINED");
      expect(declined.draft.patientEmail || "").toBe("");
      expect(declined.draft).toMatchObject(EXPECTED_FIELDS);
      expect(declined.draft.requestedService).toBe("Diş İmplantı");
      expect(declined.draft.patientPhone).toBeTruthy();
      expect(declined.reply).toMatch(/onaylıyor musunuz/i);
      expect(declined.reply).not.toMatch(/e-posta/i);

      const submitted = await say("Evet");
      expect(submitted.state).toBe("APPOINTMENT_SUBMITTED");
      expect(submitted.reply).not.toMatch(/e-posta/i);
      expect(createCalls).toHaveLength(1);
      const payload = createCalls[0];
      expect(payload.patientEmail).toBeUndefined();
      expect(payload).toMatchObject({ clinicId: "clinic_test", ...EXPECTED_FIELDS });
      expect(payload.patientPhone).toBeTruthy();
      expect(payload.requestedService).toBe("Diş İmplantı");
      expect(JSON.stringify(payload)).not.toMatch(/@|noreply|example\.|placeholder/i);
    }
  );

  it("voice: bare 'Hayır' to the email question declines email and keeps the draft (not cancel)", async () => {
    const { say } = makeConversation("voice");
    await collectUpToEmail(say);
    const r = await say("Hayır");
    expect(r.state).toBe("AWAITING_CONFIRMATION");
    expect(r.draft.emailDisposition).toBe("DECLINED");
    expect(r.draft).toMatchObject(EXPECTED_FIELDS);
  });

  it("voice: declined, then a spoken email → PROVIDED and the canonical email is submitted", async () => {
    createCalls.length = 0;
    const { say } = makeConversation("voice");
    await collectUpToEmail(say);
    expect((await say("E-posta vermek istemiyorum.")).draft.emailDisposition).toBe("DECLINED");

    const provided = await say("Aslında e-posta adresim yusuf nokta alper et gmail nokta com");
    expect(provided.state).toBe("AWAITING_CONFIRMATION");
    expect(provided.draft.emailDisposition).toBe("PROVIDED");
    expect(provided.draft.patientEmail).toBe("yusuf.alper@gmail.com");
    expect(provided.draft).toMatchObject(EXPECTED_FIELDS);
    expect(provided.reply).toContain("E-posta: yusuf.alper@gmail.com");

    const submitted = await say("Evet");
    expect(submitted.state).toBe("APPOINTMENT_SUBMITTED");
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0].patientEmail).toBe("yusuf.alper@gmail.com");
  });

  it("voice: dictated email during the email question is accepted directly", async () => {
    const { say } = makeConversation("voice");
    await collectUpToEmail(say);
    const r = await say("yusuf alt çizgi alper et gmail nokta com");
    expect(r.state).toBe("AWAITING_CONFIRMATION");
    expect(r.draft).toMatchObject({ patientEmail: "yusuf_alper@gmail.com", emailDisposition: "PROVIDED" });
  });

  it("voice: malformed email gets one plain retry, then an offer to skip — never an automatic decline", async () => {
    const { say } = makeConversation("voice");
    await collectUpToEmail(say);
    const first = await say("yusuf et gmail");
    expect(first.state).toBe("COLLECTING_EMAIL");
    expect(first.reply).toMatch(/eksik veya geçersiz/);
    expect(first.draft.emailDisposition).toBe("UNSET");

    const second = await say("yusuf et gmail");
    expect(second.state).toBe("COLLECTING_EMAIL");
    expect(second.reply).toMatch(/e-posta vermeden devam edebiliriz/);
    expect(second.draft.emailDisposition).toBe("UNSET");

    const declined = await say("Geçelim");
    expect(declined.state).toBe("AWAITING_CONFIRMATION");
    expect(declined.draft.emailDisposition).toBe("DECLINED");
  });

  it("web regression: typed email still completes the flow with the email in the summary", async () => {
    createCalls.length = 0;
    const { say } = makeConversation("web_widget");
    await collectUpToEmail(say);
    const r = await say("yusuf@example.org");
    expect(r.state).toBe("AWAITING_CONFIRMATION");
    expect(r.draft).toMatchObject({ patientEmail: "yusuf@example.org", emailDisposition: "PROVIDED" });
    expect(r.reply).toContain("E-posta: yusuf@example.org");
    await say("Evet");
    expect(createCalls[0].patientEmail).toBe("yusuf@example.org");
  });

  describe("emailDisposition lifecycle is scoped to one appointment draft", () => {
    it("same appointment: decline → time correction → date correction → confirm keeps DECLINED, never re-asks", async () => {
      createCalls.length = 0;
      const { say } = makeConversation("voice");
      await collectUpToEmail(say);
      expect((await say("E-posta vermek istemiyorum.")).draft.emailDisposition).toBe("DECLINED");

      const time = await say("Saati 15:00 olarak değiştirelim.");
      expect(time.state).toBe("AWAITING_CONFIRMATION");
      expect(time.draft).toMatchObject({ requestedTime: "15:00", emailDisposition: "DECLINED" });
      expect(time.reply).not.toMatch(/e-posta/i);

      const date = await say("Tarihi 13 Ekim yapalım.");
      expect(date.state).toBe("AWAITING_CONFIRMATION");
      expect(date.draft).toMatchObject({ requestedDate: "2026-10-13", requestedTime: "15:00", emailDisposition: "DECLINED" });
      expect(date.reply).not.toMatch(/e-posta/i);

      const submitted = await say("Evet");
      expect(submitted.state).toBe("APPOINTMENT_SUBMITTED");
      expect(createCalls).toHaveLength(1);
      expect(createCalls[0]).toMatchObject({ requestedDate: "2026-10-13", requestedTime: "15:00", patientName: "Yusuf Alper" });
      expect(createCalls[0].patientEmail).toBeUndefined();
    });

    it("same appointment: 'Hayır, saat 12 olsun' at review changes only the time", async () => {
      const { say } = makeConversation("voice");
      await collectUpToEmail(say);
      const declined = await say("E-posta vermek istemiyorum.");
      const before = { ...declined.draft };

      const corrected = await say("Hayır, saat 12 olsun");
      expect(corrected.state).toBe("AWAITING_CONFIRMATION");
      expect(corrected.draft).toEqual({ ...before, requestedTime: "12:00", preferredTimeText: corrected.draft.preferredTimeText });
      expect(corrected.draft.emailDisposition).toBe("DECLINED");
      expect(corrected.reply).not.toMatch(/iptal/i);
    });

    it.each(["voice", "web_widget"] as const)(
      "%s: decline → cancel → new appointment gets a fresh draft (no DECLINED, no old fields)",
      async (channel) => {
        const { say } = makeConversation(channel);
        await collectUpToEmail(say);
        await say("E-posta vermek istemiyorum.");
        expect((await say("Vazgeçtim")).state).toBe("IDLE");

        const restarted = await say("İmplant için randevu almak istiyorum.");
        expect(restarted.state).toBe("COLLECTING_DATE");
        expect(restarted.draft).toEqual({ ...FRESH_DRAFT, requestedService: "Diş İmplantı" });
      }
    );

    it("decline → provide keeps the email attached through later corrections of the same appointment", async () => {
      createCalls.length = 0;
      const { say } = makeConversation("voice");
      await collectUpToEmail(say);
      await say("E-posta vermek istemiyorum.");
      await say("Aslında e-posta adresim yusuf nokta alper et gmail nokta com");

      const time = await say("Saati 15:00 olarak değiştirelim.");
      expect(time.state).toBe("AWAITING_CONFIRMATION");
      expect(time.draft).toMatchObject({ requestedTime: "15:00", patientEmail: "yusuf.alper@gmail.com", emailDisposition: "PROVIDED" });

      expect((await say("Evet")).state).toBe("APPOINTMENT_SUBMITTED");
      expect(createCalls[0]).toMatchObject({ requestedTime: "15:00", patientEmail: "yusuf.alper@gmail.com" });
    });
  });

  const FRESH_DRAFT = { emailDisposition: "UNSET", emailValidationFails: 0 };
  const STALE_KEYS = [
    "requestedDate", "requestedTime", "preferredDateDisplay", "requestedWeekday", "preferredTimeText",
    "patientName", "patientPhone", "patientEmail", "startsAtUtc", "clinicTimeZone", "requestedDoctor", "notes",
  ];

  async function completeFirstAppointmentWithoutEmail(say: (t: string) => Promise<{ reply: string; state: string; draft: Saved }>) {
    await collectUpToEmail(say);
    expect((await say("E-posta vermek istemiyorum.")).draft.emailDisposition).toBe("DECLINED");
    expect((await say("Evet")).state).toBe("APPOINTMENT_SUBMITTED");
  }

  describe("a new appointment in the same conversation gets a fresh draft", () => {
    it.each(["voice", "web_widget"] as const)(
      "%s: two complete appointments, independent drafts, no stale field, no duplicate creation",
      async (channel) => {
        createCalls.length = 0;
        const { say, saved } = makeConversation(channel, {}, { history: true });
        await completeFirstAppointmentWithoutEmail(say);
        expect(createCalls).toHaveLength(1);
        await say("Evet");
        expect(createCalls).toHaveLength(1);

        const start = await say("Bir de kontrol için randevu almak istiyorum.");
        expect(start.state).toBe("COLLECTING_DATE");
        expect(start.draft).toEqual({ ...FRESH_DRAFT, requestedService: "Muayene / Danışma" });
        expect(JSON.parse(JSON.stringify(start.memDraft))).toEqual(start.draft);
        expect(saved().pendingAction ?? null).toBeNull();
        expect(saved().appointmentDraftBoundary).toMatchObject({ reason: "NEW_APPOINTMENT", afterAppointmentId: "apt_1" });
        expect(saved()).toMatchObject({ appointmentId: "apt_1", isAppointmentCreated: true });

        expect((await say("15 Ekim")).state).toBe("COLLECTING_TIME");
        expect((await say("saat 11:00")).state).toBe("COLLECTING_NAME");
        expect((await say("Ayşe Yılmaz")).state).toBe("COLLECTING_PHONE");
        const askEmail = await say("0533 222 33 44");
        expect(askEmail.state).toBe("COLLECTING_EMAIL");
        expect(askEmail.reply).toMatch(/e-posta adresinizi/i);
        const review = await say("ayse@example.org");
        expect(review.state).toBe("AWAITING_CONFIRMATION");
        expect(review.reply).not.toMatch(/Yusuf|İmplant|14:00|532/);

        expect((await say("Evet")).state).toBe("APPOINTMENT_SUBMITTED");
        await say("Evet");
        expect(createCalls).toHaveLength(2);
        const [first, second] = createCalls;
        expect(first).toMatchObject({
          clinicId: "clinic_test", requestedService: "Diş İmplantı", requestedDate: "2026-10-12", requestedTime: "14:00", patientName: "Yusuf Alper",
        });
        expect(first.patientEmail).toBeUndefined();
        expect(second).toMatchObject({
          clinicId: "clinic_test", requestedService: "Muayene / Danışma", requestedDate: "2026-10-15", requestedTime: "11:00",
          patientName: "Ayşe Yılmaz", patientEmail: "ayse@example.org",
        });
        expect(second.patientPhone).not.toBe(first.patientPhone);
        expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
        expect(second.conversationId).toBe(first.conversationId);
        expect(saved()).toMatchObject({ appointmentId: "apt_2", appointmentState: "APPOINTMENT_SUBMITTED" });
      }
    );

    it("voice: a new booking without a treatment asks for one instead of reusing appointment #1's", async () => {
      const { say } = makeConversation("voice", {}, { history: true });
      await completeFirstAppointmentWithoutEmail(say);
      const next = await say("Bir randevu daha almak istiyorum.");
      expect(next.state).toBe("COLLECTING_TREATMENT");
      expect(next.draft).toEqual(FRESH_DRAFT);
    });

    it("voice: the replaced draft is what reloads — no stale field reappears after a restart", async () => {
      const first = makeConversation("voice", {}, { history: true });
      await completeFirstAppointmentWithoutEmail(first.say);
      await first.say("Bir de kontrol için randevu almak istiyorum.");
      const persisted = first.saved();
      for (const key of STALE_KEYS) expect(persisted.appointmentDraft).not.toHaveProperty(key);

      const reloaded = makeConversation("voice", JSON.parse(JSON.stringify(persisted)));
      const date = await reloaded.say("15 Ekim");
      expect(date.state).toBe("COLLECTING_TIME");
      expect(date.draft).toMatchObject({ ...FRESH_DRAFT, requestedService: "Muayene / Danışma", requestedDate: "2026-10-15" });
      for (const key of ["requestedTime", "patientName", "patientPhone", "patientEmail"]) {
        expect(date.draft).not.toHaveProperty(key);
      }
    });
  });

  describe("Turkish cancel phrases", () => {
    it.each(["iptal", "İptal", "İptal.", "İPTAL", "Vazgeçtim.", "İptal etmek istiyorum."])(
      "voice: '%s' cancels the appointment; the next booking starts a fresh draft",
      async (cancelPhrase) => {
        const { say, saved } = makeConversation("voice", {}, { history: true });
        expect((await say("İmplant için randevu almak istiyorum.")).state).toBe("COLLECTING_DATE");
        expect((await say("12 Ekim")).state).toBe("COLLECTING_TIME");

        const cancelled = await say(cancelPhrase);
        expect(cancelled.state).toBe("IDLE");
        expect(cancelled.reply).toMatch(/iptal ettim/);
        expect(cancelled.draft).toEqual(FRESH_DRAFT);
        expect(saved().pendingAction ?? null).toBeNull();
        expect(saved().appointmentDraftBoundary).toMatchObject({ reason: "CANCELLED", afterAppointmentId: null });

        const restarted = await say("Randevu almak istiyorum.");
        expect(restarted.state).toBe("COLLECTING_TREATMENT");
        expect(restarted.draft).toEqual(FRESH_DRAFT);
      }
    );

    it("web: 'İptal.' at review cancels, and a later 'Tamam' never submits the cancelled draft", async () => {
      createCalls.length = 0;
      const { say } = makeConversation("web_widget", {}, { history: true });
      await collectUpToEmail(say);
      expect((await say("E-posta vermek istemiyorum.")).state).toBe("AWAITING_CONFIRMATION");
      expect((await say("İptal.")).state).toBe("IDLE");
      await say("Tamam");
      await say("Evet");
      expect(createCalls).toHaveLength(0);
    });

    it("voice: email refusal during email collection declines email and never cancels", async () => {
      for (const refusal of ["E-posta vermek istemiyorum.", "İstemiyorum."]) {
        const { say } = makeConversation("voice");
        await collectUpToEmail(say);
        const r = await say(refusal);
        expect(r.state).toBe("AWAITING_CONFIRMATION");
        expect(r.draft.emailDisposition).toBe("DECLINED");
        expect(r.reply).not.toMatch(/iptal/i);
      }
    });

    it("voice: 'İstemiyorum.' outside email collection keeps its cancel meaning", async () => {
      const { say } = makeConversation("voice");
      expect((await say("İmplant için randevu almak istiyorum.")).state).toBe("COLLECTING_DATE");
      expect((await say("12 Ekim")).state).toBe("COLLECTING_TIME");
      const r = await say("İstemiyorum.");
      expect(r.state).toBe("IDLE");
      expect(r.reply).toMatch(/iptal ettim/);
    });
  });

  it("no email, phone or name value reaches logs", () => {
    const joined = logs.join("\n");
    expect(joined).not.toContain("yusuf.alper@gmail.com");
    expect(joined).not.toContain("yusuf_alper@gmail.com");
    expect(joined).not.toContain("yusuf@example.org");
    expect(joined).not.toContain("ayse@example.org");
    expect(joined).not.toMatch(/533\s?222\s?33\s?44|5332223344/);
    expect(joined).not.toContain("Ayşe Yılmaz");
    expect(joined).not.toMatch(/532\s?123\s?45\s?67|5321234567/);
    expect(joined).not.toContain("Yusuf Alper");
  });
});

describe("appointment record without email (canonical schema)", () => {
  afterAll(() => {
    vi.doUnmock("@/lib/firebase-admin");
    vi.resetModules();
  });

  it("stores the canonical empty patientEmail, no synthetic value, other fields intact", async () => {
    vi.resetModules();
    vi.doUnmock("@/lib/appointment-service");
    const written: Saved[] = [];
    const docRef = {
      id: "apt_new",
      set: async (data: Saved) => {
        written.push(data);
      },
      get: async () => ({ exists: true }),
    };
    const appointments = {
      where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }),
      doc: () => docRef,
    };
    vi.doMock("@/lib/firebase-admin", () => ({
      getAdminDb: () => ({
        collection: () => ({
          doc: () => ({
            collection: (sub: string) => (sub === "appointments" ? appointments : { add: async () => undefined }),
          }),
        }),
      }),
    }));
    const { createAppointmentRecord } = await import("@/lib/appointment-service");
    const result = await createAppointmentRecord({
      clinicId: "clinic_test",
      patientName: "Yusuf Alper",
      patientPhone: "+90 532 123 45 67",
      requestedService: "Diş İmplantı",
      requestedDate: "2026-10-12",
      requestedTime: "14:00",
      source: "ai_chatbot",
      status: "PENDING_REVIEW",
      createdBy: "ai_assistant",
      conversationId: "voice_conv_x",
    });
    expect(result.record?.id).toBe("apt_new");
    expect(written).toHaveLength(1);
    expect(written[0].patientEmail).toBe("");
    expect(written[0]).toMatchObject({
      patientName: "Yusuf Alper",
      patientPhone: "+90 532 123 45 67",
      requestedService: "Diş İmplantı",
      requestedDate: "2026-10-12",
      requestedTime: "14:00",
    });
  });
});
