import React, { useState, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";
import { AlertCircle, Loader2 } from "lucide-react";
import { ConversationLog, ConversationMessage } from "./types";
import { useI18n } from "@/lib/i18n-context";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  log: ConversationLog | null;
}

function formatTime(isoStr: string) {
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return "";
  }
}

export default function ConversationLogDetailModal({ isOpen, onClose, log }: Props) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !log?.id || !log?.clinicId) return;

    setLoading(true);
    const q = query(
      collection(db, "clinics", log.clinicId, "conversationLogs", log.id, "messages"),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() } as ConversationMessage));
      setMessages(msgs);
      setLoading(false);
    });

    return () => unsub();
  }, [isOpen, log?.id, log?.clinicId]);

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
          <Badge variant={log.status === "answered" ? "resolved" : log.status === "appointment" ? "pro" : log.status === "liveSupport" ? "open" : "failed"} />
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

        {/* Live Support Banner */}
        {log.status === "liveSupport" && (
          <div style={{ 
            background: "rgba(59, 130, 246, 0.05)", 
            border: `1px solid rgba(59, 130, 246, 0.2)`, 
            borderRadius: UI_COMMON_STYLES.radius,
            padding: 14,
            display: "flex",
            gap: 12,
            alignItems: "center"
          }}>
            <span style={{ fontSize: 20 }}>📡</span>
            <div>
              <p style={{ fontSize: 13.5, fontWeight: 600, color: "#3b82f6", marginBottom: 2 }}>
                Canlı Destek Gerekli
              </p>
              <p style={{ fontSize: 12.5, color: UI_COLORS.textSecondary, lineHeight: 1.5 }}>
                Bu görüşmede kullanıcıya canlı destek yönlendirmesi gösterildi. Mesaj geçmişinde eylem loglarını inceleyebilirsiniz.
              </p>
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
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: UI_COLORS.textMuted }}>
              <Loader2 size={32} style={{ margin: "0 auto", animation: "spin 1s linear infinite" }} />
            </div>
          ) : messages.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: UI_COLORS.textMuted, fontSize: 13.5 }}>
              Henüz mesaj yok.
            </div>
          ) : (
            messages.map((msg) => {
              const isPatient = msg.sender === "patient";
              const isSystem = msg.sender === "system";

              if (isSystem) {
                const isWhatsAppAction  = msg.content.includes("WhatsApp");
                const isTelegramAction  = msg.content.includes("Telegram");
                const isSurveyDisplayed = msg.content.includes("Memnuniyet Anketi Gösterildi");
                const isSurveySubmitted = msg.content.includes("Memnuniyet Anketi Yanıtlandı");
                const isLiveSupportGeneric =
                  !isWhatsAppAction && !isTelegramAction && !isSurveyDisplayed && !isSurveySubmitted &&
                  (msg.content.includes("Canlı Destek") ||
                   msg.content.includes("Yönlendirme") ||
                   msg.content.includes("Yönlendirildi"));

                const badgeColor = isWhatsAppAction  ? "#25D366"
                  : isTelegramAction  ? "#26A5E4"
                  : isSurveySubmitted ? "#F59E0B"
                  : isSurveyDisplayed ? "#D97706"
                  : isLiveSupportGeneric ? "#10b981"
                  : UI_COLORS.textMuted;

                const badgeBg = isWhatsAppAction  ? "rgba(37,211,102,0.08)"
                  : isTelegramAction  ? "rgba(38,165,228,0.08)"
                  : isSurveySubmitted ? "rgba(245,158,11,0.1)"
                  : isSurveyDisplayed ? "rgba(217,119,6,0.08)"
                  : isLiveSupportGeneric ? "rgba(16,185,129,0.08)"
                  : UI_COLORS.bgCard;

                const badgeBorder = isWhatsAppAction  ? "rgba(37,211,102,0.25)"
                  : isTelegramAction  ? "rgba(38,165,228,0.25)"
                  : isSurveySubmitted ? "rgba(245,158,11,0.35)"
                  : isSurveyDisplayed ? "rgba(217,119,6,0.25)"
                  : isLiveSupportGeneric ? "rgba(16,185,129,0.25)"
                  : UI_COLORS.border;

                const icon = isWhatsAppAction  ? "📱"
                  : isTelegramAction  ? "✈️"
                  : isSurveySubmitted ? "⭐"
                  : isSurveyDisplayed ? "📋"
                  : isLiveSupportGeneric ? "📡"
                  : "⚙️";

                return (
                  <div key={msg.id} style={{ textAlign: "center", margin: "8px 0" }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: badgeColor,
                      background: badgeBg,
                      padding: "4px 12px",
                      borderRadius: 12,
                      border: `1px solid ${badgeBorder}`,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}>
                      {icon} {msg.content}
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
            })
          )}
        </div>

      </div>
    </Modal>
  );
}
