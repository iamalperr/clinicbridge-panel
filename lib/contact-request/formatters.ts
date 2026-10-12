/**
 * Truthful patient-facing copy for Contact Request / Human Handoff.
 * Never claims clinic channel capability unless configured separately.
 */

import { methodLabel } from "./intent";
import type { PreferredContactMethod } from "./types";

function isTr(locale: string): boolean {
  return (locale || "en").toLowerCase().startsWith("tr");
}

export function formatContactRequestConfirmationPrompt(
  method: PreferredContactMethod,
  locale: string = "en"
): string {
  const m = methodLabel(method, locale);
  if (isTr(locale)) {
    if (method === "unspecified") {
      return "İletişim talebinizi klinik ekibine iletmemi ister misiniz? Tercih ettiğiniz iletişim yöntemini (telefon, mesaj, WhatsApp veya e-posta) de belirtebilirsiniz.";
    }
    return `İletişim talebinizi klinik ekibine iletip ${m} tercih ettiğinizi not etmemi ister misiniz?`;
  }
  if (method === "unspecified") {
    return "Would you like me to share your contact request with the clinic team so they can get in touch? You can also tell me your preferred method (phone, text, WhatsApp, or email).";
  }
  return `Would you like me to share your contact request with the clinic team and note that you prefer ${m}?`;
}

export function formatAskForPhone(locale: string = "en"): string {
  if (isTr(locale)) {
    return "Tabii. Klinik ekibinin size ulaşabilmesi için lütfen telefon numaranızı paylaşır mısınız?";
  }
  return "Of course. Could you share your phone number so the clinic team can reach you?";
}

export function formatAskForEmail(locale: string = "en"): string {
  if (isTr(locale)) {
    return "Tabii. Klinik ekibinin size e-posta ile ulaşabilmesi için lütfen e-posta adresinizi paylaşır mısınız?";
  }
  return "Of course. Could you share your email address so the clinic team can reach you?";
}

export function formatContactRequestSuccess(params: {
  preferredMethod: PreferredContactMethod;
  locale?: string;
  patientNoteHint?: string;
}): string {
  const locale = params.locale || "en";
  const m = methodLabel(params.preferredMethod, locale);
  if (isTr(locale)) {
    if (params.preferredMethod === "unspecified") {
      return "Tabii. İletişim talebinizi klinik ekibine ilettim. Ekip talebinizi inceleyip size uygun şekilde dönüş yapabilir.";
    }
    return `Tabii. İletişim talebinizi klinik ekibine ilettim ve ${m} tercih ettiğinizi not ettim. Ekip talebinizi inceleyip size uygun şekilde ulaşabilir.`;
  }
  if (params.preferredMethod === "unspecified") {
    return "Of course. I've forwarded your contact request to the clinic team. They can review it and get in touch with you accordingly.";
  }
  return `Of course. I've forwarded your contact request to the clinic team and noted that you prefer ${m}. The clinic team can review your request and contact you accordingly.`;
}

export function formatContactRequestFailure(locale: string = "en"): string {
  if (isTr(locale)) {
    return "Şu anda iletişim talebinizi otomatik olarak iletemiyorum. Lütfen kısa süre sonra tekrar deneyin veya klinik iletişim bilgilerini kullanarak doğrudan ulaşın.";
  }
  return "I'm unable to forward your contact request automatically right now. Please try again shortly, or reach the clinic using the contact details provided.";
}

export function formatContactRequestHandoffDisabled(params: {
  clinicPhone?: string;
  locale?: string;
}): string {
  const locale = params.locale || "en";
  const phone = (params.clinicPhone || "").trim();
  if (isTr(locale)) {
    if (phone) {
      return `Şu anda otomatik iletişim talebi iletimi bu klinik için aktif değil. Klinik ekibine ${phone} numarasından doğrudan ulaşabilirsiniz.`;
    }
    return "Şu anda otomatik iletişim talebi iletimi bu klinik için aktif değil. Lütfen klinik iletişim kanallarından doğrudan ulaşmayı deneyin.";
  }
  if (phone) {
    return `Automatic contact-request forwarding is not enabled for this clinic right now. You can reach the clinic team directly at ${phone}.`;
  }
  return "Automatic contact-request forwarding is not enabled for this clinic right now. Please try reaching the clinic through their published contact channels.";
}

export function formatContactRequestCancelled(locale: string = "en"): string {
  if (isTr(locale)) {
    return "Anladım. İletişim talebinizi iptal ettim; klinik ekibine yeni bir iletişim bildirimi göndermeyeceğim.";
  }
  return "Understood. I've cancelled your contact request and won't send a new contact notification to the clinic team.";
}

/** Declined before any request existed: nothing was cancelled, nothing was sent. */
export function formatContactRequestNotForwarded(locale: string = "en"): string {
  if (isTr(locale)) {
    return "Anladım. Klinik ekibine bir iletişim talebi iletmedim. Size başka nasıl yardımcı olabilirim?";
  }
  return "Understood. I haven't forwarded a contact request to the clinic team. How else can I help you?";
}

/** No live transfer exists, so a "connect me to a person" request becomes a confirmed Contact Request. */
export function formatLiveAgentHandoffConfirmationPrompt(locale: string = "en"): string {
  if (isTr(locale)) {
    return "Sizi şu anda doğrudan bir yetkiliye bağlayamıyorum. İsterseniz talebinizi klinik ekibine iletebilirim; ekip size dönüş yapabilir. İletmemi ister misiniz?";
  }
  return "I can't put you through to a team member directly right now. If you like, I can forward your request to the clinic team so they can get back to you. Would you like me to do that?";
}

/*
 * Appointment cancellation after submission. ClinicBridge has no patient-side cancel
 * operation, so the patient's wish is forwarded as a Contact Request and the copy never
 * says the appointment itself was cancelled.
 */

export function formatAppointmentCancellationOffer(locale: string = "en"): string {
  if (isTr(locale)) {
    return "Randevunuzu buradan doğrudan iptal edemiyorum, ancak randevu iptal talebinizi kliniğe iletebilirim. İletmemi ister misiniz?";
  }
  return "I can't cancel your appointment directly from here, but I can forward your cancellation request to the clinic. Would you like me to do that?";
}

export function formatAppointmentCancellationInfo(locale: string = "en"): string {
  if (isTr(locale)) {
    return "Kayıtlı bir randevuyu buradan doğrudan iptal edemiyorum. Randevu iptal talebinizi kliniğe iletebilirim; klinik ekibi talebinizi inceleyip size dönüş yapabilir. İptal talebinizi iletmemi ister misiniz?";
  }
  return "I can't cancel a booked appointment directly from here. I can forward a cancellation request to the clinic, and the clinic team can review it and get back to you. Would you like me to forward it?";
}

export function formatAppointmentCancellationForwarded(locale: string = "en"): string {
  if (isTr(locale)) {
    return "Randevu iptal talebinizi klinik ekibine ilettim. İptal, klinik ekibi talebinizi işlediğinde kesinleşir; ekip size dönüş yapabilir.";
  }
  return "I've forwarded your cancellation request to the clinic team. The cancellation is final once the clinic team processes it; they can get back to you.";
}

export function formatAppointmentCancellationAddedToOpenRequest(locale: string = "en"): string {
  if (isTr(locale)) {
    return "Klinik ekibinde açık bir iletişim talebiniz zaten var; randevu iptal isteğinizi bu talebe not ettim. Ekibin dönüşünü bekleyebilirsiniz.";
  }
  return "You already have an open contact request with the clinic team; I've added your cancellation request to it. You can wait for their follow-up.";
}

export function formatAppointmentCancellationNotForwarded(locale: string = "en"): string {
  if (isTr(locale)) {
    return "Anladım, kliniğe bir iptal talebi iletmedim; randevunuzla ilgili bir işlem yapmadım. Size başka nasıl yardımcı olabilirim?";
  }
  return "Understood. I haven't sent a cancellation request and haven't changed anything about your appointment. How else can I help you?";
}

export function formatAppointmentUnchanged(locale: string = "en"): string {
  if (isTr(locale)) {
    return "Anladım, randevunuzla ilgili herhangi bir işlem yapmadım. Size başka nasıl yardımcı olabilirim?";
  }
  return "Understood. I haven't changed anything about your appointment. How else can I help you?";
}

export function formatAppointmentCancellationUnavailable(locale: string = "en"): string {
  if (isTr(locale)) {
    return "Randevu iptalini buradan doğrudan gerçekleştiremiyorum.";
  }
  return "I can't cancel appointments directly from here.";
}

/** Staff-facing note stored on the Contact Request. */
export function appointmentCancellationRequestNote(appointmentId?: string | null): string {
  const reference = appointmentId ? ` Randevu kaydı / appointment: ${appointmentId}.` : "";
  return `Hasta randevusunun iptal edilmesini istiyor (appointment cancellation request).${reference}`;
}

export function formatContactRequestUpdated(params: {
  preferredMethod: PreferredContactMethod;
  locale?: string;
}): string {
  const locale = params.locale || "en";
  const m = methodLabel(params.preferredMethod, locale);
  if (isTr(locale)) {
    return `Tercihinizi güncelledim: ${m}. Klinik ekibi açık iletişim talebinizi bu tercihle görebilir.`;
  }
  return `I've updated your preference to ${m}. The clinic team can see this on your open contact request.`;
}

export function formatContactRequestAlreadyPending(params: {
  preferredMethod: PreferredContactMethod;
  locale?: string;
}): string {
  const locale = params.locale || "en";
  const m = methodLabel(params.preferredMethod, locale);
  if (isTr(locale)) {
    return `İletişim talebiniz zaten klinik ekibine iletildi${
      params.preferredMethod !== "unspecified" ? ` (${m} tercihi not edildi)` : ""
    }. Ekibin dönüşünü bekleyebilirsiniz.`;
  }
  return `Your contact request has already been forwarded to the clinic team${
    params.preferredMethod !== "unspecified" ? ` (preferred: ${m})` : ""
  }. You can wait for their follow-up.`;
}
