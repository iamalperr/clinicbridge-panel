"use client";

import React, { useState, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";
import { Calendar, Clock, CheckCircle2, AlertCircle, Loader2, Mail, Info, Edit3 } from "lucide-react";
import { Appointment } from "@/lib/types";
import { resolveAppointmentDisplaySchedule } from "@/lib/services/appointments/AppointmentScheduleResolver";
import { auth } from "@/lib/firebase";

export type AppointmentModalMode = "confirm" | "reschedule" | "edit_schedule";

interface AppointmentConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: Appointment | null;
  clinicId: string;
  mode?: AppointmentModalMode;
  onSuccess: (updatedData: { 
    confirmedDate?: string; 
    confirmedTime?: string; 
    requestedDate?: string;
    requestedTime?: string;
    status: string 
  }) => void;
}

export default function AppointmentConfirmModal({
  isOpen,
  onClose,
  appointment,
  clinicId,
  mode,
  onSuccess
}: AppointmentConfirmModalProps) {
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derive effective mode
  const effectiveMode: AppointmentModalMode = mode || (appointment?.status === "confirmed" ? "reschedule" : "confirm");

  useEffect(() => {
    if (!isOpen || !appointment) {
      setError(null);
      return;
    }

    const schedule = resolveAppointmentDisplaySchedule(appointment);
    
    // Set initial date
    if (appointment.confirmedDate && effectiveMode !== "edit_schedule") {
      setSelectedDate(appointment.confirmedDate);
    } else if (schedule.requestedDate && schedule.requestedDate !== "Bildirilecek") {
      setSelectedDate(schedule.requestedDate);
    } else {
      setSelectedDate(new Date().toISOString().split("T")[0]);
    }

    // Set initial time
    if (appointment.confirmedTime && effectiveMode !== "edit_schedule") {
      setSelectedTime(appointment.confirmedTime);
    } else if (schedule.requestedTime && schedule.requestedTime !== "Saat belirtilmedi") {
      const timeMatch = schedule.requestedTime.match(/\b\d{1,2}:\d{2}\b/);
      if (timeMatch) {
        setSelectedTime(timeMatch[0]);
      } else {
        setSelectedTime(schedule.requestedTime);
      }
    } else {
      setSelectedTime("10:00");
    }

    setChangeReason(appointment.rescheduleReason || appointment.notes || "");
    setError(null);
  }, [isOpen, appointment, effectiveMode]);

  if (!appointment) return null;

  const schedule = resolveAppointmentDisplaySchedule(appointment);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate.trim()) {
      setError("Lütfen randevu tarihini belirtin.");
      return;
    }
    if (!selectedTime.trim()) {
      setError("Lütfen randevu saatini belirtin.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error("Oturum süreniz dolmuş olabilir. Lütfen sayfayı yenileyip tekrar deneyin.");
      }

      const token = await user.getIdToken();

      let payload: Record<string, any> = {};

      if (effectiveMode === "edit_schedule") {
        payload = {
          status: appointment.status,
          requestedDate: selectedDate.trim(),
          requestedTime: selectedTime.trim(),
          preferredDate: selectedDate.trim(),
          preferredTime: selectedTime.trim(),
          notes: changeReason.trim() || undefined
        };
      } else {
        payload = {
          status: "confirmed",
          confirmedDate: selectedDate.trim(),
          confirmedTime: selectedTime.trim(),
          changeReason: changeReason.trim() || undefined
        };
      }

      const res = await fetch(`/api/clinics/${clinicId}/appointments/${appointment.id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || data.error || (data.success === false && !data.appointmentUpdated)) {
        throw new Error(data.message || data.error || "Randevu durumu güncellenirken bir hata oluştu.");
      }

      if (effectiveMode === "edit_schedule") {
        onSuccess({
          requestedDate: selectedDate.trim(),
          requestedTime: selectedTime.trim(),
          status: appointment.status
        });
      } else {
        onSuccess({
          confirmedDate: selectedDate.trim(),
          confirmedTime: selectedTime.trim(),
          status: "confirmed"
        });
      }
      onClose();
    } catch (err: any) {
      console.error("Appointment update error:", err);
      setError(err.message || "İşlem gerçekleştirilemedi.");
    } finally {
      setSubmitting(false);
    }
  };

  const patientEmail = appointment.patientEmail || "";

  // Title and button text based on mode
  let modalTitle = "Randevu Kesinleştirme";
  let submitButtonText = "Randevuyu Kesinleştir ve Bildir";
  let dateLabel = "Kesinleşen Tarih";
  let timeLabel = "Kesinleşen Saat";
  let noticeText = "✉️ Bu işlem tamamlandığında, hastaya belirlenen kesin tarih ve saati içeren resmi onay e-postası iletilecektir.";

  if (effectiveMode === "reschedule") {
    modalTitle = "Randevuyu Yeniden Planla";
    submitButtonText = "Değişikliği Kaydet ve Bildir";
    dateLabel = "Yeni Randevu Tarihi";
    timeLabel = "Yeni Randevu Saati";
    noticeText = "✉️ Bu işlem tamamlandığında, hastaya yeni randevu tarih ve saatini içeren güncellenmiş bildirim iletilecektir.";
  } else if (effectiveMode === "edit_schedule") {
    modalTitle = "Tarih ve Saati Düzenle";
    submitButtonText = "Değişikliği Kaydet";
    dateLabel = "Randevu Tarihi";
    timeLabel = "Randevu Saati";
    noticeText = "ℹ️ Bu işlem randevunun tarih ve saatini günceller. Randevu durumu değiştirilmez ve hastaya onay e-postası gönderilmez.";
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={submitting ? () => {} : onClose}
      title={modalTitle}
      width={540}
    >
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        
        {/* Patient Summary Card */}
        <div style={{
          background: "rgba(255, 255, 255, 0.03)",
          border: `1px solid ${UI_COLORS.border}`,
          borderRadius: 12,
          padding: "16px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 8
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: UI_COLORS.textMuted }}>Hasta:</span>
            <strong style={{ fontSize: 14, color: UI_COLORS.textPrimary }}>{appointment.patientName}</strong>
          </div>
          {appointment.service || appointment.requestedService || appointment.treatmentType ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: UI_COLORS.textMuted }}>İşlem / Hizmet:</span>
              <span style={{ fontSize: 13, color: UI_COLORS.textPrimary }}>
                {appointment.service || appointment.requestedService || appointment.treatmentType}
              </span>
            </div>
          ) : null}
          {patientEmail && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: UI_COLORS.textMuted }}>Bildirim E-postası:</span>
              <span style={{ fontSize: 13, color: "#818cf8", display: "flex", alignItems: "center", gap: 4 }}>
                <Mail size={12} /> {patientEmail}
              </span>
            </div>
          )}
        </div>

        {/* Initial Request Callout */}
        <div style={{
          background: "rgba(99, 102, 241, 0.08)",
          border: "1px solid rgba(99, 102, 241, 0.2)",
          borderRadius: 12,
          padding: "12px 16px",
          display: "flex",
          alignItems: "flex-start",
          gap: 12
        }}>
          <Info size={18} style={{ color: "#818cf8", marginTop: 2, flexShrink: 0 }} />
          <div style={{ fontSize: 13, color: UI_COLORS.textPrimary, lineHeight: 1.5 }}>
            <div style={{ fontWeight: 600, color: "#a5b4fc", marginBottom: 2 }}>Kayıtlı Talep:</div>
            <div>Tarih: <strong>{schedule.requestedDate}</strong> &bull; Saat: <strong>{schedule.requestedTime}</strong>
              {(appointment?.clinicTimeZone || appointment?.timezone) ? (
                <> &bull; Saat dilimi: <strong>{appointment.clinicTimeZone || appointment.timezone}</strong></>
              ) : null}
            </div>
            {appointment?.startsAtUtc ? (
              <div style={{ marginTop: 4, opacity: 0.85, fontSize: 12 }}>
                UTC: {appointment.startsAtUtc}
              </div>
            ) : null}
          </div>
        </div>

        {/* Form Inputs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          
          {/* Selected Date */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textPrimary, display: "flex", alignItems: "center", gap: 6 }}>
              <Calendar size={14} style={{ color: UI_COLORS.brand }} />
              {dateLabel} <span style={{ color: "#f87171" }}>*</span>
            </label>
            <input
              type="text"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              placeholder="Örn: 2026-08-05 veya 5 Ağustos 2026"
              required
              disabled={submitting}
              style={{
                background: "rgba(0, 0, 0, 0.25)",
                border: `1px solid ${UI_COLORS.border}`,
                borderRadius: 8,
                padding: "10px 12px",
                color: UI_COLORS.textPrimary,
                fontSize: 14,
                outline: "none",
                transition: UI_COMMON_STYLES.transition
              }}
            />
          </div>

          {/* Selected Time */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textPrimary, display: "flex", alignItems: "center", gap: 6 }}>
              <Clock size={14} style={{ color: UI_COLORS.brand }} />
              {timeLabel} <span style={{ color: "#f87171" }}>*</span>
            </label>
            <input
              type="text"
              value={selectedTime}
              onChange={(e) => setSelectedTime(e.target.value)}
              placeholder="Örn: 14:30"
              required
              disabled={submitting}
              style={{
                background: "rgba(0, 0, 0, 0.25)",
                border: `1px solid ${UI_COLORS.border}`,
                borderRadius: 8,
                padding: "10px 12px",
                color: UI_COLORS.textPrimary,
                fontSize: 14,
                outline: "none",
                transition: UI_COMMON_STYLES.transition
              }}
            />
          </div>
        </div>

        {/* Change / Reschedule Reason */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: UI_COLORS.textMuted }}>
            {effectiveMode === "edit_schedule" ? "İç Not / Açıklama" : "Açıklama / Değişiklik Nedeni"}{" "}
            <span style={{ fontSize: 11 }}>
              {effectiveMode === "edit_schedule" ? "(Opsiyonel)" : "(Opsiyonel, e-postada yer alır)"}
            </span>
          </label>
          <input
            type="text"
            value={changeReason}
            onChange={(e) => setChangeReason(e.target.value)}
            placeholder={
              effectiveMode === "edit_schedule" 
                ? "Örn: Hasta isteği üzerine tarih 14:00 olarak güncellendi." 
                : "Örn: Doktor takvimine göre saat 14:30 olarak güncellenmiştir."
            }
            disabled={submitting}
            style={{
              background: "rgba(0, 0, 0, 0.25)",
              border: `1px solid ${UI_COLORS.border}`,
              borderRadius: 8,
              padding: "10px 12px",
              color: UI_COLORS.textPrimary,
              fontSize: 13,
              outline: "none",
              transition: UI_COMMON_STYLES.transition
            }}
          />
        </div>

        {/* Notice */}
        <div style={{
          fontSize: 12,
          color: UI_COLORS.textMuted,
          lineHeight: 1.5,
          background: "rgba(255, 255, 255, 0.02)",
          padding: "10px 14px",
          borderRadius: 8,
          border: `1px solid ${UI_COLORS.border}`
        }}>
          {noticeText}
        </div>

        {/* Error Alert */}
        {error && (
          <div style={{
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: 8,
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: "#f87171",
            fontSize: 13
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              background: "transparent",
              border: `1px solid ${UI_COLORS.border}`,
              borderRadius: 8,
              padding: "9px 18px",
              color: UI_COLORS.textMuted,
              fontSize: 14,
              fontWeight: 500,
              cursor: submitting ? "not-allowed" : "pointer",
              transition: UI_COMMON_STYLES.transition
            }}
          >
            Vazgeç
          </button>

          <button
            type="submit"
            disabled={submitting}
            style={{
              background: "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)",
              border: "none",
              borderRadius: 8,
              padding: "9px 20px",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              boxShadow: "0 4px 12px rgba(79, 70, 229, 0.3)",
              transition: UI_COMMON_STYLES.transition
            }}
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                İşleniyor...
              </>
            ) : (
              <>
                {effectiveMode === "edit_schedule" ? <Edit3 size={16} /> : <CheckCircle2 size={16} />}
                {submitButtonText}
              </>
            )}
          </button>
        </div>

      </form>
    </Modal>
  );
}
