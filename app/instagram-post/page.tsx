"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

/* ─── Real ClinicBridge icon as inline SVG (matches /public/icon.svg) ─── */
function CBIcon({ size = 48 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 120"
      fill="none"
      width={size}
      height={size}
    >
      <defs>
        <linearGradient id="ig-bridgeGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="50%" stopColor="#4F46E5" />
          <stop offset="100%" stopColor="#0EA5E9" />
        </linearGradient>
        <linearGradient id="ig-sparkGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#C084FC" />
          <stop offset="100%" stopColor="#38BDF8" />
        </linearGradient>
      </defs>
      <path
        d="M 20 95 C 20 0, 100 0, 100 95"
        stroke="url(#ig-bridgeGrad)"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <path
        d="M 60 34 Q 60 68 45 68 Q 60 68 60 102 Q 60 68 75 68 Q 60 68 60 34 Z"
        fill="url(#ig-sparkGrad)"
      />
    </svg>
  );
}

/* ─── Spark Icon ─── */
function SparkIcon({ size = 24, fill = "url(#ig-sparkGrad)" }: { size?: number; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <defs>
        <linearGradient id="ig-sparkGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#C084FC" />
          <stop offset="100%" stopColor="#38BDF8" />
        </linearGradient>
      </defs>
      <path
        d="M 60 20 Q 60 60 20 60 Q 60 60 60 100 Q 60 60 100 60 Q 60 60 60 20 Z"
        fill={fill}
      />
    </svg>
  );
}

/* ─── Feature icons ─── */
const features = [
  "Kliniğe özel yanıtlar",
  "Randevuya yönlendirme",
  "Çok dilli iletişim",
  "7/24 erişilebilirlik",
];

export default function InstagramPostPage() {
  const POST_W = 1080;
  const POST_H = 1350;
  const PADDING = 80;

  const [scale, setScale] = useState(1);

  useEffect(() => {
    function computeScale() {
      const availW = window.innerWidth - PADDING;
      const availH = window.innerHeight - 160;
      const s = Math.min(1, availW / POST_W, availH / POST_H);
      setScale(parseFloat(s.toFixed(4)));
    }
    computeScale();
    window.addEventListener("resize", computeScale);
    return () => window.removeEventListener("resize", computeScale);
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        fontFamily: "'Inter', system-ui, sans-serif",
        paddingBottom: 60,
      }}
    >
      {/* ── Toolbar ── */}
      <div
        style={{
          width: "100%",
          background: "rgba(255,255,255,0.04)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          padding: "14px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <CBIcon size={26} />
          <span style={{ color: "rgba(255,255,255,0.9)", fontWeight: 700, fontSize: 14 }}>ClinicBridge AI</span>
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>·</span>
          <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, fontWeight: 500 }}>Instagram Post Preview</span>
        </div>
        <div style={{ background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.2)", borderRadius: 100, padding: "5px 14px", color: "#7dd3fc", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em" }}>
          1080 × 1350 px
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>Export:</span>
          <span style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "3px 10px", color: "rgba(255,255,255,0.65)", fontSize: 11, fontWeight: 600, fontFamily: "monospace" }}>
            Sağ tıkla → Farklı Kaydet
          </span>
        </div>
      </div>

      {/* ── Scale wrapper ── */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px", width: "100%" }}>
        <div style={{ width: POST_W * scale, height: POST_H * scale, flexShrink: 0, position: "relative" }}>

          {/* ═══════════ THE POST ═══════════ */}
          <div
            id="instagram-post"
            style={{
              width: POST_W,
              height: POST_H,
              overflow: "hidden",
              position: "absolute",
              top: 0,
              left: 0,
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 24px 80px -8px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)",
              transformOrigin: "top left",
              transform: `scale(${scale})`,
              borderRadius: 4,
              background: "#060d1f",
            }}
          >
            {/* ── BACKGROUND: mesh gradient ── */}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(145deg, #060d1f 0%, #0b1628 30%, #0c2a4a 60%, #0a1f3d 100%)" }} />

            {/* Large blob top-left — indigo */}
            <div style={{ position: "absolute", top: -180, left: -180, width: 720, height: 720, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.22) 0%, transparent 65%)", pointerEvents: "none" }} />

            {/* Large blob bottom-right — cyan */}
            <div style={{ position: "absolute", bottom: -120, right: -100, width: 680, height: 680, borderRadius: "50%", background: "radial-gradient(circle, rgba(14,165,233,0.2) 0%, transparent 65%)", pointerEvents: "none" }} />

            {/* Mid blob center-right — purple */}
            <div style={{ position: "absolute", top: 400, right: -60, width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(124,58,237,0.14) 0%, transparent 65%)", pointerEvents: "none" }} />

            {/* Subtle dot grid */}
            <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.035) 1px, transparent 1px)", backgroundSize: "32px 32px", pointerEvents: "none" }} />

            {/* Thin top accent line */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, #7c3aed 0%, #4f46e5 40%, #0ea5e9 100%)" }} />

            {/* ── TOP BRAND BAR ── */}
            <div style={{ position: "relative", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "44px 60px 0" }}>

              {/* Real logo: icon + wordmark */}
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {/* Icon with glass card */}
                <div style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  background: "rgba(56,189,248,0.15)",
                  border: "1px solid rgba(56,189,248,0.3)",
                  backdropFilter: "blur(12px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                }}>
                  <SparkIcon size={34} fill="#0f172a" />
                </div>
                {/* Wordmark */}
                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 0, lineHeight: 1 }}>
                    <span style={{ color: "white", fontWeight: 800, fontSize: 22, letterSpacing: "-0.4px" }}>Clinic</span>
                    <span style={{ color: "#38bdf8", fontWeight: 800, fontSize: 22, letterSpacing: "-0.4px" }}>Bridge</span>
                    <span style={{ color: "rgba(255,255,255,0.55)", fontWeight: 600, fontSize: 15, marginLeft: 6, letterSpacing: "0.02em" }}>AI</span>
                  </div>
                  <div style={{ color: "rgba(56,189,248,0.7)", fontSize: 11, fontWeight: 500, marginTop: 3, letterSpacing: "0.02em" }}>clinicbridge-ai.com</div>
                </div>
              </div>

              {/* 7/24 badge */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.28)", padding: "10px 20px", borderRadius: 100 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 10px rgba(16,185,129,0.9)" }} />
                <span style={{ color: "#34d399", fontSize: 13, fontWeight: 700, letterSpacing: "0.06em" }}>7/24 AKTİF</span>
              </div>
            </div>

            {/* ── HERO HEADLINE ── */}
            <div style={{ position: "relative", zIndex: 10, padding: "40px 60px 0" }}>
              <h1 style={{ color: "white", fontSize: 56, fontWeight: 900, lineHeight: 1.06, letterSpacing: "-1.4px", margin: 0, maxWidth: 640 }}>
                Her klinik aynı{" "}
                <span style={{ background: "linear-gradient(90deg, #38bdf8 0%, #a78bfa 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  değildir.
                </span>
                <br />
                AI asistanınız da{" "}
                <span style={{ background: "linear-gradient(90deg, #818cf8 0%, #38bdf8 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  aynı olmamalı.
                </span>
              </h1>
              <p style={{ color: "rgba(186,230,253,0.8)", fontSize: 18, fontWeight: 500, marginTop: 20, lineHeight: 1.6, maxWidth: 500 }}>
                ClinicBridge AI, kliniğinizin hizmetlerine ve iletişim diline göre yanıt verir.
              </p>
            </div>

            {/* ── FEATURE ICON CARDS ── */}
            <div style={{ position: "relative", zIndex: 10, padding: "28px 60px 0", display: "flex", gap: 12, flexWrap: "wrap", maxWidth: 640 }}>
              {features.map((f) => (
                <div
                  key={f}
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    padding: "10px 20px",
                    borderRadius: 100,
                    color: "rgba(255,255,255,0.9)",
                    fontSize: 16,
                    fontWeight: 500,
                    backdropFilter: "blur(8px)",
                  }}
                >
                  {f}
                </div>
              ))}
            </div>

            {/* ── CHAT WIDGET + LEFT ANNOTATION ── */}
            <div style={{ position: "relative", zIndex: 20, flex: 1, display: "flex", alignItems: "flex-end", justifyContent: "flex-end", padding: "24px 56px 0 56px" }}>

              {/* Left annotation card */}
              <div style={{
                position: "absolute",
                left: 56,
                top: 28,
                background: "rgba(15,23,42,0.8)",
                border: "1px solid rgba(99,102,241,0.3)",
                backdropFilter: "blur(16px)",
                borderRadius: 16,
                padding: "16px 20px",
                maxWidth: 240,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.35)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {/* Brain icon */}
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
                      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
                      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
                    </svg>
                  </div>
                  <span style={{ color: "#a5b4fc", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Kliniğe Özel AI</span>
                </div>
                <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, lineHeight: 1.55, margin: 0 }}>
                  Genel chatbot değil — hizmetlerinizi, kurumsal tonunuzu ve hasta akışını bilen bir asistan.
                </p>
                {/* Connector */}
                <svg style={{ position: "absolute", right: -56, top: "50%", transform: "translateY(-50%)" }} width="56" height="2" viewBox="0 0 56 2">
                  <line x1="0" y1="1" x2="56" y2="1" stroke="rgba(99,102,241,0.4)" strokeWidth="1.5" strokeDasharray="4 3" />
                </svg>
              </div>

              {/* ── Chat widget card ── */}
              <div style={{
                width: 400,
                height: 640,
                background: "white",
                borderRadius: 28,
                boxShadow: "0 40px 100px -12px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.07)",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}>
                {/* Header */}
                <div style={{ background: "#0f172a", padding: "20px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 44, height: 44, background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <SparkIcon size={24} fill="white" />
                    </div>
                    <div>
                      <div style={{ color: "white", fontWeight: 700, fontSize: 15, lineHeight: 1 }}>Nova Dental Asistan</div>
                      <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px rgba(16,185,129,0.8)" }} />
                          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 500 }}>Çevrimiçi</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(56,189,248,0.15)", border: "1px solid rgba(56,189,248,0.25)", borderRadius: 100, padding: "2px 8px" }}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="2" y1="12" x2="22" y2="12"/>
                            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                          </svg>
                          <span style={{ color: "#7dd3fc", fontSize: 10, fontWeight: 700, letterSpacing: "0.04em" }}>TR · EN</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </div>

                {/* Chat body */}
                <div style={{ flex: 1, background: "#f8fafc", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 11, overflowY: "hidden" }}>
                  <ChatBubble role="ai" text="Merhaba! Nova Dental'a hoş geldiniz. Size nasıl yardımcı olabilirim?" />
                  <ChatBubble role="user" text="Merhaba, önümüzdeki ay İstanbul'a geliyorum. Gülüş tasarımı tedavisi yapıyor musunuz?" />
                  <ChatBubble role="ai" text="Evet. Kliniğimizde uluslararası hastalar için gülüş tasarımı, implant ve estetik diş hekimliği hizmetleri sunulmaktadır." />
                  <ChatBubble role="user" text="İstanbul'da kaç gün kalmam gerekir?" />
                  <ChatBubble role="ai" text="Gülüş tasarımı prosedürleri için çoğu hastamız 5–7 gün arasında kalıyor. Süre durumunuza göre değişiklik gösterebilir." />
                  <ChatBubble role="user" text="Seyahat etmeden önce çevrimiçi konsültasyon ayarlayabilir miyiz?" />

                  {/* Typing indicator */}
                  <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 6px rgba(0,0,0,0.06)" }}>
                      <SparkIcon size={16} fill="white" />
                    </div>
                    <div style={{ background: "white", border: "1px solid #f1f5f9", borderRadius: 16, borderBottomLeftRadius: 4, padding: "12px 16px", display: "flex", alignItems: "center", gap: 5, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#94a3b8", display: "inline-block", animation: "cb-bounce 1.3s infinite ease-in-out", animationDelay: "0s" }} />
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#94a3b8", display: "inline-block", animation: "cb-bounce 1.3s infinite ease-in-out", animationDelay: "0.2s" }} />
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#94a3b8", display: "inline-block", animation: "cb-bounce 1.3s infinite ease-in-out", animationDelay: "0.4s" }} />
                    </div>
                  </div>

                  {/* CTA buttons */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 2 }}>
                    <div style={{ background: "linear-gradient(135deg, #4f46e5 0%, #0ea5e9 100%)", color: "white", padding: "12px 16px", borderRadius: 12, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "space-between", letterSpacing: "0.01em" }}>
                      Ücretsiz Online Konsültasyon Ayarla
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
                    </div>
                    <div style={{ background: "white", color: "#0f172a", padding: "11px 16px", borderRadius: 12, fontSize: 13, fontWeight: 600, border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      Tedavi Paketlerini İncele
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
                    </div>
                  </div>
                </div>

                <style>{`
                  @keyframes cb-bounce {
                    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
                    30% { transform: translateY(-5px); opacity: 1; }
                  }
                `}</style>

                {/* Footer */}
                <div style={{ padding: "12px 14px", background: "white", borderTop: "1px solid #e2e8f0", display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
                  <div style={{ flex: 1, height: 42, background: "#f1f5f9", borderRadius: 100, display: "flex", alignItems: "center", padding: "0 16px", color: "#94a3b8", fontSize: 13, fontWeight: 500 }}>
                    Mesajınızı yazın...
                  </div>
                  <div style={{ width: 42, height: 42, borderRadius: "50%", background: "linear-gradient(135deg, #4f46e5, #0ea5e9)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(79,70,229,0.4)", flexShrink: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </div>
                </div>

                {/* Powered by */}
                <div style={{ background: "#f8fafc", textAlign: "center", padding: "7px", borderTop: "1px solid #f1f5f9", color: "#94a3b8", fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", flexShrink: 0 }}>
                  Powered by{" "}
                  <span style={{ fontWeight: 700 }}>ClinicBridge AI</span>
                </div>
              </div>
            </div>

            {/* ── BOTTOM: CTA + STATS ── */}
            <div style={{ position: "relative", zIndex: 10, padding: "24px 56px 40px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24 }}>

              {/* Left CTA */}
              <div style={{ flex: 1 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.28)", padding: "8px 18px", borderRadius: 100, marginBottom: 14 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#818cf8", boxShadow: "0 0 8px rgba(129,140,248,0.9)" }} />
                  <span style={{ color: "#a5b4fc", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Demo Talepleri Açık</span>
                </div>
                <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, lineHeight: 1.6, margin: 0, maxWidth: 380 }}>
                  Kliniğiniz için örnek bir AI hasta asistanı akışı görmek isterseniz bizimle iletişime geçin.
                </p>
              </div>

              {/* Right stats — simple grey cards */}
              <div style={{ display: "flex", flexDirection: "row", gap: 10, flexShrink: 0 }}>
                {/* Card 1 — Yanıt süresi */}
                <div style={{
                  width: 148,
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 16,
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  backdropFilter: "blur(16px)",
                }}>
                  <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 500, lineHeight: 1.2 }}>Ortalama yanıt süresi</div>
                  <div style={{ color: "white", fontSize: 44, fontWeight: 700, lineHeight: 1, letterSpacing: "-1px", marginTop: "auto" }}>{"<2sn"}</div>
                </div>

                {/* Card 2 — Desteklenen dil */}
                <div style={{
                  width: 148,
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 16,
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  backdropFilter: "blur(16px)",
                }}>
                  <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 500, lineHeight: 1.2 }}>Desteklenen dil</div>
                  <div style={{ color: "white", fontSize: 44, fontWeight: 700, lineHeight: 1, letterSpacing: "-1px", marginTop: "auto" }}>12+</div>
                </div>

                {/* Card 3 — Aktif klinik */}
                <div style={{
                  width: 148,
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 16,
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  backdropFilter: "blur(16px)",
                }}>
                  <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 500, lineHeight: 1.2 }}>Aktif klinik</div>
                  <div style={{ color: "white", fontSize: 44, fontWeight: 700, lineHeight: 1, letterSpacing: "-1px", marginTop: "auto" }}>50+</div>
                </div>
              </div>
            </div>

            {/* Bottom accent line */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg, #7c3aed 0%, #4f46e5 40%, #0ea5e9 100%)" }} />

          </div>
          {/* /instagram-post */}
        </div>
      </div>
    </div>
  );
}

/* ─── ChatBubble sub-component ─── */
function ChatBubble({ role, text }: { role: "ai" | "user"; text: string }) {
  const isAI = role === "ai";
  return (
    <div style={{ alignSelf: isAI ? "flex-start" : "flex-end", maxWidth: "84%", display: "flex", flexDirection: isAI ? "row" : "row-reverse", gap: 8, alignItems: "flex-end" }}>
      {isAI && (
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 6px rgba(0,0,0,0.06)" }}>
          <SparkIcon size={16} fill="white" />
        </div>
      )}
      <div style={{
        background: isAI ? "white" : "linear-gradient(135deg, #4f46e5, #0ea5e9)",
        color: isAI ? "#0f172a" : "white",
        padding: "11px 14px",
        borderRadius: 16,
        borderBottomLeftRadius: isAI ? 4 : 16,
        borderBottomRightRadius: isAI ? 16 : 4,
        fontSize: 13,
        lineHeight: 1.55,
        fontWeight: isAI ? 450 : 500,
        boxShadow: isAI ? "0 2px 8px rgba(0,0,0,0.07)" : "0 4px 12px rgba(79,70,229,0.3)",
        border: isAI ? "1px solid #f1f5f9" : "none",
      }}>
        {text}
      </div>
    </div>
  );
}
