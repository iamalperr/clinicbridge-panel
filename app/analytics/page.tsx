"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { MOCK_CLINICS, MOCK_STATS } from "@/lib/mock-data";
import StatCard from "@/components/ui/StatCard";
import SectionCard from "@/components/ui/SectionCard";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { BarChart3, Activity, Download, TrendingUp, Users, MessageSquare, Clock, Star, Heart, CalendarCheck, UserPlus, AlertTriangle } from "lucide-react";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";
import PageHeader from "@/components/ui/PageHeader";
import { formatNumber } from "@/lib/utils";
import { useI18n } from "@/lib/i18n-context";
import { Check } from "lucide-react";

export default function AnalyticsPage() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const [timeRange, setTimeRange] = useState("7d");
  const [isExporting, setIsExporting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const roleStr = profile?.role as string;
  const isClinicUser = roleStr === "clinicUser" || roleStr === "Klinik Kullanıcısı";
  const [selectedClinicId, setSelectedClinicId] = useState(() => {
    if (isClinicUser && profile?.clinicId) return profile.clinicId;
    return "all";
  });

  const activeClinics = MOCK_CLINICS.filter(c => c.status === "active").length;
  const topClinics = [...MOCK_CLINICS].sort((a, b) => (b.messages || 0) - (a.messages || 0)).slice(0, 5);

  // Mock filtering based on selected clinic
  const isGlobal = selectedClinicId === "all";
  const selectedClinicName = isGlobal ? t("clinics.allClinics") : MOCK_CLINICS.find(c => c.id === selectedClinicId)?.name || "";
  
  const aiQualityScore = isGlobal ? "94%" : "97%";
  const patientSat = isGlobal ? "4.8/5" : "4.9/5";
  const apptConversion = isGlobal ? "38%" : "45%";
  const humanHandoff = isGlobal ? "12%" : "7%";
  const riskScore = isGlobal ? `${t("analytics.low")} (2%)` : `${t("analytics.low")} (1%)`;
  
  // Mock trend data
  const baseTrendData = [450, 520, 480, 600, 710, 680, 850];
  const trendData = isGlobal ? baseTrendData : baseTrendData.map(v => Math.round(v * 0.15));
  const maxTrend = Math.max(...trendData);

  const handleExport = () => {
    setIsExporting(true);
    
    // Mock export process
    setTimeout(() => {
      // CSV Headers
      const headers = ["metric", "value", "change", "note"];
      
      // CSV Data based on current stats
      const rows = [
        ["Total Messages", formatNumber(MOCK_STATS.totalMessages), "+12.4%", "Total platform volume"],
        ["Conversations", formatNumber(MOCK_STATS.totalConversations), "+8.2%", "Resolved interactions"],
        ["Active Clinics", activeClinics, "+2", "Operational now"],
        ["Avg. Response Time", `${MOCK_STATS.avgResponseTime}s`, "-4.1%", "Per message"]
      ];
      
      // Construct CSV content
      const csvContent = [
        headers.join(","),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
      ].join("\n");
      
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `analytics-report-${timeRange}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setIsExporting(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }, 1500);
  };



  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px" }}>
      <PageHeader 
        title={t("analytics.title")}
        subtitle={t("analytics.subtitle")}
        backHref="/clinics"
        backLabel="Dashboard"
        actions={
          <>
            {showSuccess && (
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: 6, 
                color: "#10b981", 
                fontSize: 13, 
                fontWeight: 600,
                animation: "fadeIn 0.3s ease-out"
              }}>
                <Check size={16} />
                Report exported successfully!
              </div>
            )}
            <div style={{ width: 160 }}>
              <Select 
                value={timeRange} 
                onChange={(e) => setTimeRange(e.target.value)}
                options={[
                  { label: t("analytics.timeRanges.24h"), value: "24h" },
                  { label: t("analytics.timeRanges.7d"), value: "7d" },
                  { label: t("analytics.timeRanges.30d"), value: "30d" },
                  { label: t("analytics.timeRanges.all"), value: "all" },
                ]}
              />
            </div>
            <Button 
              variant="primary" 
              onClick={handleExport}
              isLoading={isExporting}
              style={{ display: "flex", gap: 8, alignItems: "center", height: 42 }}
            >
              {!isExporting && <Download size={16} />}
              {t("analytics.downloadReport")}
            </Button>
          </>
        }
      />

      {/* Top Stats - Hidden for Clinic Users as these are platform wide */}
      {!isClinicUser && (
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", 
          gap: 20, 
          marginBottom: 32 
        }}>
          <StatCard 
            label={t("clinics.stats.totalMessages")} 
            value={formatNumber(MOCK_STATS.totalMessages)} 
            subtext="Total platform volume" 
            icon={<MessageSquare size={18} />}
            trend={{ value: 12.4, isUp: true }}
          />
          <StatCard 
            label={t("clinics.stats.conversations")} 
            value={formatNumber(MOCK_STATS.totalConversations)} 
            subtext="Resolved interactions" 
            icon={<Users size={18} />}
            trend={{ value: 8.2, isUp: true }}
          />
          <StatCard 
            label={t("clinics.stats.activeClinics")} 
            value={activeClinics} 
            subtext="Operational now" 
            icon={<Activity size={18} />}
            trend={{ value: 2, isUp: true }}
          />
          <StatCard 
            label={t("clinics.stats.avgResponse")} 
            value={`${MOCK_STATS.avgResponseTime}s`} 
            subtext="Per message" 
            icon={<Clock size={18} />}
            trend={{ value: 4.1, isUp: false }}
          />
        </div>
      )}

      {/* AI Performance Section */}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: UI_COLORS.textPrimary }}>
          {t("analytics.aiPerformance")} - {selectedClinicName}
        </h3>
        <div style={{ height: 1, flex: 1, background: `linear-gradient(to right, ${UI_COLORS.border}, transparent)` }} />
        <div style={{ width: 220 }}>
          <Select 
            value={selectedClinicId}
            onChange={(e) => setSelectedClinicId(e.target.value)}
            disabled={isClinicUser}
            options={
              isClinicUser 
                ? MOCK_CLINICS.filter(c => c.id === profile?.clinicId).map(c => ({ label: c.name, value: c.id }))
                : [
                    { label: t("clinics.allClinics"), value: "all" },
                    ...MOCK_CLINICS.map(c => ({ label: c.name, value: c.id }))
                  ]
            }
          />
        </div>
      </div>

      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
        gap: 20, 
        marginBottom: 32 
      }}>
        <StatCard 
          label={t("analytics.aiQualityScore")} 
          value={aiQualityScore} 
          subtext={t("analytics.basedOnCriteria")} 
          icon={<Star size={18} color="#f59e0b" />}
          trend={{ value: 2.1, isUp: true }}
        />
        <StatCard 
          label={t("analytics.patientSatisfaction")} 
          value={patientSat} 
          subtext={t("analytics.postChatFeedback")} 
          icon={<Heart size={18} color="#ec4899" />}
          trend={{ value: 0.2, isUp: true }}
        />
        <StatCard 
          label={t("analytics.apptConversion")} 
          value={apptConversion} 
          subtext={t("analytics.chatToBooking")} 
          icon={<CalendarCheck size={18} color="#10b981" />}
          trend={{ value: 5.4, isUp: true }}
        />
        <StatCard 
          label={t("analytics.humanHandoff")} 
          value={humanHandoff} 
          subtext={t("analytics.escalationRate")} 
          icon={<UserPlus size={18} color="#6366f1" />}
          trend={{ value: 1.5, isUp: false }}
        />
        <StatCard 
          label={t("analytics.riskScore")} 
          value={riskScore} 
          subtext={t("analytics.hallucinationRate")} 
          icon={<AlertTriangle size={18} color="#ef4444" />}
          trend={{ value: 0.5, isUp: false }}
        />
      </div>

      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", 
        gap: 24 
      }}>
        {/* Trend Area */}
        <SectionCard title={t("analytics.usageTrends")} icon={<TrendingUp size={18} />}>
          <div style={{ position: "relative", paddingTop: 10 }}>
            <div style={{ 
              display: "flex", 
              alignItems: "flex-end", 
              gap: 12, 
              height: 240, 
              padding: "20px 8px 10px", 
              borderBottom: `1px solid ${UI_COLORS.border}`
            }}>
              {trendData.map((val, i) => {
                const heightPct = (val / maxTrend) * 100;
                return (
                  <div key={i} style={{ 
                    flex: 1, 
                    display: "flex", 
                    flexDirection: "column", 
                    alignItems: "center", 
                    gap: 12, 
                    position: "relative",
                  }}>
                    <div style={{ 
                      width: "100%", 
                      height: "100%", 
                      display: "flex", 
                      alignItems: "flex-end", 
                      justifyContent: "center",
                      cursor: "pointer"
                    }} title={`${val} messages`}>
                      <div 
                        style={{ 
                          width: "70%", 
                          height: `${heightPct}%`, 
                          background: UI_COMMON_STYLES.brandGradient, 
                          borderRadius: "10px 10px 4px 4px",
                          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                          boxShadow: "0 4px 15px -3px rgba(99, 102, 241, 0.4)",
                          position: "relative"
                        }} 
                        onMouseEnter={(e) => {
                          e.currentTarget.style.filter = "brightness(1.2)";
                          e.currentTarget.style.width = "85%";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.filter = "none";
                          e.currentTarget.style.width = "70%";
                        }}
                      />
                    </div>
                    <span style={{ 
                      fontSize: 11, 
                      color: UI_COLORS.textMuted, 
                      fontWeight: 700, 
                      textTransform: "uppercase",
                      letterSpacing: "0.05em"
                    }}>
                      D{i + 1}
                    </span>
                  </div>
                );
              })}
            </div>
            
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, color: UI_COLORS.textMuted, fontSize: 11, fontWeight: 600 }}>
              <span>0 Messages</span>
              <span style={{ color: UI_COLORS.brand }}>Peak: {formatNumber(maxTrend)}</span>
            </div>
          </div>
        </SectionCard>

        {/* Top Clinics */}
        <SectionCard title={t("analytics.highestVolume")} icon={<BarChart3 size={18} />}>
          {topClinics.length === 0 ? (
            <EmptyState title={t("training.empty.noResults")} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {topClinics.map((clinic, i) => (
                <div key={clinic.id} style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  borderRadius: 16,
                  background: "rgba(255, 255, 255, 0.02)",
                  border: `1px solid ${UI_COLORS.border}`,
                  transition: "transform 0.2s, background 0.2s",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ 
                      width: 32, 
                      height: 32, 
                      borderRadius: 10, 
                      background: "rgba(99, 102, 241, 0.1)", 
                      color: UI_COLORS.brand, 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center", 
                      fontSize: 13, 
                      fontWeight: 800 
                    }}>
                      #{i + 1}
                    </div>
                    <div>
                      <p style={{ fontSize: 14.5, fontWeight: 700, color: UI_COLORS.textPrimary }}>{clinic.name}</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                        <p style={{ fontSize: 12, color: UI_COLORS.textMuted }}>{formatNumber(clinic.messages ?? 0)} messages</p>
                        <span style={{ width: 3, height: 3, borderRadius: "50%", background: UI_COLORS.border }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#10b981" }}>+5.2%</span>
                      </div>
                    </div>
                  </div>
                  {clinic.plan && <Badge variant={clinic.plan} />}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
