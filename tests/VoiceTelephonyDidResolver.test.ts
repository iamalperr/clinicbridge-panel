/**
 * Phase 3 Step 1 — called DID → clinic tenant resolution.
 * No real Firebase; no telephony / STT / TTS.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { Firestore } from "firebase-admin/firestore";
import {
  VOICE_NUMBERS_COLLECTION,
  normalizeCalledDid,
  resolveClinicByDid,
  type DidResolverFirestore,
  type ResolveClinicByDidInput,
} from "@/lib/voice/telephony/didResolver";

const REPO = resolve(__dirname, "..");
const RESOLVER_PATH = resolve(REPO, "lib/voice/telephony/didResolver.ts");

const DID = "+908502428852";
const CLINIC_ID = "clinic_test_a";

type DocMap = Record<string, unknown>;

function makeDb(docs: DocMap, opts: { failOn?: string } = {}) {
  const reads: string[] = [];
  const db: DidResolverFirestore = {
    collection: (collectionPath: string) => ({
      doc: (id: string) => ({
        get: async () => {
          const path = `${collectionPath}/${id}`;
          reads.push(path);
          if (opts.failOn === path) throw new Error("firestore unavailable");
          const exists = Object.prototype.hasOwnProperty.call(docs, path);
          return { exists, data: () => (exists ? docs[path] : undefined) };
        },
      }),
    }),
  };
  return { db, reads };
}

function activeMapping(overrides: Record<string, unknown> = {}) {
  return { clinicId: CLINIC_ID, active: true, voiceEnabled: true, ...overrides };
}

function baseDocs(...args: [mapping?: unknown]): DocMap {
  const mapping = args.length > 0 ? args[0] : activeMapping();
  return {
    [`voiceNumbers/${DID}`]: mapping,
    [`clinics/${CLINIC_ID}`]: { name: "Test Clinic A" },
  };
}

describe("normalizeCalledDid", () => {
  it.each([
    ["+908502428852"],
    ["908502428852"],
    ["08502428852"],
    ["+90 850 242 88 52"],
    ["0 (850) 242-88-52"],
    ["0090 850 242 88 52"],
    ["  +908502428852  "],
  ])("normalizes %j → +908502428852", (raw) => {
    expect(normalizeCalledDid(raw)).toEqual({ ok: true, didE164: DID });
  });

  it.each([[""], ["   "], [undefined], [null]])("rejects missing %j", (raw) => {
    expect(normalizeCalledDid(raw)).toEqual({ ok: false, code: "DID_MISSING" });
  });

  it.each([
    ["abc"],
    ["0850242885a"],
    ["+90850242885"],
    ["+9085024288521"],
    ["085024288"],
    ["085024288522"],
    ["90+8502428852"],
    ["++908502428852"],
    ["sip:+908502428852@example.invalid"],
    ["+90 0850 242 88 52"],
    ["1234567890123456789012345678901234"],
  ])("rejects malformed %j as DID_INVALID_FORMAT", (raw) => {
    expect(normalizeCalledDid(raw)).toEqual({ ok: false, code: "DID_INVALID_FORMAT" });
  });

  it.each([
    ["8502428852"],
    ["+14155550100"],
    ["+442071838750"],
    ["00442071838750"],
    ["+901502428852"],
    ["+907502428852"],
  ])("rejects unsupported/ambiguous %j as DID_UNSUPPORTED_NUMBER", (raw) => {
    expect(normalizeCalledDid(raw)).toEqual({ ok: false, code: "DID_UNSUPPORTED_NUMBER" });
  });

  it("rejects non-string input without coercion", () => {
    expect(normalizeCalledDid(908502428852)).toEqual({ ok: false, code: "DID_INVALID_FORMAT" });
    expect(normalizeCalledDid({ calledDid: DID })).toEqual({ ok: false, code: "DID_INVALID_FORMAT" });
  });
});

describe("resolveClinicByDid", () => {
  it("active mapping + existing clinic → success", async () => {
    const { db, reads } = makeDb(baseDocs());
    const result = await resolveClinicByDid({ adminDb: db }, { calledDid: DID });
    expect(result).toEqual({ ok: true, didE164: DID, clinicId: CLINIC_ID });
    expect(reads).toEqual([`voiceNumbers/${DID}`, `clinics/${CLINIC_ID}`]);
  });

  it.each([["908502428852"], ["08502428852"], ["+90 850 242 88 52"]])(
    "looks up the canonical doc id for %j",
    async (raw) => {
      const { db, reads } = makeDb(baseDocs());
      const result = await resolveClinicByDid({ adminDb: db }, { calledDid: raw });
      expect(result).toMatchObject({ ok: true, didE164: DID, clinicId: CLINIC_ID });
      expect(reads[0]).toBe(`${VOICE_NUMBERS_COLLECTION}/${DID}`);
    }
  );

  it("returns valid optional fields and drops invalid / extra ones", async () => {
    const { db } = makeDb(
      baseDocs(
        activeMapping({
          provider: "verimor",
          defaultLocale: "tr",
          greetingText: "  Merhaba, hoş geldiniz.  ",
          createdAt: { seconds: 1 },
          internalNote: "do not leak",
        })
      )
    );
    const result = await resolveClinicByDid({ adminDb: db }, { calledDid: DID });
    expect(result).toEqual({
      ok: true,
      didE164: DID,
      clinicId: CLINIC_ID,
      provider: "verimor",
      defaultLocale: "tr",
      greetingText: "Merhaba, hoş geldiniz.",
    });
  });

  it("omits malformed optional fields instead of failing", async () => {
    const { db } = makeDb(
      baseDocs(activeMapping({ defaultLocale: "turkish", greetingText: "   ", provider: 42 }))
    );
    const result = await resolveClinicByDid({ adminDb: db }, { calledDid: DID });
    expect(result).toEqual({ ok: true, didE164: DID, clinicId: CLINIC_ID });
  });

  it("invalid DID → rejection without any Firestore read", async () => {
    const { db, reads } = makeDb(baseDocs());
    expect(await resolveClinicByDid({ adminDb: db }, { calledDid: "" })).toEqual({
      ok: false,
      code: "DID_MISSING",
    });
    expect(await resolveClinicByDid({ adminDb: db }, { calledDid: "not-a-number" })).toEqual({
      ok: false,
      code: "DID_INVALID_FORMAT",
    });
    expect(await resolveClinicByDid({ adminDb: db }, { calledDid: "8502428852" })).toEqual({
      ok: false,
      code: "DID_UNSUPPORTED_NUMBER",
    });
    expect(reads).toEqual([]);
  });

  it("missing mapping → DID_MAPPING_NOT_FOUND", async () => {
    const { db, reads } = makeDb({ [`clinics/${CLINIC_ID}`]: {} });
    expect(await resolveClinicByDid({ adminDb: db }, { calledDid: DID })).toEqual({
      ok: false,
      code: "DID_MAPPING_NOT_FOUND",
      didE164: DID,
    });
    expect(reads).toEqual([`voiceNumbers/${DID}`]);
  });

  it.each([
    ["active:false", activeMapping({ active: false })],
    ["active missing", { clinicId: CLINIC_ID, voiceEnabled: true }],
    ["active as string", activeMapping({ active: "true" })],
    ["mapping without data", undefined],
  ])("%s → DID_MAPPING_INACTIVE", async (_label, mapping) => {
    const { db } = makeDb(baseDocs(mapping));
    expect(await resolveClinicByDid({ adminDb: db }, { calledDid: DID })).toEqual({
      ok: false,
      code: "DID_MAPPING_INACTIVE",
      didE164: DID,
    });
  });

  it.each([
    ["voiceEnabled:false", activeMapping({ voiceEnabled: false })],
    ["voiceEnabled missing", { clinicId: CLINIC_ID, active: true }],
    ["voiceEnabled as number", activeMapping({ voiceEnabled: 1 })],
  ])("%s → DID_VOICE_DISABLED", async (_label, mapping) => {
    const { db } = makeDb(baseDocs(mapping));
    expect(await resolveClinicByDid({ adminDb: db }, { calledDid: DID })).toEqual({
      ok: false,
      code: "DID_VOICE_DISABLED",
      didE164: DID,
    });
  });

  it.each([
    ["missing", { active: true, voiceEnabled: true }],
    ["empty", activeMapping({ clinicId: "" })],
    ["whitespace-padded", activeMapping({ clinicId: ` ${CLINIC_ID} ` })],
    ["path traversal", activeMapping({ clinicId: "other/clinic" })],
    ["dot segment", activeMapping({ clinicId: ".." })],
    ["non-string", activeMapping({ clinicId: 123 })],
  ])("clinicId %s → DID_MAPPING_INVALID_CLINIC_ID", async (_label, mapping) => {
    const { db, reads } = makeDb(baseDocs(mapping));
    expect(await resolveClinicByDid({ adminDb: db }, { calledDid: DID })).toEqual({
      ok: false,
      code: "DID_MAPPING_INVALID_CLINIC_ID",
      didE164: DID,
    });
    expect(reads).toEqual([`voiceNumbers/${DID}`]);
  });

  it("referenced clinic missing → DID_CLINIC_NOT_FOUND", async () => {
    const { db, reads } = makeDb({ [`voiceNumbers/${DID}`]: activeMapping() });
    expect(await resolveClinicByDid({ adminDb: db }, { calledDid: DID })).toEqual({
      ok: false,
      code: "DID_CLINIC_NOT_FOUND",
      didE164: DID,
    });
    expect(reads).toEqual([`voiceNumbers/${DID}`, `clinics/${CLINIC_ID}`]);
  });

  it("missing adminDb or Firestore errors → DID_LOOKUP_FAILED (not thrown)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await resolveClinicByDid({ adminDb: null }, { calledDid: DID })).toEqual({
        ok: false,
        code: "DID_LOOKUP_FAILED",
        didE164: DID,
      });

      const mappingFail = makeDb(baseDocs(), { failOn: `voiceNumbers/${DID}` });
      expect(await resolveClinicByDid({ adminDb: mappingFail.db }, { calledDid: DID })).toEqual({
        ok: false,
        code: "DID_LOOKUP_FAILED",
        didE164: DID,
      });

      const clinicFail = makeDb(baseDocs(), { failOn: `clinics/${CLINIC_ID}` });
      expect(await resolveClinicByDid({ adminDb: clinicFail.db }, { calledDid: DID })).toEqual({
        ok: false,
        code: "DID_LOOKUP_FAILED",
        didE164: DID,
      });
      expect(errSpy).toHaveBeenCalledTimes(2);
    } finally {
      errSpy.mockRestore();
    }
  });
});

describe("tenant isolation", () => {
  it("input type accepts only calledDid", () => {
    const keys: Array<keyof ResolveClinicByDidInput> = ["calledDid"];
    expect(keys).toEqual(["calledDid"]);
  });

  it("reads only input.calledDid at runtime", async () => {
    const { db } = makeDb(baseDocs());
    const accessed: PropertyKey[] = [];
    const target = {
      calledDid: DID,
      callerE164: "+905551112233",
      roomName: "clinicbridge-call-+905551112233_abc",
      clinicId: "attacker_clinic",
    };
    const input = new Proxy(target, {
      get(obj, prop, receiver) {
        accessed.push(prop);
        return Reflect.get(obj, prop, receiver);
      },
    });
    const result = await resolveClinicByDid({ adminDb: db }, input);
    expect(result).toMatchObject({ ok: true, clinicId: CLINIC_ID });
    expect(accessed).toEqual(["calledDid"]);
  });

  it("extra identity-looking fields are rejected by the type system and ignored at runtime", async () => {
    const { db, reads } = makeDb({
      ...baseDocs(),
      "clinics/attacker_clinic": {},
      "voiceNumbers/+905551112233": activeMapping({ clinicId: "attacker_clinic" }),
    });

    const withCaller = await resolveClinicByDid(
      { adminDb: db },
      // @ts-expect-error callerE164 is not an accepted input
      { calledDid: DID, callerE164: "+905551112233" }
    );
    const withRoom = await resolveClinicByDid(
      { adminDb: db },
      // @ts-expect-error roomName is not an accepted input
      { calledDid: DID, roomName: "clinicbridge-call-+905551112233_abc" }
    );
    const withClinicOverride = await resolveClinicByDid(
      { adminDb: db },
      // @ts-expect-error clinicId override is not an accepted input
      { calledDid: DID, clinicId: "attacker_clinic" }
    );

    for (const r of [withCaller, withRoom, withClinicOverride]) {
      expect(r).toEqual({ ok: true, didE164: DID, clinicId: CLINIC_ID });
    }
    expect(reads.some((p) => p.includes("attacker_clinic") || p.includes("+905551112233"))).toBe(false);
  });

  it("different called DIDs resolve to their own mapped clinics", async () => {
    const DID_B = "+902120000000";
    const { db } = makeDb({
      ...baseDocs(),
      [`voiceNumbers/${DID_B}`]: activeMapping({ clinicId: "clinic_test_b" }),
      "clinics/clinic_test_b": {},
    });
    expect(await resolveClinicByDid({ adminDb: db }, { calledDid: DID })).toMatchObject({ clinicId: CLINIC_ID });
    expect(await resolveClinicByDid({ adminDb: db }, { calledDid: "0212 000 00 00" })).toMatchObject({
      clinicId: "clinic_test_b",
    });
  });

  it("firebase-admin Firestore satisfies the injected boundary (compile-time)", () => {
    const toBoundary = (db: Firestore): DidResolverFirestore => db;
    expect(typeof toBoundary).toBe("function");
  });
});

describe("module boundary", () => {
  const src = readFileSync(RESOLVER_PATH, "utf8");

  it("has no realtime / telephony / speech / Next.js references", () => {
    expect(src).not.toMatch(
      /livekit|verimor|websocket|deepgram|elevenlabs|twilio|speechToText|textToSpeech|\bSTT\b|\bTTS\b|from ["']next|NextRequest|NextResponse/i
    );
  });

  it("imports nothing (pure module with injected Firestore boundary)", () => {
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toMatch(/require\(/);
  });

  it("has no originating-party / room identifiers and no hardcoded pilot mapping", () => {
    expect(src).not.toMatch(/callerE164|roomName|\bcaller\b|sip\.phoneNumber/i);
    expect(src).not.toContain("8502428852");
  });
});
