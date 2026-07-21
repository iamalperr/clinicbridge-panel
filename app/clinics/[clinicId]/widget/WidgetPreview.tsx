"use client";

import React, { useState, useEffect, useRef } from "react";
import { Send, RotateCcw, X, User, Shield, Sparkles, MessageCircle, HeartPulse, Bot } from "lucide-react";
import { UI_COLORS } from "@/components/ui/ui-shared";
import type { WidgetSettings, WidgetMessages } from "@/lib/types";

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

/** Default i18n messages used in preview when settings.messages is not set */
const DEFAULT_MESSAGES: WidgetMessages = {
  tr: {
    greetingMessage: "Merhaba! Size nasıl yardımcı olabiliriz?",
    inputPlaceholder: "Bir mesaj yazın...",
    tooltipMessage: "Merhaba, size nasıl yardımcı olabiliriz?",
    quickActions: [
      "Randevu almak istiyorum",
      "Hizmetleriniz nelerdir?",
      "Kliniğiniz nerede?",
    ],
  },
  en: {
    greetingMessage: "Hello! How can we help you?",
    inputPlaceholder: "Type your message...",
    tooltipMessage: "Hello, how can we help you?",
    quickActions: [
      "Book an appointment",
      "What services do you offer?",
      "Where is your clinic?",
    ],
  },
};

// ─── Floating CTA Button ─────────────────────────────────────────────────────
interface FloatingCTAProps {
  settings: WidgetSettings;
  previewLang: "tr" | "en";
}

function getLauncherIcon(icon: string) {
  switch (icon) {
    case "chat": return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
    case "ai_sparkle": return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>;
    case "medical_plus": return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>;
    case "heart": return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>;
    case "assistant": return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>;
    case "psychology": return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>;
    case "beauty": return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5a3 3 0 1 1-3 3m3-3a3 3 0 1 0 3 3m-3-3v14m0-14a3 3 0 1 0-3-3m3 3a3 3 0 1 1 3-3m-3 3a3 3 0 1 0-3 3m3-3a3 3 0 1 1 3 3m-3 3a3 3 0 1 0 3-3m-3 3a3 3 0 1 1-3-3"/></svg>;
    case "clinic": return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>;
    case "calendar": return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>;
    case "smile": return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/></svg>;
    case "minimal": return <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="3"/></svg>;
    case "tooth":
    default: return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21a5.5 5.5 0 0 1-4.7-2.6c-.6-1-1.3-2.4-1.3-3.4C6 11 4 9 4 6.5A4.5 4.5 0 0 1 8.5 2c1.7 0 3 1.3 3.5 2.5C12.5 3.3 13.8 2 15.5 2A4.5 4.5 0 0 1 20 6.5c0 2.5-2 4.5-2 8.5 0 1-.7 2.4-1.3 3.4A5.5 5.5 0 0 1 12 21z"/><path d="M12 21v-4"/></svg>;
  }
}

function FloatingCTAButton({ settings, previewLang }: FloatingCTAProps) {
  const launcher = settings.launcher || {
    shape: "rounded_square", position: settings.position, size: "medium", icon: "sparkle",
    text: "Asistan ile konuş", showText: true, showOnlineIndicator: true, showNotificationDot: false,
    tooltipEnabled: true, tooltipMessage: "Merhaba 👋 Size yardımcı olabilirim", tooltipDelaySeconds: 2, tooltipAutoHide: true
  };
  
  const active = true;
  const primaryColor = settings.primaryColor || "#6366f1";
  
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipExiting, setTooltipExiting] = useState(false);

  useEffect(() => {
    if (!launcher.tooltipEnabled) {
      setShowTooltip(false);
      return;
    }
    const timerIn = setTimeout(() => {
      setShowTooltip(true);
      if (launcher.tooltipAutoHide) {
        setTimeout(() => {
          setTooltipExiting(true);
          setTimeout(() => setShowTooltip(false), 300);
        }, 4000);
      }
    }, launcher.tooltipDelaySeconds * 1000);
    return () => clearTimeout(timerIn);
  }, [launcher]);

  const isLeft = launcher.position === "bottom_left" || launcher.position === "middle_left";
  const isMiddle = launcher.position === "middle_left" || launcher.position === "middle_right";
  
  const positionStyle: React.CSSProperties = {
    position: "absolute",
    ...(isMiddle ? { top: "50%", transform: "translateY(-50%)" } : { bottom: 28 }),
    ...(isLeft ? { left: 20 } : { right: 20 }),
    display: "flex",
    flexDirection: "column",
    alignItems: isLeft ? "flex-start" : "flex-end",
    zIndex: 50,
  };

  const getShapeStyle = () => {
    switch (launcher.shape) {
      case "circle": return { borderRadius: 999, padding: launcher.showText ? "0 20px" : "0", width: launcher.showText ? "auto" : 56, height: 56, justifyContent: "center" };
      case "square": return { borderRadius: 12, padding: launcher.showText ? "0 16px" : "0", width: launcher.showText ? "auto" : 52, height: 52, justifyContent: "center" };
      case "rounded_square": return { borderRadius: 20, padding: launcher.showText ? "0 18px" : "0", width: launcher.showText ? "auto" : 56, height: 56, justifyContent: "center" };
      case "pill": return { borderRadius: 999, padding: "0 24px", height: 50, justifyContent: "center" };
      case "minimal": return { borderRadius: "50%", padding: 0, width: 48, height: 48, background: "transparent", color: primaryColor, boxShadow: "none", border: "none", justifyContent: "center" };
      case "chat_bubble": return { borderRadius: isLeft ? "24px 24px 24px 4px" : "24px 24px 4px 24px", padding: launcher.showText ? "0 20px" : "0", width: launcher.showText ? "auto" : 56, height: 56, justifyContent: "center" };
      default: return { borderRadius: 999, padding: "0 18px 0 6px", height: 52 };
    }
  };

  const shapeStyle = getShapeStyle();
  
  // Apply size scaling
  const scale = launcher.size === "small" ? 0.85 : launcher.size === "large" ? 1.15 : 1;

  return (
    <div style={positionStyle}>
      {/* Tooltip */}
      {launcher.tooltipEnabled && showTooltip && (
        <div
          className={tooltipExiting ? "cta-pill-tooltip-exit" : "cta-pill-tooltip-enter"}
          style={{
            position: "absolute",
            bottom: "calc(100% + 14px)",
            ...(isLeft ? { left: 0 } : { right: 0 }),
            background: "rgba(15,18,28,0.92)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 12,
            padding: "10px 16px",
            whiteSpace: "nowrap",
            fontSize: 13,
            fontWeight: 600,
            color: "#e2e8f0",
            pointerEvents: "none",
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          }}
        >
          {launcher.tooltipMessage}
          {/* Tail */}
          <span style={{
            position: "absolute",
            bottom: -6,
            ...(isLeft ? { left: 24 } : { right: 24 }),
            width: 12, height: 12,
            background: "rgba(15,18,28,0.92)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderTop: "none", borderLeft: "none",
            transform: "rotate(45deg)",
            borderRadius: "0 0 2px 0",
          }} />
        </div>
      )}

      {/* Button */}
      <button
        disabled
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "not-allowed",
          position: "relative",
          overflow: launcher.shape !== "minimal" ? "hidden" : "visible",
          background: launcher.shape === "minimal" ? "transparent" : `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%)`,
          color: launcher.shape === "minimal" ? primaryColor : "white",
          boxShadow: launcher.shape === "minimal" ? "none" : `0 10px 30px ${primaryColor}55, 0 2px 8px rgba(0,0,0,0.25)`,
          border: launcher.shape === "minimal" ? "none" : "1px solid rgba(255,255,255,0.18)",
          transform: `scale(${scale})`,
          transition: "transform 0.25s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.25s ease",
          ...shapeStyle,
        }}
      >
        {launcher.shape !== "minimal" && (
          <span style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 100%)",
            pointerEvents: "none",
          }} />
        )}

        {/* Icon */}
        <span
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            ...(launcher.shape === "minimal" 
              ? { width: 48, height: 48, background: `${primaryColor}22`, borderRadius: "50%" } 
              : { width: launcher.showText && launcher.shape === "rounded_square" ? 40 : "auto", height: launcher.showText && launcher.shape === "rounded_square" ? 40 : "auto", background: launcher.showText && launcher.shape === "rounded_square" ? "rgba(255,255,255,0.2)" : "transparent", borderRadius: "50%" })
          }}
        >
          {getLauncherIcon(launcher.icon)}
        </span>

        {/* Text Area */}
        {launcher.showText && launcher.shape !== "minimal" && (
          <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.2, alignItems: "flex-start", marginLeft: 4 }}>
            <span style={{ whiteSpace: "nowrap" }}>
              {typeof launcher.text === "string" 
                ? launcher.text 
                : (launcher.text?.[previewLang] || (previewLang === "tr" ? "Asistan ile konuş" : "Chat with assistant"))
              }
            </span>
            {launcher.showOnlineIndicator && (
              <span style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "#10b981",
                  boxShadow: "0 0 0 2px rgba(16,185,129,0.3)",
                }} />
                <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.9 }}>Online</span>
              </span>
            )}
          </span>
        )}
        
        {/* Notification Dot overlay if not text mode or minimal */}
        {launcher.showNotificationDot && (
          <span style={{
            position: "absolute", top: -2, right: -2,
            width: 14, height: 14, background: "#ef4444", borderRadius: "50%",
            border: "2px solid var(--bg-card)"
          }} />
        )}
      </button>
    </div>
  );
}

function getAvatarContent(settings: WidgetSettings) {
  if (settings.avatarType === "custom" && settings.customAvatarUrl) {
    return <img src={settings.customAvatarUrl} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />;
  }
  switch (settings.avatarType) {
    case "female_doctor": return <span style={{ fontSize: 22, lineHeight: 1 }}>👩‍⚕️</span>;
    case "male_doctor": return <span style={{ fontSize: 22, lineHeight: 1 }}>👨‍⚕️</span>;
    case "clinic_assistant": return <span style={{ fontSize: 22, lineHeight: 1 }}>🧑‍💼</span>;
    case "minimal": return <Sparkles size={18} />;
    default: return <User size={20} />;
  }
}
// ─────────────────────────────────────────────────────────────────────────────

export default function WidgetPreview({ settings, clinicContact = { enableHumanHandoff: true, whatsappNumber: "905551234567", telegramUsername: "clinicbridge" } }: WidgetPreviewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [hasConsent, setHasConsent] = useState<boolean | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [previewLang, setPreviewLang] = useState<"tr" | "en">("tr");
  const scrollRef = useRef<HTMLDivElement>(null);

  /** Resolve the correct locale messages — fallback to defaults */
  const getLangMessages = (lang: "tr" | "en") => {
    const saved = settings.messages?.[lang];
    const defaults = DEFAULT_MESSAGES[lang];
    return {
      greetingMessage: saved?.greetingMessage || (lang === "tr" ? settings.welcomeMessage : defaults.greetingMessage) || defaults.greetingMessage,
      inputPlaceholder: saved?.inputPlaceholder || (lang === "tr" ? settings.placeholder : defaults.inputPlaceholder) || defaults.inputPlaceholder,
      tooltipMessage: saved?.tooltipMessage || defaults.tooltipMessage,
      quickActions: (saved?.quickActions && saved.quickActions.length > 0) ? saved.quickActions : defaults.quickActions,
    };
  };

  const locale = getLangMessages(previewLang);

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
          text: locale.greetingMessage,
          sender: "bot",
          timestamp: new Date(),
        },
      ]);
    } else if (hasConsent === false) {
      setMessages([
        {
          id: "1",
          text: previewLang === "tr"
            ? "KVKK onayı olmadan asistan hizmeti kullanılamaz."
            : "Consent required to use the assistant.",
          sender: "bot",
          timestamp: new Date(),
        },
      ]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.welcomeMessage, settings.messages, hasConsent, previewLang]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = (overrideText?: string) => {
    const textToSend = overrideText || inputValue;
    if (hasConsent !== true || !textToSend.trim()) return;

    const userMsg: Message & { contextualActions?: string[] } = {
      id: Date.now().toString(),
      text: textToSend,
      sender: "user",
      timestamp: new Date(),
    };

    setHasInteracted(true);
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
        const botMsg: Message & { contextualActions?: string[] } = {
          id: (Date.now() + 1).toString(),
          text: "Bu bir önizleme modudur. Gerçek asistanınız burada verdiğiniz bilgilere göre yanıt verecektir.",
          sender: "bot",
          timestamp: new Date(),
          contextualActions: previewLang === "tr" ? ["Randevu Al", "Fiyatlar"] : ["Book Appointment", "Pricing"]
        };
        setMessages((prev) => [...prev, botMsg]);
      }
      setIsTyping(false);
    }, 1500);
  };

  const resetChat = () => {
    if (hasConsent !== true) return;
    setHasInteracted(false);
    setMessages([
      {
        id: "1",
        text: locale.greetingMessage,
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
        Live Preview
      </div>

      {/* Language switcher */}
      <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 4, border: `1px solid ${UI_COLORS.border}` }}>
        {(["tr", "en"] as const).map(lang => (
          <button
            key={lang}
            onClick={() => setPreviewLang(lang)}
            style={{
              padding: "4px 12px", borderRadius: 7, border: "none", fontSize: 12, fontWeight: 700,
              cursor: "pointer", transition: "all 0.15s",
              background: previewLang === lang ? UI_COLORS.brand : "transparent",
              color: previewLang === lang ? "white" : UI_COLORS.textMuted,
            }}
          >
            {lang === "tr" ? "🇹🇷 TR" : "🇬🇧 EN"}
          </button>
        ))}
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
                {getAvatarContent(settings)}
              </div>
            )}
            <div>
              <p style={{ fontSize: 15, fontWeight: 700 }}>{settings.title || "Clinic Assistant"}</p>
              {settings.showOnlineStatus && (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
                  <span style={{ fontSize: 11, opacity: 0.8 }}>
                    {settings.assistantName
                      ? `${previewLang === "tr" ? "Online" : "Online"} • ${settings.assistantName}`
                      : previewLang === "tr" ? "Online" : "Online"}
                  </span>
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
              <h3 style={{ fontSize: 18, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 8 }}>
                {previewLang === "tr" ? "KVKK ve Gizlilik" : "Privacy & Data Protection"}
              </h3>
              <p style={{ fontSize: 13, color: UI_COLORS.textSecondary, lineHeight: 1.5, marginBottom: 24 }}>
                {previewLang === "tr"
                  ? <>Yapay zekâ asistanımızla yapacağınız görüşmelerde sağlık verileriniz hizmet kalitesi amacıyla işlenebilir. Detaylı bilgi için <a href="/kvkk" target="_blank" style={{ color: UI_COLORS.brand, textDecoration: "none" }}>Aydınlatma Metni</a>&apos;ni inceleyebilirsiniz.</>
                  : "Your health data shared with our AI assistant may be processed to improve service quality. See our Privacy Policy for details."}
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
                  {previewLang === "tr" ? "Kabul Ediyorum ve Devam Et" : "Accept and Continue"}
                </button>
                <button
                  onClick={() => {
                    sessionStorage.setItem("patientConsent", "false");
                    setHasConsent(false);
                  }}
                  style={{
                    background: "transparent", color: UI_COLORS.textSecondary, padding: "10px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: `1px solid ${UI_COLORS.border}`, cursor: "pointer"
                  }}>
                  {previewLang === "tr" ? "Reddet" : "Decline"}
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
                  
                  {/* Contextual Actions Mock */}
                  {(msg as any).contextualActions && (msg as any).contextualActions.length > 0 && (
                    <div style={{
                      display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4, width: "100%"
                    }}>
                      {(msg as any).contextualActions.map((action: string, idx: number) => (
                        <button
                          key={idx}
                          onClick={() => handleSend(action)}
                          style={{
                            background: `${settings.primaryColor || UI_COLORS.brand}18`,
                            border: `1.5px solid ${settings.primaryColor || UI_COLORS.brand}30`,
                            color: settings.primaryColor || UI_COLORS.brand,
                            padding: "6px 10px",
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            transition: "all 0.2s"
                          }}
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                  )}
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
          
          {/* Quick Actions */}
          {/* Quick Actions */}
          {!hasInteracted && locale.quickActions && locale.quickActions.length > 0 && (
            <div
              className="hide-scrollbar"
              style={{
                display: "flex",
                gap: 8,
                overflowX: "auto",
                paddingBottom: 2,
                opacity: hasConsent !== true ? 0.3 : 1,
                pointerEvents: hasConsent !== true ? "none" : "auto",
                transition: "all 0.3s"
              }}
            >
              {locale.quickActions.slice(0, 4).map((q, idx) => (
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
          )}

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
              placeholder={hasConsent === false
                ? (previewLang === "tr" ? "KVKK onayı gerekli" : "Consent required")
                : locale.inputPlaceholder}
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

      {/* Floating CTA */}
      <FloatingCTAButton settings={settings} previewLang={previewLang} />

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
