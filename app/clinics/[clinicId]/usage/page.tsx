"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Clinic } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { Select } from "@/components/ui/Select";
import EmptyState from "@/components/ui/EmptyState";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { Loader2 } from "lucide-react";

import UsageSummaryCards from "@/components/clinic/usage/UsageSummaryCards";
import UsageChart from "@/components/clinic/usage/UsageChart";
import UsageBreakdowns from "@/components/clinic/usage/UsageBreakdowns";
import UsageRecordsTable from "@/components/clinic/usage/UsageRecordsTable";
import UsageLimits from "@/components/clinic/usage/UsageLimits";

import type { AIUsageSummary, AIUsageTimeseriesPoint, AIUsageBreakdowns, AIUsageRecordRow } from "@/lib/types/aiUsage";

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
    case "today":
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "yesterday":
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    case "7d":
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "30d":
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "this_month":
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "last_month":
      start.setMonth(start.getMonth() - 1, 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(0); // last day of previous month
      end.setHours(23, 59, 59, 999);
      break;
  }
  return {
    startDateStr: start.toISOString().split("T")[0],
    endDateStr: end.toISOString().split("T")[0]
  };
}

export default function AIUsagePage() {
  const params = useParams();
  const clinicId = params.clinicId as string;
  const { profile, getToken } = useAuth();

  const [dateRange, setDateRange] = useState<DateRange>("this_month");
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [loadingClinic, setLoadingClinic] = useState(true);

  // Data states
  const [summary, setSummary] = useState<AIUsageSummary | null>(null);
  const [timeseries, setTimeseries] = useState<AIUsageTimeseriesPoint[]>([]);
  const [breakdowns, setBreakdowns] = useState<AIUsageBreakdowns | null>(null);
  
  // Records state
  const [records, setRecords] = useState<AIUsageRecordRow[]>([]);
  const [lastVisible, setLastVisible] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  
  const [loadingData, setLoadingData] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // 1. Load Clinic Details
  useEffect(() => {
    async function loadClinic() {
      try {
        const snap = await getDoc(doc(db, "clinics", clinicId));
        if (snap.exists()) {
          setClinic({ id: snap.id, ...snap.data() } as Clinic);
        }
      } catch (err) {
        console.error("Failed to load clinic:", err);
      } finally {
        setLoadingClinic(false);
      }
    }
    loadClinic();
  }, [clinicId]);

  // Authorization checks
  const isSuperAdmin = profile?.role === "superAdmin" || profile?.role === "admin";
  const isClinicAdmin = profile?.role === "clinicAdmin";
  const isClinicUser = profile?.role === "clinicUser";
  
  const hasAccess = isSuperAdmin || ((isClinicAdmin || isClinicUser) && profile?.clinicId === clinicId);
  const showCosts = isSuperAdmin || clinic?.aiUsageSettings?.showCostToClinicUsers === true;

  // 2. Load API Data
  const loadData = useCallback(async () => {
    if (!clinicId || !hasAccess) return;
    
    setLoadingData(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("No token");

      const { startDateStr, endDateStr } = getDateParams(dateRange);
      const q = `?startDate=${startDateStr}&endDate=${endDateStr}`;
      
      const headers = { Authorization: `Bearer ${token}` };

      const [summaryRes, tsRes, brRes, recRes] = await Promise.all([
        fetch(`/api/clinics/${clinicId}/usage/summary${q}`, { headers }),
        fetch(`/api/clinics/${clinicId}/usage/timeseries${q}`, { headers }),
        fetch(`/api/clinics/${clinicId}/usage/breakdown${q}`, { headers }),
        fetch(`/api/clinics/${clinicId}/usage/records${q}&limit=20`, { headers })
      ]);

      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (tsRes.ok) setTimeseries(await tsRes.json());
      if (brRes.ok) setBreakdowns(await brRes.json());
      if (recRes.ok) {
        const d = await recRes.json();
        setRecords(d.records || []);
        setLastVisible(d.lastVisible);
        setHasMore(d.hasMore);
      }
    } catch (err) {
      console.error("Failed to load AI usage data:", err);
    } finally {
      setLoadingData(false);
    }
  }, [clinicId, dateRange, hasAccess, getToken]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load more records
  const handleLoadMore = async () => {
    if (!lastVisible || loadingMore) return;
    setLoadingMore(true);
    try {
      const token = await getToken();
      const { startDateStr, endDateStr } = getDateParams(dateRange);
      const q = `?startDate=${startDateStr}&endDate=${endDateStr}&lastVisible=${encodeURIComponent(lastVisible)}&limit=20`;
      
      const res = await fetch(`/api/clinics/${clinicId}/usage/records${q}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const d = await res.json();
        setRecords(prev => [...prev, ...(d.records || [])]);
        setLastVisible(d.lastVisible);
        setHasMore(d.hasMore);
      }
    } catch (err) {
      console.error("Failed to load more records:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  const exportCsv = () => {
    if (!records.length) return;
    
    const headers = ["Tarih", "Tip", "Kanal", "Model", "Token", "Maliyet", "Durum"];
    const rows = records.map(r => [
      new Date(r.createdAt).toLocaleString("tr-TR"),
      r.requestType,
      r.channel,
      r.model,
      r.totalTokens.toString(),
      showCosts ? r.totalCostUsd.toFixed(4) : "N/A",
      r.status
    ]);
    
    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ai_usage_${clinicId}_${dateRange}.csv`;
    link.click();
  };

  if (loadingClinic || (!summary && loadingData)) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "80px 0", color: UI_COLORS.textMuted }}>
        <Loader2 size={32} style={{ animation: "spin 1s linear infinite" }} />
        <p style={{ fontSize: 14 }}>Kullanım verileri yükleniyor…</p>
      </div>
    );
  }

  if (!hasAccess) {
    return <EmptyState title="Erişim Hatası" description="Bu sayfayı görüntüleme yetkiniz yok." />;
  }

  if (!clinic) {
    return <EmptyState title="Klinik Bulunamadı" />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: 40 }}>
      {/* Header and Filter */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary }}>
            AI Kullanım & Maliyet Takibi
          </h2>
          <p style={{ fontSize: 14, color: UI_COLORS.textMuted, marginTop: 4 }}>
            OpenAI API istekleri, token harcamaları ve model bazlı kırılımlar
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

      {showCosts && (
        <UsageLimits 
          budgetLimitUsd={clinic.aiUsageSettings?.budgetLimitUsd} 
          currentCostUsd={summary?.totalCostUsd || 0} 
        />
      )}

      {summary && (
        <UsageSummaryCards summary={summary} showCosts={showCosts} />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: 24 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <UsageChart data={timeseries} showCosts={showCosts} />
        </div>
      </div>

      {breakdowns && (
        <UsageBreakdowns breakdowns={breakdowns} showCosts={showCosts} />
      )}

      <UsageRecordsTable 
        records={records} 
        hasMore={hasMore} 
        isLoadingMore={loadingMore} 
        onLoadMore={handleLoadMore}
        showCosts={showCosts}
        onExportCsv={exportCsv}
      />
    </div>
  );
}
