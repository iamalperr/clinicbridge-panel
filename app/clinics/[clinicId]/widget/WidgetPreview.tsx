"use client";

import React, { useState, useEffect, useRef } from "react";
import { Send, RotateCcw, X, User, Shield, Sparkles } from "lucide-react";
import { UI_COLORS } from "@/components/ui/ui-shared";
import type { WidgetSettings } from "@/lib/types";

interface Message {
  id: string;
  text: string;
  sender: "user" | "bot";
  timestamp: Date;
  isHandoff?: boolean;
}

interface WidgetPreviewProps {
  settings: WidgetSettings;
  clinicContact?: {
    whatsappNumber?: string;
    telegramUsername?: string;
    enableHumanHandoff?: boolean;
  };
}

const QUICK_QUESTIONS = [
  "Randevu nasıl alabilirim?",
  "Muayene ücretiniz nedir?",
  "Klinik nerede?",
  "Çalışma saatleriniz nedir?"
];

// ─── Floating CTA Button ─────────────────────────────────────────────────────
interface FloatingCTAProps {
  side: "right" | "left";
  active: boolean;
  primaryColor?: string;
}

function FloatingCTAButton({ side, active, primaryColor }: FloatingCTAProps) {
  const [showTooltip, setShowTooltip] = useState(true);
  const [tooltipExiting, setTooltipExiting] = useState(false);

  // Auto-dismiss tooltip after 3 s
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => {
      setTooltipExiting(true);
      setTimeout(() => setShowTooltip(false), 300);
    }, 3000);
    return () => clearTimeout(timer);
  }, [active]);

  const positionStyle: React.CSSProperties = {
    position: "absolute",
    bottom: 28,
    ...(side === "right" ? { right: 20 } : { left: 20 }),
  };

  return (
    <div style={positionStyle}>
      {/* Tooltip */}
      {active && showTooltip && (
        <div
          className={tooltipExiting ? "cta-pill-tooltip-exit" : "cta-pill-tooltip-enter"}
          style={{
            position: "absolute",
            bottom: "calc(100% + 10px)",
            ...(side === "right" ? { right: 0 } : { left: 0 }),
            background: "rgba(15,18,28,0.92)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 10,
            padding: "8px 14px",
            whiteSpace: "nowrap",
            fontSize: 12.5,
            fontWeight: 600,
            color: "#e2e8f0",
            pointerEvents: "none",
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          }}
        >
          Merhaba 👋 Size yardımcı olabilirim
          {/* Tail */}
          <span style={{
            position: "absolute",
            bottom: -5,
            ...(side === "right" ? { right: 18 } : { left: 18 }),
            width: 10, height: 10,
            background: "rgba(15,18,28,0.92)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderTop: "none", borderLeft: "none",
            transform: "rotate(45deg)",
            borderRadius: "0 0 2px 0",
          }} />
        </div>
      )}

      {/* Pulse ring */}
      {active && (
        <div
          className="cta-pulse-ring"
          style={{
            position: "absolute",
            inset: -4,
            borderRadius: 999,
            border: `2px solid ${primaryColor || "#6366f1"}`,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Pill button */}
      <button
        className="cta-pill"
        disabled
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 18px 0 6px",
          height: 52,
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.18)",
          cursor: "not-allowed",
          position: "relative",
          overflow: "hidden",
          /* Gradient background */
          background: active
            ? "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)"
            : "rgba(99,102,241,0.15)",
          color: "white",
          opacity: active ? 1 : 0.25,
          transition: "transform 0.25s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.25s ease, opacity 0.3s ease",
          boxShadow: active
            ? "0 10px 30px rgba(99,102,241,0.45), 0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.2)"
            : "none",
        }}
      >
        {/* Glassmorphism overlay */}
        <span style={{
          position: "absolute", inset: 0,
          borderRadius: 999,
          background: "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 60%, transparent 100%)",
          pointerEvents: "none",
        }} />

        {/* Icon bubble */}
        <span
          className="cta-icon-wrap"
          style={{
            width: 40, height: 40,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.20)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25)",
          }}
        >
          <Sparkles size={18} />
        </span>

        {/* Label + online dot */}
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.2, minWidth: 0 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: "-0.2px", whiteSpace: "nowrap" }}>
            Asistan ile konuş
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "#10b981",
              boxShadow: "0 0 0 2px rgba(16,185,129,0.3)",
              display: "inline-block",
            }} />
            <span style={{ fontSize: 10.5, fontWeight: 600, opacity: 0.8 }}>Online</span>
          </span>
        </span>
      </button>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

export default function WidgetPreview({ settings, clinicContact = { enableHumanHandoff: true, whatsappNumber: "905551234567", telegramUsername: "clinicbridge" } }: WidgetPreviewProps) {
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

    // Intent Detection
    const normalizedText = textToSend.toLowerCase().trim()
      .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
      .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c');
      
    const handoffKeywords = [
      "canli destek", "insana bagla", "musteri temsilcisi", 
      "gercek kisi", "whatsapp", "telegram", "klinikle gorus", 
      "insanla", "biriyle gorus", "asistan degil", "canli birine"
    ];

    const isHandoffIntent = handoffKeywords.some(keyword => normalizedText.includes(keyword));

    setTimeout(() => {
      if (isHandoffIntent) {
        console.log("HUMAN_HANDOFF_EVENT", {
          clinicId: "preview-clinic-id",
          userMessage: textToSend,
          timestamp: new Date().toISOString()
        });

        if (!clinicContact.enableHumanHandoff || (!clinicContact.whatsappNumber && !clinicContact.telegramUsername)) {
          setMessages((prev) => [...prev, {
            id: (Date.now() + 1).toString(),
            text: "Şu anda canlı destek hattı tanımlı değil. Lütfen klinik ile telefon veya e-posta üzerinden iletişime geçin.",
            sender: "bot",
            timestamp: new Date(),
          }]);
        } else {
          setMessages((prev) => [...prev, {
            id: (Date.now() + 1).toString(),
            text: "Sizi yetkili ekibimize aktarıyorum.",
            sender: "bot",
            timestamp: new Date(),
            isHandoff: true
          }]);
        }
      } else {
        const botMsg: Message = {
          id: (Date.now() + 1).toString(),
          text: "Bu bir önizleme modudur. Gerçek asistanınız burada verdiğiniz bilgilere göre yanıt verecektir.",
          sender: "bot",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, botMsg]);
      }
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
                    padding: msg.isHandoff ? "16px" : "10px 14px",
                    borderRadius: msg.sender === "user" ? "16px 16px 2px 16px" : "16px 16px 16px 2px",
                    background: msg.sender === "user" ? settings.primaryColor : "var(--bg-card)",
                    color: msg.sender === "user" ? "white" : "var(--text-primary)",
                    fontSize: 14,
                    lineHeight: "1.5",
                    boxShadow: msg.sender === "user" || msg.isHandoff ? "0 4px 12px rgba(0,0,0,0.08)" : "none",
                    border: msg.sender === "bot" ? `1px solid ${UI_COLORS.border}` : "none",
                    width: msg.isHandoff ? "100%" : "auto",
                    minWidth: msg.isHandoff ? "240px" : "auto",
                  }}>
                    {msg.isHandoff ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, color: settings.primaryColor || UI_COLORS.brand }}>
                          <User size={18} />
                          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Canlı Destek</h4>
                        </div>
                        <p style={{ margin: 0, fontSize: 13, color: UI_COLORS.textSecondary }}>
                          Dilerseniz kliniğimizle WhatsApp veya Telegram üzerinden doğrudan iletişime geçebilirsiniz.
                        </p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                          {clinicContact.whatsappNumber && (
                            <a 
                              href={`https://wa.me/${clinicContact.whatsappNumber.replace(/[\s+]/g, '')}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              style={{
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                                background: "#25D366", color: "white", textDecoration: "none",
                                padding: "10px", borderRadius: 8, fontSize: 13, fontWeight: 600
                              }}
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                              </svg>
                              WhatsApp ile Bağlan
                            </a>
                          )}
                          {clinicContact.telegramUsername && (
                            <a 
                              href={clinicContact.telegramUsername.startsWith("http") ? clinicContact.telegramUsername : `https://t.me/${clinicContact.telegramUsername.replace('@', '')}`}
                              target="_blank" 
                              rel="noopener noreferrer"
                              style={{
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                                background: "#0088cc", color: "white", textDecoration: "none",
                                padding: "10px", borderRadius: 8, fontSize: 13, fontWeight: 600
                              }}
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                              </svg>
                              Telegram ile Bağlan
                            </a>
                          )}
                        </div>
                      </div>
                    ) : (
                      msg.text
                    )}
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
              onClick={() => handleSend()}
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

      {/* Floating CTA – Bottom Right */}
      <FloatingCTAButton
        side="right"
        active={settings.position === "bottom-right"}
        primaryColor={settings.primaryColor}
      />

      {/* Floating CTA – Bottom Left */}
      <FloatingCTAButton
        side="left"
        active={settings.position === "bottom-left"}
        primaryColor={settings.primaryColor}
      />

      <style>{`
        @keyframes typing {
          0%, 100% { opacity: 0.3; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-2px); }
        }
        .typing-dot { animation: typing 1s infinite; }
        .typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-dot:nth-child(3) { animation-delay: 0.4s; }

        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

        @keyframes cta-pulse-ring {
          0%   { transform: scale(1);   opacity: 0.55; }
          70%  { transform: scale(1.55); opacity: 0; }
          100% { transform: scale(1.55); opacity: 0; }
        }
        @keyframes cta-float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-3px); }
        }
        @keyframes cta-tooltip-in {
          from { opacity: 0; transform: translateY(6px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0)  scale(1); }
        }
        @keyframes cta-tooltip-out {
          from { opacity: 1; transform: translateY(0)  scale(1); }
          to   { opacity: 0; transform: translateY(6px) scale(0.95); }
        }
        .cta-pulse-ring {
          animation: cta-pulse-ring 2.2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
        }
        .cta-pill:hover {
          transform: scale(1.04) !important;
          box-shadow: 0 16px 40px rgba(99,102,241,0.5), 0 0 0 1px rgba(255,255,255,0.15) !important;
        }
        .cta-pill:hover .cta-icon-wrap {
          transform: rotate(-8deg) scale(1.15);
        }
        .cta-icon-wrap {
          transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .cta-pill-tooltip-enter {
          animation: cta-tooltip-in 0.3s ease forwards;
        }
        .cta-pill-tooltip-exit {
          animation: cta-tooltip-out 0.3s ease forwards;
        }
      `}</style>
    </div>
  );
}
