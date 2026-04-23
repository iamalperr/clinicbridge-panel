"use client";

import { UI_COLORS } from "@/components/ui/ui-shared";

export default function KvkkPage() {
  return (
    <div>
      <h1 style={{ fontSize: 32, fontWeight: 800, color: UI_COLORS.textPrimary, marginBottom: 16 }}>KVKK Aydınlatma Metni</h1>
      <p style={{ color: UI_COLORS.textSecondary, marginBottom: 32 }}>Son güncellenme: 23 Nisan 2026</p>
      
      <div style={{ display: "flex", flexDirection: "column", gap: 24, color: UI_COLORS.textSecondary, fontSize: 15, lineHeight: 1.6 }}>
        <section>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 12 }}>1. Veri Sorumlusunun Kimliği</h2>
          <p>6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) uyarınca, ClinicBridge (“Platform”), veri sorumlusu sıfatıyla kişisel verilerinizi Kanun’a uygun olarak işlemektedir.</p>
        </section>

        <section>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 12 }}>2. Kişisel Verilerin İşlenme Amacı</h2>
          <p>Kişisel verileriniz; platformun güvenli bir şekilde sunulması, üyelik kayıtlarının gerçekleştirilmesi, bilgi güvenliği süreçlerinin yürütülmesi ve AI asistan işlemlerinin sağlık standartlarına uygun yapılabilmesi amacıyla işlenmektedir.</p>
        </section>

        <section>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 12 }}>3. İşlenen Verilerin Kimlere Aktarılabileceği</h2>
          <p>Toplanan kişisel verileriniz, yasal mevzuata uygun olarak yalnızca hukuki yükümlülüklerimizi yerine getirmek amacıyla yetkili kamu kurum ve kuruluşları ile, platform altyapısını sağlamak amacıyla teknik alt işlemci firmalarımız (Sunucu, AI provider vb.) ile güvenli ortamda paylaşılabilir.</p>
        </section>

        <section>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: UI_COLORS.textPrimary, marginBottom: 12 }}>4. KVKK Madde 11 Haklarınız</h2>
          <p>KVKK'nın 11. maddesi kapsamında; verilerinizin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme, eksikse düzeltilmesini ve gerekiyorsa silinmesini talep etme haklarına sahipsiniz.</p>
        </section>
      </div>
    </div>
  );
}
