"use client";

import { use, useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useI18n } from "@/lib/i18n-context";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { Loader2, Calendar, Clock, User, Stethoscope, ChevronRight, Inbox, Phone, Mail, CheckCircle, XCircle, MessageSquare, Plus } from "lucide-react";
import Badge from "@/components/ui/Badge";
import type { Appointment } from "@/lib/types";

interface PageProps {
  params: Promise<{ clinicId: string }>;
}

export default function AppointmentsPage({ params }: PageProps) {
  const { clinicId } = use(params);
  const { t } = useI18n();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Manual Appointment Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newApptData, setNewApptData] = useState({ patientName: "", patientPhone: "", patientEmail: "", requestedService: "", requestedDate: "", requestedTime: "", notes: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "clinics", clinicId, "appointments"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const newData = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Appointment[];
      
      setAppointments(prev => {
        if (!loading && prev.length > 0 && newData.length > prev.length) {
          setToastMsg(t("appointments.newAppointmentToast") || "Yeni randevu talebi alındı.");
          setTimeout(() => setToastMsg(null), 4000);
          try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.15);
          } catch (e) {
            console.warn("Audio autoplay blocked or not supported", e);
          }
        }
        return newData;
      });
      setLoading(false);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching appointments:", error);
      setLoading(false);
    });
    return () => unsub();
  }, [clinicId]);

  const updateStatus = async (id: string, newStatus: string, convId?: string) => {
    setUpdatingId(id);
    console.log("[APPOINTMENT_STATUS_UPDATE_START]", { appointmentId: id, newStatus });
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Unauthorized");

      const res = await fetch(`/api/clinics/${clinicId}/appointments/${id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      const data = await res.json();
      console.log("[APPOINTMENT_STATUS_UPDATE_RESPONSE]", data);
      
      if (!res.ok) {
        throw new Error(data.message || data.error || "Güncelleme başarısız");
      }

      if (data.unchanged) {
         setToastMsg("Randevu durumu zaten güncel.");
      } else if (data.patientNotificationSent) {
         setToastMsg("Randevu durumu güncellendi ve hastaya bilgilendirme gönderildi.");
      } else if (data.patientNotificationError) {
         setToastMsg("Randevu durumu güncellendi ancak hasta bilgilendirmesi gönderilemedi.");
      } else if (data.notification?.result?.reason === "no_email" || data.notification?.result?.reason === "no_phone") {
         setToastMsg("Randevu durumu güncellendi. Hastanın kayıtlı iletişim bilgisi bulunmuyor.");
      } else {
         setToastMsg("Randevu durumu güncellendi.");
      }
      
    } catch (e: any) {
      console.error("[APPOINTMENT_STATUS_UPDATE_FAILED]", e);
      setToastMsg(e.message || "Randevu durumu güncellenemedi.");
    } finally {
      setUpdatingId(null);
      setTimeout(() => setToastMsg(null), 4000);
    }
  };

  const handleAddAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Unauthorized");

      const res = await fetch(`/api/clinics/${clinicId}/appointments/manual`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(newApptData)
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Randevu eklenemedi");
      }

      setToastMsg("Randevu başarıyla eklendi.");
      setIsModalOpen(false);
      setNewApptData({ patientName: "", patientPhone: "", patientEmail: "", requestedService: "", requestedDate: "", requestedTime: "", notes: "" });
    } catch (e: any) {
      console.error(e);
      setToastMsg(e.message || "Randevu eklenirken hata oluştu.");
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setToastMsg(null), 4000);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 100, textAlign: "center", color: UI_COLORS.textMuted }}>
        <Loader2 size={32} className="animate-spin" style={{ margin: "0 auto 12px" }} />
        <p>{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "8px 0", position: "relative" }}>
      {/* Simple Toast */}
      {toastMsg && (
        <div style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          background: UI_COLORS.textPrimary,
          color: "white",
          padding: "12px 24px",
          borderRadius: 8,
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          zIndex: 9999,
          fontSize: 14,
          fontWeight: 500,
          animation: "fadein 0.3s"
        }}>
          {toastMsg}
        </div>
      )}

      <div style={{ marginBottom: 32, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.6px" }}>
            {t("appointments.title") || "Recent Appointments"}
          </h1>
          <p style={{ color: UI_COLORS.textSecondary, marginTop: 6, fontSize: 14.5, fontWeight: 500 }}>
            {t("appointments.subtitle") || "View recent appointments booked via AI or manually."}
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 16px",
            background: UI_COLORS.brand,
            color: "white",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 2px 4px rgba(99, 102, 241, 0.2)",
            transition: "all 0.2s"
          }}
          onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"}
          onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
        >
          <Plus size={16} strokeWidth={2.5} />
          Manuel Randevu Ekle
        </button>
      </div>

      {appointments.length === 0 ? (
        <div style={{ 
          padding: "64px 24px", 
          textAlign: "center", 
          background: UI_COLORS.bgCard, 
          borderRadius: 16, 
          border: `1px dashed ${UI_COLORS.border}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16
        }}>
          <div style={{ 
            width: 64, height: 64, borderRadius: "50%", background: "var(--bg-page)", 
            display: "flex", alignItems: "center", justifyContent: "center", color: UI_COLORS.textMuted 
          }}>
            <Inbox size={32} strokeWidth={1.5} />
          </div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 4 }}>
              {t("appointments.emptyTitle") || "No appointments yet"}
            </h3>
            <p style={{ fontSize: 14, color: UI_COLORS.textSecondary }}>
              {t("appointments.emptyDesc") || "AI or manual bookings will appear here."}
            </p>
          </div>
        </div>
      ) : (
        <div style={{ 
          background: UI_COLORS.bgCard, 
          border: `1px solid ${UI_COLORS.border}`, 
          borderRadius: 16, 
          overflow: "hidden" 
        }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "var(--bg-page)", borderBottom: `1px solid ${UI_COLORS.border}` }}>
                  <th style={{ padding: "16px 24px", fontSize: 12, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {t("appointments.columns.patient") || "Patient"}
                  </th>
                  <th style={{ padding: "16px 24px", fontSize: 12, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {t("appointments.columns.service") || "Service"}
                  </th>
                  <th style={{ padding: "16px 24px", fontSize: 12, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {t("appointments.columns.date") || "Date & Time"}
                  </th>
                  <th style={{ padding: "16px 24px", fontSize: 12, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {t("appointments.columns.status") || "Status"}
                  </th>
                  <th style={{ padding: "16px 24px", fontSize: 12, fontWeight: 700, color: UI_COLORS.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {t("appointments.columns.source") || "Source"}
                  </th>
                </tr>
              </thead>
              <tbody>
                  {appointments.map((apt) => {
                    const displayPhone = apt.patientPhone ? apt.patientPhone.replace(/-+$/, "") : "";
                    const displayService = apt.treatmentType || apt.requestedService || apt.service || apt.reason || "Belirtilmedi";
                    const aptAny = apt as any;
                    
                    let timeStr = "";
                    if (aptAny.preferredTimeText && aptAny.preferredTimeText.toLowerCase() !== "belirtilmedi" && aptAny.preferredTimeText.toLowerCase() !== "belirtilmemiş") {
                      timeStr = aptAny.preferredTimeText;
                    } else if (aptAny.preferredTimePeriod) {
                      const periodMap: Record<string, string> = {
                        morning: "Sabah",
                        afternoon: "Öğleden sonra",
                        evening: "Akşam",
                        earliest_available: "En erken uygun saat"
                      };
                      timeStr = periodMap[aptAny.preferredTimePeriod] || aptAny.preferredTimePeriod;
                    } else if (aptAny.preferredTimeStart && aptAny.preferredTimeEnd) {
                      timeStr = `${aptAny.preferredTimeStart} - ${aptAny.preferredTimeEnd}`;
                    } else {
                      timeStr = apt.preferredTime || apt.requestedTime || apt.appointmentDateTime || aptAny.appointmentTime || (aptAny.scheduledAt ? new Date(aptAny.scheduledAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : null) || aptAny.startTime || "";
                    }
                    
                    return (
                      <tr key={apt.id} style={{ borderBottom: `1px solid ${UI_COLORS.border}`, transition: "background 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-page)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                        <td style={{ padding: "16px 24px" }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(99, 102, 241, 0.1)", color: UI_COLORS.brand, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <User size={16} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: UI_COLORS.textPrimary }}>{apt.patientName || "-"}</span>
                            <span style={{ fontSize: '13px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Phone size={12} />
                              {apt.patientPhone || "-"}
                            </span>
                            {apt.patientEmail && (
                              <span style={{ fontSize: '13px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Mail size={12} />
                                {apt.patientEmail}
                              </span>
                            )}
                            {/* Notifications Status Block */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                              
                              {/* Clinic Notification */}
                              {apt.notificationStatus?.emailToClinic !== undefined && (
                                <div style={{
                                  display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 500,
                                  backgroundColor: apt.notificationStatus?.emailToClinic === 'sent' ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
                                  color: apt.notificationStatus?.emailToClinic === 'sent' ? "#16a34a" : "#dc2626",
                                  padding: '4px 8px', borderRadius: '12px', width: 'fit-content'
                                }}>
                                  {apt.notificationStatus?.emailToClinic === 'sent' ? <CheckCircle size={12} /> : <XCircle size={12} />}
                                  {apt.notificationStatus?.emailToClinic === 'sent' ? "Klinik e-postası gönderildi" : "Klinik e-postası gönderilemedi"}
                                </div>
                              )}

                              {/* Patient Notification */}
                              {(() => {
                                const status = apt.patientNotificationStatus;
                                
                                if (status === "ACCEPTED" || status === "SENT" || status === "sent") {
                                  return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 500, backgroundColor: "rgba(34, 197, 94, 0.1)", color: "#16a34a", padding: '4px 8px', borderRadius: '12px', width: 'fit-content' }}>
                                      <CheckCircle size={12} /> Hasta e-postası sağlayıcıya iletildi
                                    </div>
                                  );
                                } else if (status === "DELIVERED") {
                                  return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 500, backgroundColor: "rgba(34, 197, 94, 0.1)", color: "#16a34a", padding: '4px 8px', borderRadius: '12px', width: 'fit-content' }}>
                                      <CheckCircle size={12} /> Hasta e-postası teslim edildi
                                    </div>
                                  );
                                } else if (status === "MISSING_RECIPIENT" || status === "missing_contact") {
                                  return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 500, backgroundColor: "rgba(100, 116, 139, 0.1)", color: "#475569", padding: '4px 8px', borderRadius: '12px', width: 'fit-content' }}>
                                      <MessageSquare size={12} /> Hasta e-postası bulunmuyor
                                    </div>
                                  );
                                } else if (status === "NOT_CONFIGURED") {
                                  return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 500, backgroundColor: "rgba(100, 116, 139, 0.1)", color: "#475569", padding: '4px 8px', borderRadius: '12px', width: 'fit-content' }}>
                                      <MessageSquare size={12} /> Hasta bildirimi ayarlanmadı
                                    </div>
                                  );
                                } else if (status === "NOT_REQUESTED" || status === "SKIPPED") {
                                  return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 500, backgroundColor: "rgba(100, 116, 139, 0.1)", color: "#475569", padding: '4px 8px', borderRadius: '12px', width: 'fit-content' }}>
                                      <MessageSquare size={12} /> Hasta bildirimi gönderilmedi
                                    </div>
                                  );
                                } else if (status === "QUEUED") {
                                  return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 500, backgroundColor: "rgba(234, 179, 8, 0.1)", color: "#ca8a04", padding: '4px 8px', borderRadius: '12px', width: 'fit-content' }}>
                                      <Clock size={12} /> Hasta e-postası gönderiliyor
                                    </div>
                                  );
                                } else if (status === "FAILED" || status === "failed") {
                                  return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 500, backgroundColor: "rgba(239, 68, 68, 0.1)", color: "#dc2626", padding: '4px 8px', borderRadius: '12px', width: 'fit-content' }}>
                                      <XCircle size={12} /> Hasta e-postası gönderilemedi
                                    </div>
                                  );
                                } else {
                                  return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 500, backgroundColor: "rgba(100, 116, 139, 0.1)", color: "#475569", padding: '4px 8px', borderRadius: '12px', width: 'fit-content' }}>
                                      <MessageSquare size={12} /> Hasta e-posta durumu bilinmiyor
                                    </div>
                                  );
                                }
                              })()}
                            </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "16px 24px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: UI_COLORS.textPrimary, fontWeight: 500 }}>
                            <Stethoscope size={16} color={UI_COLORS.textMuted} />
                            {displayService}
                          </div>
                        </td>
                        <td style={{ padding: "16px 24px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, color: UI_COLORS.textPrimary, fontWeight: 500 }}>
                              <Calendar size={14} color={UI_COLORS.textMuted} />
                              {apt.requestedDate || apt.preferredDate}
                            </div>
                            {timeStr ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: UI_COLORS.textSecondary }}>
                                <Clock size={14} />
                                {timeStr}
                              </div>
                            ) : (
                              <div style={{ display: "inline-flex", alignItems: "center", padding: "2px 6px", background: "rgba(100, 116, 139, 0.1)", borderRadius: 4, color: "#475569", fontSize: 11, fontWeight: 600, marginTop: 2 }}>
                                Saat belirtilmedi
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "16px 24px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <select 
                              value={apt.status || "PENDING_REVIEW"}
                              onChange={(e) => updateStatus(apt.id!, e.target.value, apt.conversationId)}
                              disabled={updatingId === apt.id}
                              style={{
                                padding: "6px 12px",
                                borderRadius: 8,
                                border: `1px solid ${UI_COLORS.border}`,
                                background: UI_COLORS.bgCard,
                                fontSize: 13,
                                fontWeight: 500,
                                color: UI_COLORS.textPrimary,
                                cursor: updatingId === apt.id ? "not-allowed" : "pointer",
                                opacity: updatingId === apt.id ? 0.6 : 1,
                                outline: "none"
                              }}
                            >
                              <option value="PENDING_REVIEW">Ön Değerlendirme Bekliyor</option>
                              <option value="APPROVED">Talep Onaylandı</option>
                              <option value="CONFIRMED">Randevu Kesinleştirildi</option>
                              <option value="REJECTED">Talep Reddedildi</option>
                              <option value="CANCELLED">Randevu İptal Edildi</option>
                              {/* Legacy fallbacks just in case the DB has old status that is not yet mapped */}
                              {!["PENDING_REVIEW", "APPROVED", "CONFIRMED", "REJECTED", "CANCELLED"].includes(apt.status || "PENDING_REVIEW") && (
                                <option value={apt.status}>{apt.status}</option>
                              )}
                            </select>
                            {updatingId === apt.id && <Loader2 size={14} className="animate-spin" color={UI_COLORS.textMuted} />}
                          </div>
                        </td>
                        <td style={{ padding: "16px 24px" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "var(--bg-page)", borderRadius: 100, border: `1px solid ${UI_COLORS.border}`, fontSize: 12, fontWeight: 600, color: UI_COLORS.textSecondary }}>
                            {["ai_chat", "widget", "ai_chatbot"].includes(apt.source || "") ? "🌐 AI Chatbot" : (t(`appointments.source.${apt.source}`)?.includes("appointments.source") ? apt.source : (t(`appointments.source.${apt.source}`) || apt.source))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Manual Appointment Modal */}
      {isModalOpen && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999
        }}>
          <div style={{
            background: "white", borderRadius: 16, width: 480, maxWidth: "90%",
            boxShadow: "0 20px 40px rgba(0,0,0,0.1)", overflow: "hidden",
            display: "flex", flexDirection: "column"
          }}>
            <div style={{ padding: "20px 24px", borderBottom: `1px solid ${UI_COLORS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: UI_COLORS.textPrimary, margin: 0 }}>Manuel Randevu Ekle</h2>
              <button onClick={() => setIsModalOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: UI_COLORS.textSecondary }}>
                <XCircle size={20} />
              </button>
            </div>
            <form onSubmit={handleAddAppointment} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: UI_COLORS.textSecondary, marginBottom: 6 }}>Hasta Adı Soyadı *</label>
                <input required type="text" value={newApptData.patientName} onChange={e => setNewApptData({...newApptData, patientName: e.target.value})} style={{ width: "100%", padding: "10px 12px", border: `1px solid ${UI_COLORS.border}`, borderRadius: 8, fontSize: 14 }} />
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: UI_COLORS.textSecondary, marginBottom: 6 }}>Telefon *</label>
                  <input required type="text" value={newApptData.patientPhone} onChange={e => setNewApptData({...newApptData, patientPhone: e.target.value})} style={{ width: "100%", padding: "10px 12px", border: `1px solid ${UI_COLORS.border}`, borderRadius: 8, fontSize: 14 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: UI_COLORS.textSecondary, marginBottom: 6 }}>E-posta</label>
                  <input type="email" value={newApptData.patientEmail} onChange={e => setNewApptData({...newApptData, patientEmail: e.target.value})} style={{ width: "100%", padding: "10px 12px", border: `1px solid ${UI_COLORS.border}`, borderRadius: 8, fontSize: 14 }} />
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: UI_COLORS.textSecondary, marginBottom: 6 }}>Tedavi / Hizmet *</label>
                <input required type="text" value={newApptData.requestedService} onChange={e => setNewApptData({...newApptData, requestedService: e.target.value})} style={{ width: "100%", padding: "10px 12px", border: `1px solid ${UI_COLORS.border}`, borderRadius: 8, fontSize: 14 }} />
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: UI_COLORS.textSecondary, marginBottom: 6 }}>Tarih *</label>
                  <input required type="date" value={newApptData.requestedDate} onChange={e => setNewApptData({...newApptData, requestedDate: e.target.value})} style={{ width: "100%", padding: "10px 12px", border: `1px solid ${UI_COLORS.border}`, borderRadius: 8, fontSize: 14 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: UI_COLORS.textSecondary, marginBottom: 6 }}>Saat *</label>
                  <input required type="time" value={newApptData.requestedTime} onChange={e => setNewApptData({...newApptData, requestedTime: e.target.value})} style={{ width: "100%", padding: "10px 12px", border: `1px solid ${UI_COLORS.border}`, borderRadius: 8, fontSize: 14 }} />
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: UI_COLORS.textSecondary, marginBottom: 6 }}>Notlar</label>
                <textarea value={newApptData.notes} onChange={e => setNewApptData({...newApptData, notes: e.target.value})} style={{ width: "100%", padding: "10px 12px", border: `1px solid ${UI_COLORS.border}`, borderRadius: 8, fontSize: 14, minHeight: 60 }} />
              </div>
              <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={{ padding: "10px 16px", background: "none", border: "none", color: UI_COLORS.textSecondary, fontWeight: 600, cursor: "pointer" }}>İptal</button>
                <button type="submit" disabled={isSubmitting} style={{ padding: "10px 24px", background: UI_COLORS.brand, color: "white", border: "none", borderRadius: 8, fontWeight: 600, cursor: isSubmitting ? "not-allowed" : "pointer", opacity: isSubmitting ? 0.7 : 1, display: "flex", alignItems: "center", gap: 8 }}>
                  {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadein { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
