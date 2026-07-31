"use client";

import { useAgencyWorkspace } from "@/components/agency/AgencyWorkspaceContext";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { isSuperAdmin } from "@/lib/types";
import { doc, setDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { subscribeToTreatments } from "@/lib/services/treatmentService";
import { subscribeToAgencyClinics } from "@/lib/services/agencyService";
import SectionCard from "@/components/ui/SectionCard";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { Brain, Save, Loader2, CheckCircle2, AlertCircle, Link2, DollarSign, Shield, Building2, Info } from "lucide-react";
import type { AIMatchingConfig, TreatmentClinicRule, TreatmentCatalogItem } from "@/lib/types/matching";
import type { TreatmentCategory, AgencyClinic } from "@/lib/types/agency";
import { TREATMENT_CATEGORIES } from "@/lib/types/agency";
import { useI18n } from "@/lib/i18n-context";

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
  const { t, language } = useI18n();

  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [treatments, setTreatments] = useState<TreatmentCatalogItem[]>([]);
  const [clinics, setClinics] = useState<AgencyClinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const catLabel = (cat: string) => TREATMENT_CATEGORIES[cat as TreatmentCategory]?.[language === "tr" ? "tr" : "en"] || cat;

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
        <h2 style={{ marginTop: 16, color: UI_COLORS.textPrimary }}>{t("portal.common.noAgencySelected")}</h2>
        <p style={{ color: UI_COLORS.textMuted, marginTop: 8 }}>{t("portal.common.selectAgency")}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1000 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.02em" }}>{t("portal.matching.title")}</h1>
          <p style={{ fontSize: 14, color: UI_COLORS.textMuted, marginTop: 4 }}>
            {t("portal.matching.subtitle")}
          </p>
        </div>
        <Button onClick={handleSave} isLoading={saving}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {saved ? <CheckCircle2 size={16} /> : <Save size={16} />}
            {saved ? t("portal.matching.saved") : t("portal.matching.saveRules")}
          </span>
        </Button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Routing Mode */}
        <SectionCard title={t("portal.matching.routingMode")}>
          <p style={{ fontSize: 12.5, color: UI_COLORS.textMuted, marginBottom: 12 }}>
            {t("portal.matching.routingModeDesc")}
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            {([
              { value: "manual", label: t("portal.matching.manual"), desc: t("portal.matching.manualDesc"), tooltip: "AI yalnızca öneri üretir. Lead hiçbir zaman otomatik atanmaz." },
              { value: "assisted", label: t("portal.matching.assisted"), desc: t("portal.matching.assistedDesc"), tooltip: "AI operasyon ekibine en uygun klinikleri önceliklendirerek önerir." },
              { value: "auto", label: t("portal.matching.auto"), desc: t("portal.matching.autoDesc"), tooltip: "AI belirlenen kurallara göre otomatik atama gerçekleştirir." },
            ] as const).map((mode) => (
              <button key={mode.value} onClick={() => mode.value !== "auto" && setConfig({ ...config, routingMode: mode.value })}
                style={{
                  flex: 1, padding: "14px 16px", borderRadius: 12, textAlign: "left", cursor: mode.value === "auto" ? "not-allowed" : "pointer",
                  border: `1px solid ${config.routingMode === mode.value ? "#10b981" : UI_COLORS.border}`,
                  background: config.routingMode === mode.value ? "rgba(16, 185, 129, 0.06)" : "transparent",
                  opacity: mode.value === "auto" ? 0.5 : 1, transition: "all 0.15s",
                  position: "relative"
                }}>
                <div style={{ position: "absolute", top: 12, right: 12, color: UI_COLORS.textMuted }} title={mode.tooltip}>
                  <Info size={16} />
                </div>
                <p style={{ fontSize: 14, fontWeight: 700, color: config.routingMode === mode.value ? "#10b981" : UI_COLORS.textPrimary }}>{mode.label}</p>
                <p style={{ fontSize: 11.5, color: UI_COLORS.textMuted, marginTop: 4, paddingRight: 16 }}>{mode.desc}</p>
                {mode.value === "auto" && <span style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700 }}>{t("portal.matching.comingSoon")}</span>}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 24, padding: "16px", background: "#f8fafc", borderRadius: 8, border: `1px solid ${UI_COLORS.border}` }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textPrimary, marginBottom: 12 }}>Atama Modu Karşılaştırması</h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              <div style={{ fontSize: 12, color: UI_COLORS.textSecondary }}>
                <strong style={{ color: UI_COLORS.textPrimary, display: "block", marginBottom: 4 }}>Manual</strong>
                Hasta klinikleri görür.<br />Yönetici atama yapar.
              </div>
              <div style={{ fontSize: 12, color: UI_COLORS.textSecondary }}>
                <strong style={{ color: UI_COLORS.textPrimary, display: "block", marginBottom: 4 }}>Assisted</strong>
                Hasta klinikleri görür.<br />AI öneriyi sıralar.<br />Yönetici tek tıkla onaylar.
              </div>
              <div style={{ fontSize: 12, color: UI_COLORS.textSecondary }}>
                <strong style={{ color: UI_COLORS.textPrimary, display: "block", marginBottom: 4 }}>Automatic</strong>
                Hasta klinikleri görür.<br />AI otomatik atama yapar.
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Display Settings */}
        <SectionCard title={t("portal.matching.displaySettings")}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Select label={t("portal.matching.maxClinics")} value={config.maxClinicsToShow.toString()} onChange={(e) => setConfig({ ...config, maxClinicsToShow: Number(e.target.value) })}
              options={[1, 2, 3, 5, 10].map((n) => ({ label: n.toString(), value: n.toString() }))} />
            <div />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
            {([
              { key: "showPriceRange", label: t("portal.matching.showPriceRange"), icon: <DollarSign size={14} /> },
              { key: "showProfileLinks", label: t("portal.matching.showProfileLinks"), icon: <Link2 size={14} /> },
              { key: "requireConsentBeforeQuote", label: t("portal.matching.requireConsent"), icon: <Shield size={14} /> },
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
        <SectionCard title={t("portal.matching.clinicMapping")}>
          <p style={{ fontSize: 12.5, color: UI_COLORS.textMuted, marginBottom: 16 }}>
            {t("portal.matching.clinicMappingDesc")}
          </p>
          {treatmentCats.length === 0 ? (
            <p style={{ fontSize: 13, color: UI_COLORS.textMuted, fontStyle: "italic" }}>
              {t("portal.matching.noTreatmentsDefined")}
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {treatmentCats.map((cat) => {
                const rule = getRule(cat);
                return (
                  <div key={cat} style={{ padding: "14px 16px", borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, background: "var(--bg-app)" }}>
                    <p style={{ fontSize: 13.5, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 10 }}>
                      {catLabel(cat)}
                    </p>
                    {clinics.length === 0 ? (
                      <p style={{ fontSize: 12, color: UI_COLORS.textMuted }}>{t("portal.matching.noClinicsAvailable")}</p>
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
