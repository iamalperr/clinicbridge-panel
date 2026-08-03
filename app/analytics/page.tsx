"use client";

import Link from "next/link";
import { useState, useEffect, useMemo, useCallback } from "react";
import { collection, onSnapshot, query, orderBy, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import type { Clinic } from "@/lib/types";
import StatCard from "@/components/ui/StatCard";
import SectionCard from "@/components/ui/SectionCard";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import BackToDashboard from "@/components/ui/BackToDashboard";
import { Select } from "@/components/ui/Select";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";
import { formatNumber } from "@/lib/utils";
import { useI18n } from "@/lib/i18n-context";
import {
  BarChart3, Activity, MessageSquare, Users,
  CalendarCheck, PhoneCall, AlertCircle, TrendingUp, Loader2, RefreshCw,
} from "lucide-react";
import {
  type DateRange,
  type ConversationLogDoc,
  type ClinicAnalytics,
  type GlobalAnalytics,
  calculateClinicMetrics,
  calculateGlobalMetrics,
  generateDayKeys,
  formatDayLabel,
  getDateRangeStart,
  formatRelativeTime,
  STATUS_LABELS,
  STATUS_COLORS,
} from "@/lib/services/analyticsService";

// ─── Date range options ───────────────────────────────────────────────────────
const DATE_OPTIONS: { label: string; value: DateRange }[] = [
  { label: "Bugün",        value: "today" },
  { label: "Son 7 Gün",   value: "7d" },
  { label: "Son 30 Gün",  value: "30d" },
  { label: "Bu Ay",       value: "month" },
  { label: "Tüm Zamanlar", value: "all" },
];

// ─── Simple inline bar chart ──────────────────────────────────────────────────
function MiniBarChart({
  data,
  dayKeys,
  color = "var(--brand)",
  label = "değer",
}: {
  data: Record<string, number>;
  dayKeys: string[];
  color?: string;
  label?: string;
}) {
  const values = dayKeys.map((k) => data[k] ?? 0);
  const maxVal = Math.max(...values, 1);

  return (
    <div style={{ width: "100%", height: 180, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 4 }}>
        {values.map((v, i) => {
          const h = Math.max((v / maxVal) * 100, v > 0 ? 4 : 0);
          return (
            <div
              key={dayKeys[i]}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}
              title={`${formatDayLabel(dayKeys[i])}: ${v} ${label}`}
            >
              <div
                style={{
                  width: "75%",
                  height: `${h}%`,
                  background: v > 0
                    ? `linear-gradient(180deg, ${color}, ${color}99)`
                    : UI_COLORS.border,
                  borderRadius: "6px 6px 2px 2px",
                  transition: "height 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                  minHeight: v > 0 ? 3 : 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.25)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
              />
            </div>
          );
        })}
      </div>
      {/* X-axis labels — show every N-th */}
      <div style={{ display: "flex", gap: 4 }}>
        {dayKeys.map((k, i) => {
          const step = dayKeys.length > 14 ? 6 : dayKeys.length > 7 ? 3 : 1;
          return (
            <div key={k} style={{ flex: 1, textAlign: "center" }}>
              {i % step === 0 && (
                <span style={{ fontSize: 9.5, color: UI_COLORS.textMuted, fontWeight: 600 }}>
                  {formatDayLabel(k).split(" ")[0]}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Status distribution bar ──────────────────────────────────────────────────
function StatusDistributionBar({ distribution, total }: { distribution: Record<string, number>; total: number }) {
  if (total === 0) {
    return (
      <p style={{ fontSize: 13, color: UI_COLORS.textMuted, padding: "16px 0" }}>Henüz görüşme verisi yok.</p>
    );
  }

  const order = ["answered", "appointment", "liveSupport", "unanswered", "needsTraining"];
  const entries = [
    ...order.filter((k) => distribution[k] > 0).map((k) => [k, distribution[k]] as [string, number]),
    ...Object.entries(distribution).filter(([k]) => !order.includes(k) && distribution[k] > 0),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Stacked bar */}
      <div style={{ height: 10, borderRadius: 99, overflow: "hidden", display: "flex", gap: 2 }}>
        {entries.map(([status, count]) => (
          <div
            key={status}
            style={{
              height: "100%",
              width: `${(count / total) * 100}%`,
              background: STATUS_COLORS[status] ?? STATUS_COLORS.other,
              borderRadius: 99,
              transition: "width 0.4s ease",
            }}
            title={`${STATUS_LABELS[status] ?? status}: ${count}`}
          />
        ))}
      </div>
      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", marginTop: 4 }}>
        {entries.map(([status, count]) => (
          <div key={status} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: STATUS_COLORS[status] ?? STATUS_COLORS.other,
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 12, color: UI_COLORS.textSecondary, fontWeight: 500 }}>
              {STATUS_LABELS[status] ?? status}
            </span>
            <span style={{ fontSize: 12, color: UI_COLORS.textMuted }}>
              ({count} · %{Math.round((count / total) * 100)})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { t } = useI18n();
  const { profile } = useAuth();

  const roleStr = profile?.role as string;
  const isClinicUser = roleStr === "clinicUser" || roleStr === "Klinik Kullanıcısı";

  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [selectedClinicId, setSelectedClinicId] = useState<string>(
    isClinicUser && profile?.clinicId ? profile.clinicId : "all"
  );

  // Raw data
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [clinicsLoading, setClinicsLoading] = useState(true);
  // logs per clinic: clinicId → ConversationLogDoc[]
  const [logsMap, setLogsMap] = useState<Record<string, ConversationLogDoc[]>>({});
  const [logsLoading, setLogsLoading] = useState(true);

  // ── Subscribe to clinics list ──
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "clinics"),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Clinic, "id">) }));
        // Clinic user: only their clinic
        setClinics(isClinicUser && profile?.clinicId
          ? list.filter((c) => c.id === profile.clinicId)
          : list
        );
        setClinicsLoading(false);
      },
      () => setClinicsLoading(false)
    );
    return () => unsub();
   
  }, [isClinicUser, profile?.clinicId]);

  // ── Read conversationLogs for each clinic (one-shot) ──
  // Realtime dinleyiciler klinik başına tüm koleksiyonu açık tutuyor ve her
  // yazmada yeniden okuma faturalandırıyordu; burada tek seferlik okunur.
  const loadLogs = useCallback(async (clinicIds: string[]) => {
    if (clinicIds.length === 0) {
      setLogsMap({});
      setLogsLoading(false);
      return;
    }

    setLogsLoading(true);
    try {
      const results = await Promise.all(
        clinicIds.map(async (clinicId) => {
          try {
            const snap = await getDocs(
              query(
                collection(db, "clinics", clinicId, "conversationLogs"),
                orderBy("updatedAt", "desc")
              )
            );
            return [
              clinicId,
              snap.docs.map((d) => ({ id: d.id, ...d.data() } as ConversationLogDoc)),
            ] as const;
          } catch (err) {
            console.error(`[AnalyticsPage] Logs failed for ${clinicId}:`, err);
            return [clinicId, [] as ConversationLogDoc[]] as const;
          }
        })
      );
      setLogsMap(Object.fromEntries(results));
    } finally {
      setLogsLoading(false);
    }
  }, []);

  // Sadece klinik kimlik listesi değiştiğinde yeniden oku.
  const clinicIdsKey = useMemo(
    () => clinics.map((c) => c.id).sort().join(","),
    [clinics]
  );

  useEffect(() => {
    loadLogs(clinicIdsKey ? clinicIdsKey.split(",") : []);
  }, [clinicIdsKey, loadLogs]);

  // ── Compute analytics ──
  const rangeStart = useMemo(() => getDateRangeStart(dateRange), [dateRange]);
  const dayKeys = useMemo(() => generateDayKeys(dateRange), [dateRange]);

  const clinicAnalyticsList = useMemo((): ClinicAnalytics[] => {
    return clinics.map((c) =>
      calculateClinicMetrics(
        c.id, c.name, c,
        logsMap[c.id] ?? [],
        rangeStart
      )
    );
  }, [clinics, logsMap, rangeStart]);

  const globalMetrics = useMemo((): GlobalAnalytics => {
    return calculateGlobalMetrics(clinics, clinicAnalyticsList);
  }, [clinics, clinicAnalyticsList]);

  // Which analytics to show (global or single clinic)
  const activeAnalytics: ClinicAnalytics | GlobalAnalytics = useMemo(() => {
    if (selectedClinicId === "all") return globalMetrics;
    return clinicAnalyticsList.find((c) => c.clinicId === selectedClinicId) ?? globalMetrics;
  }, [selectedClinicId, globalMetrics, clinicAnalyticsList]);

  const isLoading = clinicsLoading || logsLoading;

  // Access guard
  if (isClinicUser && !profile?.clinicId) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
        <EmptyState title="Erişim Hatası" description="Bu hesap henüz herhangi bir kliniğe atanmamış. Lütfen yönetici ile iletişime geçin." />
      </div>
    );
  }

  const isGlobal = selectedClinicId === "all";
  const selectedClinicName = isGlobal
    ? "Tüm Klinikler"
    : clinics.find((c) => c.id === selectedClinicId)?.name ?? "";

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px" }}>

      {/* Header */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>
        <BackToDashboard href="/clinics" label="Kliniklere Dön" />
        
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 20 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.6px" }}>
              Analizler
            </h1>
            <p style={{ color: UI_COLORS.textSecondary, marginTop: 6, fontSize: 15, fontWeight: 500 }}>
              {isGlobal ? "Tüm kliniklerin performans özeti" : `${selectedClinicName} — performans verileri`}
            </p>
          </div>

          {/* Filters */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {/* Clinic filter — admin only */}
            {!isClinicUser && (
              <div style={{ width: 220 }}>
                <Select
                  value={selectedClinicId}
                  onChange={(e) => setSelectedClinicId(e.target.value)}
                  options={[
                    { label: "Tüm Klinikler", value: "all" },
                    ...clinics.map((c) => ({ label: c.name, value: c.id })),
                  ]}
                />
              </div>
            )}
            {/* Date filter */}
            <div style={{ width: 160 }}>
              <Select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as DateRange)}
                options={DATE_OPTIONS}
              />
            </div>
            <button
              type="button"
              onClick={() => loadLogs(clinics.map((c) => c.id))}
              disabled={logsLoading || clinics.length === 0}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "9px 14px",
                borderRadius: 10,
                border: `1px solid ${UI_COLORS.border}`,
                background: UI_COLORS.bgCard,
                color: UI_COLORS.textSecondary,
                fontSize: 13,
                fontWeight: 500,
                cursor: logsLoading ? "wait" : "pointer",
              }}
            >
              <RefreshCw
                size={14}
                style={logsLoading ? { animation: "spin 1s linear infinite" } : undefined}
              />
              {t("common.refresh") || "Yenile"}
            </button>
            <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
          </div>
        </div>
      </div>

      {/* Loading */}
      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "80px 0", color: UI_COLORS.textMuted }}>
          <Loader2 size={32} style={{ animation: "spin 1s linear infinite" }} />
          <p style={{ fontSize: 14 }}>Veriler yükleniyor…</p>
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : (
        <>
          {/* ── Global summary stats (admin only) ── */}
          {!isClinicUser && isGlobal && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 28 }}>
              <StatCard
                label="Toplam Klinik"
                value={globalMetrics.totalClinics}
                subtext={`${globalMetrics.activeClinics} aktif`}
                icon={<Activity size={18} />}
              />
              <StatCard
                label="Toplam Görüşme"
                value={formatNumber(activeAnalytics.totalConversations)}
                subtext={DATE_OPTIONS.find(d => d.value === dateRange)?.label ?? ""}
                icon={<Users size={18} />}
              />
              <StatCard
                label="Toplam Mesaj"
                value={formatNumber(activeAnalytics.totalMessages)}
                subtext={DATE_OPTIONS.find(d => d.value === dateRange)?.label ?? ""}
                icon={<MessageSquare size={18} />}
              />
              <StatCard
                label="Ort. Çözüm Oranı"
                value={activeAnalytics.resolvedRate !== null ? `%${activeAnalytics.resolvedRate}` : "—"}
                subtext={activeAnalytics.resolvedRate !== null ? `${activeAnalytics.resolvedCount} çözüldü` : "Veri yok"}
                icon={<TrendingUp size={18} />}
              />
              <StatCard
                label="Randevuya Dönüşen"
                value={formatNumber(activeAnalytics.appointments)}
                subtext={activeAnalytics.totalConversations > 0 ? `%${Math.round((activeAnalytics.appointments / activeAnalytics.totalConversations) * 100)} oran` : "—"}
                icon={<CalendarCheck size={18} />}
              />
              <StatCard
                label="Canlı Destek"
                value={formatNumber(activeAnalytics.liveSupport)}
                subtext="Talepler"
                icon={<PhoneCall size={18} />}
              />
              <StatCard
                label="Yanıtlanamayan"
                value={formatNumber(activeAnalytics.unanswered)}
                subtext="Eğitim gerektirebilir"
                icon={<AlertCircle size={18} />}
              />
            </div>
          )}

          {/* ── Single clinic summary stats ── */}
          {!isGlobal && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 28 }}>
              <StatCard
                label="Toplam Görüşme"
                value={formatNumber(activeAnalytics.totalConversations)}
                subtext={DATE_OPTIONS.find(d => d.value === dateRange)?.label ?? ""}
                icon={<Users size={18} />}
              />
              <StatCard
                label="Toplam Mesaj"
                value={formatNumber(activeAnalytics.totalMessages)}
                subtext={DATE_OPTIONS.find(d => d.value === dateRange)?.label ?? ""}
                icon={<MessageSquare size={18} />}
              />
              <StatCard
                label="Çözüm Oranı"
                value={activeAnalytics.resolvedRate !== null ? `%${activeAnalytics.resolvedRate}` : "—"}
                subtext={activeAnalytics.resolvedRate !== null ? `${activeAnalytics.resolvedCount} çözüldü` : "Veri yok"}
                icon={<TrendingUp size={18} />}
              />
              <StatCard
                label="Randevuya Dönüşen"
                value={formatNumber(activeAnalytics.appointments)}
                subtext={activeAnalytics.totalConversations > 0 ? `%${Math.round((activeAnalytics.appointments / activeAnalytics.totalConversations) * 100)} oran` : "—"}
                icon={<CalendarCheck size={18} />}
              />
              <StatCard
                label="Canlı Destek"
                value={formatNumber(activeAnalytics.liveSupport)}
                subtext="Talepler"
                icon={<PhoneCall size={18} />}
              />
              <StatCard
                label="Yanıtlanamayan"
                value={formatNumber(activeAnalytics.unanswered)}
                subtext="Eğitim gerektirebilir"
                icon={<AlertCircle size={18} />}
              />
            </div>
          )}

          {/* ── Charts row ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 20, marginBottom: 24 }}>

            {/* Görüşme Trend */}
            <SectionCard title="Görüşme Trendi" icon={<Users size={16} />}>
              {activeAnalytics.totalConversations === 0 ? (
                <p style={{ fontSize: 13, color: UI_COLORS.textMuted, padding: "16px 0" }}>
                  Seçilen dönemde görüşme verisi bulunamadı.
                </p>
              ) : (
                <MiniBarChart
                  data={activeAnalytics.dailyConversations}
                  dayKeys={dayKeys}
                  color="#6366f1"
                  label="görüşme"
                />
              )}
            </SectionCard>

            {/* Mesaj Trend */}
            <SectionCard title="Mesaj Trendi" icon={<MessageSquare size={16} />}>
              {activeAnalytics.totalMessages === 0 ? (
                <p style={{ fontSize: 13, color: UI_COLORS.textMuted, padding: "16px 0" }}>
                  Seçilen dönemde mesaj verisi bulunamadı.
                </p>
              ) : (
                <MiniBarChart
                  data={activeAnalytics.dailyMessages}
                  dayKeys={dayKeys}
                  color="#8b5cf6"
                  label="mesaj"
                />
              )}
            </SectionCard>

          </div>

          {/* ── Status Distribution ── */}
          <SectionCard title="Görüşme Durum Dağılımı" subtitle="Tüm görüşmelerin sonuç durumu" icon={<BarChart3 size={16} />}>
            <StatusDistributionBar
              distribution={activeAnalytics.statusDistribution}
              total={activeAnalytics.totalConversations}
            />
          </SectionCard>

          {/* ── Clinic Performance Table (admin only, global view) ── */}
          {!isClinicUser && isGlobal && clinicAnalyticsList.length > 0 && (
            <SectionCard title="Klinik Performansı" subtitle="Klinik bazlı detaylı performans metrikleri" icon={<BarChart3 size={16} />} noPadding>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-app)", borderBottom: `1px solid ${UI_COLORS.border}` }}>
                      {["Klinik", "Paket", "Modüller", "Görüşme", "Mesaj", "Çözüm Oranı", "Randevu", "Canlı Destek", "Son Aktivite"].map((h) => (
                        <th key={h} style={{ padding: "14px 18px", fontSize: 12, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clinicAnalyticsList.map((ca) => {
                      const clinic = clinics.find((c) => c.id === ca.clinicId);
                      const planVariant = (ca.plan === "starter" ? "trial" : (ca.plan ?? "trial")) as "trial" | "pro" | "enterprise";
                      return (
                        <tr
                          key={ca.clinicId}
                          style={{ borderBottom: `1px solid ${UI_COLORS.border}`, background: UI_COLORS.bgCard, transition: "background 0.15s" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-app)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = UI_COLORS.bgCard; }}
                        >
                          {/* Klinik Adı */}
                          <td style={{ padding: "14px 18px" }}>
                            <Link
                              href={`/clinics/${ca.clinicId}`}
                              style={{ fontSize: 13.5, fontWeight: 700, color: UI_COLORS.brand, textDecoration: "none" }}
                            >
                              {ca.clinicName}
                            </Link>
                            {clinic?.domain && (
                              <p style={{ fontSize: 11.5, color: UI_COLORS.textMuted, marginTop: 2 }}>{clinic.domain}</p>
                            )}
                          </td>

                          {/* Paket */}
                          <td style={{ padding: "14px 18px" }}>
                            <Badge variant={planVariant} label={
                              ca.plan === "starter" ? "Trial" :
                              ca.plan ? ca.plan.charAt(0).toUpperCase() + ca.plan.slice(1) : "Trial"
                            } />
                          </td>

                          {/* Modüller */}
                          <td style={{ padding: "14px 18px" }}>
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                              {ca.modules?.ai && <Badge variant="module-ai" />}
                              {ca.modules?.widget && <Badge variant="module-widget" />}
                              {ca.modules?.voice && <Badge variant="module-voice" />}
                              {!ca.modules?.ai && !ca.modules?.widget && !ca.modules?.voice && (
                                <span style={{ fontSize: 12, color: UI_COLORS.textMuted }}>—</span>
                              )}
                            </div>
                          </td>

                          {/* Görüşme */}
                          <td style={{ padding: "14px 18px" }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: UI_COLORS.textPrimary }}>
                              {formatNumber(ca.totalConversations)}
                            </span>
                          </td>

                          {/* Mesaj */}
                          <td style={{ padding: "14px 18px" }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: UI_COLORS.textPrimary }}>
                              {formatNumber(ca.totalMessages)}
                            </span>
                          </td>

                          {/* Çözüm Oranı */}
                          <td style={{ padding: "14px 18px" }}>
                            <span style={{
                              fontSize: 13, fontWeight: 700,
                              color: ca.resolvedRate !== null
                                ? (ca.resolvedRate >= 70 ? "#34d399" : ca.resolvedRate >= 40 ? "#fb923c" : "#f87171")
                                : UI_COLORS.textMuted,
                            }}>
                              {ca.resolvedRate !== null ? `%${ca.resolvedRate}` : "—"}
                            </span>
                          </td>

                          {/* Randevu */}
                          <td style={{ padding: "14px 18px" }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#818cf8" }}>
                              {formatNumber(ca.appointments)}
                            </span>
                          </td>

                          {/* Canlı Destek */}
                          <td style={{ padding: "14px 18px" }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#38bdf8" }}>
                              {formatNumber(ca.liveSupport)}
                            </span>
                          </td>

                          {/* Son Aktivite */}
                          <td style={{ padding: "14px 18px" }}>
                            <span style={{ fontSize: 12.5, color: UI_COLORS.textMuted }}>
                              {formatRelativeTime(ca.lastActivity)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* Empty state */}
          {activeAnalytics.totalConversations === 0 && !isLoading && (
            <SectionCard title="">
              <EmptyState
                emoji="📊"
                title="Henüz yeterli veri yok"
                description="Görüşmeler başladıkça performans metrikleri ve grafikler burada görünecek."
              />
            </SectionCard>
          )}

        </>
      )}
    </div>
  );
}
