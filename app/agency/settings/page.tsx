"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { subscribeToAgency, updateAgency } from "@/lib/services/agencyService";
import SectionCard from "@/components/ui/SectionCard";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { Save, Loader2, Globe, Palette, Shield, CheckCircle2 } from "lucide-react";
import type { Agency, TreatmentCategory } from "@/lib/types/agency";
import { TREATMENT_CATEGORIES } from "@/lib/types/agency";

export default function AgencySettingsPage() {
  const { profile } = useAuth();
  const agencyId = profile?.agencyId;

  const [agency, setAgency] = useState<Agency | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#10b981");
  const [privacyUrl, setPrivacyUrl] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [categories, setCategories] = useState<TreatmentCategory[]>([]);

  useEffect(() => {
    if (!agencyId) return;
    const unsub = subscribeToAgency(agencyId, (a) => {
      setAgency(a);
      if (a) {
        setName(a.name);
        setDomain(a.domain);
        setPrimaryColor(a.branding?.primaryColor || "#10b981");
        setPrivacyUrl(a.privacyUrl || "");
        setLanguages(a.supportedLanguages || []);
        setCategories(a.treatmentCategories || []);
      }
      setLoading(false);
    });
    return unsub;
  }, [agencyId]);

  const handleSave = async () => {
    if (!agencyId) return;
    setSaving(true);
    setSaved(false);
    try {
      await updateAgency(agencyId, {
        name,
        domain,
        branding: { primaryColor },
        privacyUrl,
        supportedLanguages: languages,
        treatmentCategories: categories,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error("Save failed:", err);
    }
    setSaving(false);
  };

  const toggleLanguage = (lang: string) => {
    setLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  };

  const toggleCategory = (cat: TreatmentCategory) => {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  if (loading) {
    return (
      <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={32} style={{ animation: "spin 1s linear infinite" }} color="#10b981" />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const LANG_OPTIONS = [
    { code: "en", label: "English" },
    { code: "tr", label: "Türkçe" },
    { code: "de", label: "Deutsch" },
    { code: "ar", label: "العربية" },
    { code: "es", label: "Español" },
    { code: "fr", label: "Français" },
    { code: "ru", label: "Русский" },
  ];

  return (
    <div style={{ padding: "24px 32px", maxWidth: 800 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary }}>Settings</h1>
          <p style={{ fontSize: 14, color: UI_COLORS.textMuted, marginTop: 4 }}>
            Agency branding, languages, and privacy configuration
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          style={{ background: "#10b981", borderColor: "#10b981" }}
        >
          {saved ? <><CheckCircle2 size={14} /> Saved</> : saving ? "Saving..." : <><Save size={14} /> Save Changes</>}
        </Button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* General */}
        <SectionCard title="General Information">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Input label="Agency Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="feelinhealthy.com" />
          </div>
        </SectionCard>

        {/* Branding */}
        <SectionCard title="Branding">
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 6 }}>
                Primary Color
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  style={{ width: 40, height: 40, borderRadius: 8, border: "none", cursor: "pointer" }}
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  style={{ width: 120 }}
                />
              </div>
            </div>
            <div
              style={{
                flex: 1,
                height: 48,
                borderRadius: 10,
                background: primaryColor,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              Preview
            </div>
          </div>
        </SectionCard>

        {/* Privacy */}
        <SectionCard title="Privacy & KVKK/GDPR">
          <Input
            label="Privacy / KVKK URL"
            value={privacyUrl}
            onChange={(e) => setPrivacyUrl(e.target.value)}
            placeholder="https://yoursite.com/privacy"
          />
          <p style={{ fontSize: 12, color: UI_COLORS.textMuted, marginTop: 6 }}>
            This URL will be shown in the widget consent screen.
          </p>
        </SectionCard>

        {/* Languages */}
        <SectionCard title="Supported Languages">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {LANG_OPTIONS.map((lang) => {
              const selected = languages.includes(lang.code);
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => toggleLanguage(lang.code)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 20,
                    border: `1px solid ${selected ? "#10b981" : UI_COLORS.border}`,
                    background: selected ? "rgba(16, 185, 129, 0.1)" : "transparent",
                    color: selected ? "#10b981" : UI_COLORS.textSecondary,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {lang.label}
                </button>
              );
            })}
          </div>
        </SectionCard>

        {/* Treatment Categories */}
        <SectionCard title="Treatment Categories">
          <p style={{ fontSize: 12.5, color: UI_COLORS.textMuted, marginBottom: 12 }}>
            Select the treatment types your agency handles.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(TREATMENT_CATEGORIES).map(([key, val]) => {
              const selected = categories.includes(key as TreatmentCategory);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleCategory(key as TreatmentCategory)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 20,
                    border: `1px solid ${selected ? "#10b981" : UI_COLORS.border}`,
                    background: selected ? "rgba(16, 185, 129, 0.1)" : "transparent",
                    color: selected ? "#10b981" : UI_COLORS.textSecondary,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {val.en}
                </button>
              );
            })}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
