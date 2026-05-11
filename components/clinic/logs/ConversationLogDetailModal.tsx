import React from "react";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";
import { AlertCircle } from "lucide-react";
import { ConversationLog, ConversationMessage } from "./types";
import { useI18n } from "@/lib/i18n-context";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  log: ConversationLog | null;
  messages: ConversationMessage[];
}

function formatTime(isoStr: string) {
  const d = new Date(isoStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ConversationLogDetailModal({ isOpen, onClose, log, messages }: Props) {
  const { t } = useI18n();

  if (!log) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("logs.detailTitle") || "Görüşme Detayı"} width={600}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        
        {/* Header Info */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <div>
            <span style={{ fontSize: 12, color: UI_COLORS.textMuted }}>{t("logs.patient") || "Hasta"}: </span>
            <strong style={{ fontSize: 14, color: UI_COLORS.textPrimary }}>{log.patientName || "Anonim Ziyaretçi"}</strong>
          </div>
          {log.patientPhone && (
            <div>
              <span style={{ fontSize: 12, color: UI_COLORS.textMuted }}>{t("logs.phone") || "Telefon"}: </span>
              <span style={{ fontSize: 14, color: UI_COLORS.textPrimary }}>{log.patientPhone}</span>
            </div>
          )}
          <Badge variant={log.status === "answered" ? "resolved" : log.status === "converted_to_appointment" ? "pro" : log.status === "needs_live_support" ? "open" : "failed"} />
        </div>

        {/* Training Recommendation */}
        {log.needsTraining && (
          <div style={{ 
            background: "rgba(239, 68, 68, 0.05)", 
            border: `1px solid rgba(239, 68, 68, 0.2)`, 
            borderRadius: UI_COMMON_STYLES.radius,
            padding: 16,
            display: "flex",
            gap: 12,
            alignItems: "flex-start"
          }}>
            <AlertCircle size={20} color={UI_COLORS.danger} style={{ marginTop: 2 }} />
            <div>
              <h4 style={{ fontSize: 14, fontWeight: 600, color: UI_COLORS.danger, marginBottom: 4 }}>
                {t("logs.needsTrainingTopic") || "Eğitime İhtiyaç Duyulan Konu"}
              </h4>
              <p style={{ fontSize: 13, color: UI_COLORS.textSecondary, marginBottom: 8 }}>
                {t("logs.needsTrainingDesc") || "Bu soru için AI Kuralları veya Eğitim sekmesinden bilgi eklemeniz önerilir."}
              </p>
              {log.trainingTopic && (
                <div style={{ background: UI_COLORS.bgCard, padding: "8px 12px", borderRadius: 6, border: `1px solid ${UI_COLORS.border}`, fontSize: 13, fontWeight: 500 }}>
                  {log.trainingTopic}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Chat Area */}
        <div style={{ 
          background: "var(--bg-app)", 
          border: `1px solid ${UI_COLORS.border}`, 
          borderRadius: UI_COMMON_STYLES.radius,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          maxHeight: 400,
          overflowY: "auto"
        }}>
          {messages.map((msg) => {
            const isPatient = msg.sender === "patient";
            const isSystem = msg.sender === "system";

            if (isSystem) {
              return (
                <div key={msg.id} style={{ textAlign: "center", margin: "8px 0" }}>
                  <span style={{ 
                    fontSize: 11, 
                    fontWeight: 600, 
                    color: UI_COLORS.textMuted,
                    background: UI_COLORS.bgCard,
                    padding: "4px 12px",
                    borderRadius: 12,
                    border: `1px solid ${UI_COLORS.border}`
                  }}>
                    {msg.content}
                  </span>
                </div>
              );
            }

            return (
              <div key={msg.id} style={{ 
                display: "flex", 
                flexDirection: "column",
                alignItems: isPatient ? "flex-end" : "flex-start",
                gap: 4
              }}>
                <div style={{ 
                  background: isPatient ? UI_COLORS.brand : UI_COLORS.bgCard,
                  color: isPatient ? "white" : UI_COLORS.textPrimary,
                  padding: "10px 14px",
                  borderRadius: isPatient ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                  border: isPatient ? "none" : `1px solid ${UI_COLORS.border}`,
                  maxWidth: "80%",
                  fontSize: 14,
                  lineHeight: 1.5,
                  position: "relative"
                }}>
                  {msg.content}
                  {msg.needsTraining && !isPatient && (
                    <div style={{ position: "absolute", top: -8, right: -8 }}>
                      <AlertCircle size={16} fill={UI_COLORS.bgCard} color={UI_COLORS.danger} />
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: UI_COLORS.textMuted, padding: "0 4px" }}>
                  {isPatient ? (t("logs.patient") || "Hasta") : (t("logs.assistant") || "Asistan")} • {formatTime(msg.createdAt)}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </Modal>
  );
}
