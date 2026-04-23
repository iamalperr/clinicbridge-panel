"use client";

import { UI_COLORS } from "@/components/ui/ui-shared";

export default function PrivacyPage() {
  return (
    <div>
      <h1 style={{ fontSize: 32, fontWeight: 800, color: UI_COLORS.textPrimary, marginBottom: 16 }}>Gizlilik Politikası</h1>
      <p style={{ color: UI_COLORS.textSecondary, marginBottom: 32 }}>Son güncellenme: 23 Nisan 2026</p>
      
      <div style={{ display: "flex", flexDirection: "column", gap: 24, color: UI_COLORS.textSecondary, fontSize: 15, lineHeight: 1.6 }}>
        <section>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 12 }}>1. Veri Toplama ve Kullanımı</h2>
          <p>ClinicBridge ("biz", "bizim", "platform") olarak, hizmetlerimizi en güvenli ve verimli şekilde sunabilmek amacıyla hesap oluşturma sırasında ve platform kullanımı boyunca belirli verileri (örn. email, log verileri, ayar tercihleri) toplamaktayız. Toplanan veriler sistem güvenliğini sağlamak ve UX süreçlerini optimize etmek için kullanılır.</p>
        </section>

        <section>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 12 }}>2. Üçüncü Taraf Paylaşımı</h2>
          <p>Müşteri verileri ve hasta verileri hiçbir şekilde üçüncü taraf reklamveren veya pazarlama şirketleriyle paylaşılmaz. Sadece sistemimizin temel işlevlerini (örn. AI işlemleri, hosting) sağlamak amacıyla sözleşmeli alt işlemcilerimiz ile güvenli protokoller üzerinden işlenir.</p>
        </section>

        <section>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 12 }}>3. Çerezler (Cookies)</h2>
          <p>Platform deneyiminizi kişiselleştirmek ve oturum güvenliğini korumak adına çerezleri kullanıyoruz. Opsiyonel analitik çerezlerini çerez yönetimi ekranından her zaman kontrol edebilirsiniz.</p>
        </section>
      </div>
    </div>
  );
}
