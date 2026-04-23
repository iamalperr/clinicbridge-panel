"use client";

import { UI_COLORS } from "@/components/ui/ui-shared";

export default function TermsPage() {
  return (
    <div>
      <h1 style={{ fontSize: 32, fontWeight: 800, color: UI_COLORS.textPrimary, marginBottom: 16 }}>Kullanım Şartları</h1>
      <p style={{ color: UI_COLORS.textSecondary, marginBottom: 32 }}>Son güncellenme: 23 Nisan 2026</p>
      
      <div style={{ display: "flex", flexDirection: "column", gap: 24, color: UI_COLORS.textSecondary, fontSize: 15, lineHeight: 1.6 }}>
        <section>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 12 }}>1. Hizmetin Kabulü</h2>
          <p>ClinicBridge platformuna giriş yaparak ve sistemlerimizi kullanarak, bu sayfalarda belirtilen tüm Kullanım Şartları'nı okuduğunuzu ve kabul ettiğinizi beyan etmiş olursunuz. Hesabınızın güvenliğinden ve yapılan tüm işlemlerden kurumunuz sorumludur.</p>
        </section>

        <section>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 12 }}>2. Kullanım Kısıtlamaları</h2>
          <p>Kullanıcılar sistemin yapısını bozacak, aşırı yük getirecek, otomatize edilmiş veya yasadışı talepler oluşturamazlar. Platform üzerinden iletilen hasta verilerinden ve bu verilerin doğruluğundan kullanıcı klinik yetkilileri sorumludur.</p>
        </section>

        <section>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 12 }}>3. Fikri Mülkiyet</h2>
          <p>Platformda bulunan kodlar, arayüz tasarımları (logo, metin, UI bileşenleri) ClinicBridge'in mülkiyetindedir ve izinsiz olarak kopyalanamaz veya ticari amaçla paylaşılamaz.</p>
        </section>
      </div>
    </div>
  );
}
