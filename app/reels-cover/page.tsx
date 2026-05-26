"use client";
import { useEffect, useState } from "react";

function CBIcon({ size = 48 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none" width={size} height={size}>
      <defs>
        <linearGradient id="rc-bridgeGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="50%" stopColor="#4F46E5" />
          <stop offset="100%" stopColor="#0EA5E9" />
        </linearGradient>
        <linearGradient id="rc-sparkGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#C084FC" />
          <stop offset="100%" stopColor="#38BDF8" />
        </linearGradient>
      </defs>
      <path d="M 20 95 C 20 0, 100 0, 100 95" stroke="url(#rc-bridgeGrad)" strokeWidth="14" strokeLinecap="round" />
      <path d="M 60 34 Q 60 68 45 68 Q 60 68 60 102 Q 60 68 75 68 Q 60 68 60 34 Z" fill="url(#rc-sparkGrad)" />
    </svg>
  );
}

export default function ReelsCoverPage() {
  const POST_W = 1080;
  const POST_H = 1920;

  const [scale, setScale] = useState(1);

  useEffect(() => {
    function computeScale() {
      const s = Math.min(window.innerWidth / POST_W, window.innerHeight / POST_H);
      setScale(parseFloat(s.toFixed(4)));
    }
    computeScale();
    window.addEventListener("resize", computeScale);
    return () => window.removeEventListener("resize", computeScale);
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#000", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ width: POST_W * scale, height: POST_H * scale, position: "relative" }}>
        
        {/* The Frame */}
        <div style={{ width: POST_W, height: POST_H, overflow: "hidden", position: "absolute", top: 0, left: 0, transformOrigin: "top left", transform: `scale(${scale})`, background: "#060e1f", display: "flex", flexDirection: "column" }}>
          
          {/* Aesthetic Background simulating a SaaS UI Environment */}
          <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
            {/* Base gradient */}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #020617 0%, #0f172a 40%, #082f49 100%)" }} />
            
            {/* Fake dashboard cards in background to simulate SaaS environment */}
            <div style={{ position: "absolute", top: 150, left: -100, width: 800, height: 600, background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: 48, transform: "rotate(-12deg)", boxShadow: "0 40px 100px rgba(0,0,0,0.5)" }} />
            <div style={{ position: "absolute", bottom: 200, right: -150, width: 900, height: 500, background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: 48, transform: "rotate(8deg)", boxShadow: "0 40px 100px rgba(0,0,0,0.5)" }} />
            
            {/* Deep overlay to keep it subtle and text highly legible */}
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at center, transparent 0%, rgba(2,6,23,0.8) 100%)", backdropFilter: "blur(12px)" }} />
            
            {/* Top ambient light behind the logo */}
            <div style={{ position: "absolute", top: -300, left: "50%", marginLeft: -400, width: 800, height: 800, background: "radial-gradient(circle, rgba(14,165,233,0.15) 0%, transparent 60%)", borderRadius: "50%" }} />
          </div>

          {/* Content Container */}
          <div style={{ position: "relative", zIndex: 10, display: "flex", flexDirection: "column", height: "100%", padding: "100px 80px" }}>
            
            {/* Top Logo Area */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, marginTop: 40 }}>
              <CBIcon size={96} />
              <span style={{ color: "white", fontSize: 56, fontWeight: 800, letterSpacing: "-1.5px" }}>ClinicBridge <span style={{ color: "#38bdf8" }}>AI</span></span>
            </div>

            {/* Main Content (Centered) */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
              <h1 style={{ color: "white", fontSize: 96, fontWeight: 900, lineHeight: 1.15, letterSpacing: "-3px", margin: 0 }}>
                Yurt dışı hasta<br/>taleplerine yetişmek <span style={{ color: "#38bdf8" }}>zorunda değilsiniz.</span>
              </h1>
              <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 40, fontWeight: 500, marginTop: 60, lineHeight: 1.5, letterSpacing: "-0.5px" }}>
                ClinicBridge AI, hasta iletişimini 7/24 yönetmenize yardımcı olur.
              </p>
            </div>

            {/* Bottom Tags */}
            <div style={{ display: "flex", flexDirection: "column", gap: 24, marginBottom: 60 }}>
              <div style={{ display: "flex", justifyContent: "center", gap: 24, flexWrap: "wrap" }}>
                <div style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(56,189,248,0.3)", borderRadius: 100, padding: "28px 48px", color: "white", fontSize: 32, fontWeight: 600, display: "flex", alignItems: "center", gap: 16, backdropFilter: "blur(20px)", boxShadow: "0 20px 40px rgba(0,0,0,0.3)" }}>
                  <span style={{ fontSize: 36 }}>🌍</span> Çok dilli iletişim
                </div>
                <div style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(56,189,248,0.3)", borderRadius: 100, padding: "28px 48px", color: "white", fontSize: 32, fontWeight: 600, display: "flex", alignItems: "center", gap: 16, backdropFilter: "blur(20px)", boxShadow: "0 20px 40px rgba(0,0,0,0.3)" }}>
                  <span style={{ fontSize: 36 }}>📅</span> Randevuya yönlendirme
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <div style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(56,189,248,0.3)", borderRadius: 100, padding: "28px 48px", color: "white", fontSize: 32, fontWeight: 600, display: "flex", alignItems: "center", gap: 16, backdropFilter: "blur(20px)", boxShadow: "0 20px 40px rgba(0,0,0,0.3)" }}>
                  <span style={{ fontSize: 36 }}>⚡</span> 7/24 yanıt
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
