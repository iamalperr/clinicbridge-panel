"use client";

import { UI_COLORS } from "@/components/ui/ui-shared";
import { LegalPage, LegalSection, SELLER } from "@/components/legal/LegalPage";

const PLANS = [
  {
    name: "Web Chat",
    price: "€150",
    period: "/ ay",
    features: [
      "Web sitenize eklenen çok dilli AI asistan",
      "7/24 hasta karşılama, tüm diller",
      "Randevu taleplerinin e-posta veya WhatsApp ile iletilmesi",
      "Klinik paneli ve haftalık rapor",
    ],
  },
  {
    name: "Web Chat + AI Telefon",
    price: "€250",
    period: "/ ay",
    features: [
      "Web Chat paketindeki her şey",
      "Telefonları karşılayan AI telefon asistanı",
      "Çağrı özetleri ve randevu talebi iletimi",
      "Kurulum ve numara yönlendirme desteği",
    ],
  },
];

export default function PricingPage() {
  return (
    <LegalPage title="Fiyatlandırma" updated="5 Kasım 2026">
      <p>Tüm paketler aylık aboneliktir. Taahhüt yoktur; dilediğiniz zaman iptal edebilirsiniz.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        {PLANS.map((p) => (
          <div key={p.name} style={{ border: `1px solid ${UI_COLORS.border}`, borderRadius: 16, padding: 24, background: UI_COLORS.bgCard, display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: UI_COLORS.textPrimary, margin: 0 }}>{p.name}</h2>
            <div style={{ color: UI_COLORS.textPrimary }}>
              <span style={{ fontSize: 32, fontWeight: 800 }}>{p.price}</span>
              <span style={{ fontSize: 15, color: UI_COLORS.textSecondary }}> {p.period} + KDV</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              {p.features.map((f) => <li key={f}>{f}</li>)}
            </ul>
            <a
              href={`mailto:${SELLER.email}?subject=${encodeURIComponent(p.name + " paketi")}`}
              style={{ marginTop: "auto", display: "inline-flex", justifyContent: "center", alignItems: "center", minHeight: 44, borderRadius: 10, background: UI_COLORS.textPrimary, color: UI_COLORS.bgCard, fontWeight: 700, textDecoration: "none" }}
            >
              Satın Al
            </a>
          </div>
        ))}
      </div>
      <LegalSection title="Ödeme">
        <p>Ödemeler iyzico güvencesiyle kredi kartı veya banka kartı ile alınır. Euro cinsinden fiyatlar, ödeme günündeki kur üzerinden Türk lirası olarak tahsil edilir. Her ödeme için e-Arşiv fatura düzenlenir.</p>
        <p>Çok şubeli klinikler ve ajanslar için özel fiyat almak üzere <a href={`mailto:${SELLER.email}`}>{SELLER.email}</a> adresine yazabilirsiniz.</p>
      </LegalSection>
    </LegalPage>
  );
}
