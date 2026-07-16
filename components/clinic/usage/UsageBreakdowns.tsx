"use client";

import React from "react";
import SectionCard from "@/components/ui/SectionCard";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";
import type { AIUsageBreakdowns, AIUsageBreakdownItem } from "@/lib/types/aiUsage";
import { formatNumber } from "@/lib/utils";

interface Props {
  breakdowns: AIUsageBreakdowns;
  showCosts: boolean;
}

function BreakdownTable({ title, data, showCosts }: { title: string; data: AIUsageBreakdownItem[]; showCosts: boolean }) {
  if (!data || data.length === 0) return null;
  
  return (
    <div style={{ flex: 1, minWidth: 300 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: UI_COLORS.textPrimary, marginBottom: 12 }}>
        {title}
      </h3>
      <div style={{ 
        border: `1px solid ${UI_COLORS.border}`, 
        borderRadius: UI_COMMON_STYLES.radius,
        overflow: "hidden" 
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
          <thead>
            <tr style={{ background: "rgba(0,0,0,0.02)", borderBottom: `1px solid ${UI_COLORS.border}` }}>
              <th style={{ padding: "10px 12px", color: UI_COLORS.textSecondary, fontWeight: 600 }}>Tip</th>
              <th style={{ padding: "10px 12px", color: UI_COLORS.textSecondary, fontWeight: 600, textAlign: "right" }}>İstek</th>
              <th style={{ padding: "10px 12px", color: UI_COLORS.textSecondary, fontWeight: 600, textAlign: "right" }}>Token</th>
              {showCosts && (
                <th style={{ padding: "10px 12px", color: UI_COLORS.textSecondary, fontWeight: 600, textAlign: "right" }}>Maliyet</th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.map((item, idx) => (
              <tr key={item.key} style={{ borderBottom: idx < data.length - 1 ? `1px solid ${UI_COLORS.border}` : "none" }}>
                <td style={{ padding: "10px 12px", color: UI_COLORS.textPrimary, fontWeight: 500 }}>
                  {item.label}
                </td>
                <td style={{ padding: "10px 12px", color: UI_COLORS.textSecondary, textAlign: "right" }}>
                  {formatNumber(item.requestCount)}
                </td>
                <td style={{ padding: "10px 12px", color: UI_COLORS.textSecondary, textAlign: "right" }}>
                  {formatNumber(item.totalTokens)}
                </td>
                {showCosts && (
                  <td style={{ padding: "10px 12px", color: UI_COLORS.textPrimary, fontWeight: 500, textAlign: "right" }}>
                    ${item.totalCostUsd.toFixed(2)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function UsageBreakdowns({ breakdowns, showCosts }: Props) {
  return (
    <SectionCard title="Kullanım Kırılımları">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
        <BreakdownTable title="Modele Göre" data={breakdowns.byModel} showCosts={showCosts} />
        <BreakdownTable title="Kanala Göre" data={breakdowns.byChannel} showCosts={showCosts} />
        <BreakdownTable title="İstek Türüne Göre" data={breakdowns.byRequestType} showCosts={showCosts} />
        <BreakdownTable title="Dile Göre" data={breakdowns.byLanguage} showCosts={showCosts} />
      </div>
    </SectionCard>
  );
}
