"use client";

import { LegalPage, LegalSection, SELLER } from "@/components/legal/LegalPage";

export default function DeliveryRefundPage() {
  return (
    <LegalPage title="Teslimat ve İade Şartları" updated="5 Kasım 2026">
      <LegalSection title="1. Hizmetin niteliği">
        <p>ClinicBridge AI, fiziksel ürün değil, internet üzerinden sunulan bir yazılım hizmetidir (SaaS). Kargo veya fiziksel teslimat yapılmaz.</p>
      </LegalSection>
      <LegalSection title="2. Teslimat">
        <p>Ödeme onaylandıktan sonra klinik hesabınız en geç 1 iş günü içinde aktif edilir. Hesap bilgileri ve asistanın web sitenize eklenmesi için gereken kurulum kodu, satın alma sırasında belirttiğiniz e-posta adresine gönderilir.</p>
        <p>AI telefon asistanı içeren paketlerde numara yönlendirme ve kurulum, klinikle birlikte planlanır ve genellikle 3 iş günü içinde tamamlanır.</p>
      </LegalSection>
      <LegalSection title="3. Abonelik ve iptal">
        <p>Paket bedelleri <a href="/fiyatlandirma">Fiyatlandırma</a> sayfasında yer alır. Abonelikler aylık olarak yenilenir. Aboneliğinizi dilediğiniz zaman klinik panelinden veya {SELLER.email} adresine yazarak iptal edebilirsiniz. İptal, içinde bulunulan ödeme döneminin sonunda geçerli olur ve dönem sonuna kadar hizmet kullanılmaya devam edilir.</p>
      </LegalSection>
      <LegalSection title="4. İade">
        <p>Hizmet, ödeme onayıyla birlikte elektronik ortamda anında sunulmaya başladığından, kullanılmış veya başlamış dönemler için ücret iadesi yapılmaz.</p>
        <p>Hatalı veya mükerrer çekim yapılması halinde, durum tespit edildikten sonra en geç 7 iş günü içinde ücret, ödemenin yapıldığı karta iade edilir. Kartınıza yansıma süresi bankanıza bağlıdır.</p>
        <p>Hizmetin bizden kaynaklanan bir nedenle hiç sunulamaması halinde ödenen tutarın tamamı iade edilir.</p>
      </LegalSection>
      <LegalSection title="5. İletişim">
        <p>Teslimat, iptal ve iade talepleriniz için: <a href={`mailto:${SELLER.email}`}>{SELLER.email}</a></p>
      </LegalSection>
    </LegalPage>
  );
}
