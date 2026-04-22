"use client";

import { useState, useRef, useEffect } from "react";
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
  settings: PromptSettings;
}

export default function AITestModal({ isOpen, onClose, clinicId, settings }: AITestModalProps) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async (contentOverride?: string) => {
    const messageContent = contentOverride || input;
    if (!messageContent.trim() || isLoading) return;

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
          messages: updatedMessages,
          settings: settings,
        }),
      });

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
      console.error("Test failed:", err);
      setError(err.message);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: settings.fallbackMessage },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("aiSettings.testPlayground")}
      width={600}
    >
      <div style={{ display: "flex", flexDirection: "column", height: "60vh" }}>
        <p style={{ color: UI_COLORS.textSecondary, fontSize: 14, marginBottom: 20 }}>
          {t("aiSettings.testSubtitle")}
        </p>

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

          {error && (
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: 8, 
              color: UI_COLORS.danger, 
              fontSize: 13,
              padding: "10px 12px",
              background: "rgba(239, 68, 68, 0.05)",
              borderRadius: 8,
              border: `1px solid ${UI_COLORS.danger}20`
            }}>
              <AlertCircle size={16} />
              {error}
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
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              disabled={isLoading}
            />
          </div>
          <Button
            onClick={() => handleSend()}
            isLoading={isLoading}
            disabled={!input.trim()}
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
