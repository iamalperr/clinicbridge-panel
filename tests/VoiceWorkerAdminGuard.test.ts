import { afterEach, describe, expect, it, vi } from "vitest";

const { getAdminDbMock } = vi.hoisted(() => ({ getAdminDbMock: vi.fn() }));

vi.mock("@/lib/firebase-admin", () => ({ getAdminDb: getAdminDbMock }));

import {
  assertVoiceWorkerAdminDb,
  VoiceWorkerStartupError,
} from "@/workers/voice/src/adminGuard";

const FAKE_SECRET = "-----BEGIN PRIVATE KEY-----\nMIIEfakeSECRETvalue\n-----END PRIVATE KEY-----";
const FAKE_EMAIL = "worker@fake-project.iam.gserviceaccount.com";

function firestoreLike() {
  return { collection: vi.fn(), runTransaction: vi.fn() };
}

function captureConsole() {
  const lines: string[] = [];
  const record = (...args: unknown[]) => {
    lines.push(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message} ${a.stack ?? ""}` : String(a))).join(" "));
  };
  const spies = [
    vi.spyOn(console, "error").mockImplementation(record),
    vi.spyOn(console, "warn").mockImplementation(record),
    vi.spyOn(console, "log").mockImplementation(record),
  ];
  return { lines, restore: () => spies.forEach((s) => s.mockRestore()) };
}

function expectNoSecrets(text: string) {
  expect(text).not.toContain("PRIVATE KEY");
  expect(text).not.toContain("SECRETvalue");
  expect(text).not.toContain(FAKE_EMAIL);
}

afterEach(() => {
  getAdminDbMock.mockReset();
  vi.restoreAllMocks();
});

describe("assertVoiceWorkerAdminDb", () => {
  it("A. returns the handle from the existing getAdminDb (default wiring)", () => {
    const db = firestoreLike();
    getAdminDbMock.mockReturnValue(db);
    expect(assertVoiceWorkerAdminDb()).toBe(db);
    expect(getAdminDbMock).toHaveBeenCalledTimes(1);
  });

  it("A2. injected getAdminDb takes precedence over the module default", () => {
    const db = firestoreLike();
    const injected = vi.fn(() => db as never);
    expect(assertVoiceWorkerAdminDb({ getAdminDb: injected })).toBe(db);
    expect(getAdminDbMock).not.toHaveBeenCalled();
  });

  it("B. null → fails loudly with ADMIN_DB_UNAVAILABLE", () => {
    getAdminDbMock.mockReturnValue(null);
    let caught: unknown;
    try {
      assertVoiceWorkerAdminDb();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(VoiceWorkerStartupError);
    expect((caught as VoiceWorkerStartupError).code).toBe("ADMIN_DB_UNAVAILABLE");
    expect((caught as Error).message).toMatch(/startup aborted/i);
  });

  it("B2. undefined → ADMIN_DB_UNAVAILABLE", () => {
    getAdminDbMock.mockReturnValue(undefined);
    expect(() => assertVoiceWorkerAdminDb()).toThrow(expect.objectContaining({ code: "ADMIN_DB_UNAVAILABLE" }));
  });

  it("B3. non-Firestore handle → ADMIN_DB_INVALID", () => {
    getAdminDbMock.mockReturnValue({ collection: () => null });
    expect(() => assertVoiceWorkerAdminDb()).toThrow(expect.objectContaining({ code: "ADMIN_DB_INVALID" }));
  });

  it("C. thrown initialization error → safe startup failure without secret leakage", () => {
    const secretError = Object.assign(new Error(`cert parse failed near ${FAKE_SECRET} for ${FAKE_EMAIL}`), {
      code: "app/invalid-credential",
    });
    getAdminDbMock.mockImplementation(() => {
      throw secretError;
    });
    const consoleCapture = captureConsole();
    let caught: unknown;
    try {
      assertVoiceWorkerAdminDb();
    } catch (err) {
      caught = err;
    } finally {
      consoleCapture.restore();
    }
    expect(caught).toBeInstanceOf(VoiceWorkerStartupError);
    const startupError = caught as VoiceWorkerStartupError;
    expect(startupError.code).toBe("ADMIN_DB_INIT_THROWN");
    expect(startupError.cause).toBeUndefined();
    expectNoSecrets(`${startupError.message} ${startupError.stack ?? ""} ${JSON.stringify(startupError)}`);
    expectNoSecrets(consoleCapture.lines.join("\n"));
  });

  it("C2. firebase-admin's own error logging is sanitized during the guarded call", () => {
    getAdminDbMock.mockImplementation(() => {
      const parseError = new SyntaxError(`Unexpected token in JSON: "private_key":"${FAKE_SECRET}"`);
      console.error("[firebase-admin] Initialization failed:", parseError);
      console.warn(`credential dump ${FAKE_EMAIL}`);
      return null;
    });
    const consoleCapture = captureConsole();
    try {
      expect(() => assertVoiceWorkerAdminDb()).toThrow(expect.objectContaining({ code: "ADMIN_DB_UNAVAILABLE" }));
    } finally {
      consoleCapture.restore();
    }
    const output = consoleCapture.lines.join("\n");
    expectNoSecrets(output);
    expect(output).toContain("[firebase-admin] Initialization failed:");
    expect(output).toContain('"errorName":"SyntaxError"');
    expect(output).toContain("[firebase-admin] log suppressed");
  });

  it("restores console methods after the guarded call (success and failure)", () => {
    const originalError = console.error;
    const originalWarn = console.warn;
    getAdminDbMock.mockReturnValue(firestoreLike());
    assertVoiceWorkerAdminDb();
    getAdminDbMock.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => assertVoiceWorkerAdminDb()).toThrow(VoiceWorkerStartupError);
    expect(console.error).toBe(originalError);
    expect(console.warn).toBe(originalWarn);
  });
});
