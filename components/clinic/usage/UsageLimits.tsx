"use client";

import React from "react";
import SectionCard from "@/components/ui/SectionCard";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";

interface Props {
  budgetLimitUsd?: number;
  currentCostUsd: number;
}

export default function UsageLimits({ budgetLimitUsd, currentCostUsd }: Props) {
  if (!budgetLimitUsd || budgetLimitUsd <= 0) return null;

  const pct = Math.min(100, Math.max(0, (currentCostUsd / budgetLimitUsd) * 100));
  
  let barColor = "#10b981"; // green
  if (pct >= 90) barColor = UI_COLORS.danger; // red
  else if (pct >= 70) barColor = "#f59e0b"; // yellow / orange

  return (
    <SectionCard title="Aylık Bütçe Kullanımı">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: UI_COLORS.textPrimary, lineHeight: 1 }}>
          ${currentCostUsd.toFixed(2)}
          <span style={{ fontSize: 14, fontWeight: 500, color: UI_COLORS.textMuted, marginLeft: 8 }}>
            / ${budgetLimitUsd.toFixed(2)}
          </span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: barColor }}>
          {pct.toFixed(1)}%
        </div>
      </div>
      
      <div style={{ 
        height: 8, 
        background: UI_COLORS.border, 
        borderRadius: 4, 
        overflow: "hidden",
        width: "100%"
      }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          background: barColor,
          transition: "width 0.5s ease-out, background-color 0.3s ease",
        }} />
      </div>
      
      {pct >= 90 && (
        <p style={{ fontSize: 12, color: UI_COLORS.danger, marginTop: 8, fontWeight: 500 }}>
          Uyarı: Aylık AI bütçe limitinize yaklaştınız. Limit aşıldığında sistem ayarlarına göre kısıtlama uygulanabilir.
        </p>
      )}
    </SectionCard>
  );
}
