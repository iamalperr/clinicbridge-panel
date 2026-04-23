"use client";

import { useState } from "react";
import SectionCard from "@/components/ui/SectionCard";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { UI_COLORS } from "@/components/ui/ui-shared";

export default function ClinicSettingsPage() {
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Mock State
  const [form, setForm] = useState({
    name: "Acıbadem Health",
    domain: "acibadem.com",
    aiEnabled: "active",
    language: "tr",
    welcomeMessage: "Merhaba! Size nasıl yardımcı olabilirim?",
    kvkkRequired: true
  });

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    }, 800);
  };

  return (
    <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 32 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: UI_COLORS.textPrimary }}>Klinik Ayarları</h2>
        <p style={{ color: UI_COLORS.textSecondary, fontSize: 14, marginTop: 4 }}>
          Klinik profilinizi ve temel asistan yapılandırmalarınızı yönetin.
        </p>
      </div>

      <SectionCard title="Genel Bilgiler">
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Input 
            label="Klinik Adı" 
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input 
            label="Klinik Domain" 
            value={form.domain}
            placeholder="örn: clinic.com"
            onChange={(e) => setForm({ ...form, domain: e.target.value })}
          />
        </div>
      </SectionCard>

      <SectionCard title="AI Asistan Konfigürasyonu">
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Select 
            label="Asistan Durumu"
            value={form.aiEnabled}
            onChange={(e) => setForm({ ...form, aiEnabled: e.target.value })}
            options={[
              { label: "Aktif (Kullanıcılarla Etkileşimde)", value: "active" },
              { label: "Pasif (Kapalı)", value: "inactive" }
            ]}
          />
          <Select 
            label="Birincil Dil"
            value={form.language}
            onChange={(e) => setForm({ ...form, language: e.target.value })}
            options={[
              { label: "Türkçe", value: "tr" },
              { label: "İngilizce", value: "en" }
            ]}
          />
          <Textarea 
            label="Karşılama Mesajı" 
            value={form.welcomeMessage}
            onChange={(e) => setForm({ ...form, welcomeMessage: e.target.value })}
            rows={3}
          />
        </div>
      </SectionCard>

      <SectionCard title="Güvenlik ve KVKK">
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <input 
            type="checkbox" 
            id="kvkk"
            checked={form.kvkkRequired}
            onChange={(e) => setForm({ ...form, kvkkRequired: e.target.checked })}
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

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Button onClick={handleSave} isLoading={isSaving}>
          Değişiklikleri Kaydet
        </Button>
        {showSuccess && <span style={{ color: "#10b981", fontSize: 13, fontWeight: 600 }}>Başarıyla kaydedildi!</span>}
      </div>
    </div>
  );
}
