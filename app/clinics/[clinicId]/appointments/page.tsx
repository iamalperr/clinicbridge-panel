"use client";

import { use, useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useI18n } from "@/lib/i18n-context";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { Loader2, Calendar, Clock, User, Stethoscope, ChevronRight, Inbox, Phone, Mail, CheckCircle, XCircle, MessageSquare } from "lucide-react";
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
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Unauthorized");

      const res = await fetch(`/api/clinics/${clinicId}/appointments/${id}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ newStatus })
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Güncelleme başarısız");
      }

      if (data.notificationChannel) {
        const channelName = data.notificationChannel === "email" ? "e-posta" : data.notificationChannel === "whatsapp" ? "WhatsApp mesajı" : "SMS";
        if (data.notificationStatus === "sent" || data.success) { // Fallback if backend doesn't send exact status but succeeded
          setToastMsg(`Randevu durumu güncellendi ve hastaya ${channelName} gönderildi.`);
        } else {
          setToastMsg(`Randevu durumu güncellendi ancak hastaya ${channelName} gönderilemedi.`);
        }
      } else {
        setToastMsg(t("appointments.updateSuccess") || "Randevu durumu güncellendi.");
      }
    } catch (e) {
      console.error(e);
      setToastMsg(t("appointments.updateError") || "Randevu durumu güncellenemedi.");
    } finally {
      setUpdatingId(null);
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

      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.6px" }}>
          {t("appointments.title") || "Recent Appointments"}
        </h1>
        <p style={{ color: UI_COLORS.textSecondary, marginTop: 6, fontSize: 14.5, fontWeight: 500 }}>
          {t("appointments.subtitle") || "View recent appointments booked via AI or manually."}
        </p>
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
                            {/* Determine whether to show SMS or Email info based on notificationChannel or fallback */}
                              {apt.notificationStatus?.emailToClinic !== undefined ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                                  <div style={{
                                    display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 500,
                                    backgroundColor: apt.notificationStatus?.emailToClinic === 'sent' ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
                                    color: apt.notificationStatus?.emailToClinic === 'sent' ? "#16a34a" : "#dc2626",
                                    padding: '4px 8px', borderRadius: '12px', width: 'fit-content'
                                  }}>
                                    {apt.notificationStatus?.emailToClinic === 'sent' ? <CheckCircle size={12} /> : <XCircle size={12} />}
                                    {apt.notificationStatus?.emailToClinic === 'sent' ? "Klinik e-postası gönderildi" : "Klinik e-postası gönderilemedi"}
                                  </div>
                                  
                                  <div style={{
                                    display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 500,
                                    backgroundColor: apt.patientNotificationStatus === 'sent' ? "rgba(34, 197, 94, 0.1)" : apt.patientNotificationStatus !== undefined ? "rgba(239, 68, 68, 0.1)" : "rgba(100, 116, 139, 0.1)",
                                    color: apt.patientNotificationStatus === 'sent' ? "#16a34a" : apt.patientNotificationStatus !== undefined ? "#dc2626" : "#475569",
                                    padding: '4px 8px', borderRadius: '12px', width: 'fit-content'
                                  }}>
                                    {apt.patientNotificationStatus === 'sent' ? <CheckCircle size={12} /> : apt.patientNotificationStatus !== undefined ? <XCircle size={12} /> : <MessageSquare size={12} />}
                                    {apt.patientNotificationStatus === 'sent' ? "Hasta e-postası gönderildi" : apt.patientNotificationStatus !== undefined ? "E-posta gönderilemedi" : `${apt.notificationChannel === 'email' ? 'E-posta' : apt.notificationChannel === 'whatsapp' ? 'WhatsApp' : 'SMS'} seçili`}
                                  </div>
                                </div>
                              ) : apt.notificationChannel && apt.patientNotificationStatus ? (
                                <div style={{
                                  display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 500,
                                  backgroundColor: apt.patientNotificationStatus === "sent" ? "rgba(34, 197, 94, 0.1)" : 
                                                   apt.patientNotificationStatus === "failed" ? "rgba(239, 68, 68, 0.1)" : "rgba(100, 116, 139, 0.1)",
                                  color: apt.patientNotificationStatus === "sent" ? "#16a34a" : 
                                         apt.patientNotificationStatus === "failed" ? "#dc2626" : "#475569",
                                  padding: '4px 8px', borderRadius: '12px', width: 'fit-content', marginTop: '6px'
                                }}>
                                  {apt.patientNotificationStatus === "sent" ? <CheckCircle size={12} /> : 
                                   apt.patientNotificationStatus === "failed" ? <XCircle size={12} /> : <MessageSquare size={12} />}
                                  
                                  {apt.patientNotificationStatus === "sent" ? `${apt.notificationChannel === 'email' ? 'E-Posta' : apt.notificationChannel === 'whatsapp' ? 'WhatsApp' : 'SMS'} Gönderildi` : 
                                   apt.patientNotificationStatus === "failed" ? `${apt.notificationChannel === 'email' ? 'E-Posta' : apt.notificationChannel === 'whatsapp' ? 'WhatsApp' : 'SMS'} Gönderilemedi` : 
                                   apt.patientNotificationStatus === "missing_contact" ? "İletişim Bilgisi Yok" :
                                   "Bildirim Durumu Bekleniyor"}
                                </div>
                              ) : (
                                <div style={{
                                  display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 500,
                                  backgroundColor: "rgba(100, 116, 139, 0.1)", color: "#475569",
                                  padding: '4px 8px', borderRadius: '12px', width: 'fit-content', marginTop: '6px'
                                }}>
                                  <MessageSquare size={12} />
                                  {apt.notificationChannel ? `${apt.notificationChannel === 'email' ? 'E-posta' : apt.notificationChannel === 'whatsapp' ? 'WhatsApp' : 'SMS'} seçili` : "Bildirim Ayarlanmadı"}
                                </div>
                              )}
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
                            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: UI_COLORS.textSecondary }}>
                              <Clock size={14} />
                              {apt.requestedTime || apt.preferredTime}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "16px 24px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <select 
                              value={apt.status || "pending"}
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
                              <option value="pending">{t("appointments.status.pending") || "Bekliyor"}</option>
                              <option value="confirmed">{t("appointments.status.confirmed") || "Onaylandı"}</option>
                              <option value="cancelled">{t("appointments.status.cancelled") || "Reddedildi"}</option>
                              <option value="completed">{t("appointments.status.completed") || "Tamamlandı"}</option>
                            </select>
                            {updatingId === apt.id && <Loader2 size={14} className="animate-spin" color={UI_COLORS.textMuted} />}
                          </div>
                        </td>
                        <td style={{ padding: "16px 24px" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "var(--bg-page)", borderRadius: 100, border: `1px solid ${UI_COLORS.border}`, fontSize: 12, fontWeight: 600, color: UI_COLORS.textSecondary }}>
                            {apt.source === "ai_chat" || apt.source === "widget" ? "🌐 " + (t("appointments.source.ai_chat") || "AI Chatbot") : (t(`appointments.source.${apt.source}`) || apt.source)}
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

      <style>{`
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadein { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
