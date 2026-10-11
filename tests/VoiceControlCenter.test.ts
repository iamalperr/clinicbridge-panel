import { readFileSync, readdirSync, statSync } from "fs";
import { dirname, join, relative, resolve } from "path";
import { fileURLToPath } from "url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listVoiceLanguages } from "@/lib/voice/config/voiceSettingsService";
import { BUILTIN_VOICE_PROFILES, LEGACY_TURKISH_VOICE_PROFILE_ID } from "@/lib/voice/config/voiceProfiles";
import { legacyVoiceSettings } from "@/lib/voice/config/validation";
import type { VoiceLanguageDefinition } from "@/lib/voice/config/languageRegistry";
import {
  FORBIDDEN_CUSTOMER_TERMS,
  VOICE_CONTROL_CENTER_COPY,
  allocateDidProfileKey,
  autoLanguageAvailability,
  canRetryVoiceLoad,
  clinicSettingsPatch,
  customVoiceStatusCopy,
  customerVoiceName,
  didAssignmentPuts,
  disableCustomDidLine,
  draftFromLoaded,
  effectiveLineLanguageMode,
  enableCustomDidLine,
  formatPhoneLine,
  isDraftDirty,
  lineChangePatch,
  lineSubtitle,
  previewLocalesCannotBeDefault,
  selectableVoicesForLocale,
  settingsPatchChanged,
  snapshotDraft,
  voiceAgentRuntimeActive,
  voiceDisplayName,
  voiceLoadErrorKind,
  voiceLoadErrorMessage,
  type DidVoiceOverrideClientView,
  type VoiceCatalogClientView,
  type VoiceSettingsClientView,
} from "@/lib/voice/ui/voiceControlCenterModel";
import {
  VoiceControlCenterApiError,
  loadVoiceControlCenter,
  patchVoiceSettings,
  putDidVoiceOverride,
} from "@/lib/voice/ui/voiceControlCenterClient";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|mjs)$/.test(name) ? [full] : [];
  });
}

function read(rel: string): string {
  return readFileSync(resolve(REPO, rel), "utf8");
}

const languages = listVoiceLanguages();

function legacyView(clinicId = "clinic_a"): VoiceSettingsClientView {
  const settings = legacyVoiceSettings(clinicId);
  const { schemaVersion, ...rest } = settings;
  void schemaVersion;
  return {
    clinicId,
    source: "LEGACY",
    settings: rest,
    storedConfigErrors: [],
    languages,
  };
}

function savedView(): VoiceSettingsClientView {
  const base = legacyView();
  return {
    ...base,
    source: "VOICE_SETTINGS",
    settings: {
      ...base.settings,
      version: 3,
      languageMode: "FIXED",
      defaultVoiceProfileId: LEGACY_TURKISH_VOICE_PROFILE_ID,
      languageProfiles: {
        "tr-TR": { enabled: true, voiceProfileId: null, greeting: "Merhaba, kliniğimize hoş geldiniz." },
      },
      didProfiles: {
        hat1: { label: "International", languageMode: "FIXED", defaultLanguage: "tr-TR" },
      },
    },
  };
}

const voices: VoiceCatalogClientView = {
  available: [
    {
      id: LEGACY_TURKISH_VOICE_PROFILE_ID,
      displayName: "ClinicBridge Turkish Reception",
      type: "SYSTEM",
      provider: "cartesia",
      supportedLocales: ["tr-TR"],
      status: "ACTIVE",
      selectable: true,
      unavailableReason: null,
      custom: null,
    },
  ],
  custom: [],
};

const dids: DidVoiceOverrideClientView[] = [
  {
    didE164: "+908502428852",
    active: true,
    voiceEnabled: true,
    voiceProfileKey: null,
    profileLabel: null,
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Voice Control Center model", () => {
  it("legacy clinic loads the Turkish baseline without creating settings", () => {
    const draft = draftFromLoaded(legacyView(), dids);
    expect(legacyView().source).toBe("LEGACY");
    expect(legacyView().settings.version).toBe(0);
    expect(draft.languageMode).toBe("FIXED");
    expect(draft.defaultLanguage).toBe("tr-TR");
    expect(draft.defaultVoiceProfileId).toBe(LEGACY_TURKISH_VOICE_PROFILE_ID);
    expect(draft.didLines[0]?.useCustom).toBe(false);
  });

  it("saved settings load greetings, voices and DID profiles", () => {
    const loaded = savedView();
    const assigned: DidVoiceOverrideClientView[] = [{ ...dids[0], voiceProfileKey: "hat1", profileLabel: "International" }];
    const draft = draftFromLoaded(loaded, assigned);
    expect(draft.languageRows["tr-TR"]?.greetingMode).toBe("custom");
    expect(draft.languageRows["tr-TR"]?.greetingText).toContain("hoş geldiniz");
    expect(draft.didLines[0]?.useCustom).toBe(true);
    expect(draft.didLines[0]?.label).toBe("International");
  });

  it("detects dirty state only after a real change", () => {
    const draft = draftFromLoaded(legacyView(), dids);
    const baseline = snapshotDraft(draft);
    expect(isDraftDirty(baseline, draft)).toBe(false);
    expect(isDraftDirty(baseline, { ...draft, allowLanguageSwitch: true })).toBe(true);
  });

  it("does not write empty greetings when inherit or blank custom is selected", () => {
    const draft = draftFromLoaded(legacyView(), dids);
    draft.languageRows["tr-TR"] = { voiceProfileId: null, greetingMode: "custom", greetingText: "   " };
    const patch = clinicSettingsPatch(draft);
    expect(patch.languageProfiles?.["tr-TR"]).toBeUndefined();
  });

  it("saves a custom greeting without touching VoiceSettings.enabled", () => {
    const draft = draftFromLoaded(legacyView(), dids);
    draft.languageRows["tr-TR"] = { voiceProfileId: null, greetingMode: "custom", greetingText: "Merhaba, Destek Kliniği." };
    const patch = clinicSettingsPatch(draft);
    expect(patch.enabled).toBeUndefined();
    expect(patch.languageProfiles?.["tr-TR"]?.greeting).toBe("Merhaba, Destek Kliniği.");
    expect(settingsPatchChanged(legacyView(), patch)).toBe(true);
  });

  it("PREVIEW languages cannot be used as Ana Dil", () => {
    expect(previewLocalesCannotBeDefault(languages, "en-US")).toBe(true);
    expect(previewLocalesCannotBeDefault(languages, "tr-TR")).toBe(false);
    expect(languages.find((item) => item.locale === "ar-SA")?.rtl).toBe(true);
    expect(languages.find((item) => item.locale === "ar-SA")?.nativeName).toBe("العربية");
    expect(languages.filter((item) => item.status === "AVAILABLE")).toHaveLength(1);
    expect(autoLanguageAvailability(languages)).toEqual({
      available: false,
      reason: VOICE_CONTROL_CENTER_COPY.autoUnavailable,
    });
    expect(VOICE_CONTROL_CENTER_COPY.autoUnavailable).toContain("birden fazla dil");
  });

  it("available voices come from the API catalog, not hardcoded provider ids", () => {
    const list = selectableVoicesForLocale(voices.available, "tr-TR");
    expect(list.map((item) => item.displayName)).toEqual(["ClinicBridge Turkish Reception"]);
    expect(list[0]?.id).toBe(LEGACY_TURKISH_VOICE_PROFILE_ID);
  });

  it("shows the built-in voice with a Turkish customer name without changing its backend identity", () => {
    const builtin = voices.available[0]!;
    expect(customerVoiceName(builtin)).toBe("Türkçe Karşılama Sesi");
    expect(voiceDisplayName(voices.available, LEGACY_TURKISH_VOICE_PROFILE_ID)).toBe("Türkçe Karşılama Sesi");
    expect(BUILTIN_VOICE_PROFILES[LEGACY_TURKISH_VOICE_PROFILE_ID]?.displayName).toBe("ClinicBridge Turkish Reception");
    expect(BUILTIN_VOICE_PROFILES[LEGACY_TURKISH_VOICE_PROFILE_ID]?.id).toBe("builtin_tr_reception");
    expect(customerVoiceName({ id: "clinic_voice_1", displayName: "Dr. Ayşe" })).toBe("Dr. Ayşe");
    const ui = read("components/clinic/voice/VoiceControlCenter.tsx");
    expect(ui).toContain("label: customerVoiceName(voice)");
    expect(ui).not.toMatch(/label:\s*voice\.displayName/);
  });

  it("formats trusted DID numbers and never takes a typed DID", () => {
    expect(formatPhoneLine("+908502428852")).toBe("0850 242 88 52");
    expect(voiceAgentRuntimeActive(dids)).toBe(true);
    expect(voiceAgentRuntimeActive([])).toBe(false);
  });

  it("inherited DID stays on clinic defaults; custom DID allocates a profile key", () => {
    let draft = draftFromLoaded(legacyView(), dids);
    expect(didAssignmentPuts(dids, draft)).toEqual([]);
    draft = enableCustomDidLine(draft, "+908502428852");
    expect(draft.didLines[0]?.useCustom).toBe(true);
    expect(draft.didLines[0]?.profileKey).toMatch(/^hat\d+$/);
    expect(didAssignmentPuts(dids, draft)[0]?.voiceProfileKey).toBe(draft.didLines[0]?.profileKey);
    draft = disableCustomDidLine(draft, "+908502428852");
    expect(didAssignmentPuts(dids, draft)).toEqual([]);
    expect(allocateDidProfileKey(["hat1", "hat2"])).toBe("hat3");
  });

  it("uses the server language registry rather than a second hardcoded locale list", () => {
    expect(languages.map((item) => item.locale)).toEqual(["tr-TR", "en-US", "en-GB", "de-DE", "ar-SA", "ru-RU", "fr-FR"]);
    const ui = read("lib/voice/ui/voiceControlCenterModel.ts");
    expect(ui).not.toMatch(/VOICE_LOCALES\s*=/);
    expect(read("components/clinic/voice/VoiceControlCenter.tsx")).toContain("loaded?.languages");
  });

  it("custom-voice copy follows lifecycle and never claims readiness for a rejected voice", () => {
    const voice = (lifecycleStatus: "DRAFT" | "CONSENT_PENDING" | "PROCESSING" | "ACTIVE" | "FAILED" | "DISABLED", selectable: boolean) => ({
      selectable,
      custom: { lifecycleStatus, consentStatus: "PROVIDED" as const },
    });
    expect(customVoiceStatusCopy(voice("CONSENT_PENDING", false))).toBe("Ses sahibinin onayı bekleniyor.");
    expect(customVoiceStatusCopy(voice("PROCESSING", false))).toBe("Özel sesiniz hazırlanıyor.");
    expect(customVoiceStatusCopy(voice("ACTIVE", true))).toBe("Kullanıma hazır.");
    expect(customVoiceStatusCopy(voice("ACTIVE", false))).toBe("Ses henüz seçilebilir durumda değil.");
    expect(customVoiceStatusCopy(voice("FAILED", false))).toBe("Ses oluşturma işlemi tamamlanamadı.");
    expect(customVoiceStatusCopy(voice("DISABLED", false))).toBe("Bu ses devre dışı.");
    for (const status of ["DRAFT", "CONSENT_PENDING", "PROCESSING", "ACTIVE", "FAILED", "DISABLED"] as const) {
      expect(customVoiceStatusCopy(voice(status, false))).not.toBe("Kullanıma hazır.");
    }
    expect(customVoiceStatusCopy({ selectable: true, custom: null })).toBeNull();
  });

  it("locked custom voice is a restrained state without pricing, CTA or contradictory copy", () => {
    expect(VOICE_CONTROL_CENTER_COPY.customVoiceLocked).toContain("henüz etkin değil");
    expect(VOICE_CONTROL_CENTER_COPY.customVoiceLocked).not.toMatch(/oluşturabilirsiniz|₺|\$|€|fiyat|satın|yükselt/i);
    const ui = read("components/clinic/voice/VoiceControlCenter.tsx");
    expect(ui).toContain("customVoiceEnabled");
    expect(ui).toContain('data-testid="custom-voice-locked"');
    expect(ui).toContain("<Lock");
    expect(ui).toContain("customVoiceStatusCopy(voice)");
    expect(ui).not.toContain("Onay tamamlanmadan ve ses kullanıma hazır olmadan seçilemez");
  });

  it("access denied and session errors are not retryable; transient failures are", () => {
    expect(voiceLoadErrorKind(403)).toBe("denied");
    expect(voiceLoadErrorKind(404)).toBe("denied");
    expect(voiceLoadErrorKind(401)).toBe("unauthenticated");
    expect(voiceLoadErrorKind(500)).toBe("transient");
    expect(voiceLoadErrorKind(null)).toBe("transient");
    expect(canRetryVoiceLoad("denied")).toBe(false);
    expect(canRetryVoiceLoad("unauthenticated")).toBe(false);
    expect(canRetryVoiceLoad("transient")).toBe(true);
    expect(voiceLoadErrorMessage("denied")).toBe("Bu bölüm için erişim yetkiniz bulunmuyor.");
    const ui = read("components/clinic/voice/VoiceControlCenter.tsx");
    expect(ui).toMatch(/canRetryVoiceLoad\(kind\) && \(/);
    expect(ui).toContain("<SectionCard title={C.title}>");
  });

  it("a custom line inheriting language settings stores its own mode once a language field changes", () => {
    const inheritLine = { languageMode: "inherit" as const };
    expect(effectiveLineLanguageMode(inheritLine, "FIXED")).toBe("FIXED");
    expect(effectiveLineLanguageMode({ languageMode: "AUTO" }, "FIXED")).toBe("AUTO");
    expect(lineChangePatch(inheritLine, "FIXED", { label: "Yurt dışı" })).toEqual({ label: "Yurt dışı" });
    expect(lineChangePatch(inheritLine, "FIXED", { defaultVoiceProfileId: "v1" })).toEqual({
      languageMode: "FIXED",
      defaultVoiceProfileId: "v1",
    });
    expect(lineChangePatch({ languageMode: "FIXED" }, "FIXED", { defaultVoiceProfileId: "v1" })).toEqual({
      defaultVoiceProfileId: "v1",
    });
  });

  it("does not repeat the phone number as the line subtitle", () => {
    expect(lineSubtitle({ didE164: "+908502428852", label: "Ana Hat" })).toBe("Ana Hat");
    expect(lineSubtitle({ didE164: "+908502428852", label: "0850 242 88 52" })).toBeNull();
    expect(lineSubtitle({ didE164: "+908502428852", label: "+908502428852" })).toBeNull();
    expect(lineSubtitle({ didE164: "+908502428852", label: "  " })).toBeNull();
    expect(read("components/clinic/voice/VoiceControlCenter.tsx")).not.toContain("Profil:");
  });

  it("AUTO availability is one shared rule for the clinic and every phone line", () => {
    const twoReady: VoiceLanguageDefinition[] = languages.map((item) =>
      item.locale === "en-US" ? { ...item, status: "AVAILABLE" } : item
    );
    expect(autoLanguageAvailability(twoReady)).toEqual({ available: true, reason: null });
    const ui = read("components/clinic/voice/VoiceControlCenter.tsx");
    expect(ui.match(/<LanguageModeChoice/g)).toHaveLength(2);
    expect(ui).toContain("auto={auto}");
    expect(ui).not.toContain('["inherit", "FIXED", "AUTO"]');
    expect(ui).not.toContain("productionLocales.length < 2");
  });
});

describe("Voice Control Center HTTP client", () => {
  it("opening the page issues only GET reads", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (url.endsWith("/voices")) {
          return new Response(JSON.stringify(voices), { status: 200 });
        }
        if (url.endsWith("/did-overrides")) {
          return new Response(JSON.stringify(dids), { status: 200 });
        }
        return new Response(JSON.stringify(legacyView()), { status: 200 });
      })
    );
    const loaded = await loadVoiceControlCenter("clinic_a", "token");
    expect(loaded.settings.source).toBe("LEGACY");
    expect(calls.every((call) => call.startsWith("GET "))).toBe(true);
    expect(calls).toHaveLength(3);
    expect(calls.join("\n")).not.toMatch(/PATCH|PUT|POST|DELETE/i);
  });

  it("sends expectedVersion on save and surfaces version conflicts", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.body) bodies.push(JSON.parse(String(init.body)));
        if (String(input).includes("did-overrides") && init?.method === "PUT") {
          return new Response(JSON.stringify({ changed: true, version: 2, changedFields: ["voiceProfileKey"] }), { status: 200 });
        }
        return new Response(JSON.stringify({ changed: true, version: 1, changedFields: ["languageProfiles"] }), { status: 200 });
      })
    );
    await patchVoiceSettings("clinic_a", "token", 0, { defaultLanguage: "tr-TR" });
    expect(bodies[0]).toEqual({ expectedVersion: 0, patch: { defaultLanguage: "tr-TR" } });
    await putDidVoiceOverride("clinic_a", "token", 1, "+908502428852", "hat1");
    expect(bodies[1]).toEqual({ expectedVersion: 1, calledDid: "+908502428852", voiceProfileKey: "hat1" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "VOICE_CONFIG_REJECTED", errors: [{ code: "VOICE_SETTINGS_VERSION_CONFLICT" }] }), {
          status: 409,
        })
      )
    );
    await expect(patchVoiceSettings("clinic_a", "token", 0, { languageMode: "FIXED" })).rejects.toMatchObject({
      status: 409,
      code: "VOICE_CONFIG_REJECTED",
    });
    expect(VOICE_CONTROL_CENTER_COPY.versionConflict).toContain("başka bir oturumda");
  });

  it("unauthorized users receive a denied error without fake settings", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "VOICE_ACCESS_DENIED" }), { status: 403 })));
    try {
      await loadVoiceControlCenter("clinic_a", "token");
      throw new Error("expected deny");
    } catch (err) {
      expect(err).toBeInstanceOf(VoiceControlCenterApiError);
      expect((err as VoiceControlCenterApiError).status).toBe(403);
    }
    expect(VOICE_CONTROL_CENTER_COPY.unauthorized).toContain("erişim yetkiniz bulunmuyor");
  });
});

describe("Voice Control Center UI contract", () => {
  it("removes the fake provider/voice scaffolding", () => {
    const page = read("app/clinics/[clinicId]/voice/page.tsx");
    const ui = read("components/clinic/voice/VoiceControlCenter.tsx");
    for (const src of [page, ui]) {
      expect(src).not.toMatch(/ElevenLabs|OpenAI TTS|Azure Cognitive|Rachel|Adam|Bella|Elli/i);
      expect(src).not.toContain("Save Voice Settings");
    }
    expect(ui).toContain("{C.title}");
    expect(read("lib/voice/ui/voiceControlCenterModel.ts")).toContain('title: "Sesli Yanıt"');
    expect(page).toContain("VoiceControlCenter");
  });

  it("never renders provider ids, storage refs, credentials or phase names", () => {
    const haystack = [read("app/clinics/[clinicId]/voice/page.tsx"), read("components/clinic/voice/VoiceControlCenter.tsx")].join(
      "\n"
    );
    const customerFacing = haystack.replace(/defaultVoiceProfileId|voiceProfileId/g, "");
    for (const term of FORBIDDEN_CUSTOMER_TERMS) {
      expect(customerFacing).not.toContain(term);
    }
    expect(haystack).not.toMatch(/providerVoiceId|sampleStorageRef|consentRecordRef/);
    expect(uiProviderMentions()).toEqual([]);
  });

  it("does not offer audio preview or client-side synthesis", () => {
    const ui = read("components/clinic/voice/VoiceControlCenter.tsx");
    expect(ui).not.toMatch(/Audio\(|new Audio|speechSynthesis|previewUrl|Sesi Dinle/);
  });

  it("does not let clinic users type a DID or edit clinicId", () => {
    const ui = read("components/clinic/voice/VoiceControlCenter.tsx");
    expect(ui).toContain("didE164");
    expect(ui).not.toMatch(/type=["']tel["']/);
    expect(ui).not.toMatch(/type=["']text["'][^>]*didE164|didE164[^>]*type=["']text["']/);
    expect(ui).not.toMatch(/clinicId:\s*event/);
    expect(read("lib/voice/ui/voiceControlCenterClient.ts")).not.toMatch(/firebase\/firestore/);
    expect(read("components/clinic/voice/VoiceControlCenter.tsx")).not.toMatch(/updateDoc|setDoc|addDoc|writeBatch/);
  });

  it("phone lines use trusted server DID mappings and support empty/inherited/custom states", () => {
    const ui = read("components/clinic/voice/VoiceControlCenter.tsx");
    expect(read("lib/voice/ui/voiceControlCenterClient.ts")).toContain("did-overrides");
    expect(ui).toContain("C.noDids");
    expect(ui).toContain("C.lineSettingsLabel");
    expect(ui).toContain("C.lineInheritClinic");
    expect(ui).toContain("C.lineUseCustom");
    expect(ui).toMatch(/\{line\.useCustom && \(/);
    expect(VOICE_CONTROL_CENTER_COPY.lineSettingsLabel).toBe("Hat Ayarları");
    expect(VOICE_CONTROL_CENTER_COPY.lineInheritClinic).toBe("Klinik ayarlarını kullan");
    expect(VOICE_CONTROL_CENTER_COPY.lineUseCustom).toBe("Bu hatta özel ayarlar kullan");
    expect(ui).toContain("voice-control-stack");
    expect(ui).toContain("@media (min-width: 840px)");
    expect(ui).toContain("dir={def.rtl");
    expect(ui).toContain(":focus-visible");
  });

  it("phone assistant status is a read-only status, not a switch, and never patches enabled", () => {
    const ui = read("components/clinic/voice/VoiceControlCenter.tsx");
    const copy = read("lib/voice/ui/voiceControlCenterModel.ts");
    expect(ui).not.toContain('role="switch"');
    expect(ui).not.toContain("aria-checked");
    expect(ui).not.toMatch(/voiceConfigLabel|Voice Agent/);
    expect(copy).not.toContain("Voice Agent");
    expect(VOICE_CONTROL_CENTER_COPY.runtimeTitle).toBe("Telefon Asistanı");
    expect(VOICE_CONTROL_CENTER_COPY.runtimeActiveBody).toBe("Telefon hattınız mevcut yapılandırmayla çalışıyor.");
    expect(ui).toMatch(/label=\{runtimeActive \? C\.runtimeActive : C\.runtimeInactive\}/);
    expect(clinicSettingsPatch(draftFromLoaded(legacyView(), dids)).enabled).toBeUndefined();
    expect(ui).not.toMatch(/enabled:\s*(true|false|!)/);
  });

  it("shows exactly one runtime notice, covering the legacy state when nothing is saved", () => {
    const ui = read("components/clinic/voice/VoiceControlCenter.tsx");
    expect(ui.match(/data-testid="voice-runtime-notice"/g)).toHaveLength(1);
    expect(ui).toContain('loaded.source === "LEGACY" ? C.legacyNotice : C.runtimeNotice');
    expect(ui).not.toContain("legacyBanner");
    expect(VOICE_CONTROL_CENTER_COPY.legacyNotice).toContain("Türkçe");
    expect(VOICE_CONTROL_CENTER_COPY.legacyNotice).toContain("Henüz kaydedilmiş");
  });

  it("help text uses the secondary text token with readable contrast in both themes", () => {
    const ui = read("components/clinic/voice/VoiceControlCenter.tsx");
    expect(ui).not.toContain("UI_COLORS.textMuted");
    expect(ui).not.toContain("#34d399");
    const css = read("app/globals.css");
    const block = (selector: string) => css.slice(css.indexOf(`${selector} {`), css.indexOf("}", css.indexOf(`${selector} {`)));
    const token = (src: string, name: string) => src.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
    for (const theme of [block(":root"), block(".dark")]) {
      const fg = token(theme, "secondary-fg");
      const bg = token(theme, "card");
      expect(fg && bg).toBeTruthy();
      expect(contrastRatio(fg!, bg!)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("save bar is a sticky surface with a visible dirty state and safe-area padding", () => {
    const ui = read("components/clinic/voice/VoiceControlCenter.tsx");
    const bar = ui.slice(ui.indexOf(".voice-save-bar {"), ui.indexOf("}", ui.indexOf(".voice-save-bar {")));
    expect(bar).toContain("position: sticky");
    expect(bar).toContain("bottom: 0");
    expect(bar).toContain("background: var(--bg-card)");
    expect(bar).toContain("border: 1px solid var(--border)");
    expect(bar).toContain("box-shadow");
    expect(bar).toContain("env(safe-area-inset-bottom)");
    expect(ui).toContain('data-dirty={dirty ? "true" : "false"}');
    expect(ui).toContain("{C.dirty}");
  });
});

describe("dashboard shell", () => {
  it("uses a drawer below 768px instead of a permanent sidebar", () => {
    expect(read("app/clinics/layout.tsx")).toContain("<DashboardShell>");
    const shell = read("components/layout/DashboardShell.tsx");
    expect(shell).toContain('role="dialog"');
    expect(shell).toContain('aria-modal="true"');
    expect(shell).toContain('event.key === "Escape"');
    expect(shell).toContain("setMenuOpen(false);\n  }, [pathname]);");
    const header = read("components/layout/Header.tsx");
    expect(header).toContain('aria-label="Menüyü aç"');
    expect(header).toContain("aria-expanded={menuOpen}");
    const css = read("app/globals.css");
    const mobile = css.slice(css.indexOf("@media (max-width: 767px)"));
    expect(mobile).toMatch(/\.cb-shell-sidebar \{ display: none; \}/);
    expect(mobile).toMatch(/\.cb-menu-trigger \{ display: inline-flex; \}/);
    expect(mobile).toMatch(/\.cb-clinic-main \{ padding: 20px 16px/);
    expect(css).toMatch(/\.cb-clinic-main \{ padding: 32px 40px; \}/);
  });

  it("clinic tabs keep horizontal scrolling and the shell padding is responsive", () => {
    const shell = read("components/clinic/ClinicShell.tsx");
    expect(shell).not.toContain('padding: "32px 40px"');
    expect(shell).not.toContain('padding: "24px 40px 0"');
    expect(shell).toContain('className="cb-clinic-main"');
    expect(shell).toMatch(/className="cb-clinic-tabs" style=\{\{ display: "flex", gap: 8, overflowX: "auto"/);
  });

  it("tab content has no non-scrolling overflow wrapper that would break sticky save bars", () => {
    const shell = read("components/clinic/ClinicShell.tsx");
    expect(shell).toContain('<main className="cb-clinic-main" style={{ flex: 1 }}>');
    expect(shell).toContain('<div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>');
    const css = read("app/globals.css");
    expect(css).toMatch(/\.cb-shell-scroll \{ flex: 1; min-width: 0; overflow-y: auto; \}/);
  });
});

function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function uiProviderMentions(): string[] {
  const ui = read("components/clinic/voice/VoiceControlCenter.tsx") + read("app/clinics/[clinicId]/voice/page.tsx");
  const hits: string[] = [];
  if (/cartesia/i.test(ui)) hits.push("cartesia");
  if (/WORKER_ENV/.test(ui)) hits.push("WORKER_ENV");
  if (/providerVoiceId/.test(ui)) hits.push("providerVoiceId");
  return hits;
}

describe("runtime isolation", () => {
  it("control-center UI does not import into worker, Agent Core, RAG or speech stack", () => {
    const roots = ["workers/voice/src", "lib/voice/telephony", "lib/agent", "lib/conversation", "lib/voice/runtime"];
    const offenders = roots
      .flatMap((root) => sourceFiles(resolve(REPO, root)))
      .filter((file) => /voice\/ui|VoiceControlCenter/.test(readFileSync(file, "utf8")));
    expect(offenders.map((file) => relative(REPO, file))).toEqual([]);
  });

  it("Turkish speech stack constants remain the production runtime", () => {
    const stack = read("workers/voice/src/call/speechStack.ts");
    expect(stack).toContain('export const VOICE_SPEECH_LANGUAGE = "tr";');
    expect(stack).toContain('model: "deepgram/nova-3"');
    expect(stack).toContain("cartesia/sonic-3.5");
  });
});
