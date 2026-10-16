/**
 * Regression: clinic conversation list showed "Invalid Date" when createdAt was missing.
 *
 * Root cause: saveAppointmentState created conversationLogs shells without createdAt;
 * logConversation only stamped createdAt when `!existing`, so the field was never backfilled.
 * UI used `new Date(log.createdAt)` → Invalid Date.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatConversationListDate,
  normalizeTimestamp,
  normalizeTimestampIso,
  normalizeTimestampMs,
  resolveConversationTimestamp,
} from "@/lib/datetime/normalizeTimestamp";
import { exportConversationLogsToCSV } from "@/lib/services/conversations/conversationStatusResolver";
import { parseMillis } from "@/lib/services/analyticsService";
import { parseLogCreatedAt } from "@/lib/services/weeklyClinicReport/weekRange";

describe("normalizeTimestamp — shapes that exist in ClinicBridge", () => {
  const ISO = "2026-10-14T20:59:00.000Z";
  const MS = Date.parse(ISO);

  it("ISO string", () => {
    expect(normalizeTimestampIso(ISO)).toBe(ISO);
    expect(normalizeTimestamp(ISO)?.getTime()).toBe(MS);
  });

  it("epoch milliseconds and seconds", () => {
    expect(normalizeTimestampMs(MS)).toBe(MS);
    expect(normalizeTimestampMs(MS / 1000)).toBe(MS);
  });

  it("JS Date", () => {
    expect(normalizeTimestamp(new Date(MS))?.toISOString()).toBe(ISO);
  });

  it("Firestore Timestamp-like with toMillis / toDate", () => {
    expect(
      normalizeTimestampMs({
        toMillis: () => MS,
      })
    ).toBe(MS);
    expect(
      normalizeTimestampMs({
        toDate: () => new Date(MS),
      })
    ).toBe(MS);
  });

  it("plain { seconds, nanoseconds } (client Timestamp spread)", () => {
    expect(normalizeTimestampMs({ seconds: Math.floor(MS / 1000), nanoseconds: 0 })).toBe(
      Math.floor(MS / 1000) * 1000
    );
  });

  it("plain { _seconds, _nanoseconds } (admin JSON serializers)", () => {
    expect(normalizeTimestampMs({ _seconds: Math.floor(MS / 1000), _nanoseconds: 0 })).toBe(
      Math.floor(MS / 1000) * 1000
    );
  });

  it("null / undefined / malformed → null (never invents now)", () => {
    expect(normalizeTimestamp(null)).toBeNull();
    expect(normalizeTimestamp(undefined)).toBeNull();
    expect(normalizeTimestamp("")).toBeNull();
    expect(normalizeTimestamp("not-a-date")).toBeNull();
    expect(normalizeTimestamp({ foo: 1 })).toBeNull();
    expect(normalizeTimestamp(new Date(Number.NaN))).toBeNull();
  });

  it("reproduces the production Invalid Date case: missing createdAt", () => {
    const broken = { status: "collecting", updatedAt: ISO } as { createdAt?: unknown; updatedAt?: unknown };
    expect(Number.isNaN(new Date((broken as { createdAt?: unknown }).createdAt as any).getTime())).toBe(true);
    expect(String(new Date((broken as any).createdAt))).toBe("Invalid Date");
    expect(resolveConversationTimestamp(broken)?.toISOString()).toBe(ISO);
    expect(formatConversationListDate(broken, "tr-TR")).not.toMatch(/Invalid Date/i);
  });

  it("appointment-converted log with only updatedAt sorts chronologically", () => {
    const a = resolveConversationTimestamp({ updatedAt: "2026-10-13T15:00:00.000Z" })!;
    const b = resolveConversationTimestamp({ createdAt: "2026-10-14T15:00:00.000Z" })!;
    expect(a.getTime()).toBeLessThan(b.getTime());
  });
});

describe("legacy parsers delegate to the canonical normalizer", () => {
  it("parseMillis matches normalizeTimestampMs", () => {
    const plain = { seconds: 1_700_000_000, nanoseconds: 0 };
    expect(parseMillis(plain)).toBe(normalizeTimestampMs(plain));
    expect(parseMillis({ _seconds: 1_700_000_000 })).toBe(normalizeTimestampMs({ _seconds: 1_700_000_000 }));
  });

  it("parseLogCreatedAt returns ISO or null", () => {
    expect(parseLogCreatedAt("2026-10-14T20:59:00.000Z")).toBe("2026-10-14T20:59:00.000Z");
    expect(parseLogCreatedAt({ toDate: () => new Date("2026-10-14T20:59:00.000Z") })).toBe(
      "2026-10-14T20:59:00.000Z"
    );
    expect(parseLogCreatedAt(undefined)).toBeNull();
  });
});

describe("CSV export never emits Invalid Date", () => {
  it("missing createdAt falls back to updatedAt", () => {
    const csv = exportConversationLogsToCSV(
      [
        {
          id: "conv_missing_created",
          status: "collecting",
          updatedAt: "2026-10-13T15:00:00.000Z",
          totalMessages: 4,
          lastMessagePreview: "…",
        },
        {
          id: "conv_ok",
          status: "answered",
          createdAt: "2026-10-14T12:00:00.000Z",
          totalMessages: 2,
        },
      ],
      "tr"
    );
    expect(csv).not.toMatch(/Invalid Date/i);
    expect(csv).not.toMatch(/\[object Object\]/i);
    expect(csv).toMatch(/13\.10\.2026|13\/10\/2026|2026|13/);
  });

  it("unrecoverable timestamp stays as dash, not invented now", () => {
    const before = Date.now();
    const csv = exportConversationLogsToCSV(
      [{ id: "conv_empty", status: "open", totalMessages: 0 }],
      "tr"
    );
    const after = Date.now();
    expect(csv).toContain("-");
    expect(csv).not.toMatch(/Invalid Date/i);
    // Must not embed "now" as a false historical date for this row.
    const today = new Date().toISOString().slice(0, 10);
    const row = csv.split("\n").find((l) => l.includes("conv_empty")) || "";
    expect(row.includes(today)).toBe(false);
    expect(after).toBeGreaterThanOrEqual(before);
  });
});

describe("saveAppointmentState write-path stamps createdAt on first create", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("create path writes ISO createdAt; merge path does not invent a second createdAt", async () => {
    let stored: Record<string, unknown> = {};
    const logRef = {
      create: vi.fn(async (data: Record<string, unknown>) => {
        if (Object.keys(stored).length > 0) {
          throw Object.assign(new Error("ALREADY_EXISTS"), { code: 6 });
        }
        stored = { ...data };
      }),
      set: vi.fn(async (data: Record<string, unknown>) => {
        stored = { ...stored, ...data };
      }),
    };
    const adminDb = {
      collection: () => ({
        doc: () => ({
          collection: () => ({
            doc: () => logRef,
          }),
        }),
      }),
    };

    const { saveAppointmentState } = await import("@/lib/agent/persistence");
    await saveAppointmentState(adminDb, "clinic_a", "conv_a", 0, "COLLECTING_NAME", {
      requestedService: "İmplant",
    } as any);

    expect(logRef.create).toHaveBeenCalled();
    expect(typeof stored.createdAt).toBe("string");
    expect(stored.createdAt as string).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof stored.updatedAt).toBe("string");
    const firstCreated = stored.createdAt;

    await saveAppointmentState(adminDb, "clinic_a", "conv_a", 0, "COLLECTING_PHONE", {
      requestedService: "İmplant",
      patientName: "Test",
    } as any);

    expect(logRef.set).toHaveBeenCalled();
    expect(stored.createdAt).toBe(firstCreated);
    expect(stored.appointmentState).toBe("COLLECTING_PHONE");
  });
});

describe("logConversation backfills createdAt when an appointment shell exists without it", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("@/lib/firebase-admin");
    vi.doUnmock("@/lib/services/conversations/conversationTranscriptService");
  });

  it("uses existing.updatedAt when createdAt was never written", async () => {
    let stored: Record<string, unknown> = {
      appointmentState: "COLLECTING_NAME",
      updatedAt: "2026-10-10T10:00:00.000Z",
      status: "collecting",
    };

    vi.doMock("@/lib/firebase-admin", () => ({
      getAdminDb: () => ({
        collection: () => ({
          doc: () => ({
            collection: () => ({
              doc: () => ({
                get: async () => ({
                  exists: true,
                  data: () => ({ ...stored }),
                }),
                set: async (data: Record<string, unknown>) => {
                  stored = { ...stored, ...data };
                },
                create: async () => {
                  throw Object.assign(new Error("ALREADY_EXISTS"), { code: 6 });
                },
              }),
            }),
          }),
        }),
      }),
    }));
    vi.doMock("@/lib/services/conversations/conversationTranscriptService", () => ({
      syncConversationLogMessagesFromHistory: vi.fn(async () => 2),
      commitConversationLogTurnInSingleBatch: vi.fn(async () => ({ committed: false, reason: "TOO_MANY_WRITES" })),
    }));

    const { logConversation } = await import("@/lib/agent/persistence");
    await logConversation({
      clinicId: "clinic_a",
      convId: "conv_shell",
      userMessage: "Adım Test",
      aiReply: "Telefon numaranızı paylaşır mısınız?",
      historyLength: 0,
      history: [],
      appointmentState: "COLLECTING_PHONE",
    });

    expect(stored.createdAt).toBe("2026-10-10T10:00:00.000Z");
    expect(String(new Date(stored.createdAt as string))).not.toMatch(/Invalid Date/i);
  });
});
