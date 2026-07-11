"use client";

import { useAgencyWorkspace } from "@/components/agency/AgencyWorkspaceContext";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { isSuperAdmin } from "@/lib/types";
import { subscribeToAgency } from "@/lib/services/agencyService";
import { doc, setDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import SectionCard from "@/components/ui/SectionCard";
import Badge from "@/components/ui/Badge";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { Button } from "@/components/ui/Button";
import { Code, Copy, CheckCircle2, Globe, Building2, AlertCircle, Loader2, Save, MessageSquare, DollarSign, Link2, Shield, FileText, Monitor, Smartphone } from "lucide-react";
import type { Agency } from "@/lib/types/agency";
import type { WidgetMode } from "@/lib/types/matching";
import { WIDGET_MODES } from "@/lib/types/matching";
import { useI18n } from "@/lib/i18n-context";

type DisplayType = "embedded" | "floating";
type Alignment = "center" | "left" | "right";
type ContainerWidth = "compact" | "standard" | "wide";
type FloatingPosition = "bottom-right" | "bottom-left";

interface WidgetConfig {
  mode: WidgetMode;
  displayType: DisplayType;
  alignment: Alignment;
  containerWidth: ContainerWidth;
  position: FloatingPosition;
  treatmentSelectorVisible: boolean;
  clinicRecommendationCards: boolean;
  priceRangeEnabled: boolean;
  quoteRequestEnabled: boolean;
  profileLinkEnabled: boolean;
  consentBeforeQuote: boolean;
  theme: "light" | "dark" | "auto";
}

const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  mode: "matching_assistant",
  displayType: "embedded",
  alignment: "center",
  containerWidth: "wide",
  position: "bottom-right",
  treatmentSelectorVisible: true,
  clinicRecommendationCards: true,
  priceRangeEnabled: true,
  quoteRequestEnabled: true,
  profileLinkEnabled: true,
  consentBeforeQuote: true,
  theme: "light",
};

/** When mode changes, auto-set the best displayType default */
function defaultDisplayType(mode: WidgetMode): DisplayType {
  return mode === "chat" ? "floating" : "embedded";
}

export default function AgencyWidgetPage() {
  const { profile } = useAuth();
  const { agencyId } = useAgencyWorkspace();
  const { t, language } = useI18n();
  const [copied, setCopied] = useState(false);
  const [agency, setAgency] = useState<Agency | null>(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<WidgetConfig>(DEFAULT_WIDGET_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    const unsubs: (() => void)[] = [];
    let loaded = 0;
    const checkDone = () => { loaded++; if (loaded >= 2) setLoading(false); };
    unsubs.push(subscribeToAgency(agencyId, (a) => { setAgency(a); checkDone(); }));
    unsubs.push(onSnapshot(doc(db, "agencies", agencyId, "config", "widget"), (snap) => {
      if (snap.exists()) setConfig({ ...DEFAULT_WIDGET_CONFIG, ...snap.data() } as WidgetConfig);
      checkDone();
    }, () => checkDone()));
    return () => unsubs.forEach((u) => u());
  }, [agencyId]);

  if (loading) {
    return (
      <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={32} style={{ animation: "spin 1s linear infinite" }} color="#10b981" />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!agencyId || !agency) {
    return (
      <div style={{ padding: "24px 32px", maxWidth: 800 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary }}>{t("portal.widget.title")}</h1>
        <div style={{ padding: 48, textAlign: "center", background: "var(--bg-card)", borderRadius: 14, border: `1px solid ${UI_COLORS.border}`, marginTop: 20 }}>
          <AlertCircle size={48} color={UI_COLORS.textMuted} style={{ opacity: 0.4 }} />
          <h3 style={{ marginTop: 16, fontSize: 16, fontWeight: 700, color: UI_COLORS.textPrimary }}>{t("portal.common.noAgencySelected")}</h3>
          <p style={{ color: UI_COLORS.textMuted, fontSize: 13, marginTop: 8 }}>
            {isSuperAdmin(profile?.role) ? t("portal.common.selectAgency") : t("portal.common.notLinked")}
          </p>
        </div>
      </div>
    );
  }

  const agencySlug = agency.slug || agency.id;

  // ─── Embed Code Generation ──────────────────────────────────────────────
  const buildEmbedCode = () => {
    const attrs: string[] = [
      `src="https://widget.clinicbridge-ai.com/widget.js"`,
      `data-agency-id="${agencySlug}"`,
    ];
    if (config.mode !== "chat") attrs.push(`data-mode="${config.mode.replace("_", "-")}"`);
    attrs.push(`data-display="${config.displayType}"`);
    if (config.displayType === "embedded") {
      attrs.push(`data-align="${config.alignment}"`);
      if (config.containerWidth !== "standard") attrs.push(`data-width="${config.containerWidth}"`);
    } else {
      attrs.push(`data-position="${config.position}"`);
    }
    attrs.push("async");
    return `<script\n  ${attrs.join("\n  ")}>\n</script>`;
  };
  const embedCode = buildEmbedCode();

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    if (!agencyId) return;
    setSaving(true); setSaved(false);
    try {
      await setDoc(doc(db, "agencies", agencyId, "config", "widget"), {
        ...config, updatedAt: serverTimestamp(),
      }, { merge: true });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err) { console.error("Failed to save:", err); }
    finally { setSaving(false); }
  };

  const setMode = (mode: WidgetMode) => {
    setConfig({ ...config, mode, displayType: defaultDisplayType(mode) });
  };

  const widgetModeLabels: Record<WidgetMode, { label: string; desc: string }> = {
    chat: {
      label: t("portal.widget.chat"),
      desc: language === "tr" ? "Klasik sağ alt / sol alt chatbot butonu olarak çalışır." : "Works as a classic floating chatbot button.",
    },
    matching_assistant: {
      label: t("portal.widget.matchingAssistant"),
      desc: language === "tr" ? "Web sayfası içinde merkezi AI klinik eşleştirme deneyimi olarak çalışır." : "Embedded AI clinic matching experience within the page.",
    },
    quote_assistant: {
      label: t("portal.widget.quoteAssistant"),
      desc: language === "tr" ? "Klinik önerisi, ön değerlendirme ve teklif talebi akışını birlikte sunar." : "Combines clinic recommendations, assessment and quote request flow.",
    },
  };

  // ─── Helper labels ──────────────────────────────────────────────────────
  const displayLabels: Record<DisplayType, { label: string; desc: string }> = {
    embedded: {
      label: language === "tr" ? "Sayfa İçi / Embedded" : "In-Page / Embedded",
      desc: language === "tr" ? "Sayfanızın içine gömülü olarak çalışır" : "Embedded within your page content",
    },
    floating: {
      label: language === "tr" ? "Yüzen Buton / Floating" : "Floating Button",
      desc: language === "tr" ? "Sağ alt veya sol alt köşede yüzen buton" : "Floating button in corner",
    },
  };

  const alignLabels: Record<Alignment, string> = {
    center: language === "tr" ? "Ortalanmış" : "Center",
    left: language === "tr" ? "Sol" : "Left",
    right: language === "tr" ? "Sağ" : "Right",
  };

  const widthLabels: Record<ContainerWidth, string> = {
    compact: language === "tr" ? "Dar" : "Compact",
    standard: language === "tr" ? "Standart" : "Standard",
    wide: language === "tr" ? "Geniş" : "Wide",
  };

  const posLabels: Record<FloatingPosition, string> = {
    "bottom-right": t("portal.widget.bottomRight"),
    "bottom-left": t("portal.widget.bottomLeft"),
  };

  // ─── Pill button helper ─────────────────────────────────────────────────
  const PillBtn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button onClick={onClick} style={{
      flex: 1, padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
      border: `1px solid ${active ? "#10b981" : UI_COLORS.border}`,
      background: active ? "rgba(16, 185, 129, 0.08)" : "transparent",
      color: active ? "#10b981" : UI_COLORS.textMuted, transition: "all 0.15s",
    }}>{children}</button>
  );

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1000 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.02em" }}>{t("portal.widget.title")}</h1>
          <p style={{ fontSize: 14, color: UI_COLORS.textMuted, marginTop: 4 }}>
            {t("portal.widget.subtitle")}
          </p>
        </div>
        <Button onClick={handleSave} isLoading={saving}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {saved ? <CheckCircle2 size={16} /> : <Save size={16} />}
            {saved ? t("portal.widget.saved") : t("portal.widget.saveConfig")}
          </span>
        </Button>
      </div>

      {/* Agency Context */}
      <div style={{
        padding: "16px 20px", borderRadius: 12, border: `1px solid ${UI_COLORS.border}`,
        background: "rgba(16, 185, 129, 0.03)", marginBottom: 20,
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #10b981, #059669)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Building2 size={20} color="#fff" />
          </div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: UI_COLORS.textPrimary }}>{agency.name} Widget</p>
            <p style={{ fontSize: 12, color: UI_COLORS.textMuted }}>{agency.domain || t("portal.widget.noDomain")} · ID: {agencySlug}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Badge label={widgetModeLabels[config.mode]?.label || config.mode} variant="success" />
          <Badge label={displayLabels[config.displayType]?.label || config.displayType} variant="info" />
          <Badge label={agency.status === "active" ? t("portal.common.active") : t("portal.common.inactive")} variant={agency.status === "active" ? "success" : "warning"} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Widget Mode */}
        <SectionCard title={t("portal.widget.widgetMode")}>
          <p style={{ fontSize: 12.5, color: UI_COLORS.textMuted, marginBottom: 12 }}>
            {t("portal.widget.widgetModeDesc")}
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            {(Object.keys(WIDGET_MODES) as WidgetMode[]).map((mode) => (
              <button key={mode} onClick={() => setMode(mode)}
                style={{
                  flex: 1, padding: "14px 16px", borderRadius: 12, textAlign: "left", cursor: "pointer",
                  border: `1px solid ${config.mode === mode ? "#10b981" : UI_COLORS.border}`,
                  background: config.mode === mode ? "rgba(16, 185, 129, 0.06)" : "transparent",
                  transition: "all 0.15s",
                }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: config.mode === mode ? "#10b981" : UI_COLORS.textPrimary }}>
                  {widgetModeLabels[mode]?.label}
                </p>
                <p style={{ fontSize: 11.5, color: UI_COLORS.textMuted, marginTop: 4 }}>{widgetModeLabels[mode]?.desc}</p>
              </button>
            ))}
          </div>
        </SectionCard>

        {/* Display Type */}
        <SectionCard title={language === "tr" ? "Görüntüleme Tipi" : "Display Type"}>
          <p style={{ fontSize: 12.5, color: UI_COLORS.textMuted, marginBottom: 12 }}>
            {language === "tr"
              ? "Widget'ın web sayfasında nasıl görüneceğini belirleyin."
              : "Choose how the widget appears on your website."}
          </p>
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            {(["embedded", "floating"] as DisplayType[]).map((dt) => (
              <button key={dt} onClick={() => setConfig({ ...config, displayType: dt })}
                style={{
                  flex: 1, padding: "14px 16px", borderRadius: 12, textAlign: "left", cursor: "pointer",
                  border: `1px solid ${config.displayType === dt ? "#10b981" : UI_COLORS.border}`,
                  background: config.displayType === dt ? "rgba(16, 185, 129, 0.06)" : "transparent",
                  transition: "all 0.15s",
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  {dt === "embedded" ? <Monitor size={16} color={config.displayType === dt ? "#10b981" : UI_COLORS.textMuted} /> : <Smartphone size={16} color={config.displayType === dt ? "#10b981" : UI_COLORS.textMuted} />}
                  <span style={{ fontSize: 14, fontWeight: 700, color: config.displayType === dt ? "#10b981" : UI_COLORS.textPrimary }}>
                    {displayLabels[dt].label}
                  </span>
                </div>
                <p style={{ fontSize: 11.5, color: UI_COLORS.textMuted }}>{displayLabels[dt].desc}</p>
              </button>
            ))}
          </div>

          {/* Conditional sub-options */}
          {config.displayType === "embedded" ? (
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 8 }}>
                  {language === "tr" ? "Hizalama" : "Alignment"}
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["center", "left", "right"] as Alignment[]).map((a) => (
                    <PillBtn key={a} active={config.alignment === a} onClick={() => setConfig({ ...config, alignment: a })}>
                      {alignLabels[a]}
                    </PillBtn>
                  ))}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 8 }}>
                  {language === "tr" ? "Container Genişliği" : "Container Width"}
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["compact", "standard", "wide"] as ContainerWidth[]).map((w) => (
                    <PillBtn key={w} active={config.containerWidth === w} onClick={() => setConfig({ ...config, containerWidth: w })}>
                      {widthLabels[w]}
                    </PillBtn>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 8 }}>
                {t("portal.widget.position")}
              </p>
              <div style={{ display: "flex", gap: 8, maxWidth: 300 }}>
                {(["bottom-right", "bottom-left"] as FloatingPosition[]).map((p) => (
                  <PillBtn key={p} active={config.position === p} onClick={() => setConfig({ ...config, position: p })}>
                    {posLabels[p]}
                  </PillBtn>
                ))}
              </div>
            </div>
          )}

          {/* Mode hint */}
          {config.mode !== "chat" && config.displayType === "floating" && (
            <p style={{ fontSize: 11.5, color: "#f59e0b", marginTop: 10, fontStyle: "italic" }}>
              {language === "tr"
                ? "⚠ Eşleştirme / Teklif Asistanı modları sayfa içi (embedded) görünümde en iyi çalışır."
                : "⚠ Matching / Quote Assistant modes work best with embedded display."}
            </p>
          )}
        </SectionCard>

        {/* Feature Toggles */}
        <SectionCard title={t("portal.widget.featureConfig")}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {([
              { key: "treatmentSelectorVisible", label: t("portal.widget.treatmentSelector"), icon: <MessageSquare size={14} /> },
              { key: "clinicRecommendationCards", label: t("portal.widget.showClinicCards"), icon: <Building2 size={14} /> },
              { key: "priceRangeEnabled", label: t("portal.widget.showPriceRanges"), icon: <DollarSign size={14} /> },
              { key: "quoteRequestEnabled", label: t("portal.widget.enableQuoteFlow"), icon: <FileText size={14} /> },
              { key: "profileLinkEnabled", label: t("portal.widget.enableProfileLinks"), icon: <Link2 size={14} /> },
              { key: "consentBeforeQuote", label: t("portal.widget.requireConsentQuote"), icon: <Shield size={14} /> },
            ] as const).map(({ key, label, icon }) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "8px 0" }}>
                <input type="checkbox" checked={config[key]} onChange={(e) => setConfig({ ...config, [key]: e.target.checked })}
                  style={{ width: 18, height: 18, accentColor: "#10b981", cursor: "pointer" }} />
                <span style={{ display: "flex", alignItems: "center", gap: 6, color: UI_COLORS.textPrimary, fontSize: 13.5 }}>
                  {icon} {label}
                </span>
              </label>
            ))}
          </div>
        </SectionCard>

        {/* Appearance — Theme */}
        <SectionCard title={t("portal.widget.appearance")}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 8 }}>{t("portal.widget.theme")}</p>
            <div style={{ display: "flex", gap: 8, maxWidth: 300 }}>
              {(["light", "dark", "auto"] as const).map((thm) => (
                <PillBtn key={thm} active={config.theme === thm} onClick={() => setConfig({ ...config, theme: thm })}>
                  {thm === "light" ? (language === "tr" ? "Açık" : "Light") : thm === "dark" ? (language === "tr" ? "Koyu" : "Dark") : (language === "tr" ? "Otomatik" : "Auto")}
                </PillBtn>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* Embed Code */}
        <SectionCard title={t("portal.widget.embedCode")}>
          <p style={{ fontSize: 12.5, color: UI_COLORS.textMuted, marginBottom: 12 }}>
            {t("portal.widget.embedDesc")}
          </p>
          <div style={{ position: "relative" }}>
            <pre style={{
              padding: "16px 20px", borderRadius: 10, fontSize: 13, lineHeight: 1.6,
              background: "var(--bg-app)", border: `1px solid ${UI_COLORS.border}`,
              color: "#10b981", overflow: "auto", fontFamily: "'JetBrains Mono', monospace",
            }}>
              {embedCode}
            </pre>
            <button onClick={handleCopy}
              style={{
                position: "absolute", top: 10, right: 10,
                padding: "6px 12px", borderRadius: 6, border: `1px solid ${UI_COLORS.border}`,
                background: "var(--bg-card)", color: copied ? "#10b981" : UI_COLORS.textMuted,
                fontSize: 11, fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 4,
              }}>
              {copied ? <><CheckCircle2 size={12} /> {t("portal.widget.copied")}</> : <><Copy size={12} /> {t("portal.widget.copyEmbed")}</>}
            </button>
          </div>
          {agency.allowedDomains && agency.allowedDomains.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <Globe size={14} color={UI_COLORS.textMuted} />
              <span style={{ fontSize: 12, color: UI_COLORS.textMuted }}>{t("portal.widget.allowedDomains")}:</span>
              {agency.allowedDomains.map((d) => (
                <code key={d} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "var(--bg-app)", color: "#10b981" }}>{d}</code>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Widget Flow Preview */}
        <SectionCard title={t("portal.widget.widgetFlowPreview")}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { step: 1, label: t("portal.widget.flowWelcome"), desc: t("portal.widget.flowWelcomeDesc") },
              { step: 2, label: t("portal.widget.flowTreatment"), desc: t("portal.widget.flowTreatmentDesc") },
              { step: 3, label: t("portal.widget.flowIntake"), desc: t("portal.widget.flowIntakeDesc") },
              config.clinicRecommendationCards && { step: 4, label: t("portal.widget.flowClinics"), desc: t("portal.widget.flowClinicsDesc") },
              config.priceRangeEnabled && { step: 5, label: t("portal.widget.flowPrice"), desc: t("portal.widget.flowPriceDesc") },
              config.quoteRequestEnabled && { step: 6, label: t("portal.widget.flowQuote"), desc: t("portal.widget.flowQuoteDesc") },
              config.consentBeforeQuote && { step: 7, label: t("portal.widget.flowConsent"), desc: t("portal.widget.flowConsentDesc") },
            ].filter(Boolean).map((item: any) => (
              <div key={item.step} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                borderRadius: 8, border: `1px solid ${UI_COLORS.border}`, background: "var(--bg-app)",
              }}>
                <span style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: "rgba(16, 185, 129, 0.1)", color: "#10b981",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 800, flexShrink: 0,
                }}>{item.step}</span>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textPrimary }}>{item.label}</p>
                  <p style={{ fontSize: 11.5, color: UI_COLORS.textMuted }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
