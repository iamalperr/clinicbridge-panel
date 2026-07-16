"use client";

import React from "react";
import StatCard from "@/components/ui/StatCard";
import type { AIUsageSummary } from "@/lib/types/aiUsage";
import { DollarSign, MessageSquare, Zap, Target, Clock, Activity } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { useI18n } from "@/lib/i18n-context";

interface Props {
  summary: AIUsageSummary;
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
      {showCosts && (
        <StatCard
          label="Toplam Maliyet (USD)"
          value={`$${summary.totalCostUsd.toFixed(2)}`}
          icon={<DollarSign size={20} />}
          trend={summary.previousPeriod ? calcTrend(summary.totalCostUsd, summary.previousPeriod.totalCostUsd) : undefined}
          subtext={`Ortalama $${summary.avgCostPerRequest.toFixed(4)} / istek`}
        />
      )}
      
      <StatCard
        label="Toplam Token"
        value={formatNumber(summary.totalTokens)}
        icon={<Zap size={20} />}
        trend={summary.previousPeriod ? calcTrend(summary.totalTokens, summary.previousPeriod.totalTokens) : undefined}
        subtext={`${formatNumber(summary.inputTokens)} Girdi | ${formatNumber(summary.outputTokens)} Çıktı`}
      />

      <StatCard
        label="AI İstekleri"
        value={formatNumber(summary.totalRequests)}
        icon={<Activity size={20} />}
        trend={summary.previousPeriod ? calcTrend(summary.totalRequests, summary.previousPeriod.totalRequests) : undefined}
        subtext={`${formatNumber(summary.successfulRequests)} Başarılı | ${formatNumber(summary.failedRequests)} Başarısız`}
      />

      <StatCard
        label="AI Görüşmeleri"
        value={formatNumber(summary.totalConversations)}
        icon={<MessageSquare size={20} />}
        trend={summary.previousPeriod ? calcTrend(summary.totalConversations, summary.previousPeriod.totalConversations) : undefined}
        subtext={showCosts ? `Görüşme başı ortalama $${summary.avgCostPerConversation.toFixed(3)}` : undefined}
      />

      <StatCard
        label="Ortalama Yanıt Süresi"
        value={`${(summary.avgDurationMs / 1000).toFixed(2)}s`}
        icon={<Clock size={20} />}
      />
      
      {showCosts && (
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
