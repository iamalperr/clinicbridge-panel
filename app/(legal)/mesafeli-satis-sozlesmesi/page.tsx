"use client";

import { LegalPage, LegalSection, SellerInfo, SELLER } from "@/components/legal/LegalPage";

export default function DistanceSalesPage() {
  return (
    <LegalPage title="Mesafeli Satış Sözleşmesi" updated="5 Kasım 2026">
      <LegalSection title="1. Taraflar">
        <p><strong>Satıcı:</strong></p>
        <SellerInfo />
        <p><strong>Alıcı:</strong> clinicbridge-ai.com üzerinden hizmet satın alan ve satın alma sırasında unvan, adres, vergi ve iletişim bilgilerini beyan eden kişi veya kurum (bundan sonra &quot;Alıcı&quot;).</p>
      </LegalSection>
      <LegalSection title="2. Konu">
        <p>Bu sözleşmenin konusu, Alıcı&apos;nın Satıcı&apos;ya ait clinicbridge-ai.com internet sitesi üzerinden elektronik ortamda satın aldığı ClinicBridge AI yazılım hizmetinin (çok dilli AI web asistanı ve/veya AI telefon asistanı) sunulmasına ilişkin tarafların hak ve yükümlülüklerinin belirlenmesidir.</p>
      </LegalSection>
      <LegalSection title="3. Hizmet ve bedel">
        <p>Hizmetin kapsamı, paketi ve aylık bedeli <a href="/fiyatlandirma">Fiyatlandırma</a> sayfasında ve satın alma sırasında gösterildiği gibidir. Fiyatlara KDV dahil değildir. Euro cinsinden fiyatlar, ödeme günündeki kur üzerinden Türk lirası olarak tahsil edilir.</p>
      </LegalSection>
      <LegalSection title="4. Ödeme">
        <p>Ödeme, iyzico ödeme altyapısı üzerinden kredi kartı veya banka kartı ile yapılır. Abonelik bedeli, iptal edilmediği sürece her ay aynı gün otomatik olarak tahsil edilir. Satıcı, kart bilgilerini saklamaz; kart bilgileri iyzico tarafından işlenir.</p>
      </LegalSection>
      <LegalSection title="5. Hizmetin ifası">
        <p>Hizmet, ödemenin onaylanmasından sonra en geç 1 iş günü içinde Alıcı&apos;nın hesabının aktif edilmesiyle elektronik ortamda ifa edilir. Ayrıntılar <a href="/teslimat-ve-iade">Teslimat ve İade Şartları</a> sayfasında yer alır.</p>
      </LegalSection>
      <LegalSection title="6. Süre ve fesih">
        <p>Sözleşme, satın alma tarihinde yürürlüğe girer ve aylık dönemler halinde kendiliğinden yenilenir. Alıcı, aboneliğini dilediği zaman iptal edebilir; iptal içinde bulunulan dönemin sonunda geçerli olur. Satıcı, Alıcı&apos;nın ödeme yükümlülüğünü yerine getirmemesi veya hizmeti hukuka aykırı amaçlarla kullanması halinde hizmeti askıya alabilir veya sözleşmeyi feshedebilir.</p>
      </LegalSection>
      <LegalSection title="7. Cayma hakkı">
        <p>Hizmet, kurumsal kullanıcılara (klinikler, sağlık kuruluşları ve ajanslar) yöneliktir. Alıcı&apos;nın tüketici sayılması halinde, Mesafeli Sözleşmeler Yönetmeliği uyarınca elektronik ortamda anında ifa edilen hizmetlerde cayma hakkı kullanılamaz. Hatalı veya mükerrer çekimlere ilişkin iade koşulları Teslimat ve İade Şartları sayfasında belirtilmiştir.</p>
      </LegalSection>
      <LegalSection title="8. Kişisel veriler">
        <p>Taraflar, hizmet kapsamında işlenen kişisel verilere ilişkin olarak 6698 sayılı Kişisel Verilerin Korunması Kanunu&apos;na uygun hareket eder. Ayrıntılar <a href="/privacy">Gizlilik Politikası</a> ve <a href="/kvkk">KVKK Aydınlatma Metni</a>&apos;nde yer alır.</p>
      </LegalSection>
      <LegalSection title="9. Uyuşmazlıkların çözümü">
        <p>Bu sözleşmeden doğan uyuşmazlıklarda Türk hukuku uygulanır. Alıcı&apos;nın tüketici sayılması halinde tüketici hakem heyetleri ve tüketici mahkemeleri, diğer hallerde Satıcı&apos;nın yerleşim yeri mahkemeleri ve icra daireleri yetkilidir.</p>
      </LegalSection>
      <LegalSection title="10. Yürürlük">
        <p>Alıcı, satın alma işlemini tamamlamadan önce bu sözleşmeyi okuduğunu ve kabul ettiğini beyan eder. Sorularınız için: <a href={`mailto:${SELLER.email}`}>{SELLER.email}</a></p>
      </LegalSection>
    </LegalPage>
  );
}
