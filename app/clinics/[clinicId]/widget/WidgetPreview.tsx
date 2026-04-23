"use client";

import React, { useState, useEffect, useRef } from "react";
import { MessageSquare, Send, RotateCcw, X, User, Shield } from "lucide-react";
import { UI_COLORS } from "@/components/ui/ui-shared";
import type { WidgetSettings } from "@/lib/types";

interface Message {
  id: string;
  text: string;
  sender: "user" | "bot";
  timestamp: Date;
}

interface WidgetPreviewProps {
  settings: WidgetSettings;
}

const QUICK_QUESTIONS = [
  "Randevu nasıl alabilirim?",
  "Muayene ücretiniz nedir?",
  "Klinik nerede?",
  "Çalışma saatleriniz nedir?"
];

export default function WidgetPreview({ settings }: WidgetPreviewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [hasConsent, setHasConsent] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const consent = sessionStorage.getItem("patientConsent");
    if (consent === "true") setHasConsent(true);
    else if (consent === "false") setHasConsent(false);
  }, []);

  useEffect(() => {
    if (hasConsent === true) {
      setMessages([
        {
          id: "1",
          text: settings.welcomeMessage || "Merhaba! Size nasıl yardımcı olabilirim?",
          sender: "bot",
          timestamp: new Date(),
        },
      ]);
    } else if (hasConsent === false) {
      setMessages([
        {
          id: "1",
          text: "KVKK onayı olmadan asistan hizmeti kullanılamaz. Görüşmeye başlamak için sayfayı yenileyip onay verebilirsiniz.",
          sender: "bot",
          timestamp: new Date(),
        },
      ]);
    }
  }, [settings.welcomeMessage, hasConsent]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = (overrideText?: string) => {
    const textToSend = overrideText || inputValue;
    if (hasConsent !== true || !textToSend.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: textToSend,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!overrideText) {
      setInputValue("");
    }
    setIsTyping(true);

    // Mock bot response
    setTimeout(() => {
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: "Bu bir önizleme modudur. Gerçek asistanınız burada verdiğiniz bilgilere göre yanıt verecektir.",
        sender: "bot",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botMsg]);
      setIsTyping(false);
    }, 1500);
  };

  const resetChat = () => {
    if (hasConsent !== true) return;
    setMessages([
      {
        id: "1",
        text: settings.welcomeMessage || "Merhaba! Size nasıl yardımcı olabilirim?",
        sender: "bot",
        timestamp: new Date(),
      },
    ]);
  };

  return (
    <div style={{
      width: "100%",
      height: "600px",
      background: "rgba(0, 0, 0, 0.05)",
      borderRadius: 24,
      border: `1px solid ${UI_COLORS.border}`,
      position: "relative",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    }}>
      {/* Background Decor */}
      <div style={{ position: "absolute", top: 20, left: 20, fontSize: 12, fontWeight: 700, color: UI_COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>
        Live Preview Area
      </div>
      
      <button 
        onClick={resetChat}
        style={{ 
          position: "absolute", top: 16, right: 16, 
          background: "rgba(255,255,255,0.05)", border: "none", borderRadius: 8, 
          padding: "8px 12px", color: UI_COLORS.textSecondary, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
          transition: "all 0.2s"
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
        onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
      >
        <RotateCcw size={14} />
        Reset
      </button>

      {/* Widget Container */}
      <div style={{
        width: 360,
        height: 500,
        background: "var(--bg-card)",
        borderRadius: 20,
        boxShadow: "0 20px 40px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}>
        {/* Widget Header */}
        <div style={{
          padding: "16px 20px",
          background: settings.primaryColor || UI_COLORS.brand,
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {settings.showAvatar && (
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <User size={20} />
              </div>
            )}
            <div>
              <p style={{ fontSize: 15, fontWeight: 700 }}>{settings.title || "Clinic Assistant"}</p>
              {settings.showOnlineStatus && (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
                  <span style={{ fontSize: 11, opacity: 0.8 }}>Online</span>
                </div>
              )}
            </div>
          </div>
          <X size={20} style={{ opacity: 0.6, cursor: "not-allowed" }} />
        </div>

        {/* Chat Area */}
        <div 
          ref={scrollRef}
          style={{
            flex: 1,
            padding: 20,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            background: "var(--bg-page)",
            position: "relative"
          }}
        >
          {hasConsent === null ? (
            <div style={{
              position: "absolute",
              top: 0, left: 0, right: 0, bottom: 0,
              background: UI_COLORS.bgCard,
              zIndex: 10,
              padding: 24,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center"
            }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(99, 102, 241, 0.1)", color: UI_COLORS.brand, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <Shield size={24} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 8 }}>KVKK ve Gizlilik</h3>
              <p style={{ fontSize: 13, color: UI_COLORS.textSecondary, lineHeight: 1.5, marginBottom: 24 }}>
                Yapay zekâ asistanımızla yapacağınız görüşmelerde sağladığınız sağlık verileriniz hizmet kalitesi amacıyla işlenebilir.
                Detaylı bilgi için <a href="/kvkk" target="_blank" style={{ color: UI_COLORS.brand, textDecoration: "none" }}>Aydınlatma Metni</a>'ni inceleyebilirsiniz.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button 
                  onClick={() => {
                    sessionStorage.setItem("patientConsent", "true");
                    setHasConsent(true);
                  }}
                  style={{
                    background: settings.primaryColor || UI_COLORS.brand,
                    color: "white", padding: "10px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer"
                  }}>
                  Kabul Ediyorum ve Devam Et
                </button>
                <button 
                  onClick={() => {
                    sessionStorage.setItem("patientConsent", "false");
                    setHasConsent(false);
                  }}
                  style={{
                    background: "transparent", color: UI_COLORS.textSecondary, padding: "10px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: `1px solid ${UI_COLORS.border}`, cursor: "pointer"
                  }}>
                  Reddet
                </button>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div 
                  key={msg.id}
                  style={{
                    alignSelf: msg.sender === "user" ? "flex-end" : "flex-start",
                    maxWidth: "85%",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4
                  }}
                >
                  <div style={{
                    padding: "10px 14px",
                    borderRadius: msg.sender === "user" ? "16px 16px 2px 16px" : "16px 16px 16px 2px",
                    background: msg.sender === "user" ? settings.primaryColor : "rgba(255,255,255,0.05)",
                    color: msg.sender === "user" ? "white" : "var(--text-primary)",
                    fontSize: 14,
                    lineHeight: "1.5",
                    boxShadow: msg.sender === "user" ? "0 4px 10px rgba(0,0,0,0.1)" : "none",
                    border: msg.sender === "bot" ? `1px solid ${UI_COLORS.border}` : "none"
                  }}>
                    {msg.text}
                  </div>
                  <span style={{ fontSize: 10, color: UI_COLORS.textMuted, alignSelf: msg.sender === "user" ? "flex-end" : "flex-start" }}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
              {isTyping && (
                <div style={{ alignSelf: "flex-start", background: "rgba(255,255,255,0.05)", padding: "10px 14px", borderRadius: "16px 16px 16px 2px", display: "flex", gap: 4 }}>
                  <div className="typing-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: UI_COLORS.textMuted }} />
                  <div className="typing-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: UI_COLORS.textMuted }} />
                  <div className="typing-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: UI_COLORS.textMuted }} />
                </div>
              )}
            </>
          )}
        </div>

        {/* Input Area */}
        <div style={{ padding: "12px 16px 16px 16px", borderTop: `1px solid ${UI_COLORS.border}`, background: "var(--bg-card)", display: "flex", flexDirection: "column", gap: 12 }}>
          
          {/* Quick Questions */}
          <div 
            className="hide-scrollbar"
            style={{ 
              display: "flex", 
              gap: 8, 
              overflowX: "auto",
              paddingBottom: 2,
              opacity: hasConsent !== true ? 0.3 : 1,
              pointerEvents: hasConsent !== true ? "none" : "auto"
            }}
          >
            {QUICK_QUESTIONS.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(q)}
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: `1px solid ${settings.primaryColor || UI_COLORS.brand}40`,
                  color: settings.primaryColor || UI_COLORS.brand,
                  padding: "6px 12px",
                  borderRadius: 100,
                  fontSize: 12,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `${settings.primaryColor || UI_COLORS.brand}15`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                }}
              >
                {q}
              </button>
            ))}
          </div>

          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: 10,
            background: "rgba(0,0,0,0.2)",
            borderRadius: 12,
            padding: "8px 12px",
            border: `1px solid ${UI_COLORS.border}`
          }}>
            <input 
              type="text"
              placeholder={hasConsent === false ? "KVKK onayı gerekli" : (settings.placeholder || "Bir mesaj yazın...")}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              disabled={hasConsent !== true}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                color: "var(--text-primary)",
                fontSize: 14,
                outline: "none",
                opacity: hasConsent !== true ? 0.5 : 1
              }}
            />
            <button 
              onClick={handleSend}
              disabled={hasConsent !== true}
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: hasConsent !== true ? "transparent" : settings.primaryColor,
                color: hasConsent !== true ? UI_COLORS.textMuted : "white",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: hasConsent !== true ? "not-allowed" : "pointer"
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Floating Action Hint */}
      <div 
        style={{
          position: "absolute",
          bottom: 40,
          right: 40,
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: settings.primaryColor,
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
          cursor: "not-allowed",
          opacity: settings.position === "bottom-right" ? 1 : 0.2,
          transition: "all 0.3s ease"
        }}
      >
        <MessageSquare size={24} />
      </div>

      <div 
        style={{
          position: "absolute",
          bottom: 40,
          left: 40,
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: settings.primaryColor,
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
          cursor: "not-allowed",
          opacity: settings.position === "bottom-left" ? 1 : 0.2,
          transition: "all 0.3s ease"
        }}
      >
        <MessageSquare size={24} />
      </div>

      <style>{`
        @keyframes typing {
          0%, 100% { opacity: 0.3; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-2px); }
        }
        .typing-dot {
          animation: typing 1s infinite;
        }
        .typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-dot:nth-child(3) { animation-delay: 0.4s; }
        
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
