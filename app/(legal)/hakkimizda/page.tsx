"use client";

import { LegalPage, LegalSection, SELLER } from "@/components/legal/LegalPage";

export default function AboutPage() {
  return (
    <LegalPage title="Hakkımızda" updated="5 Kasım 2026">
      <LegalSection title="ClinicBridge AI nedir?">
        <p>ClinicBridge AI, yabancı hasta alan diş, saç ekimi ve estetik klinikleri ile sağlık turizmi ajansları için geliştirilmiş çok dilli bir yapay zekâ hasta iletişim platformudur.</p>
        <p>Kliniğin web sitesine eklenen asistan ve AI telefon asistanı, hastaların sorularını kendi dillerinde saniyeler içinde yanıtlar, randevu taleplerini toplar ve klinik ekibine hazır şekilde iletir. Klinik kapalıyken gelen hastalar da cevapsız kalmaz.</p>
      </LegalSection>
      <LegalSection title="Neden kurduk?">
        <p>Yurt dışından gelen hastaların önemli bir kısmı, Türkiye saatiyle akşam ve gece yazıyor. Bu saatlerde cevap alamayan hasta çoğu zaman başka bir kliniğe yöneliyor. ClinicBridge AI, kliniklerin ekip büyütmeden bu saatleri karşılamasını sağlamak için kuruldu.</p>
      </LegalSection>
      <LegalSection title="İletişim">
        <p>E-posta: <a href={`mailto:${SELLER.email}`}>{SELLER.email}</a></p>
        <p>Telefon: {SELLER.phone}</p>
        <p>Satıcı bilgileri <a href="/mesafeli-satis-sozlesmesi">Mesafeli Satış Sözleşmesi</a>&apos;nde yer almaktadır.</p>
      </LegalSection>
    </LegalPage>
  );
}
