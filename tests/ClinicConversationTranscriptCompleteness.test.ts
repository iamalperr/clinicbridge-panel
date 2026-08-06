import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildTurnsFromClientHistory,
  conversationMessageFingerprint,
  countVisibleConversationMessages,
  mergeConversationTranscriptSources,
  normalizeConversationMessageRole,
  sortCanonicalMessages,
  stableHistoryMessageDocId,
} from "../lib/services/conversations/conversationTranscript";

const REPO = resolve(__dirname, "..");

function fourteenTurnFixture() {
  const turns: Array<{ id: string; sender: string; content: string; createdAt: string }> = [];
  for (let i = 0; i < 7; i++) {
    turns.push({
      id: `u${i}`,
      sender: "patient",
      content: `User message ${i + 1}`,
      createdAt: new Date(1_700_000_000_000 + i * 2).toISOString(),
    });
    turns.push({
      id: `a${i}`,
      sender: "assistant",
      content: `Assistant reply ${i + 1}`,
      createdAt: new Date(1_700_000_000_000 + i * 2 + 1).toISOString(),
    });
  }
  return turns;
}

describe("Clinic conversation transcript completeness", () => {
  it("1. 14 stored visible messages → count 14 and chronological order", () => {
    const raw = fourteenTurnFixture();
    const merged = mergeConversationTranscriptSources({
      canonicalMessages: raw,
    });
    expect(countVisibleConversationMessages(merged)).toBe(14);
    expect(merged[0].content).toBe("User message 1");
    expect(merged[13].content).toBe("Assistant reply 7");
    for (let i = 1; i < merged.length; i++) {
      const prev = Date.parse(merged[i - 1].createdAt || "") || 0;
      const cur = Date.parse(merged[i].createdAt || "") || 0;
      expect(cur).toBeGreaterThanOrEqual(prev);
    }
  });

  it("2. current message-subcollection schema returns all turns", () => {
    const merged = mergeConversationTranscriptSources({
      canonicalMessages: [
        { id: "1", sender: "patient", content: "Merhaba", createdAt: "2026-01-01T10:00:00.000Z" },
        { id: "2", sender: "assistant", content: "Size nasıl yardımcı olabilirim?", createdAt: "2026-01-01T10:00:01.000Z" },
      ],
    });
    expect(merged).toHaveLength(2);
    expect(merged[0].role).toBe("user");
    expect(merged[1].role).toBe("assistant");
  });

  it("3. legacy full messages-array schema returns all turns", () => {
    const merged = mergeConversationTranscriptSources({
      fullMessagesArray: [
        { role: "user", content: "A", createdAt: "2026-01-01T10:00:00.000Z" },
        { role: "assistant", content: "B", createdAt: "2026-01-01T10:00:01.000Z" },
        { role: "user", content: "C", createdAt: "2026-01-01T10:00:02.000Z" },
      ],
    });
    expect(merged.map((m) => m.content)).toEqual(["A", "B", "C"]);
  });

  it("4. legacy last-message-only fallback does not invent a larger count", () => {
    const merged = mergeConversationTranscriptSources({
      summaryFallbackMessages: [
        { sender: "patient", content: "Only preview", createdAt: "2026-01-01T10:00:00.000Z" },
      ],
    });
    expect(merged).toHaveLength(1);
    expect(countVisibleConversationMessages(merged)).toBe(1);
  });

  it("5. duplicate summary + full source removes duplicates", () => {
    const merged = mergeConversationTranscriptSources({
      canonicalMessages: [
        { sender: "patient", content: "Hello", createdAt: "2026-01-01T10:00:00.000Z" },
        { sender: "assistant", content: "Hi there", createdAt: "2026-01-01T10:00:01.000Z" },
      ],
      summaryFallbackMessages: [
        { sender: "patient", content: "Hello", createdAt: "2026-01-01T10:00:00.000Z" },
      ],
      legacyTurnMessages: [
        { role: "user", content: "Hello", createdAt: "2026-01-01T10:00:00.000Z" },
      ],
    });
    expect(merged).toHaveLength(2);
  });

  it("6. equal timestamps keep deterministic stable order", () => {
    const ts = "2026-01-01T10:00:00.000Z";
    const merged = sortCanonicalMessages(
      mergeConversationTranscriptSources({
        canonicalMessages: [
          { id: "b", sender: "assistant", content: "Second", createdAt: ts, sequence: 1 },
          { id: "a", sender: "patient", content: "First", createdAt: ts, sequence: 0 },
        ],
      })
    );
    expect(merged.map((m) => m.content)).toEqual(["First", "Second"]);
  });

  it("7. role aliases normalize correctly", () => {
    expect(normalizeConversationMessageRole("patient")).toBe("user");
    expect(normalizeConversationMessageRole("bot")).toBe("assistant");
    expect(normalizeConversationMessageRole("ai")).toBe("assistant");
    expect(normalizeConversationMessageRole("visitor")).toBe("user");
    const merged = mergeConversationTranscriptSources({
      legacyTurnMessages: [
        { role: "patient", content: "X", createdAt: "2026-01-01T10:00:00.000Z" },
        { role: "bot", content: "Y", createdAt: "2026-01-01T10:00:01.000Z" },
      ],
    });
    expect(merged[0].role).toBe("user");
    expect(merged[1].role).toBe("assistant");
    expect(merged[0].sender).toBe("patient");
  });

  it("8. empty content excluded from visible count", () => {
    const merged = mergeConversationTranscriptSources({
      canonicalMessages: [
        { sender: "patient", content: "Ok", createdAt: "2026-01-01T10:00:00.000Z" },
        { sender: "assistant", content: "   ", createdAt: "2026-01-01T10:00:01.000Z" },
      ],
    });
    expect(countVisibleConversationMessages(merged)).toBe(1);
  });

  it("9. tenant isolation enforced by messages API auth", () => {
    const route = readFileSync(
      resolve(REPO, "app/api/clinics/[clinicId]/conversations/[conversationId]/messages/route.ts"),
      "utf8"
    );
    expect(route).toContain("requireClinicAccess");
    expect(route).toContain("AuthError");
  });

  it("10. modal renders full history — no last-two slicing; scroll container exists", () => {
    const modal = readFileSync(
      resolve(REPO, "components/clinic/logs/ConversationLogDetailModal.tsx"),
      "utf8"
    );
    expect(modal).not.toMatch(/\.slice\(\s*-?\s*2\s*\)/);
    expect(modal).not.toMatch(/lastMessages|takeLast|limit\(2\)/);
    expect(modal).toContain("data-testid=\"conversation-detail-scroll\"");
    expect(modal).toContain("/messages");
    expect(modal).toContain("overflowY");
    expect(modal).toMatch(/setError|error \?/);
  });

  it("11. 14-count cannot result from displaying only two without recovery path", () => {
    // History sync + merge path must exist so a final logged turn materializes prior turns.
    const chat = readFileSync(resolve(REPO, "app/api/public/chat/route.ts"), "utf8");
    expect(chat).toContain("syncConversationLogMessagesFromHistory");
    expect(chat).toContain("respondWithVisibleReply");
    expect(chat).toContain("history,");
    const turns = buildTurnsFromClientHistory({
      history: [
        { role: "user", content: "1" },
        { role: "assistant", content: "2" },
        { role: "user", content: "3" },
        { role: "assistant", content: "4" },
      ],
      userMessage: "5",
      aiReply: "6",
    });
    expect(turns).toHaveLength(6);
  });

  it("12. status/conversion metric modules untouched by transcript merge", () => {
    const resolver = readFileSync(
      resolve(REPO, "lib/services/conversations/conversationStatusResolver.ts"),
      "utf8"
    );
    expect(resolver).not.toContain("conversationTranscript");
    expect(resolver).not.toContain("mergeConversationTranscriptSources");
  });

  it("stable history ids are content-based (sequence does not change id)", () => {
    const a = stableHistoryMessageDocId("user", "Hello world", 0);
    const b = stableHistoryMessageDocId("user", "Hello world", 99);
    const c = stableHistoryMessageDocId("assistant", "Hello world", 0);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(conversationMessageFingerprint("user", "Hello")).toBe(
      conversationMessageFingerprint("user", " hello ")
    );
  });

  it("list UI still shows totalMessages field (reconciled by detail API)", () => {
    const tab = readFileSync(
      resolve(REPO, "components/clinic/logs/ConversationLogsTab.tsx"),
      "utf8"
    );
    expect(tab).toContain("totalMessages");
  });
});
