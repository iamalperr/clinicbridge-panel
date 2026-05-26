"use client";

import { useState } from "react";
import Logo from "@/components/ui/Logo";
import { Send, User, Stethoscope, Calendar, Clock, MessageSquare, Menu, Settings, X, Check, Bell, Sparkles } from "lucide-react";

export default function LinkedinAssetsPage() {
  const [activeMockup, setActiveMockup] = useState<number>(1);

  const mockups = [
    { id: 1, title: "Mockup 1: Website & Launcher" },
    { id: 2, title: "Mockup 2: AI Chatbot" },
    { id: 3, title: "Mockup 3: Admin Panel (Appointments)" },
    { id: 4, title: "Mockup 4: Admin Panel (AI Training)" },
    { id: 5, title: "Mockup 5: Status Update & SMS" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px", fontFamily: "sans-serif" }}>
      
      {/* Controls (Outside the mockup area) */}
      <div style={{ display: "flex", gap: 12, marginBottom: 40, flexWrap: "wrap", justifyContent: "center" }}>
        {mockups.map((m) => (
          <button
            key={m.id}
            onClick={() => setActiveMockup(m.id)}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "none",
              background: activeMockup === m.id ? "#0f172a" : "white",
              color: activeMockup === m.id ? "white" : "#475569",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 2px 4px rgba(0,0,0,0.05)"
            }}
          >
            {m.title}
          </button>
        ))}
      </div>

      {/* The 16:9 Canvas */}
      <div 
        style={{ 
          width: 1440, 
          height: 810, 
          background: "#ffffff", 
          borderRadius: 24, 
          overflow: "hidden", 
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.15)",
          position: "relative",
          display: "flex",
          transformOrigin: "top center",
          transform: "scale(min(1, calc((100vw - 80px) / 1440)))"
        }}
      >
        
        {/* MOCKUP 1: Website with Widget Launcher */}
        {activeMockup === 1 && (
          <div style={{ width: "100%", height: "100%", position: "relative" }}>
            {/* Overlay Text */}
            <div style={{ position: "absolute", top: 80, left: 0, width: "100%", display: "flex", justifyContent: "center", zIndex: 100 }}>
              <div style={{ background: "white", padding: "24px 48px", borderRadius: 20, boxShadow: "0 20px 40px rgba(0,0,0,0.08)", textAlign: "center" }}>
                <h2 style={{ fontSize: 32, fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-0.5px" }}>Web siteniz sadece tanıtım sayfası olmak zorunda değil.</h2>
                <p style={{ fontSize: 18, color: "#475569", marginTop: 8, fontWeight: 500 }}>ClinicBridge AI Tech ziyaretçileri hasta talebine dönüştürür.</p>
              </div>
            </div>

            {/* Fake Website UI */}
            <div style={{ height: 80, borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", padding: "0 80px", justifyContent: "space-between", background: "#ffffff" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, background: "linear-gradient(135deg, #3b82f6, #2563eb)", borderRadius: 8 }}></div>
                Nova Dental
              </div>
              <div style={{ display: "flex", gap: 40, fontSize: 16, fontWeight: 500, color: "#475569" }}>
                <span>Ana Sayfa</span>
                <span>Tedaviler</span>
                <span>Hakkımızda</span>
                <span>İletişim</span>
              </div>
            </div>
            <div style={{ padding: "120px 80px", maxWidth: 900 }}>
              <h1 style={{ fontSize: 72, fontWeight: 800, color: "#0f172a", lineHeight: 1.1, marginBottom: 24 }}>
                Sağlıklı Gülüşler İçin Uzman Dokunuşu.
              </h1>
              <p style={{ fontSize: 22, color: "#475569", lineHeight: 1.6, marginBottom: 40 }}>
                Rahatlatıcı bir ortamda dünya standartlarında diş tedavileri alın. Hemen randevunuzu oluşturun, gülümsemenizi bize emanet edin.
              </p>
              <div style={{ background: "#3b82f6", color: "white", padding: "18px 36px", borderRadius: 100, display: "inline-block", fontWeight: 600, fontSize: 18 }}>
                Tedavileri İncele
              </div>
            </div>

            {/* Launcher */}
            <div style={{ position: "absolute", bottom: 60, right: 60, zIndex: 50 }}>
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", bottom: "100%", right: 0, marginBottom: 20, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                  <div style={{ background: "white", padding: "14px 24px", borderRadius: 20, borderBottomRightRadius: 4, boxShadow: "0 10px 25px rgba(0,0,0,0.1)", fontSize: 16, fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap" }}>
                    Size nasıl yardımcı olabilirim?
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ background: "white", padding: "8px 16px", borderRadius: 100, boxShadow: "0 4px 12px rgba(0,0,0,0.05)", fontSize: 13, fontWeight: 600, color: "#3b82f6" }}>Randevu Al</div>
                    <div style={{ background: "white", padding: "8px 16px", borderRadius: 100, boxShadow: "0 4px 12px rgba(0,0,0,0.05)", fontSize: 13, fontWeight: 600, color: "#475569" }}>Fiyat Sor</div>
                  </div>
                </div>
                <div style={{ width: 72, height: 72, background: "#3b82f6", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "white", boxShadow: "0 10px 25px rgba(59,130,246,0.4)", position: "relative" }}>
                  <MessageSquare size={36} />
                  <span style={{ position: "absolute", top: 4, right: 4, width: 16, height: 16, background: "#10b981", borderRadius: "50%", border: "3px solid white" }}></span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MOCKUP 2: AI Chatbot */}
        {activeMockup === 2 && (
          <div style={{ width: "100%", height: "100%", position: "relative", background: "#f8fafc" }}>
            {/* Background elements */}
            <div style={{ position: "absolute", top: -200, left: -200, width: 800, height: 800, background: "radial-gradient(circle, rgba(59,130,246,0.05) 0%, rgba(255,255,255,0) 70%)" }}></div>
            
            <div style={{ position: "absolute", top: 80, left: 80, maxWidth: 500 }}>
              <h2 style={{ fontSize: 48, fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-1px", lineHeight: 1.1 }}>Hasta sorar, AI eksik bilgileri toplar.</h2>
              <p style={{ fontSize: 20, color: "#475569", marginTop: 16, fontWeight: 500, lineHeight: 1.5 }}>Form doldurmadan, doğal sohbet akışıyla randevu talebi başlar.</p>
              <div style={{ marginTop: 40, display: "flex", gap: 16, alignItems: "center" }}>
                <Logo />
                <span style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>ClinicBridge AI Tech</span>
              </div>
            </div>

            <div style={{ position: "absolute", bottom: 60, right: 80, zIndex: 50 }}>
              <div style={{ width: 400, height: 680, background: "white", borderRadius: 24, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid #e2e8f0" }}>
                <div style={{ background: "#0f172a", padding: "20px", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 40, height: 40, background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Sparkles size={20} color="white" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>Nova Dental Asistan</div>
                      <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 8, height: 8, background: "#10b981", borderRadius: "50%" }}></span>
                        Online
                      </div>
                    </div>
                  </div>
                  <X size={20} opacity={0.6} />
                </div>
                
                <div style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 16, background: "#f8fafc" }}>
                  <div style={{ alignSelf: "flex-start", background: "white", color: "#0f172a", padding: "12px 16px", borderRadius: 18, borderBottomLeftRadius: 4, maxWidth: "85%", fontSize: 15, lineHeight: 1.5, boxShadow: "0 4px 12px rgba(0,0,0,0.05)", border: "1px solid #f1f5f9" }}>
                    Merhaba, ben Nova Dental asistanınız. Size randevu, tedaviler veya fiyat bilgisi konusunda yardımcı olabilirim.
                  </div>
                  <div style={{ alignSelf: "flex-end", background: "#3b82f6", color: "white", padding: "12px 16px", borderRadius: 18, borderBottomRightRadius: 4, maxWidth: "85%", fontSize: 15, lineHeight: 1.5, boxShadow: "0 4px 12px rgba(59,130,246,0.2)" }}>
                    Diş beyazlatma için yarın 14:00'e randevu almak istiyorum.
                  </div>
                  <div style={{ alignSelf: "flex-start", background: "white", color: "#0f172a", padding: "12px 16px", borderRadius: 18, borderBottomLeftRadius: 4, maxWidth: "85%", fontSize: 15, lineHeight: 1.5, boxShadow: "0 4px 12px rgba(0,0,0,0.05)", border: "1px solid #f1f5f9" }}>
                    Randevu talebinizi oluşturabilmem için adınızı ve telefon numaranızı paylaşabilir misiniz?
                  </div>
                </div>

                <div style={{ textAlign: "center", padding: "6px 0", background: "#f8fafc", fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>
                  Powered by <span style={{ fontWeight: 700 }}>ClinicBridge AI Tech</span>
                </div>

                <div style={{ padding: "16px 20px", background: "white", borderTop: "1px solid #e2e8f0", display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ flex: 1, height: 48, background: "#f1f5f9", borderRadius: 24, padding: "0 20px", display: "flex", alignItems: "center", color: "#94a3b8", fontSize: 15 }}>
                    Mesajınızı yazın...
                  </div>
                  <div style={{ width: 48, height: 48, background: "#3b82f6", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>
                    <Send size={20} style={{ marginLeft: 2 }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MOCKUP 3: Admin Panel (Appointments) */}
        {activeMockup === 3 && (
          <div style={{ width: "100%", height: "100%", background: "#f8fafc", display: "flex", position: "relative" }}>
            <div style={{ width: 260, background: "white", borderRight: "1px solid #e2e8f0", padding: 24, display: "flex", flexDirection: "column", zIndex: 10 }}>
              <div style={{ marginBottom: 40, display: "flex", alignItems: "center", gap: 12 }}>
                <Logo /><span style={{ fontWeight: 800, fontSize: 18 }}>ClinicBridge AI Tech</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ padding: "12px 16px", borderRadius: 8, color: "#64748b", display: "flex", alignItems: "center", gap: 12, fontWeight: 600 }}><Menu size={20} /> Dashboard</div>
                <div style={{ padding: "12px 16px", borderRadius: 8, color: "#3b82f6", background: "#eff6ff", display: "flex", alignItems: "center", gap: 12, fontWeight: 600 }}><Calendar size={20} /> Randevular</div>
                <div style={{ padding: "12px 16px", borderRadius: 8, color: "#64748b", display: "flex", alignItems: "center", gap: 12, fontWeight: 600 }}><MessageSquare size={20} /> AI Eğitimi</div>
                <div style={{ padding: "12px 16px", borderRadius: 8, color: "#64748b", display: "flex", alignItems: "center", gap: 12, fontWeight: 600 }}><Settings size={20} /> Ayarlar</div>
              </div>
            </div>
            
            <div style={{ flex: 1, padding: "60px 80px", position: "relative" }}>
              <div style={{ position: "absolute", top: 60, right: 80, textAlign: "right" }}>
                <h2 style={{ fontSize: 32, fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-0.5px" }}>Randevu talebi doğrudan klinik paneline düşer.</h2>
                <p style={{ fontSize: 18, color: "#475569", marginTop: 8, fontWeight: 500 }}>Hastadan alınan bilgiler klinik ekibinin takip edebileceği şekilde yapılandırılır.</p>
              </div>

              <div style={{ marginTop: 140 }}>
                <div style={{ background: "white", borderRadius: 16, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 10px 25px rgba(0,0,0,0.05)" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                        <th style={{ padding: "20px 32px", color: "#64748b", fontSize: 14, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Hasta</th>
                        <th style={{ padding: "20px 32px", color: "#64748b", fontSize: 14, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Hizmet</th>
                        <th style={{ padding: "20px 32px", color: "#64748b", fontSize: 14, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Tarih & Saat</th>
                        <th style={{ padding: "20px 32px", color: "#64748b", fontSize: 14, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Durum</th>
                        <th style={{ padding: "20px 32px", color: "#64748b", fontSize: 14, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Kaynak</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ background: "white", borderBottom: "1px solid #e2e8f0" }}>
                        <td style={{ padding: "24px 32px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#eff6ff", color: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <User size={20} />
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 16, color: "#0f172a" }}>Mert Kaya</div>
                              <div style={{ fontSize: 14, color: "#64748b", marginTop: 2 }}>0555 123 45 67</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "24px 32px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600, fontSize: 15, color: "#334155" }}>
                            <Stethoscope size={18} color="#64748b" /> Diş Beyazlatma
                          </div>
                        </td>
                        <td style={{ padding: "24px 32px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600, color: "#334155" }}><Calendar size={16} color="#64748b" /> Yarın</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, color: "#64748b", fontWeight: 500 }}><Clock size={16} /> 14:00</div>
                          </div>
                        </td>
                        <td style={{ padding: "24px 32px" }}>
                          <div style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #e2e8f0", background: "white", color: "#0f172a", fontSize: 14, fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "space-between", minWidth: 120 }}>
                            Bekliyor
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                          </div>
                        </td>
                        <td style={{ padding: "24px 32px" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px", background: "#f8fafc", borderRadius: 100, border: "1px solid #e2e8f0", fontSize: 14, fontWeight: 600, color: "#475569" }}>
                            🌐 AI Chatbot
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MOCKUP 4: Admin Panel (AI Training) */}
        {activeMockup === 4 && (
          <div style={{ width: "100%", height: "100%", background: "#f8fafc", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
            
            <div style={{ position: "absolute", top: 60, left: 0, width: "100%", textAlign: "center" }}>
              <h2 style={{ fontSize: 40, fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-0.5px" }}>AI sadece cevap vermez, öğrenmesi gereken konuları da gösterir.</h2>
              <p style={{ fontSize: 20, color: "#475569", marginTop: 12, fontWeight: 500 }}>Klinikler, yanıtlanamayan hasta sorularını panelden takip ederek asistanı sürekli geliştirebilir.</p>
            </div>

            <div style={{ display: "flex", gap: 40, marginTop: 100, alignItems: "flex-start" }}>
              {/* Left: Admin Panel Mockup */}
              <div style={{ width: 800, background: "white", borderRadius: 24, border: "1px solid #e2e8f0", overflow: "hidden", display: "flex", boxShadow: "0 20px 40px rgba(0,0,0,0.08)" }}>
                <div style={{ width: 220, background: "#f8fafc", borderRight: "1px solid #e2e8f0", padding: 20, display: "flex", flexDirection: "column" }}>
                  <div style={{ marginBottom: 32, display: "flex", alignItems: "center", gap: 10 }}>
                    <Logo /><span style={{ fontWeight: 800, fontSize: 16 }}>ClinicBridge AI Tech</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ padding: "10px 14px", borderRadius: 8, color: "#64748b", display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 600 }}><Menu size={18} /> Dashboard</div>
                    <div style={{ padding: "10px 14px", borderRadius: 8, color: "#64748b", display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 600 }}><Calendar size={18} /> Randevular</div>
                    <div style={{ padding: "10px 14px", borderRadius: 8, color: "#3b82f6", background: "#eff6ff", display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 600 }}><MessageSquare size={18} /> Görüşme Kayıtları</div>
                  </div>
                </div>
                
                <div style={{ flex: 1, padding: 32 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
                    {[
                      { label: "Toplam Görüşme", value: "124", color: "#3b82f6" },
                      { label: "Yanıtlanamayan Sorular", value: "7", color: "#ef4444" },
                      { label: "Eğitim Gereken Konular", value: "5", color: "#f59e0b" },
                      { label: "Randevuya Dönüşenler", value: "32", color: "#10b981" }
                    ].map((stat, i) => (
                      <div key={i} style={{ background: "white", padding: "16px", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
                        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{stat.label}</div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: stat.color, marginTop: 8 }}>{stat.value}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                          <th style={{ padding: "16px 20px", color: "#64748b", fontSize: 13, fontWeight: 700 }}>Hasta</th>
                          <th style={{ padding: "16px 20px", color: "#64748b", fontSize: 13, fontWeight: 700 }}>Görüşme Özeti</th>
                          <th style={{ padding: "16px 20px", color: "#64748b", fontSize: 13, fontWeight: 700 }}>Durum</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#fef2f2" }}>
                          <td style={{ padding: "16px 20px", fontWeight: 700, color: "#0f172a", fontSize: 14 }}>Anonim Ziyaretçi</td>
                          <td style={{ padding: "16px 20px", color: "#475569", fontWeight: 500, fontSize: 14 }}>"İmplant sonrası ne zaman yemek yiyebilirim?"</td>
                          <td style={{ padding: "16px 20px" }}>
                            <span style={{ background: "#fee2e2", color: "#dc2626", padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700 }}>Eğitim Gerekli</span>
                          </td>
                        </tr>
                        <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                          <td style={{ padding: "16px 20px", fontWeight: 700, color: "#0f172a", fontSize: 14 }}>Mert Kaya</td>
                          <td style={{ padding: "16px 20px", color: "#475569", fontWeight: 500, fontSize: 14 }}>"Diş beyazlatma için randevu talebi oluşturdu."</td>
                          <td style={{ padding: "16px 20px" }}>
                            <span style={{ background: "#dcfce7", color: "#16a34a", padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700 }}>Randevuya Dönüştü</span>
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: "16px 20px", fontWeight: 700, color: "#0f172a", fontSize: 14 }}>Deniz Yılmaz</td>
                          <td style={{ padding: "16px 20px", color: "#475569", fontWeight: 500, fontSize: 14 }}>"Gece plağı fiyatı hakkında bilgi istedi."</td>
                          <td style={{ padding: "16px 20px" }}>
                            <span style={{ background: "#fef3c7", color: "#d97706", padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700 }}>Canlı Destek Gerekli</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Right: AI Insight Card */}
              <div style={{ width: 380, background: "white", borderRadius: 24, border: "2px solid #e0e7ff", padding: 32, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.15)", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 6, background: "linear-gradient(90deg, #6366f1, #3b82f6)" }}></div>
                
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                  <div style={{ width: 44, height: 44, background: "#eef2ff", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Sparkles size={24} color="#6366f1" />
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>AI Eğitim Önerisi</div>
                </div>

                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Konu:</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>İmplant sonrası bakım</div>
                </div>

                <div style={{ marginBottom: 24, padding: 16, background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Hasta Sorusu:</div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: "#334155", fontStyle: "italic" }}>"İmplant sonrası ne zaman yemek yiyebilirim?"</div>
                </div>

                <div style={{ padding: 16, background: "#f0fdf4", borderRadius: 12, border: "1px solid #bbf7d0" }}>
                  <div style={{ fontSize: 13, color: "#16a34a", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Önerilen Aksiyon:</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#166534" }}>Bu konuda kliniğe özel bilgi ekleyerek AI yanıt kalitesini artırın.</div>
                </div>
                
                <div style={{ marginTop: 24, width: "100%", padding: "14px", background: "#6366f1", color: "white", textAlign: "center", borderRadius: 10, fontWeight: 700, fontSize: 15 }}>
                  Bilgi Bankasına Ekle
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MOCKUP 5: Status Update & SMS */}
        {activeMockup === 5 && (
          <div style={{ width: "100%", height: "100%", background: "#f8fafc", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
            
            <div style={{ position: "absolute", top: 80, left: 0, width: "100%", textAlign: "center" }}>
              <h2 style={{ fontSize: 40, fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-0.5px" }}>Klinik onaylar, hasta SMS ile bilgilendirilir.</h2>
              <p style={{ fontSize: 20, color: "#475569", marginTop: 12, fontWeight: 500 }}>Hasta talebi net bir sürece bağlanır, klinik kontrolü kaybetmez.</p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 60 }}>
              
              {/* Admin Row Mockup */}
              <div style={{ background: "white", borderRadius: 16, border: "1px solid #e2e8f0", padding: "32px 40px", boxShadow: "0 20px 40px rgba(0,0,0,0.08)", width: 500 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 20, color: "#0f172a" }}>Mert Kaya</div>
                    <div style={{ fontSize: 15, color: "#64748b", marginTop: 4 }}>0555 123 45 67</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#16a34a", borderRadius: 8, fontSize: 15, fontWeight: 700 }}>
                    Onaylandı
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 32 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 16, color: "#334155", fontWeight: 600 }}>
                    <Stethoscope size={20} color="#64748b" /> Diş Beyazlatma
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 16, color: "#334155", fontWeight: 600 }}>
                    <Calendar size={20} color="#64748b" /> Yarın, 14:00
                  </div>
                </div>

                <div style={{ background: "#dcfce7", color: "#16a34a", padding: "16px 20px", borderRadius: 12, display: "flex", alignItems: "center", gap: 12, fontWeight: 700, fontSize: 16 }}>
                  <Check size={24} />
                  SMS Gönderildi
                </div>
              </div>

              {/* Phone Mockup */}
              <div style={{ width: 320, height: 500, background: "#f1f5f9", borderRadius: 40, border: "12px solid #0f172a", position: "relative", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)" }}>
                <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 120, height: 24, background: "#0f172a", borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}></div>
                
                <div style={{ padding: "60px 20px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ background: "white", padding: 16, borderRadius: 20, boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                        <div style={{ width: 24, height: 24, background: "#3b82f6", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <MessageSquare size={14} color="white" />
                        </div>
                        Mesajlar
                      </div>
                      <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>Şimdi</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>Nova Dental</div>
                    <div style={{ fontSize: 14, color: "#475569", lineHeight: 1.5 }}>Randevu talebiniz onaylandı. Diş Beyazlatma için yarın 14:00 randevu talebiniz uygun görülmüştür.</div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
