"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";
import EmptyState from "@/components/ui/EmptyState";
import { Loader2 } from "lucide-react";
import { Select } from "@/components/ui/Select";
import SectionCard from "@/components/ui/SectionCard";
import Badge from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

import UsageSummaryCards from "@/components/clinic/usage/UsageSummaryCards";
import PricingEditor from "@/components/admin/PricingEditor";

import type { AIUsageSummary, AdminClinicUsageRow, AIUsageAuditEntry } from "@/lib/types/aiUsage";
import { formatNumber } from "@/lib/utils";

type DateRange = "today" | "yesterday" | "7d" | "30d" | "this_month" | "last_month";

const DATE_OPTIONS: { label: string; value: DateRange }[] = [
  { label: "Bugün", value: "today" },
  { label: "Dün", value: "yesterday" },
  { label: "Son 7 Gün", value: "7d" },
  { label: "Son 30 Gün", value: "30d" },
  { label: "Bu Ay", value: "this_month" },
  { label: "Geçen Ay", value: "last_month" },
];

function getDateParams(range: DateRange) {
  const now = new Date();
  let start = new Date(now);
  let end = new Date(now);

  switch (range) {
    case "today": start.setHours(0,0,0,0); end.setHours(23,59,59,999); break;
    case "yesterday": start.setDate(start.getDate()-1); start.setHours(0,0,0,0); end.setDate(end.getDate()-1); end.setHours(23,59,59,999); break;
    case "7d": start.setDate(start.getDate()-6); start.setHours(0,0,0,0); end.setHours(23,59,59,999); break;
    case "30d": start.setDate(start.getDate()-29); start.setHours(0,0,0,0); end.setHours(23,59,59,999); break;
    case "this_month": start.setDate(1); start.setHours(0,0,0,0); end.setHours(23,59,59,999); break;
    case "last_month": start.setMonth(start.getMonth()-1, 1); start.setHours(0,0,0,0); end.setDate(0); end.setHours(23,59,59,999); break;
  }
  return {
    startDateStr: start.toISOString().split("T")[0],
    endDateStr: end.toISOString().split("T")[0]
  };
}

export default function AdminAIUsagePage() {
  const { profile, getToken } = useAuth();
  
  const [dateRange, setDateRange] = useState<DateRange>("this_month");
  
  const [summary, setSummary] = useState<AIUsageSummary | null>(null);
  const [clinicsData, setClinicsData] = useState<AdminClinicUsageRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AIUsageAuditEntry[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "clinics" | "pricing" | "audit">("overview");

  const isSuperAdmin = profile?.role === "superAdmin" || profile?.role === "admin";

  const loadData = useCallback(async () => {
    if (!isSuperAdmin) return;
    
    setLoading(true);
    try {
      const token = await getToken();
      const { startDateStr, endDateStr } = getDateParams(dateRange);
      const q = `?startDate=${startDateStr}&endDate=${endDateStr}`;
      
      const headers = { Authorization: `Bearer ${token}` };

      const [summaryRes, clinicsRes, auditRes] = await Promise.all([
        fetch(`/api/admin/usage/summary${q}`, { headers }),
        fetch(`/api/admin/usage/clinics${q}`, { headers }),
        fetch(`/api/admin/usage/audit?limit=20`, { headers }) // audit doesn't strictly need date range for recent scan
      ]);

      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (clinicsRes.ok) setClinicsData(await clinicsRes.json());
      if (auditRes.ok) setAuditLogs(await auditRes.json());
      
    } catch (err) {
      console.error("Failed to load admin AI data:", err);
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, dateRange, getToken]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!isSuperAdmin) {
    return <EmptyState title="Yetkisiz Erişim" description="Bu sayfayı görüntüleme yetkiniz yok." />;
  }

  const renderTabs = () => (
    <div style={{ display: "flex", gap: 8, borderBottom: `1px solid ${UI_COLORS.border}`, marginBottom: 24, overflowX: "auto" }}>
      {[
        { id: "overview", label: "Genel Bakış" },
        { id: "clinics", label: "Klinik Karşılaştırma" },
        { id: "pricing", label: "Fiyatlandırma Ayarları" },
        { id: "audit", label: "Sistem Denetimi" }
      ].map(tab => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id as any)}
          style={{
            padding: "12px 20px",
            fontSize: 14,
            fontWeight: activeTab === tab.id ? 600 : 500,
            color: activeTab === tab.id ? UI_COLORS.brand : UI_COLORS.textSecondary,
            borderBottom: `2px solid ${activeTab === tab.id ? UI_COLORS.brand : "transparent"}`,
            background: "none",
            borderTop: "none", borderLeft: "none", borderRight: "none",
            cursor: "pointer",
            transition: UI_COMMON_STYLES.transition,
            whiteSpace: "nowrap"
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: 40 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary }}>
            Merkezi AI Yönetimi
          </h2>
          <p style={{ fontSize: 14, color: UI_COLORS.textMuted, marginTop: 4 }}>
            Tüm sistemin AI kullanımını ve maliyetlerini yönetin
          </p>
        </div>
        {(activeTab === "overview" || activeTab === "clinics") && (
          <div style={{ width: 160 }}>
            <Select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as DateRange)}
              options={DATE_OPTIONS}
            />
          </div>
        )}
      </div>

      {renderTabs()}

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "80px 0", color: UI_COLORS.textMuted }}>
          <Loader2 size={32} className="animate-spin" />
          <p style={{ fontSize: 14 }}>Veriler yükleniyor…</p>
        </div>
      ) : (
        <>
          {activeTab === "overview" && summary && (
            <UsageSummaryCards summary={summary} showCosts={true} />
          )}

          {activeTab === "clinics" && (
            <SectionCard title="Klinik Bazlı Maliyet ve Kullanım" noPadding>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "rgba(0,0,0,0.02)", borderBottom: `2px solid ${UI_COLORS.border}` }}>
                      <th style={{ padding: "12px 16px", color: UI_COLORS.textSecondary }}>Klinik / Kaynak</th>
                      <th style={{ padding: "12px 16px", color: UI_COLORS.textSecondary, textAlign: "right" }}>İstek</th>
                      <th style={{ padding: "12px 16px", color: UI_COLORS.textSecondary, textAlign: "right" }}>Token</th>
                      <th style={{ padding: "12px 16px", color: UI_COLORS.textSecondary, textAlign: "right" }}>Maliyet (USD)</th>
                      <th style={{ padding: "12px 16px", color: UI_COLORS.textSecondary, textAlign: "right" }}>Limit %</th>
                      <th style={{ padding: "12px 16px", color: UI_COLORS.textSecondary, textAlign: "center" }}>Hata Oranı</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clinicsData.map((c, idx) => (
                      <tr key={c.clinicId} style={{ borderBottom: idx < clinicsData.length - 1 ? `1px solid ${UI_COLORS.border}` : "none" }}>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ fontWeight: 600, color: UI_COLORS.textPrimary }}>
                            {c.clinicName} {c.clinicId === "system" && <Badge variant="module-ai" label="SYSTEM" />}
                          </div>
                          <div style={{ fontSize: 11, color: UI_COLORS.textMuted, marginTop: 2 }}>
                            {(c.plan || "free").toUpperCase()} • {c.status}
                          </div>
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right", color: UI_COLORS.textSecondary }}>
                          {formatNumber(c.requestCount)}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right", color: UI_COLORS.textSecondary }}>
                          {formatNumber(c.totalTokens)}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, color: UI_COLORS.textPrimary }}>
                          ${c.totalCostUsd.toFixed(2)}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right" }}>
                          {c.limitUsagePercent !== undefined ? (
                            <span style={{ color: c.limitUsagePercent > 90 ? UI_COLORS.danger : UI_COLORS.textSecondary }}>
                              {c.limitUsagePercent.toFixed(1)}%
                            </span>
                          ) : "-"}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "center" }}>
                          <Badge variant={c.errorRate > 5 ? "danger" : c.errorRate > 0 ? "warning" : "success"} label={`${c.errorRate.toFixed(1)}%`} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {activeTab === "pricing" && (
            <PricingEditor />
          )}

          {activeTab === "audit" && (
            <SectionCard title="Sistem Denetimi (Son İstekler)">
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${UI_COLORS.border}` }}>
                      <th style={{ padding: "12px 16px", color: UI_COLORS.textSecondary }}>Zaman</th>
                      <th style={{ padding: "12px 16px", color: UI_COLORS.textSecondary }}>Tip</th>
                      <th style={{ padding: "12px 16px", color: UI_COLORS.textSecondary }}>Mesaj</th>
                      <th style={{ padding: "12px 16px", color: UI_COLORS.textSecondary }}>Detay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ padding: 40, textAlign: "center", color: UI_COLORS.textMuted }}>
                          Şu an için sorun tespit edilmedi. Sistem sağlıklı çalışıyor.
                        </td>
                      </tr>
                    ) : auditLogs.map(log => (
                      <tr key={log.id} style={{ borderBottom: `1px solid ${UI_COLORS.border}` }}>
                        <td style={{ padding: "12px 16px", color: UI_COLORS.textSecondary }}>
                          {new Date(log.createdAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <Badge variant={log.severity === "error" ? "danger" : "warning"} label={log.type} />
                        </td>
                        <td style={{ padding: "12px 16px", color: UI_COLORS.textPrimary }}>
                          {log.message}
                        </td>
                        <td style={{ padding: "12px 16px", color: UI_COLORS.textMuted, fontSize: 11 }}>
                          {JSON.stringify(log.details)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}
