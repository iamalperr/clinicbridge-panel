"use client";

import React, { useState } from "react";
import SectionCard from "@/components/ui/SectionCard";
import { Button } from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";
import type { AIUsageRecordRow } from "@/lib/types/aiUsage";
import { CHANNEL_LABELS, REQUEST_TYPE_LABELS } from "@/lib/types/aiUsage";
import { formatNumber } from "@/lib/utils";
import { Download, ChevronRight, Loader2 } from "lucide-react";

interface Props {
  records: AIUsageRecordRow[];
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  showCosts: boolean;
  onExportCsv: () => void;
}

export default function UsageRecordsTable({
  records,
  hasMore,
  isLoadingMore,
  onLoadMore,
  showCosts,
  onExportCsv
}: Props) {
  
  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return new Intl.DateTimeFormat("tr-TR", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit"
      }).format(d);
    } catch {
      return isoString;
    }
  };

  return (
    <SectionCard 
      title="İstek Kayıtları" 
      action={
        <Button variant="secondary" onClick={onExportCsv}>
          <Download size={14} /> CSV İndir
        </Button>
      }
    >
      {records.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: UI_COLORS.textMuted }}>
          Bu tarih aralığında kayıt bulunamadı.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${UI_COLORS.border}` }}>
                <th style={{ padding: "12px 16px", color: UI_COLORS.textSecondary, fontWeight: 600 }}>Tarih</th>
                <th style={{ padding: "12px 16px", color: UI_COLORS.textSecondary, fontWeight: 600 }}>İşlem / Kanal</th>
                <th style={{ padding: "12px 16px", color: UI_COLORS.textSecondary, fontWeight: 600 }}>Model</th>
                <th style={{ padding: "12px 16px", color: UI_COLORS.textSecondary, fontWeight: 600, textAlign: "right" }}>Token</th>
                {showCosts && (
                  <th style={{ padding: "12px 16px", color: UI_COLORS.textSecondary, fontWeight: 600, textAlign: "right" }}>Maliyet</th>
                )}
                <th style={{ padding: "12px 16px", color: UI_COLORS.textSecondary, fontWeight: 600, textAlign: "right" }}>Süre</th>
                <th style={{ padding: "12px 16px", color: UI_COLORS.textSecondary, fontWeight: 600, textAlign: "center" }}>Durum</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, idx) => (
                <tr key={r.id} style={{ borderBottom: idx < records.length - 1 ? `1px solid ${UI_COLORS.border}` : "none" }}>
                  <td style={{ padding: "12px 16px", color: UI_COLORS.textPrimary }}>
                    {formatDate(r.createdAt)}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ fontWeight: 500, color: UI_COLORS.textPrimary }}>
                      {REQUEST_TYPE_LABELS[r.requestType] || r.requestType}
                    </div>
                    <div style={{ fontSize: 11, color: UI_COLORS.textMuted, marginTop: 2 }}>
                      {CHANNEL_LABELS[r.channel] || r.channel}
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px", color: UI_COLORS.textSecondary }}>
                    {r.model}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <div style={{ fontWeight: 500, color: UI_COLORS.textPrimary }}>{formatNumber(r.totalTokens)}</div>
                    <div style={{ fontSize: 11, color: UI_COLORS.textMuted }}>
                      {r.inputTokens} in / {r.outputTokens} out
                    </div>
                  </td>
                  {showCosts && (
                    <td style={{ padding: "12px 16px", color: UI_COLORS.textPrimary, fontWeight: 500, textAlign: "right" }}>
                      ${r.totalCostUsd.toFixed(4)}
                    </td>
                  )}
                  <td style={{ padding: "12px 16px", color: UI_COLORS.textSecondary, textAlign: "right" }}>
                    {r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : "-"}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    <Badge variant={r.status === "success" ? "success" : "danger"} label={r.status === "success" ? "Başarılı" : "Hata"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {hasMore && (
            <div style={{ padding: "16px", display: "flex", justifyContent: "center", borderTop: `1px solid ${UI_COLORS.border}` }}>
              <Button variant="secondary" onClick={onLoadMore} disabled={isLoadingMore}>
                {isLoadingMore ? <><Loader2 size={16} className="animate-spin" /> Yükleniyor</> : "Daha Fazla Göster"}
              </Button>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
