"use client";

import { useEffect, useState } from "react";
import { useAgencyWorkspace } from "@/components/agency/AgencyWorkspaceContext";
import { subscribeToTreatments } from "@/lib/services/treatmentService";
import { subscribeToAgencyClinics } from "@/lib/services/agencyService";
import { subscribeToLeads } from "@/lib/services/leadService";
import { subscribeToQuotes } from "@/lib/services/quoteService";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import StatCard from "@/components/ui/StatCard";
import SectionCard from "@/components/ui/SectionCard";
import Badge from "@/components/ui/Badge";
import { UI_COLORS } from "@/components/ui/ui-shared";
import Link from "next/link";
import {
  Users2, UserPlus, Building2, Stethoscope, FileText, Loader2,
  Brain, Code, ArrowRight, CheckCircle2, Circle,
} from "lucide-react";
import type { AgencyClinic, Lead } from "@/lib/types/agency";
import type { TreatmentCatalogItem, QuoteRequest, AIMatchingConfig } from "@/lib/types/matching";

export default function AgencyOverviewPage() {
  const { agencyId } = useAgencyWorkspace();

  const [clinics, setClinics] = useState<AgencyClinic[]>([]);
  const [treatments, setTreatments] = useState<TreatmentCatalogItem[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [quotes, setQuotes] = useState<QuoteRequest[]>([]);
  const [matchingConfig, setMatchingConfig] = useState<AIMatchingConfig | null>(null);
  const [widgetConfigExists, setWidgetConfigExists] = useState(false);
  const [intakeFlowExists, setIntakeFlowExists] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubs: (() => void)[] = [];
    let loaded = 0;
    const total = 6;
    const checkDone = () => { loaded++; if (loaded >= total) setLoading(false); };

    unsubs.push(subscribeToAgencyClinics(agencyId, (d) => { setClinics(d); checkDone(); }));
    unsubs.push(subscribeToTreatments(agencyId, (d) => { setTreatments(d); checkDone(); }));
    unsubs.push(subscribeToLeads(agencyId, (d) => { setLeads(d); checkDone(); }));
    unsubs.push(subscribeToQuotes(agencyId, (d) => { setQuotes(d); checkDone(); }));
    unsubs.push(onSnapshot(doc(db, "agencies", agencyId, "config", "matching"), (snap) => {
      if (snap.exists()) setMatchingConfig(snap.data() as AIMatchingConfig);
      checkDone();
    }, () => checkDone()));
    unsubs.push(onSnapshot(doc(db, "agencies", agencyId, "config", "ai"), (snap) => {
      setIntakeFlowExists(snap.exists());
      checkDone();
    }, () => checkDone()));

    // Widget config check
    onSnapshot(doc(db, "agencies", agencyId, "config", "widget"), (snap) => {
      setWidgetConfigExists(snap.exists());
    }, () => {});

    return () => unsubs.forEach((u) => u());
  }, [agencyId]);

  const base = `/agency/agencies/${agencyId}`;
  const newLeads = leads.filter((l) => l.status === "new").length;

  // Setup checklist
  const checklist = [
    { label: "En az 1 tedavi tanımlandı", done: treatments.length > 0, href: `${base}/treatments` },
    { label: "En az 1 klinik bağlandı", done: clinics.length > 0, href: `${base}/clinics` },
    { label: "AI Matching kuralları tanımlı", done: !!matchingConfig && (matchingConfig.treatmentClinicRules?.length || 0) > 0, href: `${base}/matching` },
    { label: "Intake Flow oluşturuldu", done: intakeFlowExists, href: `${base}/intake-flow` },
    { label: "Widget ayarlandı", done: widgetConfigExists, href: `${base}/widget` },
  ];
  const completedSteps = checklist.filter((c) => c.done).length;
  const progressPercent = Math.round((completedSteps / checklist.length) * 100);

  if (loading) {
    return (
      <div style={{ height: "40vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={32} style={{ animation: "spin 1s linear infinite" }} color="#10b981" />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        <StatCard label="Toplam Lead" value={leads.length} icon={<Users2 size={20} />} />
        <StatCard label="Yeni Lead" value={newLeads} icon={<UserPlus size={20} />} />
        <StatCard label="Bağlı Klinik" value={clinics.length} icon={<Building2 size={20} />} />
        <StatCard label="Tanımlı Tedavi" value={treatments.length} icon={<Stethoscope size={20} />} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Setup Checklist */}
        <SectionCard title="Kurulum İlerlemesi">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--bg-app)", overflow: "hidden" }}>
              <div style={{ width: `${progressPercent}%`, height: "100%", borderRadius: 4, background: progressPercent === 100 ? "#10b981" : "#f59e0b", transition: "width 0.5s" }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: progressPercent === 100 ? "#10b981" : "#f59e0b" }}>
              %{progressPercent}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {checklist.map((item) => (
              <Link key={item.label} href={item.href} style={{ textDecoration: "none" }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                  borderRadius: 8, border: `1px solid ${UI_COLORS.border}`,
                  background: item.done ? "rgba(16, 185, 129, 0.03)" : "transparent",
                  transition: "background 0.15s", cursor: "pointer",
                }}>
                  {item.done
                    ? <CheckCircle2 size={16} color="#10b981" />
                    : <Circle size={16} color={UI_COLORS.textMuted} style={{ opacity: 0.4 }} />}
                  <span style={{
                    fontSize: 13, color: item.done ? "#10b981" : UI_COLORS.textPrimary,
                    textDecoration: item.done ? "line-through" : "none", flex: 1,
                  }}>
                    {item.label}
                  </span>
                  {!item.done && <ArrowRight size={14} color={UI_COLORS.textMuted} />}
                </div>
              </Link>
            ))}
          </div>
        </SectionCard>

        {/* Quick Stats */}
        <SectionCard title="Durum Bilgisi">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${UI_COLORS.border}` }}>
              <span style={{ fontSize: 13, color: UI_COLORS.textMuted }}>Teklif Talepleri</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textPrimary }}>{quotes.length}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${UI_COLORS.border}` }}>
              <span style={{ fontSize: 13, color: UI_COLORS.textMuted }}>Routing Mode</span>
              <Badge label={matchingConfig?.routingMode || "—"} variant="default" />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${UI_COLORS.border}` }}>
              <span style={{ fontSize: 13, color: UI_COLORS.textMuted }}>Widget</span>
              <Badge label={widgetConfigExists ? "Configured" : "Not Set"} variant={widgetConfigExists ? "success" : "warning"} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
              <span style={{ fontSize: 13, color: UI_COLORS.textMuted }}>Intake Flow</span>
              <Badge label={intakeFlowExists ? "Configured" : "Not Set"} variant={intakeFlowExists ? "success" : "warning"} />
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Recent Leads */}
      {leads.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <SectionCard title="Son Lead'ler">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {leads.slice(0, 5).map((lead) => (
                <div key={lead.id} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px", borderRadius: 8, border: `1px solid ${UI_COLORS.border}`,
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textPrimary, flex: 1 }}>
                    {lead.patientName || "Anonymous"}
                  </span>
                  <span style={{ fontSize: 12, color: UI_COLORS.textMuted }}>{lead.country}</span>
                  <Badge label={lead.status.replace(/_/g, " ")} variant={lead.status === "new" ? "info" : "default"} />
                </div>
              ))}
            </div>
            {leads.length > 5 && (
              <Link href={`${base}/leads`} style={{ display: "block", textAlign: "center", marginTop: 12, fontSize: 13, color: "#10b981", textDecoration: "none" }}>
                Tüm lead'leri gör →
              </Link>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  );
}
