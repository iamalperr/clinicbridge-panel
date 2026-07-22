"use client";

import { use, useEffect, useState, useCallback } from "react";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import SectionCard from "@/components/ui/SectionCard";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ClinicNotificationSettings } from "@/lib/types/notification";

interface PageProps {
  params: Promise<{ clinicId: string }>;
}

const DEFAULT_SETTINGS: ClinicNotificationSettings = {
  clinic_id: "",
  patient_notifications_enabled: true,
  channels: [
    {
      channel: 'email',
      enabled: true,
      provider: 'resend',
      sender_name: '',
      sender_address: '',
      reply_to: '',
      signature: 'Saygılarımızla,\nKlinik Ekibi',
      default_language: 'tr'
    }
  ],
  enabled_events: [
    'appointment.request.created',
    'appointment.clinic.approved',
    'appointment.alternative.proposed',
    'appointment.confirmed',
    'appointment.rejected',
    'appointment.cancelled'
  ],
  created_at: new Date(),
  updated_at: new Date()
};

export default function NotificationsSettingsPage({ params }: PageProps) {
  const { clinicId } = use(params);
  const [settings, setSettings] = useState<ClinicNotificationSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const [notificationSettings, setNotificationSettings] = useState({
    patientAppointmentChannel: "email",
    requireEmail: true,
    requirePhone: false,
    emailEnabled: true,
    smsEnabled: false,
    whatsappEnabled: false
  });

  const loadSettings = useCallback(async () => {
    try {
      const snap = await getDoc(doc(db, "clinics", clinicId, "settings", "notifications"));
      if (snap.exists()) {
        const data = snap.data() as ClinicNotificationSettings;
        setSettings({ ...DEFAULT_SETTINGS, ...data });
      } else {
        setSettings({ ...DEFAULT_SETTINGS, clinic_id: clinicId });
      }

      // Load root clinic settings for notificationSettings
      const clinicSnap = await getDoc(doc(db, "clinics", clinicId));
      if (clinicSnap.exists()) {
        const data = clinicSnap.data();
        if (data.notificationSettings) {
          setNotificationSettings(data.notificationSettings);
        } else if (data.patientNotificationSettings) {
          // Graceful migration
          setNotificationSettings({
            patientAppointmentChannel: data.patientNotificationSettings.primaryChannel === "email_and_sms" || data.patientNotificationSettings.primaryChannel === "email_and_whatsapp" ? "email" : (data.patientNotificationSettings.primaryChannel || "email"),
            requireEmail: data.patientNotificationSettings.collectEmail ?? true,
            requirePhone: data.patientNotificationSettings.collectPhone ?? false,
            emailEnabled: data.patientNotificationSettings.enabledChannels?.includes("email") ?? true,
            smsEnabled: data.patientNotificationSettings.enabledChannels?.includes("sms") ?? false,
            whatsappEnabled: data.patientNotificationSettings.enabledChannels?.includes("whatsapp") ?? false
          });
        }
      }
    } catch (err) {
      console.error("Failed to load notification settings", err);
    } finally {
      setLoading(false);
    }
  }, [clinicId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const saveSettings = async () => {
    setIsSaving(true);
    setSaveStatus("idle");
    setErrorMsg("");
    try {
      // Save root clinic settings
      await updateDoc(doc(db, "clinics", clinicId), {
        notificationSettings: notificationSettings
      });

      // Save subcollection settings
      await updateDoc(doc(db, "clinics", clinicId, "settings", "notifications"), {
        ...settings,
        updated_at: serverTimestamp()
      });
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (err: any) {
      // If doc doesn't exist, we might need to setDoc
      if (err.code === 'not-found') {
          const { setDoc } = await import('firebase/firestore');
          await setDoc(doc(db, "clinics", clinicId, "settings", "notifications"), {
            ...settings,
            updated_at: serverTimestamp(),
            created_at: serverTimestamp()
          });
          setSaveStatus("success");
          setTimeout(() => setSaveStatus("idle"), 3000);
      } else {
          console.error("Settings save error:", err);
          setErrorMsg(err?.message ?? "Kaydedilemedi. Lütfen tekrar deneyin.");
          setSaveStatus("error");
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 100, textAlign: "center", color: UI_COLORS.textMuted }}>
        <Loader2 size={32} className="animate-spin" style={{ margin: "0 auto 12px" }} />
        <p style={{ fontSize: 14 }}>Yükleniyor…</p>
      </div>
    );
  }

  const emailChannel = settings.channels.find(c => c.channel === 'email') || DEFAULT_SETTINGS.channels[0];

  const updateEmailChannel = (updates: any) => {
    setSettings(prev => ({
      ...prev,
      channels: prev.channels.map(c => c.channel === 'email' ? { ...c, ...updates } : c)
    }));
  };

  const handleEventToggle = (event: any, checked: boolean) => {
    setSettings(prev => ({
      ...prev,
      enabled_events: checked 
        ? [...prev.enabled_events, event]
        : prev.enabled_events.filter(e => e !== event)
    }));
  };

  return (
    <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 32 }}>
      <div>
        <Link href={`/clinics/${clinicId}/settings`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: UI_COLORS.textMuted, fontSize: 13, textDecoration: 'none', marginBottom: 12 }}>
          <ArrowLeft size={14} /> Ayarlara Dön
        </Link>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: UI_COLORS.textPrimary }}>Hasta Bildirimleri</h2>
        <p style={{ color: UI_COLORS.textSecondary, fontSize: 14, marginTop: 4 }}>
          Randevu durumu değişikliklerinde hastalara gidecek otomatik e-posta ve SMS (yakında) bildirimlerini yönetin.
        </p>
      </div>

      <SectionCard title="Genel Durum">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: UI_COLORS.textPrimary }}>Hasta Bildirimleri Aktif</h3>
            <p style={{ fontSize: 13, color: UI_COLORS.textSecondary }}>Bu ayar kapatıldığında hastalara hiçbir otomatik bildirim gitmez.</p>
          </div>
          <input
            type="checkbox"
            checked={settings.patient_notifications_enabled}
            onChange={(e) => setSettings(prev => ({ ...prev, patient_notifications_enabled: e.target.checked }))}
            style={{ width: 20, height: 20, accentColor: UI_COLORS.brand, cursor: "pointer" }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 24, paddingTop: 24, borderTop: `1px solid ${UI_COLORS.border}` }}>
          <Select
            label="Birincil Bildirim Kanalı"
            value={notificationSettings.patientAppointmentChannel}
            onChange={(e) => setNotificationSettings(prev => ({ ...prev, patientAppointmentChannel: e.target.value }))}
            options={[
              { label: "E-Posta", value: "email" },
              { label: "SMS", value: "sms" },
              { label: "WhatsApp", value: "whatsapp" }
            ]}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, border: `1px solid ${UI_COLORS.border}`, borderRadius: 8 }}>
              <span style={{ fontSize: 14 }}>E-Posta Adresi Zorunlu Kıl</span>
              <input
                type="checkbox"
                checked={notificationSettings.requireEmail}
                onChange={(e) => setNotificationSettings(prev => ({ ...prev, requireEmail: e.target.checked }))}
                style={{ width: 18, height: 18, accentColor: UI_COLORS.brand, cursor: "pointer" }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, border: `1px solid ${UI_COLORS.border}`, borderRadius: 8 }}>
              <span style={{ fontSize: 14 }}>Telefon Numarası Zorunlu Kıl</span>
              <input
                type="checkbox"
                checked={notificationSettings.requirePhone}
                onChange={(e) => setNotificationSettings(prev => ({ ...prev, requirePhone: e.target.checked }))}
                style={{ width: 18, height: 18, accentColor: UI_COLORS.brand, cursor: "pointer" }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, border: `1px solid ${UI_COLORS.border}`, borderRadius: 8 }}>
              <span style={{ fontSize: 14 }}>E-Posta Bildirimleri Aktif</span>
              <input
                type="checkbox"
                checked={notificationSettings.emailEnabled}
                onChange={(e) => setNotificationSettings(prev => ({ ...prev, emailEnabled: e.target.checked }))}
                style={{ width: 18, height: 18, accentColor: UI_COLORS.brand, cursor: "pointer" }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, border: `1px solid ${UI_COLORS.border}`, borderRadius: 8 }}>
              <span style={{ fontSize: 14 }}>SMS Bildirimleri Aktif</span>
              <input
                type="checkbox"
                checked={notificationSettings.smsEnabled}
                onChange={(e) => setNotificationSettings(prev => ({ ...prev, smsEnabled: e.target.checked }))}
                style={{ width: 18, height: 18, accentColor: UI_COLORS.brand, cursor: "pointer" }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, border: `1px solid ${UI_COLORS.border}`, borderRadius: 8 }}>
              <span style={{ fontSize: 14 }}>WhatsApp Bildirimleri Aktif</span>
              <input
                type="checkbox"
                checked={notificationSettings.whatsappEnabled}
                onChange={(e) => setNotificationSettings(prev => ({ ...prev, whatsappEnabled: e.target.checked }))}
                style={{ width: 18, height: 18, accentColor: UI_COLORS.brand, cursor: "pointer" }}
              />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="E-Posta Ayarları (Email Channel)">
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 16, borderBottom: `1px solid ${UI_COLORS.border}` }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>E-Posta Gönderimi</span>
            <input
              type="checkbox"
              checked={emailChannel.enabled}
              onChange={(e) => updateEmailChannel({ enabled: e.target.checked })}
              style={{ width: 18, height: 18, accentColor: UI_COLORS.brand, cursor: "pointer" }}
            />
          </div>

          {emailChannel.enabled && (
            <>
              <Input
                label="Gönderen Görünen Adı"
                value={emailChannel.sender_name || ''}
                onChange={(e) => updateEmailChannel({ sender_name: e.target.value })}
                placeholder="Örn: Nova Dental Kliniği"
              />
              <Input
                label="Reply-To (Yanıt) Adresi"
                value={emailChannel.reply_to || ''}
                onChange={(e) => updateEmailChannel({ reply_to: e.target.value })}
                placeholder="Örn: iletisim@novadental.com"
              />
              <Select
                label="Varsayılan Dil"
                value={emailChannel.default_language}
                onChange={(e) => updateEmailChannel({ default_language: e.target.value })}
                options={[
                  { label: "Türkçe", value: "tr" },
                  { label: "İngilizce", value: "en" },
                ]}
              />
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  E-Posta İmzası
                </label>
                <textarea
                  value={emailChannel.signature || ''}
                  onChange={(e) => updateEmailChannel({ signature: e.target.value })}
                  rows={4}
                  style={{
                    width: "100%", padding: "12px", fontSize: 14, color: UI_COLORS.textPrimary,
                    background: "var(--bg-input)", border: `1px solid ${UI_COLORS.border}`,
                    borderRadius: 8, outline: "none", resize: "vertical"
                  }}
                  placeholder="Saygılarımızla,&#10;Nova Dental Ekibi"
                />
              </div>
            </>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Hangi Durumlarda Bildirim Gitsin?">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { id: 'appointment.request.created', label: 'Yeni Randevu Talebi Alındığında (Ön Randevu)' },
            { id: 'appointment.clinic.approved', label: 'Klinik Talebi Onayladığında (Kesinleşti)' },
            { id: 'appointment.alternative.proposed', label: 'Klinik Alternatif Tarih Önerdiğinde' },
            { id: 'appointment.rejected', label: 'Randevu Talebi Reddedildiğinde' },
            { id: 'appointment.cancelled', label: 'Randevu İptal Edildiğinde' }
          ].map(event => (
            <div key={event.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="checkbox"
                id={event.id}
                checked={settings.enabled_events.includes(event.id as any)}
                onChange={(e) => handleEventToggle(event.id, e.target.checked)}
                style={{ width: 16, height: 16, accentColor: UI_COLORS.brand, cursor: "pointer" }}
              />
              <label htmlFor={event.id} style={{ fontSize: 14, cursor: "pointer", color: UI_COLORS.textPrimary }}>
                {event.label}
              </label>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Save Button */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 16, marginTop: 16, paddingTop: 24, borderTop: `1px solid ${UI_COLORS.border}` }}>
        {saveStatus === "success" && <span style={{ color: "#10b981", fontSize: 14, fontWeight: 500 }}>✓ Ayarlar kaydedildi</span>}
        {saveStatus === "error" && <span style={{ color: UI_COLORS.danger, fontSize: 14, fontWeight: 500 }}>{errorMsg}</span>}
        <Button onClick={saveSettings} disabled={isSaving} style={{ minWidth: 140 }}>
          {isSaving ? <Loader2 size={18} className="animate-spin" /> : "Değişiklikleri Kaydet"}
        </Button>
      </div>
    </div>
  );
}
