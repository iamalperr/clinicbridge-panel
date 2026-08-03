"use client";

import React, { useState, useMemo, useCallback } from "react";
import { MessageSquare, Search, AlertCircle, PhoneCall, CalendarCheck, Download } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";
import { useAuth } from "@/lib/auth-context";
import StatCard from "@/components/ui/StatCard";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";

import { ConversationLog, CustomLabel, LogStatus } from "./types";
import ConversationLogDetailModal from "./ConversationLogDetailModal";
import ConversationStatusDropdown from "./ConversationStatusDropdown";
import {
  normalizeConversationStatus,
  isConversationConverted,
  isConversationManuallyConverted,
  exportConversationLogsToCSV,
} from "@/lib/services/conversations/conversationStatusResolver";

interface Props {
  clinicId: string;
}

export default function ConversationLogsTab({ clinicId }: Props) {
  const { t, language } = useI18n();
  const { profile, getToken } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [langFilter, setLangFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");

  const [selectedLog, setSelectedLog] = useState<ConversationLog | null>(null);
  const [logs, setLogs] = useState<ConversationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [customLabels, setCustomLabels] = useState<CustomLabel[]>([]);

  // Determine if current user can edit labels
  const canEditLabel = useMemo(() => {
    if (!profile) return false;
    return ["superAdmin", "admin", "clinicAdmin"].includes(profile.role);
  }, [profile]);

  // Fetch custom labels once on mount
  React.useEffect(() => {
    if (!clinicId) return;
    
    const fetchLabels = async () => {
      try {
        const token = await getToken();
        if (!token) return;
        
        const res = await fetch(`/api/clinics/${clinicId}/custom-labels`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (res.ok) {
          const data = await res.json();
          setCustomLabels(data.labels || []);
        }
      } catch (err) {
        console.error("[ConversationLogsTab] Failed to fetch custom labels:", err);
      }
    };
    
    fetchLabels();
  }, [clinicId, getToken]);

  // Fetch conversation logs via Firestore realtime listener
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

  // Optimistic label update handler — updates local state immediately
  const handleLabelUpdated = useCallback(
    (logId: string, labelId: string | null, labelName: string | null) => {
      const isConverted = labelId === "converted_to_appointment" || labelId === "appointment_converted";
      const updater = (prev: ConversationLog): ConversationLog => ({
        ...prev,
        customLabelId: labelId,
        customLabelName: labelName,
        customLabel: isConverted ? "converted_to_appointment" : labelId,
        manualConversionStatus: isConverted ? ("converted_to_appointment" as const) : null,
      });

      setLogs((prev) => prev.map((l) => (l.id === logId ? updater(l) : l)));
      setSelectedLog((prev) => (prev && prev.id === logId ? updater(prev) : prev));
    },
    []
  );

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Status filter: supports both system status (normalized) and custom label filter
      if (statusFilter !== "all") {
        if (statusFilter === "custom_labeled") {
          // Show only conversations with any custom label
          if (!isConversationManuallyConverted(log) && !log.customLabelId) return false;
        } else if (statusFilter.startsWith("label:")) {
          // Filter by specific custom label
          const labelId = statusFilter.replace("label:", "");
          const isTargetConverted = labelId === "converted_to_appointment" || labelId === "appointment_converted";
          if (isTargetConverted) {
            if (!isConversationManuallyConverted(log)) return false;
          } else {
            if (log.customLabelId !== labelId) return false;
          }
        } else if (statusFilter === "appointment") {
          if (!isConversationConverted(log)) return false;
        } else {
          // System status filter using canonical resolver normalization
          const norm = normalizeConversationStatus(log.status, {
            convertedToAppointment: log.convertedToAppointment,
            appointmentId: log.appointmentId,
          });
          if (statusFilter === "answered" && (norm !== "successfully_answered" || isConversationConverted(log))) return false;
          if (statusFilter === "collecting" && norm !== "collecting_appointment_information") return false;
          if (statusFilter === "liveSupport" && norm !== "live_support_required") return false;
          if (statusFilter === "unanswered" && norm !== "unanswered") return false;
        }
      }
      
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
        const preview = log.lastMessagePreview?.toLowerCase() || "";
        const customLabel = log.customLabelName?.toLowerCase() || "";
        if (!patientName.includes(query) && !preview.includes(query) && !customLabel.includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [logs, search, statusFilter, langFilter, dateFilter]);

  const metrics = useMemo(() => {
    let unansweredCount = 0;
    let liveSupportCount = 0;
    let appointmentsCount = 0;
    let collectingCount = 0;
    let answeredCount = 0;

    logs.forEach((l) => {
      const s = normalizeConversationStatus(l.status, {
        convertedToAppointment: l.convertedToAppointment,
        appointmentId: l.appointmentId,
      });
      const isConv = isConversationConverted(l);

      if (isConv) {
        appointmentsCount++;
      }

      if (s === "unanswered") unansweredCount++;
      else if (s === "live_support_required") liveSupportCount++;
      else if (s === "collecting_appointment_information") collectingCount++;
      else if (s === "successfully_answered" && !isConv) answeredCount++;
    });

    return {
      total: logs.length,
      unanswered: unansweredCount,
      needsLiveSupport: liveSupportCount,
      appointments: appointmentsCount,
      collecting: collectingCount,
      answered: answeredCount,
    };
  }, [logs]);

  const getStatusLabel = (status: LogStatus | string) => {
    switch (status) {
      case "answered":
        return t("logs.status.answered") || (language === "en" ? "Successfully Answered" : "Başarılı Yanıtlandı");
      case "liveSupport":
        return t("logs.status.liveSupport") || (language === "en" ? "Live Support Required" : "Canlı Destek Gerekli");
      case "unanswered":
        return t("logs.status.unanswered") || (language === "en" ? "Unanswered" : "Yanıtlanamadı");
      case "appointment":
        return t("logs.status.appointment") || (language === "en" ? "Converted to Appointment" : "Randevuya Dönüştü");
      case "collecting":
        return t("logs.status.collecting") || (language === "en" ? "Collecting Appointment Information" : "Randevu Bilgisi Toplanıyor");
      case "open":
        return t("logs.status.open") || (language === "en" ? "Open" : "Açık");
      default:
        return status;
    }
  };

  // Build filter options — include canonical system statuses and custom labels
  const statusOptions = useMemo(() => {
    const opts = [
      { value: "all", label: t("common.all") || (language === "en" ? "All" : "Tümü") },
      { value: "answered", label: getStatusLabel("answered") },
      { value: "appointment", label: getStatusLabel("appointment") },
      { value: "collecting", label: getStatusLabel("collecting") },
      { value: "liveSupport", label: getStatusLabel("liveSupport") },
      { value: "unanswered", label: getStatusLabel("unanswered") },
    ];

    // Add custom label filter options
    if (customLabels.length > 0) {
      opts.push({
        value: "custom_labeled",
        label: language === "en" ? "── Custom Labels ──" : "── Özel Etiketler ──",
      });
      for (const label of customLabels) {
        opts.push({
          value: `label:${label.id}`,
          label: `↳ ${language === "en" ? label.labelEn : label.labelTr}`,
        });
      }
    }

    return opts;
  }, [t, language, customLabels]);

  const langOptions = [
    { value: "all", label: t("common.all") || (language === "en" ? "All" : "Tümü") },
    { value: "tr", label: "TR" },
    { value: "en", label: "EN" },
  ];

  const dateOptions = [
    { value: "all", label: t("common.all") || (language === "en" ? "All" : "Tümü") },
    { value: "today", label: t("logs.date.today") || (language === "en" ? "Today" : "Bugün") },
    { value: "week", label: t("logs.date.week") || (language === "en" ? "Last 7 Days" : "Son 7 Gün") },
    { value: "month", label: t("logs.date.month") || (language === "en" ? "Last 30 Days" : "Son 30 Gün") },
  ];

  const handleExportCSV = useCallback(() => {
    exportConversationLogsToCSV(filteredLogs, language);
  }, [filteredLogs, language]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      
      {/* Metrics Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20 }}>
        <StatCard 
          label={t("logs.metrics.total") || (language === "en" ? "Total Conversations" : "Toplam Görüşme")} 
          value={metrics.total} 
          icon={<MessageSquare size={20} />} 
        />
        <StatCard 
          label={t("logs.metrics.unanswered") || (language === "en" ? "Unanswered" : "Yanıtlanamayan")} 
          value={metrics.unanswered} 
          icon={<AlertCircle size={20} />} 
          trend={metrics.unanswered > 0 ? { value: metrics.unanswered, isUp: false } : undefined}
        />
        <StatCard 
          label={t("logs.metrics.liveSupport") || (language === "en" ? "Live Support Requests" : "Canlı Destek Talepleri")} 
          value={metrics.needsLiveSupport} 
          icon={<PhoneCall size={20} />} 
        />
        <StatCard 
          label={t("logs.metrics.appointments") || (language === "en" ? "Converted to Appointments" : "Randevuya Dönüşen")} 
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
              placeholder={t("logs.searchPlaceholder") || (language === "en" ? "Search patient name, message or topic..." : "İsim, mesaj veya içerik ara...")}
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            />
          </div>
          <div style={{ width: 160 }}>
            <Select 
              label={t("logs.filterDate") || (language === "en" ? "Date" : "Tarih")}
              value={dateFilter}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDateFilter(e.target.value)}
              options={dateOptions}
            />
          </div>
          <div style={{ width: 220 }}>
            <Select 
              label={t("logs.filterStatus") || (language === "en" ? "Status" : "Durum")}
              value={statusFilter}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value)}
              options={statusOptions}
            />
          </div>
          <div style={{ width: 120 }}>
            <Select 
              label={t("logs.filterLang") || (language === "en" ? "Language" : "Dil")}
              value={langFilter}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setLangFilter(e.target.value)}
              options={langOptions}
            />
          </div>
          <div>
            <Button
              variant="secondary"
              onClick={handleExportCSV}
              disabled={logs.length === 0}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Download size={14} />
              {t("common.exportCsv") || (language === "en" ? "Export CSV" : "CSV İndir")}
            </Button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: UI_COLORS.textMuted }}>
            {t("common.loading") || (language === "en" ? "Loading..." : "Yükleniyor...")}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ padding: 40 }}>
            <EmptyState 
              emoji="📭"
              title={t("logs.emptyTitle") || (language === "en" ? "No conversations yet" : "Henüz görüşme kaydı bulunmuyor")}
              description={t("logs.emptyDesc") || (language === "en" ? "Conversations will appear here once patients start chatting on the widget." : "Web widget üzerinden hasta görüşmeleri başladığında kayıtlar burada listelenecek.")}
            />
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "var(--bg-app)", borderBottom: `1px solid ${UI_COLORS.border}` }}>
                  <th style={{ padding: "16px 20px", fontSize: 13, fontWeight: 600, color: UI_COLORS.textSecondary }}>
                    {t("logs.table.patient") || (language === "en" ? "Patient" : "Hasta")}
                  </th>
                  <th style={{ padding: "16px 20px", fontSize: 13, fontWeight: 600, color: UI_COLORS.textSecondary }}>
                    {t("logs.table.preview") || (language === "en" ? "Preview" : "Son Mesaj")}
                  </th>
                  <th style={{ padding: "16px 20px", fontSize: 13, fontWeight: 600, color: UI_COLORS.textSecondary }}>
                    {t("logs.table.date") || (language === "en" ? "Date" : "Tarih")}
                  </th>
                  <th style={{ padding: "16px 20px", fontSize: 13, fontWeight: 600, color: UI_COLORS.textSecondary }}>
                    {t("logs.table.status") || (language === "en" ? "Status" : "Durum")}
                  </th>
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
                            {log.patientName || (t("logs.anonymous") || (language === "en" ? "Anonymous Visitor" : "Anonim Ziyaretçi"))}
                          </div>
                          <div style={{ fontSize: 12, color: UI_COLORS.textMuted, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ textTransform: "uppercase", fontSize: 10, fontWeight: 700, padding: "2px 4px", background: "var(--bg-app)", borderRadius: 4 }}>
                              {log.language}
                            </span>
                            {log.totalMessages} {t("logs.messages") || (language === "en" ? "messages" : "mesaj")}
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
                          <AlertCircle size={12} /> {t("logs.trainingNeeded") || (language === "en" ? "Training Needed" : "Eğitim Gerekli")}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "16px 20px" }}>
                      <div style={{ fontSize: 13.5, color: UI_COLORS.textSecondary }}>
                        {new Date(log.createdAt).toLocaleDateString(language === "en" ? "en-US" : "tr-TR", { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td style={{ padding: "16px 20px" }}>
                      <ConversationStatusDropdown
                        log={log}
                        clinicId={clinicId}
                        customLabels={customLabels}
                        canEdit={canEditLabel}
                        onLabelUpdated={handleLabelUpdated}
                      />
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
