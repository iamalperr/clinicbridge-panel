/**
 * Phase 4B — voice configuration shadow mode.
 * The real resolver runs over an in-memory Firestore; the bridge uses fake call capabilities.
 * Every scenario proves the call context, turns and speech inputs are identical to a bridge
 * without shadow mode, i.e. the resolved configuration controls nothing at runtime.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveVoiceConfiguration } from "@/lib/voice/config/resolveVoiceConfiguration";
import { toRuntimeVoiceConfig } from "@/lib/voice/config/runtimeContract";
import {
  CURRENT_RUNTIME_VOICE_BEHAVIOR,
  evaluateVoiceConfigShadow,
  voiceConfigShadowLogFields,
} from "@/lib/voice/config/shadow";
import type { VoiceConfigReadFirestore } from "@/lib/voice/config/store";
import { legacyVoiceSettings } from "@/lib/voice/config/validation";
import {
  composeVoiceRuntimeCapabilities,
  type VoiceRuntimeCompositionDeps,
} from "@/lib/voice/runtime/composeVoiceRuntime";
import {
  createVoiceRuntimeBridge,
  type VoiceRuntimeBridgeOptions,
  type VoiceRuntimeCall,
  type VoiceRuntimeCapabilities,
} from "@/lib/voice/runtime/voiceRuntimeBridge";
import {
  deriveBoundSessionIds,
  deriveCallBindingId,
  formatTurnId,
  type CallBinding,
} from "@/lib/voice/telephony/callBinding";
import type { VoiceTurnInput, VoiceTurnResult } from "@/lib/voice/types";
import { readVoiceWorkerConfig } from "@/workers/voice/src/workerConfig";

const CLINIC = "clinic_ida";
const OTHER_CLINIC = "clinic_other";
const DID = "+908502428852";
const KEY = "lk:room_abc:sip_call_1";
const KEY_2 = "lk:room_def:sip_call_2";
const LEGACY_GREETING = "İstanbul Diş Akademisi'ne hoş geldiniz.";
const EN_GREETING = "Hello, how may I help you today?";
const EN_VOICE_ID = "11111111-2222-4333-8444-555555555555";
const TR_VOICE_ID = "44444444-5555-4666-8777-888888888888";
const CUSTOM_VOICE_ID = "33333333-4444-4555-8666-777777777777";
const CALLER_TRANSCRIPT = "Numaram 0532 111 22 33, adım Ayşe Yılmaz";

/* ── In-memory read-only Firestore ──────────────────────────────────── */

type Data = Record<string, unknown>;

class ReadDb implements VoiceConfigReadFirestore {
  readonly docs = new Map<string, Data>();
  readonly failReads = new Set<string>();
  reads = 0;
  readLatencyMs = 0;
  inFlight = 0;
  maxInFlight = 0;

  seed(path: string, data: Data): void {
    this.docs.set(path, structuredClone(data));
  }

  collection(collectionPath: string) {
    return {
      doc: (id: string) => ({
        get: async () => {
          const path = `${collectionPath}/${id}`;
          this.reads += 1;
          this.inFlight += 1;
          this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
          if (this.readLatencyMs) await new Promise((r) => setTimeout(r, this.readLatencyMs));
          this.inFlight -= 1;
          if (this.failReads.has(path)) throw new Error("UNAVAILABLE");
          const data = this.docs.get(path);
          return { exists: data !== undefined, data: () => (data ? structuredClone(data) : undefined) };
        },
      }),
    };
  }
}

function seedProduction(db: ReadDb, mapping: Data = {}): void {
  db.seed(`clinics/${CLINIC}`, { name: "Clinic" });
  db.seed(`clinics/${OTHER_CLINIC}`, { name: "Other" });
  // Shape of the production mapping: no voiceProfileKey, no new fields.
  db.seed(`voiceNumbers/${DID}`, { clinicId: CLINIC, active: true, voiceEnabled: true, defaultLocale: "tr", provider: "verimor", ...mapping });
  db.seed("voiceProfiles/sys_en", {
    displayName: "System English",
    provider: "cartesia",
    providerVoiceId: EN_VOICE_ID,
    supportedLocales: ["en-US", "en-GB"],
    type: "SYSTEM",
    status: "ACTIVE",
  });
  db.seed("voiceProfiles/sys_tr", {
    displayName: "System Turkish 2",
    provider: "cartesia",
    providerVoiceId: TR_VOICE_ID,
    supportedLocales: ["tr-TR"],
    type: "SYSTEM",
    status: "ACTIVE",
  });
  db.seed("voiceProfiles/sys_retired", {
    displayName: "Retired Turkish",
    provider: "cartesia",
    providerVoiceId: TR_VOICE_ID,
    supportedLocales: ["tr-TR"],
    type: "SYSTEM",
    status: "INACTIVE",
  });
  db.seed("voiceProfiles/cv_ida", {
    displayName: "İDA Reception",
    provider: "cartesia",
    providerVoiceId: CUSTOM_VOICE_ID,
    supportedLocales: ["tr-TR", "en-US"],
    type: "CUSTOM",
    status: "ACTIVE",
    ownerClinicId: CLINIC,
    custom: {
      lifecycleStatus: "ACTIVE",
      consent: {
        status: "PROVIDED",
        providedAt: "2026-10-01T10:00:00.000Z",
        recordedByUid: "u_admin",
        consentRecordRef: "consents/ida/voice-talent-1.pdf",
      },
      sampleStorageRef: "voice-samples/ida/sample-1.wav",
      createdByUid: "u_admin",
    },
  });
}

function seedSettings(db: ReadDb, fields: Data, version = 1): void {
  db.seed(`voiceSettings/${CLINIC}`, {
    ...JSON.parse(JSON.stringify(legacyVoiceSettings(CLINIC))),
    version,
    updatedAt: "2026-10-01T00:00:00.000Z",
    updatedBy: "u_admin",
    ...fields,
  });
}

const MULTILINGUAL = {
  languageMode: "AUTO",
  supportedLanguages: ["tr-TR", "en-US"],
  defaultLanguage: "tr-TR",
  fallbackLanguage: "tr-TR",
  allowLanguageSwitch: true,
  languageProfiles: { "en-US": { enabled: true, voiceProfileId: "sys_en", greeting: EN_GREETING } },
};

/* ── Fake call capabilities ─────────────────────────────────────────── */

function turnResult(input: VoiceTurnInput): VoiceTurnResult {
  return {
    ok: true,
    callSessionId: input.callSessionId,
    conversationId: "conv",
    clinicId: input.clinicId ?? CLINIC,
    channel: "voice",
    replyText: "Randevunuz için hangi gün uygun?",
    locale: "tr",
    appointmentState: "IDLE",
  };
}

function makeCaps(db: ReadDb, opts: { shadow?: boolean; resolveVoiceConfig?: VoiceRuntimeCapabilities["resolveVoiceConfig"] } = {}) {
  const bindings = new Map<string, CallBinding>();
  const caps: VoiceRuntimeCapabilities = {
    // The trusted DID resolver: always the production mapping's tenant.
    resolveDid: vi.fn(async () => ({ ok: true as const, didE164: DID, clinicId: CLINIC, defaultLocale: "tr", greetingText: LEGACY_GREETING })),
    getOrCreateBinding: vi.fn(async (input) => {
      const bindingId = deriveCallBindingId(input.externalCallKey)!;
      const existing = bindings.get(bindingId);
      if (existing) return { ok: true as const, binding: { ...existing }, created: false };
      const binding: CallBinding = {
        bindingId,
        clinicId: input.clinicId,
        didE164: input.didE164,
        ...deriveBoundSessionIds(bindingId),
        status: "ACTIVE",
        turnSeq: 0,
        startedAt: "2026-10-09T10:00:00.000Z",
        updatedAt: "2026-10-09T10:00:00.000Z",
      };
      bindings.set(bindingId, binding);
      return { ok: true as const, binding: { ...binding }, created: true };
    }),
    allocateTurnId: vi.fn(async ({ bindingId }) => {
      const b = bindings.get(bindingId)!;
      b.turnSeq += 1;
      return { ok: true as const, bindingId, turnSeq: b.turnSeq, turnId: formatTurnId(bindingId, b.turnSeq) };
    }),
    endBinding: vi.fn(async ({ bindingId, reason }) => {
      const b = bindings.get(bindingId)!;
      Object.assign(b, { status: "ENDED", endReason: reason });
      return { ok: true as const, binding: { ...b } };
    }),
    failBinding: vi.fn(async ({ bindingId, failureCode }) => {
      const b = bindings.get(bindingId)!;
      Object.assign(b, { status: "FAILED", failureCode });
      return { ok: true as const, binding: { ...b } };
    }),
    processTurn: vi.fn(async (input) => turnResult(input)),
    endSession: vi.fn(async (input) => ({
      ok: true as const,
      callSessionId: input.callSessionId,
      conversationId: "conv",
      clinicId: CLINIC,
      status: input.reason === "failed" ? ("FAILED" as const) : ("COMPLETED" as const),
    })),
  };
  if (opts.shadow !== false) {
    caps.resolveVoiceConfig = vi.fn(
      opts.resolveVoiceConfig ?? ((input: { clinicId: string; calledDid: string }) => resolveVoiceConfiguration({ adminDb: db }, input))
    );
  }
  return { caps, bindings };
}

function bridgeFor(db: ReadDb, opts: Parameters<typeof makeCaps>[1] & Pick<VoiceRuntimeBridgeOptions, "voiceConfigShadowTimeoutMs"> = {}) {
  const { caps, bindings } = makeCaps(db, opts);
  const bridge = createVoiceRuntimeBridge({
    capabilities: caps,
    ...(opts.voiceConfigShadowTimeoutMs ? { voiceConfigShadowTimeoutMs: opts.voiceConfigShadowTimeoutMs } : {}),
  });
  return { caps, bindings, bridge };
}

async function startCall(bridge: ReturnType<typeof bridgeFor>["bridge"], key = KEY): Promise<VoiceRuntimeCall> {
  const started = await bridge.startRuntimeCall({ externalCallKey: key, calledDid: DID });
  if (!started.ok) throw new Error(`start failed: ${started.code}`);
  return started.call;
}

/** The call context, first turn and Agent Core input a bridge WITHOUT shadow mode produces. */
async function legacyBaseline() {
  const db = new ReadDb();
  seedProduction(db);
  const { caps, bridge } = bridgeFor(db, { shadow: false });
  const call = await startCall(bridge);
  const turn = await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: CALLER_TRANSCRIPT });
  return { call, turn, turnInput: vi.mocked(caps.processTurn).mock.calls[0] };
}

/** Asserts the shadow-mode call behaves exactly like the baseline. */
async function expectRuntimeUnchanged(env: ReturnType<typeof bridgeFor>, call: VoiceRuntimeCall) {
  const baseline = await legacyBaseline();
  expect(call).toEqual(baseline.call);
  expect(Object.keys(call).sort()).toEqual(["bindingId", "callSessionId", "clinicId", "conversationId", "didE164", "greetingText", "lifecycle", "locale"]);
  expect(call.locale).toBe("tr");
  expect(call.greetingText).toBe(LEGACY_GREETING);
  const turn = await env.bridge.processRuntimeTranscript({ runtimeCall: call, transcript: CALLER_TRANSCRIPT });
  expect(turn).toEqual(baseline.turn);
  expect(vi.mocked(env.caps.processTurn).mock.calls[0]).toEqual(baseline.turnInput);
}

let logs: string[];
beforeEach(() => {
  logs = [];
  const capture = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  vi.spyOn(console, "log").mockImplementation(capture);
  vi.spyOn(console, "error").mockImplementation(capture);
  vi.spyOn(console, "warn").mockImplementation(capture);
});
afterEach(() => {
  vi.restoreAllMocks();
});

function shadowLogs(): Record<string, unknown>[] {
  return logs.filter((l) => l.includes('"VOICE_CONFIG_SHADOW"')).map((l) => JSON.parse(l) as Record<string, unknown>);
}

/* ── Scenarios ──────────────────────────────────────────────────────── */

describe("Phase 4B shadow — legacy Turkish production DID", () => {
  it("LEGACY SHADOW MATCH: no VoiceSettings resolves to FIXED tr-TR + worker env voice", async () => {
    const db = new ReadDb();
    seedProduction(db);
    const env = bridgeFor(db);
    const call = await startCall(env.bridge);

    const shadow = env.bridge.getVoiceConfigShadow(call)!;
    expect(shadow.result).toBe("MATCH");
    expect(shadow.mismatches).toEqual([]);
    expect(shadow.config).toMatchObject({
      clinicId: CLINIC,
      source: "LEGACY",
      version: 0,
      enabled: true,
      languageMode: "FIXED",
      defaultLanguage: "tr-TR",
      fallbackLanguage: "tr-TR",
      supportedLanguages: ["tr-TR"],
      allowLanguageSwitch: false,
      didProfileKey: null,
      issues: [],
    });
    expect(shadow.config!.languages["tr-TR"]).toMatchObject({ voiceProfileId: "builtin_tr_reception", providerVoice: { kind: "WORKER_ENV" } });

    const [log] = shadowLogs();
    expect(log).toMatchObject({ result: "MATCH", source: "LEGACY", languageMatch: true, voiceMatch: true, defaultVoiceReference: "WORKER_ENV", supportedLanguageCount: 1 });
    await expectRuntimeUnchanged(env, call);
  });

  it("the expected baseline is the production speech stack's fixed Turkish behavior", () => {
    expect(CURRENT_RUNTIME_VOICE_BEHAVIOR).toEqual({
      enabled: true,
      languageMode: "FIXED",
      defaultLanguage: "tr-TR",
      fallbackLanguage: "tr-TR",
      supportedLanguages: ["tr-TR"],
      allowLanguageSwitch: false,
      voiceReference: "WORKER_ENV",
    });
  });

  it("without the shadow capability the bridge behaves exactly as before", async () => {
    const db = new ReadDb();
    seedProduction(db);
    const env = bridgeFor(db, { shadow: false });
    const call = await startCall(env.bridge);
    expect(env.bridge.getVoiceConfigShadow(call)).toBeNull();
    expect(db.reads).toBe(0);
    expect(shadowLogs()).toEqual([]);
  });
});

describe("Phase 4B shadow — configured but NOT applied", () => {
  it("MULTILINGUAL SHADOW MISMATCH: AUTO tr-TR+en-US is observed, runtime stays Turkish", async () => {
    const db = new ReadDb();
    seedProduction(db);
    seedSettings(db, MULTILINGUAL);
    const env = bridgeFor(db);
    const call = await startCall(env.bridge);

    const shadow = env.bridge.getVoiceConfigShadow(call)!;
    expect(shadow.result).toBe("MISMATCH");
    expect(shadow.mismatches).toEqual(["LANGUAGE_MODE", "SUPPORTED_LANGUAGES", "LANGUAGE_SWITCH"]);
    expect(shadow.config).toMatchObject({ source: "VOICE_SETTINGS", version: 1, supportedLanguages: ["tr-TR", "en-US"] });
    expect(shadowLogs()[0]).toMatchObject({ result: "MISMATCH", languageMatch: false, voiceMatch: true, supportedLanguages: ["tr-TR", "en-US"] });
    await expectRuntimeUnchanged(env, call);
  });

  it("VOICE PROFILE MISMATCH: a system voice override is observed, worker voice unchanged", async () => {
    const db = new ReadDb();
    seedProduction(db);
    seedSettings(db, { defaultVoiceProfileId: "sys_tr" });
    const env = bridgeFor(db);
    const call = await startCall(env.bridge);

    const shadow = env.bridge.getVoiceConfigShadow(call)!;
    expect(shadow).toMatchObject({ result: "MISMATCH", mismatches: ["VOICE_REFERENCE"] });
    expect(shadowLogs()[0]).toMatchObject({ languageMatch: true, voiceMatch: false, defaultVoiceReference: "PROVIDER_VOICE_ID", defaultVoiceType: "SYSTEM" });
    await expectRuntimeUnchanged(env, call);
  });

  it("CUSTOM VOICE: resolves the reference only; no sample fetch, no provisioning, no TTS switch", async () => {
    const db = new ReadDb();
    seedProduction(db);
    seedSettings(db, { customVoiceEnabled: true, defaultVoiceProfileId: "cv_ida" });
    const env = bridgeFor(db);
    const call = await startCall(env.bridge);

    const shadow = env.bridge.getVoiceConfigShadow(call)!;
    expect(shadow).toMatchObject({ result: "MISMATCH", mismatches: ["VOICE_REFERENCE"] });
    expect(shadowLogs()[0]).toMatchObject({ defaultVoiceType: "CUSTOM", defaultVoiceReference: "PROVIDER_VOICE_ID" });
    // Only document reads happened: settings, the profile, the DID mapping and the clinic.
    expect([...db.docs.keys()].filter((p) => p.includes("voice-samples") || p.includes("consents"))).toEqual([]);
    expect(JSON.stringify(shadow.config)).not.toMatch(/consentRecordRef|sampleStorageRef|voice-samples|consents\/|createdByUid/);
    await expectRuntimeUnchanged(env, call);
  });

  it("DID OVERRIDE: the DID profile is seen by the shadow, runtime unchanged", async () => {
    const db = new ReadDb();
    seedProduction(db, { voiceProfileKey: "intl" });
    seedSettings(db, {
      ...MULTILINGUAL,
      didProfiles: {
        intl: { label: "International line", languageMode: "FIXED", defaultLanguage: "en-US", fallbackLanguage: "en-US", supportedLanguages: ["en-US"], allowLanguageSwitch: false },
      },
    });
    const env = bridgeFor(db);
    const call = await startCall(env.bridge);

    const shadow = env.bridge.getVoiceConfigShadow(call)!;
    expect(shadow.config).toMatchObject({ didProfileKey: "intl", defaultLanguage: "en-US", supportedLanguages: ["en-US"] });
    expect(shadow.result).toBe("MISMATCH");
    expect(shadow.mismatches).toEqual(expect.arrayContaining(["DEFAULT_LANGUAGE", "SUPPORTED_LANGUAGES", "VOICE_REFERENCE"]));
    expect(shadowLogs()[0]).toMatchObject({ didProfileApplied: true });
    await expectRuntimeUnchanged(env, call);
  });
});

describe("Phase 4B shadow — failures fall back safely (runtime unchanged)", () => {
  async function fallbackCase(setup: (db: ReadDb) => void, opts: Parameters<typeof bridgeFor>[1] = {}) {
    const db = new ReadDb();
    seedProduction(db);
    setup(db);
    const env = bridgeFor(db, opts);
    const call = await startCall(env.bridge);
    await expectRuntimeUnchanged(env, call);
    return env.bridge.getVoiceConfigShadow(call)!;
  }

  it("INVALID CONFIG (unknown locale) → RESOLUTION_FALLBACK", async () => {
    const shadow = await fallbackCase((db) => seedSettings(db, { supportedLanguages: ["tr-TR", "xx-XX"] }));
    expect(shadow).toMatchObject({ result: "RESOLUTION_FALLBACK", config: { source: "LEGACY", issues: ["VOICE_SETTINGS_INVALID_USED_LEGACY"] } });
    expect(shadow.mismatches).toEqual([]);
  });

  it("INACTIVE voice profile → RESOLUTION_FALLBACK", async () => {
    const shadow = await fallbackCase((db) => seedSettings(db, { defaultVoiceProfileId: "sys_retired" }));
    expect(shadow).toMatchObject({ result: "RESOLUTION_FALLBACK", config: { issues: ["VOICE_SETTINGS_INVALID_USED_LEGACY"] } });
  });

  it("INVALID DID override → RESOLUTION_FALLBACK with the DID profile ignored", async () => {
    const shadow = await fallbackCase((db) => {
      db.seed(`voiceNumbers/${DID}`, { clinicId: CLINIC, active: true, voiceEnabled: true, defaultLocale: "tr", voiceProfileKey: "missing" });
      seedSettings(db, MULTILINGUAL);
    });
    expect(shadow).toMatchObject({ result: "RESOLUTION_FALLBACK", config: { didProfileKey: null, issues: ["VOICE_DID_PROFILE_IGNORED"] } });
  });

  it("CORRUPT/UNREADABLE settings → RESOLUTION_FALLBACK", async () => {
    const shadow = await fallbackCase((db) => db.failReads.add(`voiceSettings/${CLINIC}`));
    expect(shadow).toMatchObject({ result: "RESOLUTION_FALLBACK", config: { issues: ["VOICE_SETTINGS_UNREADABLE_USED_LEGACY"] } });
  });

  it("resolver lookup failure → RESOLUTION_ERROR", async () => {
    const shadow = await fallbackCase((db) => db.failReads.add(`clinics/${CLINIC}`));
    expect(shadow).toMatchObject({ result: "RESOLUTION_ERROR", errorCode: "VOICE_CONFIG_LOOKUP_FAILED", config: null });
  });

  it("resolver throws → RESOLUTION_ERROR", async () => {
    const shadow = await fallbackCase(() => {}, { resolveVoiceConfig: async () => { throw new Error("boom"); } });
    expect(shadow).toMatchObject({ result: "RESOLUTION_ERROR", errorCode: "VOICE_CONFIG_SHADOW_FAILED" });
  });

  it("resolver hangs → bounded RESOLUTION_ERROR timeout; call start is not blocked beyond it", async () => {
    const shadow = await fallbackCase(() => {}, { resolveVoiceConfig: () => new Promise(() => {}), voiceConfigShadowTimeoutMs: 15 });
    expect(shadow).toMatchObject({ result: "RESOLUTION_ERROR", errorCode: "VOICE_CONFIG_SHADOW_TIMEOUT" });
  });

  it("the wait bound counts from binding readiness: a resolver slower than the bound but faster than binding still lands", async () => {
    const db = new ReadDb();
    seedProduction(db);
    db.readLatencyMs = 30;
    const env = bridgeFor(db, { voiceConfigShadowTimeoutMs: 10 });
    const createBinding = env.caps.getOrCreateBinding;
    env.caps.getOrCreateBinding = vi.fn(async (input) => {
      await new Promise((r) => setTimeout(r, 80));
      return createBinding(input);
    });
    const call = await startCall(env.bridge);
    expect(env.bridge.getVoiceConfigShadow(call)!.result).toBe("MATCH");
    expect(shadowLogs()[0].startWaitMs).toBeLessThanOrEqual(10);
  });
});

describe("Phase 4B shadow — tenant isolation", () => {
  it("TENANT MISMATCH: the DID now maps to another clinic → hard failure, no Turkish fallback", async () => {
    const db = new ReadDb();
    seedProduction(db);
    // The trusted resolver saw CLINIC; the shadow re-read finds the DID reassigned.
    db.seed(`voiceNumbers/${DID}`, { clinicId: OTHER_CLINIC, active: true, voiceEnabled: true, defaultLocale: "tr" });
    const env = bridgeFor(db);
    const started = await env.bridge.startRuntimeCall({ externalCallKey: KEY, calledDid: DID });

    expect(started).toMatchObject({
      ok: false,
      code: "TENANT_RESOLUTION_FAILED",
      reasonCode: "VOICE_DID_TENANT_MISMATCH",
      endReason: "TENANT_REJECTED",
      retryable: false,
    });
    const bindingId = deriveCallBindingId(KEY)!;
    expect(env.caps.failBinding).toHaveBeenCalledWith({ bindingId, clinicId: CLINIC, failureCode: "TENANT_REJECTED" });
    expect(env.bindings.get(bindingId)!.status).toBe("FAILED");
    expect(env.caps.endSession).toHaveBeenCalledWith(expect.objectContaining({ clinicId: CLINIC, reason: "failed" }));
    // No call context exists, so no business turn can run.
    expect(env.caps.processTurn).not.toHaveBeenCalled();
    const forged = { bindingId, clinicId: CLINIC, didE164: DID, callSessionId: "x", conversationId: "y" } as unknown as VoiceRuntimeCall;
    expect(await env.bridge.processRuntimeTranscript({ runtimeCall: forged, transcript: CALLER_TRANSCRIPT })).toMatchObject({
      ok: false,
      code: "CALL_CONTEXT_INVALID",
    });
    expect(env.caps.processTurn).not.toHaveBeenCalled();
    expect(env.caps.allocateTurnId).not.toHaveBeenCalled();

    // Telemetry: a dedicated stable code, the trusted clinicId only, no DID/caller/greeting/voice ids.
    expect(shadowLogs()[0]).toMatchObject({ result: "RESOLUTION_ERROR", errorCode: "VOICE_DID_TENANT_MISMATCH" });
    const rejected = logs.filter((l) => l.includes("VOICE_RUNTIME_TENANT_MISMATCH_REJECTED")).map((l) => JSON.parse(l));
    expect(rejected).toEqual([
      { checkpoint: "VOICE_RUNTIME_TENANT_MISMATCH_REJECTED", bindingId, clinicId: CLINIC, reasonCode: "VOICE_DID_TENANT_MISMATCH" },
    ]);
    const all = logs.join("\n");
    for (const forbidden of [DID, "908502428852", OTHER_CLINIC, LEGACY_GREETING, CALLER_TRANSCRIPT, EN_VOICE_ID, TR_VOICE_ID, CUSTOM_VOICE_ID]) {
      expect(all).not.toContain(forbidden);
    }
  });

  it("the shadow only ever receives the trusted resolver's clinicId and canonical DID", async () => {
    const db = new ReadDb();
    seedProduction(db);
    const env = bridgeFor(db);
    await env.bridge.startRuntimeCall({ externalCallKey: KEY, calledDid: "0850 242 88 52" });
    expect(env.caps.resolveVoiceConfig).toHaveBeenCalledWith({ clinicId: CLINIC, calledDid: DID });
  });
});

describe("Phase 4B shadow — per-call snapshot, no hot-path reads", () => {
  it("CONFIG CHANGE DURING CALL keeps the initial snapshot; the NEXT CALL resolves the newer version", async () => {
    const db = new ReadDb();
    seedProduction(db);
    seedSettings(db, MULTILINGUAL, 1);
    const env = bridgeFor(db);
    const first = await startCall(env.bridge, KEY);
    expect(env.bridge.getVoiceConfigShadow(first)!.config!.version).toBe(1);

    seedSettings(db, { defaultVoiceProfileId: "sys_tr" }, 2);
    for (const transcript of ["Merhaba", "Randevu almak istiyorum", "Yarın öğleden sonra"]) {
      const r = await env.bridge.processRuntimeTranscript({ runtimeCall: first, transcript });
      expect(r.ok).toBe(true);
    }
    // Re-attaching the same call (e.g. a duplicate start) does not re-resolve either.
    const again = await env.bridge.startRuntimeCall({ externalCallKey: KEY, calledDid: DID });
    expect(again).toMatchObject({ ok: true, created: false });

    const snapshot = env.bridge.getVoiceConfigShadow(first)!;
    expect(snapshot.config).toMatchObject({ version: 1, languageMode: "AUTO" });
    expect(Object.isFrozen(snapshot.config)).toBe(true);
    expect(env.caps.resolveVoiceConfig).toHaveBeenCalledTimes(1);

    const second = await startCall(env.bridge, KEY_2);
    expect(env.bridge.getVoiceConfigShadow(second)!.config).toMatchObject({ version: 2, languageMode: "FIXED" });
    expect(env.bridge.getVoiceConfigShadow(first)!.config!.version).toBe(1);
    expect(env.caps.resolveVoiceConfig).toHaveBeenCalledTimes(2);
  });

  it("NO HOT-PATH READS: business turns never re-run the resolver or read voice config", async () => {
    const db = new ReadDb();
    seedProduction(db);
    seedSettings(db, MULTILINGUAL);
    const env = bridgeFor(db);
    const call = await startCall(env.bridge);
    const readsAfterStart = db.reads;
    expect(readsAfterStart).toBeGreaterThan(0);

    for (let i = 0; i < 5; i += 1) {
      await env.bridge.processRuntimeTranscript({ runtimeCall: call, transcript: `Cevap ${i}` });
    }
    await env.bridge.endRuntimeCall({ runtimeCall: call, reason: "CALLER_HANGUP" });
    expect(db.reads).toBe(readsAfterStart);
    expect(env.caps.resolveVoiceConfig).toHaveBeenCalledTimes(1);
    expect(env.caps.processTurn).toHaveBeenCalledTimes(5);
  });

  it("the DID mapping, clinic and settings reads share one round trip", async () => {
    const db = new ReadDb();
    seedProduction(db);
    db.readLatencyMs = 5;
    const resolved = await resolveVoiceConfiguration({ adminDb: db }, { clinicId: CLINIC, calledDid: DID });
    expect(resolved.ok).toBe(true);
    expect(db.reads).toBe(3);
    expect(db.maxInFlight).toBe(3);
  });

  it("resolution runs alongside binding creation, not before it", async () => {
    const db = new ReadDb();
    seedProduction(db);
    let releaseBinding!: () => void;
    const bindingGate = new Promise<void>((r) => {
      releaseBinding = r;
    });
    const env = bridgeFor(db);
    const createBinding = env.caps.getOrCreateBinding;
    env.caps.getOrCreateBinding = vi.fn(async (input) => {
      await bindingGate;
      return createBinding(input);
    });
    const starting = env.bridge.startRuntimeCall({ externalCallKey: KEY, calledDid: DID });
    await vi.waitFor(() => expect(env.caps.resolveVoiceConfig).toHaveBeenCalledTimes(1));
    expect(env.caps.getOrCreateBinding).toHaveBeenCalledTimes(1);
    releaseBinding();
    expect((await starting).ok).toBe(true);
    expect(typeof shadowLogs()[0].resolveMs).toBe("number");
    expect(typeof shadowLogs()[0].startWaitMs).toBe("number");
  });
});

describe("Phase 4B shadow — PII-safe telemetry and runtime contract", () => {
  it("NO SECRET LOGGING: logs carry no caller data, transcript, greeting, provider ids or refs", async () => {
    const db = new ReadDb();
    seedProduction(db, { voiceProfileKey: "intl", greetingText: LEGACY_GREETING });
    seedSettings(db, {
      ...MULTILINGUAL,
      customVoiceEnabled: true,
      defaultVoiceProfileId: "cv_ida",
      didProfiles: { intl: { label: "VIP hattı Ayşe", defaultVoiceProfileId: "cv_ida" } },
    });
    const env = bridgeFor(db);
    const call = await startCall(env.bridge);
    await env.bridge.processRuntimeTranscript({ runtimeCall: call, transcript: CALLER_TRANSCRIPT });
    await env.bridge.endRuntimeCall({ runtimeCall: call, reason: "CALLER_HANGUP" });

    const all = logs.join("\n");
    expect(shadowLogs()).toHaveLength(1);
    for (const forbidden of [
      CALLER_TRANSCRIPT, "0532", "Ayşe", LEGACY_GREETING, EN_GREETING, "VIP hattı",
      CUSTOM_VOICE_ID, EN_VOICE_ID, TR_VOICE_ID, "consents/", "voice-samples/", "u_admin", DID, "908502428852",
    ]) {
      expect(all).not.toContain(forbidden);
    }
    expect(Object.keys(shadowLogs()[0]).sort()).toEqual(
      [
        "allowLanguageSwitch", "bindingId", "checkpoint", "clinicId", "defaultLanguage", "defaultVoiceReference",
        "defaultVoiceType", "didProfileApplied", "enabled", "errorCode", "fallbackLanguage", "issues", "languageMatch",
        "languageMode", "mismatches", "resolveMs", "result", "source", "startWaitMs", "supportedLanguageCount",
        "supportedLanguages", "version", "voiceMatch",
      ].sort()
    );
  });

  it("RUNTIME CONTRACT: only whitelisted, frozen fields; no audit, consent, storage or diagnostics", async () => {
    const db = new ReadDb();
    seedProduction(db);
    seedSettings(db, { customVoiceEnabled: true, defaultVoiceProfileId: "cv_ida" });
    const resolved = await resolveVoiceConfiguration({ adminDb: db }, { clinicId: CLINIC, calledDid: DID });
    if (!resolved.ok) throw new Error(resolved.code);
    const runtime = toRuntimeVoiceConfig(resolved.config);

    expect(Object.keys(runtime).sort()).toEqual(
      ["allowLanguageSwitch", "clinicId", "defaultLanguage", "didE164", "didProfileKey", "enabled", "fallbackLanguage", "issues", "languageMode", "languages", "source", "supportedLanguages", "version"].sort()
    );
    expect(Object.keys(runtime.languages["tr-TR"]!).sort()).toEqual(
      ["greeting", "locale", "provider", "providerVoice", "rtl", "voiceProfileId", "voiceType"].sort()
    );
    expect(JSON.stringify(runtime)).not.toMatch(/updatedBy|updatedAt|auditLog|consent|sampleStorageRef|createdByUid|diagnostics|ownerClinicId|schemaVersion/);
    expect(Object.isFrozen(runtime)).toBe(true);
    expect(Object.isFrozen(runtime.languages)).toBe(true);
    expect(Object.isFrozen(runtime.languages["tr-TR"]!.providerVoice)).toBe(true);
  });

  it("log fields for a resolution error contain only the closed-set code", () => {
    const fields = voiceConfigShadowLogFields(evaluateVoiceConfigShadow({ ok: false, code: "VOICE_CONFIG_SHADOW_TIMEOUT" }));
    expect(fields).toEqual({
      result: "RESOLUTION_ERROR",
      mismatches: [],
      errorCode: "VOICE_CONFIG_SHADOW_TIMEOUT",
      languageMatch: null,
      voiceMatch: null,
    });
  });
});

describe("Phase 4B shadow — CLINICBRIDGE_VOICE_CONFIG_SHADOW_ENABLED kill switch (end to end)", () => {
  /** env → worker config → composed capabilities → bridge; returns reads and shadow telemetry. */
  async function callWithEnv(flag: string | undefined) {
    const db = new ReadDb();
    seedProduction(db);
    const config = readVoiceWorkerConfig({
      LIVEKIT_AGENT_NAME: "clinicbridge-voice",
      ...(flag === undefined ? {} : { CLINICBRIDGE_VOICE_CONFIG_SHADOW_ENABLED: flag }),
    });
    const composed = composeVoiceRuntimeCapabilities({
      adminDb: db as unknown as VoiceRuntimeCompositionDeps["adminDb"],
      voiceConfigShadow: config.voiceConfigShadowEnabled,
    });
    const { caps } = makeCaps(db, { shadow: false });
    if (composed.resolveVoiceConfig) caps.resolveVoiceConfig = vi.fn(composed.resolveVoiceConfig);
    const bridge = createVoiceRuntimeBridge({ capabilities: caps });
    const call = await startCall(bridge);
    await bridge.processRuntimeTranscript({ runtimeCall: call, transcript: "Merhaba" });
    return { db, caps, bridge, call };
  }

  it("unset → enabled: one shadow resolution (3 reads) reporting LEGACY MATCH", async () => {
    const { db, bridge, call } = await callWithEnv(undefined);
    expect(db.reads).toBe(3);
    expect(bridge.getVoiceConfigShadow(call)!.result).toBe("MATCH");
    expect(shadowLogs()).toHaveLength(1);
    expect(shadowLogs()[0]).toMatchObject({
      result: "MATCH",
      source: "LEGACY",
      version: 0,
      languageMode: "FIXED",
      defaultLanguage: "tr-TR",
      supportedLanguages: ["tr-TR"],
      allowLanguageSwitch: false,
    });
  });

  it('"true" → enabled', async () => {
    const { db, bridge, call } = await callWithEnv("true");
    expect(db.reads).toBe(3);
    expect(bridge.getVoiceConfigShadow(call)!.result).toBe("MATCH");
  });

  it('"false" → completely bypassed: no resolver, no reads, no wait, no shadow telemetry, same call', async () => {
    const { db, caps, bridge, call } = await callWithEnv("false");
    expect(caps.resolveVoiceConfig).toBeUndefined();
    expect(db.reads).toBe(0);
    expect(bridge.getVoiceConfigShadow(call)).toBeNull();
    expect(shadowLogs()).toEqual([]);
    expect(logs.join("\n")).not.toMatch(/VOICE_CONFIG_SHADOW|"MATCH"|"MISMATCH"/);
    expect(caps.resolveDid).toHaveBeenCalledTimes(1);
    const baseline = await legacyBaseline();
    expect(call).toEqual(baseline.call);
    expect(vi.mocked(caps.processTurn).mock.calls[0][0]).toEqual({ ...baseline.turnInput[0], text: "Merhaba" });
  });

  it("invalid value → worker configuration fails before any call can start", () => {
    expect(() =>
      readVoiceWorkerConfig({ LIVEKIT_AGENT_NAME: "clinicbridge-voice", CLINICBRIDGE_VOICE_CONFIG_SHADOW_ENABLED: "off" })
    ).toThrow(expect.objectContaining({ code: "CONFIG_SHADOW_FLAG_INVALID" }));
  });

  it("the worker runtime graph forwards the flag to the composition", async () => {
    vi.resetModules();
    const compose = vi.fn(() => ({}) as VoiceRuntimeCapabilities);
    vi.doMock("@/lib/voice/runtime/composeVoiceRuntime", () => ({ composeVoiceRuntimeCapabilities: compose }));
    vi.doMock("@/lib/voice/runtime/callController", () => ({
      createRuntimeLeaseOperations: () => ({}),
      createCallController: () => ({}),
    }));
    try {
      const { createVoiceRuntimeGraph } = await import("@/workers/voice/src/runtimeGraph");
      const adminDb = {} as Parameters<typeof createVoiceRuntimeGraph>[0];
      createVoiceRuntimeGraph(adminDb, { voiceConfigShadowEnabled: false });
      createVoiceRuntimeGraph(adminDb, { voiceConfigShadowEnabled: true });
      expect(compose.mock.calls.map((c) => (c as unknown as [{ voiceConfigShadow: boolean }])[0].voiceConfigShadow)).toEqual([false, true]);
    } finally {
      vi.doUnmock("@/lib/voice/runtime/composeVoiceRuntime");
      vi.doUnmock("@/lib/voice/runtime/callController");
      vi.resetModules();
    }
  });
});

describe("Phase 4B shadow — composition", () => {
  const adminDb = new ReadDb() as unknown as VoiceRuntimeCompositionDeps["adminDb"];

  it("the composed runtime enables the shadow resolver by default", () => {
    expect(typeof composeVoiceRuntimeCapabilities({ adminDb }).resolveVoiceConfig).toBe("function");
  });

  it("voiceConfigShadow: false removes it entirely", () => {
    expect(composeVoiceRuntimeCapabilities({ adminDb, voiceConfigShadow: false }).resolveVoiceConfig).toBeUndefined();
  });
});
