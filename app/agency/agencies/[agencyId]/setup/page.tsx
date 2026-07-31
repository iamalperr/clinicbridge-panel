"use client";

import { useEffect, useState } from "react";
import { useAgencyWorkspace } from "@/components/agency/AgencyWorkspaceContext";
import { useI18n } from "@/lib/i18n-context";
import { subscribeToTreatments } from "@/lib/services/treatmentService";
import { subscribeToAgencyClinics, subscribeToAgency } from "@/lib/services/agencyService";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { UI_COLORS } from "@/components/ui/ui-shared";
import Link from "next/link";
import {
  CheckCircle2, Circle, ArrowRight, Loader2, Rocket,
  Building2, Stethoscope, Brain, MessageSquare, Code, Shield, Globe,
  AlertCircle, RefreshCw
} from "lucide-react";
import type { Agency, AgencyClinic } from "@/lib/types/agency";
import type { TreatmentCatalogItem } from "@/lib/types/matching";

interface SetupStep {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  done: boolean;
  href: string;
}

export default function SetupPage() {
  const { agencyId } = useAgencyWorkspace();
  const { t } = useI18n();
  const base = `/agency/agencies/${agencyId}`;

  const [agency, setAgency] = useState<Agency | null>(null);
  const [clinics, setClinics] = useState<AgencyClinic[]>([]);
  const [treatments, setTreatments] = useState<TreatmentCatalogItem[]>([]);
  const [hasMatching, setHasMatching] = useState(false);
  const [hasWidget, setHasWidget] = useState(false);
  
  const [loadStatus, setLoadStatus] = useState({
    agency: false,
    clinics: false,
    treatments: false,
    matching: false,
    widget: false
  });
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const loading = !Object.values(loadStatus).every(Boolean) && !error;

  useEffect(() => {
    let isMounted = true;
    const unsubs: (() => void)[] = [];
    setError(null);
    setLoadStatus({ agency: false, clinics: false, treatments: false, matching: false, widget: false });
    
    const timeoutId = setTimeout(() => {
      if (isMounted) {
        setLoadStatus(prev => {
           if (!Object.values(prev).every(Boolean)) {
             setError("Kurulum verileri yüklenirken zaman aşımına uğradı.");
           }
           return prev;
        });
      }
    }, 10000);

    const markLoaded = (key: keyof typeof loadStatus) => {
      if (isMounted) setLoadStatus(prev => ({ ...prev, [key]: true }));
    };
    
    const markError = (err: any) => {
      console.error("Setup fetch error:", err);
      if (isMounted) setError("Kurulum bilgileri yüklenemedi.");
    };

    try {
      unsubs.push(subscribeToAgency(agencyId, (a) => { setAgency(a); markLoaded("agency"); }));
      unsubs.push(subscribeToAgencyClinics(agencyId, (d) => { setClinics(d); markLoaded("clinics"); }));
      unsubs.push(subscribeToTreatments(agencyId, (d) => { setTreatments(d); markLoaded("treatments"); }));
      unsubs.push(onSnapshot(doc(db, "agencies", agencyId, "config", "matching"), (snap) => {
        setHasMatching(snap.exists() && (snap.data()?.treatmentClinicRules?.length || 0) > 0);
        markLoaded("matching");
      }, markError));
      unsubs.push(onSnapshot(doc(db, "agencies", agencyId, "config", "widget"), (snap) => {
        setHasWidget(snap.exists());
        markLoaded("widget");
      }, markError));
    } catch (err) {
      markError(err);
    }

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      unsubs.forEach((u) => u());
    };
  }, [agencyId, retryCount]);

  const hasAgencyProfile = !!(agency?.name && agency?.domain);
  const hasConsent = !!(agency?.privacyUrl);

  const steps: SetupStep[] = [
    { key: "profile", label: t("portal.setup.agencyProfile"), description: t("portal.setup.agencyProfileDesc"), icon: <Globe size={18} />, done: hasAgencyProfile, href: `${base}/settings` },
    { key: "treatments", label: t("portal.setup.treatmentCatalog"), description: t("portal.setup.treatmentCatalogDesc"), icon: <Stethoscope size={18} />, done: treatments.length > 0, href: `${base}/treatments` },
    { key: "clinics", label: t("portal.setup.clinicNetwork"), description: t("portal.setup.clinicNetworkDesc"), icon: <Building2 size={18} />, done: clinics.length > 0, href: `${base}/clinics` },
    { key: "matching", label: t("portal.setup.aiMatchingRules"), description: t("portal.setup.aiMatchingRulesDesc"), icon: <Brain size={18} />, done: hasMatching, href: `${base}/matching` },
    { key: "widget", label: t("portal.setup.widgetExperience"), description: t("portal.setup.widgetExperienceDesc"), icon: <Code size={18} />, done: hasWidget, href: `${base}/widget` },
    { key: "consent", label: t("portal.setup.consentUrl"), description: t("portal.setup.consentUrlDesc"), icon: <Shield size={18} />, done: hasConsent, href: `${base}/settings` },
  ];

  const completedSteps = steps.filter((s) => s.done).length;
  const progressPercent = Math.round((completedSteps / steps.length) * 100);

  if (loading) {
    return (
      <div style={{ height: "40vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={32} style={{ animation: "spin 1s linear infinite" }} color="#10b981" />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height: "40vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: 24, background: "rgba(239, 68, 68, 0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <AlertCircle size={24} color="#ef4444" />
        </div>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: UI_COLORS.textPrimary, marginBottom: 4 }}>{error}</p>
          <p style={{ fontSize: 13, color: UI_COLORS.textMuted }}>Teknik bir sorun oluştu veya bağlantı zaman aşımına uğradı.</p>
        </div>
        <button
          onClick={() => setRetryCount(c => c + 1)}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: "rgba(16, 185, 129, 0.1)", color: "#10b981", border: "none",
            cursor: "pointer", transition: "all 0.15s"
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(16, 185, 129, 0.2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(16, 185, 129, 0.1)"; }}
        >
          <RefreshCw size={14} />
          Tekrar Dene
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <Rocket size={22} color="#10b981" />
          <h1 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.02em" }}>
            {t("portal.setup.title")}
          </h1>
        </div>
        <p style={{ fontSize: 14, color: UI_COLORS.textMuted }}>
          {agency?.name || "Agency"} {t("portal.setup.subtitle")}
        </p>
      </div>

      {/* Progress */}
      <div style={{
        padding: "20px 24px", borderRadius: 14, border: `1px solid ${UI_COLORS.border}`,
        background: progressPercent === 100 ? "rgba(16, 185, 129, 0.04)" : "var(--bg-card)", marginBottom: 24,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: UI_COLORS.textPrimary }}>
            {progressPercent === 100 ? `✅ ${t("portal.setup.completed")}` : `${completedSteps} / ${steps.length} ${t("portal.setup.stepsCompleted")}`}
          </span>
          <span style={{ fontSize: 15, fontWeight: 800, color: progressPercent === 100 ? "#10b981" : "#f59e0b" }}>
            %{progressPercent}
          </span>
        </div>
        <div style={{ height: 10, borderRadius: 5, background: "var(--bg-app)", overflow: "hidden" }}>
          <div style={{
            width: `${progressPercent}%`, height: "100%", borderRadius: 5,
            background: progressPercent === 100 ? "#10b981" : "linear-gradient(90deg, #f59e0b, #f97316)",
            transition: "width 0.6s ease",
          }} />
        </div>
      </div>

      {/* Steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {steps.map((step, idx) => (
          <Link key={step.key} href={step.href} style={{ textDecoration: "none" }}>
            <div
              style={{
                display: "flex", alignItems: "center", gap: 16,
                padding: "16px 20px", borderRadius: 12,
                border: `1px solid ${step.done ? "rgba(16, 185, 129, 0.2)" : UI_COLORS.border}`,
                background: step.done ? "rgba(16, 185, 129, 0.03)" : "var(--bg-card)",
                cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!step.done) e.currentTarget.style.borderColor = "rgba(16, 185, 129, 0.3)";
              }}
              onMouseLeave={(e) => {
                if (!step.done) e.currentTarget.style.borderColor = UI_COLORS.border;
              }}
            >
              <span style={{
                width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: step.done ? "rgba(16, 185, 129, 0.1)" : "var(--bg-app)",
                color: step.done ? "#10b981" : UI_COLORS.textMuted,
                fontSize: 13, fontWeight: 800,
              }}>
                {step.done ? <CheckCircle2 size={18} /> : idx + 1}
              </span>

              <span style={{ color: step.done ? "#10b981" : UI_COLORS.textMuted, opacity: step.done ? 1 : 0.5, flexShrink: 0 }}>
                {step.icon}
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontSize: 14, fontWeight: 700,
                  color: step.done ? "#10b981" : UI_COLORS.textPrimary,
                  textDecoration: step.done ? "line-through" : "none",
                }}>
                  {step.label}
                </p>
                <p style={{ fontSize: 12, color: UI_COLORS.textMuted, marginTop: 2 }}>
                  {step.description}
                </p>
              </div>

              {!step.done && <ArrowRight size={16} color={UI_COLORS.textMuted} />}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
