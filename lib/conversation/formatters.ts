/**
 * Multilingual formatters for appointment flow summaries, sequential prompts,
 * safe pricing fallbacks, and contact responses across TR, EN, DE, FR, AR.
 */
import { normalizeTurkishPhone } from "../phoneUtils";

export interface AppointmentSummaryInput {
  patientName?: string | null;
  patientPhone?: string | null;
  patientEmail?: string | null;
  requestedService?: string | null;
  requestedDate?: string | null;
  preferredDateDisplay?: string | null;
  requestedTime?: string | null;
}

export function formatMultilingualSummary(draft: AppointmentSummaryInput, locale: string = "tr"): string {
  const isEn = locale.toLowerCase().startsWith("en");
  const isDe = locale.toLowerCase().startsWith("de");
  const isFr = locale.toLowerCase().startsWith("fr");
  const isAr = locale.toLowerCase().startsWith("ar");

  const name = draft.patientName || "-";
  let phone = draft.patientPhone || "-";
  const phoneCheck = normalizeTurkishPhone(phone);
  if (phoneCheck.valid) phone = phoneCheck.display;

  const email = draft.patientEmail || (isEn ? "Not provided" : "Belirtilmedi");
  const service = draft.requestedService || (isEn ? "General Consultation" : isDe ? "Allgemeine Untersuchung" : isFr ? "Consultation Générale" : isAr ? "استشارة عامة" : "Genel Muayene");
  const date = draft.preferredDateDisplay || draft.requestedDate || "-";
  const time = draft.requestedTime || (isEn ? "Not specified" : isDe ? "Nicht angegeben" : isFr ? "Non spécifié" : isAr ? "غير محدد" : "Belirtilmedi");

  if (isEn) {
    return `Summary of your appointment request:\n\n` +
      `👤 Name: ${name}\n` +
      `📞 Phone: ${phone}\n` +
      `✉️ Email: ${email}\n` +
      `🩺 Service: ${service}\n` +
      `📅 Preferred Date: ${date}\n` +
      `⏰ Preferred Time: ${time}\n\n` +
      `Would you like me to submit this appointment request for clinic review? You can reply Yes or No.`;
  }
  if (isDe) {
    return `Zusammenfassung Ihrer Terminanfrage:\n\n` +
      `👤 Name: ${name}\n` +
      `📞 Telefon: ${phone}\n` +
      `✉️ E-Mail: ${email}\n` +
      `🩺 Behandlung: ${service}\n` +
      `📅 Bevorzugtes Datum: ${date}\n` +
      `⏰ Bevorzugte Uhrzeit: ${time}\n\n` +
      `Möchten Sie, dass ich diese Terminanfrage zur Überprüfung an die Klinik weiterleite? Sie können mit Ja oder Nein antworten.`;
  }
  if (isFr) {
    return `Récapitulatif de votre demande de rendez-vous:\n\n` +
      `👤 Nom: ${name}\n` +
      `📞 Téléphone: ${phone}\n` +
      `✉️ E-mail: ${email}\n` +
      `🩺 Service: ${service}\n` +
      `📅 Date souhaitée: ${date}\n` +
      `⏰ Heure souhaitée: ${time}\n\n` +
      `Souhaitez-vous que je transmette cette demande de rendez-vous à la clinique ? Vous pouvez répondre par Oui ou Non.`;
  }
  if (isAr) {
    return `ملخص طلب الموعد الخاص بك:\n\n` +
      `👤 الاسم: ${name}\n` +
      `📞 الهاتف: ${phone}\n` +
      `✉️ البريد الإلكتروني: ${email}\n` +
      `🩺 الخدمة: ${service}\n` +
      `📅 التاريخ المفضل: ${date}\n` +
      `⏰ الوقت المفضل: ${time}\n\n` +
      `هل تود أن أقوم بإرسال طلب الموعد هذا إلى العيادة للتأكيد؟ يمكنك الإجابة بنعم أو لا.`;
  }

  return `Ön randevu talebinizin özeti:\n\n` +
    `Ad Soyad: ${name}\n` +
    `Telefon: ${phone}\n` +
    `E-posta: ${email}\n` +
    `Hizmet: ${service}\n` +
    `Tercih Edilen Tarih: ${date}\n` +
    `Tercih Edilen Saat: ${time}\n\n` +
    `Bu bilgilerle ön randevu talebinizi kliniğimizin değerlendirmesine iletmemi onaylıyor musunuz? Evet veya Hayır şeklinde yanıtlayabilirsiniz.`;
}

export function formatMultilingualPrompt(
  step: "ASK_NAME" | "ASK_PHONE" | "ASK_EMAIL" | "INVALID_PHONE" | "INVALID_EMAIL" | "CANCELLED",
  locale: string = "tr",
  patientName?: string
): string {
  const isEn = locale.toLowerCase().startsWith("en");
  const isDe = locale.toLowerCase().startsWith("de");
  const isFr = locale.toLowerCase().startsWith("fr");
  const isAr = locale.toLowerCase().startsWith("ar");
  const firstName = patientName ? patientName.split(" ")[0] : "";

  switch (step) {
    case "ASK_NAME":
      if (isEn) return "Thank you. Could you please share your full name so we can record your appointment request?";
      if (isDe) return "Vielen Dank. Könnten Sie bitte Ihren vollständigen Namen angeben?";
      if (isFr) return "Merci. Pourriez-vous s'il vous plaît partager votre nom complet pour enregistrer votre demande ?";
      if (isAr) return "شكراً لك. هل يمكنك مشاركة اسمك الكامل لنتمكن من تسجيل طلب موعدك؟";
      return "Teşekkürler. Ön randevu talebinizi oluşturabilmem için adınızı ve soyadınızı öğrenebilir miyim?";

    case "ASK_PHONE":
      if (isEn) {
        return firstName
          ? `Thank you, ${firstName}. Could you please provide your phone number so the clinic team can confirm your appointment?`
          : "Thank you. Could you please provide your phone number so the clinic team can confirm your appointment?";
      }
      if (isDe) return "Vielen Dank. Könnten Sie bitte Ihre Telefonnummer angeben, damit das Klinikteam Ihren Termin bestätigen kann?";
      if (isFr) return "Merci. Pourriez-vous nous fournir votre numéro de téléphone afin que l'équipe clinique puisse vous contacter ?";
      if (isAr) return "شكراً لك. هل يمكنك تزويدنا برقم هاتفك حتى يتمكن فريق العيادة من تأكيد موعدك؟";
      return firstName
        ? `Teşekkür ederim, ${firstName} Bey/Hanım. Kliniğimizin ön randevu talebinizle ilgili sizinle iletişime geçebilmesi için telefon numaranızı paylaşabilir misiniz?`
        : "Teşekkür ederim. Kliniğimizin ön randevu talebinizle ilgili sizinle iletişime geçebilmesi için telefon numaranızı paylaşabilir misiniz?";

    case "ASK_EMAIL":
      if (isEn) return "Thank you for sharing your phone number. Could you please provide your email address so we can finalize your appointment request?";
      if (isDe) return "Vielen Dank. Könnten Sie bitte Ihre E-Mail-Adresse angeben, damit wir Ihre Terminanfrage abschließen können?";
      if (isFr) return "Merci. Pourriez-vous s'il vous plaît nous fournir votre adresse e-mail pour finaliser votre demande de rendez-vous ?";
      if (isAr) return "شكراً لك. هل يمكنك تزويدنا بعنوان بريدك الإلكتروني حتى نتمكن من إنهاء طلب الموعد الخاص بك؟";
      return "Teşekkür ederim. Son olarak, ön randevu talebinizle ilgili değerlendirme sonucu ve sonraki bilgilendirmeleri sizinle paylaşabilmemiz için e-posta adresinizi de paylaşabilir misiniz?";

    case "INVALID_PHONE":
      if (isEn) return "Could you please check your phone number? We need a valid contact number so our clinic team can reach you.";
      if (isDe) return "Bitte überprüfen Sie Ihre Telefonnummer, damit das Klinikteam Sie erreichen kann.";
      if (isFr) return "Veuillez vérifier votre numéro de téléphone afin que notre équipe clinique puisse vous joindre.";
      if (isAr) return "يرجى التحقق من رقم هاتفك حتى يتمكن فريق العيادة من الوصول إليك.";
      return "Telefon numaranızı kontrol edebilir misiniz? Kliniğimizin sizinle iletişime geçebilmesi için geçerli bir telefon numarası paylaşmanız gerekiyor.";

    case "INVALID_EMAIL":
      if (isEn) return "That email address appears to be incomplete. Could you please check it and send it again?";
      if (isDe) return "Diese E-Mail-Adresse scheint unvollständig zu sein. Bitte überprüfen Sie sie und senden Sie sie erneut.";
      if (isFr) return "Cette adresse e-mail semble incomplète. Pourriez-vous la vérifier et la renvoyer ?";
      if (isAr) return "يبدو أن عنوان البريد الإلكتروني غير مكتمل. يرجى التحقق منه وإرساله مرة أخرى.";
      return "E-posta adresiniz geçerli bir formatta görünmüyor. Ön randevu talebinizle ilgili bilgilendirmeleri size iletebilmemiz için geçerli bir e-posta adresi paylaşabilir misiniz?";

    case "CANCELLED":
      if (isEn) return "Your appointment request has been cancelled. How else may I assist you?";
      if (isDe) return "Ihre Terminanfrage wurde storniert. Wie kann ich Ihnen sonst noch helfen?";
      if (isFr) return "Votre demande de rendez-vous a été annulée. Comment puis-je vous aider d'autre ?";
      if (isAr) return "تم إلغاء طلب الموعد الخاص بك. كيف يمكنني مساعدتك أكثر؟";
      return "Randevu talebiniz iptal edildi. Size başka nasıl yardımcı olabilirim?";
  }
}

/**
 * Standardized, safe pricing fallback when structured pricing data is not specifically registered for a treatment.
 * Never uses generic groundedness failure prompts.
 */
export function formatPricingFallback(treatmentName?: string, locale: string = "tr"): string {
  const isEn = locale.toLowerCase().startsWith("en");
  const isDe = locale.toLowerCase().startsWith("de");
  const isFr = locale.toLowerCase().startsWith("fr");
  const isAr = locale.toLowerCase().startsWith("ar");

  if (isEn) {
    return "The final price for this treatment is confirmed after the clinic's evaluation. I can help you request a quote or arrange an appointment.";
  }
  if (isDe) {
    return "Der endgültige Preis für diese Behandlung wird nach der Untersuchung durch die Klinik festgelegt. Gerne erstelle ich ein Preisangebot für Sie oder helfe bei der Terminvereinbarung.";
  }
  if (isFr) {
    return "Le prix final pour ce traitement est confirmé après l'évaluation par la clinique. Je peux vous aider à demander un devis ou à planifier un rendez-vous.";
  }
  if (isAr) {
    return "يتم تحديد السعر النهائي لهذا العلاج بعد تقييم العيادة والفحص. يمكنني مساعدتك في طلب عرض أسعار أو ترتيب موعد.";
  }

  return "Bu tedavi için net fiyat, kliniğin muayene ve değerlendirmesi sonrasında belirlenmektedir. Dilerseniz fiyat teklifi talebi oluşturabilir veya randevu planlamanıza yardımcı olabilirim.";
}

/**
 * Standardized, polite contact response providing localized phone number and representative assistance.
 */
export function formatContactResponse(phone?: string, contactTarget?: string, locale: string = "tr"): string {
  const isEn = locale.toLowerCase().startsWith("en");
  const isDe = locale.toLowerCase().startsWith("de");
  const isFr = locale.toLowerCase().startsWith("fr");
  const isAr = locale.toLowerCase().startsWith("ar");

  const phoneStr = phone ? ` (${phone})` : "";

  if (isEn) {
    return `Our clinic team is available to assist you directly${phoneStr}. Would you like us to have a representative contact you, or would you like help with booking an appointment?`;
  }
  if (isDe) {
    return `Unser Klinikteam steht Ihnen gerne direkt zur Verfügung${phoneStr}. Möchten Sie, dass sich ein Mitarbeiter bei Ihnen meldet, oder kann ich Ihnen bei der Terminvereinbarung helfen?`;
  }
  if (isFr) {
    return `Notre équipe clinique est à votre disposition pour vous aider directement${phoneStr}. Souhaitez-vous qu'un représentant vous contacte ou puis-je vous aider à prendre rendez-vous ?`;
  }
  if (isAr) {
    return `فريق العيادة متاح لمساعدتك مباشرة${phoneStr}. هل ترغب في أن يتواصل معك ممثلنا، أم يمكنني مساعدتك في حجز موعد؟`;
  }

  return `Klinik ekibimize doğrudan${phoneStr} numarasından ulaşabilirsiniz. Dilerseniz yetkili bir temsilcimizin size ulaşmasını sağlayabilir veya randevu talebinizi hemen oluşturabilirim.`;
}
