"use client";

import { use, useEffect, useState, useCallback } from "react";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import SectionCard from "@/components/ui/SectionCard";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { Loader2 } from "lucide-react";
import type { Clinic } from "@/lib/types";

interface PageProps {
  params: Promise<{ clinicId: string }>;
}

interface SettingsForm {
  name: string;
  domain: string;
  aiEnabled: "active" | "inactive";
  language: string;
  welcomeMessage: string;
  kvkkRequired: boolean;
  enableHumanHandoff: boolean;
  whatsappNumber: string;
  telegramUsername: string;
}

const DEFAULT_FORM: SettingsForm = {
  name: "",
  domain: "",
  aiEnabled: "active",
  language: "tr",
  welcomeMessage: "Merhaba! Size nasıl yardımcı olabilirim?",
  kvkkRequired: true,
  enableHumanHandoff: false,
  whatsappNumber: "",
  telegramUsername: "",
};

export default function ClinicSettingsPage({ params }: PageProps) {
  const { clinicId } = use(params);
  const { profile } = useAuth();

  const [form, setForm] = useState<SettingsForm>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  /* ── Load clinic data from Firestore ── */
  const loadClinic = useCallback(async () => {
    try {
      const snap = await getDoc(doc(db, "clinics", clinicId));
      if (snap.exists()) {
        const data = snap.data() as Clinic;
        setForm({
          name: data.name ?? "",
          domain: data.domain ?? "",
          aiEnabled: data.aiEnabled ?? "active",
          language: data.language ?? "tr",
          welcomeMessage: data.welcomeMessage ?? DEFAULT_FORM.welcomeMessage,
          kvkkRequired: data.kvkkRequired ?? true,
          enableHumanHandoff: data.enableHumanHandoff ?? false,
          whatsappNumber: data.whatsappNumber ?? "",
          telegramUsername: data.telegramUsername ?? "",
        });
      }
    } catch (err) {
      console.error("Settings load error:", err);
    } finally {
      setLoading(false);
    }
  }, [clinicId]);

  useEffect(() => { loadClinic(); }, [loadClinic]);

  /* ── Permission guard ── */
  const canEdit = profile?.role === "admin" || profile?.clinicId === clinicId;

  /* ── Save to Firestore ── */
  const handleSave = async () => {
    if (!canEdit) return;
    setIsSaving(true);
    setSaveStatus("idle");
    setErrorMsg("");
    try {
      const payload: Partial<Clinic> = {
        name: form.name.trim(),
        domain: form.domain.trim(),
        aiEnabled: form.aiEnabled,
        language: form.language,
        welcomeMessage: form.welcomeMessage.trim(),
        kvkkRequired: form.kvkkRequired,
        enableHumanHandoff: form.enableHumanHandoff,
        whatsappNumber: form.whatsappNumber.trim(),
        telegramUsername: form.telegramUsername.trim(),
      };
      await updateDoc(doc(db, "clinics", clinicId), {
        ...payload,
        updatedAt: serverTimestamp(),
      });
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (err: any) {
      console.error("Settings save error:", err);
      setErrorMsg(err?.message ?? "Kaydedilemedi. Lütfen tekrar deneyin.");
      setSaveStatus("error");
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

  const field = (key: keyof SettingsForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const check = (key: keyof SettingsForm) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.checked }));

  return (
    <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 32 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: UI_COLORS.textPrimary }}>Klinik Ayarları</h2>
        <p style={{ color: UI_COLORS.textSecondary, fontSize: 14, marginTop: 4 }}>
          Klinik profilinizi ve temel asistan yapılandırmalarınızı yönetin.
        </p>
      </div>

      {/* ── Genel Bilgiler ── */}
      <SectionCard title="Genel Bilgiler">
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Input
            label="Klinik Adı"
            value={form.name}
            onChange={field("name")}
            placeholder="örn: Nova Dental Kliniği"
          />
          <Input
            label="Klinik Domain"
            value={form.domain}
            onChange={field("domain")}
            placeholder="örn: novadentalclinic.com"
          />
        </div>
      </SectionCard>

      {/* ── AI Asistan Konfigürasyonu ── */}
      <SectionCard title="AI Asistan Konfigürasyonu">
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Select
            label="Asistan Durumu"
            value={form.aiEnabled}
            onChange={field("aiEnabled")}
            options={[
              { label: "Aktif (Kullanıcılarla Etkileşimde)", value: "active" },
              { label: "Pasif (Kapalı)", value: "inactive" },
            ]}
          />
          <Select
            label="Birincil Dil"
            value={form.language}
            onChange={field("language")}
            options={[
              { label: "Türkçe", value: "tr" },
              { label: "İngilizce", value: "en" },
            ]}
          />
          <Textarea
            label="Karşılama Mesajı"
            value={form.welcomeMessage}
            onChange={field("welcomeMessage")}
            rows={3}
          />
        </div>
      </SectionCard>

      {/* ── Güvenlik ve KVKK ── */}
      <SectionCard title="Güvenlik ve KVKK">
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <input
            type="checkbox"
            id="kvkk"
            checked={form.kvkkRequired}
            onChange={check("kvkkRequired")}
            style={{ marginTop: 4, width: 18, height: 18, accentColor: UI_COLORS.brand, cursor: "pointer" }}
          />
          <div>
            <label htmlFor="kvkk" style={{ fontSize: 14, fontWeight: 600, color: UI_COLORS.textPrimary, cursor: "pointer", display: "block" }}>
              KVKK Onayı Zorunlu
            </label>
            <p style={{ fontSize: 13, color: UI_COLORS.textSecondary, marginTop: 4, lineHeight: 1.5 }}>
              Hastalar AI asistanıyla sohbet etmeye başlamadan önce KVKK aydınlatma metnini onaylamak zorundadır.
            </p>
          </div>
        </div>
      </SectionCard>

      {/* ── Canlı Destek ── */}
      <SectionCard title="Canlı Destek & İletişim">
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            <input
              type="checkbox"
              id="handoff"
              checked={form.enableHumanHandoff}
              onChange={check("enableHumanHandoff")}
              style={{ marginTop: 4, width: 18, height: 18, accentColor: UI_COLORS.brand, cursor: "pointer" }}
            />
            <div>
              <label htmlFor="handoff" style={{ fontSize: 14, fontWeight: 600, color: UI_COLORS.textPrimary, cursor: "pointer", display: "block" }}>
                Canlı Desteğe Aktarım (Human Handoff)
              </label>
              <p style={{ fontSize: 13, color: UI_COLORS.textSecondary, marginTop: 4, lineHeight: 1.5 }}>
                Kullanıcı &quot;canlı destek, insana bağla, whatsapp&quot; gibi ifadeler kullanırsa asistan otomatik olarak canlı destek butonları sunar.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20, opacity: form.enableHumanHandoff ? 1 : 0.45, pointerEvents: form.enableHumanHandoff ? "auto" : "none", transition: "opacity .2s" }}>
            <Input
              label="WhatsApp Numarası"
              value={form.whatsappNumber}
              onChange={field("whatsappNumber")}
              placeholder="+90 555 123 45 67"
            />
            <Input
              label="Telegram Kullanıcı Adı veya Linki"
              value={form.telegramUsername}
              onChange={field("telegramUsername")}
              placeholder="örn: @clinicbridge"
            />
          </div>
        </div>
      </SectionCard>

      {/* ── Save Bar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Button onClick={handleSave} isLoading={isSaving} disabled={!canEdit || isSaving}>
          Değişiklikleri Kaydet
        </Button>
        {saveStatus === "success" && (
          <span style={{ color: "#10b981", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            ✓ Başarıyla kaydedildi!
          </span>
        )}
        {saveStatus === "error" && (
          <span style={{ color: "#ef4444", fontSize: 13, fontWeight: 600 }}>
            ✗ {errorMsg}
          </span>
        )}
        {!canEdit && (
          <span style={{ color: UI_COLORS.textMuted, fontSize: 12 }}>
            Bu kliniği düzenleme yetkiniz yok.
          </span>
        )}
      </div>

      <style>{`.animate-spin { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
