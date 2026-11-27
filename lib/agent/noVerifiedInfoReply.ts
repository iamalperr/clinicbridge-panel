/**
 * Patient-facing reply when the clinic has no verified information (knowledge gap).
 * Distinct from the technical-fallback reply: nothing failed, the answer is just not on record.
 *
 * The handoff sentence is phrased so `isClinicForwardOffer` recognises it and the existing
 * contact-request flow takes over on "yes".
 */

export type NoVerifiedInfoTopic = "price" | "general";

type Copy = {
  general: string;
  price: string;
  offer: string;
  phone: (phone: string) => string;
};

const COPY: Record<"tr" | "en" | "de" | "fr" | "ar" | "ru", Copy> = {
  en: {
    general:
      "I don't have verified information on this, and I don't want to give you an inaccurate answer. Our clinic team can give you the correct information.",
    price:
      "I don't have a verified price for this treatment, so I can't quote an amount. Our clinic team can give you accurate pricing.",
    offer:
      " Would you like me to forward your question to the clinic team so they can contact you? I'll just need your name and phone number.",
    phone: (p) => ` You can also reach the clinic directly at ${p}.`,
  },
  tr: {
    general:
      "Bu konuda doğrulanmış bir bilgim bulunmuyor; sizi yanlış yönlendirmek istemem. Doğru bilgiyi klinik ekibimiz verebilir.",
    price:
      "Bu tedavi için doğrulanmış bir fiyat bilgim bulunmuyor, bu yüzden bir tutar paylaşamıyorum. Doğru fiyat bilgisini klinik ekibimiz verebilir.",
    offer:
      " Dilerseniz sorunuzu klinik ekibimize iletebilirim; bunun için adınızı ve telefon numaranızı almam yeterli.",
    phone: (p) => ` Kliniğe doğrudan ${p} numarasından da ulaşabilirsiniz.`,
  },
  de: {
    general:
      "Dazu liegt mir keine bestätigte Information vor, und ich möchte Sie nicht falsch informieren. Das Klinikteam kann Ihnen die richtige Auskunft geben.",
    price:
      "Für diese Behandlung liegt mir kein bestätigter Preis vor, daher kann ich keinen Betrag nennen. Das Klinikteam kann Ihnen die genauen Kosten nennen.",
    offer:
      " Soll ich Ihre Frage an unser Klinikteam weiterleiten, damit man Sie kontaktiert? Dafür brauche ich nur Ihren Namen und Ihre Telefonnummer.",
    phone: (p) => ` Sie können die Klinik auch direkt unter ${p} erreichen.`,
  },
  fr: {
    general:
      "Je n'ai pas d'information vérifiée à ce sujet et je ne veux pas vous induire en erreur. L'équipe de la clinique pourra vous donner la bonne information.",
    price:
      "Je n'ai pas de tarif vérifié pour ce traitement, je ne peux donc pas vous indiquer de montant. L'équipe de la clinique pourra vous donner le tarif exact.",
    offer:
      " Souhaitez-vous que je transmette votre question à l'équipe de la clinique pour qu'elle vous recontacte ? Il me faut simplement votre nom et votre numéro de téléphone.",
    phone: (p) => ` Vous pouvez aussi joindre la clinique directement au ${p}.`,
  },
  ar: {
    general:
      "لا تتوفر لدي معلومات موثقة حول هذا الموضوع، ولا أريد أن أعطيك إجابة غير دقيقة. يمكن لفريق العيادة تزويدك بالمعلومات الصحيحة.",
    price:
      "لا يتوفر لدي سعر موثق لهذا العلاج، لذلك لا يمكنني ذكر مبلغ. يمكن لفريق العيادة تزويدك بالسعر الدقيق.",
    offer: " هل ترغب في أن أحيل سؤالك إلى فريق العيادة ليتواصل معك؟ أحتاج فقط إلى اسمك ورقم هاتفك.",
    phone: (p) => ` يمكنك أيضاً التواصل مع العيادة مباشرة على ${p}.`,
  },
  ru: {
    general:
      "У меня нет проверенной информации по этому вопросу, и я не хочу ввести вас в заблуждение. Точную информацию вам даст команда клиники.",
    price:
      "У меня нет подтверждённой цены на это лечение, поэтому я не могу назвать сумму. Точную стоимость вам сообщит команда клиники.",
    offer:
      " Хотите, я передам ваш вопрос команде клиники, чтобы с вами связались? Мне понадобятся только ваше имя и номер телефона.",
    phone: (p) => ` Вы также можете связаться с клиникой напрямую: ${p}.`,
  },
};

function copyFor(locale?: string | null): Copy {
  const lang = String(locale || "tr").toLowerCase();
  if (lang.startsWith("en")) return COPY.en;
  if (lang.startsWith("de")) return COPY.de;
  if (lang.startsWith("fr")) return COPY.fr;
  if (lang.startsWith("ar")) return COPY.ar;
  if (lang.startsWith("ru")) return COPY.ru;
  return COPY.tr;
}

/**
 * @param offerHandoff false during an active appointment flow: the clinic team already
 *   receives the request there, and a contact offer would compete with the open slot.
 */
export function formatNoVerifiedInfoReply(params: {
  locale?: string | null;
  topic?: NoVerifiedInfoTopic;
  clinicPhone?: string | null;
  offerHandoff?: boolean;
}): string {
  const copy = copyFor(params.locale);
  const phone = typeof params.clinicPhone === "string" ? params.clinicPhone.trim() : "";
  const offerHandoff = params.offerHandoff !== false;
  return (
    (params.topic === "price" ? copy.price : copy.general) +
    (offerHandoff ? copy.offer : "") +
    (phone ? copy.phone(phone) : "")
  );
}

const NO_VERIFIED_INFO_PATTERNS: RegExp[] = [
  /doğrulanmış\s+(?:bir\s+)?(?:fiyat\s+)?bilgi(?:m|miz)?\s+(?:bulunmuyor|yok)/i,
  /doğrulayamıyorum/i,
  /(?:don'?t|do not|doesn'?t|does not)\s+have\s+(?:a\s+|any\s+)?verified\s+(?:information|price|pricing|details)/i,
  /\bno\s+verified\s+(?:information|price|pricing)/i,
  /(?:cannot|can'?t|unable to|not able to)\s+(?:reliably\s+)?(?:verify|confirm)\s+this/i,
  /keine\s+bestätigte\s+information|kein\s+bestätigter\s+preis/i,
  /pas\s+d'information\s+vérifiée|pas\s+de\s+tarif\s+vérifié/i,
  /معلومات\s+موثقة|سعر\s+موثق/,
  /нет\s+проверенной\s+информации|нет\s+подтверждённой\s+цены/i,
];

/** Assistant text that states there is no verified clinic information (any supported locale). */
export function looksLikeNoVerifiedInfoReply(reply: string): boolean {
  const text = String(reply || "");
  if (!text.trim()) return false;
  return NO_VERIFIED_INFO_PATTERNS.some((p) => p.test(text));
}
