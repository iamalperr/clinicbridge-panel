/**
 * Phase 4A — multilingual voice control plane (backend foundation only).
 * Language registry, strict validation, resolver precedence/legacy fallback, voice profile and
 * custom voice isolation/consent, DID overrides, admin authorization, versioning/audit, and
 * proof that the production speech runtime consumes none of it (Phase 4B: shadow only).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  VOICE_LANGUAGE_REGISTRY,
  VOICE_LOCALES,
  canonicalizeLegacyLocale,
} from "@/lib/voice/config/languageRegistry";
import { resolveVoiceConfiguration } from "@/lib/voice/config/resolveVoiceConfiguration";
import type { VoiceConfigFirestore, VoiceDocRef, VoiceDocSnapshot, VoiceTransaction } from "@/lib/voice/config/store";
import { VOICE_CONFIG_ERROR_CODES, type VoiceConfigError } from "@/lib/voice/config/types";
import { legacyVoiceSettings, parseDidVoiceProfile, parseVoiceSettingsPatch } from "@/lib/voice/config/validation";
import {
  getDidVoiceOverrides,
  getVoiceSettings,
  listAvailableVoiceProfiles,
  listCustomVoices,
  updateDidVoiceOverride,
  updateVoiceSettings,
  type VoiceSettingsCaller,
} from "@/lib/voice/config/voiceSettingsService";
import { LEGACY_TURKISH_VOICE_PROFILE_ID, parseStoredVoiceProfile } from "@/lib/voice/config/voiceProfiles";

const REPO = resolve(__dirname, "..");

/* ── In-memory Firestore (paths, queries, transactions, auto ids) ──── */

type Data = Record<string, unknown>;

class FakeDb implements VoiceConfigFirestore {
  readonly docs = new Map<string, Data>();
  readonly failReads = new Set<string>();
  writeCount = 0;
  private autoId = 0;

  seed(path: string, data: Data): void {
    this.docs.set(path, structuredClone(data));
  }

  read(path: string): Data | undefined {
    return this.docs.get(path);
  }

  childrenOf(collectionPath: string): string[] {
    const depth = collectionPath.split("/").length + 1;
    return [...this.docs.keys()].filter((p) => p.startsWith(`${collectionPath}/`) && p.split("/").length === depth);
  }

  nextId(): string {
    this.autoId += 1;
    return `auto${this.autoId}`;
  }

  collection(path: string) {
    return new FakeCollection(this, path);
  }

  async runTransaction<T>(fn: (tx: VoiceTransaction) => Promise<T>): Promise<T> {
    const staged: Array<() => void> = [];
    const tx: VoiceTransaction = {
      get: (ref) => ref.get(),
      set: (ref, data) => staged.push(() => this.docs.set((ref as FakeDocRef).path, structuredClone(data))),
      update: (ref, data) =>
        staged.push(() => {
          const path = (ref as FakeDocRef).path;
          const current = this.docs.get(path);
          if (!current) throw new Error("update of missing doc");
          this.docs.set(path, { ...current, ...structuredClone(data) });
        }),
      create: (ref, data) =>
        staged.push(() => {
          const path = (ref as FakeDocRef).path;
          if (this.docs.has(path)) throw new Error("create of existing doc");
          this.docs.set(path, structuredClone(data));
        }),
    };
    const result = await fn(tx);
    for (const write of staged) {
      write();
      this.writeCount += 1;
    }
    return result;
  }
}

function snapshot(db: FakeDb, path: string): VoiceDocSnapshot {
  const data = db.read(path);
  const id = path.split("/").pop() as string;
  return { exists: data !== undefined, id, data: () => (data ? structuredClone(data) : undefined) };
}

class FakeDocRef implements VoiceDocRef {
  constructor(private readonly db: FakeDb, readonly path: string) {}
  get id(): string {
    return this.path.split("/").pop() as string;
  }
  async get(): Promise<VoiceDocSnapshot> {
    if (this.db.failReads.has(this.path)) throw new Error("UNAVAILABLE");
    return snapshot(this.db, this.path);
  }
  collection(path: string) {
    return new FakeCollection(this.db, `${this.path}/${path}`);
  }
}

class FakeCollection {
  constructor(private readonly db: FakeDb, readonly path: string) {}
  doc(id?: string) {
    return new FakeDocRef(this.db, `${this.path}/${id ?? this.db.nextId()}`);
  }
  async get() {
    return { docs: this.db.childrenOf(this.path).map((p) => snapshot(this.db, p)) };
  }
  where(field: string, _op: "==", value: unknown) {
    return {
      get: async () => ({
        docs: this.db
          .childrenOf(this.path)
          .filter((p) => (this.db.read(p) as Data)[field] === value)
          .map((p) => snapshot(this.db, p)),
      }),
    };
  }
}

/* ── Fixtures ───────────────────────────────────────────────────────── */

const CLINIC_A = "clinic_ida";
const CLINIC_B = "clinic_other";
const PROD_DID = "+908502428852";
const INTL_DID = "+908502428853";
const OTHER_DID = "+908502428854";
const EN_VOICE_ID = "11111111-2222-4333-8444-555555555555";
const DE_VOICE_ID = "22222222-3333-4444-8555-666666666666";
const CUSTOM_VOICE_ID = "33333333-4444-4555-8666-777777777777";
const NOW = new Date("2026-10-09T12:00:00.000Z");

const superAdmin: VoiceSettingsCaller = { uid: "u_super", profile: { role: "superAdmin" } };
const clinicAdminA: VoiceSettingsCaller = { uid: "u_admin_a", profile: { role: "clinicAdmin", clinicId: CLINIC_A } };

function seedBase(db: FakeDb): void {
  db.seed(`clinics/${CLINIC_A}`, { name: "Clinic A" });
  db.seed(`clinics/${CLINIC_B}`, { name: "Clinic B" });
  // Shape of the current production mapping (no new fields).
  db.seed(`voiceNumbers/${PROD_DID}`, { clinicId: CLINIC_A, active: true, voiceEnabled: true, defaultLocale: "tr", provider: "verimor" });
  db.seed(`voiceNumbers/${INTL_DID}`, { clinicId: CLINIC_A, active: true, voiceEnabled: true, defaultLocale: "tr-TR" });
  db.seed(`voiceNumbers/${OTHER_DID}`, { clinicId: CLINIC_B, active: true, voiceEnabled: true, defaultLocale: "tr" });
  db.seed("voiceProfiles/sys_en", {
    displayName: "System English",
    provider: "cartesia",
    providerVoiceId: EN_VOICE_ID,
    supportedLocales: ["en-US", "en-GB"],
    type: "SYSTEM",
    status: "ACTIVE",
  });
  db.seed("voiceProfiles/sys_de", {
    displayName: "System German",
    provider: "cartesia",
    providerVoiceId: DE_VOICE_ID,
    supportedLocales: ["de-DE"],
    type: "SYSTEM",
    status: "ACTIVE",
  });
  db.seed("voiceProfiles/sys_retired", {
    displayName: "Old English",
    provider: "cartesia",
    providerVoiceId: EN_VOICE_ID,
    supportedLocales: ["en-US"],
    type: "SYSTEM",
    status: "INACTIVE",
  });
}

function customVoice(owner: string, overrides: { lifecycleStatus?: string; consent?: Data; status?: string; providerVoiceId?: string | null } = {}): Data {
  return {
    displayName: "İDA International Reception",
    provider: "cartesia",
    providerVoiceId: overrides.providerVoiceId === undefined ? CUSTOM_VOICE_ID : overrides.providerVoiceId,
    supportedLocales: ["tr-TR", "en-GB", "de-DE"],
    type: "CUSTOM",
    status: overrides.status ?? "ACTIVE",
    ownerClinicId: owner,
    custom: {
      lifecycleStatus: overrides.lifecycleStatus ?? "ACTIVE",
      consent: overrides.consent ?? {
        status: "PROVIDED",
        providedAt: "2026-10-01T10:00:00.000Z",
        recordedByUid: "u_admin_a",
        consentRecordRef: "consents/ida/voice-talent-1.pdf",
      },
      sampleStorageRef: "voice-samples/ida/sample-1.wav",
      createdByUid: "u_admin_a",
    },
  };
}

function storedSettings(clinicId: string, fields: Data): Data {
  return {
    ...JSON.parse(JSON.stringify(legacyVoiceSettings(clinicId))),
    version: 1,
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...fields,
  };
}

const MULTILINGUAL = {
  languageMode: "AUTO",
  supportedLanguages: ["tr-TR", "en-US", "de-DE"],
  defaultLanguage: "tr-TR",
  fallbackLanguage: "tr-TR",
  allowLanguageSwitch: true,
  languageProfiles: {
    "en-US": { enabled: true, voiceProfileId: "sys_en", greeting: "Hello, how can I help you?" },
    "de-DE": { enabled: true, voiceProfileId: "sys_de", greeting: null },
  },
};

function codes(errors: readonly VoiceConfigError[]): string[] {
  return errors.map((e) => e.code);
}

let db: FakeDb;
const deps = () => ({ db, now: () => NOW });

beforeEach(() => {
  db = new FakeDb();
  seedBase(db);
});

/* ── Language registry ──────────────────────────────────────────────── */

describe("language registry", () => {
  it("covers the initial product locales with safe metadata only", () => {
    expect([...VOICE_LOCALES]).toEqual(["tr-TR", "en-US", "en-GB", "de-DE", "ar-SA", "ru-RU", "fr-FR"]);
    for (const locale of VOICE_LOCALES) {
      expect(Object.keys(VOICE_LANGUAGE_REGISTRY[locale]).sort()).toEqual(["displayName", "locale", "nativeName", "rtl", "status"]);
    }
    expect(VOICE_LANGUAGE_REGISTRY["ar-SA"]).toMatchObject({ nativeName: "العربية", rtl: true });
    expect(VOICE_LANGUAGE_REGISTRY["tr-TR"]).toMatchObject({ nativeName: "Türkçe", rtl: false, status: "AVAILABLE" });
    expect(VOICE_LANGUAGE_REGISTRY["de-DE"]).toMatchObject({ nativeName: "Deutsch", status: "PREVIEW" });
  });

  it("only Turkish is AVAILABLE; nothing else is enabled automatically", () => {
    expect(VOICE_LOCALES.filter((l) => VOICE_LANGUAGE_REGISTRY[l].status === "AVAILABLE")).toEqual(["tr-TR"]);
  });

  it("reads legacy mapping locales leniently but never guesses an ambiguous one", () => {
    expect(canonicalizeLegacyLocale("tr")).toBe("tr-TR");
    expect(canonicalizeLegacyLocale("tr-TR")).toBe("tr-TR");
    expect(canonicalizeLegacyLocale("tr_tr")).toBe("tr-TR");
    expect(canonicalizeLegacyLocale("en")).toBeNull();
    expect(canonicalizeLegacyLocale("turkish")).toBeNull();
    expect(canonicalizeLegacyLocale(undefined)).toBeNull();
  });
});

/* ── Legacy fallback / missing config ───────────────────────────────── */

describe("resolver — legacy fallback (no VoiceSettings document)", () => {
  it("current production Turkish DID → FIXED tr-TR with the worker-env Turkish voice", async () => {
    const result = await resolveVoiceConfiguration({ adminDb: db }, { clinicId: CLINIC_A, calledDid: PROD_DID });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const c = result.config;
    expect(c).toMatchObject({
      clinicId: CLINIC_A,
      didE164: PROD_DID,
      source: "LEGACY",
      enabled: true,
      languageMode: "FIXED",
      defaultLanguage: "tr-TR",
      fallbackLanguage: "tr-TR",
      supportedLanguages: ["tr-TR"],
      allowLanguageSwitch: false,
      resolvedDidProfile: null,
      version: 0,
      issues: [],
    });
    expect(c.languageProfiles["tr-TR"]).toEqual({
      locale: "tr-TR",
      rtl: false,
      voiceProfileId: LEGACY_TURKISH_VOICE_PROFILE_ID,
      voiceType: "SYSTEM",
      provider: "cartesia",
      providerVoice: { kind: "WORKER_ENV" },
      greeting: null,
    });
    expect(Object.keys(c.languageProfiles)).toEqual(["tr-TR"]);
  });

  it("keeps the legacy DID greeting for Turkish and honours mapping routing flags", async () => {
    db.seed(`voiceNumbers/${PROD_DID}`, {
      clinicId: CLINIC_A,
      active: true,
      voiceEnabled: false,
      defaultLocale: "tr-TR",
      greetingText: "İstanbul Diş Akademisi, merhaba.",
    });
    const result = await resolveVoiceConfiguration({ adminDb: db }, { clinicId: CLINIC_A, calledDid: PROD_DID });
    if (!result.ok) throw new Error(result.code);
    expect(result.config.enabled).toBe(false);
    expect(result.config.languageProfiles["tr-TR"]?.greeting).toBe("İstanbul Diş Akademisi, merhaba.");
  });

  it("a non-Turkish legacy defaultLocale keeps the Turkish-only stack and says so", async () => {
    db.seed(`voiceNumbers/${PROD_DID}`, { clinicId: CLINIC_A, active: true, voiceEnabled: true, defaultLocale: "en" });
    const result = await resolveVoiceConfiguration({ adminDb: db }, { clinicId: CLINIC_A, calledDid: PROD_DID });
    if (!result.ok) throw new Error(result.code);
    expect(result.config.defaultLanguage).toBe("tr-TR");
    expect(result.config.issues).toEqual(["VOICE_LEGACY_LOCALE_IGNORED"]);
  });

  it("missing config at clinic level → safe legacy defaults without any write", async () => {
    const result = await resolveVoiceConfiguration({ adminDb: db }, { clinicId: CLINIC_A });
    if (!result.ok) throw new Error(result.code);
    expect(result.config).toMatchObject({ source: "LEGACY", languageMode: "FIXED", supportedLanguages: ["tr-TR"], didE164: null });
    expect(db.writeCount).toBe(0);
    expect(db.read(`voiceSettings/${CLINIC_A}`)).toBeUndefined();
  });

  it("unreadable settings → legacy Turkish with an explicit issue (call never dropped by config)", async () => {
    db.seed(`voiceSettings/${CLINIC_A}`, storedSettings(CLINIC_A, MULTILINGUAL));
    db.failReads.add(`voiceSettings/${CLINIC_A}`);
    const result = await resolveVoiceConfiguration({ adminDb: db }, { clinicId: CLINIC_A, calledDid: PROD_DID });
    if (!result.ok) throw new Error(result.code);
    expect(result.config).toMatchObject({ source: "LEGACY", supportedLanguages: ["tr-TR"], issues: ["VOICE_SETTINGS_UNREADABLE_USED_LEGACY"] });
  });

  it("invalid stored settings → legacy Turkish, never a silently repaired config", async () => {
    db.seed(`voiceSettings/${CLINIC_A}`, storedSettings(CLINIC_A, { defaultLanguage: "en-US", supportedLanguages: ["tr-TR"] }));
    const result = await resolveVoiceConfiguration({ adminDb: db }, { clinicId: CLINIC_A, calledDid: PROD_DID });
    if (!result.ok) throw new Error(result.code);
    expect(result.config.source).toBe("LEGACY");
    expect(result.config.issues).toEqual(["VOICE_SETTINGS_INVALID_USED_LEGACY"]);
    expect(codes(result.config.diagnostics)).toContain("VOICE_DEFAULT_LANGUAGE_NOT_SUPPORTED");
  });

  it("returns a deeply frozen configuration", async () => {
    const result = await resolveVoiceConfiguration({ adminDb: db }, { clinicId: CLINIC_A, calledDid: PROD_DID });
    if (!result.ok) throw new Error(result.code);
    expect(Object.isFrozen(result.config)).toBe(true);
    expect(Object.isFrozen(result.config.supportedLanguages)).toBe(true);
    expect(Object.isFrozen(result.config.languageProfiles["tr-TR"])).toBe(true);
  });

  it("is deterministic for identical inputs", async () => {
    db.seed(`voiceSettings/${CLINIC_A}`, storedSettings(CLINIC_A, MULTILINGUAL));
    const a = await resolveVoiceConfiguration({ adminDb: db }, { clinicId: CLINIC_A, calledDid: PROD_DID });
    const b = await resolveVoiceConfiguration({ adminDb: db }, { clinicId: CLINIC_A, calledDid: PROD_DID });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

/* ── Multilingual / invalid configs ─────────────────────────────────── */

describe("multilingual configuration", () => {
  it("AUTO tr-TR + en-US + de-DE with default tr-TR resolves to a valid config", async () => {
    const update = await updateVoiceSettings(deps(), clinicAdminA, CLINIC_A, { expectedVersion: 0, patch: MULTILINGUAL });
    expect(update).toMatchObject({ ok: true, value: { changed: true, version: 1 } });

    const result = await resolveVoiceConfiguration({ adminDb: db }, { clinicId: CLINIC_A, calledDid: PROD_DID });
    if (!result.ok) throw new Error(result.code);
    const c = result.config;
    expect(c).toMatchObject({
      source: "VOICE_SETTINGS",
      languageMode: "AUTO",
      defaultLanguage: "tr-TR",
      supportedLanguages: ["tr-TR", "en-US", "de-DE"],
      allowLanguageSwitch: true,
      version: 1,
      issues: [],
    });
    expect(c.languageProfiles["tr-TR"]?.providerVoice).toEqual({ kind: "WORKER_ENV" });
    expect(c.languageProfiles["en-US"]).toMatchObject({ voiceProfileId: "sys_en", greeting: "Hello, how can I help you?" });
    expect(c.languageProfiles["de-DE"]).toMatchObject({ voiceProfileId: "sys_de", greeting: null });
  });

  it("a disabled language profile is kept but not offered", async () => {
    const patch = {
      ...MULTILINGUAL,
      languageProfiles: { ...MULTILINGUAL.languageProfiles, "de-DE": { enabled: false, voiceProfileId: "sys_de", greeting: null } },
    };
    expect((await updateVoiceSettings(deps(), clinicAdminA, CLINIC_A, { expectedVersion: 0, patch })).ok).toBe(true);
    const result = await resolveVoiceConfiguration({ adminDb: db }, { clinicId: CLINIC_A });
    if (!result.ok) throw new Error(result.code);
    expect(result.config.supportedLanguages).toEqual(["tr-TR", "en-US"]);
    expect(result.config.languageProfiles["de-DE"]).toBeUndefined();
  });

  const invalid: Array<[string, Data, string]> = [
    ["default not in supported", { defaultLanguage: "en-US", supportedLanguages: ["tr-TR"] }, "VOICE_DEFAULT_LANGUAGE_NOT_SUPPORTED"],
    ["fallback not supported", { fallbackLanguage: "de-DE" }, "VOICE_FALLBACK_LANGUAGE_NOT_SUPPORTED"],
    ["AUTO with one language", { languageMode: "AUTO" }, "VOICE_AUTO_REQUIRES_MULTIPLE_LANGUAGES"],
    ["AUTO with zero languages", { languageMode: "AUTO", supportedLanguages: [] }, "VOICE_SUPPORTED_LANGUAGES_EMPTY"],
    ["unknown locale", { supportedLanguages: ["tr-TR", "xx-XX"] }, "VOICE_LOCALE_UNKNOWN"],
    ["non-canonical locale", { supportedLanguages: ["tr"] }, "VOICE_LOCALE_UNKNOWN"],
    ["duplicate locale", { supportedLanguages: ["tr-TR", "tr-TR"] }, "VOICE_LOCALE_DUPLICATE"],
    [
      "language profile for unsupported locale",
      { languageProfiles: { "en-US": { enabled: true, voiceProfileId: "sys_en", greeting: null } } },
      "VOICE_LANGUAGE_PROFILE_UNSUPPORTED_LOCALE",
    ],
    [
      "inactive voice profile",
      { supportedLanguages: ["tr-TR", "en-US"], languageProfiles: { "en-US": { enabled: true, voiceProfileId: "sys_retired", greeting: null } } },
      "VOICE_PROFILE_INACTIVE",
    ],
    ["unknown voice profile", { defaultVoiceProfileId: "does_not_exist" }, "VOICE_PROFILE_NOT_FOUND"],
    ["voice cannot speak the language", { supportedLanguages: ["tr-TR", "de-DE"] }, "VOICE_PROFILE_LOCALE_UNSUPPORTED"],
    [
      "default language disabled",
      { languageProfiles: { "tr-TR": { enabled: false, voiceProfileId: null, greeting: null } } },
      "VOICE_DEFAULT_LANGUAGE_DISABLED",
    ],
    ["greeting with untrimmed text", { languageProfiles: { "tr-TR": { enabled: true, voiceProfileId: null, greeting: " Merhaba" } } }, "VOICE_GREETING_INVALID"],
    ["unknown field", { sttModel: "nova-3" }, "VOICE_FIELD_NOT_ALLOWED"],
    ["tenant field", { clinicId: CLINIC_B }, "VOICE_FIELD_NOT_ALLOWED"],
    ["version field", { version: 99 }, "VOICE_FIELD_NOT_ALLOWED"],
  ];

  for (const [name, patch, code] of invalid) {
    it(`rejects ${name} with ${code} and writes nothing`, async () => {
      const result = await updateVoiceSettings(deps(), clinicAdminA, CLINIC_A, { expectedVersion: 0, patch });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(422);
      expect(codes(result.errors)).toContain(code);
      expect(db.writeCount).toBe(0);
    });
  }

  it("every returned code is a declared stable code", () => {
    const parsed = parseVoiceSettingsPatch({ supportedLanguages: ["tr", "tr"], bogus: 1 }, { isPlatformAdmin: false });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    for (const error of parsed.errors) expect(VOICE_CONFIG_ERROR_CODES).toContain(error.code);
  });
});

/* ── Custom voices ──────────────────────────────────────────────────── */

describe("custom voices — tenant isolation, consent, lifecycle", () => {
  const useCustom = (id: string) => ({
    supportedLanguages: ["tr-TR", "en-GB"],
    languageProfiles: { "en-GB": { enabled: true, voiceProfileId: id, greeting: null } },
  });

  async function enableCustomVoices(clinicId: string): Promise<void> {
    const result = await updateVoiceSettings(deps(), superAdmin, clinicId, { expectedVersion: 0, patch: { customVoiceEnabled: true } });
    expect(result.ok).toBe(true);
  }

  it("clinic A cannot use clinic B's custom voice (service, resolver and listings)", async () => {
    db.seed("voiceProfiles/cv_b", customVoice(CLINIC_B));
    await enableCustomVoices(CLINIC_A);
    const update = await updateVoiceSettings(deps(), clinicAdminA, CLINIC_A, { expectedVersion: 1, patch: useCustom("cv_b") });
    expect(update.ok).toBe(false);
    if (!update.ok) expect(codes(update.errors)).toContain("VOICE_CUSTOM_VOICE_CROSS_TENANT");

    // Even if such a reference were stored, the resolver refuses it and stays on legacy Turkish.
    db.seed(`voiceSettings/${CLINIC_A}`, storedSettings(CLINIC_A, { customVoiceEnabled: true, ...useCustom("cv_b") }));
    const resolved = await resolveVoiceConfiguration({ adminDb: db }, { clinicId: CLINIC_A, calledDid: PROD_DID });
    if (!resolved.ok) throw new Error(resolved.code);
    expect(resolved.config.source).toBe("LEGACY");
    expect(codes(resolved.config.diagnostics)).toContain("VOICE_CUSTOM_VOICE_CROSS_TENANT");

    const available = await listAvailableVoiceProfiles(deps(), clinicAdminA, CLINIC_A);
    const custom = await listCustomVoices(deps(), clinicAdminA, CLINIC_A);
    if (!available.ok || !custom.ok) throw new Error("listing failed");
    expect(available.value.map((v) => v.id)).not.toContain("cv_b");
    expect(custom.value).toEqual([]);
  });

  it("an own, consented, ACTIVE custom voice is selectable and resolves", async () => {
    db.seed("voiceProfiles/cv_ida", customVoice(CLINIC_A));
    await enableCustomVoices(CLINIC_A);
    const update = await updateVoiceSettings(deps(), clinicAdminA, CLINIC_A, { expectedVersion: 1, patch: useCustom("cv_ida") });
    expect(update.ok).toBe(true);
    const resolved = await resolveVoiceConfiguration({ adminDb: db }, { clinicId: CLINIC_A });
    if (!resolved.ok) throw new Error(resolved.code);
    expect(resolved.config.languageProfiles["en-GB"]).toMatchObject({ voiceProfileId: "cv_ida", voiceType: "CUSTOM" });
  });

  it("custom voices require the platform entitlement", async () => {
    db.seed("voiceProfiles/cv_ida", customVoice(CLINIC_A));
    const update = await updateVoiceSettings(deps(), clinicAdminA, CLINIC_A, { expectedVersion: 0, patch: useCustom("cv_ida") });
    expect(update.ok).toBe(false);
    if (!update.ok) expect(codes(update.errors)).toContain("VOICE_CUSTOM_VOICES_DISABLED");
  });

  const unusable: Array<[string, Parameters<typeof customVoice>[1], string]> = [
    ["consent NOT_PROVIDED", { consent: { status: "NOT_PROVIDED" }, lifecycleStatus: "CONSENT_PENDING" }, "VOICE_CUSTOM_VOICE_CONSENT_MISSING"],
    [
      "consent REVOKED",
      { consent: { status: "REVOKED", providedAt: "2026-10-01T10:00:00.000Z", consentRecordRef: "c/1", revokedAt: "2026-10-05T10:00:00.000Z" } },
      "VOICE_CUSTOM_VOICE_CONSENT_MISSING",
    ],
    ["consent PROVIDED without a consent record", { consent: { status: "PROVIDED", providedAt: "2026-10-01T10:00:00.000Z" } }, "VOICE_CUSTOM_VOICE_CONSENT_MISSING"],
    ["lifecycle DISABLED", { lifecycleStatus: "DISABLED" }, "VOICE_CUSTOM_VOICE_NOT_READY"],
    ["lifecycle FAILED", { lifecycleStatus: "FAILED" }, "VOICE_CUSTOM_VOICE_NOT_READY"],
    ["lifecycle PROCESSING", { lifecycleStatus: "PROCESSING" }, "VOICE_CUSTOM_VOICE_NOT_READY"],
    ["not provisioned at the provider", { providerVoiceId: null }, "VOICE_CUSTOM_VOICE_NOT_READY"],
    ["profile INACTIVE", { status: "INACTIVE" }, "VOICE_PROFILE_INACTIVE"],
  ];

  for (const [name, overrides, code] of unusable) {
    it(`rejects a custom voice with ${name} (${code})`, async () => {
      db.seed("voiceProfiles/cv_ida", customVoice(CLINIC_A, overrides));
      await enableCustomVoices(CLINIC_A);
      const update = await updateVoiceSettings(deps(), clinicAdminA, CLINIC_A, { expectedVersion: 1, patch: useCustom("cv_ida") });
      expect(update.ok).toBe(false);
      if (!update.ok) expect(codes(update.errors)).toContain(code);

      const listed = await listAvailableVoiceProfiles(deps(), clinicAdminA, CLINIC_A);
      if (!listed.ok) throw new Error("listing failed");
      expect(listed.value.map((v) => v.id)).not.toContain("cv_ida");
    });
  }

  it("consent revoked after activation → resolver stops using the stored config", async () => {
    db.seed("voiceProfiles/cv_ida", customVoice(CLINIC_A));
    await enableCustomVoices(CLINIC_A);
    expect((await updateVoiceSettings(deps(), clinicAdminA, CLINIC_A, { expectedVersion: 1, patch: useCustom("cv_ida") })).ok).toBe(true);
    db.seed(
      "voiceProfiles/cv_ida",
      customVoice(CLINIC_A, { consent: { status: "REVOKED", providedAt: "2026-10-01T10:00:00.000Z", consentRecordRef: "c/1", revokedAt: NOW.toISOString() } })
    );
    const resolved = await resolveVoiceConfiguration({ adminDb: db }, { clinicId: CLINIC_A, calledDid: PROD_DID });
    if (!resolved.ok) throw new Error(resolved.code);
    expect(resolved.config.source).toBe("LEGACY");
    expect(resolved.config.issues).toEqual(["VOICE_SETTINGS_INVALID_USED_LEGACY"]);
  });
});

/* ── DID overrides ──────────────────────────────────────────────────── */

describe("DID-specific profile override", () => {
  const INTERNATIONAL = {
    label: "International Reception",
    languageMode: "AUTO",
    defaultLanguage: "en-GB",
    fallbackLanguage: "en-GB",
    supportedLanguages: ["en-GB", "de-DE", "tr-TR"],
    languageProfiles: { "en-GB": { greeting: "Welcome to İstanbul Diş Akademisi." } },
  };

  async function configureClinic(): Promise<void> {
    const patch = {
      supportedLanguages: ["tr-TR", "en-GB", "de-DE"],
      languageProfiles: {
        "en-GB": { enabled: true, voiceProfileId: "sys_en", greeting: null },
        "de-DE": { enabled: true, voiceProfileId: "sys_de", greeting: null },
      },
      didProfiles: { international: INTERNATIONAL },
    };
    const result = await updateVoiceSettings(deps(), clinicAdminA, CLINIC_A, { expectedVersion: 0, patch });
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
  }

  it("same-clinic international DID gets its language/default/profile override; the Turkish DID keeps clinic defaults", async () => {
    await configureClinic();
    const assign = await updateDidVoiceOverride(deps(), clinicAdminA, CLINIC_A, {
      calledDid: INTL_DID,
      voiceProfileKey: "international",
      expectedVersion: 1,
    });
    expect(assign).toMatchObject({ ok: true, value: { changed: true, version: 2 } });

    const intl = await resolveVoiceConfiguration({ adminDb: db }, { clinicId: CLINIC_A, calledDid: INTL_DID });
    if (!intl.ok) throw new Error(intl.code);
    expect(intl.config).toMatchObject({
      languageMode: "AUTO",
      defaultLanguage: "en-GB",
      supportedLanguages: ["en-GB", "de-DE", "tr-TR"],
      resolvedDidProfile: { key: "international", label: "International Reception" },
      issues: [],
    });
    expect(intl.config.languageProfiles["en-GB"]?.greeting).toBe("Welcome to İstanbul Diş Akademisi.");

    const turkish = await resolveVoiceConfiguration({ adminDb: db }, { clinicId: CLINIC_A, calledDid: PROD_DID });
    if (!turkish.ok) throw new Error(turkish.code);
    expect(turkish.config).toMatchObject({ languageMode: "FIXED", defaultLanguage: "tr-TR", resolvedDidProfile: null });
  });

  it("assignment writes only voiceProfileKey on the mapping (routing fields untouched)", async () => {
    await configureClinic();
    const before = structuredClone(db.read(`voiceNumbers/${INTL_DID}`));
    await updateDidVoiceOverride(deps(), clinicAdminA, CLINIC_A, { calledDid: INTL_DID, voiceProfileKey: "international", expectedVersion: 1 });
    expect(db.read(`voiceNumbers/${INTL_DID}`)).toEqual({ ...before, voiceProfileKey: "international" });
  });

  it("a DID override cannot widen the clinic's languages", async () => {
    const patch = { didProfiles: { intl: { label: "Intl", supportedLanguages: ["tr-TR", "en-GB"], defaultLanguage: "en-GB" } } };
    const result = await updateVoiceSettings(deps(), clinicAdminA, CLINIC_A, { expectedVersion: 0, patch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(codes(result.errors)).toContain("VOICE_DID_OVERRIDE_LANGUAGE_NOT_IN_CLINIC");
  });

  it("a DID override can switch voice off but never on", () => {
    expect(parseDidVoiceProfile({ label: "Off", enabled: false }).ok).toBe(true);
    const on = parseDidVoiceProfile({ label: "On", enabled: true });
    expect(on.ok).toBe(false);
    if (!on.ok) expect(codes(on.errors)).toEqual(["VOICE_DID_OVERRIDE_FIELD_NOT_ALLOWED"]);
  });

  it("missing DID profile reference → clinic settings with an explicit issue", async () => {
    await configureClinic();
    db.seed(`voiceNumbers/${INTL_DID}`, { clinicId: CLINIC_A, active: true, voiceEnabled: true, voiceProfileKey: "gone" });
    const result = await resolveVoiceConfiguration({ adminDb: db }, { clinicId: CLINIC_A, calledDid: INTL_DID });
    if (!result.ok) throw new Error(result.code);
    expect(result.config).toMatchObject({ source: "VOICE_SETTINGS", defaultLanguage: "tr-TR", resolvedDidProfile: null });
    expect(result.config.issues).toEqual(["VOICE_DID_PROFILE_IGNORED"]);
  });

  it("an assigned DID profile cannot be deleted", async () => {
    await configureClinic();
    await updateDidVoiceOverride(deps(), clinicAdminA, CLINIC_A, { calledDid: INTL_DID, voiceProfileKey: "international", expectedVersion: 1 });
    const result = await updateVoiceSettings(deps(), clinicAdminA, CLINIC_A, { expectedVersion: 2, patch: { didProfiles: {} } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(codes(result.errors)).toContain("VOICE_DID_PROFILE_IN_USE");
  });

  it("lists only the clinic's own DIDs", async () => {
    const result = await getDidVoiceOverrides(deps(), clinicAdminA, CLINIC_A);
    if (!result.ok) throw new Error("list failed");
    expect(result.value.map((d) => d.didE164)).toEqual([PROD_DID, INTL_DID]);
  });
});

describe("DID tenant change is impossible", () => {
  it("DID profiles reject tenant/routing fields", () => {
    for (const field of ["clinicId", "tenantId", "didE164"]) {
      const parsed = parseDidVoiceProfile({ label: "X", [field]: CLINIC_B });
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(codes(parsed.errors)).toEqual(["VOICE_DID_OVERRIDE_TENANT_FIELD_FORBIDDEN"]);
    }
    const nested = parseDidVoiceProfile({ label: "X", languageProfiles: { "tr-TR": { clinicId: CLINIC_B } } });
    expect(nested.ok).toBe(false);
  });

  it("settings patch carrying a tenant field inside a DID profile is rejected", async () => {
    const patch = { didProfiles: { intl: { label: "Intl", clinicId: CLINIC_B } } };
    const result = await updateVoiceSettings(deps(), clinicAdminA, CLINIC_A, { expectedVersion: 0, patch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(codes(result.errors)).toContain("VOICE_DID_OVERRIDE_TENANT_FIELD_FORBIDDEN");
    expect(db.writeCount).toBe(0);
  });

  it("resolver refuses a DID whose trusted mapping belongs to another clinic", async () => {
    const result = await resolveVoiceConfiguration({ adminDb: db }, { clinicId: CLINIC_A, calledDid: OTHER_DID });
    expect(result).toEqual({ ok: false, code: "VOICE_DID_TENANT_MISMATCH" });
  });

  it("clinic A cannot assign a profile to clinic B's DID; the mapping is untouched", async () => {
    const before = structuredClone(db.read(`voiceNumbers/${OTHER_DID}`));
    const result = await updateDidVoiceOverride(deps(), clinicAdminA, CLINIC_A, { calledDid: OTHER_DID, voiceProfileKey: null, expectedVersion: 0 });
    expect(result).toMatchObject({ ok: false, status: 404, errors: [{ code: "VOICE_DID_TENANT_MISMATCH" }] });
    expect(db.read(`voiceNumbers/${OTHER_DID}`)).toEqual(before);
    expect(db.writeCount).toBe(0);
  });

  it("even a platform admin acting for clinic A cannot touch clinic B's DID", async () => {
    const result = await updateDidVoiceOverride(deps(), superAdmin, CLINIC_A, { calledDid: OTHER_DID, voiceProfileKey: null, expectedVersion: 0 });
    expect(result.ok).toBe(false);
  });
});

/* ── Authorization ──────────────────────────────────────────────────── */

describe("admin authorization", () => {
  const denied: Array<[string, VoiceSettingsCaller]> = [
    ["clinicUser (no clinic_voice by default)", { uid: "u1", profile: { role: "clinicUser", clinicId: CLINIC_A } }],
    ["clinicAdmin of another clinic", { uid: "u2", profile: { role: "clinicAdmin", clinicId: CLINIC_B } }],
    ["clinicAdmin without clinicId", { uid: "u3", profile: { role: "clinicAdmin" } }],
    ["clinicAdmin with explicit permissions lacking clinic_voice", { uid: "u4", profile: { role: "clinicAdmin", clinicId: CLINIC_A, permissions: ["clinic_overview"] } }],
    ["suspended clinicAdmin", { uid: "u5", profile: { role: "clinicAdmin", clinicId: CLINIC_A, status: "suspended" } }],
    ["agencyAdmin", { uid: "u6", profile: { role: "agencyAdmin", clinicId: CLINIC_A } }],
    ["viewer", { uid: "u7", profile: { role: "viewer", clinicId: CLINIC_A } }],
    ["missing profile", { uid: "u8", profile: null }],
  ];

  for (const [name, caller] of denied) {
    it(`${name} can neither read nor mutate voice settings`, async () => {
      const read = await getVoiceSettings(deps(), caller, CLINIC_A);
      const write = await updateVoiceSettings(deps(), caller, CLINIC_A, { expectedVersion: 0, patch: { enabled: false } });
      const did = await updateDidVoiceOverride(deps(), caller, CLINIC_A, { calledDid: PROD_DID, voiceProfileKey: null, expectedVersion: 0 });
      for (const result of [read, write, did]) expect(result).toMatchObject({ ok: false, status: 403, errors: [{ code: "VOICE_ACCESS_DENIED" }] });
      expect(db.writeCount).toBe(0);
    });
  }

  it("clinicUser explicitly granted clinic_voice for its own clinic is allowed", async () => {
    const caller = { uid: "u9", profile: { role: "clinicUser" as const, clinicId: CLINIC_A, permissions: ["clinic_voice" as const] } };
    expect((await getVoiceSettings(deps(), caller, CLINIC_A)).ok).toBe(true);
  });

  it("clinic admins cannot grant themselves the custom-voice entitlement", async () => {
    const result = await updateVoiceSettings(deps(), clinicAdminA, CLINIC_A, { expectedVersion: 0, patch: { customVoiceEnabled: true } });
    expect(result).toMatchObject({ ok: false, status: 403, errors: [{ code: "VOICE_FIELD_REQUIRES_PLATFORM_ADMIN" }] });
  });

  it("GET for an unconfigured clinic returns the legacy baseline without writing", async () => {
    const result = await getVoiceSettings(deps(), clinicAdminA, CLINIC_A);
    if (!result.ok) throw new Error("read failed");
    expect(result.value.source).toBe("LEGACY");
    expect(result.value.settings).toMatchObject({ languageMode: "FIXED", supportedLanguages: ["tr-TR"], version: 0 });
    expect(db.writeCount).toBe(0);
  });
});

describe("API routes — authentication boundary", () => {
  it("unauthenticated PATCH is rejected with 401 and performs no write", async () => {
    vi.resetModules();
    vi.doMock("@/lib/firebase-admin", () => ({ getAdminDb: () => db, getAdminAuth: () => null }));
    const { PATCH } = await import("@/app/api/clinics/[clinicId]/voice-settings/route");
    const req = new Request("http://localhost/api/clinics/x/voice-settings", {
      method: "PATCH",
      body: JSON.stringify({ expectedVersion: 0, patch: { enabled: false } }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ clinicId: CLINIC_A }) });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "VOICE_UNAUTHENTICATED" });
    expect(db.writeCount).toBe(0);
    vi.doUnmock("@/lib/firebase-admin");
  });

  it("authenticated user without voice permission gets 403 from PATCH; no write", async () => {
    vi.resetModules();
    vi.doMock("@/lib/firebase-admin", () => ({ getAdminDb: () => db, getAdminAuth: () => null }));
    vi.doMock("@/lib/services/apiAuth", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/services/apiAuth")>();
      return { ...actual, verifyAuth: async () => ({ uid: "u1", profile: { uid: "u1", email: "x", role: "clinicUser", clinicId: CLINIC_A } }) };
    });
    const { PATCH } = await import("@/app/api/clinics/[clinicId]/voice-settings/route");
    const req = new Request("http://localhost/api/clinics/x/voice-settings", {
      method: "PATCH",
      headers: { Authorization: "Bearer t" },
      body: JSON.stringify({ expectedVersion: 0, patch: { enabled: false } }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ clinicId: CLINIC_A }) });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "VOICE_CONFIG_REJECTED", errors: [{ code: "VOICE_ACCESS_DENIED" }] });
    expect(db.writeCount).toBe(0);
    vi.doUnmock("@/lib/services/apiAuth");
    vi.doUnmock("@/lib/firebase-admin");
  });
});

/* ── Versioning / audit ─────────────────────────────────────────────── */

describe("versioning and audit trail", () => {
  it("records who changed the clinic from Turkish-only to multilingual", async () => {
    const result = await updateVoiceSettings(deps(), clinicAdminA, CLINIC_A, { expectedVersion: 0, patch: MULTILINGUAL });
    expect(result).toMatchObject({ ok: true, value: { version: 1 } });
    const stored = db.read(`voiceSettings/${CLINIC_A}`) as Data;
    expect(stored).toMatchObject({ version: 1, updatedAt: NOW.toISOString(), updatedBy: { uid: "u_admin_a", role: "clinicAdmin" }, clinicId: CLINIC_A });

    const auditPaths = db.childrenOf(`voiceSettings/${CLINIC_A}/auditLog`);
    expect(auditPaths).toHaveLength(1);
    const event = db.read(auditPaths[0]) as Data;
    expect(event).toMatchObject({
      action: "VOICE_SETTINGS_UPDATED",
      fromVersion: 0,
      toVersion: 1,
      actor: { uid: "u_admin_a", role: "clinicAdmin" },
      languageChange: {
        before: { languageMode: "FIXED", supportedLanguages: ["tr-TR"] },
        after: { languageMode: "AUTO", supportedLanguages: ["tr-TR", "en-US", "de-DE"] },
      },
    });
    expect(event.changedFields).toEqual(["allowLanguageSwitch", "languageMode", "languageProfiles", "supportedLanguages"]);
    // Greetings and provider identifiers stay out of the audit event.
    expect(JSON.stringify(event)).not.toContain("Hello, how can I help you?");
    expect(JSON.stringify(event)).not.toContain(EN_VOICE_ID);
  });

  it("stale expectedVersion is a conflict; no-op patches write nothing", async () => {
    await updateVoiceSettings(deps(), clinicAdminA, CLINIC_A, { expectedVersion: 0, patch: { enabled: true } });
    const writes = db.writeCount;
    const stale = await updateVoiceSettings(deps(), clinicAdminA, CLINIC_A, { expectedVersion: 0, patch: { enabled: false } });
    expect(stale).toMatchObject({ ok: false, status: 409, errors: [{ code: "VOICE_SETTINGS_VERSION_CONFLICT" }] });
    const noop = await updateVoiceSettings(deps(), clinicAdminA, CLINIC_A, { expectedVersion: 1, patch: { enabled: true } });
    expect(noop).toEqual({ ok: true, value: { changed: false, version: 1, changedFields: [] } });
    expect(db.writeCount).toBe(writes);
  });

  it("DID assignment bumps the version and is audited", async () => {
    await updateVoiceSettings(deps(), clinicAdminA, CLINIC_A, {
      expectedVersion: 0,
      patch: { didProfiles: { turkish: { label: "Turkish Reception" } } },
    });
    await updateDidVoiceOverride(deps(), clinicAdminA, CLINIC_A, { calledDid: PROD_DID, voiceProfileKey: "turkish", expectedVersion: 1 });
    const events = db.childrenOf(`voiceSettings/${CLINIC_A}/auditLog`).map((p) => db.read(p) as Data);
    expect(events.map((e) => e.action).sort()).toEqual(["DID_VOICE_PROFILE_ASSIGNED", "VOICE_SETTINGS_UPDATED"]);
    expect(events.find((e) => e.action === "DID_VOICE_PROFILE_ASSIGNED")).toMatchObject({
      fromVersion: 1,
      toVersion: 2,
      didE164: PROD_DID,
      voiceProfileKey: { before: null, after: "turkish" },
    });
  });
});

/* ── Secret exposure ────────────────────────────────────────────────── */

describe("no secret or provider credential exposure", () => {
  const SECRET_KEYS = /(secret|token|api_?key|password|private_?key|credential)/i;

  function keysOf(value: unknown, out: string[] = []): string[] {
    if (Array.isArray(value)) value.forEach((v) => keysOf(v, out));
    else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        out.push(k);
        keysOf(v, out);
      }
    }
    return out;
  }

  it("admin responses contain no provider voice ids, storage/consent refs or credential-shaped keys", async () => {
    db.seed("voiceProfiles/cv_ida", customVoice(CLINIC_A));
    await updateVoiceSettings(deps(), superAdmin, CLINIC_A, { expectedVersion: 0, patch: { customVoiceEnabled: true } });
    const responses = [
      await getVoiceSettings(deps(), clinicAdminA, CLINIC_A),
      await listAvailableVoiceProfiles(deps(), clinicAdminA, CLINIC_A),
      await listCustomVoices(deps(), clinicAdminA, CLINIC_A),
      await getDidVoiceOverrides(deps(), clinicAdminA, CLINIC_A),
    ];
    for (const response of responses) {
      expect(response.ok).toBe(true);
      const text = JSON.stringify(response);
      for (const forbidden of [EN_VOICE_ID, DE_VOICE_ID, CUSTOM_VOICE_ID, "voice-samples/", "consents/"]) expect(text).not.toContain(forbidden);
      expect(keysOf(response).filter((k) => SECRET_KEYS.test(k))).toEqual([]);
    }
  });

  it("the resolver never reads or returns the worker's TTS voice env value", async () => {
    const sentinel = "99999999-9999-4999-8999-999999999999";
    vi.stubEnv("CLINICBRIDGE_VOICE_TTS_VOICE_ID", sentinel);
    try {
      const result = await resolveVoiceConfiguration({ adminDb: db }, { clinicId: CLINIC_A, calledDid: PROD_DID });
      expect(JSON.stringify(result)).not.toContain(sentinel);
      expect(keysOf(result).filter((k) => SECRET_KEYS.test(k))).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("a stored voice profile carrying a credential-shaped field is rejected outright", () => {
    expect(parseStoredVoiceProfile("sys_x", { ...customVoice(CLINIC_A), apiKey: "x" })).toBeNull();
    expect(parseStoredVoiceProfile("sys_y", { ...customVoice(CLINIC_A), providerSecret: "x" })).toBeNull();
    expect(parseStoredVoiceProfile("builtin_tr_reception", customVoice(CLINIC_A))).toBeNull();
  });
});

/* ── Production runtime unchanged ───────────────────────────────────── */

describe("production speech runtime does not consume the control plane (Phase 4B shadow only)", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return sourceFiles(full);
      return /\.(ts|tsx|mjs)$/.test(name) ? [full] : [];
    });
  }

  /** Control-plane modules a file imports, by resolved path (relative and "@/" specifiers). */
  function controlPlaneImports(file: string): string[] {
    const src = readFileSync(file, "utf8");
    const specifiers = [...src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);
    return specifiers
      .map((s) => (s.startsWith("@/") ? resolve(REPO, s.slice(2)) : s.startsWith(".") ? resolve(dirname(file), s) : s))
      .filter((p) => p.startsWith(resolve(REPO, "lib/voice/config")))
      .map((p) => relative(resolve(REPO, "lib/voice/config"), p))
      .sort();
  }

  it("worker, telephony and Agent Core do not import lib/voice/config", () => {
    const roots = ["workers/voice/src", "lib/voice/telephony", "lib/agent", "lib/conversation"];
    const offenders = roots
      .flatMap((root) => sourceFiles(resolve(REPO, root)))
      .filter((file) => controlPlaneImports(file).length > 0 || /voice\/config/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("the runtime reaches the control plane only through the shadow resolver", () => {
    const usage = Object.fromEntries(
      sourceFiles(resolve(REPO, "lib/voice/runtime"))
        .map((file) => [relative(REPO, file), controlPlaneImports(file)] as const)
        .filter(([, imports]) => imports.length > 0)
    );
    expect(usage).toEqual({
      "lib/voice/runtime/composeVoiceRuntime.ts": ["resolveVoiceConfiguration", "store"],
      "lib/voice/runtime/voiceRuntimeBridge.ts": ["shadow"],
    });
  });

  it("the Turkish speech stack constants are unchanged", () => {
    const stack = readFileSync(resolve(REPO, "workers/voice/src/call/speechStack.ts"), "utf8");
    expect(stack).toContain('export const VOICE_SPEECH_LANGUAGE = "tr";');
    expect(stack).toContain('model: "deepgram/nova-3"');
    expect(stack).toContain('tts: { model: "cartesia/sonic-3.5", language: VOICE_SPEECH_LANGUAGE, voice }');
    expect(stack).toContain('turnDetector: { version: "v1" }');
  });
});
