import type { Metadata } from "next";
import LandingChrome from "@/components/landing/LandingChrome";
import SetupGuideContent, { SETUP_SIGNUP_URL } from "@/components/landing/SetupGuideContent";
import { PUBLIC_SITE_ORIGIN } from "@/lib/seo/publicSitemap";

const PATH = "/kurulum-rehberi";
const CANONICAL = `${PUBLIC_SITE_ORIGIN}${PATH}`;

export const metadata: Metadata = {
  title: {
    absolute: "ClinicBridge AI Kurulumu: 10 Dakikada Çok Dilli AI Asistan | 14 Gün Ücretsiz",
  },
  description:
    "Kliniğinizin web sitesine çok dilli yapay zeka asistanını adım adım kurun. Kod bilgisi gerekmez. 14 gün ücretsiz deneyin.",
  alternates: { canonical: CANONICAL },
};

const faqEntities = [
  {
    question: "Kurulum için yazılımcı gerekir mi?",
    answer:
      "Hayır. Tek satırlık kodu sitenize eklemeniz yeterli. Siteniz ajans tarafından yönetiliyorsa kodu onlara iletebilirsiniz; kurulum sihirbazından ajans e-postasına da gönderebilirsiniz.",
  },
  {
    question: "Asistan hangi dillerde konuşuyor?",
    answer: "Çok dilli çalışır; hasta hangi dilde yazarsa o dilde cevap verir.",
  },
  {
    question: "Asistan yanlış bilgi verir mi?",
    answer:
      "Asistan Eğitim sekmesine ve kurulumda verdiğiniz bilgilere dayanır. Bilmediği bir konuda hastayı ekibinize yönlendirir. Tıbbi teşhis koymaz.",
  },
  {
    question: "Hasta acil bir durum yazarsa ne olur?",
    answer:
      "Asistan sohbeti durdurur ve hastayı önce 112'ye (yurt dışındaysa bulunduğu ülkenin acil numarasına) yönlendirir. Bu kural kapatılamaz.",
  },
  {
    question: "Hasta verileri güvende mi?",
    answer:
      "Veriler KVKK'ya uygun şekilde saklanır. WhatsApp ekip bildirimlerinde sağlık bilgisi, hasta telefonu veya e-postası yer almaz.",
  },
  {
    question: "14 günlük deneme bitince ne olur?",
    answer:
      "Deneme bitince sizden otomatik ücret alınmaz; asistan kapanır. Devam etmek için paket seçersiniz. Deneme sırasında istediğiniz zaman iptal edebilirsiniz.",
  },
  {
    question: "Telefon asistanı da var mı?",
    answer:
      "Evet. Panelde Sesli Yanıt sekmesinden telefon asistanını yapılandırabilirsiniz. Telefon paketlerinde numara yönlendirme desteği sunulur.",
  },
  {
    question: "Takıldığım bir adım olursa?",
    answer: "info@clinicbridge-ai.com adresine yazın ya da sitedeki asistana kurulum desteği yazın.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "FAQPage",
      mainEntity: faqEntities.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
    {
      "@type": "HowTo",
      name: "ClinicBridge AI kurulum rehberi",
      description:
        "Kliniğinizin web sitesine çok dilli yapay zeka asistanını adım adım kurun. Kod bilgisi gerekmez.",
      totalTime: "PT10M",
      estimatedCost: { "@type": "MonetaryAmount", currency: "EUR", value: "0" },
      step: [
        {
          "@type": "HowToStep",
          name: "Hesabınızı açın",
          text: "Kayıt sayfasında ad soyad, klinik adı, e-posta, şifre ve telefon ile hesap oluşturun. 14 günlük deneme başlar.",
          url: `${CANONICAL}#adim-1`,
        },
        {
          "@type": "HowToStep",
          name: "Bilgileri girin",
          text: "Kurulum sihirbazında tedaviler, çalışma saatleri, SSS ve söylememesi gerekenleri girin.",
          url: `${CANONICAL}#adim-2`,
        },
        {
          "@type": "HowToStep",
          name: "Üslup ve kurallar",
          text: "Prompt Studio ve AI Kuralları ile karşılama mesajı, kalite kriterleri ve guardrail'leri ayarlayın.",
          url: `${CANONICAL}#adim-3`,
        },
        {
          "@type": "HowToStep",
          name: "Canlı destek ve bildirimler",
          text: "Randevu e-posta/WhatsApp, canlı destek kanalları ve ekip bildirimlerini ayarlayın.",
          url: `${CANONICAL}#adim-4`,
        },
        {
          "@type": "HowToStep",
          name: "Asistanı sitenize ekleyin",
          text: "Web Widget kodunu kopyalayıp sitenizin </body> etiketinden önce ekleyin.",
          url: `${CANONICAL}#adim-5`,
        },
        {
          "@type": "HowToStep",
          name: "Test edin",
          text: "Gizli pencerede sohbet, canlı destek ve randevu bildirimlerini doğrulayın.",
          url: `${CANONICAL}#adim-6`,
        },
      ],
      tool: [{ "@type": "HowToTool", name: "ClinicBridge AI paneli" }],
      supply: [{ "@type": "HowToSupply", name: "Klinik web sitesi erişimi" }],
    },
    {
      "@type": "WebPage",
      name: "ClinicBridge AI Kurulum Rehberi",
      url: CANONICAL,
      description:
        "Kliniğinizin web sitesine çok dilli yapay zeka asistanını adım adım kurun. Kod bilgisi gerekmez. 14 gün ücretsiz deneyin.",
      significantLink: SETUP_SIGNUP_URL,
    },
  ],
};

export default function SetupGuidePage() {
  return (
    <LandingChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SetupGuideContent />
    </LandingChrome>
  );
}
