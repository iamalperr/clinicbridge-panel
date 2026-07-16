"use client";

import React, { useState } from "react";
import SectionCard from "@/components/ui/SectionCard";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";
import type { AIUsageTimeseriesPoint } from "@/lib/types/aiUsage";
import { formatNumber } from "@/lib/utils";

interface Props {
  data: AIUsageTimeseriesPoint[];
  showCosts: boolean;
}

type MetricType = "conversationCount" | "messageCount" | "totalTokens" | "requestCount" | "totalCostUsd";

export default function UsageChart({ data, showCosts }: Props) {
  const [selectedMetric, setSelectedMetric] = useState<MetricType>("conversationCount");

  const values = data.map(d => d[selectedMetric]);
  const maxVal = Math.max(...values, 1); // Avoid division by zero
  const sumTokens = data.reduce((acc, curr) => acc + curr.totalTokens, 0);
  const sumConversations = data.reduce((acc, curr) => acc + curr.conversationCount, 0);

  const formatValue = (val: number, metric: MetricType) => {
    if (metric === "totalCostUsd") return `$${val.toFixed(2)}`;
    return formatNumber(val);
  };

  const getMetricLabel = (metric: MetricType) => {
    switch (metric) {
      case "totalCostUsd": return "Maliyet (USD)";
      case "totalTokens": return "Toplam Token";
      case "requestCount": return "İstek Sayısı";
    }
  };

  return (
    <SectionCard title="Kullanım Grafiği">
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        {(["conversationCount", "messageCount", "requestCount", "totalTokens"] as const).map(metric => (
          <button
            key={metric}
            onClick={() => setSelectedMetric(metric)}
            style={{
              padding: "6px 12px",
              borderRadius: 20,
              fontSize: 13,
              fontWeight: selectedMetric === metric ? 600 : 500,
              border: `1px solid ${selectedMetric === metric ? UI_COLORS.brand : UI_COLORS.border}`,
              background: selectedMetric === metric ? "rgba(99, 102, 241, 0.1)" : "transparent",
              color: selectedMetric === metric ? UI_COLORS.brand : UI_COLORS.textSecondary,
              cursor: "pointer",
              transition: UI_COMMON_STYLES.transition
            }}
          >
            {metric === "conversationCount" && "Görüşmeler"}
            {metric === "messageCount" && "Mesajlar"}
            {metric === "requestCount" && "AI İstekleri"}
            {metric === "totalTokens" && "Token Kullanımı"}
          </button>
        ))}
        {showCosts && (
          <button
            onClick={() => setSelectedMetric("totalCostUsd")}
            style={{
              padding: "6px 12px",
              borderRadius: 20,
              fontSize: 13,
              fontWeight: selectedMetric === "totalCostUsd" ? 600 : 500,
              border: `1px solid ${selectedMetric === "totalCostUsd" ? UI_COLORS.brand : UI_COLORS.border}`,
              background: selectedMetric === "totalCostUsd" ? "rgba(99, 102, 241, 0.1)" : "transparent",
              color: selectedMetric === "totalCostUsd" ? UI_COLORS.brand : UI_COLORS.textSecondary,
              cursor: "pointer",
              transition: UI_COMMON_STYLES.transition
            }}
          >
            Maliyet
          </button>
        )}
      </div>

      {data.length === 0 || (sumConversations === 0 && sumTokens === 0) ? (
        <div style={{ height: 250, display: "flex", alignItems: "center", justifyContent: "center", color: UI_COLORS.textMuted }}>
          Bu tarih aralığında henüz görüşme veya AI kullanım verisi bulunmuyor.
        </div>
      ) : (sumTokens === 0 && (selectedMetric === "totalTokens" || selectedMetric === "totalCostUsd" || selectedMetric === "requestCount")) ? (
        <div style={{ height: 250, display: "flex", alignItems: "center", justifyContent: "center", color: UI_COLORS.textMuted, textAlign: "center", padding: "0 20px" }}>
          Bu dönemde görüşme kayıtları bulunuyor ancak token ve maliyet takibi henüz mevcut değil. Lütfen "Görüşmeler" metriğini seçin.
        </div>
      ) : (
        <div style={{ height: 250, display: "flex", alignItems: "flex-end", gap: "2px", position: "relative", paddingTop: 20 }}>
          {/* Y Axis Guides */}
          <div style={{ position: "absolute", left: 0, right: 0, top: 20, borderTop: `1px dashed ${UI_COLORS.border}`, opacity: 0.5 }} />
          <div style={{ position: "absolute", left: 0, right: 0, top: "50%", borderTop: `1px dashed ${UI_COLORS.border}`, opacity: 0.5 }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 24, borderTop: `1px solid ${UI_COLORS.border}` }} />
          
          <div style={{ position: "absolute", left: 0, top: 0, fontSize: 11, color: UI_COLORS.textMuted }}>
            {formatValue(maxVal, selectedMetric)}
          </div>
          
          {data.map((point, idx) => {
            const val = point[selectedMetric];
            const heightPct = (val / maxVal) * 100;
            const dateStr = point.date.split("-").slice(1).join("/"); // MM/DD
            
            return (
              <div key={point.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div 
                  title={`${point.date}: ${formatValue(val, selectedMetric)}`}
                  style={{
                    width: "100%",
                    height: `${heightPct}%`,
                    background: UI_COLORS.brand,
                    borderTopLeftRadius: 4,
                    borderTopRightRadius: 4,
                    minHeight: val > 0 ? 4 : 0,
                    opacity: 0.8,
                    transition: "height 0.3s ease",
                    cursor: "pointer",
                    position: "relative",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.8"; }}
                />
                <div style={{ 
                  fontSize: 10, 
                  color: UI_COLORS.textMuted, 
                  marginTop: 6,
                  height: 18,
                  opacity: idx % Math.ceil(data.length / 10) === 0 ? 1 : 0 // Show fewer labels if too many data points
                }}>
                  {dateStr}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
