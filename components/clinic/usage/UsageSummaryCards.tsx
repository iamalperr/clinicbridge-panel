"use client";

import React from "react";
import StatCard from "@/components/ui/StatCard";
import type { AIUsageSummary } from "@/lib/types/aiUsage";
import { DollarSign, MessageSquare, Zap, Target, Clock, Activity } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { useI18n } from "@/lib/i18n-context";


interface ExtendedAIUsageSummary extends AIUsageSummary {
  totalMessages?: number;
  resolvedConversations?: number;
}

interface Props {
  summary: ExtendedAIUsageSummary;
  showCosts: boolean;
}

export default function UsageSummaryCards({ summary, showCosts }: Props) {
  const { t } = useI18n();

  // Helper to safely format percentages
  const calcTrend = (current: number, previous?: number) => {
    if (!previous || previous === 0) return undefined;
    const diff = current - previous;
    const pct = (diff / previous) * 100;
    return {
      value: Math.abs(Math.round(pct)),
      isUp: pct > 0,
    };
  };

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
      gap: 20,
      marginBottom: 30
    }}>
      <StatCard
        label="Toplam Görüşme"
        value={formatNumber(summary.totalConversations)}
        icon={<MessageSquare size={20} />}
        trend={summary.previousPeriod ? calcTrend(summary.totalConversations, summary.previousPeriod.totalConversations) : undefined}
        subtext={summary.resolvedConversations !== undefined ? `${formatNumber(summary.resolvedConversations)} Çözümlenen` : undefined}
      />

      <StatCard
        label="Toplam Mesaj"
        value={formatNumber(summary.totalMessages || 0)}
        icon={<MessageSquare size={20} />}
      />

      <StatCard
        label="AI İstekleri"
        value={summary.totalRequests > 0 ? formatNumber(summary.totalRequests) : (summary.totalConversations > 0 ? "—" : "0")}
        icon={<Activity size={20} />}
        trend={summary.previousPeriod ? calcTrend(summary.totalRequests, summary.previousPeriod.totalRequests) : undefined}
        subtext={summary.totalRequests > 0 ? `${formatNumber(summary.successfulRequests)} Başarılı | ${formatNumber(summary.failedRequests)} Başarısız` : "Henüz takip edilmiyor"}
      />

      <StatCard
        label="Toplam Token"
        value={summary.totalRequests > 0 ? formatNumber(summary.totalTokens) : (summary.totalConversations > 0 ? "—" : "0")}
        icon={<Zap size={20} />}
        trend={summary.previousPeriod ? calcTrend(summary.totalTokens, summary.previousPeriod.totalTokens) : undefined}
        subtext={summary.totalRequests > 0 ? `${formatNumber(summary.inputTokens)} Girdi | ${formatNumber(summary.outputTokens)} Çıktı` : "Veri yok"}
      />

      {showCosts && (
        <StatCard
          label="AI Maliyeti (USD)"
          value={summary.totalRequests > 0 ? `$${summary.totalCostUsd.toFixed(2)}` : (summary.totalConversations > 0 ? "—" : "$0.00")}
          icon={<DollarSign size={20} />}
          trend={summary.previousPeriod ? calcTrend(summary.totalCostUsd, summary.previousPeriod.totalCostUsd) : undefined}
          subtext={summary.totalRequests > 0 ? `Ortalama $${summary.avgCostPerRequest.toFixed(4)} / istek` : "Veri yok"}
        />
      )}

      <StatCard
        label="Ortalama Yanıt Süresi"
        value={summary.totalRequests > 0 ? `${(summary.avgDurationMs / 1000).toFixed(2)}s` : "—"}
        icon={<Clock size={20} />}
      />
      
      {showCosts && summary.totalRequests > 0 && (
        <StatCard
          label="Tasarruf Edilen (Önbellek)"
          value={formatNumber(summary.cachedInputTokens)}
          icon={<Target size={20} />}
          subtext="Prompt Caching ile sağlanan token tasarrufu"
        />
      )}
    </div>
  );
}
