"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { isSuperAdmin } from "@/lib/types";
import {
  doc, getDoc, setDoc, serverTimestamp, onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import SectionCard from "@/components/ui/SectionCard";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { Bot, Save, Loader2, CheckCircle2, AlertCircle, Plus, X } from "lucide-react";
import type { TreatmentCategory } from "@/lib/types/agency";
import { TREATMENT_CATEGORIES } from "@/lib/types/agency";

interface AIConfig {
  assistantName: string;
  welcomeMessage: string;
  defaultLanguage: string;
  supportedLanguages: string[];
  toneOfVoice: string;
  treatmentCategories: TreatmentCategory[];
  ctaOptions: string[];
  consentUrl: string;
  emergencyDisclaimer: string;
  fallbackMessage: string;
}

const DEFAULT_CONFIG: AIConfig = {
  assistantName: "FeelinHealthy AI Care Assistant",
  welcomeMessage: "Hello! I can help you find the most suitable clinic for your treatment. May I ask you a few short questions?",
  defaultLanguage: "en",
  supportedLanguages: ["en", "tr", "de", "fr"],
  toneOfVoice: "professional",
  treatmentCategories: ["dental", "hair_transplant", "aesthetic", "ivf", "checkup", "eye", "oncology", "other"] as TreatmentCategory[],
  ctaOptions: [
    "Find the right clinic for my treatment",
    "Compare treatment options",
    "Get matched with clinics",
    "Start my treatment request",
  ],
  consentUrl: "",
  emergencyDisclaimer: "This service does not replace medical advice. In case of emergency, contact local emergency services.",
  fallbackMessage: "I'd be happy to connect you with a human specialist. Let me transfer you.",
};

export default function AIConfigPage() {
  const { profile } = useAuth();
  const agencyId = profile?.agencyId;

  const [config, setConfig] = useState<AIConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newCta, setNewCta] = useState("");

  useEffect(() => {
    if (!agencyId) {
      setLoading(false);
      return;
    }
    const docRef = doc(db, "agencies", agencyId, "config", "ai");
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        setConfig({ ...DEFAULT_CONFIG, ...snap.data() } as AIConfig);
      }
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [agencyId]);

  const handleSave = async () => {
    if (!agencyId) return;
    setSaving(true);
    setSaved(false);
    try {
      await setDoc(doc(db, "agencies", agencyId, "config", "ai"), {
        ...config,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save AI config:", err);
    } finally {
      setSaving(false);
    }
  };

  const addCta = () => {
    if (!newCta.trim()) return;
    setConfig({ ...config, ctaOptions: [...config.ctaOptions, newCta.trim()] });
    setNewCta("");
  };

  const removeCta = (idx: number) => {
    setConfig({ ...config, ctaOptions: config.ctaOptions.filter((_, i) => i !== idx) });
  };

  const toggleCategory = (cat: TreatmentCategory) => {
    setConfig((c) => ({
      ...c,
      treatmentCategories: c.treatmentCategories.includes(cat)
        ? c.treatmentCategories.filter((t) => t !== cat)
        : [...c.treatmentCategories, cat],
    }));
  };

  const toggleLang = (lang: string) => {
    setConfig((c) => ({
      ...c,
      supportedLanguages: c.supportedLanguages.includes(lang)
        ? c.supportedLanguages.filter((l) => l !== lang)
        : [...c.supportedLanguages, lang],
    }));
  };

  if (loading) {
    return (
      <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={32} style={{ animation: "spin 1s linear infinite" }} color="#10b981" />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!agencyId) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <AlertCircle size={48} color={UI_COLORS.textMuted} />
        <h2 style={{ marginTop: 16, color: UI_COLORS.textPrimary }}>No Agency Selected</h2>
        <p style={{ color: UI_COLORS.textMuted, marginTop: 8 }}>
          {isSuperAdmin(profile?.role)
            ? "Select an agency from the Agencies page to configure its AI assistant."
            : "Your account is not linked to any agency."}
        </p>
      </div>
    );
  }

  const langOptions = ["en", "tr", "de", "fr", "es", "ar", "ru"];

  return (
    <div style={{ padding: "24px 32px", maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.02em" }}>
            AI Assistant Configuration
          </h1>
          <p style={{ fontSize: 14, color: UI_COLORS.textMuted, marginTop: 4 }}>
            Configure your agency&apos;s AI-powered patient intake assistant.
          </p>
        </div>
        <Button onClick={handleSave} isLoading={saving}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>{saved ? <CheckCircle2 size={16} /> : <Save size={16} />} {saved ? "Saved!" : "Save Changes"}</span>
        </Button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* General */}
        <SectionCard title="General">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Input label="Assistant Name" value={config.assistantName} onChange={(e) => setConfig({ ...config, assistantName: e.target.value })} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textPrimary, marginBottom: 6 }}>Welcome Message</p>
              <textarea
                value={config.welcomeMessage}
                onChange={(e) => setConfig({ ...config, welcomeMessage: e.target.value })}
                rows={3}
                style={{
                  width: "100%", padding: 12, borderRadius: 10,
                  border: `1px solid ${UI_COLORS.border}`, fontSize: 13,
                  background: "var(--bg-app)", color: UI_COLORS.textPrimary,
                  outline: "none", resize: "vertical", fontFamily: "inherit",
                }}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Select label="Default Language" value={config.defaultLanguage} onChange={(e) => setConfig({ ...config, defaultLanguage: e.target.value })} options={langOptions.map((l) => ({ label: l.toUpperCase(), value: l }))} />
              <Select label="Tone of Voice" value={config.toneOfVoice} onChange={(e) => setConfig({ ...config, toneOfVoice: e.target.value })} options={[
                { label: "Professional", value: "professional" },
                { label: "Friendly", value: "friendly" },
                { label: "Empathetic", value: "empathetic" },
                { label: "Clinical", value: "clinical" },
              ]} />
            </div>
          </div>
        </SectionCard>

        {/* Languages */}
        <SectionCard title="Supported Languages">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {langOptions.map((lang) => (
              <button
                key={lang}
                onClick={() => toggleLang(lang)}
                style={{
                  padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  cursor: "pointer", transition: "all 0.15s",
                  background: config.supportedLanguages.includes(lang) ? "rgba(16, 185, 129, 0.1)" : "transparent",
                  color: config.supportedLanguages.includes(lang) ? "#10b981" : UI_COLORS.textMuted,
                  border: `1px solid ${config.supportedLanguages.includes(lang) ? "#10b981" : UI_COLORS.border}`,
                }}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>
        </SectionCard>

        {/* Treatment Categories */}
        <SectionCard title="Treatment Categories">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(Object.entries(TREATMENT_CATEGORIES) as [TreatmentCategory, { en: string }][]).map(([key, val]) => (
              <button
                key={key}
                onClick={() => toggleCategory(key)}
                style={{
                  padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  cursor: "pointer", transition: "all 0.15s",
                  background: config.treatmentCategories.includes(key) ? "rgba(16, 185, 129, 0.1)" : "transparent",
                  color: config.treatmentCategories.includes(key) ? "#10b981" : UI_COLORS.textMuted,
                  border: `1px solid ${config.treatmentCategories.includes(key) ? "#10b981" : UI_COLORS.border}`,
                }}
              >
                {val.en}
              </button>
            ))}
          </div>
        </SectionCard>

        {/* CTA Options */}
        <SectionCard title="CTA Options">
          <p style={{ fontSize: 12.5, color: UI_COLORS.textMuted, marginBottom: 12 }}>
            These are the quick-action buttons patients see in the chat widget.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            {config.ctaOptions.map((cta, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px", borderRadius: 8, border: `1px solid ${UI_COLORS.border}`,
                background: "var(--bg-app)",
              }}>
                <span style={{ fontSize: 13, color: UI_COLORS.textPrimary }}>{cta}</span>
                <button onClick={() => removeCta(i)} style={{ background: "none", border: "none", cursor: "pointer", color: UI_COLORS.textMuted, padding: 4 }}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              value={newCta}
              onChange={(e) => setNewCta(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCta()}
              placeholder="Add a CTA option..."
              style={{
                flex: 1, padding: "8px 12px", borderRadius: 8,
                border: `1px solid ${UI_COLORS.border}`, fontSize: 13,
                background: "var(--bg-app)", color: UI_COLORS.textPrimary, outline: "none",
              }}
            />
            <Button variant="secondary" onClick={addCta}><span style={{ display: "flex", alignItems: "center", gap: 4 }}><Plus size={14} /> Add</span></Button>
          </div>
        </SectionCard>

        {/* Compliance */}
        <SectionCard title="Compliance & Safety">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Input label="KVKK/GDPR Consent URL" value={config.consentUrl} onChange={(e) => setConfig({ ...config, consentUrl: e.target.value })} placeholder="https://..." />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textPrimary, marginBottom: 6 }}>Emergency Disclaimer</p>
              <textarea
                value={config.emergencyDisclaimer}
                onChange={(e) => setConfig({ ...config, emergencyDisclaimer: e.target.value })}
                rows={2}
                style={{
                  width: "100%", padding: 12, borderRadius: 10,
                  border: `1px solid ${UI_COLORS.border}`, fontSize: 13,
                  background: "var(--bg-app)", color: UI_COLORS.textPrimary,
                  outline: "none", resize: "vertical", fontFamily: "inherit",
                }}
              />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textPrimary, marginBottom: 6 }}>Human Support Fallback Message</p>
              <textarea
                value={config.fallbackMessage}
                onChange={(e) => setConfig({ ...config, fallbackMessage: e.target.value })}
                rows={2}
                style={{
                  width: "100%", padding: 12, borderRadius: 10,
                  border: `1px solid ${UI_COLORS.border}`, fontSize: 13,
                  background: "var(--bg-app)", color: UI_COLORS.textPrimary,
                  outline: "none", resize: "vertical", fontFamily: "inherit",
                }}
              />
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
