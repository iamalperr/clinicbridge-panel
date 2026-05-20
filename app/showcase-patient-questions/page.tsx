"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Send, X, Sparkles, MousePointer2, Star, Check } from "lucide-react";

type Msg = { role: "user" | "ai"; text: string };

const CONV: { user: string; ai: string }[] = [
  {
    user: "Merhaba, dişlerimde hassasiyet var ve son zamanlarda renklenme fark ettim. Ne yapmalıyım?",
    ai: "Diş hassasiyeti ve renklenme farklı nedenlerle oluşabilir; diş taşı birikimi, mine hassasiyeti veya beslenme alışkanlıkları buna yol açabilir. Net değerlendirme için diş hekimi muayenesi önerilir. Dilerseniz diş temizliği için randevu talebi oluşturabiliriz.",
  },
  {
    user: "Diş beyazlatma hassasiyet yapar mı?",
    ai: "Diş beyazlatma sonrası bazı hastalarda geçici hassasiyet görülebilir. Bu durum genellikle kısa sürelidir. Nova Dental'de işlem öncesi diş yapınız değerlendirilir ve size uygun yöntem hekim tarafından belirlenir.",
  },
  {
    user: "Kliniğiniz nerede?",
    ai: "Nova Dental Clinic, Bağdat Caddesi, Kadıköy / İstanbul'da bulunmaktadır. Yol tarifi veya iletişim bilgileri konusunda da yardımcı olabilirim.",
  },
  {
    user: "Hafta sonu açık mısınız?",
    ai: "Nova Dental Clinic Cumartesi günleri 09:00–19:00 arasında hizmet vermektedir. Pazar günleri ise kapalıdır.",
  },
  {
    user: "Diş beyazlatma fiyatı nedir?",
    ai: "Diş beyazlatma fiyatı uygulanacak yönteme ve hekimin değerlendirmesine göre değişir. En doğru bilgi için kısa bir ön görüşme planlanması önerilir. Dilerseniz randevu talebi oluşturabilirim.",
  },
  {
    user: "Teşekkürler, çok açıklayıcı oldu.",
    ai: "Rica ederim. Yardımcı olabildiysem ne mutlu. Görüşmemizi değerlendirmek ister misiniz?",
  },
];

const OVERLAYS: Record<number, string> = {
  1: "Hastalar web sitenize sadece randevu için gelmez.",
  2: "ClinicBridge AI hastaları anında karşılar.",
  3: "Hasta şikayetlerini güvenli şekilde yönlendirir.",
  4: "Tedavi sorularına kliniğe özel yanıtlar verir.",
  5: "Klinik bilgilerini hızlıca paylaşır.",
  6: "Çalışma saatleri ve operasyonel bilgileri net aktarır.",
  7: "Fiyat sorularını güvenli ve dönüşüm odaklı yönetir.",
  8: "Görüşme sonunda hasta memnuniyeti ölçülür.",
  9: "Görüşme sonunda hasta memnuniyeti ölçülür.",
  10: "Klinikler hasta görüşmelerini ve memnuniyeti takip edebilir.",
};

function Content() {
  const sp = useSearchParams();
  const rec = sp.get("mode") === "recording";

  const [scene, setScene] = useState(1);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [inp, setInp] = useState("");
  const [typing, setTyping] = useState(false);
  const [showSurvey, setShowSurvey] = useState(false);
  const [surveyDone, setSurveyDone] = useState(false);
  const [stars, setStars] = useState(0);
  const [view, setView] = useState<"site" | "admin" | "outro">("site");
  const [curPos, setCurPos] = useState({ x: -200, y: -200 });
  const [curClick, setCurClick] = useState(false);

  const widgetRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const sendRef = useRef<HTMLDivElement>(null);
  const star5Ref = useRef<HTMLButtonElement>(null);
  const surveyBtnRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: "smooth" });
  }, [msgs, typing, showSurvey]);

  const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

  const moveTo = async (ref: React.RefObject<HTMLElement | null>) => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setCurPos({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    }
    await wait(700);
  };

  const click = async () => {
    setCurClick(true);
    await wait(150);
    setCurClick(false);
    await wait(250);
  };

  const type = async (text: string) => {
    let cur = "";
    for (let i = 0; i < text.length; i++) {
      cur += text[i];
      setInp(cur);
      await wait(28);
    }
    await wait(200);
  };

  const addMsg = (role: "user" | "ai", text: string) =>
    setMsgs(p => [...p, { role, text }]);

  useEffect(() => {
    if (!rec) return;
    setCurPos({ x: window.innerWidth * 0.7, y: window.innerHeight * 0.5 });

    (async () => {
      // Scene 1 — website
      await wait(1800);

      // Scene 2 — open widget
      setScene(2);
      await moveTo(widgetRef);
      await click();
      setOpen(true);
      await wait(600);
      addMsg("ai", "Merhaba, ben Nova Dental asistanınız. Tedaviler, çalışma saatleri, konum ve randevu talepleri konusunda size yardımcı olabilirim.");
      await wait(1400);

      // Scenes 3-8 — conversation
      for (let i = 0; i < CONV.length; i++) {
        setScene(i + 3);
        await moveTo(inputRef);
        await click();
        await type(CONV[i].user);
        await moveTo(sendRef);
        await click();
        addMsg("user", CONV[i].user);
        setInp("");
        setTyping(true);
        await wait(1600);
        setTyping(false);
        addMsg("ai", CONV[i].ai);
        await wait(i < CONV.length - 1 ? 1800 : 1200);
      }

      // Scene 9 — survey
      setScene(9);
      setShowSurvey(true);
      await wait(1200);
      await moveTo(star5Ref);
      await click();
      setStars(5);
      await wait(800);
      await moveTo(surveyBtnRef);
      await click();
      setSurveyDone(true);
      addMsg("ai", "Geri bildiriminiz için teşekkür ederiz. Sağlıklı günler dileriz. 🌟");
      await wait(2000);

      // Scene 10 — admin
      setScene(10);
      setView("admin");
      await wait(4000);

      // Scene 11 — outro
      setScene(11);
      setView("outro");
    })();
  }, [rec]);

  const Typing = () => (
    <div style={{ alignSelf: "flex-start", background: "white", padding: "12px 16px", borderRadius: 16, borderBottomLeftRadius: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", border: "1px solid #f1f5f9", display: "flex", gap: 4, alignItems: "center" }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#94a3b8", display: "inline-block", animation: `tdot 1.2s ${i * 0.15}s infinite ease-in-out` }} />
      ))}
    </div>
  );

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "relative", background: "#f8fafc", fontFamily: "'Inter', -apple-system, sans-serif", cursor: rec ? "none" : "default" }}>

      {/* Virtual cursor */}
      {rec && (
        <div style={{ position: "fixed", top: 0, left: 0, pointerEvents: "none", zIndex: 9999, transform: `translate(${curPos.x}px, ${curPos.y}px)`, transition: "transform 0.7s cubic-bezier(0.25,1,0.5,1)" }}>
          <MousePointer2 size={30} fill="rgba(15,23,42,0.9)" color="white" strokeWidth={1.5} style={{ filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.25))", transform: "translate(-8px,-2px)" }} />
          {curClick && <div style={{ position: "absolute", top: 0, left: 0, width: 20, height: 20, background: "rgba(59,130,246,0.35)", borderRadius: "50%", transform: "translate(-50%,-50%)", animation: "ripple 0.4s ease-out forwards" }} />}
        </div>
      )}

      {/* OUTRO */}
      {view === "outro" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%)", animation: "fadein 1s" }}>
          <div style={{ width: 72, height: 72, background: "linear-gradient(135deg,#3b82f6,#1d4ed8)", borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 40px rgba(59,130,246,0.4)", marginBottom: 32 }}>
            <Sparkles size={36} color="white" />
          </div>
          <h1 style={{ fontSize: 48, fontWeight: 800, color: "white", letterSpacing: "-1px", margin: 0 }}>ClinicBridge AI</h1>
          <p style={{ fontSize: 22, color: "rgba(255,255,255,0.7)", marginTop: 16, fontWeight: 500, textAlign: "center" }}>Modern klinikler için AI destekli hasta iletişim altyapısı.</p>
          <p style={{ fontSize: 18, color: "#60a5fa", marginTop: 12, fontWeight: 600 }}>clinicbridge-ai.com</p>
        </div>
      )}

      {/* ADMIN */}
      {view === "admin" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9", animation: "fadein 0.6s" }}>
          <div style={{ background: "white", borderRadius: 24, padding: 40, width: 640, boxShadow: "0 20px 60px rgba(0,0,0,0.12)", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
              <div style={{ width: 44, height: 44, background: "#dcfce7", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Check size={22} color="#16a34a" />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 20, color: "#0f172a" }}>Görüşme Tamamlandı</div>
                <div style={{ fontSize: 13, color: "#64748b" }}>Nova Dental Clinic — Anonim Ziyaretçi</div>
              </div>
              <div style={{ marginLeft: "auto", background: "#f0fdf4", color: "#16a34a", fontWeight: 700, fontSize: 13, padding: "6px 14px", borderRadius: 100 }}>Başarıyla Yanıtlandı</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
              {[
                ["Memnuniyet", "5 / 5 ⭐"],
                ["Mesaj Sayısı", "6 soru, 6 yanıt"],
                ["Kaynak", "🌐 Web Widget"],
                ["Süre", "~4 dk"],
              ].map(([k, v]) => (
                <div key={k} style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 20px", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{k}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 12, padding: "16px 20px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Konular</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {["Diş Hassasiyeti", "Diş Beyazlatma", "Klinik Konumu", "Çalışma Saatleri", "Fiyat Bilgisi"].map(t => (
                  <span key={t} style={{ background: "#eff6ff", color: "#3b82f6", fontWeight: 600, fontSize: 13, padding: "5px 12px", borderRadius: 100, border: "1px solid #bfdbfe" }}>{t}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WEBSITE + CHAT */}
      {view === "site" && (
        <div style={{ width: "100%", height: "100%", background: "white", position: "relative", animation: "fadein 0.8s" }}>
          {/* Nav */}
          <div style={{ height: 72, borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", padding: "0 60px", justifyContent: "space-between", background: "white" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, background: "linear-gradient(135deg,#3b82f6,#1d4ed8)", borderRadius: 8 }} />
              Nova Dental
            </div>
            <div style={{ display: "flex", gap: 28, fontSize: 15, fontWeight: 500, color: "#475569" }}>
              {["Ana Sayfa", "Hizmetler", "Hakkımızda", "İletişim"].map(n => <span key={n}>{n}</span>)}
            </div>
          </div>

          {/* Hero */}
          <div style={{ padding: "80px 60px", maxWidth: 740 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#3b82f6", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>Bağdat Caddesi, Kadıköy / İstanbul</p>
            <h1 style={{ fontSize: 56, fontWeight: 800, color: "#0f172a", lineHeight: 1.1, marginBottom: 20, letterSpacing: "-1px" }}>
              Gülüşünüzü yeniden<br />tasarlıyoruz.
            </h1>
            <p style={{ fontSize: 18, color: "#475569", lineHeight: 1.7, marginBottom: 36 }}>
              Diş beyazlatma, implant, zirkonyum kaplama ve ortodonti.<br />Uzman ekibimizle modern diş hekimliği deneyimi.
            </p>
            <div style={{ background: "#3b82f6", color: "white", padding: "14px 28px", borderRadius: 100, display: "inline-block", fontWeight: 700, fontSize: 16, boxShadow: "0 4px 16px rgba(59,130,246,0.35)" }}>
              Randevu Talebi Oluştur
            </div>
          </div>

          {/* Widget area */}
          <div style={{ position: "absolute", bottom: 32, right: 32, zIndex: 50, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>

            {/* Launcher bubbles */}
            {!open && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, marginBottom: 4, animation: "fadein 0.6s" }}>
                {["💬 Tedaviler", "📍 Konum", "🕐 Çalışma Saatleri"].map((b, i) => (
                  <div key={b} style={{ background: "white", border: "1px solid rgba(59,130,246,0.15)", borderRadius: "16px 16px 4px 16px", padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#0f172a", boxShadow: "0 4px 14px rgba(0,0,0,0.09)", animation: `fadein 0.4s ${i * 0.15}s both` }}>{b}</div>
                ))}
              </div>
            )}

            {/* Chat panel */}
            {open && (
              <div style={{ width: 370, height: 640, background: "white", borderRadius: 24, boxShadow: "0 24px 48px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid #e2e8f0", animation: "slideup 0.4s cubic-bezier(0.16,1,0.3,1)" }}>
                {/* Header */}
                <div style={{ background: "linear-gradient(135deg,#0f172a,#1e3a8a)", padding: "18px 20px", color: "white", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 40, height: 40, background: "linear-gradient(135deg,#3b82f6,#1d4ed8)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Sparkles size={18} color="white" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>Nova Dental Asistan</div>
                    <div style={{ fontSize: 12, opacity: 0.85, display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                      <span style={{ width: 7, height: 7, background: "#10b981", borderRadius: "50%", animation: "pulse 2s infinite" }} />
                      Online
                    </div>
                  </div>
                  <X size={18} style={{ opacity: 0.5 }} />
                </div>
                <div style={{ textAlign: "center", padding: "4px 0", background: "#f8fafc", fontSize: 10, color: "#94a3b8", fontWeight: 600, letterSpacing: "0.04em" }}>
                  Powered by <span style={{ fontWeight: 800 }}>ClinicBridge AI</span>
                </div>

                {/* Messages */}
                <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 12, background: "#f8fafc" }}>
                  {msgs.map((m, i) => (
                    <div key={i} style={{ alignSelf: m.role === "ai" ? "flex-start" : "flex-end", maxWidth: "88%", background: m.role === "ai" ? "white" : "#3b82f6", color: m.role === "ai" ? "#0f172a" : "white", padding: "11px 15px", borderRadius: 16, borderBottomLeftRadius: m.role === "ai" ? 4 : 16, borderBottomRightRadius: m.role === "user" ? 4 : 16, fontSize: 13.5, lineHeight: 1.6, boxShadow: m.role === "ai" ? "0 2px 8px rgba(0,0,0,0.06)" : "0 2px 8px rgba(59,130,246,0.2)", border: m.role === "ai" ? "1px solid #f1f5f9" : "none", animation: "fadein 0.3s" }}>
                      {m.text}
                    </div>
                  ))}

                  {typing && <Typing />}

                  {/* Survey card */}
                  {showSurvey && !surveyDone && (
                    <div style={{ alignSelf: "flex-start", background: "white", border: "1px solid #e2e8f0", borderRadius: 16, padding: "16px 18px", maxWidth: "92%", display: "flex", flexDirection: "column", gap: 12, animation: "fadein 0.4s", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: "#334155", margin: 0 }}>Görüşme deneyiminizi nasıl değerlendirirsiniz?</p>
                      <div style={{ display: "flex", gap: 6 }}>
                        {[1, 2, 3, 4, 5].map(s => (
                          <button key={s} ref={s === 5 ? star5Ref : undefined} onClick={() => setStars(s)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 26, color: s <= stars ? "#f59e0b" : "#cbd5e1", transition: "color 0.15s" }}>★</button>
                        ))}
                      </div>
                      <p style={{ fontSize: 12.5, color: "#64748b", margin: 0 }}>Yanıtlar faydalı mıydı?</p>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button ref={surveyBtnRef} onClick={() => setSurveyDone(true)} style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: "#6366f1", color: "white", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Evet, faydalıydı</button>
                        <button onClick={() => setSurveyDone(true)} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #e2e8f0", background: "white", color: "#64748b", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Daha fazla bilgiye ihtiyacım var</button>
                      </div>
                    </div>
                  )}
                  {surveyDone && showSurvey && (
                    <div style={{ alignSelf: "flex-start", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "10px 16px", fontSize: 13, fontWeight: 600, color: "#16a34a", animation: "fadein 0.3s" }}>
                      ✓ Geri bildiriminiz kaydedildi.
                    </div>
                  )}

                  <div ref={endRef} />
                </div>

                {/* Input */}
                <div style={{ padding: "12px 16px", background: "white", borderTop: "1px solid #e2e8f0", display: "flex", gap: 10, alignItems: "center" }}>
                  <div ref={inputRef} style={{ flex: 1, height: 44, background: "#f1f5f9", borderRadius: 22, padding: "0 16px", display: "flex", alignItems: "center", fontSize: 13.5, color: inp ? "#0f172a" : "#94a3b8" }}>
                    {inp || "Mesajınızı yazın..."}
                  </div>
                  <div ref={sendRef} style={{ width: 44, height: 44, background: "#3b82f6", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 10px rgba(59,130,246,0.3)" }}>
                    <Send size={18} color="white" style={{ marginLeft: 2 }} />
                  </div>
                </div>
              </div>
            )}

            {/* Launcher */}
            {!open && (
              <div ref={widgetRef} style={{ width: 64, height: 64, background: "linear-gradient(135deg,#3b82f6,#1d4ed8)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px rgba(59,130,246,0.45)", position: "relative", cursor: "pointer" }}>
                <Sparkles size={28} color="white" />
                <span style={{ position: "absolute", top: 4, right: 4, width: 13, height: 13, background: "#10b981", borderRadius: "50%", border: "2px solid white" }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Overlay text */}
      {scene < 11 && OVERLAYS[scene] && view !== "admin" && (
        <div style={{ position: "absolute", top: 32, left: 0, width: "100%", display: "flex", justifyContent: "center", zIndex: 200, pointerEvents: "none" }}>
          <div style={{ background: "rgba(255,255,255,0.95)", backdropFilter: "blur(12px)", padding: "16px 36px", borderRadius: 14, boxShadow: "0 16px 40px rgba(0,0,0,0.12)", border: "1px solid rgba(255,255,255,0.8)" }}>
            <p style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-0.3px" }}>{OVERLAYS[scene]}</p>
          </div>
        </div>
      )}

      {!rec && (
        <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.7)", color: "white", padding: "10px 20px", borderRadius: 100, fontSize: 13, fontWeight: 600 }}>
          Otomatik oynatma: ?mode=recording ekleyin
        </div>
      )}

      <style>{`
        @keyframes fadein { from { opacity:0 } to { opacity:1 } }
        @keyframes slideup { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }
        @keyframes ripple { 0% { transform:translate(-50%,-50%) scale(0.5); opacity:1 } 100% { transform:translate(-50%,-50%) scale(2.5); opacity:0 } }
        @keyframes pulse { 0% { box-shadow:0 0 0 0 rgba(16,185,129,0.7) } 70% { box-shadow:0 0 0 6px rgba(16,185,129,0) } 100% { box-shadow:0 0 0 0 rgba(16,185,129,0) } }
        @keyframes tdot { 0%,80%,100% { transform:scale(0) } 40% { transform:scale(1) } }
      `}</style>
    </div>
  );
}

export default function ShowcasePatientQuestionsPage() {
  return (
    <Suspense fallback={<div style={{ background: "#f8fafc", width: "100vw", height: "100vh" }} />}>
      <Content />
    </Suspense>
  );
}
