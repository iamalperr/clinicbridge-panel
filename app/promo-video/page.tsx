"use client";
import { useEffect, useState } from "react";

/* ─── Real ClinicBridge icon (bridge + spark) ─── */
function CBIcon({ size = 48 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none" width={size} height={size}>
      <defs>
        <linearGradient id="pv-bridgeGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="50%" stopColor="#4F46E5" />
          <stop offset="100%" stopColor="#0EA5E9" />
        </linearGradient>
        <linearGradient id="pv-sparkGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#C084FC" />
          <stop offset="100%" stopColor="#38BDF8" />
        </linearGradient>
      </defs>
      <path d="M 20 95 C 20 0, 100 0, 100 95" stroke="url(#pv-bridgeGrad)" strokeWidth="14" strokeLinecap="round" />
      <path d="M 60 34 Q 60 68 45 68 Q 60 68 60 102 Q 60 68 75 68 Q 60 68 60 34 Z" fill="url(#pv-sparkGrad)" />
    </svg>
  );
}

/* ─── Shared Influencer UI Components ─── */
function ReelText({ text, delay, show, style = {} }: { text: string | React.ReactNode, delay: string, show: boolean, style?: React.CSSProperties }) {
  return (
    <div className={`pv-zoom ${show ? "pv-zoom-show" : ""}`} style={{ transitionDelay: delay, background: "rgba(0, 0, 0, 0.75)", color: "white", padding: "20px 40px", borderRadius: 24, fontSize: 52, fontWeight: 700, textAlign: "center", lineHeight: 1.3, letterSpacing: "-1px", boxShadow: "0 10px 30px rgba(0,0,0,0.3)", ...style }}>
      {text}
    </div>
  );
}

function Notification({ icon, app, title, message, delay, show }: { icon: string, app: string, title: string, message: string, delay: string, show: boolean }) {
  return (
    <div className={`pv-slide-in ${show ? "pv-slide-show" : ""}`} style={{ transitionDelay: delay, background: "rgba(255,255,255,0.95)", backdropFilter: "blur(20px)", borderRadius: 32, padding: "24px 32px", display: "flex", gap: 20, width: "90%", maxWidth: 900, boxShadow: "0 20px 40px rgba(0,0,0,0.3)", pointerEvents: "none" }}>
      <div style={{ fontSize: 56 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontWeight: 800, color: "#111827", fontSize: 28, display: "flex", alignItems: "center", gap: 8 }}>
            {app} <span style={{ color: "#6b7280", fontSize: 24, fontWeight: 500 }}>bildirimi</span>
          </span>
          <span style={{ color: "#6b7280", fontSize: 24 }}>şimdi</span>
        </div>
        <div style={{ fontWeight: 700, color: "#111827", fontSize: 26, marginBottom: 4 }}>{title}</div>
        <div style={{ color: "#374151", fontSize: 26, lineHeight: 1.3 }}>{message}</div>
      </div>
    </div>
  );
}

function ReviewCard({ show, delay }: { show: boolean, delay: string }) {
  return (
    <div className={`pv-slide-in ${show ? "pv-slide-show" : ""}`} style={{ transitionDelay: delay, background: "rgba(255,255,255,0.95)", borderRadius: 32, padding: "40px", backdropFilter: "blur(20px)", display: "flex", flexDirection: "column", gap: 20, width: "90%", maxWidth: 800, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8 }}>
          {[1,2,3,4,5].map(i => (
            <svg key={i} width="36" height="36" viewBox="0 0 24 24" fill="#10b981" stroke="#10b981"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          ))}
        </div>
        <div style={{ color: "#6b7280", fontSize: 24, fontWeight: 600 }}>1 gün önce</div>
      </div>
      <div style={{ color: "#111827", fontSize: 32, fontWeight: 700, lineHeight: 1.4 }}>
        "ClinicBridge AI kliniğimizin hayatını kurtardı! Yurt dışı hastalarımızın randevuya dönüşme oranı %40 arttı ve ekibimizin rutin mesaj yükü inanılmaz derecede hafifledi."
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 12 }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#0ea5e9", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 28, fontWeight: 700 }}>N</div>
        <div>
          <div style={{ color: "#111827", fontSize: 28, fontWeight: 700 }}>Nova Dental</div>
          <div style={{ color: "#6b7280", fontSize: 24, fontWeight: 500 }}>Doğrulanmış Kullanıcı ✅</div>
        </div>
      </div>
    </div>
  );
}

export default function PromoVideoPage() {
  const POST_W = 1080;
  const POST_H = 1920;

  const [scale, setScale] = useState(1);
  const [scene, setScene] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);

  // Auto-scale to fit viewport
  useEffect(() => {
    function computeScale() {
      const s = Math.min(window.innerWidth / POST_W, window.innerHeight / POST_H);
      setScale(parseFloat(s.toFixed(4)));
    }
    computeScale();
    window.addEventListener("resize", computeScale);
    return () => window.removeEventListener("resize", computeScale);
  }, []);

  // Reels Timeline Sequence
  useEffect(() => {
    if (!isPlaying) return; 
    
    const t1 = setTimeout(() => setScene(1), 100);    // Hook & Notifs
    const t2 = setTimeout(() => setScene(2), 4500);   // Discovery
    const t3 = setTimeout(() => setScene(3), 8500);   // Flex & Demo
    const t4 = setTimeout(() => setScene(4), 14000);  // Results
    const t5 = setTimeout(() => setScene(5), 17500);  // CTA
    const t6 = setTimeout(() => setScene(6), 21000);  // Outro

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      clearTimeout(t4); clearTimeout(t5); clearTimeout(t6);
    };
  }, [isPlaying]);

  const startVideo = () => {
    const audio = document.getElementById("pv-bg-music") as HTMLAudioElement;
    if (audio) {
      audio.volume = 0.5;
      audio.currentTime = 0; // ensure it starts from beginning
      audio.play().catch((e) => console.log("Audio play failed:", e));
    }
    setScene(0);
    setIsPlaying(true);
  };

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#000", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ width: POST_W * scale, height: POST_H * scale, position: "relative", borderRadius: 32, overflow: "hidden", boxShadow: "0 0 100px rgba(0,0,0,0.5)" }}>
        
        {/* The Frame */}
        <div style={{ width: POST_W, height: POST_H, position: "absolute", top: 0, left: 0, transformOrigin: "top left", transform: `scale(${scale})`, background: "#0f172a", display: "flex", flexDirection: "column" }}>
          
          <audio id="pv-bg-music" src="https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3" preload="auto" />
          
          <style>{`
            .pv-fade { transition: opacity 0.8s ease, transform 0.8s ease; opacity: 0; transform: translateY(20px); pointer-events: none; }
            .pv-show { opacity: 1; transform: translateY(0); }
            .pv-zoom { transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1); opacity: 0; transform: scale(0.85); pointer-events: none; }
            .pv-zoom-show { opacity: 1; transform: scale(1); }
            .pv-slide-in { transition: opacity 0.6s ease, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1); opacity: 0; transform: translateY(100px); }
            .pv-slide-show { opacity: 1; transform: translateY(0); }
            @keyframes pv-type-dot { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-6px); opacity: 1; } }
            @keyframes pv-shake { 0%, 100% { transform: rotate(0deg); } 25% { transform: rotate(-5deg); } 75% { transform: rotate(5deg); } }
            @keyframes pv-bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(20px); } }
          `}</style>

          {/* Aesthetic Background for Reels vibe */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #1e1b4b 0%, #0f172a 50%, #082f49 100%)" }} />
          <div style={{ position: "absolute", top: -200, left: -200, width: 800, height: 800, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.3) 0%, transparent 70%)", filter: "blur(60px)", animation: "pv-bounce 10s infinite alternate" }} />
          <div style={{ position: "absolute", bottom: -200, right: -200, width: 800, height: 800, borderRadius: "50%", background: "radial-gradient(circle, rgba(14,165,233,0.3) 0%, transparent 70%)", filter: "blur(60px)", animation: "pv-bounce 12s infinite alternate-reverse" }} />

          {/* Start Overlay */}
          {scene === -1 && (
            <div style={{ position: "absolute", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(20px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <button onClick={startVideo} style={{ background: "white", color: "#0f172a", border: "none", padding: "32px 64px", borderRadius: 100, fontSize: 40, fontWeight: 800, cursor: "pointer", boxShadow: "0 20px 60px rgba(255,255,255,0.2)" }}>
                ▶ Reels'i Başlat
              </button>
              <div style={{ color: "rgba(255,255,255,0.5)", marginTop: 32, fontSize: 24, fontWeight: 500 }}>Tam ekran Reels simülasyonu</div>
            </div>
          )}

          {/* ── SCENE 1: The Hook (POV) ── */}
          <div className={`pv-fade ${scene === 1 ? "pv-show" : ""}`} style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 200, zIndex: 10 }}>
            <ReelText show={scene === 1} text={<>POV: Yurt dışı hastalarına yetişemediğin için geceleri uyuyamıyorsundur 🫠</>} delay="0.2s" style={{ width: "85%" }} />
            
            <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 80, width: "100%", alignItems: "center" }}>
              <Notification show={scene === 1} icon="💬" app="WhatsApp" title="+44 7911 123456" message="Fiyat bilgisi alabilir miyim? Ne zaman gelebilirim?" delay="1.0s" />
              <Notification show={scene === 1} icon="📸" app="Instagram" title="@john.doe" message="Do you provide smile design treatments?" delay="1.8s" />
              <Notification show={scene === 1} icon="💬" app="WhatsApp" title="+971 50 123 4567" message="هل يوجد دعم باللغة العربية؟" delay="2.6s" />
            </div>
          </div>

          {/* ── SCENE 2: The Discovery ── */}
          <div className={`pv-zoom ${scene === 2 ? "pv-zoom-show" : ""}`} style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 20 }}>
            <div style={{ fontSize: 120, animation: "pv-shake 2s infinite" }}>🤯</div>
            <ReelText show={scene === 2} text={<>Sonra kliniğim için bir<br/>yapay zeka buldum ve hayatım değişti ✨</>} delay="0.3s" style={{ width: "85%", marginTop: 40 }} />
          </div>

          {/* ── SCENE 3: The Flex (Review) ── */}
          <div className={`pv-fade ${scene === 3 ? "pv-show" : ""}`} style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 160, zIndex: 30 }}>
            <ReelText show={scene === 3} text={<>Müşteri yorumları her şeyi anlatıyor! 👇</>} delay="0.2s" style={{ width: "85%", background: "rgba(16, 185, 129, 0.9)" }} />
            
            <div style={{ marginTop: 80, width: "100%", display: "flex", justifyContent: "center" }}>
              <ReviewCard show={scene === 3} delay="1s" />
            </div>
          </div>

          {/* ── SCENE 4: Results ── */}
          <div className={`pv-zoom ${scene === 4 ? "pv-zoom-show" : ""}`} style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 40 }}>
            <ReelText show={scene === 4} text={<>Randevu dönüşümlerimiz<br/><span style={{ color: "#38bdf8", fontSize: 80, display: "block", marginTop: 16 }}>%40 ARTTI 🚀</span></>} delay="0.2s" style={{ width: "85%", padding: "60px 40px" }} />
            <ReelText show={scene === 4} text={<>Üstelik 12 farklı dilde! 🌍</>} delay="1.0s" style={{ width: "85%", marginTop: 40, background: "rgba(255,255,255,0.9)", color: "#0f172a" }} />
          </div>

          {/* ── SCENE 5: CTA ── */}
          <div className={`pv-fade ${scene === 5 ? "pv-show" : ""}`} style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
            <ReelText show={scene === 5} text={<>Klinik yöneticileri,<br/>bunu kesinlikle denemelisiniz!</>} delay="0.2s" style={{ width: "85%", border: "2px solid #38bdf8" }} />
            <div className={`pv-slide-in ${scene === 5 ? "pv-slide-show" : ""}`} style={{ transitionDelay: "1s", fontSize: 120, marginTop: 80, animation: "pv-bounce 2s infinite" }}>👇</div>
          </div>

          {/* ── SCENE 6: Outro ── */}
          <div className={`pv-zoom ${scene === 6 ? "pv-zoom-show" : ""}`} style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 60, background: "#0f172a" }}>
            <CBIcon size={200} />
            <h2 style={{ color: "white", fontSize: 80, fontWeight: 900, marginTop: 40, letterSpacing: "-2px" }}>
              ClinicBridge <span style={{ color: "#38bdf8" }}>AI</span>
            </h2>
            <div style={{ marginTop: 80, background: "linear-gradient(135deg, #4f46e5 0%, #0ea5e9 100%)", padding: "32px 80px", borderRadius: 100, color: "white", fontSize: 44, fontWeight: 800, boxShadow: "0 20px 60px rgba(14,165,233,0.4)" }}>
              Link Bio'da!
            </div>
            <div style={{ marginTop: 40, color: "rgba(255,255,255,0.6)", fontSize: 32, fontWeight: 600, letterSpacing: "2px" }}>
              clinicbridge-ai.com
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
