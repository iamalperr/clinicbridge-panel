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
  const [hasIntakeFlow, setHasIntakeFlow] = useState(false);
  const [hasWidget, setHasWidget] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubs: (() => void)[] = [];
    let loaded = 0;
    const checkDone = () => { loaded++; if (loaded >= 6) setLoading(false); };

    unsubs.push(subscribeToAgency(agencyId, (a) => { setAgency(a); checkDone(); }));
    unsubs.push(subscribeToAgencyClinics(agencyId, (d) => { setClinics(d); checkDone(); }));
    unsubs.push(subscribeToTreatments(agencyId, (d) => { setTreatments(d); checkDone(); }));
    unsubs.push(onSnapshot(doc(db, "agencies", agencyId, "config", "matching"), (snap) => {
      setHasMatching(snap.exists() && (snap.data()?.treatmentClinicRules?.length || 0) > 0);
      checkDone();
    }, () => checkDone()));
    unsubs.push(onSnapshot(doc(db, "agencies", agencyId, "config", "ai"), (snap) => {
      const data = snap.data();
      setHasIntakeFlow(snap.exists() && data?.categoryFlows && Object.keys(data.categoryFlows).length > 0);
      checkDone();
    }, () => checkDone()));
    unsubs.push(onSnapshot(doc(db, "agencies", agencyId, "config", "widget"), (snap) => {
      setHasWidget(snap.exists());
      checkDone();
    }, () => checkDone()));

    return () => unsubs.forEach((u) => u());
  }, [agencyId]);

  const hasAgencyProfile = !!(agency?.name && agency?.domain);
  const hasConsent = !!(agency?.privacyUrl);

  const steps: SetupStep[] = [
    { key: "profile", label: t("portal.setup.agencyProfile"), description: t("portal.setup.agencyProfileDesc"), icon: <Globe size={18} />, done: hasAgencyProfile, href: `${base}/settings` },
    { key: "treatments", label: t("portal.setup.treatmentCatalog"), description: t("portal.setup.treatmentCatalogDesc"), icon: <Stethoscope size={18} />, done: treatments.length > 0, href: `${base}/treatments` },
    { key: "clinics", label: t("portal.setup.clinicNetwork"), description: t("portal.setup.clinicNetworkDesc"), icon: <Building2 size={18} />, done: clinics.length > 0, href: `${base}/clinics` },
    { key: "matching", label: t("portal.setup.aiMatchingRules"), description: t("portal.setup.aiMatchingRulesDesc"), icon: <Brain size={18} />, done: hasMatching, href: `${base}/matching` },
    { key: "intake", label: t("portal.setup.intakeFlowTitle"), description: t("portal.setup.intakeFlowDesc"), icon: <MessageSquare size={18} />, done: hasIntakeFlow, href: `${base}/intake-flow` },
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
