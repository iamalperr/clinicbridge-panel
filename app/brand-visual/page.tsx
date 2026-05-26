"use client";
import { useEffect, useState } from "react";

function CBIcon({ size = 48 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none" width={size} height={size}>
      <defs>
        <linearGradient id="bv-bridgeGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="50%" stopColor="#4F46E5" />
          <stop offset="100%" stopColor="#0EA5E9" />
        </linearGradient>
        <linearGradient id="bv-sparkGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#C084FC" />
          <stop offset="100%" stopColor="#38BDF8" />
        </linearGradient>
      </defs>
      <path d="M 20 95 C 20 0, 100 0, 100 95" stroke="url(#bv-bridgeGrad)" strokeWidth="14" strokeLinecap="round" />
      <path d="M 60 34 Q 60 68 45 68 Q 60 68 60 102 Q 60 68 75 68 Q 60 68 60 34 Z" fill="url(#bv-sparkGrad)" />
    </svg>
  );
}

export default function BrandVisualPage() {
  const POST_W = 1920;
  const POST_H = 1080;

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
        <div style={{ width: POST_W, height: POST_H, overflow: "hidden", position: "absolute", top: 0, left: 0, transformOrigin: "top left", transform: `scale(${scale})`, background: "#020617", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          
          {/* Background Ambient Lighting */}
          <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #020617 0%, #0f172a 50%, #020617 100%)" }} />
            
            {/* Soft grid lines */}
            <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)", backgroundSize: "60px 60px", backgroundPosition: "center center" }} />

            {/* Huge glow behind logo */}
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 1200, height: 800, background: "radial-gradient(ellipse, rgba(56,189,248,0.15) 0%, rgba(79,70,229,0.1) 40%, transparent 70%)", filter: "blur(60px)" }} />
          </div>

          {/* Core Brand Mark - Vertical Alignment */}
          <div style={{ position: "relative", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center" }}>
            {/* Logo Wrapper */}
            <div style={{ background: "rgba(255,255,255,0.02)", padding: "50px", borderRadius: 60, backdropFilter: "blur(40px)", border: "1px solid rgba(255,255,255,0.05)", boxShadow: "0 40px 100px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)" }}>
              <CBIcon size={240} />
            </div>
            
            {/* Wordmark */}
            <div style={{ marginTop: 60, display: "flex", alignItems: "baseline", gap: 16 }}>
              <h1 style={{ color: "white", fontSize: 120, fontWeight: 800, letterSpacing: "-3px", margin: 0 }}>ClinicBridge</h1>
              <span style={{ background: "linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontSize: 120, fontWeight: 900, letterSpacing: "-2px" }}>AI Tech</span>
            </div>

            {/* Tagline */}
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 32, fontWeight: 600, letterSpacing: "12px", textTransform: "uppercase", marginTop: 40, background: "rgba(0,0,0,0.2)", padding: "16px 40px", borderRadius: 100, border: "1px solid rgba(255,255,255,0.05)" }}>
              Yapay Zeka Destekli Klinik Asistanı
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
