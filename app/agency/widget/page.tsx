"use client";

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
import { Code, Copy, CheckCircle2, Globe, Building2, AlertCircle, Loader2, Save, MessageSquare, DollarSign, Link2, Shield, FileText } from "lucide-react";
import type { Agency } from "@/lib/types/agency";
import type { WidgetMode } from "@/lib/types/matching";
import { WIDGET_MODES } from "@/lib/types/matching";

interface WidgetConfig {
  mode: WidgetMode;
  treatmentSelectorVisible: boolean;
  clinicRecommendationCards: boolean;
  priceRangeEnabled: boolean;
  quoteRequestEnabled: boolean;
  profileLinkEnabled: boolean;
  consentBeforeQuote: boolean;
  theme: "light" | "dark" | "auto";
  position: "bottom-right" | "bottom-left";
}

const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  mode: "matching_assistant",
  treatmentSelectorVisible: true,
  clinicRecommendationCards: true,
  priceRangeEnabled: true,
  quoteRequestEnabled: true,
  profileLinkEnabled: true,
  consentBeforeQuote: true,
  theme: "light",
  position: "bottom-right",
};

export default function AgencyWidgetPage() {
  const { profile } = useAuth();
  const agencyId = profile?.agencyId;
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
        <h1 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary }}>Widget Experience</h1>
        <div style={{ padding: 48, textAlign: "center", background: "var(--bg-card)", borderRadius: 14, border: `1px solid ${UI_COLORS.border}`, marginTop: 20 }}>
          <AlertCircle size={48} color={UI_COLORS.textMuted} style={{ opacity: 0.4 }} />
          <h3 style={{ marginTop: 16, fontSize: 16, fontWeight: 700, color: UI_COLORS.textPrimary }}>No Agency Selected</h3>
          <p style={{ color: UI_COLORS.textMuted, fontSize: 13, marginTop: 8 }}>
            {isSuperAdmin(profile?.role) ? "Select an agency from the Agencies page." : "Your account is not linked to any agency."}
          </p>
        </div>
      </div>
    );
  }

  const agencySlug = agency.slug || agency.id;
  const modeAttr = config.mode === "chat" ? "" : ` data-mode="${config.mode.replace("_", "-")}"`;
  const embedCode = `<script\n  src="https://widget.clinicbridge-ai.com/widget.js"\n  data-agency-id="${agencySlug}"${modeAttr}\n  async>\n</script>`;

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

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1000 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.02em" }}>Widget Experience</h1>
          <p style={{ fontSize: 14, color: UI_COLORS.textMuted, marginTop: 4 }}>
            Configure and embed the AI Clinic Matching assistant on your website.
          </p>
        </div>
        <Button onClick={handleSave} isLoading={saving}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {saved ? <CheckCircle2 size={16} /> : <Save size={16} />}
            {saved ? "Saved!" : "Save Config"}
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
            <p style={{ fontSize: 12, color: UI_COLORS.textMuted }}>{agency.domain || "No domain"} · ID: {agencySlug}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Badge label={WIDGET_MODES[config.mode].label} variant="success" />
          <Badge label={agency.status} variant={agency.status === "active" ? "success" : "warning"} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Widget Mode */}
        <SectionCard title="Widget Mode">
          <p style={{ fontSize: 12.5, color: UI_COLORS.textMuted, marginBottom: 12 }}>
            Choose how the AI assistant interacts with patients on your website.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            {(Object.entries(WIDGET_MODES) as [WidgetMode, { label: string; description: string }][]).map(([mode, info]) => (
              <button key={mode} onClick={() => setConfig({ ...config, mode })}
                style={{
                  flex: 1, padding: "14px 16px", borderRadius: 12, textAlign: "left", cursor: "pointer",
                  border: `1px solid ${config.mode === mode ? "#10b981" : UI_COLORS.border}`,
                  background: config.mode === mode ? "rgba(16, 185, 129, 0.06)" : "transparent",
                  transition: "all 0.15s",
                }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: config.mode === mode ? "#10b981" : UI_COLORS.textPrimary }}>
                  {info.label}
                </p>
                <p style={{ fontSize: 11.5, color: UI_COLORS.textMuted, marginTop: 4 }}>{info.description}</p>
              </button>
            ))}
          </div>
        </SectionCard>

        {/* Feature Toggles */}
        <SectionCard title="Feature Configuration">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {([
              { key: "treatmentSelectorVisible", label: "Treatment selector visible on start", icon: <MessageSquare size={14} /> },
              { key: "clinicRecommendationCards", label: "Show clinic recommendation cards", icon: <Building2 size={14} /> },
              { key: "priceRangeEnabled", label: "Show estimated price ranges", icon: <DollarSign size={14} /> },
              { key: "quoteRequestEnabled", label: "Enable quote request flow", icon: <FileText size={14} /> },
              { key: "profileLinkEnabled", label: "Show 'More Information' profile links", icon: <Link2 size={14} /> },
              { key: "consentBeforeQuote", label: "Require GDPR/KVKK consent before quote", icon: <Shield size={14} /> },
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

        {/* Appearance */}
        <SectionCard title="Appearance">
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 8 }}>Theme</p>
              <div style={{ display: "flex", gap: 8 }}>
                {(["light", "dark", "auto"] as const).map((t) => (
                  <button key={t} onClick={() => setConfig({ ...config, theme: t })}
                    style={{
                      flex: 1, padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                      border: `1px solid ${config.theme === t ? "#10b981" : UI_COLORS.border}`,
                      background: config.theme === t ? "rgba(16, 185, 129, 0.08)" : "transparent",
                      color: config.theme === t ? "#10b981" : UI_COLORS.textMuted, textTransform: "capitalize",
                    }}>{t}</button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 8 }}>Position</p>
              <div style={{ display: "flex", gap: 8 }}>
                {(["bottom-right", "bottom-left"] as const).map((p) => (
                  <button key={p} onClick={() => setConfig({ ...config, position: p })}
                    style={{
                      flex: 1, padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                      border: `1px solid ${config.position === p ? "#10b981" : UI_COLORS.border}`,
                      background: config.position === p ? "rgba(16, 185, 129, 0.08)" : "transparent",
                      color: config.position === p ? "#10b981" : UI_COLORS.textMuted,
                    }}>{p === "bottom-right" ? "Bottom Right" : "Bottom Left"}</button>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Embed Code */}
        <SectionCard title="Embed Code">
          <p style={{ fontSize: 12.5, color: UI_COLORS.textMuted, marginBottom: 12 }}>
            Copy this code and paste it before the closing <code>&lt;/body&gt;</code> tag of your website.
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
              {copied ? <><CheckCircle2 size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
            </button>
          </div>
          {agency.allowedDomains && agency.allowedDomains.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <Globe size={14} color={UI_COLORS.textMuted} />
              <span style={{ fontSize: 12, color: UI_COLORS.textMuted }}>Allowed domains:</span>
              {agency.allowedDomains.map((d) => (
                <code key={d} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "var(--bg-app)", color: "#10b981" }}>{d}</code>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Widget Flow Preview */}
        <SectionCard title="Widget Flow Preview">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { step: 1, label: "Welcome", desc: "AI greets the patient and asks about their treatment need" },
              { step: 2, label: "Treatment Detection", desc: "AI identifies treatment category from natural language" },
              { step: 3, label: "Intake Questions", desc: "AI asks category-specific questions (location, date, budget)" },
              config.clinicRecommendationCards && { step: 4, label: "Clinic Recommendations", desc: "AI shows matched clinic cards with profile links" },
              config.priceRangeEnabled && { step: 5, label: "Price Range", desc: "AI shows estimated price range for the treatment" },
              config.quoteRequestEnabled && { step: 6, label: "Quote Request", desc: "Patient can request quotes from recommended clinics" },
              config.consentBeforeQuote && { step: 7, label: "GDPR/KVKK Consent", desc: "Patient provides consent before data is shared" },
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
