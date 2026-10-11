"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Lock, Phone } from "lucide-react";
import SectionCard from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { useAuth } from "@/lib/auth-context";
import type { VoiceLanguageDefinition, VoiceLocale } from "@/lib/voice/config/languageRegistry";
import type { VoiceLanguageMode } from "@/lib/voice/config/types";
import {
  VoiceControlCenterApiError,
  loadVoiceControlCenter,
  patchVoiceSettings,
  putDidVoiceOverride,
} from "@/lib/voice/ui/voiceControlCenterClient";
import {
  VOICE_CONTROL_CENTER_COPY as C,
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
  isRuntimeReadyLanguage,
  languageByLocale,
  lineChangePatch,
  lineSubtitle,
  localeFlag,
  selectableVoicesForLocale,
  settingsPatchChanged,
  snapshotDraft,
  voiceAgentRuntimeActive,
  voiceLoadErrorKind,
  voiceLoadErrorMessage,
  type AutoLanguageAvailability,
  type DidLineDraft,
  type DidVoiceOverrideClientView,
  type LanguageRowDraft,
  type VoiceCatalogClientView,
  type VoiceControlDraft,
  type VoiceLoadErrorKind,
  type VoiceSettingsClientView,
} from "@/lib/voice/ui/voiceControlCenterModel";

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: 12.5,
  fontWeight: 600,
  color: UI_COLORS.textSecondary,
  marginBottom: 8,
};

const hintStyle: React.CSSProperties = {
  margin: "8px 0 0",
  fontSize: 12.5,
  color: UI_COLORS.textSecondary,
  lineHeight: 1.45,
};

const noticeStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 10,
  background: "rgba(99,102,241,0.08)",
  border: "1px solid rgba(99,102,241,0.18)",
  color: UI_COLORS.textSecondary,
  fontSize: 13,
  lineHeight: 1.5,
};

const rowCard: React.CSSProperties = {
  padding: 16,
  borderRadius: 12,
  background: "var(--bg-input)",
  border: "1px solid var(--border)",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const choiceRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 14,
  flexWrap: "wrap",
};

function LanguageName({ def }: { def: VoiceLanguageDefinition }) {
  return (
    <span dir={def.rtl ? "rtl" : "ltr"} lang={def.locale} style={{ unicodeBidi: "isolate" }}>
      {def.nativeName}
    </span>
  );
}

function LanguageModeChoice({
  name,
  value,
  auto,
  onChange,
}: {
  name: string;
  value: VoiceLanguageMode;
  auto: AutoLanguageAvailability;
  onChange: (mode: VoiceLanguageMode) => void;
}) {
  return (
    <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
      <legend style={fieldLabel}>{C.languageModeLabel}</legend>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(["FIXED", "AUTO"] as const).map((mode) => {
          const locked = mode === "AUTO" && !auto.available;
          return (
            <label key={mode} style={{ ...choiceRow, cursor: locked ? "not-allowed" : "pointer" }}>
              <input
                type="radio"
                name={name}
                value={mode}
                checked={value === mode}
                disabled={locked}
                aria-describedby={locked ? `${name}-auto-reason` : undefined}
                onChange={() => onChange(mode)}
              />
              <span style={{ color: locked ? UI_COLORS.textSecondary : UI_COLORS.textPrimary }}>
                {mode === "FIXED" ? C.fixedLanguage : C.autoLanguage}
              </span>
              {locked && <Badge variant="info" label={C.previewBadge} />}
            </label>
          );
        })}
      </div>
      {auto.reason && (
        <p id={`${name}-auto-reason`} style={hintStyle}>
          {auto.reason}
        </p>
      )}
    </fieldset>
  );
}

interface LoadFailure {
  kind: VoiceLoadErrorKind;
  message: string;
}

export default function VoiceControlCenter({
  clinicId,
  clinicName,
}: {
  clinicId: string;
  clinicName: string;
}) {
  const { getToken } = useAuth();
  const formId = useId();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<VoiceSettingsClientView | null>(null);
  const [voices, setVoices] = useState<VoiceCatalogClientView | null>(null);
  const [dids, setDids] = useState<DidVoiceOverrideClientView[]>([]);
  const [draft, setDraft] = useState<VoiceControlDraft | null>(null);
  const [baseline, setBaseline] = useState("");

  const fail = useCallback((status: number | null) => {
    const kind = voiceLoadErrorKind(status);
    setFailure({ kind, message: voiceLoadErrorMessage(kind) });
    setLoaded(null);
    setDraft(null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    setSuccess(null);
    setFieldError(null);
    try {
      const token = await getToken();
      if (!token) {
        fail(401);
        return;
      }
      const data = await loadVoiceControlCenter(clinicId, token);
      const nextDraft = draftFromLoaded(data.settings, data.dids);
      setLoaded(data.settings);
      setVoices(data.voices);
      setDids(data.dids);
      setDraft(nextDraft);
      setBaseline(snapshotDraft(nextDraft));
    } catch (err) {
      fail(err instanceof VoiceControlCenterApiError ? err.status : null);
    } finally {
      setLoading(false);
    }
  }, [clinicId, getToken, fail]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = Boolean(draft && isDraftDirty(baseline, draft));

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = C.dirty;
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  const registry = useMemo(() => loaded?.languages ?? [], [loaded]);
  const runtimeActive = voiceAgentRuntimeActive(dids);
  const availableLocales = registry.filter((item) => item.status !== "RETIRED");
  const productionLocales = registry.filter(isRuntimeReadyLanguage);
  const auto = useMemo(() => autoLanguageAvailability(registry), [registry]);

  const voiceOptions = useCallback(
    (locale: VoiceLocale) =>
      selectableVoicesForLocale(voices?.available ?? [], locale).map((voice) => ({
        value: voice.id,
        label: customerVoiceName(voice),
      })),
    [voices]
  );

  const greetingPlaceholder = useMemo(() => C.greetingPlaceholder(clinicName || "klinik"), [clinicName]);

  function updateDraft(mutator: (current: VoiceControlDraft) => VoiceControlDraft) {
    setDraft((current) => (current ? mutator(current) : current));
    setSuccess(null);
    setFieldError(null);
  }

  function setLanguageMode(mode: VoiceLanguageMode) {
    if (mode === "AUTO" && !auto.available) return;
    updateDraft((current) => {
      if (mode === "FIXED") {
        return {
          ...current,
          languageMode: mode,
          fallbackLanguage: current.defaultLanguage,
          supportedLanguages: [current.defaultLanguage],
          allowLanguageSwitch: false,
        };
      }
      const supported = current.supportedLanguages.includes(current.defaultLanguage)
        ? current.supportedLanguages
        : [current.defaultLanguage, ...current.supportedLanguages];
      return { ...current, languageMode: mode, supportedLanguages: supported };
    });
  }

  function toggleSupported(locale: VoiceLocale, on: boolean) {
    updateDraft((current) => {
      if (locale === current.defaultLanguage && !on) return current;
      const next = on
        ? Array.from(new Set([...current.supportedLanguages, locale]))
        : current.supportedLanguages.filter((item) => item !== locale);
      const rows = { ...current.languageRows };
      if (on && !rows[locale]) rows[locale] = { voiceProfileId: null, greetingMode: "inherit", greetingText: "" };
      return { ...current, supportedLanguages: next, languageRows: rows };
    });
  }

  function updateRow(locale: VoiceLocale, patch: Partial<LanguageRowDraft>) {
    updateDraft((current) => ({
      ...current,
      languageRows: {
        ...current.languageRows,
        [locale]: { ...(current.languageRows[locale] ?? { voiceProfileId: null, greetingMode: "inherit", greetingText: "" }), ...patch },
      },
    }));
  }

  function updateLine(didE164: string, patch: Partial<DidLineDraft>) {
    updateDraft((current) => ({
      ...current,
      didLines: current.didLines.map((line) =>
        line.didE164 === didE164 ? { ...line, ...lineChangePatch(line, current.languageMode, patch) } : line
      ),
    }));
  }

  async function handleSave() {
    if (!draft || !loaded || !dirty) return;
    setSaving(true);
    setFieldError(null);
    setSuccess(null);
    try {
      const token = await getToken();
      if (!token) {
        fail(401);
        return;
      }
      const patch = clinicSettingsPatch(draft);
      let version = loaded.settings.version;
      if (settingsPatchChanged(loaded, patch)) {
        const result = await patchVoiceSettings(clinicId, token, version, patch);
        version = result.version;
      }
      const assignments = didAssignmentPuts(dids, draft);
      for (const assignment of assignments) {
        const result = await putDidVoiceOverride(
          clinicId,
          token,
          version,
          assignment.calledDid,
          assignment.voiceProfileKey
        );
        version = result.version;
      }
      await load();
      setSuccess(C.saved);
    } catch (err) {
      if (err instanceof VoiceControlCenterApiError && (err.status === 409 || err.code === "VOICE_SETTINGS_VERSION_CONFLICT")) {
        setFieldError(C.versionConflict);
      } else if (err instanceof VoiceControlCenterApiError && (err.status === 401 || err.status === 403)) {
        fail(err.status);
      } else {
        setFieldError(C.saveError);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading && !draft) {
    return (
      <div role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 10, color: UI_COLORS.textSecondary, padding: "40px 0" }}>
        <Loader2 size={18} aria-hidden style={{ animation: "spin 0.8s linear infinite" }} />
        {C.loading}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (failure || !draft || !loaded || !voices) {
    const kind = failure?.kind ?? "transient";
    return (
      <SectionCard title={C.title}>
        <p role="alert" style={{ color: UI_COLORS.textSecondary, fontSize: 14, margin: 0 }}>
          {failure?.message ?? C.loadError}
        </p>
        {canRetryVoiceLoad(kind) && (
          <Button type="button" variant="secondary" onClick={() => void load()} style={{ marginTop: 16 }}>
            {C.retry}
          </Button>
        )}
      </SectionCard>
    );
  }

  const supportedForCards =
    draft.languageMode === "FIXED" ? [draft.defaultLanguage] : draft.supportedLanguages;

  return (
    <div className="voice-control-center">
      <style>{`
        .voice-control-center :focus-visible {
          outline: 2px solid var(--brand);
          outline-offset: 2px;
        }
        .voice-control-stack {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
        }
        @media (min-width: 840px) {
          .voice-control-two {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
          }
        }
        .voice-save-bar {
          position: sticky;
          bottom: 0;
          z-index: 5;
          margin-top: 8px;
          padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 12px;
          box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.18);
        }
        @media (max-width: 767px) {
          .voice-save-bar { margin-left: -4px; margin-right: -4px; }
          .voice-save-bar button { flex: 1 1 auto; }
        }
      `}</style>

      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: UI_COLORS.textPrimary, letterSpacing: "-0.3px" }}>{C.title}</h1>
        <p style={{ marginTop: 6, fontSize: 14, color: UI_COLORS.textSecondary, lineHeight: 1.5, maxWidth: 640 }}>
          {C.subtitle}
        </p>
      </header>

      <SectionCard>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div
            aria-hidden
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "rgba(168,85,247,0.12)",
              color: "#a855f7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Phone size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: UI_COLORS.textPrimary }}>{C.runtimeTitle}</h2>
              <Badge
                variant={runtimeActive ? "active" : "inactive"}
                label={runtimeActive ? C.runtimeActive : C.runtimeInactive}
                dot
              />
            </div>
            <p style={{ marginTop: 6, fontSize: 13.5, color: UI_COLORS.textSecondary, lineHeight: 1.5 }}>
              {runtimeActive ? C.runtimeActiveBody : C.runtimeInactiveBody}
            </p>
          </div>
        </div>
        <p data-testid="voice-runtime-notice" style={{ ...noticeStyle, marginTop: 16 }}>
          {loaded.source === "LEGACY" ? C.legacyNotice : C.runtimeNotice}
        </p>
      </SectionCard>

      <SectionCard title={C.generalTitle}>
        <div className="voice-control-stack">
          <LanguageModeChoice
            name={`${formId}-lang-mode`}
            value={draft.languageMode}
            auto={auto}
            onChange={setLanguageMode}
          />

          <div className="voice-control-two" style={{ display: "grid", gap: 16 }}>
            <Select
              id={`${formId}-default-lang`}
              label={C.defaultLanguage}
              value={draft.defaultLanguage}
              options={productionLocales.map((item) => ({ value: item.locale, label: item.nativeName }))}
              onChange={(event) =>
                updateDraft((current) => ({
                  ...current,
                  defaultLanguage: event.target.value as VoiceLocale,
                  fallbackLanguage: current.languageMode === "FIXED" ? (event.target.value as VoiceLocale) : current.fallbackLanguage,
                  supportedLanguages: current.languageMode === "FIXED" ? [event.target.value as VoiceLocale] : current.supportedLanguages,
                }))
              }
            />
            {draft.languageMode === "AUTO" && (
              <Select
                id={`${formId}-fallback-lang`}
                label={C.fallbackLanguage}
                value={draft.fallbackLanguage}
                options={productionLocales.map((item) => ({ value: item.locale, label: item.nativeName }))}
                onChange={(event) => updateDraft((current) => ({ ...current, fallbackLanguage: event.target.value as VoiceLocale }))}
              />
            )}
          </div>

          {draft.languageMode === "AUTO" && (
            <>
              <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
                <legend style={fieldLabel}>{C.supportedLanguages}</legend>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {availableLocales.map((item) => {
                    const ready = isRuntimeReadyLanguage(item);
                    const checked = draft.supportedLanguages.includes(item.locale);
                    return (
                      <label key={item.locale} style={choiceRow}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={item.locale === draft.defaultLanguage || (!ready && !checked)}
                          onChange={(event) => {
                            if (!ready && event.target.checked) return;
                            toggleSupported(item.locale, event.target.checked);
                          }}
                        />
                        <span>
                          {localeFlag(item.locale)} <LanguageName def={item} />
                        </span>
                        {!ready && <Badge variant="info" label={C.previewBadge} />}
                      </label>
                    );
                  })}
                </div>
                <p style={hintStyle}>{C.previewLanguagesHint}</p>
              </fieldset>
              <label style={choiceRow}>
                <input
                  type="checkbox"
                  checked={draft.allowLanguageSwitch}
                  onChange={(event) => updateDraft((current) => ({ ...current, allowLanguageSwitch: event.target.checked }))}
                />
                {C.allowSwitch}
              </label>
            </>
          )}
        </div>
      </SectionCard>

      <SectionCard title={C.languagesTitle}>
        <div className="voice-control-stack">
          {supportedForCards.map((locale) => {
            const def = languageByLocale(registry, locale);
            if (!def) return null;
            const ready = isRuntimeReadyLanguage(def);
            const row = draft.languageRows[locale] ?? { voiceProfileId: null, greetingMode: "inherit" as const, greetingText: "" };
            const options = voiceOptions(locale);
            const selectedVoice =
              row.voiceProfileId ||
              (options.some((opt) => opt.value === draft.defaultVoiceProfileId) ? draft.defaultVoiceProfileId : options[0]?.value ?? "");
            return (
              <article key={locale} style={rowCard}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
                    {localeFlag(locale)} <LanguageName def={def} />
                  </h3>
                  {!ready && <Badge variant="info" label={C.previewBadge} />}
                </div>
                {ready ? (
                  <>
                    <Select
                      id={`${formId}-voice-${locale}`}
                      label={C.voiceLabel}
                      value={selectedVoice}
                      options={options.length ? options : [{ value: "", label: C.voiceLabel }]}
                      onChange={(event) => {
                        const id = event.target.value;
                        updateDraft((current) => ({
                          ...current,
                          defaultVoiceProfileId: locale === current.defaultLanguage ? id : current.defaultVoiceProfileId,
                          languageRows: {
                            ...current.languageRows,
                            [locale]: { ...row, voiceProfileId: id },
                          },
                        }));
                      }}
                    />
                    <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
                      <legend style={fieldLabel}>{C.greetingLabel}</legend>
                      <label style={{ ...choiceRow, fontSize: 13.5, marginBottom: 8 }}>
                        <input
                          type="radio"
                          name={`${formId}-greet-${locale}`}
                          checked={row.greetingMode === "inherit"}
                          onChange={() => updateRow(locale, { greetingMode: "inherit" })}
                        />
                        {C.greetingInherit}
                      </label>
                      <label style={{ ...choiceRow, fontSize: 13.5, marginBottom: 8 }}>
                        <input
                          type="radio"
                          name={`${formId}-greet-${locale}`}
                          checked={row.greetingMode === "custom"}
                          onChange={() => updateRow(locale, { greetingMode: "custom" })}
                        />
                        {C.greetingCustom}
                      </label>
                      {row.greetingMode === "custom" && (
                        <Textarea
                          id={`${formId}-greet-text-${locale}`}
                          aria-label={C.greetingCustom}
                          value={row.greetingText}
                          placeholder={greetingPlaceholder}
                          onChange={(event) => updateRow(locale, { greetingText: event.target.value })}
                          maxLength={500}
                        />
                      )}
                    </fieldset>
                  </>
                ) : (
                  <p style={{ margin: 0, fontSize: 13.5, color: UI_COLORS.textSecondary }}>
                    {C.voiceLabel}: — · {C.previewBadge}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title={C.phoneLinesTitle}>
        {draft.didLines.length === 0 ? (
          <EmptyState title={C.noDids} description={C.noDidsHint} emoji="📞" />
        ) : (
          <div className="voice-control-stack">
            {draft.didLines.map((line) => (
              <DidLineCard
                key={line.didE164}
                formId={formId}
                line={line}
                clinicMode={draft.languageMode}
                auto={auto}
                registry={registry}
                productionLocales={productionLocales}
                voiceOptions={voiceOptions}
                onToggleCustom={(on) =>
                  updateDraft((current) => (on ? enableCustomDidLine(current, line.didE164) : disableCustomDidLine(current, line.didE164)))
                }
                onChange={(patch) => updateLine(line.didE164, patch)}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title={C.customVoiceTitle}>
        {!loaded.settings.customVoiceEnabled ? (
          <div data-testid="custom-voice-locked" style={{ ...rowCard, flexDirection: "row", alignItems: "flex-start" }}>
            <Lock size={18} aria-hidden style={{ color: UI_COLORS.textSecondary, flexShrink: 0, marginTop: 2 }} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
              <Badge variant="default" label={C.customVoiceLockedBadge} />
              <p style={{ margin: 0, fontSize: 13.5, color: UI_COLORS.textSecondary, lineHeight: 1.5 }}>{C.customVoiceLocked}</p>
            </div>
          </div>
        ) : voices.custom.length === 0 ? (
          <p style={{ margin: 0, fontSize: 14, color: UI_COLORS.textSecondary }}>{C.customVoiceEmpty}</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            {voices.custom.map((voice) => {
              const status = customVoiceStatusCopy(voice);
              return (
                <li key={voice.id} style={rowCard}>
                  <strong>{customerVoiceName(voice)}</strong>
                  {status && <p style={{ margin: 0, fontSize: 13, color: UI_COLORS.textSecondary }}>{status}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <div className="voice-save-bar" data-testid="voice-save-bar" data-dirty={dirty ? "true" : "false"}>
        <div role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, fontSize: 13, fontWeight: 600 }}>
          {fieldError ? (
            <span role="alert" style={{ color: "var(--danger)", fontWeight: 500 }}>{fieldError}</span>
          ) : dirty ? (
            <>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--warning)", flexShrink: 0 }} />
              <span style={{ color: UI_COLORS.textPrimary }}>{C.dirty}</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={16} aria-hidden style={{ color: "var(--success)", flexShrink: 0 }} />
              <span style={{ color: UI_COLORS.textSecondary, fontWeight: 500 }}>{success ?? C.clean}</span>
            </>
          )}
        </div>
        <Button type="button" onClick={() => void handleSave()} disabled={!dirty || saving} isLoading={saving} aria-disabled={!dirty || saving}>
          {saving ? C.saving : C.save}
        </Button>
      </div>
    </div>
  );
}

function DidLineCard({
  formId,
  line,
  clinicMode,
  auto,
  registry,
  productionLocales,
  voiceOptions,
  onToggleCustom,
  onChange,
}: {
  formId: string;
  line: DidLineDraft;
  clinicMode: VoiceLanguageMode;
  auto: AutoLanguageAvailability;
  registry: readonly VoiceLanguageDefinition[];
  productionLocales: readonly VoiceLanguageDefinition[];
  voiceOptions: (locale: VoiceLocale) => { value: string; label: string }[];
  onToggleCustom: (on: boolean) => void;
  onChange: (patch: Partial<DidLineDraft>) => void;
}) {
  const live = line.active && line.voiceEnabled;
  const subtitle = lineSubtitle(line);
  const mode = effectiveLineLanguageMode(line, clinicMode);
  const settingsName = `${formId}-did-settings-${line.didE164}`;
  const lineLocales =
    mode === "FIXED"
      ? [line.defaultLanguage]
      : line.supportedLanguages.filter((locale) => isRuntimeReadyLanguage(languageByLocale(registry, locale)));

  return (
    <article style={rowCard}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.02em" }}>{formatPhoneLine(line.didE164)}</div>
          {subtitle && <div style={{ marginTop: 4, fontSize: 13, color: UI_COLORS.textSecondary }}>{subtitle}</div>}
        </div>
        <Badge variant={live ? "active" : "inactive"} label={live ? C.runtimeActive : C.runtimeInactive} dot />
      </div>

      <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
        <legend style={fieldLabel}>{C.lineSettingsLabel}</legend>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={choiceRow}>
            <input type="radio" name={settingsName} checked={!line.useCustom} onChange={() => onToggleCustom(false)} />
            {C.lineInheritClinic}
          </label>
          <label style={choiceRow}>
            <input type="radio" name={settingsName} checked={line.useCustom} onChange={() => onToggleCustom(true)} />
            {C.lineUseCustom}
          </label>
        </div>
      </fieldset>

      {line.useCustom && (
        <div className="voice-control-stack" style={{ paddingTop: 4, borderTop: "1px solid var(--border)" }}>
          <Input
            id={`${formId}-did-label-${line.didE164}`}
            label={C.lineLabel}
            value={line.label}
            onChange={(event) => onChange({ label: event.target.value.slice(0, 80) })}
          />
          <LanguageModeChoice
            name={`${formId}-did-mode-${line.didE164}`}
            value={mode}
            auto={auto}
            onChange={(next) => onChange({ languageMode: next })}
          />
          <Select
            label={C.defaultLanguage}
            value={line.defaultLanguage}
            options={productionLocales.map((item) => ({ value: item.locale, label: item.nativeName }))}
            onChange={(event) => onChange({ defaultLanguage: event.target.value as VoiceLocale })}
          />
          {mode === "AUTO" && (
            <>
              <Select
                label={C.fallbackLanguage}
                value={line.fallbackLanguage}
                options={productionLocales.map((item) => ({ value: item.locale, label: item.nativeName }))}
                onChange={(event) => onChange({ fallbackLanguage: event.target.value as VoiceLocale })}
              />
              <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
                <legend style={fieldLabel}>{C.supportedLanguages}</legend>
                {registry.filter((item) => item.status !== "RETIRED").map((item) => {
                  const ready = isRuntimeReadyLanguage(item);
                  const checked = line.supportedLanguages.includes(item.locale);
                  return (
                    <label key={item.locale} style={{ ...choiceRow, marginBottom: 6 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!ready}
                        onChange={(event) => {
                          if (!ready) return;
                          const next = event.target.checked
                            ? Array.from(new Set([...line.supportedLanguages, item.locale]))
                            : line.supportedLanguages.filter((locale) => locale !== item.locale);
                          onChange({ supportedLanguages: next });
                        }}
                      />
                      {localeFlag(item.locale)} <LanguageName def={item} />
                      {!ready && <Badge variant="info" label={C.previewBadge} />}
                    </label>
                  );
                })}
              </fieldset>
              <label style={choiceRow}>
                <input
                  type="checkbox"
                  checked={line.allowLanguageSwitch}
                  onChange={(event) => onChange({ allowLanguageSwitch: event.target.checked })}
                />
                {C.allowSwitch}
              </label>
            </>
          )}
          {lineLocales.map((locale) => {
            const def = languageByLocale(registry, locale);
            if (!def) return null;
            const options = voiceOptions(locale);
            const row = line.languageRows[locale] ?? {
              voiceProfileId: null,
              greetingMode: "inherit" as const,
              greetingText: "",
            };
            return (
              <div key={locale} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Select
                  label={`${def.nativeName} · ${C.voiceLabel}`}
                  value={row.voiceProfileId || line.defaultVoiceProfileId}
                  options={options.length ? options : [{ value: "", label: C.voiceLabel }]}
                  onChange={(event) =>
                    onChange({
                      defaultVoiceProfileId:
                        locale === line.defaultLanguage ? event.target.value : line.defaultVoiceProfileId,
                      languageRows: {
                        ...line.languageRows,
                        [locale]: { ...row, voiceProfileId: event.target.value },
                      },
                    })
                  }
                />
                <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
                  <legend style={fieldLabel}>{C.greetingLabel}</legend>
                  <label style={{ ...choiceRow, fontSize: 13.5, marginBottom: 6 }}>
                    <input
                      type="radio"
                      name={`${formId}-did-greet-${line.didE164}-${locale}`}
                      checked={row.greetingMode === "inherit"}
                      onChange={() =>
                        onChange({
                          languageRows: { ...line.languageRows, [locale]: { ...row, greetingMode: "inherit" } },
                        })
                      }
                    />
                    {C.greetingInherit}
                  </label>
                  <label style={{ ...choiceRow, fontSize: 13.5 }}>
                    <input
                      type="radio"
                      name={`${formId}-did-greet-${line.didE164}-${locale}`}
                      checked={row.greetingMode === "custom"}
                      onChange={() =>
                        onChange({
                          languageRows: { ...line.languageRows, [locale]: { ...row, greetingMode: "custom" } },
                        })
                      }
                    />
                    {C.greetingCustom}
                  </label>
                  {row.greetingMode === "custom" && (
                    <Textarea
                      aria-label={C.greetingCustom}
                      value={row.greetingText}
                      onChange={(event) =>
                        onChange({
                          languageRows: {
                            ...line.languageRows,
                            [locale]: { ...row, greetingText: event.target.value },
                          },
                        })
                      }
                      maxLength={500}
                      style={{ marginTop: 8 }}
                    />
                  )}
                </fieldset>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}
