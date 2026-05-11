"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Logo from "@/components/ui/Logo";
import { Send, User, Stethoscope, Calendar, Clock, MessageSquare, Menu, Settings, X, Check, Bell, MousePointer2 } from "lucide-react";

type View = "website" | "admin" | "outro";

function ShowcaseContent() {
  const searchParams = useSearchParams();
  const isRecording = searchParams.get("mode") === "recording";
  
  const [scene, setScene] = useState<number>(1);
  const [view, setView] = useState<View>("website");
  const [isWidgetOpen, setIsWidgetOpen] = useState(false);
  const [messages, setMessages] = useState<{role: "user" | "ai", text: string}[]>([]);
  const [inputText, setInputText] = useState("");
  const [typing, setTyping] = useState(false);
  
  const [panelStatus, setPanelStatus] = useState("pending");
  const [showToast, setShowToast] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Virtual Cursor State
  const [cursorPos, setCursorPos] = useState({ x: -100, y: -100 });
  const [cursorClicking, setCursorClicking] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(isRecording);

  // Refs for tracking elements
  const refs = {
    widgetButton: useRef<HTMLDivElement>(null),
    chatInput: useRef<HTMLDivElement>(null),
    chatSend: useRef<HTMLDivElement>(null),
    adminRow: useRef<HTMLTableRowElement>(null),
    statusSelect: useRef<HTMLDivElement>(null),
    statusOption: useRef<HTMLDivElement>(null),
  };

  const getOffset = (ref: React.RefObject<HTMLElement | null>) => {
    if (!ref.current) return null;
    const rect = ref.current.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  // Move cursor helper
  const moveCursorToRef = async (refName: keyof typeof refs) => {
    return new Promise<void>(resolve => {
      const target = getOffset(refs[refName]);
      if (target) {
        setCursorPos(target);
      }
      setTimeout(resolve, 800); // Wait for CSS transition
    });
  };

  const moveCursorToCenter = async () => {
    return new Promise<void>(resolve => {
      setCursorPos({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      setTimeout(resolve, 800);
    });
  };

  const clickCursor = async () => {
    return new Promise<void>(resolve => {
      setCursorClicking(true);
      setTimeout(() => {
        setCursorClicking(false);
        setTimeout(resolve, 300);
      }, 150);
    });
  };

  const typeText = async (text: string) => {
    return new Promise<void>(resolve => {
      let currentText = "";
      let i = 0;
      const interval = setInterval(() => {
        if (i < text.length) {
          currentText += text.charAt(i);
          setInputText(currentText);
          i++;
        } else {
          clearInterval(interval);
          setTimeout(resolve, 200);
        }
      }, 40); // 40ms per keystroke (adjustable for realistic speed)
    });
  };

  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "r") {
        window.location.reload();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isRecording) return;
    
    // Initial position
    setCursorPos({ x: window.innerWidth / 2 + 300, y: window.innerHeight / 2 });

    const runDemo = async () => {
      // Scene 1
      await wait(2000);
      setScene(2);

      // Scene 2: Open widget
      await moveCursorToRef("widgetButton");
      await clickCursor();
      setIsWidgetOpen(true);
      await moveCursorToCenter();
      await wait(1000);
      setMessages([{ role: "ai", text: "Merhaba! Size nasıl yardımcı olabilirim? Randevu almak ister misiniz?" }]);
      await wait(1500);

      // Scene 3: Patient types
      setScene(3);
      await moveCursorToRef("chatInput");
      await clickCursor();
      await typeText("Diş beyazlatma için yarın 14:00'e randevu almak istiyorum.");
      await moveCursorToRef("chatSend");
      await clickCursor();
      setMessages(prev => [...prev, { role: "user", text: "Diş beyazlatma için yarın 14:00'e randevu almak istiyorum." }]);
      setInputText("");
      await moveCursorToCenter();
      
      // Scene 4: AI response
      setScene(4);
      setTyping(true);
      await wait(2000);
      setTyping(false);
      setMessages(prev => [...prev, { role: "ai", text: "Randevu talebinizi oluşturabilmem için adınızı ve telefon numaranızı paylaşabilir misiniz?" }]);
      await wait(1500);

      // Scene 5: Patient types details
      setScene(5);
      await moveCursorToRef("chatInput");
      await clickCursor();
      await typeText("Mert Kaya, 0555 123 45 67");
      await moveCursorToRef("chatSend");
      await clickCursor();
      setMessages(prev => [...prev, { role: "user", text: "Mert Kaya, 0555 123 45 67" }]);
      setInputText("");
      await moveCursorToCenter();

      // Scene 6: AI confirms
      setScene(6);
      setTyping(true);
      await wait(2000);
      setTyping(false);
      setMessages(prev => [...prev, { role: "ai", text: "Randevu talebinizi kliniğimize ilettim. Klinik ekibi talebinizi değerlendirdikten sonra onay veya uygun saat bilgisi için sizi SMS üzerinden bilgilendirecektir." }]);
      await wait(2500);

      // Scene 7: Admin Panel
      setScene(7);
      setView("admin");
      await wait(2500);

      // Scene 8: Cursor to row
      setScene(8);
      await moveCursorToRef("adminRow");
      await wait(1500);

      // Scene 9: Approve dropdown
      setScene(9);
      await moveCursorToRef("statusSelect");
      await clickCursor();
      setIsDropdownOpen(true);
      await wait(500);
      await moveCursorToRef("statusOption");
      await clickCursor();
      setIsDropdownOpen(false);
      setPanelStatus("confirmed");
      await wait(1000);

      // Scene 10: SMS Toast
      setScene(10);
      await moveCursorToCenter();
      setShowToast(true);
      await wait(4000);

      // Scene 11: Outro
      setScene(11);
      setView("outro");
    };

    runDemo();
  }, [isRecording]);

  const overlayTexts: Record<number, string> = {
    1: "Web siteniz yalnızca bir tanıtım sayfası olmak zorunda değil.",
    2: "ClinicBridge AI hastaları anında karşılar.",
    3: "ClinicBridge AI hastaları anında karşılar.",
    4: "Randevu niyetini anlar ve eksik bilgileri toplar.",
    5: "Randevu niyetini anlar ve eksik bilgileri toplar.",
    6: "Randevu niyetini anlar ve eksik bilgileri toplar.",
    7: "Talepler doğrudan klinik panelinize düşer.",
    8: "Talepler doğrudan klinik panelinize düşer.",
    9: "Klinik tek tıkla randevu talebini onaylar.",
    10: "Hasta otomatik SMS ile bilgilendirilir.",
    11: "ClinicBridge AI\nModern klinikler için AI destekli hasta dönüşüm altyapısı.\nclinicbridge-ai.com"
  };

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
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "relative", background: "#f8fafc", fontFamily: "sans-serif", cursor: isRecording ? "none" : "default" }}>
      
      {/* VIRTUAL CURSOR */}
      {cursorVisible && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          pointerEvents: "none",
          zIndex: 9999,
          transform: `translate(${cursorPos.x}px, ${cursorPos.y}px)`,
          transition: "transform 0.8s cubic-bezier(0.25, 1, 0.5, 1)"
        }}>
          <div style={{ position: "relative" }}>
            {/* The cursor pointer */}
            <MousePointer2 
              size={28} 
              fill="rgba(0,0,0,0.8)" 
              color="white" 
              strokeWidth={1.5}
              style={{
                filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.3))",
                transform: "translate(-6px, -2px)" // Adjust so the click point is the tip
              }}
            />
            {/* Ripple effect */}
            {cursorClicking && (
              <div style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: 20,
                height: 20,
                background: "rgba(59, 130, 246, 0.4)",
                borderRadius: "50%",
                transform: "translate(-50%, -50%)",
                animation: "ripple 0.4s ease-out forwards"
              }} />
            )}
          </div>
        </div>
      )}

      {/* SCENES */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", justifyContent: "center", alignItems: "center" }}>
        
        {/* Outro */}
        {view === "outro" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", animation: "fadein 1s" }}>
            <Logo />
            <h1 style={{ fontSize: 40, fontWeight: 800, color: "#0f172a", marginTop: 32, letterSpacing: "-0.02em" }}>ClinicBridge AI</h1>
            <p style={{ fontSize: 24, color: "#475569", marginTop: 16, fontWeight: 500 }}>Modern klinikler için AI destekli hasta dönüşüm altyapısı.</p>
            <p style={{ fontSize: 20, color: "#3b82f6", marginTop: 12, fontWeight: 600 }}>clinicbridge-ai.com</p>
          </div>
        )}

        {/* Website & Chat */}
        {view === "website" && (
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
                    <div ref={refs.chatInput} style={{ flex: 1, height: 44, background: "#f1f5f9", borderRadius: 22, padding: "0 16px", display: "flex", alignItems: "center", color: inputText ? "#0f172a" : "#94a3b8", fontSize: 15 }}>
                      {inputText || "Type a message..."}
                    </div>
                    <div ref={refs.chatSend} style={{ width: 44, height: 44, background: "#0f172a", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "white", flexShrink: 0 }}>
                      <Send size={18} style={{ marginLeft: 2 }} />
                    </div>
                  </div>
                </div>
              ) : (
                <div ref={refs.widgetButton} style={{ width: 64, height: 64, background: "#0f172a", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "white", boxShadow: "0 10px 25px rgba(15,23,42,0.3)" }}>
                  <MessageSquare size={32} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Admin Panel */}
        {view === "admin" && (
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
                <div style={{ background: "white", borderRadius: 16, border: "1px solid #e2e8f0", overflow: "visible", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", animation: "slideup 0.5s ease-out" }}>
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
                      <tr ref={refs.adminRow} style={{ background: "white", transition: "background 0.2s" }}>
                        <td style={{ padding: "20px 24px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#eff6ff", color: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <User size={18} />
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 15 }}>Mert Kaya</div>
                              <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>0555 123 45 67</div>
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
                            {/* Custom Fake Dropdown for the click animation target */}
                            <div style={{ position: "relative" }}>
                              <div 
                                ref={refs.statusSelect}
                                style={{
                                  padding: "8px 16px",
                                  borderRadius: 8,
                                  border: "1px solid #e2e8f0",
                                  background: panelStatus === "confirmed" ? "#f0fdf4" : "white",
                                  color: panelStatus === "confirmed" ? "#16a34a" : "#0f172a",
                                  fontSize: 14,
                                  fontWeight: 600,
                                  minWidth: 120,
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  transition: "all 0.3s"
                                }}
                              >
                                {panelStatus === "pending" ? "Bekliyor" : "Onaylandı"}
                                <div style={{ transform: isDropdownOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                </div>
                              </div>

                              {isDropdownOpen && (
                                <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: "white", border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)", zIndex: 100, minWidth: 120, overflow: "hidden" }}>
                                  <div style={{ padding: "8px 16px", fontSize: 14, fontWeight: 600, color: "#0f172a" }}>Bekliyor</div>
                                  <div ref={refs.statusOption} style={{ padding: "8px 16px", fontSize: 14, fontWeight: 600, color: "#16a34a", background: "#f0fdf4" }}>Onaylandı</div>
                                  <div style={{ padding: "8px 16px", fontSize: 14, fontWeight: 600, color: "#0f172a" }}>Reddedildi</div>
                                  <div style={{ padding: "8px 16px", fontSize: 14, fontWeight: 600, color: "#0f172a" }}>Tamamlandı</div>
                                </div>
                              )}
                            </div>
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

      {/* MANUAL CONTROLS (Hidden in recording mode) */}
      {!isRecording && (
        <div style={{ position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)", display: "flex", flexWrap: "wrap", gap: 16, zIndex: 200, justifyContent: "center", maxWidth: 600 }}>
          <div style={{ width: "100%", textAlign: "center", color: "#64748b", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            Manual Mode (Recording URL: ?mode=recording)
          </div>
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
        @keyframes ripple {
          0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; }
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
