"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  collection, doc, onSnapshot, getDoc,
  query, where, orderBy, limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import StatCard from "@/components/ui/StatCard";
import SectionCard from "@/components/ui/SectionCard";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { formatNumber } from "@/lib/utils";
import { useI18n } from "@/lib/i18n-context";
import { Loader2 } from "lucide-react";
import type { WidgetSettings } from "@/lib/types";

interface LiveStats {
  totalConversations: number;
  totalMessages: number;
  resolvedRate: number | null;   // null = not enough data
  avgResponseTime: number | null; // null = not tracked
  lastActive: string | null;
}

interface ClinicMeta {
  aiEnabled?: "active" | "inactive";
  domain?: string;
  language?: string;
  timezone?: string;
  createdAt?: string;
}

export default function ClinicOverviewPage() {
  const { clinicId } = useParams() as { clinicId: string };
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<LiveStats>({
    totalConversations: 0,
    totalMessages: 0,
    resolvedRate: null,
    avgResponseTime: null,
    lastActive: null,
  });
  const [clinicMeta, setClinicMeta] = useState<ClinicMeta>({});
  const [widgetSettings, setWidgetSettings] = useState<Partial<WidgetSettings>>({});

  /* ── Fetch clinic meta (aiEnabled, domain, language, etc.) ── */
  useEffect(() => {
    getDoc(doc(db, "clinics", clinicId)).then((snap) => {
      if (snap.exists()) setClinicMeta(snap.data() as ClinicMeta);
    }).catch(() => {});

    getDoc(doc(db, "widgetSettings", clinicId)).then((snap) => {
      if (snap.exists()) setWidgetSettings(snap.data() as Partial<WidgetSettings>);
    }).catch(() => {});
  }, [clinicId]);

  /* ── Realtime listener: clinics/{clinicId}/conversations ── */
  useEffect(() => {
    const convRef = collection(db, "clinics", clinicId, "conversations");

    const unsub = onSnapshot(convRef, (snap) => {
      const docs = snap.docs.map((d) => d.data());

      const total = docs.length;
      const totalMessages = docs.reduce((sum, d) => sum + (d.messageCount ?? 0), 0);

      // Resolution rate
      const resolved = docs.filter((d) => d.status === "resolved").length;
      const resolvedRate = total > 0 ? Math.round((resolved / total) * 100) : null;

      // Last active: find most recent updatedAt
      const times = docs
        .map((d) => d.updatedAt ?? d.createdAt)
        .filter(Boolean)
        .sort()
        .reverse();
      const lastActive = times[0] ? formatRelativeTime(times[0]) : null;

      setStats({ totalConversations: total, totalMessages, resolvedRate, avgResponseTime: null, lastActive });
      setLoading(false);
    }, () => {
      setLoading(false);
    });

    return () => unsub();
  }, [clinicId]);

  /* ── Module status derived from real settings ── */
  const modules = [
    {
      label: "AI Assistant",
      enabled: clinicMeta.aiEnabled === "active" || clinicMeta.aiEnabled === undefined,
      note: clinicMeta.aiEnabled === "inactive" ? "Devre dışı" : "Aktif · GPT-4o",
    },
    {
      label: "Chat Widget",
      enabled: !!widgetSettings.title, // widget settings exist → configured
      note: widgetSettings.title ? `"${widgetSettings.title}" — ${widgetSettings.position ?? "bottom-right"}` : "Yapılandırılmamış",
    },
    {
      label: "Voice",
      enabled: false,
      note: "Henüz yapılandırılmadı",
    },
  ];

  if (loading) {
    return (
      <div style={{ padding: 80, textAlign: "center", color: UI_COLORS.textMuted }}>
        <Loader2 size={28} style={{ margin: "0 auto 12px", animation: "spin 1s linear infinite" }} />
        <p style={{ fontSize: 14 }}>Veriler yükleniyor…</p>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  const noData = stats.totalConversations === 0;

  return (
    <>
      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 18, marginBottom: 28 }}>
        <StatCard
          label={t("clinics.stats.totalMessages")}
          value={noData ? "—" : formatNumber(stats.totalMessages)}
          subtext={noData ? "Henüz mesaj yok" : "All time"}
        />
        <StatCard
          label={t("clinics.stats.conversations")}
          value={noData ? "—" : formatNumber(stats.totalConversations)}
          subtext={noData ? "Henüz görüşme yok" : "All time"}
        />
        <StatCard
          label={t("clinics.stats.resolveRate")}
          value={stats.resolvedRate !== null ? `${stats.resolvedRate}%` : "—"}
          subtext={stats.resolvedRate !== null ? "Son görüşmeler" : "Veri yok"}
        />
        <StatCard
          label={t("clinics.stats.avgResponse")}
          value="—"
          subtext="Takip edilmiyor"
        />
      </div>

      {/* Module status */}
      <SectionCard title={t("clinics.overview.moduleStatus")} subtitle={t("clinics.overview.moduleSubtitle")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {modules.map((m) => (
            <div
              key={m.label}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 18px", background: "rgba(255,255,255,0.02)",
                borderRadius: 12, border: `1px solid ${UI_COLORS.border}`,
              }}
            >
              <div>
                <p style={{ fontSize: 13.5, fontWeight: 600, color: UI_COLORS.textPrimary }}>{m.label}</p>
                <p style={{ fontSize: 12, color: UI_COLORS.textMuted, marginTop: 3 }}>{m.note}</p>
              </div>
              <span style={{
                fontSize: 11.5, fontWeight: 700, padding: "4px 12px", borderRadius: 99,
                background: m.enabled ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.05)",
                color: m.enabled ? "#34d399" : UI_COLORS.textMuted,
                textTransform: "uppercase", letterSpacing: "0.02em",
              }}>
                {m.enabled ? t("common.status.active") : t("common.status.inactive")}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Quick info */}
      <SectionCard title={t("clinics.overview.quickInfo")}>
        {noData ? (
          <p style={{ fontSize: 13.5, color: UI_COLORS.textMuted, padding: "8px 0" }}>
            Bu klinik için henüz görüşme kaydı bulunmuyor. Widget embed edildiğinde veriler burada görünecek.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {[
              ["Clinic ID", clinicId],
              [t("clinics.overview.lastActive"), stats.lastActive ?? "—"],
              [t("clinics.overview.language"), clinicMeta.language ?? "—"],
              [t("clinics.overview.timezone"), clinicMeta.timezone ?? "Europe/Istanbul"],
            ].map(([k, v]) => (
              <div key={k}>
                <p style={{ fontSize: 11.5, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{k}</p>
                <p style={{ fontSize: 13.5, color: "var(--text-primary)", fontWeight: 500 }}>{v}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <style>{`.animate-spin{animation:spin 1s linear infinite}@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

/* ── Helper: format ISO timestamp to relative string ── */
function formatRelativeTime(isoOrTimestamp: string): string {
  try {
    const date = new Date(isoOrTimestamp);
    if (isNaN(date.getTime())) return isoOrTimestamp;
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Az önce";
    if (mins < 60) return `${mins} dk önce`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} saat önce`;
    const days = Math.floor(hrs / 24);
    return `${days} gün önce`;
  } catch {
    return "—";
  }
}