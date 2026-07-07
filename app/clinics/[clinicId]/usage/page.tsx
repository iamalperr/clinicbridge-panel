"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { collection, onSnapshot, query, orderBy, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Clinic } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { Select } from "@/components/ui/Select";
import StatCard from "@/components/ui/StatCard";
import SectionCard from "@/components/ui/SectionCard";
import EmptyState from "@/components/ui/EmptyState";
import Badge from "@/components/ui/Badge";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { formatNumber } from "@/lib/utils";
import {
  type DateRange,
  type ConversationLogDoc,
  calculateClinicMetrics,
  getDateRangeStart,
  generateDayKeys,
  formatDayLabel,
  PACKAGE_LIMITS,
  getUsageWarnings,
  formatRelativeTime,
} from "@/lib/services/analyticsService";
import { MessageSquare, Users, Loader2, AlertCircle, CalendarCheck, PhoneCall, Bot, Zap, Clock } from "lucide-react";

// ─── Constants ──────────────────────────────────────────────────────────────
const DATE_OPTIONS: { label: string; value: DateRange }[] = [
  { label: "Bugün",        value: "today" },
  { label: "Son 7 Gün",   value: "7d" },
  { label: "Son 30 Gün",  value: "30d" },
  { label: "Bu Ay",       value: "month" },
  { label: "Tüm Zamanlar", value: "all" },
];

// ─── ProgressBar Helper Component ───────────────────────────────────────────
function UsageProgressBar({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | "unlimited";
}) {
  const isUnlimited = limit === "unlimited";
  const percentage = isUnlimited ? 0 : Math.min((used / (limit as number)) * 100, 100);
  const warning = getUsageWarnings(isUnlimited ? 0 : (used / (limit as number)) * 100);
  const color = isUnlimited ? UI_COLORS.brand : warning.color;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textPrimary }}>
          {label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: color }}>
          {formatNumber(used)} {isUnlimited ? "" : `/ ${formatNumber(limit as number)}`}
        </span>
      </div>
      <div style={{ height: 8, background: "rgba(255, 255, 255, 0.05)", borderRadius: 99, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: isUnlimited ? "100%" : `${percentage}%`,
            background: color,
            transition: "width 0.4s ease",
            borderRadius: 99,
          }}
        />
      </div>
      {warning.message && !isUnlimited && (
        <p style={{ fontSize: 12, color: warning.color, marginTop: 6, fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
          <AlertCircle size={14} />
          {warning.message}
        </p>
      )}
    </div>
  );
}

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
                  background: v > 0 ? `linear-gradient(180deg, ${color}, ${color}99)` : UI_COLORS.border,
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

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function UsagePage() {
  const params = useParams();
  const clinicId = params.clinicId as string;
  const { profile } = useAuth();

  const [dateRange, setDateRange] = useState<DateRange>("month");
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [logs, setLogs] = useState<ConversationLogDoc[]>([]);
  const [loadingClinic, setLoadingClinic] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // 1) Fetch Clinic
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "clinics", clinicId), (snap) => {
      if (snap.exists()) {
        setClinic({ id: snap.id, ...(snap.data() as Omit<Clinic, "id">) });
      } else {
        setClinic(null);
      }
      setLoadingClinic(false);
    }, () => setLoadingClinic(false));
    return () => unsub();
  }, [clinicId]);

  // 2) Fetch Logs
  useEffect(() => {
    const q = query(
      collection(db, "clinics", clinicId, "conversationLogs"),
      orderBy("updatedAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      } as ConversationLogDoc));
      setLogs(data);
      setLoadingLogs(false);
    }, () => setLoadingLogs(false));
    return () => unsub();
  }, [clinicId]);

  // 3) Compute Metrics
  // Filtered metrics (based on selected date range)
  const rangeStart = useMemo(() => getDateRangeStart(dateRange), [dateRange]);
  const dayKeys = useMemo(() => generateDayKeys(dateRange), [dateRange]);
  const metrics = useMemo(() => {
    if (!clinic) return null;
    return calculateClinicMetrics(clinicId, clinic.name, clinic, logs, rangeStart);
  }, [clinic, logs, rangeStart, clinicId]);

  // Monthly metrics (always fixed to 'month' for package limit calculations)
  const monthlyRangeStart = useMemo(() => getDateRangeStart("month"), []);
  const monthlyMetrics = useMemo(() => {
    if (!clinic) return null;
    return calculateClinicMetrics(clinicId, clinic.name, clinic, logs, monthlyRangeStart);
  }, [clinic, logs, monthlyRangeStart, clinicId]);

  // Access check
  if (profile?.role === "clinicUser" && profile.clinicId !== clinicId) {
    return (
      <EmptyState
        title="Erişim Hatası"
        description="Bu kliniğe erişim yetkiniz yok."
      />
    );
  }

  if (loadingClinic || loadingLogs) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "80px 0", color: UI_COLORS.textMuted }}>
        <Loader2 size={32} style={{ animation: "spin 1s linear infinite" }} />
        <p style={{ fontSize: 14 }}>Kullanım verileri yükleniyor…</p>
      </div>
    );
  }

  if (!clinic || !metrics || !monthlyMetrics) {
    return <EmptyState title="Klinik Bulunamadı" />;
  }

  // Determine Package Limit info
  const planVariant = (clinic.plan as string) === "starter" ? "trial" : (clinic.plan || "trial");
  const limits = PACKAGE_LIMITS[planVariant] ?? PACKAGE_LIMITS.trial;

  // Render Table Rows (using top 15 most recent logs within date range)
  const filteredLogs = logs
    .filter((l) => !rangeStart || new Date(l.createdAt) >= rangeStart)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const recentLogs = filteredLogs.slice(0, 15);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: 40 }}>
      {/* Header and Filter */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary }}>
            Kullanım Özeti
          </h2>
          <p style={{ fontSize: 14, color: UI_COLORS.textMuted, marginTop: 4 }}>
            Kliniğin kullanım metrikleri ve paket limitleri
          </p>
        </div>
        <div style={{ width: 160 }}>
          <Select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
            options={DATE_OPTIONS}
          />
        </div>
      </div>

      {metrics.totalConversations === 0 && !loadingLogs ? (
        <SectionCard title="">
          <EmptyState
            emoji="📊"
            title="Henüz kullanım verisi oluşmadı"
            description="Hastalar chatbot ile etkileşime geçtikçe kullanım metrikleri burada görünecek."
          />
        </SectionCard>
      ) : (
        <>
          {/* Top Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            <StatCard
              label="Toplam Mesaj"
              value={formatNumber(metrics.totalMessages)}
              icon={<MessageSquare size={18} />}
            />
            <StatCard
              label="Toplam Görüşme"
              value={formatNumber(metrics.totalConversations)}
              icon={<Users size={18} />}
            />
            <StatCard
              label="Kullanılan AI Yanıtı"
              value={formatNumber(Math.round(metrics.totalMessages * 0.95))} // Mock estimate for AI answers
              icon={<Bot size={18} />}
            />
            <StatCard
              label="Randevuya Dönüşen"
              value={formatNumber(metrics.appointments)}
              icon={<CalendarCheck size={18} />}
            />
            <StatCard
              label="Canlı Destek"
              value={formatNumber(metrics.liveSupport)}
              icon={<PhoneCall size={18} />}
            />
            <StatCard
              label="Yanıtlanamayan"
              value={formatNumber(metrics.unanswered)}
              icon={<AlertCircle size={18} />}
            />
            <StatCard
              label="Aktif Modüller"
              value={[clinic.modules?.ai && "AI", clinic.modules?.widget && "Widget", clinic.modules?.voice && "Voice"].filter(Boolean).length}
              subtext="kullanımda"
              icon={<Zap size={18} />}
            />
            <StatCard
              label="Son Aktivite"
              value={formatRelativeTime(metrics.lastActivity).replace(" önce", "")}
              subtext={metrics.lastActivity ? "önce" : "Yok"}
              icon={<Clock size={18} />}
            />
          </div>

          {/* Package Limits and Charts */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: 20 }}>
            {/* Package Limits */}
            <SectionCard title="Paket Kullanımı" subtitle="Aylık kullanım limitleri">
              {dateRange !== "month" && (
                <p style={{ fontSize: 12, color: UI_COLORS.textMuted, marginBottom: 20, fontStyle: "italic" }}>
                  Not: Paket limitleri mevcut ay ({DATE_OPTIONS.find(d => d.value === "month")?.label}) kullanımına göre hesaplanır.
                </p>
              )}

              <UsageProgressBar
                label="Aylık Görüşme Kullanımı"
                used={monthlyMetrics.totalConversations}
                limit={limits.maxConversations}
              />
              <UsageProgressBar
                label="Aylık Mesaj Kullanımı"
                used={monthlyMetrics.totalMessages}
                limit={limits.maxMessages}
              />

              <div style={{ marginTop: 24, padding: "16px", background: "rgba(255, 255, 255, 0.02)", borderRadius: 12, border: `1px solid ${UI_COLORS.border}` }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textSecondary, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Mevcut Paket Özellikleri
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Badge variant={planVariant as any} label={planVariant.toUpperCase()} />
                  {limits.aiActive && <Badge variant="module-ai" />}
                  {limits.widgetActive && <Badge variant="module-widget" />}
                  {limits.voiceActive && <Badge variant="module-voice" />}
                  {!limits.voiceActive && <Badge variant="inactive" label="Voice Pasif" />}
                </div>
              </div>
            </SectionCard>

            {/* Trends */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <SectionCard title="Görüşme Trendi" noPadding>
                <div style={{ padding: "16px 20px" }}>
                  <MiniBarChart data={metrics.dailyConversations} dayKeys={dayKeys} color="#6366f1" label="görüşme" />
                </div>
              </SectionCard>
              <SectionCard title="Mesaj Trendi" noPadding>
                <div style={{ padding: "16px 20px" }}>
                  <MiniBarChart data={metrics.dailyMessages} dayKeys={dayKeys} color="#8b5cf6" label="mesaj" />
                </div>
              </SectionCard>
            </div>
          </div>

          {/* Details Table */}
          <SectionCard title="Kullanım Detayları (Son İşlemler)" subtitle="Seçili tarihteki en güncel görüşmeler" noPadding>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "var(--bg-app)", borderBottom: `1px solid ${UI_COLORS.border}` }}>
                    {["Tarih", "Durum", "Mesaj Sayısı", "AI Yanıtı", "Randevu", "Canlı Destek", "En Yoğun Dil"].map((h) => (
                      <th key={h} style={{ padding: "14px 18px", fontSize: 12, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentLogs.map((log) => {
                    const isAppointment = log.status === "appointment" || log.status === "appointment_converted";
                    const isLiveSupport = log.status === "liveSupport";
                    return (
                      <tr
                        key={log.id}
                        style={{ borderBottom: `1px solid ${UI_COLORS.border}`, background: UI_COLORS.bgCard, transition: "background 0.15s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-app)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = UI_COLORS.bgCard; }}
                      >
                        <td style={{ padding: "14px 18px", fontSize: 13, color: UI_COLORS.textPrimary }}>
                          {new Date(log.createdAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        <td style={{ padding: "14px 18px" }}>
                          <Badge
                            variant={
                              isAppointment ? "resolved"
                              : isLiveSupport ? "open"
                              : log.status === "unanswered" ? "failed"
                              : "inactive"
                            }
                            label={log.status}
                          />
                        </td>
                        <td style={{ padding: "14px 18px", fontSize: 14, fontWeight: 700, color: UI_COLORS.textPrimary }}>
                          {formatNumber(log.totalMessages || 0)}
                        </td>
                        <td style={{ padding: "14px 18px", fontSize: 13, color: UI_COLORS.textMuted }}>
                          {formatNumber(Math.round((log.totalMessages || 0) * 0.95))}
                        </td>
                        <td style={{ padding: "14px 18px", fontSize: 13, fontWeight: 600, color: isAppointment ? "#818cf8" : UI_COLORS.textMuted }}>
                          {isAppointment ? "Evet" : "—"}
                        </td>
                        <td style={{ padding: "14px 18px", fontSize: 13, fontWeight: 600, color: isLiveSupport ? "#38bdf8" : UI_COLORS.textMuted }}>
                          {isLiveSupport ? "Evet" : "—"}
                        </td>
                        <td style={{ padding: "14px 18px", fontSize: 13, color: UI_COLORS.textSecondary }}>
                          {log.language || "TR"}
                        </td>
                      </tr>
                    );
                  })}
                  {recentLogs.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: "24px", textAlign: "center", fontSize: 13, color: UI_COLORS.textMuted }}>
                        Bu tarih aralığında detay verisi bulunamadı.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}
