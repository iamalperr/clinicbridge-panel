"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { MOCK_STATS } from "@/lib/mock-data";
import StatCard from "@/components/ui/StatCard";
import SectionCard from "@/components/ui/SectionCard";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { formatNumber } from "@/lib/utils";
import { useI18n } from "@/lib/i18n-context";

export default function ClinicOverviewPage() {
  const { clinicId } = useParams() as { clinicId: string };
  const { t } = useI18n();
  const [stats, setStats] = useState(MOCK_STATS);

  useEffect(() => {
    Promise.all([
      getDocs(collection(db, "clinics", clinicId, "conversations")),
      getDocs(collection(db, "clinics", clinicId, "appointments")),
    ])
      .then(([conv, appt]) => {
        if (conv.size > 0 || appt.size > 0) {
          setStats(prev => ({ ...prev, totalConversations: conv.size }));
        }
      })
      .catch(() => {});
  }, [clinicId]);

  const modules = [
    { label: "AI Assistant", enabled: true,  note: "GPT-4o · System prompt active" }, // These notes are specialized, might keep English or Translate 
    { label: "Chat Widget",  enabled: true,  note: "Embedded on website" },
    { label: "Voice",        enabled: false, note: "Not configured" },
  ];

  return (
    <>
      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 18, marginBottom: 28 }}>
        <StatCard label={t("clinics.stats.totalMessages")}   value={formatNumber(stats.totalMessages)}  subtext="All time" />
        <StatCard label={t("clinics.stats.conversations")}    value={formatNumber(stats.totalConversations)} subtext="All time" />
        <StatCard label={t("clinics.stats.resolveRate")}     value={`${stats.resolvedRate}%`}  subtext="Last 30 days" />
        <StatCard label={t("clinics.stats.avgResponse")}     value={`${stats.avgResponseTime}s`} subtext="Per message" />
      </div>

      {/* Module status */}
      <SectionCard title={t("clinics.overview.moduleStatus")} subtitle={t("clinics.overview.moduleSubtitle")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {modules.map((m) => (
            <div key={m.label} style={{ 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "space-between", 
              padding: "14px 18px", 
              background: "rgba(255, 255, 255, 0.02)", 
              borderRadius: 12, 
              border: `1px solid ${UI_COLORS.border}` 
            }}>
              <div>
                <p style={{ fontSize: 13.5, fontWeight: 600, color: UI_COLORS.textPrimary }}>{m.label}</p>
                <p style={{ fontSize: 12, color: UI_COLORS.textMuted, marginTop: 3 }}>{m.note}</p>
              </div>
              <span style={{ 
                fontSize: 11.5, 
                fontWeight: 700, 
                padding: "4px 12px", 
                borderRadius: 99, 
                background: m.enabled ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.05)", 
                color: m.enabled ? "#34d399" : UI_COLORS.textMuted,
                textTransform: "uppercase",
                letterSpacing: "0.02em"
              }}>
                {m.enabled ? t("common.status.active") : t("common.status.inactive")}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Quick info */}
      <SectionCard title={t("clinics.overview.quickInfo")}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            ["Clinic ID", clinicId],
            [t("clinics.overview.lastActive"), "Today, 10:30"],
            [t("clinics.overview.language"), "Turkish / English"],
            [t("clinics.overview.timezone"), "Europe/Istanbul"],
          ].map(([k, v]) => (
            <div key={k}>
              <p style={{ fontSize: 11.5, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{k}</p>
              <p style={{ fontSize: 13.5, color: "var(--text-primary)", fontWeight: 500 }}>{v}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </>
  );
}