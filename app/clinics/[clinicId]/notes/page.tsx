"use client";

import { useState } from "react";
import SectionCard from "@/components/ui/SectionCard";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { UI_COLORS } from "@/components/ui/ui-shared";

export default function ClinicNotesPage() {
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Mock State
  const [notes, setNotes] = useState(
    "1. Kliniğimiz Pazar günleri kapalıdır.\n2. Diş teli kontrol randevuları sadece Dr. Yılmaz tarafından verilmektedir.\n3. Acil durumlarda hastaları nöbetçi polikliniğe yönlendir."
  );

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
        <h2 style={{ fontSize: 20, fontWeight: 800, color: UI_COLORS.textPrimary }}>Klinik Notları</h2>
        <p style={{ color: UI_COLORS.textSecondary, fontSize: 14, marginTop: 4 }}>
          Yapay zekânın davranışını ve hastalara vereceği cevapları yönlendirecek kuralları buraya ekleyebilirsiniz.
        </p>
      </div>

      <SectionCard title="Özel Yönergeler ve Notlar">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ fontSize: 13, color: UI_COLORS.textSecondary, lineHeight: 1.5 }}>
            Bu alana yazdığınız tüm notlar, AI asistanınızın "System Prompt" (Sistem Komutu) ayarlarına entegre edilecektir. AI asistan, hastalarla konuşurken bu kurallara katı bir şekilde uyar.
          </p>
          <Textarea 
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={12}
            placeholder="Örn: Hafta sonları randevu verme, tüm fiyat sorularını WhatsApp hattına yönlendir..."
            style={{ fontFamily: "monospace", fontSize: 13, lineHeight: 1.6 }}
          />
        </div>
      </SectionCard>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Button onClick={handleSave} isLoading={isSaving}>
          Notları Kaydet
        </Button>
        {showSuccess && <span style={{ color: "#10b981", fontSize: 13, fontWeight: 600 }}>Notlar güncellendi!</span>}
      </div>
    </div>
  );
}
