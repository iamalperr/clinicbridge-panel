import React, { useState, useEffect, useRef } from "react";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";
import { AlertCircle, Loader2 } from "lucide-react";
import { ConversationLog, ConversationMessage } from "./types";
import { useI18n } from "@/lib/i18n-context";
import { auth } from "@/lib/firebase";
import {
  normalizeConversationStatus,
  getConversationStatusLabel,
  getConversationStatusVariant,
  isConversationManuallyConverted,
} from "@/lib/services/conversations/conversationStatusResolver";

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
  const { t, language } = useI18n();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [messageCount, setMessageCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen || !log?.id || !log?.clinicId) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setMessages([]);
      setMessageCount(null);
      try {
        const user = auth.currentUser;
        if (!user) {
          throw new Error(language === "en" ? "Not signed in." : "Oturum bulunamadı.");
        }
        const token = await user.getIdToken();
        const res = await fetch(
          `/api/clinics/${encodeURIComponent(log.clinicId)}/conversations/${encodeURIComponent(log.id)}/messages`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            body?.error ||
              (language === "en"
                ? "Failed to load conversation messages."
                : "Görüşme mesajları yüklenemedi.")
          );
        }
        const data = await res.json();
        if (cancelled) return;
        const msgs = (Array.isArray(data.messages) ? data.messages : []).map(
          (m: any, idx: number) =>
            ({
              id: m.id || `msg_${idx}`,
              sender:
                m.sender ||
                (m.role === "user"
                  ? "patient"
                  : m.role === "system"
                    ? "system"
                    : "assistant"),
              content: m.content || "",
              createdAt: m.createdAt || "",
              wasAnswered: m.wasAnswered !== false,
              needsTraining: Boolean(m.needsTraining),
            }) as ConversationMessage
        );
        // No last-two slicing — render the full canonical transcript.
        setMessages(msgs);
        setMessageCount(
          typeof data.messageCount === "number" ? data.messageCount : msgs.length
        );
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Error");
          setMessages([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, log?.id, log?.clinicId, language]);

  useEffect(() => {
    if (loading || messages.length === 0) return;
    // After full list renders, scroll to newest message; user can scroll up for earlier turns.
    requestAnimationFrame(() => {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }, [loading, messages.length]);

  if (!log) return null;

  const normalizedStatus = normalizeConversationStatus(log.status, {
    convertedToAppointment: log.convertedToAppointment,
    appointmentId: log.appointmentId,
  });
  const statusLabel = getConversationStatusLabel(normalizedStatus, language);
  const statusVariant = getConversationStatusVariant(normalizedStatus);
  const displayCount = messageCount ?? log.totalMessages;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("logs.detailTitle") || (language === "en" ? "Conversation Details" : "Görüşme Detayı")} width={600}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxHeight: "min(80vh, 720px)" }}>
        
        {/* Header Info */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <div>
            <span style={{ fontSize: 12, color: UI_COLORS.textMuted }}>{t("logs.patient") || (language === "en" ? "Patient" : "Hasta")}: </span>
            <strong style={{ fontSize: 14, color: UI_COLORS.textPrimary }}>{log.patientName || (language === "en" ? "Anonymous Visitor" : "Anonim Ziyaretçi")}</strong>
          </div>
          {log.patientPhone && (
            <div>
              <span style={{ fontSize: 12, color: UI_COLORS.textMuted }}>{t("logs.phone") || (language === "en" ? "Phone" : "Telefon")}: </span>
              <span style={{ fontSize: 14, color: UI_COLORS.textPrimary }}>{log.patientPhone}</span>
            </div>
          )}
          <Badge variant={statusVariant} label={statusLabel} />
          <span style={{ fontSize: 12, color: UI_COLORS.textMuted }}>
            {displayCount} {t("logs.messages") || (language === "en" ? "messages" : "mesaj")}
          </span>
          {isConversationManuallyConverted(log) ? (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 9px", borderRadius: 99,
              fontSize: 11, fontWeight: 600,
              background: "rgba(139, 92, 246, 0.1)",
              color: "#8b5cf6",
              border: "1px solid rgba(139, 92, 246, 0.2)",
            }}>
              🏷️ {language === "en" ? "Converted to Appointment" : "Randevuya Dönüştü"}
            </span>
          ) : (log.customLabelId && log.customLabelName ? (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 9px", borderRadius: 99,
              fontSize: 11, fontWeight: 600,
              background: "rgba(139, 92, 246, 0.1)",
              color: "#8b5cf6",
              border: "1px solid rgba(139, 92, 246, 0.2)",
            }}>
              🏷️ {log.customLabelName}
            </span>
          ) : null)}
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
                {t("logs.needsTrainingTopic") || (language === "en" ? "Topic needing training" : "Eğitime İhtiyaç Duyulan Konu")}
              </h4>
              <p style={{ fontSize: 13, color: UI_COLORS.textSecondary, marginBottom: 8 }}>
                {t("logs.needsTrainingDesc") || (language === "en" ? "It is recommended to add information for this topic from the AI Rules or Training tab." : "Bu soru için AI Kuralları veya Eğitim sekmesinden bilgi eklemeniz önerilir.")}
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
        {normalizedStatus === "live_support_required" && (
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
                {language === "en" ? "Live Support Required" : "Canlı Destek Gerekli"}
              </p>
              <p style={{ fontSize: 12.5, color: UI_COLORS.textSecondary, lineHeight: 1.5 }}>
                {language === "en"
                  ? "A live support prompt or action was triggered in this conversation. Review the message history for system action events."
                  : "Bu görüşmede kullanıcıya canlı destek yönlendirmesi gösterildi. Mesaj geçmişinde eylem loglarını inceleyebilirsiniz."}
              </p>
            </div>
          </div>
        )}


        {/* Chat Area — vertically scrollable; header stays above */}
        <div
          ref={chatScrollRef}
          data-testid="conversation-detail-scroll"
          style={{ 
          background: "var(--bg-app)", 
          border: `1px solid ${UI_COLORS.border}`, 
          borderRadius: UI_COMMON_STYLES.radius,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          flex: 1,
          minHeight: 280,
          maxHeight: "min(55vh, 480px)",
          overflowY: "auto"
        }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: UI_COLORS.textMuted }}>
              <Loader2 size={32} style={{ margin: "0 auto", animation: "spin 1s linear infinite" }} />
            </div>
          ) : error ? (
            <div style={{ padding: 40, textAlign: "center", color: UI_COLORS.danger, fontSize: 13.5 }}>
              {error}
            </div>
          ) : messages.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: UI_COLORS.textMuted, fontSize: 13.5 }}>
              {language === "en" ? "No messages yet." : "Henüz mesaj yok."}
            </div>
          ) : (
            messages.map((msg) => {
              const isPatient = msg.sender === "patient";
              const isSystem = msg.sender === "system";

              if (isSystem) {
                const isWhatsAppAction  = msg.content.includes("WhatsApp");
                const isTelegramAction  = msg.content.includes("Telegram");
                const isSurveyDisplayed = msg.content.includes("Memnuniyet Anketi Gösterildi") || msg.content.includes("Survey Displayed");
                const isSurveySubmitted = msg.content.includes("Memnuniyet Anketi Yanıtlandı") || msg.content.includes("Survey Submitted");
                const isLiveSupportGeneric =
                  !isWhatsAppAction && !isTelegramAction && !isSurveyDisplayed && !isSurveySubmitted &&
                  (msg.content.includes("Canlı Destek") ||
                   msg.content.includes("Live Support") ||
                   msg.content.includes("Yönlendirme") ||
                   msg.content.includes("Yönlendirildi"));

                const badgeColor = isWhatsAppAction  ? "#25D366"
                  : isTelegramAction  ? "#26A5E4"
                  : isSurveySubmitted ? "#F59E0B"
                  : isSurveyDisplayed ? "#8B5CF6"
                  : isLiveSupportGeneric ? "#3B82F6"
                  : UI_COLORS.textMuted;

                return (
                  <div key={msg.id} style={{ display: "flex", justifyContent: "center" }}>
                    <div style={{
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: badgeColor,
                      background: `${badgeColor}14`,
                      border: `1px solid ${badgeColor}33`,
                      borderRadius: 99,
                      padding: "4px 12px",
                      textAlign: "center",
                      maxWidth: "90%",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}>
                      {msg.content}
                      {msg.createdAt && (
                        <span style={{ marginLeft: 8, opacity: 0.7, fontWeight: 500 }}>
                          {formatTime(msg.createdAt)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  style={{
                    display: "flex",
                    justifyContent: isPatient ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "78%",
                      padding: "10px 14px",
                      borderRadius: 14,
                      background: isPatient ? "rgba(16,185,129,0.15)" : UI_COLORS.bgCard,
                      border: `1px solid ${isPatient ? "rgba(16,185,129,0.25)" : UI_COLORS.border}`,
                      color: UI_COLORS.textPrimary,
                      fontSize: 13.5,
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 4 }}>
                      {isPatient
                        ? (language === "en" ? "Patient" : "Hasta")
                        : (language === "en" ? "Assistant" : "Asistan")}
                      {msg.createdAt ? ` · ${formatTime(msg.createdAt)}` : ""}
                    </div>
                    {msg.content}
                  </div>
                </div>
              );
            })
          )}
          <div ref={chatEndRef} />
        </div>
      </div>
    </Modal>
  );
}
