/** Shared product FAQ copy for homepage + /sss (visible text and FAQPage JSON-LD). */

export type MarketingLang = "tr" | "en";

export interface ProductFaqItem {
  question: string;
  answer: string;
}

export const PRODUCT_FAQ_TR: ProductFaqItem[] = [
  {
    question: "ClinicBridge AI nedir?",
    answer:
      "Sağlık turizmi klinikleri için çok dilli bir yapay zeka hasta iletişim platformudur. Web sitesi sohbet asistanı ve AI telefon asistanı, hastaların sorularını 7/24 yanıtlar, randevu taleplerini toplar ve ekibinize iletir.",
  },
  {
    question: "Hangi klinikler için uygun?",
    answer:
      "Diş klinikleri, saç ekimi, estetik ve plastik cerrahi, dermatoloji klinikleri ve yabancı hasta ağırlıklı çalışan sağlık turizmi klinikleri için tasarlandı.",
  },
  {
    question: "Asistan hangi dillerde konuşuyor?",
    answer:
      "Türkçe, İngilizce, Almanca, Arapça, Rusça, Fransızca ve daha fazlası. Hasta hangi dilde yazarsa asistan o dilde cevap verir.",
  },
  {
    question: "Kurulum ne kadar sürer, yazılımcı gerekir mi?",
    answer:
      "Gerekmez. Panelde kliniğinizin bilgilerini girer, size verilen tek satırlık kodu sitenize eklersiniz. WordPress, Wix ve Webflow için adımlar kurulum rehberinde.",
  },
  {
    question: "Ücretsiz deneme var mı?",
    answer:
      "Evet, 14 gün ücretsiz. Kredi kartı istenmez; deneme bitince otomatik ücret alınmaz.",
  },
  {
    question: "Asistan yanlış bilgi verir mi veya teşhis koyar mı?",
    answer:
      "Asistan yalnızca kliniğin panele girdiği bilgilere dayanır, teşhis koymaz ve kesin fiyat uydurmaz. Bilmediği konuda hastayı ekibinize yönlendirir.",
  },
  {
    question: "Hasta acil bir durum yazarsa ne olur?",
    answer:
      "Asistan sohbeti durdurur ve hastayı önce 112'ye (yurt dışındaysa bulunduğu ülkenin acil numarasına) yönlendirir.",
  },
  {
    question: "WhatsApp ile çalışıyor mu?",
    answer:
      "Evet. Canlı destek isteyen hasta tek tıkla kliniğin WhatsApp veya Telegram hattına bağlanır; yeni randevu talepleri ekibinize WhatsApp ile bildirilir.",
  },
  {
    question: "Telefon asistanı nasıl çalışır?",
    answer:
      "Kliniğin numarasına gelen aramaları AI telefon asistanı karşılar, soruları yanıtlar ve randevu talebi alır. Klinik + Telefon planında numara yönlendirme desteği verilir.",
  },
  {
    question: "Hasta verileri güvende mi?",
    answer:
      "Veriler KVKK'ya uygun şekilde işlenir. WhatsApp bildirimlerinde sağlık bilgisi, hasta telefonu veya e-postası paylaşılmaz; detaylar panelde kalır.",
  },
  {
    question: "Fiyatlar ne kadar?",
    answer:
      "Başlangıç €49/ay, Klinik €149/ay, Klinik + Telefon €299/ay (KDV hariç). Ajans ve çok şubeli yapılar için özel fiyat. Taahhüt yok.",
  },
];

export const PRODUCT_FAQ_EN: ProductFaqItem[] = [
  {
    question: "What is ClinicBridge AI?",
    answer:
      "It is a multilingual AI patient communication platform for medical tourism clinics. The website chat assistant and AI phone assistant answer patient questions 24/7, collect appointment requests, and deliver them to your team.",
  },
  {
    question: "Which clinics is it for?",
    answer:
      "It is designed for dental, hair transplant, aesthetic and plastic surgery, dermatology clinics, and medical tourism clinics that serve international patients.",
  },
  {
    question: "Which languages does the assistant speak?",
    answer:
      "Turkish, English, German, Arabic, Russian, French, and more. The assistant replies in the language the patient writes in.",
  },
  {
    question: "How long does setup take, and do I need a developer?",
    answer:
      "No developer required. Enter your clinic details in the panel and add the one-line embed code to your site. WordPress, Wix, and Webflow steps are in the setup guide.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "Yes — 14 days free. No credit card is required, and you are not charged automatically when the trial ends.",
  },
  {
    question: "Can the assistant invent facts or diagnose?",
    answer:
      "The assistant only uses information your clinic enters in the panel. It does not diagnose or invent exact prices. If it does not know, it routes the patient to your team.",
  },
  {
    question: "What happens if a patient reports an emergency?",
    answer:
      "The assistant stops the chat flow and directs the patient first to 112 (or the local emergency number if they are abroad).",
  },
  {
    question: "Does it work with WhatsApp?",
    answer:
      "Yes. Patients who want live support can connect to your clinic WhatsApp or Telegram in one tap, and new appointment requests can notify your team on WhatsApp.",
  },
  {
    question: "How does the phone assistant work?",
    answer:
      "The AI phone assistant answers calls to your clinic number, responds to questions, and takes appointment requests. The Clinic + Phone plan includes number forwarding support.",
  },
  {
    question: "Are patient data protected?",
    answer:
      "Data is processed in line with KVKK. WhatsApp staff notifications do not include health details, patient phone numbers, or emails; those stay in the panel.",
  },
  {
    question: "How much does it cost?",
    answer:
      "Starter €49/mo, Clinic €149/mo, Clinic + Phone €299/mo (excl. VAT). Custom pricing for agencies and multi-site groups. No commitment.",
  },
];

export function productFaq(lang: MarketingLang): ProductFaqItem[] {
  return lang === "en" ? PRODUCT_FAQ_EN : PRODUCT_FAQ_TR;
}

/** Chat assistant locales enforced in conversationLanguagePolicy. */
export const CHAT_SUPPORTED_LOCALES = ["tr", "en", "de", "fr", "ar", "ru", "es", "it"] as const;

/** Marketing list (plan wording). Matches primary chat locales; es/it covered by “and more”. */
export const MARKETING_LANGUAGE_LIST_TR =
  "Türkçe, İngilizce, Almanca, Arapça, Rusça, Fransızca ve daha fazlası";
export const MARKETING_LANGUAGE_LIST_EN =
  "Turkish, English, German, Arabic, Russian, French, and more";
