"use client";

import { use, useEffect, useState, useCallback } from "react";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import SectionCard from "@/components/ui/SectionCard";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ClinicNotificationSettings, ClinicEmailSettings } from "@/lib/types/notification";

/** Keep in sync with lib/services/notifications/whatsapp/settings.ts — do not import that module from the client. */
const MAX_WHATSAPP_RECIPIENTS = 5;

type WhatsAppRecipientDraft = { phone: string; optIn: boolean };

const emptyWhatsAppRecipient = (): WhatsAppRecipientDraft => ({ phone: "", optIn: false });

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
  const { getToken } = useAuth();
  const [settings, setSettings] = useState<ClinicNotificationSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  
  // New Email Settings state
  const [emailSettings, setEmailSettings] = useState<Partial<ClinicEmailSettings>>({});
  const [testEmailAddress, setTestEmailAddress] = useState("");
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{success?: boolean; message?: string} | null>(null);

  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappRecipients, setWhatsappRecipients] = useState<WhatsAppRecipientDraft[]>([emptyWhatsAppRecipient()]);
  const [testWhatsAppPhone, setTestWhatsAppPhone] = useState("");
  const [isSendingWhatsAppTest, setIsSendingWhatsAppTest] = useState(false);
  const [whatsappTestResult, setWhatsappTestResult] = useState<{ success?: boolean; message?: string } | null>(null);

  const [notificationSettings, setNotificationSettings] = useState({
    patient: {
      appointmentChannel: "email",
      requireEmail: true,
      requirePhone: false
    },
    clinic: {
      newAppointmentEmailEnabled: true,
      recipientEmails: [""]
    }
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
          // Normalize to new schema if upgrading from old flat schema
          const ns = data.notificationSettings;
          if (ns.patient || ns.clinic) {
            setNotificationSettings({
              patient: {
                appointmentChannel: ns.patient?.appointmentChannel || ns.patientAppointmentChannel || "email",
                requireEmail: ns.patient?.requireEmail ?? ns.requireEmail ?? true,
                requirePhone: ns.patient?.requirePhone ?? ns.requirePhone ?? false
              },
              clinic: {
                newAppointmentEmailEnabled: ns.clinic?.newAppointmentEmailEnabled ?? true,
                recipientEmails: ns.clinic?.recipientEmails || [data.notificationEmail || data.email || ""]
              }
            });
          } else {
            // Migration from flat schema
            setNotificationSettings({
              patient: {
                appointmentChannel: ns.patientAppointmentChannel || "email",
                requireEmail: ns.requireEmail ?? true,
                requirePhone: ns.requirePhone ?? false
              },
              clinic: {
                newAppointmentEmailEnabled: true,
                recipientEmails: [data.notificationEmail || data.email || ""]
              }
            });
          }
        } else if (data.patientNotificationSettings) {
          // Legacy migration
          setNotificationSettings({
            patient: {
              appointmentChannel: data.patientNotificationSettings.primaryChannel === "email_and_sms" || data.patientNotificationSettings.primaryChannel === "email_and_whatsapp" ? "email" : (data.patientNotificationSettings.primaryChannel || "email"),
              requireEmail: data.patientNotificationSettings.collectEmail ?? true,
              requirePhone: data.patientNotificationSettings.collectPhone ?? false
            },
            clinic: {
              newAppointmentEmailEnabled: true,
              recipientEmails: [data.notificationEmail || data.email || ""]
            }
          });
        }
      }

      // Load new email settings from API
      try {
        const emailRes = await fetch(`/api/clinics/${clinicId}/settings/email`);
        if (emailRes.ok) {
          const emailData = await emailRes.json();
          setEmailSettings(emailData);
        }
      } catch (err) {
        console.error("Failed to fetch email settings API", err);
      }

      try {
        const token = await getToken();
        if (token) {
          const waRes = await fetch(`/api/clinics/${clinicId}/settings/whatsapp`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (waRes.ok) {
            const waData = await waRes.json();
            setWhatsappEnabled(waData.enabled === true);
            const loaded: WhatsAppRecipientDraft[] = Array.isArray(waData.recipients) && waData.recipients.length > 0
              ? waData.recipients.map((r: { phone?: string; optIn?: boolean }) => ({
                  phone: typeof r.phone === "string" ? r.phone : "",
                  optIn: r.optIn === true,
                }))
              : [emptyWhatsAppRecipient()];
            setWhatsappRecipients(loaded);
            if (!testWhatsAppPhone && loaded[0]?.phone) setTestWhatsAppPhone(loaded[0].phone);
          }
        }
      } catch (err) {
        console.error("Failed to fetch WhatsApp settings API", err);
      }

    } catch (err) {
      console.error("Failed to load notification settings", err);
    } finally {
      setLoading(false);
    }
  }, [clinicId, getToken]);

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

      // Save new email settings via API
      const emailRes = await fetch(`/api/clinics/${clinicId}/settings/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailSettings)
      });
      if (!emailRes.ok) throw new Error("E-posta ayarları API üzerinden kaydedilemedi.");

      const token = await getToken();
      if (!token) throw new Error("Oturum süresi doldu. Lütfen yeniden giriş yapın.");
      const waRes = await fetch(`/api/clinics/${clinicId}/settings/whatsapp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          enabled: whatsappEnabled,
          recipients: whatsappRecipients
            .map((r) => ({ phone: r.phone.trim(), optIn: r.optIn === true }))
            .filter((r) => r.phone),
        }),
      });
      if (!waRes.ok) {
        const waErr = await waRes.json().catch(() => ({}));
        if (waErr?.errors?.some((e: { code?: string }) => e.code === "opt_in_required")) {
          throw new Error("Her WhatsApp numarası için onay kutusu zorunludur.");
        }
        if (waErr?.errors?.some((e: { code?: string }) => e.code === "invalid_number")) {
          throw new Error("WhatsApp numaraları E.164 formatında olmalıdır (ör. +905321112233).");
        }
        throw new Error("WhatsApp ayarları kaydedilemedi.");
      }
      const savedWa = await waRes.json();
      setWhatsappEnabled(savedWa.enabled === true);
      setWhatsappRecipients(
        Array.isArray(savedWa.recipients) && savedWa.recipients.length > 0
          ? savedWa.recipients.map((r: { phone?: string; optIn?: boolean }) => ({
              phone: typeof r.phone === "string" ? r.phone : "",
              optIn: r.optIn === true,
            }))
          : [emptyWhatsAppRecipient()]
      );

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

  const updateEmailSetting = (updates: Partial<ClinicEmailSettings>) => {
    setEmailSettings(prev => ({ ...prev, ...updates }));
  };

  const handleSendTestEmail = async () => {
    if (!testEmailAddress) {
      setTestResult({ success: false, message: "Lütfen bir e-posta adresi girin." });
      return;
    }
    setIsSendingTest(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/settings/email/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmailAddress })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({ success: true, message: data.message || "Test e-postası başarıyla gönderildi." });
      } else {
        setTestResult({ success: false, message: data.error || "E-posta gönderilemedi." });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: "Sunucu bağlantı hatası." });
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleSendWhatsAppTest = async () => {
    if (!testWhatsAppPhone) {
      setWhatsappTestResult({ success: false, message: "Lütfen test edilecek numarayı seçin." });
      return;
    }
    setIsSendingWhatsAppTest(true);
    setWhatsappTestResult(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("no_token");
      const res = await fetch(`/api/clinics/${clinicId}/settings/whatsapp/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ phone: testWhatsAppPhone }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setWhatsappTestResult({ success: true, message: "Test mesajı gönderildi." });
      } else if (res.status === 429) {
        setWhatsappTestResult({
          success: false,
          message:
            data.error === "daily_limit"
              ? "Günlük test limiti doldu (5/gün)."
              : `Çok sık denendi. ${data.retryAfterSeconds || 60} sn sonra tekrar deneyin.`,
        });
      } else if (data.status === "skipped") {
        setWhatsappTestResult({
          success: false,
          message: "WhatsApp bildirimleri şu an kapalı veya yapılandırılmamış (kill switch / env).",
        });
      } else {
        setWhatsappTestResult({
          success: false,
          message: data.error === "recipient_not_opted_in"
            ? "Önce numarayı kaydedin ve onay kutusunu işaretleyin."
            : "Test mesajı gönderilemedi.",
        });
      }
    } catch {
      setWhatsappTestResult({ success: false, message: "Sunucu bağlantı hatası." });
    } finally {
      setIsSendingWhatsAppTest(false);
    }
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
          Randevu durumu değişikliklerinde hastalara gidecek otomatik e-posta bildirimlerini yönetin.
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
            label="Birincil Hasta Bildirim Kanalı"
            value={notificationSettings.patient.appointmentChannel}
            onChange={(e) => setNotificationSettings(prev => ({ ...prev, patient: { ...prev.patient, appointmentChannel: e.target.value } }))}
            options={[
              { label: "E-Posta", value: "email" }
            ]}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, border: `1px solid ${UI_COLORS.border}`, borderRadius: 8 }}>
              <span style={{ fontSize: 14 }}>E-Posta Adresi Zorunlu Kıl</span>
              <input
                type="checkbox"
                checked={notificationSettings.patient.requireEmail}
                onChange={(e) => setNotificationSettings(prev => ({ ...prev, patient: { ...prev.patient, requireEmail: e.target.checked } }))}
                style={{ width: 18, height: 18, accentColor: UI_COLORS.brand, cursor: "pointer" }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, border: `1px solid ${UI_COLORS.border}`, borderRadius: 8 }}>
              <span style={{ fontSize: 14 }}>Telefon Numarası Zorunlu Kıl</span>
              <input
                type="checkbox"
                checked={notificationSettings.patient.requirePhone}
                onChange={(e) => setNotificationSettings(prev => ({ ...prev, patient: { ...prev.patient, requirePhone: e.target.checked } }))}
                style={{ width: 18, height: 18, accentColor: UI_COLORS.brand, cursor: "pointer" }}
              />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Klinik Ekibi Bildirimleri">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: UI_COLORS.textPrimary }}>Yeni Randevu E-Posta Bildirimi</h3>
            <p style={{ fontSize: 13, color: UI_COLORS.textSecondary }}>Yeni bir randevu talebi oluştuğunda belirtilen adreslere e-posta gönderilir.</p>
          </div>
          <input
            type="checkbox"
            checked={notificationSettings.clinic.newAppointmentEmailEnabled}
            onChange={(e) => setNotificationSettings(prev => ({ ...prev, clinic: { ...prev.clinic, newAppointmentEmailEnabled: e.target.checked } }))}
            style={{ width: 20, height: 20, accentColor: UI_COLORS.brand, cursor: "pointer" }}
          />
        </div>

        {notificationSettings.clinic.newAppointmentEmailEnabled && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 24, paddingTop: 24, borderTop: `1px solid ${UI_COLORS.border}` }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, color: UI_COLORS.textPrimary }}>Alıcı E-posta Adresleri</h4>
            {notificationSettings.clinic.recipientEmails.map((email, index) => (
              <div key={index} style={{ display: "flex", gap: 8 }}>
                <Input
                  value={email}
                  placeholder="ornek@klinik.com"
                  onChange={(e) => {
                    const newEmails = [...notificationSettings.clinic.recipientEmails];
                    newEmails[index] = e.target.value;
                    setNotificationSettings(prev => ({ ...prev, clinic: { ...prev.clinic, recipientEmails: newEmails } }));
                  }}
                  style={{ flex: 1 }}
                />
                <Button 
                  variant="secondary" 
                  onClick={() => {
                    const newEmails = notificationSettings.clinic.recipientEmails.filter((_, i) => i !== index);
                    setNotificationSettings(prev => ({ ...prev, clinic: { ...prev.clinic, recipientEmails: newEmails } }));
                  }}
                >Sil</Button>
              </div>
            ))}
            <Button 
              variant="secondary" 
              onClick={() => {
                setNotificationSettings(prev => ({ 
                  ...prev, 
                  clinic: { ...prev.clinic, recipientEmails: [...prev.clinic.recipientEmails, ""] } 
                }));
              }}
              style={{ width: "fit-content" }}
            >
              + Yeni Alıcı Ekle
            </Button>
          </div>
        )}
      </SectionCard>

      <SectionCard title="WhatsApp Bildirimleri (Klinik Ekibi)">
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <p style={{ fontSize: 13, color: UI_COLORS.textSecondary, margin: 0 }}>
            Mesajlar Meta üzerinden <strong>Clinic Bridge AI</strong> görünen adıyla gönderilir.
            Hasta sağlık detayı, telefon veya e-posta içerilmez; yalnızca ad soyad baş harfi, işlem, tarih ve panel linki yer alır.
          </p>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: UI_COLORS.textPrimary }}>WhatsApp Bildirimleri Aktif</h3>
              <p style={{ fontSize: 13, color: UI_COLORS.textSecondary }}>
                Yeni randevu ve iletişim taleplerinde onaylı ekip numaralarına şablon mesajı gönderilir. E-posta bildirimleri etkilenmez.
              </p>
            </div>
            <input
              type="checkbox"
              checked={whatsappEnabled}
              onChange={(e) => setWhatsappEnabled(e.target.checked)}
              style={{ width: 20, height: 20, accentColor: UI_COLORS.brand, cursor: "pointer" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8, borderTop: `1px solid ${UI_COLORS.border}` }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, color: UI_COLORS.textPrimary }}>
              Alıcı Numaralar (en fazla {MAX_WHATSAPP_RECIPIENTS})
            </h4>
            {whatsappRecipients.map((recipient, index) => (
              <div key={index} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, border: `1px solid ${UI_COLORS.border}`, borderRadius: 8 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <Input
                    value={recipient.phone}
                    placeholder="+905321112233"
                    onChange={(e) => {
                      const next = [...whatsappRecipients];
                      next[index] = { ...next[index], phone: e.target.value };
                      setWhatsappRecipients(next);
                    }}
                    style={{ flex: 1 }}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const next = whatsappRecipients.filter((_, i) => i !== index);
                      setWhatsappRecipients(next.length > 0 ? next : [emptyWhatsAppRecipient()]);
                    }}
                  >
                    Sil
                  </Button>
                </div>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: UI_COLORS.textPrimary, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={recipient.optIn}
                    onChange={(e) => {
                      const next = [...whatsappRecipients];
                      next[index] = { ...next[index], optIn: e.target.checked };
                      setWhatsappRecipients(next);
                    }}
                    style={{ width: 16, height: 16, marginTop: 2, accentColor: UI_COLORS.brand, cursor: "pointer" }}
                  />
                  <span>Bu kişi WhatsApp bildirimi almayı kabul etti</span>
                </label>
              </div>
            ))}
            {whatsappRecipients.length < MAX_WHATSAPP_RECIPIENTS && (
              <Button
                variant="secondary"
                onClick={() => setWhatsappRecipients((prev) => [...prev, emptyWhatsAppRecipient()])}
                style={{ width: "fit-content" }}
              >
                + Numara Ekle
              </Button>
            )}
          </div>

          <div style={{ marginTop: 8, padding: 16, borderRadius: 8, border: `1px solid ${UI_COLORS.border}`, background: UI_COLORS.bgPage }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Test mesajı gönder</h4>
            <p style={{ fontSize: 13, color: UI_COLORS.textSecondary, marginBottom: 16 }}>
              Önce numarayı kaydedin. Test, seçilen onaylı numaraya örnek değerlerle şablon mesajı yollar (dakikada 1, günde 5).
            </p>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <Select
                value={testWhatsAppPhone}
                onChange={(e) => setTestWhatsAppPhone(e.target.value)}
                options={[
                  { label: "Numara seçin", value: "" },
                  ...whatsappRecipients
                    .filter((r) => r.phone.trim() && r.optIn)
                    .map((r) => ({ label: r.phone.trim(), value: r.phone.trim() })),
                ]}
                style={{ flex: 1, marginBottom: 0 }}
              />
              <Button
                variant="secondary"
                onClick={handleSendWhatsAppTest}
                disabled={isSendingWhatsAppTest || !testWhatsAppPhone}
              >
                {isSendingWhatsAppTest ? <Loader2 size={16} className="animate-spin" /> : "Test mesajı gönder"}
              </Button>
            </div>
            {whatsappTestResult && (
              <div style={{ marginTop: 12, fontSize: 13, color: whatsappTestResult.success ? "#10b981" : UI_COLORS.danger }}>
                {whatsappTestResult.message}
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="E-Posta Ayarları (Email Channel)">
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 16, borderBottom: `1px solid ${UI_COLORS.border}` }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>E-Posta Gönderimi</span>
            <input
              type="checkbox"
              checked={emailSettings.emailEnabled ?? true}
              onChange={(e) => updateEmailSetting({ emailEnabled: e.target.checked })}
              style={{ width: 18, height: 18, accentColor: UI_COLORS.brand, cursor: "pointer" }}
            />
          </div>

          {(emailSettings.emailEnabled ?? true) && (
            <>
              <Input
                label="Gönderen Görünen Adı"
                value={emailSettings.senderDisplayName || ''}
                onChange={(e) => updateEmailSetting({ senderDisplayName: e.target.value })}
                placeholder="Örn: Nova Dental Kliniği"
              />
              <Input
                label="Reply-To (Yanıt) Adresi"
                value={emailSettings.replyToEmail || ''}
                onChange={(e) => updateEmailSetting({ replyToEmail: e.target.value })}
                placeholder="Örn: iletisim@novadental.com"
              />
              <Select
                label="Varsayılan Dil"
                value={emailSettings.defaultLocale || 'tr'}
                onChange={(e) => updateEmailSetting({ defaultLocale: e.target.value as any })}
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
                  value={emailSettings.emailSignature || ''}
                  onChange={(e) => updateEmailSetting({ emailSignature: e.target.value })}
                  rows={4}
                  style={{
                    width: "100%", padding: "12px", fontSize: 14, color: UI_COLORS.textPrimary,
                    background: "var(--bg-input)", border: `1px solid ${UI_COLORS.border}`,
                    borderRadius: 8, outline: "none", resize: "vertical"
                  }}
                  placeholder="Saygılarımızla,&#10;Nova Dental Ekibi"
                />
              </div>

              <div style={{ marginTop: 16, padding: 16, borderRadius: 8, border: `1px solid ${UI_COLORS.border}`, background: UI_COLORS.bgPage }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Test E-Postası Gönder</h4>
                <p style={{ fontSize: 13, color: UI_COLORS.textSecondary, marginBottom: 16 }}>Kaydetmeden önce yukarıdaki ayarların e-posta üzerinde nasıl görüneceğini test edebilirsiniz.</p>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <Input 
                    value={testEmailAddress}
                    onChange={(e) => setTestEmailAddress(e.target.value)}
                    placeholder="Test edilecek e-posta adresi"
                    style={{ flex: 1, marginBottom: 0 }}
                  />
                  <Button variant="secondary" onClick={handleSendTestEmail} disabled={isSendingTest || !testEmailAddress}>
                    {isSendingTest ? <Loader2 size={16} className="animate-spin" /> : "Test Gönder"}
                  </Button>
                </div>
                {testResult && (
                  <div style={{ marginTop: 12, fontSize: 13, color: testResult.success ? "#10b981" : UI_COLORS.danger }}>
                    {testResult.message}
                  </div>
                )}
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
