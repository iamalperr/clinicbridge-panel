"use client";

import React, { useState, useMemo } from "react";
import { MessageSquare, Search, Filter, AlertCircle, Calendar, PhoneCall, CalendarCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";
import StatCard from "@/components/ui/StatCard";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";

import { ConversationLog, LogStatus } from "./types";
import ConversationLogDetailModal from "./ConversationLogDetailModal";

interface Props {
  clinicId: string;
}

export default function ConversationLogsTab({ clinicId }: Props) {
  const { t, language } = useI18n();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [langFilter, setLangFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");

  const [selectedLog, setSelectedLog] = useState<ConversationLog | null>(null);
  const [logs, setLogs] = useState<ConversationLog[]>([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    if (!clinicId) return;
    
    import("firebase/firestore").then(({ collection, query, orderBy, onSnapshot }) => {
      import("@/lib/firebase").then(({ db }) => {
        const q = query(
          collection(db, "clinics", clinicId, "conversationLogs"),
          orderBy("updatedAt", "desc")
        );

        const unsub = onSnapshot(q, (snap) => {
          const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as ConversationLog));
          setLogs(fetched);
          setLoading(false);
        });

        return () => unsub();
      });
    });
  }, [clinicId]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (statusFilter !== "all" && log.status !== statusFilter) return false;
      if (langFilter !== "all" && log.language !== langFilter) return false;
      
      if (dateFilter !== "all") {
        const logDate = new Date(log.createdAt);
        const now = new Date();
        const diffDays = (now.getTime() - logDate.getTime()) / (1000 * 3600 * 24);
        
        if (dateFilter === "today" && diffDays > 1) return false;
        if (dateFilter === "week" && diffDays > 7) return false;
        if (dateFilter === "month" && diffDays > 30) return false;
      }
      
      if (search) {
        const query = search.toLowerCase();
        const patientName = log.patientName?.toLowerCase() || "";
        const preview = log.lastMessagePreview.toLowerCase();
        // Since we are not fetching all messages upfront, we only search patientName and preview
        if (!patientName.includes(query) && !preview.includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [logs, search, statusFilter, langFilter, dateFilter]);

  const metrics = useMemo(() => {
    return {
      total: logs.length,
      unanswered: logs.filter(l => l.status === "unanswered").length,
      needsLiveSupport: logs.filter(l => l.status === "liveSupport").length,
      appointments: logs.filter(l => l.status === "appointment").length,
    };
  }, [logs]);

  const getStatusLabel = (status: LogStatus) => {
    switch (status) {
      case "answered": return t("logs.status.answered") || "Başarılı Yanıtlandı";
      case "liveSupport": return t("logs.status.liveSupport") || "Canlı Destek Gerekli";
      case "unanswered": return t("logs.status.unanswered") || "Yanıtlanamadı";
      case "appointment": return t("logs.status.appointment") || "Randevuya Dönüştü";
      case "collecting": return t("logs.status.collecting") || "Randevu Bilgisi Toplanıyor";
      default: return status;
    }
  };

  const getStatusVariant = (status: LogStatus): any => {
    switch (status) {
      case "answered": return "resolved";
      case "appointment": return "pro";
      case "liveSupport": return "open";
      case "unanswered": return "failed";
      case "collecting": return "warning";
      default: return "inactive";
    }
  };

  const statusOptions = [
    { value: "all", label: t("common.all") || "Tümü" },
    { value: "answered", label: getStatusLabel("answered") },
    { value: "appointment", label: getStatusLabel("appointment") },
    { value: "collecting", label: getStatusLabel("collecting") },
    { value: "liveSupport", label: getStatusLabel("liveSupport") },
    { value: "unanswered", label: getStatusLabel("unanswered") },
  ];

  const langOptions = [
    { value: "all", label: t("common.all") || "Tümü" },
    { value: "tr", label: "TR" },
    { value: "en", label: "EN" },
  ];

  const dateOptions = [
    { value: "all", label: t("common.all") || "Tüm Zamanlar" },
    { value: "today", label: t("logs.date.today") || "Bugün" },
    { value: "week", label: t("logs.date.week") || "Son 7 Gün" },
    { value: "month", label: t("logs.date.month") || "Son 30 Gün" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      
      {/* Metrics Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20 }}>
        <StatCard 
          label={t("logs.metrics.total") || "Toplam Görüşme"} 
          value={metrics.total} 
          icon={<MessageSquare size={20} />} 
        />
        <StatCard 
          label={t("logs.metrics.unanswered") || "Yanıtlanamayan"} 
          value={metrics.unanswered} 
          icon={<AlertCircle size={20} />} 
          trend={metrics.unanswered > 0 ? { value: metrics.unanswered, isUp: false } : undefined}
        />
        <StatCard 
          label={t("logs.metrics.liveSupport") || "Canlı Destek Talepleri"} 
          value={metrics.needsLiveSupport} 
          icon={<PhoneCall size={20} />} 
        />
        <StatCard 
          label={t("logs.metrics.appointments") || "Randevuya Dönüşen"} 
          value={metrics.appointments} 
          icon={<CalendarCheck size={20} />} 
          trend={metrics.appointments > 0 ? { value: metrics.appointments, isUp: true } : undefined}
        />
      </div>

      {/* Filters and List */}
      <div style={{ 
        background: UI_COLORS.bgCard, 
        borderRadius: UI_COMMON_STYLES.radius, 
        border: `1px solid ${UI_COLORS.border}`,
        overflow: "hidden"
      }}>
        {/* Filters Header */}
        <div style={{ 
          padding: 20, 
          borderBottom: `1px solid ${UI_COLORS.border}`,
          display: "flex",
          gap: 16,
          alignItems: "flex-end",
          flexWrap: "wrap"
        }}>
          <div style={{ flex: "1 1 250px" }}>
            <Input 
              placeholder={t("logs.searchPlaceholder") || "İsim, mesaj veya içerik ara..."}
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            />
          </div>
          <div style={{ width: 160 }}>
            <Select 
              label={t("logs.filterDate") || "Tarih"}
              value={dateFilter}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDateFilter(e.target.value)}
              options={dateOptions}
            />
          </div>
          <div style={{ width: 180 }}>
            <Select 
              label={t("logs.filterStatus") || "Durum"}
              value={statusFilter}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value)}
              options={statusOptions}
            />
          </div>
          <div style={{ width: 120 }}>
            <Select 
              label={t("logs.filterLang") || "Dil"}
              value={langFilter}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setLangFilter(e.target.value)}
              options={langOptions}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: UI_COLORS.textMuted }}>Yükleniyor...</div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ padding: 40 }}>
            <EmptyState 
              emoji="📭"
              title={t("logs.emptyTitle") || "Henüz görüşme kaydı bulunmuyor"}
              description={t("logs.emptyDesc") || "Web widget üzerinden hasta görüşmeleri başladığında kayıtlar burada listelenecek."}
            />
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "var(--bg-app)", borderBottom: `1px solid ${UI_COLORS.border}` }}>
                  <th style={{ padding: "16px 20px", fontSize: 13, fontWeight: 600, color: UI_COLORS.textSecondary }}>{t("logs.table.patient") || "Hasta"}</th>
                  <th style={{ padding: "16px 20px", fontSize: 13, fontWeight: 600, color: UI_COLORS.textSecondary }}>{t("logs.table.preview") || "Son Mesaj"}</th>
                  <th style={{ padding: "16px 20px", fontSize: 13, fontWeight: 600, color: UI_COLORS.textSecondary }}>{t("logs.table.date") || "Tarih"}</th>
                  <th style={{ padding: "16px 20px", fontSize: 13, fontWeight: 600, color: UI_COLORS.textSecondary }}>{t("logs.table.status") || "Durum"}</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr 
                    key={log.id} 
                    onClick={() => setSelectedLog(log)}
                    style={{ 
                      borderBottom: `1px solid ${UI_COLORS.border}`,
                      cursor: "pointer",
                      transition: UI_COMMON_STYLES.transition,
                      background: UI_COLORS.bgCard
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-app)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = UI_COLORS.bgCard}
                  >
                    <td style={{ padding: "16px 20px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ 
                          width: 36, height: 36, borderRadius: "50%", 
                          background: UI_COLORS.border, display: "flex", 
                          alignItems: "center", justifyContent: "center",
                          fontSize: 14, fontWeight: 600, color: UI_COLORS.textPrimary
                        }}>
                          {log.patientName ? log.patientName[0].toUpperCase() : "?"}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: UI_COLORS.textPrimary }}>
                            {log.patientName || (t("logs.anonymous") || "Anonim Ziyaretçi")}
                          </div>
                          <div style={{ fontSize: 12, color: UI_COLORS.textMuted, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ textTransform: "uppercase", fontSize: 10, fontWeight: 700, padding: "2px 4px", background: "var(--bg-app)", borderRadius: 4 }}>
                              {log.language}
                            </span>
                            {log.totalMessages} {t("logs.messages") || "mesaj"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "16px 20px", maxWidth: 300 }}>
                      <div style={{ fontSize: 13.5, color: UI_COLORS.textSecondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {log.lastMessagePreview}
                      </div>
                      {log.needsTraining && (
                        <div style={{ fontSize: 11, color: UI_COLORS.danger, display: "flex", alignItems: "center", gap: 4, marginTop: 4, fontWeight: 500 }}>
                          <AlertCircle size={12} /> {t("logs.trainingNeeded") || "Eğitim Gerekli"}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "16px 20px" }}>
                      <div style={{ fontSize: 13.5, color: UI_COLORS.textSecondary }}>
                        {new Date(log.createdAt).toLocaleDateString(language === "en" ? "en-US" : "tr-TR", { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td style={{ padding: "16px 20px" }}>
                      <Badge variant={getStatusVariant(log.status)} label={getStatusLabel(log.status)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConversationLogDetailModal 
        isOpen={!!selectedLog} 
        onClose={() => setSelectedLog(null)} 
        log={selectedLog} 
      />

    </div>
  );
}
