"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { UI_COLORS } from "@/components/ui/ui-shared";
import Logo from "@/components/ui/Logo";
import { Send, User, Stethoscope, Calendar, Clock, MessageSquare, Menu, Settings, X, Check, Bell } from "lucide-react";

type Scene = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

function ShowcaseContent() {
  const searchParams = useSearchParams();
  const isRecording = searchParams.get("mode") === "recording";
  const [scene, setScene] = useState<Scene>(1);
  
  const [isWidgetOpen, setIsWidgetOpen] = useState(false);
  const [messages, setMessages] = useState<{role: "user" | "ai", text: string}[]>([]);
  const [panelStatus, setPanelStatus] = useState("pending");
  const [showToast, setShowToast] = useState(false);
  const [typing, setTyping] = useState(false);

  // Keybindings for replay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "r") {
        window.location.reload();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Automatic timeline for recording mode
  useEffect(() => {
    if (!isRecording) return;
    
    const timeouts: NodeJS.Timeout[] = [];
    let cumulativeTime = 0;

    const timings = [
      { s: 2, t: 4000 },
      { s: 3, t: 5000 },
      { s: 4, t: 6000 },
      { s: 5, t: 6000 },
      { s: 6, t: 5000 },
      { s: 7, t: 7000 },
      { s: 8, t: 5000 },
      { s: 9, t: 5000 },
      { s: 10, t: 5000 },
      { s: 11, t: 5000 },
    ];

    timings.forEach(({ s, t }) => {
      cumulativeTime += t;
      timeouts.push(setTimeout(() => setScene(s as Scene), cumulativeTime));
    });

    return () => timeouts.forEach(clearTimeout);
  }, [isRecording]);

  // Scene triggers
  useEffect(() => {
    let t1: any, t2: any;
    
    if (scene === 2) {
      t1 = setTimeout(() => setIsWidgetOpen(true), 800);
      t2 = setTimeout(() => {
        setMessages([{ role: "ai", text: "Merhaba! Size nasıl yardımcı olabilirim? Randevu almak ister misiniz?" }]);
      }, 1500);
    } else if (scene === 3) {
      setTyping(true);
      t1 = setTimeout(() => {
        setTyping(false);
        setMessages(prev => [...prev, { role: "user", text: "Diş beyazlatma için yarın 14:00'e randevu almak istiyorum." }]);
      }, 1500);
    } else if (scene === 4) {
      t1 = setTimeout(() => setTyping(true), 500);
      t2 = setTimeout(() => {
        setTyping(false);
        setMessages(prev => [...prev, { role: "ai", text: "Randevu talebinizi oluşturabilmem için adınızı ve telefon numaranızı paylaşabilir misiniz?" }]);
      }, 2000);
    } else if (scene === 5) {
      setTyping(true);
      t1 = setTimeout(() => {
        setTyping(false);
        setMessages(prev => [...prev, { role: "user", text: "Alper Özgül, 05314629921" }]);
      }, 1500);
    } else if (scene === 6) {
      t1 = setTimeout(() => setTyping(true), 500);
      t2 = setTimeout(() => {
        setTyping(false);
        setMessages(prev => [...prev, { role: "ai", text: "Randevu talebinizi kliniğimize ilettim. Klinik ekibi talebinizi değerlendirdikten sonra onay veya uygun saat bilgisi için sizi SMS üzerinden bilgilendirecektir." }]);
      }, 2000);
    } else if (scene === 9) {
      t1 = setTimeout(() => {
        setPanelStatus("confirmed");
      }, 1500);
    } else if (scene === 10) {
      t1 = setTimeout(() => setShowToast(true), 500);
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [scene]);

  const overlayTexts: Record<number, string> = {
    1: "Your clinic website is more than a brochure.",
    2: "ClinicBridge AI welcomes patients instantly.",
    3: "ClinicBridge AI welcomes patients instantly.",
    4: "It understands intent and collects appointment details.",
    5: "It understands intent and collects appointment details.",
    6: "It understands intent and collects appointment details.",
    7: "Requests appear directly in your clinic dashboard.",
    8: "Requests appear directly in your clinic dashboard.",
    9: "Approve appointments and notify patients by SMS.",
    10: "Approve appointments and notify patients by SMS.",
    11: "ClinicBridge AI\nAI-powered patient conversion for modern clinics."
  };

  const nextScene = () => { if (scene < 11) setScene((scene + 1) as Scene); };
  const prevScene = () => { if (scene > 1) setScene((scene - 1) as Scene); };

  const renderTyping = () => (
    <div style={{
      alignSelf: "flex-start",
      background: "white",
      color: "#0f172a",
      padding: "12px 16px",
      borderRadius: 16,
      borderBottomLeftRadius: 4,
      boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
      display: "flex",
      gap: 4,
      alignItems: "center"
    }}>
      <div className="dot"></div><div className="dot"></div><div className="dot"></div>
      <style>{`.dot { width: 6px; height: 6px; background: #94a3b8; border-radius: 50%; animation: bounce 1.4s infinite ease-in-out both; } .dot:nth-child(1) { animation-delay: -0.32s; } .dot:nth-child(2) { animation-delay: -0.16s; } @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }`}</style>
    </div>
  );

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "relative", background: "#f8fafc", fontFamily: "sans-serif" }}>
      
      {/* SCENES */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", justifyContent: "center", alignItems: "center" }}>
        
        {/* Outro */}
        {scene === 11 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", animation: "fadein 1s" }}>
            <Logo />
            <h1 style={{ fontSize: 40, fontWeight: 800, color: "#0f172a", marginTop: 32, letterSpacing: "-0.02em" }}>ClinicBridge AI</h1>
            <p style={{ fontSize: 24, color: "#475569", marginTop: 16, fontWeight: 500 }}>Turn clinic website traffic into appointment requests.</p>
            <p style={{ fontSize: 20, color: "#3b82f6", marginTop: 12, fontWeight: 600 }}>clinicbridge-ai.com</p>
          </div>
        )}

        {/* Website & Chat */}
        {scene >= 1 && scene <= 6 && (
          <div style={{ width: "100%", height: "100%", background: "#ffffff", position: "relative", animation: "fadein 1s" }}>
            <div style={{ height: 80, borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", padding: "0 60px", justifyContent: "space-between" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, background: "linear-gradient(135deg, #3b82f6, #2563eb)", borderRadius: 8 }}></div>
                Nova Dental
              </div>
              <div style={{ display: "flex", gap: 32, fontSize: 16, fontWeight: 500, color: "#475569" }}>
                <span>Home</span>
                <span>Services</span>
                <span>About Us</span>
                <span>Contact</span>
              </div>
            </div>
            <div style={{ padding: "100px 60px", maxWidth: 800 }}>
              <h1 style={{ fontSize: 64, fontWeight: 800, color: "#0f172a", lineHeight: 1.1, marginBottom: 24 }}>
                Transform your smile with expert care.
              </h1>
              <p style={{ fontSize: 20, color: "#475569", lineHeight: 1.6, marginBottom: 40 }}>
                Experience world-class dental treatments in a relaxing environment. Book your appointment today and let us take care of your dental health.
              </p>
              <div style={{ background: "#3b82f6", color: "white", padding: "16px 32px", borderRadius: 100, display: "inline-block", fontWeight: 600, fontSize: 18 }}>
                Explore Services
              </div>
            </div>

            <div style={{ position: "absolute", bottom: 40, right: 40, zIndex: 50 }}>
              {isWidgetOpen ? (
                <div style={{ width: 380, height: 600, background: "white", borderRadius: 24, boxShadow: "0 20px 40px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid #e2e8f0", animation: "slideup 0.5s cubic-bezier(0.16, 1, 0.3, 1)" }}>
                  <div style={{ background: "#0f172a", padding: "24px 20px", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 32, height: 32, background: "white", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ color: "#0f172a", fontWeight: "bold" }}>AI</span>
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>ClinicBridge AI</div>
                        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>Usually replies instantly</div>
                      </div>
                    </div>
                    <X size={20} opacity={0.6} />
                  </div>
                  
                  <div style={{ flex: 1, padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, background: "#f8fafc" }}>
                    {messages.map((msg, i) => (
                      <div key={i} style={{
                        alignSelf: msg.role === "ai" ? "flex-start" : "flex-end",
                        background: msg.role === "ai" ? "white" : "#0f172a",
                        color: msg.role === "ai" ? "#0f172a" : "white",
                        padding: "12px 16px",
                        borderRadius: 16,
                        borderBottomLeftRadius: msg.role === "ai" ? 4 : 16,
                        borderBottomRightRadius: msg.role === "user" ? 4 : 16,
                        maxWidth: "85%",
                        fontSize: 15,
                        lineHeight: 1.5,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                        animation: "fadein 0.3s"
                      }}>
                        {msg.text}
                      </div>
                    ))}
                    {typing && renderTyping()}
                  </div>

                  <div style={{ padding: 16, background: "white", borderTop: "1px solid #e2e8f0", display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ flex: 1, height: 44, background: "#f1f5f9", borderRadius: 22, padding: "0 16px", display: "flex", alignItems: "center", color: "#94a3b8", fontSize: 15 }}>
                      Type a message...
                    </div>
                    <div style={{ width: 44, height: 44, background: "#0f172a", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>
                      <Send size={18} style={{ marginLeft: 2 }} />
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ width: 64, height: 64, background: "#0f172a", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "white", boxShadow: "0 10px 25px rgba(15,23,42,0.3)" }}>
                  <MessageSquare size={32} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Admin Panel */}
        {scene >= 7 && scene <= 10 && (
          <div style={{ width: "100%", height: "100%", background: "#f8fafc", display: "flex", color: "#0f172a", animation: "fadein 0.5s" }}>
            <div style={{ width: 260, background: "white", borderRight: "1px solid #e2e8f0", padding: 24, display: "flex", flexDirection: "column" }}>
              <div style={{ marginBottom: 40 }}><Logo /></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ padding: "12px 16px", borderRadius: 8, color: "#64748b", display: "flex", alignItems: "center", gap: 12, fontWeight: 600 }}><Menu size={20} /> Dashboard</div>
                <div style={{ padding: "12px 16px", borderRadius: 8, color: "#3b82f6", background: "#eff6ff", display: "flex", alignItems: "center", gap: 12, fontWeight: 600 }}><Calendar size={20} /> Appointments</div>
                <div style={{ padding: "12px 16px", borderRadius: 8, color: "#64748b", display: "flex", alignItems: "center", gap: 12, fontWeight: 600 }}><MessageSquare size={20} /> AI Training</div>
                <div style={{ padding: "12px 16px", borderRadius: 8, color: "#64748b", display: "flex", alignItems: "center", gap: 12, fontWeight: 600 }}><Settings size={20} /> Settings</div>
              </div>
            </div>
            
            <div style={{ flex: 1, padding: "40px 60px", position: "relative" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 40 }}>
                <div>
                  <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px" }}>Recent Appointments</h1>
                  <p style={{ color: "#64748b", marginTop: 8 }}>View recent appointments booked via AI.</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <Bell size={24} color="#64748b" />
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, #3b82f6, #2563eb)" }}></div>
                </div>
              </div>

              {scene >= 8 && (
                <div style={{ background: "white", borderRadius: 16, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", animation: "slideup 0.5s ease-out" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                        <th style={{ padding: "16px 24px", color: "#64748b", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Patient</th>
                        <th style={{ padding: "16px 24px", color: "#64748b", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Service</th>
                        <th style={{ padding: "16px 24px", color: "#64748b", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Date & Time</th>
                        <th style={{ padding: "16px 24px", color: "#64748b", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Status</th>
                        <th style={{ padding: "16px 24px", color: "#64748b", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ padding: "20px 24px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#eff6ff", color: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <User size={18} />
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 15 }}>Alper Özgül</div>
                              <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>05314629921</div>
                              {((scene >= 10 || showToast) && panelStatus === "confirmed") && (
                                <div style={{ fontSize: 11, fontWeight: 600, padding: "2px 6px", borderRadius: 4, marginTop: 6, display: "inline-block", backgroundColor: "#dcfce7", color: "#16a34a", animation: "fadein 0.3s" }}>
                                  SMS Gönderildi
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "20px 24px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 500 }}>
                            <Stethoscope size={18} color="#64748b" /> Diş Beyazlatma
                          </div>
                        </td>
                        <td style={{ padding: "20px 24px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500 }}><Calendar size={16} color="#64748b" /> Yarın</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#64748b" }}><Clock size={16} /> 14:00</div>
                          </div>
                        </td>
                        <td style={{ padding: "20px 24px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <select 
                              value={panelStatus}
                              disabled
                              style={{
                                padding: "8px 16px",
                                borderRadius: 8,
                                border: "1px solid #e2e8f0",
                                background: panelStatus === "confirmed" ? "#f0fdf4" : "white",
                                color: panelStatus === "confirmed" ? "#16a34a" : "#0f172a",
                                fontSize: 14,
                                fontWeight: 600,
                                outline: "none",
                                appearance: "none",
                                WebkitAppearance: "none",
                                transition: "all 0.3s"
                              }}
                            >
                              <option value="pending">Bekliyor</option>
                              <option value="confirmed">Onaylandı</option>
                            </select>
                          </div>
                        </td>
                        <td style={{ padding: "20px 24px" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "#f8fafc", borderRadius: 100, border: "1px solid #e2e8f0", fontSize: 13, fontWeight: 600, color: "#475569" }}>
                            🌐 AI Chatbot
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* Toast */}
              {showToast && (
                <div style={{ position: "absolute", bottom: 40, right: 60, background: "#10b981", color: "white", padding: "16px 24px", borderRadius: 12, boxShadow: "0 10px 25px rgba(0,0,0,0.15)", display: "flex", alignItems: "center", gap: 12, fontWeight: 600, animation: "slideup 0.4s ease-out" }}>
                  <Check size={20} />
                  Hastaya SMS bilgilendirmesi gönderildi.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* OVERLAY TEXT */}
      {scene < 11 && overlayTexts[scene] && (
        <div style={{ position: "absolute", top: 40, left: 0, width: "100%", display: "flex", justifyContent: "center", zIndex: 100, pointerEvents: "none" }}>
          <div style={{ 
            background: "white", 
            padding: "20px 40px", 
            borderRadius: 16, 
            boxShadow: "0 20px 40px rgba(0,0,0,0.1)",
            textAlign: "center",
            transform: "translateY(0)",
            transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)"
          }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-0.5px" }}>
              {overlayTexts[scene].split('\n').map((line, i) => (
                <span key={i} style={{ display: "block" }}>{line}</span>
              ))}
            </h2>
          </div>
        </div>
      )}

      {/* CONTROLS (Hidden in recording mode) */}
      {!isRecording && (
        <div style={{ position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 16, zIndex: 200 }}>
          <button onClick={prevScene} disabled={scene === 1} style={{ padding: "12px 24px", borderRadius: 100, border: "1px solid #e2e8f0", background: "white", color: "#0f172a", fontWeight: 600, cursor: scene === 1 ? "not-allowed" : "pointer" }}>
            Prev
          </button>
          <button onClick={nextScene} disabled={scene === 11} style={{ padding: "12px 32px", borderRadius: 100, border: "none", background: "#0f172a", color: "white", fontWeight: 600, cursor: scene === 11 ? "not-allowed" : "pointer", boxShadow: "0 4px 12px rgba(15,23,42,0.2)" }}>
            Next Scene ({scene}/11)
          </button>
        </div>
      )}

      <style>{`
        @keyframes slideup {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadein {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default function ShowcaseDemoPage() {
  return (
    <Suspense fallback={<div style={{ background: "#f8fafc", width: "100vw", height: "100vh" }}></div>}>
      <ShowcaseContent />
    </Suspense>
  );
}
