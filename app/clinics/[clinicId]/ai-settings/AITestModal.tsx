"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { Loader2, Send, Trash2, Bot, User, AlertCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";
import type { PromptSettings } from "@/lib/types";

interface Message {
  role: "user" | "assistant";
  content: string;
  quickReplies?: string[];
}

interface AITestModalProps {
  isOpen: boolean;
  onClose: () => void;
  clinicId: string;
  clinicName: string;
  language: string;
  settings: PromptSettings;
}

export default function AITestModal({ isOpen, onClose, clinicId, clinicName, language, settings }: AITestModalProps) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Duplicate request prevention
  const activeRequestId = useRef<string | null>(null);
  const isSending = useRef(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Auto-dismiss error after 8 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleSend = useCallback(async (contentOverride?: string) => {
    const messageContent = contentOverride || input;
    if (!messageContent.trim() || isLoading) return;

    // Prevent duplicate submissions (Enter + click, double-click, etc.)
    if (isSending.current) return;
    isSending.current = true;

    // clinicId validation — do NOT call API without it
    if (!clinicId) {
      setError(t("aiSettings.testErrorNoClinic"));
      isSending.current = false;
      return;
    }

    // Generate unique requestId for this message
    const requestId = `test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // If a request is already in flight, reject
    if (activeRequestId.current) {
      isSending.current = false;
      return;
    }
    activeRequestId.current = requestId;

    const userMessage: Message = { role: "user", content: messageContent };
    const updatedMessages = [...messages, userMessage];
    
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinicId,
          messages: updatedMessages,
          settings: settings,
          language: language || "tr",
          source: "prompt_studio_test",
          patientConsent: true,
          requestId,
        }),
      });

      // Check if this request was superseded
      if (activeRequestId.current !== requestId) {
        return; // A newer request took over
      }

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t("aiSettings.testError"));
      }

      const assistantMessage: Message = {
        role: "assistant",
        content: data.message,
        quickReplies: data.quickReplies,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      console.error("AI Test failed:", err.message);
      // Show error as alert toast, NOT as a chat message
      setError(err.message || t("aiSettings.testError"));
    } finally {
      setIsLoading(false);
      activeRequestId.current = null;
      isSending.current = false;
    }
  }, [input, isLoading, clinicId, messages, settings, language, t]);

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("aiSettings.testPlayground")}
      width={600}
    >
      <div style={{ display: "flex", flexDirection: "column", height: "60vh" }}>
        <p style={{ color: UI_COLORS.textSecondary, fontSize: 14, marginBottom: 12 }}>
          {t("aiSettings.testSubtitle")}
        </p>

        {/* Clinic context indicator */}
        {clinicName && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px", marginBottom: 12,
            background: "rgba(99, 102, 241, 0.06)",
            borderRadius: 8, fontSize: 12, color: UI_COLORS.textMuted,
            border: `1px solid rgba(99, 102, 241, 0.15)`,
          }}>
            <Bot size={13} />
            <span>{clinicName}</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span style={{ textTransform: "uppercase", fontSize: 10.5, fontWeight: 600 }}>
              {language || "tr"}
            </span>
          </div>
        )}

        {/* Error Alert — shown as separate toast, NOT inside chat */}
        {error && (
          <div style={{ 
            display: "flex", 
            alignItems: "flex-start", 
            gap: 10, 
            color: UI_COLORS.danger, 
            fontSize: 13,
            padding: "12px 14px",
            marginBottom: 12,
            background: "rgba(239, 68, 68, 0.06)",
            borderRadius: 10,
            border: `1px solid rgba(239, 68, 68, 0.2)`,
            lineHeight: 1.45,
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong style={{ fontSize: 12, display: "block", marginBottom: 2 }}>Hata</strong>
              {error}
            </div>
          </div>
        )}

        {/* Chat Area */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px",
            background: UI_COLORS.bgPage,
            borderRadius: 12,
            border: `1px solid ${UI_COLORS.border}`,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {messages.length === 0 && !isLoading && (
            <div style={{ 
              height: "100%", 
              display: "flex", 
              flexDirection: "column", 
              alignItems: "center", 
              justifyContent: "center",
              color: UI_COLORS.textMuted,
              gap: 12,
              opacity: 0.6
            }}>
              <Bot size={48} strokeWidth={1.5} />
              <p style={{ fontSize: 14 }}>{t("aiSettings.typeMessage")}</p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                gap: 6,
              }}
            >
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: 6, 
                fontSize: 12, 
                fontWeight: 600, 
                color: UI_COLORS.textMuted,
                marginBottom: 2
              }}>
                {msg.role === "assistant" ? <Bot size={14} /> : <User size={14} />}
                {msg.role === "assistant" ? t("aiSettings.assistant") : t("aiSettings.user")}
              </div>
              <div
                style={{
                  maxWidth: "85%",
                  padding: "12px 16px",
                  borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                  background: msg.role === "user" ? UI_COLORS.brand : UI_COLORS.bgCard,
                  color: msg.role === "user" ? "#fff" : UI_COLORS.textPrimary,
                  fontSize: 14.5,
                  lineHeight: 1.5,
                  boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
                  border: msg.role === "assistant" ? `1px solid ${UI_COLORS.border}` : "none",
                  whiteSpace: "pre-wrap",
                }}
              >
                {msg.content}
              </div>
              
              {msg.quickReplies && msg.quickReplies.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                  {msg.quickReplies.map((reply, ridx) => (
                    <button
                      key={ridx}
                      onClick={() => handleSend(reply)}
                      disabled={isLoading}
                      style={{
                        background: UI_COLORS.bgCard,
                        border: `1px solid ${UI_COLORS.brand}40`,
                        color: UI_COLORS.brand,
                        padding: "6px 12px",
                        borderRadius: 100,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                    >
                      {reply}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: UI_COLORS.textMuted, fontSize: 13 }}>
              <div style={{ 
                padding: "12px 16px", 
                background: UI_COLORS.bgCard, 
                borderRadius: "16px 16px 16px 4px",
                border: `1px solid ${UI_COLORS.border}`,
                display: "flex",
                alignItems: "center",
                gap: 8
              }}>
                <Loader2 size={16} className="animate-spin" />
                <span>{t("aiSettings.waitingAI")}</span>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "flex-end" }}>
          <Button
            onClick={clearChat}
            variant="ghost"
            style={{ color: UI_COLORS.danger, padding: "0 12px", height: 42 }}
            title={t("aiSettings.clearChat")}
          >
            <Trash2 size={18} />
          </Button>
          <div style={{ flex: 1 }}>
            <Input
              placeholder={t("aiSettings.typeMessage")}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
            />
          </div>
          <Button
            onClick={() => handleSend()}
            isLoading={isLoading}
            disabled={!input.trim() || isLoading}
            style={{ height: 42, minWidth: 42, padding: 0, borderRadius: 10 }}
          >
            <Send size={18} />
          </Button>
        </div>
      </div>

      <style>{`
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </Modal>
  );
}
