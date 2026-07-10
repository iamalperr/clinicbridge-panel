"use client";

import { useAgencyWorkspace } from "@/components/agency/AgencyWorkspaceContext";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { isSuperAdmin } from "@/lib/types";
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { subscribeToTreatments } from "@/lib/services/treatmentService";
import { subscribeToAgencyClinics } from "@/lib/services/agencyService";
import SectionCard from "@/components/ui/SectionCard";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { Brain, Save, Loader2, CheckCircle2, AlertCircle, Link2, DollarSign, Shield, Building2 } from "lucide-react";
import type { AIMatchingConfig, TreatmentClinicRule, TreatmentCatalogItem } from "@/lib/types/matching";
import type { TreatmentCategory, AgencyClinic } from "@/lib/types/agency";
import { TREATMENT_CATEGORIES } from "@/lib/types/agency";

const DEFAULT_CONFIG: Omit<AIMatchingConfig, "id" | "agencyId" | "createdAt" | "updatedAt"> = {
  routingMode: "manual",
  maxClinicsToShow: 5,
  showPriceRange: true,
  showProfileLinks: true,
  requireConsentBeforeQuote: true,
  treatmentClinicRules: [],
};

export default function MatchingPage() {
  const { profile } = useAuth();
  const { agencyId } = useAgencyWorkspace();

  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [treatments, setTreatments] = useState<TreatmentCatalogItem[]>([]);
  const [clinics, setClinics] = useState<AgencyClinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    const unsubs: (() => void)[] = [];
    let loaded = 0;
    const checkDone = () => { loaded++; if (loaded >= 3) setLoading(false); };

    const docRef = doc(db, "agencies", agencyId, "config", "matching");
    unsubs.push(onSnapshot(docRef, (snap) => {
      if (snap.exists()) setConfig({ ...DEFAULT_CONFIG, ...snap.data() } as any);
      checkDone();
    }, () => checkDone()));

    unsubs.push(subscribeToTreatments(agencyId, (d) => { setTreatments(d); checkDone(); }));
    unsubs.push(subscribeToAgencyClinics(agencyId, (d) => { setClinics(d); checkDone(); }));
    return () => unsubs.forEach((u) => u());
  }, [agencyId]);

  const handleSave = async () => {
    if (!agencyId) return;
    setSaving(true); setSaved(false);
    try {
      await setDoc(doc(db, "agencies", agencyId, "config", "matching"), {
        ...config, updatedAt: serverTimestamp(),
      }, { merge: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) { console.error("Failed to save:", err); }
    finally { setSaving(false); }
  };

  // Get unique treatment categories from the agency's treatments
  const treatmentCats = Array.from(new Set(treatments.map((t) => t.category)));

  const getRule = (cat: TreatmentCategory): TreatmentClinicRule => {
    return config.treatmentClinicRules.find((r) => r.treatmentCategory === cat) || {
      treatmentCategory: cat, eligibleClinicIds: [], preferredClinicIds: [],
    };
  };

  const toggleClinicForCategory = (cat: TreatmentCategory, clinicId: string) => {
    const rules = [...config.treatmentClinicRules];
    const idx = rules.findIndex((r) => r.treatmentCategory === cat);
    const rule = idx >= 0 ? { ...rules[idx] } : { treatmentCategory: cat, eligibleClinicIds: [], preferredClinicIds: [] };

    if (rule.eligibleClinicIds.includes(clinicId)) {
      rule.eligibleClinicIds = rule.eligibleClinicIds.filter((id) => id !== clinicId);
    } else {
      rule.eligibleClinicIds = [...rule.eligibleClinicIds, clinicId];
    }

    if (idx >= 0) rules[idx] = rule;
    else rules.push(rule);

    setConfig({ ...config, treatmentClinicRules: rules });
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
        <p style={{ color: UI_COLORS.textMuted, marginTop: 8 }}>Select an agency to configure AI matching rules.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1000 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.02em" }}>AI Matching Rules</h1>
          <p style={{ fontSize: 14, color: UI_COLORS.textMuted, marginTop: 4 }}>
            Configure how AI matches patients to clinics based on treatment, location, and preferences.
          </p>
        </div>
        <Button onClick={handleSave} isLoading={saving}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {saved ? <CheckCircle2 size={16} /> : <Save size={16} />}
            {saved ? "Saved!" : "Save Rules"}
          </span>
        </Button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Routing Mode */}
        <SectionCard title="Routing Mode">
          <p style={{ fontSize: 12.5, color: UI_COLORS.textMuted, marginBottom: 12 }}>
            How should AI-recommended clinics be assigned to leads?
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            {([
              { value: "manual", label: "Manual", desc: "AI recommends, agency admin assigns" },
              { value: "assisted", label: "Assisted", desc: "AI pre-selects top 3–5, admin approves" },
              { value: "auto", label: "Auto", desc: "AI auto-assigns (coming soon)" },
            ] as const).map((mode) => (
              <button key={mode.value} onClick={() => mode.value !== "auto" && setConfig({ ...config, routingMode: mode.value })}
                style={{
                  flex: 1, padding: "14px 16px", borderRadius: 12, textAlign: "left", cursor: mode.value === "auto" ? "not-allowed" : "pointer",
                  border: `1px solid ${config.routingMode === mode.value ? "#10b981" : UI_COLORS.border}`,
                  background: config.routingMode === mode.value ? "rgba(16, 185, 129, 0.06)" : "transparent",
                  opacity: mode.value === "auto" ? 0.5 : 1, transition: "all 0.15s",
                }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: config.routingMode === mode.value ? "#10b981" : UI_COLORS.textPrimary }}>{mode.label}</p>
                <p style={{ fontSize: 11.5, color: UI_COLORS.textMuted, marginTop: 4 }}>{mode.desc}</p>
                {mode.value === "auto" && <span style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700 }}>Coming Soon</span>}
              </button>
            ))}
          </div>
        </SectionCard>

        {/* Display Settings */}
        <SectionCard title="Display Settings">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Select label="Max Clinics to Show" value={config.maxClinicsToShow.toString()} onChange={(e) => setConfig({ ...config, maxClinicsToShow: Number(e.target.value) })}
              options={[1, 2, 3, 5, 10].map((n) => ({ label: n.toString(), value: n.toString() }))} />
            <div />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
            {([
              { key: "showPriceRange", label: "Show estimated price range", icon: <DollarSign size={14} /> },
              { key: "showProfileLinks", label: "Show 'More Information' profile links", icon: <Link2 size={14} /> },
              { key: "requireConsentBeforeQuote", label: "Require GDPR/KVKK consent before quote", icon: <Shield size={14} /> },
            ] as const).map(({ key, label, icon }) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "8px 0" }}>
                <input type="checkbox" checked={config[key] as boolean}
                  onChange={(e) => setConfig({ ...config, [key]: e.target.checked })}
                  style={{ width: 18, height: 18, accentColor: "#10b981", cursor: "pointer" }} />
                <span style={{ display: "flex", alignItems: "center", gap: 6, color: UI_COLORS.textPrimary, fontSize: 13.5 }}>
                  {icon} {label}
                </span>
              </label>
            ))}
          </div>
        </SectionCard>

        {/* Treatment → Clinic Rules */}
        <SectionCard title="Treatment → Clinic Mapping">
          <p style={{ fontSize: 12.5, color: UI_COLORS.textMuted, marginBottom: 16 }}>
            Select which clinics are eligible for each treatment category. AI will only recommend clinics that are mapped here.
          </p>
          {treatmentCats.length === 0 ? (
            <p style={{ fontSize: 13, color: UI_COLORS.textMuted, fontStyle: "italic" }}>
              No treatments defined yet. Add treatments in the Treatment Catalog first.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {treatmentCats.map((cat) => {
                const rule = getRule(cat);
                return (
                  <div key={cat} style={{ padding: "14px 16px", borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, background: "var(--bg-app)" }}>
                    <p style={{ fontSize: 13.5, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 10 }}>
                      {TREATMENT_CATEGORIES[cat]?.en || cat}
                    </p>
                    {clinics.length === 0 ? (
                      <p style={{ fontSize: 12, color: UI_COLORS.textMuted }}>No clinics available.</p>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {clinics.map((c) => {
                          const eligible = rule.eligibleClinicIds.includes(c.clinicId);
                          return (
                            <button key={c.clinicId} onClick={() => toggleClinicForCategory(cat, c.clinicId)}
                              style={{
                                padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                                border: `1px solid ${eligible ? "#10b981" : UI_COLORS.border}`,
                                background: eligible ? "rgba(16, 185, 129, 0.08)" : "transparent",
                                color: eligible ? "#10b981" : UI_COLORS.textMuted,
                                display: "flex", alignItems: "center", gap: 4, transition: "all 0.15s",
                              }}>
                              <Building2 size={11} /> {c.clinicName}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
