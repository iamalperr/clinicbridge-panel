"use client";

import { useState, useEffect } from "react";
import { UI_COLORS } from "@/components/ui/ui-shared";
import Logo from "@/components/ui/Logo";
import { Send, User, Stethoscope, Calendar, Clock, ChevronRight, MessageSquare, Menu, Settings, X, Check, Bell } from "lucide-react";
import Badge from "@/components/ui/Badge";

type Scene = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export default function ShowcaseDemoPage() {
  const [scene, setScene] = useState<Scene>(0);
  const [isWidgetOpen, setIsWidgetOpen] = useState(false);
  const [messages, setMessages] = useState<{role: "user" | "ai", text: string}[]>([]);
  const [panelStatus, setPanelStatus] = useState("pending");
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    // Scene triggers
    if (scene === 2) {
      setTimeout(() => setIsWidgetOpen(true), 800);
      setTimeout(() => {
        setMessages([{ role: "ai", text: "Merhaba! Size nasıl yardımcı olabilirim? Randevu almak ister misiniz?" }]);
      }, 1500);
    } else if (scene === 3) {
      setTimeout(() => {
        setMessages(prev => [...prev, { role: "user", text: "Diş beyazlatma için yarın 14:00'e randevu almak istiyorum." }]);
      }, 800);
    } else if (scene === 4) {
      setTimeout(() => {
        setMessages(prev => [...prev, { role: "ai", text: "Harika! Randevu talebinizi oluşturabilmem için adınızı ve telefon numaranızı paylaşabilir misiniz?" }]);
      }, 800);
    } else if (scene === 5) {
      setTimeout(() => {
        setMessages(prev => [...prev, { role: "user", text: "Alper Özgül, 05314629921" }]);
      }, 800);
    } else if (scene === 6) {
      setTimeout(() => {
        setMessages(prev => [...prev, { role: "ai", text: "Randevu talebinizi kliniğimize ilettim. Diş Beyazlatma işleminiz için tercih ettiğiniz yarın 14:00 bilgisi klinik ekibi tarafından değerlendirilecektir. Talebiniz onaylandığında veya farklı bir saat önerildiğinde SMS üzerinden bilgilendirileceksiniz." }]);
      }, 1000);
    } else if (scene === 9) {
      setTimeout(() => {
        setPanelStatus("confirmed");
        setShowToast(true);
      }, 1500);
    } else if (scene === 10) {
      // Keep toast
    }
  }, [scene]);

  const overlayTexts: Record<number, { title: string, subtitle: string }> = {
    0: { title: "Turn clinic website traffic into real appointment requests.", subtitle: "Click Next to start demo" },
    1: { title: "A visitor lands on your clinic website.", subtitle: "Browsing services..." },
    2: { title: "ClinicBridge AI welcomes the patient.", subtitle: "Available 24/7" },
    3: { title: "Patient requests an appointment.", subtitle: "Natural language understanding" },
    4: { title: "AI answers & collects details.", subtitle: "No human intervention needed" },
    5: { title: "Patient provides contact info.", subtitle: "Seamless experience" },
    6: { title: "Appointment request created.", subtitle: "Expectations managed properly" },
    7: { title: "Clinics review requests instantly.", subtitle: "Admin Panel View" },
    8: { title: "All details organized in one place.", subtitle: "Patient, Service, Date & Time" },
    9: { title: "Clinic approves the request.", subtitle: "Status update with one click" },
    10: { title: "Patient is notified via SMS automatically.", subtitle: "Closing the loop" },
  };

  const nextScene = () => {
    if (scene < 10) setScene((scene + 1) as Scene);
  };

  const prevScene = () => {
    if (scene > 0) setScene((scene - 1) as Scene);
  };

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "relative", background: "#0f172a", fontFamily: "sans-serif" }}>
      
      {/* --- SCENE RENDERER --- */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", justifyContent: "center", alignItems: "center" }}>
        
        {scene >= 1 && scene <= 6 && (
          // Simulated Clinic Website
          <div style={{ width: "100%", height: "100%", background: "#ffffff", position: "relative" }}>
            {/* Header */}
            <div style={{ height: 80, borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", padding: "0 60px", justifyContent: "space-between" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, background: "#3b82f6", borderRadius: 8 }}></div>
                Nova Dental Clinic
              </div>
              <div style={{ display: "flex", gap: 32, fontSize: 16, fontWeight: 500, color: "#475569" }}>
                <span>Home</span>
                <span>Services</span>
                <span>About Us</span>
                <span>Contact</span>
              </div>
            </div>
            {/* Hero */}
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

            {/* Simulated Chat Widget */}
            <div style={{ position: "absolute", bottom: 40, right: 40, zIndex: 50 }}>
              {isWidgetOpen ? (
                <div style={{ width: 380, height: 600, background: "white", borderRadius: 24, boxShadow: "0 20px 40px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid #e2e8f0" }}>
                  <div style={{ background: "#6366f1", padding: "24px 20px", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 18 }}>ClinicBridge AI</div>
                      <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>Usually replies instantly</div>
                    </div>
                    <X size={24} opacity={0.8} />
                  </div>
                  
                  <div style={{ flex: 1, padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, background: "#f8fafc" }}>
                    {messages.map((msg, i) => (
                      <div key={i} style={{
                        alignSelf: msg.role === "ai" ? "flex-start" : "flex-end",
                        background: msg.role === "ai" ? "white" : "#6366f1",
                        color: msg.role === "ai" ? "#0f172a" : "white",
                        padding: "12px 16px",
                        borderRadius: 16,
                        borderBottomLeftRadius: msg.role === "ai" ? 4 : 16,
                        borderBottomRightRadius: msg.role === "user" ? 4 : 16,
                        maxWidth: "85%",
                        fontSize: 15,
                        lineHeight: 1.5,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
                      }}>
                        {msg.text}
                      </div>
                    ))}
                  </div>

                  <div style={{ padding: 16, background: "white", borderTop: "1px solid #e2e8f0", display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ flex: 1, height: 44, background: "#f1f5f9", borderRadius: 22, padding: "0 16px", display: "flex", alignItems: "center", color: "#94a3b8", fontSize: 15 }}>
                      Type a message...
                    </div>
                    <div style={{ width: 44, height: 44, background: "#6366f1", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>
                      <Send size={18} style={{ marginLeft: 2 }} />
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ width: 64, height: 64, background: "#6366f1", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "white", boxShadow: "0 10px 25px rgba(99,102,241,0.4)" }}>
                  <MessageSquare size={32} />
                </div>
              )}
            </div>
          </div>
        )}

        {scene >= 7 && (
          // Simulated Admin Panel
          <div style={{ width: "100%", height: "100%", background: "#0f172a", display: "flex", color: "#f8fafc" }}>
            {/* Sidebar */}
            <div style={{ width: 260, borderRight: "1px solid #1e293b", padding: 24, display: "flex", flexDirection: "column" }}>
              <div style={{ marginBottom: 40 }}><Logo /></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ padding: "12px 16px", borderRadius: 8, color: "#94a3b8", display: "flex", alignItems: "center", gap: 12, fontWeight: 600 }}><Menu size={20} /> Dashboard</div>
                <div style={{ padding: "12px 16px", borderRadius: 8, color: "white", background: "#1e293b", display: "flex", alignItems: "center", gap: 12, fontWeight: 600 }}><Calendar size={20} /> Appointments</div>
                <div style={{ padding: "12px 16px", borderRadius: 8, color: "#94a3b8", display: "flex", alignItems: "center", gap: 12, fontWeight: 600 }}><MessageSquare size={20} /> AI Training</div>
                <div style={{ padding: "12px 16px", borderRadius: 8, color: "#94a3b8", display: "flex", alignItems: "center", gap: 12, fontWeight: 600 }}><Settings size={20} /> Settings</div>
              </div>
            </div>
            
            {/* Main Content */}
            <div style={{ flex: 1, padding: "40px 60px", position: "relative" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 40 }}>
                <div>
                  <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px" }}>Recent Appointments</h1>
                  <p style={{ color: "#94a3b8", marginTop: 8 }}>View recent appointments booked via AI.</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <Bell size={24} color="#94a3b8" />
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#3b82f6" }}></div>
                </div>
              </div>

              {scene >= 8 && (
                <div style={{ background: "#1e293b", borderRadius: 16, border: "1px solid #334155", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                    <thead>
                      <tr style={{ background: "#0f172a", borderBottom: "1px solid #334155" }}>
                        <th style={{ padding: "20px 24px", color: "#94a3b8", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em" }}>Patient</th>
                        <th style={{ padding: "20px 24px", color: "#94a3b8", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em" }}>Service</th>
                        <th style={{ padding: "20px 24px", color: "#94a3b8", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em" }}>Date & Time</th>
                        <th style={{ padding: "20px 24px", color: "#94a3b8", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</th>
                        <th style={{ padding: "20px 24px", color: "#94a3b8", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em" }}>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ padding: "20px 24px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(99, 102, 241, 0.2)", color: "#818cf8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <User size={18} />
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 15 }}>Alper Özgül</div>
                              <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 2 }}>05314629921</div>
                              {(scene >= 10 || showToast) && panelStatus === "confirmed" && (
                                <div style={{ fontSize: 11, fontWeight: 600, padding: "2px 6px", borderRadius: 4, marginTop: 6, display: "inline-block", backgroundColor: "rgba(34, 197, 94, 0.15)", color: "#4ade80" }}>
                                  SMS Gönderildi
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "20px 24px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 500 }}>
                            <Stethoscope size={18} color="#94a3b8" /> Diş Beyazlatma
                          </div>
                        </td>
                        <td style={{ padding: "20px 24px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500 }}><Calendar size={16} color="#94a3b8" /> Yarın</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#94a3b8" }}><Clock size={16} /> 14:00</div>
                          </div>
                        </td>
                        <td style={{ padding: "20px 24px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <select 
                              value={panelStatus}
                              disabled={scene < 9}
                              style={{
                                padding: "8px 16px",
                                borderRadius: 8,
                                border: "1px solid #334155",
                                background: "#0f172a",
                                color: "white",
                                fontSize: 14,
                                fontWeight: 500,
                                outline: "none",
                                appearance: "none",
                                WebkitAppearance: "none"
                              }}
                            >
                              <option value="pending">Bekliyor</option>
                              <option value="confirmed">Onaylandı</option>
                            </select>
                          </div>
                        </td>
                        <td style={{ padding: "20px 24px" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "#0f172a", borderRadius: 100, border: "1px solid #334155", fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>
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
                <div style={{ position: "absolute", bottom: 40, right: 60, background: "#10b981", color: "white", padding: "16px 24px", borderRadius: 12, boxShadow: "0 10px 25px rgba(0,0,0,0.3)", display: "flex", alignItems: "center", gap: 12, fontWeight: 600, animation: "slideup 0.4s ease-out" }}>
                  <Check size={20} />
                  Randevu durumu güncellendi ve hastaya SMS gönderildi.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* --- VIDEO OVERLAY --- */}
      <div style={{ position: "absolute", top: 40, left: 0, width: "100%", display: "flex", justifyContent: "center", zIndex: 100, pointerEvents: "none" }}>
        <div style={{ 
          background: "rgba(15, 23, 42, 0.85)", 
          backdropFilter: "blur(12px)", 
          padding: "20px 40px", 
          borderRadius: 24, 
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
          textAlign: "center",
          transform: scene === 0 ? "scale(1.2) translateY(30vh)" : "scale(1) translateY(0)",
          transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)"
        }}>
          <h2 style={{ fontSize: scene === 0 ? 32 : 24, fontWeight: 800, color: "white", margin: 0, letterSpacing: "-0.5px" }}>
            {overlayTexts[scene]?.title}
          </h2>
          <p style={{ fontSize: scene === 0 ? 18 : 16, color: "#94a3b8", margin: "8px 0 0 0", fontWeight: 500 }}>
            {overlayTexts[scene]?.subtitle}
          </p>
        </div>
      </div>

      {/* --- CONTROLS (Hidden from final recording if cropped, or used as clickers) --- */}
      <div style={{ position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 16, zIndex: 200 }}>
        <button onClick={prevScene} disabled={scene === 0} style={{ padding: "12px 24px", borderRadius: 100, border: "none", background: "rgba(255,255,255,0.1)", color: "white", fontWeight: 600, cursor: scene === 0 ? "not-allowed" : "pointer", backdropFilter: "blur(4px)" }}>
          Prev
        </button>
        <button onClick={nextScene} disabled={scene === 10} style={{ padding: "12px 32px", borderRadius: 100, border: "none", background: "#6366f1", color: "white", fontWeight: 600, cursor: scene === 10 ? "not-allowed" : "pointer", boxShadow: "0 4px 12px rgba(99,102,241,0.4)" }}>
          Next Scene ({scene}/10)
        </button>
      </div>

      <style>{`
        @keyframes slideup {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
