import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildTurnsFromClientHistory,
  countVisibleConversationMessages,
  mergeConversationTranscriptSources,
  normalizeConversationMessageRole,
  sortCanonicalMessages,
  stableHistoryMessageDocId,
  visibleTurnIdempotencyKey,
} from "../lib/services/conversations/conversationTranscript";
import {
  persistVisibleChatTurn,
  syncConversationLogMessagesFromHistory,
} from "../lib/services/conversations/conversationTranscriptService";

const REPO = resolve(__dirname, "..");

/** İstanbul Diş Akademisi–style multi-step appointment intake fixture. */
function istanbulDisAkademisiAppointmentSequence() {
  return [
    { role: "user" as const, content: "Book an appointment" },
    {
      role: "assistant" as const,
      content: "I'd be happy to help you book. Which treatment are you interested in?",
    },
    { role: "user" as const, content: "Implants and crowns" },
    {
      role: "assistant" as const,
      content: "Got it. Which one would you like to schedule first — implant or crown?",
    },
    { role: "user" as const, content: "Implant" },
    {
      role: "assistant" as const,
      content: "When would you like to come in? Please share a preferred date and time.",
    },
    { role: "user" as const, content: "August 6th 2:00pm EST" },
    {
      role: "assistant" as const,
      content: "Thank you. May I have your full name?",
    },
    { role: "user" as const, content: "Jane Doe" },
    {
      role: "assistant" as const,
      content: "And your phone number?",
    },
    { role: "user" as const, content: "+1 555 0100" },
    {
      role: "assistant" as const,
      content: "Please share your email address.",
    },
    { role: "user" as const, content: "jane@example.com" },
    {
      role: "assistant" as const,
      content:
        "Please confirm: Implant appointment on August 6 at 2:00pm. Name Jane Doe. Shall I submit this request?",
    },
    { role: "user" as const, content: "Yes please" },
    {
      role: "assistant" as const,
      content:
        "Thank you. Your preliminary appointment request has been submitted to İstanbul Diş Akademisi.",
    },
  ];
}

type DocStore = Map<string, Record<string, unknown>>;

function createMockFirestore() {
  const logs = new Map<string, { data: Record<string, unknown>; messages: DocStore }>();

  function ensureLog(clinicId: string, conversationId: string) {
    const key = `${clinicId}/${conversationId}`;
    if (!logs.has(key)) {
      logs.set(key, { data: {}, messages: new Map() });
    }
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
                const logRef = {
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
                        const ref: {
                          __write: (data: Record<string, unknown>) => void;
                          set: (data: Record<string, unknown>) => Promise<void>;
                          get: () => Promise<{
                            exists: boolean;
                            id: string;
                            data: () => Record<string, unknown> | undefined;
                          }>;
                        } = {
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
                return logRef;
              },
            };
          },
        }),
      };
    },
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        set: (ref: { __write?: (data: Record<string, unknown>) => void; set?: (data: Record<string, unknown>) => Promise<void> }, data: Record<string, unknown>) => {
          ops.push(() => {
            if (typeof ref.__write === "function") ref.__write(data);
            else if (typeof ref.set === "function") {
              void ref.set(data);
            }
          });
        },
        commit: async () => {
          for (const op of ops) op();
        },
      };
    },
  };

  return { adminDb: adminDb as any, logs, ensureLog };
}

describe("Single-clinic visible turn persistence", () => {
  it("fixture: IDA multi-step appointment alternates and counts both roles", () => {
    const sequence = istanbulDisAkademisiAppointmentSequence();
    const merged = mergeConversationTranscriptSources({
      canonicalMessages: sequence.map((t, i) => ({
        id: stableHistoryMessageDocId(t.role, t.content, i),
        role: t.role,
        content: t.content,
        createdAt: new Date(1_700_000_000_000 + i).toISOString(),
        sequence: i,
      })),
    });
    expect(countVisibleConversationMessages(merged)).toBe(16);
    expect(merged.filter((m) => m.role === "user")).toHaveLength(8);
    expect(merged.filter((m) => m.role === "assistant")).toHaveLength(8);
    for (let i = 0; i < merged.length; i++) {
      expect(merged[i].content).toBe(sequence[i].content);
      expect(merged[i].role).toBe(sequence[i].role);
    }
  });

  it("buildTurnsFromClientHistory keeps every intake assistant question", () => {
    const sequence = istanbulDisAkademisiAppointmentSequence();
    const history = sequence.slice(0, -2);
    const lastUser = sequence[sequence.length - 2];
    const lastAsst = sequence[sequence.length - 1];
    const turns = buildTurnsFromClientHistory({
      history,
      userMessage: lastUser.content,
      aiReply: lastAsst.content,
    });
    expect(turns).toHaveLength(16);
    expect(turns.filter((t) => t.role === "assistant")).toHaveLength(8);
  });

  it("equal timestamps preserve stable order via sequence then id", () => {
    const ts = "2026-08-06T12:00:00.000Z";
    const merged = sortCanonicalMessages(
      mergeConversationTranscriptSources({
        canonicalMessages: [
          { id: "z", role: "assistant", content: "B", createdAt: ts, sequence: 1 },
          { id: "a", role: "user", content: "A", createdAt: ts, sequence: 0 },
        ],
      })
    );
    expect(merged.map((m) => m.content)).toEqual(["A", "B"]);
  });

  it("role aliases normalize for portal visibility", () => {
    expect(normalizeConversationMessageRole("patient")).toBe("user");
    expect(normalizeConversationMessageRole("bot")).toBe("assistant");
    expect(normalizeConversationMessageRole("ai")).toBe("assistant");
    const merged = mergeConversationTranscriptSources({
      canonicalMessages: [
        { sender: "patient", content: "Hi", createdAt: "2026-01-01T00:00:00.000Z" },
        { sender: "bot", content: "Hello", createdAt: "2026-01-01T00:00:01.000Z" },
      ],
    });
    expect(merged.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("retry uses same idempotency key for identical turn", () => {
    const k1 = visibleTurnIdempotencyKey({
      conversationId: "c1",
      userMessage: "Book an appointment",
      assistantMessage: "Which treatment?",
    });
    const k2 = visibleTurnIdempotencyKey({
      conversationId: "c1",
      userMessage: "Book an appointment",
      assistantMessage: "Which treatment?",
    });
    expect(k1).toBe(k2);
    expect(
      visibleTurnIdempotencyKey({
        conversationId: "c1",
        userMessage: "Book an appointment",
        assistantMessage: "Which treatment?",
        clientMessageId: "msg_abc",
      })
    ).toBe("turn_msg_abc");
  });

  it("persistVisibleChatTurn writes user+assistant once; retry does not duplicate", async () => {
    const { adminDb, ensureLog } = createMockFirestore();
    const clinicId = "istanbul-dis-akademisi";
    const conversationId = "conv_ida_1";

    const r1 = await persistVisibleChatTurn(adminDb, {
      clinicId,
      conversationId,
      userMessage: "Book an appointment",
      assistantMessage: "Which treatment are you interested in?",
      responseType: "appointment_information_required",
    });
    expect(r1.persistedAssistant).toBe(true);
    expect(r1.messageCount).toBe(2);

    const r2 = await persistVisibleChatTurn(adminDb, {
      clinicId,
      conversationId,
      userMessage: "Book an appointment",
      assistantMessage: "Which treatment are you interested in?",
      responseType: "appointment_information_required",
    });
    expect(r2.messageCount).toBe(2);

    const log = ensureLog(clinicId, conversationId);
    expect(log.messages.size).toBe(2);
  });

  it("multi-step persist accumulates all assistant intake questions", async () => {
    const { adminDb, ensureLog } = createMockFirestore();
    const clinicId = "clinic_a";
    const conversationId = "conv_multi";
    const sequence = istanbulDisAkademisiAppointmentSequence();

    let history: Array<{ role: string; content: string }> = [];
    for (let i = 0; i < sequence.length; i += 2) {
      const user = sequence[i];
      const asst = sequence[i + 1];
      await persistVisibleChatTurn(adminDb, {
        clinicId,
        conversationId,
        userMessage: user.content,
        assistantMessage: asst.content,
        history,
        responseType: i === sequence.length - 2 ? "appointment_created" : "CHAT_REPLY",
      });
      history = [...history, user, asst];
    }

    const log = ensureLog(clinicId, conversationId);
    expect(log.messages.size).toBe(16);
    expect(log.data.totalMessages).toBe(16);

    const roles = [...log.messages.values()].map((m) => m.role);
    expect(roles.filter((r) => r === "user")).toHaveLength(8);
    expect(roles.filter((r) => r === "assistant")).toHaveLength(8);
  });

  it("empty assistant reply is not persisted as a visible assistant turn", async () => {
    const { adminDb } = createMockFirestore();
    const r = await persistVisibleChatTurn(adminDb, {
      clinicId: "c",
      conversationId: "x",
      userMessage: "hi",
      assistantMessage: "",
    });
    expect(r.persistedAssistant).toBe(false);
  });

  it("validation / fallback / knowledge-style replies persist via sync helper", async () => {
    const { adminDb, ensureLog } = createMockFirestore();
    await syncConversationLogMessagesFromHistory(adminDb, {
      clinicId: "c1",
      conversationId: "k1",
      history: [],
      userMessage: "What is implant price?",
      aiReply: "Implant pricing depends on the case; our team will confirm after exam.",
    });
    await syncConversationLogMessagesFromHistory(adminDb, {
      clinicId: "c1",
      conversationId: "k1",
      history: [
        { role: "user", content: "What is implant price?" },
        {
          role: "assistant",
          content: "Implant pricing depends on the case; our team will confirm after exam.",
        },
      ],
      userMessage: "asdf",
      aiReply: "Üzgünüm, anlayamadım. Lütfen tekrar yazar mısınız?",
    });
    await syncConversationLogMessagesFromHistory(adminDb, {
      clinicId: "c1",
      conversationId: "k1",
      history: [],
      userMessage: "notanemail",
      aiReply: "Please enter a valid email address.",
    });

    const log = ensureLog("c1", "k1");
    const contents = [...log.messages.values()].map((m) => String(m.content));
    expect(contents).toContain(
      "Implant pricing depends on the case; our team will confirm after exam."
    );
    expect(contents).toContain("Üzgünüm, anlayamadım. Lütfen tekrar yazar mısınız?");
    expect(contents).toContain("Please enter a valid email address.");
  });

  it("tenant isolation: messages stay under clinic path", async () => {
    const { adminDb, ensureLog } = createMockFirestore();
    await persistVisibleChatTurn(adminDb, {
      clinicId: "clinic_a",
      conversationId: "shared_looking_id",
      userMessage: "A",
      assistantMessage: "Reply A",
    });
    await persistVisibleChatTurn(adminDb, {
      clinicId: "clinic_b",
      conversationId: "shared_looking_id",
      userMessage: "B",
      assistantMessage: "Reply B",
    });
    expect(ensureLog("clinic_a", "shared_looking_id").messages.size).toBe(2);
    expect(ensureLog("clinic_b", "shared_looking_id").messages.size).toBe(2);
    const aContents = [...ensureLog("clinic_a", "shared_looking_id").messages.values()].map(
      (m) => m.content
    );
    expect(aContents).not.toContain("Reply B");
  });

  it("list count equals detail visible count for full exchange", () => {
    const sequence = istanbulDisAkademisiAppointmentSequence();
    const detail = mergeConversationTranscriptSources({
      canonicalMessages: sequence.map((t, i) => ({
        id: `m${i}`,
        role: t.role,
        content: t.content,
        createdAt: new Date(1_700_000_000_000 + i).toISOString(),
      })),
    });
    const listTotalMessages = countVisibleConversationMessages(detail);
    expect(listTotalMessages).toBe(detail.length);
    expect(listTotalMessages).toBe(16);
  });

  it("chat route finalizes visible replies through respondWithVisibleReply", () => {
    const chat = readFileSync(resolve(REPO, "app/api/public/chat/route.ts"), "utf8");
    expect(chat).toContain("async function respondWithVisibleReply");
    // Critical early-return branches that previously skipped assistant logging
    expect(chat).toMatch(/appointment_information_required[\s\S]{0,200}basePersist/);
    expect(chat).toMatch(/appointment_date_clarification_required[\s\S]{0,200}basePersist/);
    expect(chat).toMatch(/appointment_creation_failed[\s\S]{0,200}basePersist/);
    expect(chat).toContain('reply: cancelReply');
    expect(chat).toContain("respondWithVisibleReply");
    // No Agency matching-chat coupling
    expect(chat).not.toContain("matching-chat");
  });

  it("widget does not fabricate appointment-success copy; logs after reply", () => {
    const widget = readFileSync(resolve(REPO, "public/widget.js"), "utf8");
    expect(widget).toContain("logMessage(text, reply)");
    expect(widget).toContain("chatHistory.slice(-40)");
    expect(widget).not.toMatch(/Your preliminary appointment request has been submitted/);
  });

  it("internal/system noise can be excluded from visible count when filtered", () => {
    const merged = mergeConversationTranscriptSources({
      canonicalMessages: [
        { role: "user", content: "Hi", createdAt: "2026-01-01T00:00:00.000Z" },
        { role: "assistant", content: "Hello", createdAt: "2026-01-01T00:00:01.000Z" },
        {
          role: "system",
          content: "INTERNAL_TOOL_TRACE",
          createdAt: "2026-01-01T00:00:02.000Z",
        },
      ],
      includeSystem: false,
    });
    expect(merged.map((m) => m.role)).toEqual(["user", "assistant"]);
  });
});
