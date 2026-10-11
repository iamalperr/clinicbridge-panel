/**
 * Client-side Voice Control Center model: drafts, dirty detection, and Phase 4A patches.
 * Does not write Firestore and does not talk to the speech runtime.
 */

import type { VoiceLanguageDefinition, VoiceLocale } from "@/lib/voice/config/languageRegistry";
import type {
  DidVoiceProfile,
  LanguageProfileSettings,
  VoiceLanguageMode,
  VoiceSettingsPatch,
} from "@/lib/voice/config/types";
import { LEGACY_TURKISH_VOICE_PROFILE_ID, type VoiceProfileSummary } from "@/lib/voice/config/voiceProfiles";

export const VOICE_CONTROL_CENTER_COPY = {
  title: "Sesli Yanıt",
  subtitle:
    "Kliniğinizin telefon asistanını, konuşma dillerini ve telefon hatlarını buradan yönetin.",
  runtimeTitle: "Telefon Asistanı",
  runtimeActive: "Aktif",
  runtimeInactive: "Pasif",
  runtimeActiveBody: "Telefon hattınız mevcut yapılandırmayla çalışıyor.",
  runtimeInactiveBody: "Bu kliniğe bağlı aktif bir telefon hattı bulunmuyor.",
  runtimeNotice:
    "Burada kaydettiğiniz ses ve dil ayarları saklanır; canlı görüşmelere ayrıca etkinleştirildiğinde uygulanır.",
  legacyNotice:
    "Henüz kaydedilmiş bir ses ayarınız yok. Telefon hattınız mevcut Türkçe yapılandırmayla çalışmaya devam ediyor; burada kaydettiğiniz ayarlar canlı görüşmelere ayrıca etkinleştirildiğinde uygulanır.",
  generalTitle: "Genel Ayarlar",
  languageModeLabel: "Dil Modu",
  fixedLanguage: "Sabit Dil",
  autoLanguage: "Otomatik Dil Algılama",
  autoUnavailable:
    "Otomatik dil algılama, birden fazla dil canlı görüşmeler için hazır olduğunda kullanılabilecek.",
  previewLanguagesHint: "“Yakında” olarak işaretli diller listelenir ancak canlı görüşmelerde henüz kullanılamaz.",
  defaultLanguage: "Ana Dil",
  fallbackLanguage: "Yedek Dil",
  supportedLanguages: "Desteklenen Diller",
  allowSwitch: "Görüşme sırasında dil değişimine izin ver",
  previewBadge: "Yakında",
  languagesTitle: "Diller ve Sesler",
  voiceLabel: "Ses",
  greetingLabel: "Karşılama Mesajı",
  greetingInherit: "Varsayılan karşılama mesajı kullanılıyor.",
  greetingCustom: "Özel karşılama mesajı",
  greetingPlaceholder: (clinicName: string) =>
    `Merhaba, ${clinicName}'na hoş geldiniz. Size nasıl yardımcı olabilirim?`,
  previewUnavailable: "Ses önizlemesi henüz kullanılamıyor.",
  phoneLinesTitle: "Telefon Hatları",
  noDids: "Bu kliniğe atanmış bir telefon hattı yok.",
  noDidsHint: "Telefon hatları yalnızca sistem tarafından atanan numaralardan oluşur.",
  primaryLine: "Ana Hat",
  lineSettingsLabel: "Hat Ayarları",
  lineInheritClinic: "Klinik ayarlarını kullan",
  lineUseCustom: "Bu hatta özel ayarlar kullan",
  lineLabel: "Hat adı",
  customVoiceTitle: "Kliniğe Özel Ses",
  customVoiceLockedBadge: "Hesabınızda etkin değil",
  customVoiceLocked:
    "Kliniğinize özel ses bu hesapta henüz etkin değil. Etkinleştirildiğinde kayıtlı sesleriniz ve onay durumları burada görünür.",
  customVoiceEmpty: "Kayıtlı özel ses bulunmuyor.",
  dirty: "Kaydedilmemiş değişiklikler",
  clean: "Tüm değişiklikler kaydedildi",
  save: "Kaydet",
  saved: "Ayarlar kaydedildi.",
  versionConflict:
    "Ayarlar başka bir oturumda güncellendi. Güncel ayarları yeniden yükleyerek değişikliklerinizi kontrol edin.",
  loadError: "Ayarlar şu anda yüklenemedi. Lütfen tekrar deneyin.",
  saveError: "Ayarlar kaydedilemedi. Lütfen tekrar deneyin.",
  unauthorized: "Bu bölüm için erişim yetkiniz bulunmuyor.",
  unauthenticated: "Oturumunuzun süresi doldu. Lütfen yeniden giriş yapın.",
  loading: "Ayarlar yükleniyor",
  saving: "Kaydediliyor…",
  retry: "Tekrar dene",
  reload: "Güncel ayarları yükle",
} as const;

/** Customer-facing names for code-defined voices; the backend profile id and name stay unchanged. */
const CUSTOMER_VOICE_NAMES: Readonly<Record<string, string>> = {
  [LEGACY_TURKISH_VOICE_PROFILE_ID]: "Türkçe Karşılama Sesi",
};

export function customerVoiceName(voice: Pick<VoiceProfileSummary, "id" | "displayName">): string {
  return CUSTOMER_VOICE_NAMES[voice.id] ?? voice.displayName;
}

export function customVoiceStatusCopy(
  voice: Pick<VoiceProfileSummary, "selectable" | "custom">
): string | null {
  const lifecycle = voice.custom?.lifecycleStatus;
  switch (lifecycle) {
    case "DRAFT":
    case "PROCESSING":
      return "Özel sesiniz hazırlanıyor.";
    case "CONSENT_PENDING":
      return "Ses sahibinin onayı bekleniyor.";
    case "ACTIVE":
      return voice.selectable ? "Kullanıma hazır." : "Ses henüz seçilebilir durumda değil.";
    case "FAILED":
      return "Ses oluşturma işlemi tamamlanamadı.";
    case "DISABLED":
      return "Bu ses devre dışı.";
    default:
      return null;
  }
}

export interface AutoLanguageAvailability {
  readonly available: boolean;
  readonly reason: string | null;
}

/** Same rule as the backend: AUTO needs at least two runtime-ready languages. */
export function autoLanguageAvailability(
  languages: readonly VoiceLanguageDefinition[]
): AutoLanguageAvailability {
  const ready = languages.filter(isRuntimeReadyLanguage).length;
  return ready >= 2
    ? { available: true, reason: null }
    : { available: false, reason: VOICE_CONTROL_CENTER_COPY.autoUnavailable };
}

export type VoiceLoadErrorKind = "denied" | "unauthenticated" | "transient";

export function voiceLoadErrorKind(status: number | null): VoiceLoadErrorKind {
  if (status === 401) return "unauthenticated";
  if (status === 403 || status === 404) return "denied";
  return "transient";
}

export function voiceLoadErrorMessage(kind: VoiceLoadErrorKind): string {
  if (kind === "denied") return VOICE_CONTROL_CENTER_COPY.unauthorized;
  if (kind === "unauthenticated") return VOICE_CONTROL_CENTER_COPY.unauthenticated;
  return VOICE_CONTROL_CENTER_COPY.loadError;
}

export function canRetryVoiceLoad(kind: VoiceLoadErrorKind): boolean {
  return kind === "transient";
}

/** Line subtitle, or null when it would only repeat the phone number. */
export function lineSubtitle(line: Pick<DidLineDraft, "didE164" | "label">): string | null {
  const label = line.label.trim();
  if (!label) return null;
  const digits = (value: string) => value.replace(/\D/g, "");
  if (label === formatPhoneLine(line.didE164) || digits(label) === digits(line.didE164)) return null;
  return label;
}

const FLAG_BY_LOCALE: Record<string, string> = {
  "tr-TR": "🇹🇷",
  "en-US": "🇺🇸",
  "en-GB": "🇬🇧",
  "de-DE": "🇩🇪",
  "ar-SA": "🇸🇦",
  "ru-RU": "🇷🇺",
  "fr-FR": "🇫🇷",
};

export interface VoiceSettingsClientView {
  readonly clinicId: string;
  readonly source: "LEGACY" | "VOICE_SETTINGS";
  readonly settings: {
    readonly clinicId: string;
    readonly enabled: boolean;
    readonly languageMode: VoiceLanguageMode;
    readonly defaultLanguage: VoiceLocale;
    readonly fallbackLanguage: VoiceLocale;
    readonly supportedLanguages: readonly VoiceLocale[];
    readonly allowLanguageSwitch: boolean;
    readonly defaultVoiceProfileId: string;
    readonly languageProfiles: Readonly<Partial<Record<VoiceLocale, LanguageProfileSettings>>>;
    readonly didProfiles: Readonly<Record<string, DidVoiceProfile>>;
    readonly customVoiceEnabled: boolean;
    readonly version: number;
    readonly updatedAt: string | null;
    readonly updatedBy: { readonly uid: string; readonly role: string } | null;
  };
  readonly storedConfigErrors: readonly { readonly code: string; readonly field?: string }[];
  readonly languages: readonly VoiceLanguageDefinition[];
}

export interface DidVoiceOverrideClientView {
  readonly didE164: string;
  readonly active: boolean;
  readonly voiceEnabled: boolean;
  readonly voiceProfileKey: string | null;
  readonly profileLabel: string | null;
}

export interface VoiceCatalogClientView {
  readonly available: readonly VoiceProfileSummary[];
  readonly custom: readonly VoiceProfileSummary[];
}

export interface LanguageRowDraft {
  voiceProfileId: string | null;
  greetingMode: "inherit" | "custom";
  greetingText: string;
}

export interface DidLineDraft {
  didE164: string;
  active: boolean;
  voiceEnabled: boolean;
  useCustom: boolean;
  profileKey: string | null;
  label: string;
  languageMode: VoiceLanguageMode | "inherit";
  defaultLanguage: VoiceLocale;
  fallbackLanguage: VoiceLocale;
  supportedLanguages: VoiceLocale[];
  allowLanguageSwitch: boolean;
  defaultVoiceProfileId: string;
  languageRows: Partial<Record<VoiceLocale, LanguageRowDraft>>;
}

export interface VoiceControlDraft {
  languageMode: VoiceLanguageMode;
  defaultLanguage: VoiceLocale;
  fallbackLanguage: VoiceLocale;
  supportedLanguages: VoiceLocale[];
  allowLanguageSwitch: boolean;
  defaultVoiceProfileId: string;
  languageRows: Partial<Record<VoiceLocale, LanguageRowDraft>>;
  didLines: DidLineDraft[];
  didProfiles: Record<string, DidVoiceProfile>;
}

export function localeFlag(locale: string): string {
  return FLAG_BY_LOCALE[locale] ?? "";
}

export function isRuntimeReadyLanguage(def: VoiceLanguageDefinition | undefined): boolean {
  return def?.status === "AVAILABLE";
}

export function languageByLocale(
  languages: readonly VoiceLanguageDefinition[],
  locale: string
): VoiceLanguageDefinition | undefined {
  return languages.find((item) => item.locale === locale);
}

export function formatPhoneLine(didE164: string): string {
  const digits = didE164.replace(/\D/g, "");
  if (digits.startsWith("90") && digits.length === 12) {
    const national = digits.slice(2);
    return `0${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6, 8)} ${national.slice(8)}`;
  }
  return didE164.startsWith("+") ? didE164 : digits ? `+${digits}` : didE164;
}

export function voiceAgentRuntimeActive(dids: readonly DidVoiceOverrideClientView[]): boolean {
  return dids.some((did) => did.active && did.voiceEnabled);
}

function emptyRow(): LanguageRowDraft {
  return { voiceProfileId: null, greetingMode: "inherit", greetingText: "" };
}

function rowFromProfile(profile: LanguageProfileSettings | undefined): LanguageRowDraft {
  if (!profile) return emptyRow();
  const greeting = profile.greeting;
  return {
    voiceProfileId: profile.voiceProfileId,
    greetingMode: greeting && greeting.trim().length > 0 ? "custom" : "inherit",
    greetingText: greeting ?? "",
  };
}

export function draftFromLoaded(
  view: VoiceSettingsClientView,
  dids: readonly DidVoiceOverrideClientView[]
): VoiceControlDraft {
  const s = view.settings;
  const languageRows: Partial<Record<VoiceLocale, LanguageRowDraft>> = {};
  for (const locale of s.supportedLanguages) {
    languageRows[locale] = rowFromProfile(s.languageProfiles[locale]);
  }
  const didProfiles = { ...s.didProfiles };
  const didLines: DidLineDraft[] = dids.map((did, index) => {
    const key = did.voiceProfileKey;
    const profile = key ? didProfiles[key] : undefined;
    const useCustom = Boolean(key && profile);
    const supported = profile?.supportedLanguages ? [...profile.supportedLanguages] : [...s.supportedLanguages];
    const languageRowsForDid: Partial<Record<VoiceLocale, LanguageRowDraft>> = {};
    for (const locale of supported) {
      const lp = profile?.languageProfiles?.[locale];
      languageRowsForDid[locale] = {
        voiceProfileId: lp?.voiceProfileId ?? null,
        greetingMode: lp?.greeting && lp.greeting.trim() ? "custom" : "inherit",
        greetingText: lp?.greeting ?? "",
      };
    }
    return {
      didE164: did.didE164,
      active: did.active,
      voiceEnabled: did.voiceEnabled,
      useCustom,
      profileKey: useCustom ? key : null,
      label: profile?.label || did.profileLabel || (index === 0 ? VOICE_CONTROL_CENTER_COPY.primaryLine : `Hat ${index + 1}`),
      languageMode: profile?.languageMode ?? "inherit",
      defaultLanguage: profile?.defaultLanguage ?? s.defaultLanguage,
      fallbackLanguage: profile?.fallbackLanguage ?? s.fallbackLanguage,
      supportedLanguages: supported,
      allowLanguageSwitch: profile?.allowLanguageSwitch ?? s.allowLanguageSwitch,
      defaultVoiceProfileId: profile?.defaultVoiceProfileId ?? s.defaultVoiceProfileId,
      languageRows: languageRowsForDid,
    };
  });
  return {
    languageMode: s.languageMode,
    defaultLanguage: s.defaultLanguage,
    fallbackLanguage: s.fallbackLanguage,
    supportedLanguages: [...s.supportedLanguages],
    allowLanguageSwitch: s.allowLanguageSwitch,
    defaultVoiceProfileId: s.defaultVoiceProfileId,
    languageRows,
    didLines,
    didProfiles,
  };
}

export function snapshotDraft(draft: VoiceControlDraft): string {
  return JSON.stringify(draft);
}

export function isDraftDirty(baseline: string, draft: VoiceControlDraft): boolean {
  return snapshotDraft(draft) !== baseline;
}

export function allocateDidProfileKey(existing: readonly string[]): string {
  for (let i = 1; i <= 99; i++) {
    const key = `hat${i}`;
    if (!existing.includes(key)) return key;
  }
  return `hat${Date.now().toString(36).slice(-8)}`;
}

function trimGreeting(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 500);
}

function buildLanguageProfiles(
  locales: readonly VoiceLocale[],
  rows: Partial<Record<VoiceLocale, LanguageRowDraft>>,
  defaultVoiceId: string
): Partial<Record<VoiceLocale, LanguageProfileSettings>> {
  const out: Partial<Record<VoiceLocale, LanguageProfileSettings>> = {};
  for (const locale of locales) {
    const row = rows[locale] ?? emptyRow();
    const greeting = row.greetingMode === "custom" ? trimGreeting(row.greetingText) : null;
    const voiceProfileId =
      row.voiceProfileId && row.voiceProfileId !== defaultVoiceId ? row.voiceProfileId : null;
    if (greeting || voiceProfileId) {
      out[locale] = { enabled: true, voiceProfileId, greeting };
    }
  }
  return out;
}

function buildDidProfile(line: DidLineDraft): DidVoiceProfile {
  const profile: DidVoiceProfile = { label: line.label.trim() || VOICE_CONTROL_CENTER_COPY.primaryLine };
  if (line.languageMode !== "inherit") {
    const next: DidVoiceProfile = {
      ...profile,
      languageMode: line.languageMode,
      defaultLanguage: line.defaultLanguage,
      fallbackLanguage: line.languageMode === "AUTO" ? line.fallbackLanguage : line.defaultLanguage,
      supportedLanguages:
        line.languageMode === "AUTO" ? line.supportedLanguages : [line.defaultLanguage],
      allowLanguageSwitch: line.languageMode === "AUTO" ? line.allowLanguageSwitch : false,
      defaultVoiceProfileId: line.defaultVoiceProfileId,
    };
    const locales = next.supportedLanguages ?? [line.defaultLanguage];
    const languageProfiles: Partial<Record<VoiceLocale, { voiceProfileId?: string; greeting?: string }>> = {};
    for (const locale of locales) {
      const row = line.languageRows[locale];
      if (!row) continue;
      const greeting = row.greetingMode === "custom" ? trimGreeting(row.greetingText) : undefined;
      const voiceProfileId = row.voiceProfileId || undefined;
      if (greeting || voiceProfileId) {
        languageProfiles[locale] = {
          ...(voiceProfileId ? { voiceProfileId } : {}),
          ...(greeting ? { greeting } : {}),
        };
      }
    }
    if (Object.keys(languageProfiles).length) {
      return { ...next, languageProfiles };
    }
    return next;
  }
  return profile;
}

export function clinicSettingsPatch(draft: VoiceControlDraft): VoiceSettingsPatch {
  const supported =
    draft.languageMode === "FIXED" ? [draft.defaultLanguage] : [...draft.supportedLanguages];
  const fallback = draft.languageMode === "FIXED" ? draft.defaultLanguage : draft.fallbackLanguage;
  const didProfiles: Record<string, DidVoiceProfile> = { ...draft.didProfiles };
  for (const line of draft.didLines) {
    if (!line.useCustom || !line.profileKey) continue;
    didProfiles[line.profileKey] = buildDidProfile(line);
  }

  return {
    languageMode: draft.languageMode,
    defaultLanguage: draft.defaultLanguage,
    fallbackLanguage: fallback,
    supportedLanguages: supported,
    allowLanguageSwitch: draft.languageMode === "AUTO" ? draft.allowLanguageSwitch : false,
    defaultVoiceProfileId: draft.defaultVoiceProfileId,
    languageProfiles: buildLanguageProfiles(supported, draft.languageRows, draft.defaultVoiceProfileId),
    didProfiles,
  };
}

export function didAssignmentPuts(
  loaded: readonly DidVoiceOverrideClientView[],
  draft: VoiceControlDraft
): { calledDid: string; voiceProfileKey: string | null }[] {
  const byDid = new Map(draft.didLines.map((line) => [line.didE164, line]));
  const out: { calledDid: string; voiceProfileKey: string | null }[] = [];
  for (const did of loaded) {
    const line = byDid.get(did.didE164);
    const nextKey = line?.useCustom && line.profileKey ? line.profileKey : null;
    const current = did.voiceProfileKey;
    if (nextKey !== current) out.push({ calledDid: did.didE164, voiceProfileKey: nextKey });
  }
  return out;
}

export function settingsPatchChanged(
  loaded: VoiceSettingsClientView,
  patch: VoiceSettingsPatch
): boolean {
  const s = loaded.settings;
  return (
    patch.languageMode !== s.languageMode ||
    patch.defaultLanguage !== s.defaultLanguage ||
    patch.fallbackLanguage !== s.fallbackLanguage ||
    JSON.stringify(patch.supportedLanguages) !== JSON.stringify(s.supportedLanguages) ||
    patch.allowLanguageSwitch !== s.allowLanguageSwitch ||
    patch.defaultVoiceProfileId !== s.defaultVoiceProfileId ||
    JSON.stringify(patch.languageProfiles) !== JSON.stringify(s.languageProfiles) ||
    JSON.stringify(patch.didProfiles) !== JSON.stringify(s.didProfiles)
  );
}

export function enableCustomDidLine(draft: VoiceControlDraft, didE164: string): VoiceControlDraft {
  const existing = Object.keys(draft.didProfiles).concat(
    draft.didLines.map((line) => line.profileKey).filter((k): k is string => Boolean(k))
  );
  return {
    ...draft,
    didLines: draft.didLines.map((line) => {
      if (line.didE164 !== didE164) return line;
      const profileKey = line.profileKey ?? allocateDidProfileKey(existing);
      return { ...line, useCustom: true, profileKey };
    }),
  };
}

export function disableCustomDidLine(draft: VoiceControlDraft, didE164: string): VoiceControlDraft {
  return {
    ...draft,
    didLines: draft.didLines.map((line) =>
      line.didE164 === didE164 ? { ...line, useCustom: false } : line
    ),
  };
}

export function selectableVoicesForLocale(
  available: readonly VoiceProfileSummary[],
  locale: VoiceLocale
): VoiceProfileSummary[] {
  return available.filter((voice) => voice.selectable && voice.supportedLocales.includes(locale));
}

export function previewLocalesCannotBeDefault(
  languages: readonly VoiceLanguageDefinition[],
  locale: VoiceLocale
): boolean {
  return !isRuntimeReadyLanguage(languageByLocale(languages, locale));
}

export function voiceDisplayName(
  available: readonly VoiceProfileSummary[],
  id: string | null | undefined
): string | null {
  if (!id) return null;
  const voice = available.find((item) => item.id === id);
  return voice ? customerVoiceName(voice) : null;
}

export function effectiveLineLanguageMode(
  line: Pick<DidLineDraft, "languageMode">,
  clinicMode: VoiceLanguageMode
): VoiceLanguageMode {
  return line.languageMode === "inherit" ? clinicMode : line.languageMode;
}

/**
 * A custom line that still inherits language settings starts storing its own language mode
 * as soon as a language, voice, or greeting field is edited, so the edit is actually saved.
 */
export function lineChangePatch(
  line: Pick<DidLineDraft, "languageMode">,
  clinicMode: VoiceLanguageMode,
  patch: Partial<DidLineDraft>
): Partial<DidLineDraft> {
  if (line.languageMode !== "inherit" || "languageMode" in patch) return patch;
  const keys = Object.keys(patch);
  if (keys.length === 0 || keys.every((key) => key === "label")) return patch;
  return { languageMode: clinicMode, ...patch };
}

export function customerFacingSourceScanHaystack(source: string): string {
  return source;
}

export const FORBIDDEN_CUSTOMER_TERMS = [
  "providerVoiceId",
  "sampleStorageRef",
  "consentRecordRef",
  "WORKER_ENV",
  "ElevenLabs",
  "Rachel",
  "Phase 4A",
  "Phase 4B",
  "Phase 4C",
  "Phase 4D",
  "BCP-47",
  "DID override",
  "VoiceProfileId",
];
