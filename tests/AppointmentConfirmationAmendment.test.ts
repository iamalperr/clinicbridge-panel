/**
 * Confirmation-stage appointment draft remains mutable until submission.
 * Covers time/date amendments, validation, contact corrections, and
 * transcript persistence of the assistant reply after an amendment.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SlotExtractor,
  IntentRouter,
  applyConfirmationAmendment,
  looksLikeDateTimeAmendment,
  buildAppointmentReviewMessage,
  type AppointmentDraftLike,
} from "../lib/conversation";
import { persistVisibleChatTurn } from "../lib/services/conversations/conversationTranscriptService";
import {
  mergeConversationTranscriptSources,
  sortCanonicalMessages,
} from "../lib/services/conversations/conversationTranscript";
import type { WeeklySchedule } from "../lib/skills/ClinicWorkingHoursResolver";

const REPO = resolve(__dirname, "..");
const FIXED_NOW = new Date("2026-08-19T08:00:00.000Z"); // 11:00 Europe/Istanbul
const CLINIC_TZ = "Europe/Istanbul";

const IDA_HOURS: WeeklySchedule = {
  monday: ["09:00", "18:00"],
  tuesday: ["09:00", "18:00"],
  wednesday: ["09:00", "18:00"],
  thursday: ["09:00", "18:00"],
  friday: ["09:00", "18:00"],
  saturday: ["10:00", "14:00"],
  sunday: null,
};

const BASE_DRAFT = {
  patientName: "Nathan Ashdown",
  patientPhone: "+447700900123",
  patientEmail: "nathan@example.com",
  requestedService: "implant",
  requestedDate: "2026-08-19",
  requestedTime: "14:00",
};

function amend(message: string, draft: AppointmentDraftLike = BASE_DRAFT, now = FIXED_NOW) {
  return applyConfirmationAmendment({
    message,
    locale: "en",
    draft,
    clinicTimeZone: CLINIC_TZ,
    now,
    workingHours: IDA_HOURS,
  });
}

describe("SlotExtractor time parsing for confirmation amendments", () => {
  it.each([
    ["Could I do 12pm please", "12:00"],
    ["12 pm", "12:00"],
    ["12:00", "12:00"],
    ["noon", "12:00"],
    ["12:00 PM", "12:00"],
    ["9am", "09:00"],
  ])("parses %j → %s", (raw, expected) => {
    const res = SlotExtractor.parseTime(raw, raw.toLowerCase());
    expect(res?.time).toBe(expected);
  });
});

describe("Intent at confirmation is not yes/no-only", () => {
  function classify(message: string) {
    return IntentRouter.classifyConversationIntent({
      message,
      currentState: "APPOINTMENT_REVIEW",
      expectedSlot: "confirmation",
      locale: "en",
      collectedSlots: {
        fullName: BASE_DRAFT.patientName,
        phone: BASE_DRAFT.patientPhone,
        email: BASE_DRAFT.patientEmail,
        treatment: BASE_DRAFT.requestedService,
        preferredDate: BASE_DRAFT.requestedDate,
        preferredTime: BASE_DRAFT.requestedTime,
      },
    });
  }

  it("extracts 12pm as preferredTime instead of ignoring it", () => {
    const res = classify("Could I do 12pm please");
    expect(res.entities.preferredTime).toBe("12:00");
    expect(res.intent).not.toBe("appointment_confirmation");
  });

  it("still routes yes to appointment_confirmation", () => {
    expect(classify("yes").intent).toBe("appointment_confirmation");
  });

  it("still routes no/cancel-style rejection away from confirmation", () => {
    const res = classify("no");
    expect(["rejection", "cancel"].includes(res.intent)).toBe(true);
  });

  it("routes a doctor question as an interruption, not a submit", () => {
    const res = classify("Which doctor will see me?");
    expect(res.intent).toBe("doctor_information");
    expect(res.isInterruption).toBe(true);
  });
});

describe("Appointment confirmation amendment invariant", () => {
  it("1. change time at confirmation → 12:00, other fields intact, reconfirm", () => {
    const res = amend("Could I do 12pm please");
    expect(res.outcome).toBe("applied");
    expect(res.nextDraft.requestedTime).toBe("12:00");
    expect(res.nextDraft.requestedDate).toBe("2026-08-19");
    expect(res.nextDraft.patientName).toBe(BASE_DRAFT.patientName);
    expect(res.nextDraft.patientPhone).toBe(BASE_DRAFT.patientPhone);
    expect(res.nextDraft.patientEmail).toBe(BASE_DRAFT.patientEmail);
    expect(res.nextDraft.requestedService).toBe("implant");
    expect(res.amendedFields).toEqual(["preferredTime"]);
    const review = buildAppointmentReviewMessage({
      locale: "en",
      appointmentData: res.nextDraft,
      clinicName: "İstanbul Diş Akademisi",
    });
    expect(review).toMatch(/12:00|12:00 PM|noon/i);
    expect(review).toMatch(/submit this preliminary appointment request/i);
  });

  it("2. change date at confirmation, preserve contact and treatment", () => {
    const res = amend("Could we do August 20 instead");
    expect(res.outcome).toBe("applied");
    expect(res.nextDraft.requestedDate).toBe("2026-08-20");
    expect(res.nextDraft.requestedTime).toBe("14:00");
    expect(res.nextDraft.patientEmail).toBe(BASE_DRAFT.patientEmail);
    expect(res.nextDraft.requestedService).toBe("implant");
  });

  it("3. change both date and time", () => {
    const res = amend("August 20 at 12pm please");
    expect(res.outcome).toBe("applied");
    expect(res.nextDraft.requestedDate).toBe("2026-08-20");
    expect(res.nextDraft.requestedTime).toBe("12:00");
  });

  it("4. 12pm / 12 pm / 12:00 / noon all map to 12:00", () => {
    for (const msg of ["12pm", "12 pm", "12:00", "noon"]) {
      const res = amend(`Could I do ${msg} please`);
      expect(res.outcome, msg).toBe("applied");
      expect(res.nextDraft.requestedTime, msg).toBe("12:00");
    }
  });

  it("5. past time today is rejected; original draft intact", () => {
    const todayDraft = { ...BASE_DRAFT, requestedDate: "2026-08-19", requestedTime: "14:00" };
    const res = amend("Could I do 8am please", todayDraft, FIXED_NOW);
    expect(res.outcome).toBe("invalid");
    expect(res.validationReason).toBe("PAST_TIME");
    expect(res.nextDraft.requestedTime).toBe("14:00");
    expect(res.nextDraft.patientName).toBe(BASE_DRAFT.patientName);
    expect(res.message).toBeTruthy();
  });

  it("6. closed-hours time is rejected", () => {
    const res = amend("Could I do 8pm please");
    expect(res.outcome).toBe("invalid");
    expect(res.validationReason).toBe("OUTSIDE_WORKING_HOURS");
    expect(res.nextDraft.requestedTime).toBe("14:00");
  });

  it("7. closed day is rejected", () => {
    const res = amend("Could we do Sunday August 23 instead");
    expect(res.outcome).toBe("invalid");
    expect(res.validationReason).toBe("CLOSED_DAY");
    expect(res.nextDraft.requestedDate).toBe("2026-08-19");
  });

  it("8. date change preserves treatment and contact", () => {
    const res = amend("Please change the date to August 21");
    expect(res.outcome).toBe("applied");
    expect(res.nextDraft.requestedDate).toBe("2026-08-21");
    expect(res.nextDraft.requestedService).toBe("implant");
    expect(res.nextDraft.patientPhone).toBe(BASE_DRAFT.patientPhone);
    expect(res.nextDraft.patientEmail).toBe(BASE_DRAFT.patientEmail);
    expect(res.nextDraft.patientName).toBe(BASE_DRAFT.patientName);
  });

  it("9. change time then confirm still has updated time in draft", () => {
    const first = amend("Could I do 12pm please");
    expect(first.outcome).toBe("applied");
    const confirm = applyConfirmationAmendment({
      message: "yes",
      locale: "en",
      draft: first.nextDraft,
      clinicTimeZone: CLINIC_TZ,
      now: FIXED_NOW,
      workingHours: IDA_HOURS,
    });
    expect(confirm.outcome).toBe("none");
    expect(first.nextDraft.requestedTime).toBe("12:00");
  });

  it("10. multiple time changes before confirm keep the latest", () => {
    const first = amend("Could I do 12pm please");
    const second = amend("Actually make it 3pm", first.nextDraft);
    expect(second.outcome).toBe("applied");
    expect(second.nextDraft.requestedTime).toBe("15:00");
    expect(second.nextDraft.requestedDate).toBe("2026-08-19");
  });

  it("11. normal yes is not treated as an amendment", () => {
    expect(amend("yes").outcome).toBe("none");
  });

  it("12. normal no is not treated as an amendment", () => {
    expect(amend("no").outcome).toBe("none");
  });

  it("13. a question is not treated as an amendment (draft intact)", () => {
    const res = amend("Which doctor will perform the implant?");
    expect(res.outcome).toBe("none");
    expect(res.nextDraft.requestedTime).toBe("14:00");
  });

  it("14. email correction at confirmation", () => {
    const res = amend("Use nathan.updated@example.com instead");
    expect(res.outcome).toBe("applied");
    expect(res.nextDraft.patientEmail).toBe("nathan.updated@example.com");
    expect(res.nextDraft.requestedTime).toBe("14:00");
  });

  it("15. phone correction at confirmation", () => {
    const res = amend("My phone is +447700900999");
    expect(res.outcome).toBe("applied");
    expect(res.nextDraft.patientPhone).toMatch(/447700900999/);
    expect(res.nextDraft.requestedTime).toBe("14:00");
  });

  it("16. ambiguous non-datetime text is not a silent field wipe", () => {
    const res = amend("maybe something else");
    expect(res.outcome).toBe("none");
    expect(res.nextDraft).toEqual(BASE_DRAFT);
    expect(looksLikeDateTimeAmendment("maybe something else")).toBe(false);
  });
});

describe("Confirmation amendment persistence + Conversation Records", () => {
  type DocStore = Map<string, Record<string, unknown>>;

  function createMockFirestore() {
    const logs = new Map<string, { data: Record<string, unknown>; messages: DocStore }>();
    function ensureLog(clinicId: string, conversationId: string) {
      const key = `${clinicId}/${conversationId}`;
      if (!logs.has(key)) logs.set(key, { data: {}, messages: new Map() });
      return logs.get(key)!;
    }
    const adminDb = {
      collection: (name: string) => {
        if (name !== "clinics") throw new Error(name);
        return {
          doc: (clinicId: string) => ({
            collection: (sub: string) => {
              if (sub !== "conversationLogs") throw new Error(sub);
              return {
                doc: (conversationId: string) => {
                  const getLog = () => ensureLog(clinicId, conversationId);
                  return {
                    get: async () => {
                      const l = getLog();
                      const exists = Object.keys(l.data).length > 0 || l.messages.size > 0;
                      return { exists, data: () => ({ ...l.data }) };
                    },
                    set: async (data: Record<string, unknown>) => {
                      const l = getLog();
                      l.data = { ...l.data, ...data };
                    },
                    collection: (messagesName: string) => {
                      if (messagesName !== "messages") throw new Error(messagesName);
                      return {
                        doc: (docId: string) => {
                          const ref = {
                            __write: (data: Record<string, unknown>) => {
                              const l = getLog();
                              const prior = l.messages.get(docId) || {};
                              l.messages.set(docId, { ...prior, ...data });
                            },
                            set: async (data: Record<string, unknown>) => {
                              const l = getLog();
                              const prior = l.messages.get(docId) || {};
                              l.messages.set(docId, { ...prior, ...data });
                            },
                            get: async () => {
                              const l = getLog();
                              const data = l.messages.get(docId);
                              return {
                                exists: Boolean(data),
                                id: docId,
                                data: () => (data ? { ...data } : undefined),
                              };
                            },
                          };
                          return ref;
                        },
                        get: async () => {
                          const l = getLog();
                          const docs = [...l.messages.entries()].map(([id, data]) => ({
                            id,
                            data: () => ({ ...data }),
                          }));
                          return { docs, size: docs.length };
                        },
                      };
                    },
                  };
                },
              };
            },
          }),
        };
      },
      batch: () => {
        const ops: Array<() => void> = [];
        return {
          set: (
            ref: { __write?: (data: Record<string, unknown>) => void; set?: (data: Record<string, unknown>) => Promise<void> },
            data: Record<string, unknown>
          ) => {
            ops.push(() => {
              if (typeof ref.__write === "function") ref.__write(data);
              else if (typeof ref.set === "function") void ref.set(data);
            });
          },
          commit: async () => {
            for (const op of ops) op();
          },
        };
      },
    };
    return { adminDb: adminDb as any, logs };
  }

  it("17–19. user amendment + assistant review are both persisted", async () => {
    const { adminDb: db, logs } = createMockFirestore();
    const amendment = amend("Could I do 12pm please");
    const review = buildAppointmentReviewMessage({
      locale: "en",
      appointmentData: amendment.nextDraft,
      clinicName: "İstanbul Diş Akademisi",
    });
    const result = await persistVisibleChatTurn(db, {
      clinicId: "istanbul-dis-akademisi",
      conversationId: "conv_confirm_amend",
      userMessage: "Could I do 12pm please",
      assistantMessage: review,
      history: [
        { role: "assistant", content: "Would you like me to submit this preliminary appointment request to the clinic for review?" },
      ],
    });
    expect(result.persistedAssistant).toBe(true);
    expect(result.messageCount).toBeGreaterThanOrEqual(2);
    const stored = [...logs.values()][0].messages;
    const roles = [...stored.values()].map((m) => String(m.sender || m.role));
    const contents = [...stored.values()].map((m) => String(m.content || ""));
    expect(contents.some((c) => /12pm please/i.test(c))).toBe(true);
    expect(contents.some((c) => /12:00/i.test(c) && /submit/i.test(c))).toBe(true);
    expect(roles.some((r) => r === "patient" || r === "user")).toBe(true);
    expect(roles.some((r) => r === "assistant")).toBe(true);
  });

  it("20. submission assistant reply is persisted (history includes final turn)", async () => {
    const { adminDb: db, logs } = createMockFirestore();
    await persistVisibleChatTurn(db, {
      clinicId: "istanbul-dis-akademisi",
      conversationId: "conv_submit",
      userMessage: "yes",
      assistantMessage:
        "Thank you. Your preliminary appointment request has been submitted to İstanbul Diş Akademisi.",
    });
    const messages = [...[...logs.values()][0].messages.values()];
    expect(messages.some((m) => String(m.content).includes("submitted"))).toBe(true);
  });

  it("21. failure path records an explicit assistant outcome", async () => {
    const { adminDb: db } = createMockFirestore();
    const result = await persistVisibleChatTurn(db, {
      clinicId: "istanbul-dis-akademisi",
      conversationId: "conv_fail",
      userMessage: "Could I do 8pm please",
      assistantMessage: "That time is outside clinic working hours. Please choose another time.",
    });
    expect(result.persistedAssistant).toBe(true);
  });

  it("22–24. Conversation Records merge keeps the final assistant and chronological order", () => {
    const merged = mergeConversationTranscriptSources({
      canonicalMessages: [
        { id: "u1", sender: "patient", content: "Could I do 12pm please", createdAt: "2026-08-19T07:41:00.000Z" },
        {
          id: "a1",
          sender: "assistant",
          content: "Of course. Preferred time is now 12:00. Shall I submit this request?",
          createdAt: "2026-08-19T07:41:02.000Z",
        },
      ],
    });
    expect(merged).toHaveLength(2);
    expect(merged[1].role).toBe("assistant");
    expect(merged[1].content).toMatch(/12:00/);
    const sorted = sortCanonicalMessages(merged);
    expect(sorted[sorted.length - 1].role).toBe("assistant");
    expect(sorted[sorted.length - 1].id).toBe("a1");
  });
});

describe("Chat route confirmation amendment wiring", () => {
  const chat = readFileSync(resolve(REPO, "app/api/public/chat/route.ts"), "utf8");

  it("uses applyConfirmationAmendment before LLM on AWAITING_CONFIRMATION", () => {
    expect(chat).toContain("applyConfirmationAmendment");
    expect(chat).toContain("APPT_CONFIRMATION_AMENDMENT");
    expect(chat).toContain("isAwaitingConfirmation && adminDb");
  });

  it("empty LLM content falls back so the assistant turn can persist", () => {
    expect(chat).toMatch(/completion\.content\?\.trim\(\)\s*\|\|/);
  });

  it("amendment replies go through respondWithVisibleReply", () => {
    expect(chat).toMatch(/amendment\.outcome === "applied"[\s\S]{0,800}respondWithVisibleReply/);
  });
});
