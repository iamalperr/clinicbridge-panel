/**
 * Deterministic prompt copy for appointment slot collection: concise voice questions,
 * acknowledgements built from canonical draft state, and the bounded retry ladder
 * (clarify → guide → handoff offer). Product-global; no LLM involvement.
 *
 * Voice copy is spoken-first: no labels, no "(Örn: …)" parentheticals, no written
 * abbreviations. Web keeps `ConversationStateEngine.generateNextSlotPrompt` as its
 * base question and only uses the recovery copy after a failed answer.
 */

import type { SlotName, SlotOutcome } from "./slotParsing";

export type SlotRecoveryStage = "clarify" | "guide" | "handoff";

/** Failed attempts on the same slot before the existing human/contact handoff is offered. */
export const SLOT_HANDOFF_ATTEMPT = 3;

export function slotRecoveryStage(attempt: number): SlotRecoveryStage {
  if (attempt >= SLOT_HANDOFF_ATTEMPT) return "handoff";
  return attempt === 2 ? "guide" : "clarify";
}

type Lang = "tr" | "en" | "de" | "fr" | "ar";

function langOf(locale: string): Lang {
  const l = (locale || "tr").toLowerCase();
  if (l.startsWith("en")) return "en";
  if (l.startsWith("de")) return "de";
  if (l.startsWith("fr")) return "fr";
  if (l.startsWith("ar")) return "ar";
  return "tr";
}

const VOICE_QUESTIONS: Record<"tr" | "en", Record<SlotName, readonly [string, string]>> = {
  tr: {
    treatment: ["Hangi tedavi için randevu almak istersiniz?", "Hangi işlem için gelmek istiyorsunuz?"],
    preferredDate: ["Hangi gün gelmek istersiniz?", "Size hangi gün uygun olur?"],
    preferredTime: ["Saat kaçta gelmek istersiniz?", "Hangi saat size uygun olur?"],
    fullName: [
      "Adınızı ve soyadınızı alabilir miyim?",
      "Randevuyu kimin adına oluşturayım? Adınızı ve soyadınızı söyler misiniz?",
    ],
    phone: ["Size ulaşabileceğimiz telefon numaranızı söyler misiniz?", "Telefon numaranızı alabilir miyim?"],
    email: [
      "E-posta adresinizi de paylaşmak ister misiniz? İsterseniz e-posta vermeden de devam edebiliriz.",
      "E-posta adresinizi söyler misiniz? Dilerseniz e-posta vermeden de devam edebiliriz.",
    ],
  },
  en: {
    treatment: ["Which treatment would you like to book?", "What would you like to come in for?"],
    preferredDate: ["Which day would you like to come in?", "What day works for you?"],
    preferredTime: ["What time would suit you?", "What time works best for you?"],
    fullName: ["May I have your first and last name?", "Who should I book this for? Please tell me your full name."],
    phone: ["What phone number can the clinic reach you on?", "Could I have your phone number?"],
    email: [
      "Would you like to share your email address? We can also continue without one.",
      "Could you tell me your email address? We can also continue without one.",
    ],
  },
};

/** Spoken question for the next missing slot, or null when the locale has no voice copy. */
export function voiceSlotQuestion(slot: SlotName, locale: string, variant = 0): string | null {
  const lang = langOf(locale);
  if (lang !== "tr" && lang !== "en") return null;
  return VOICE_QUESTIONS[lang][slot][variant % 2];
}

const TR_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function spokenDate(isoDate: string | undefined, weekday: string | undefined, lang: Lang): string | null {
  const m = isoDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const day = parseInt(m[3], 10);
  const month = parseInt(m[2], 10) - 1;
  if (lang === "en") return `${EN_MONTHS[month]} ${day}`;
  const base = `${day} ${TR_MONTHS[month]}`;
  return weekday ? `${base} ${weekday}` : base;
}

export interface AcknowledgementDraft {
  requestedDate?: string;
  requestedWeekday?: string;
  requestedTime?: string;
}

/**
 * One short acknowledgement for what this turn changed, from canonical draft values.
 * Returns "" when nothing changed. Never names the patient and never repeats a
 * thank-you that opened the previous reply.
 */
export function slotAcknowledgement(params: {
  filledSlots: readonly SlotName[];
  correctedSlots: readonly SlotName[];
  draft: AcknowledgementDraft;
  locale: string;
  previousReply?: string | null;
}): string {
  const lang = langOf(params.locale);
  if (lang !== "tr" && lang !== "en") return "";
  const tr = lang === "tr";
  const thankedLastTime = /^(teşekkür|thank)/i.test((params.previousReply || "").trim());

  if (params.correctedSlots.length > 0) return tr ? "Tamam, güncelledim." : "Okay, I've updated that.";
  if (params.filledSlots.length === 0) return "";
  if (params.filledSlots.length > 1) {
    if (thankedLastTime) return tr ? "Bilgilerinizi aldım." : "I've noted those details.";
    return tr ? "Teşekkürler, bilgilerinizi aldım." : "Thank you, I've noted those details.";
  }

  switch (params.filledSlots[0]) {
    case "fullName":
      if (thankedLastTime) return tr ? "Tamamdır." : "Got it.";
      return tr ? "Teşekkür ederim." : "Thank you.";
    case "preferredDate": {
      const date = spokenDate(params.draft.requestedDate, params.draft.requestedWeekday, lang);
      if (!date) return tr ? "Tamamdır." : "Got it.";
      return tr ? `Tamamdır, ${date}.` : `Got it, ${date}.`;
    }
    case "preferredTime":
      if (!params.draft.requestedTime) return tr ? "Anladım." : "Got it.";
      return tr ? `Anladım, saat ${params.draft.requestedTime}.` : `Got it, ${params.draft.requestedTime}.`;
    case "phone":
      return tr ? "Numaranızı aldım." : "I've got your number.";
    case "email":
      return tr ? "E-posta adresinizi aldım." : "I've got your email address.";
    case "treatment":
      return tr ? "Anladım." : "Understood.";
    default:
      return "";
  }
}

const TR_SLOT_PHRASE: Record<SlotName, string> = {
  treatment: "istediğiniz tedaviyi",
  preferredDate: "gelmek istediğiniz günü",
  preferredTime: "gelmek istediğiniz saati",
  fullName: "adınızı ve soyadınızı",
  phone: "telefon numaranızı",
  email: "e-posta adresinizi",
};

const EN_SLOT_PHRASE: Record<SlotName, string> = {
  treatment: "the treatment you'd like",
  preferredDate: "the day you'd like to come in",
  preferredTime: "the time you'd like",
  fullName: "your first and last name",
  phone: "your phone number",
  email: "your email address",
};

const SORRY: Record<"de" | "fr" | "ar", string> = {
  de: "Entschuldigung, das habe ich nicht ganz verstanden.",
  fr: "Désolé, je n'ai pas bien compris.",
  ar: "عذرًا، لم أفهم ذلك جيدًا.",
};

const HANDOFF_OTHER: Record<"de" | "fr" | "ar", string> = {
  de: "Ich konnte diese Angabe leider nicht erfassen. Ihre bisherigen Angaben bleiben gespeichert. Möchten Sie, dass das Klinikteam Sie kontaktiert?",
  fr: "Je n'arrive pas à saisir cette information. Vos informations sont conservées. Souhaitez-vous que l'équipe de la clinique vous contacte ?",
  ar: "لم أتمكن من فهم هذه المعلومة. تم حفظ بياناتك. هل تريد أن يتواصل معك فريق العيادة؟",
};

function trRecovery(slot: SlotName, stage: "clarify" | "guide", outcome?: SlotOutcome): string {
  switch (slot) {
    case "fullName":
      if (stage === "clarify") {
        return outcome?.reasonCode === "NAME_SINGLE_TOKEN"
          ? "Soyadınızı da alabilir miyim? Adınızla birlikte söyleyebilirsiniz."
          : "Adınızı tam anlayamadım. Adınızı ve soyadınızı tekrar söyler misiniz?";
      }
      return "Lütfen yalnızca adınızı ve soyadınızı söyleyin, örneğin Ayşe Yılmaz.";
    case "phone":
      if (outcome?.status === "ambiguous") {
        return "Numarayı iki farklı şekilde anlayabildim. Rakamları tek tek söyler misiniz?";
      }
      if (stage === "clarify") return "Telefon numaranızı tam alamadım. Numarayı baştan söyler misiniz?";
      return "Numarayı sıfır beş ile başlayarak, rakamları tek tek ya da ikişer ikişer söyleyebilirsiniz.";
    case "preferredDate":
      if (outcome?.reasonCode === "DATE_DAY_OF_MONTH_PASSED") {
        return "Bu ayın o günü geçti. Hangi ayın kaçı olduğunu söyler misiniz? Örneğin on iki kasım.";
      }
      if (stage === "clarify") return "Tarihi tam anlayamadım. Hangi gün gelmek istediğinizi tekrar söyler misiniz?";
      return "Örneğin yarın, cuma ya da on altı ekim diyebilirsiniz. Hangi gün uygun olur?";
    case "preferredTime":
      if (stage === "clarify") return "Saati tam anlayamadım. Saat kaçta gelmek istediğinizi tekrar söyler misiniz?";
      return "Örneğin saat on dört ya da öğleden sonra iki diyebilirsiniz. Hangi saat uygun olur?";
    case "treatment":
      if (stage === "clarify") return "Hangi tedaviyi istediğinizi tam anlayamadım. Hangi işlem için gelmek istersiniz?";
      return "Örneğin implant, diş beyazlatma ya da muayene diyebilirsiniz. Hangisi için randevu oluşturayım?";
    case "email":
      return "E-posta adresinizi tam alamadım. Tekrar söyleyebilir ya da e-posta vermeden devam edebiliriz.";
  }
}

function enRecovery(slot: SlotName, stage: "clarify" | "guide", outcome?: SlotOutcome): string {
  switch (slot) {
    case "fullName":
      if (stage === "clarify") {
        return outcome?.reasonCode === "NAME_SINGLE_TOKEN"
          ? "Could I have your last name as well? You can say it together with your first name."
          : "I didn't quite catch your name. Could you say your first and last name again?";
      }
      return "Please say just your first and last name, for example Jane Smith.";
    case "phone":
      if (outcome?.status === "ambiguous") return "I could read that number two ways. Could you say the digits one by one?";
      if (stage === "clarify") return "I didn't get your full phone number. Could you say it again from the start?";
      return "You can say the number digit by digit, starting with the country or area code.";
    case "preferredDate":
      if (outcome?.reasonCode === "DATE_DAY_OF_MONTH_PASSED") {
        return "That day has already passed this month. Which month did you mean, for example November 12?";
      }
      if (stage === "clarify") return "I didn't catch the date. Which day would you like to come in?";
      return "For example, you can say tomorrow, Friday, or October 16. Which day works for you?";
    case "preferredTime":
      if (stage === "clarify") return "I didn't catch the time. What time would you like to come in?";
      return "For example, you can say 2 PM or in the afternoon. What time works for you?";
    case "treatment":
      if (stage === "clarify") return "I didn't catch which treatment you need. What would you like to come in for?";
      return "For example, you can say implant, teeth whitening, or a check-up. Which one should I book?";
    case "email":
      return "I didn't get a valid email address. You can say it again, or we can continue without one.";
  }
}

/**
 * Prompt after a failed answer to `slot`. `attempt` counts consecutive failures on the
 * same slot (1-based). `basePrompt` is the channel's normal question for the slot,
 * used where a locale has no dedicated recovery copy.
 */
export function slotRecoveryPrompt(params: {
  slot: SlotName;
  attempt: number;
  outcome?: SlotOutcome;
  locale: string;
  basePrompt: string;
}): string {
  const lang = langOf(params.locale);
  const stage = slotRecoveryStage(params.attempt);

  if (params.slot === "preferredTime" && params.outcome?.status === "ambiguous" && params.outcome.candidates?.length === 2) {
    const [a, b] = params.outcome.candidates;
    if (lang === "tr") return `Saat ${a} mi, yoksa ${b} mi demek istediniz?`;
    if (lang === "en") return `Did you mean ${a} or ${b}?`;
  }

  if (stage === "handoff") return slotHandoffOffer(params.slot, params.locale);

  if (lang === "tr") return trRecovery(params.slot, stage, params.outcome);
  if (lang === "en") return enRecovery(params.slot, stage, params.outcome);
  return `${SORRY[lang]} ${params.basePrompt}`;
}

/** Offers the existing contact/handoff path while keeping the collected draft. */
export function slotHandoffOffer(slot: SlotName, locale: string): string {
  const lang = langOf(locale);
  if (lang === "tr") {
    return `Bu bilgiyi bir türlü doğru alamadım, kusura bakmayın. Şu ana kadar verdiğiniz bilgileri saklıyorum. İsterseniz klinik ekibimiz sizinle iletişime geçsin, ister misiniz? Tekrar denemek isterseniz ${TR_SLOT_PHRASE[slot]} söyleyebilirsiniz.`;
  }
  if (lang === "en") {
    return `I'm sorry, I still couldn't get that. I've kept everything you've told me so far. Would you like the clinic team to contact you? Or, to try again, just tell me ${EN_SLOT_PHRASE[slot]}.`;
  }
  return HANDOFF_OTHER[lang];
}

/** The caller declined the handoff offer: continue collecting with structured guidance. */
export function slotHandoffDeclinedPrompt(slot: SlotName, locale: string, basePrompt: string): string {
  const lang = langOf(locale);
  if (lang === "tr") return `Peki, devam edelim. ${trRecovery(slot, "guide")}`;
  if (lang === "en") return `Okay, let's continue. ${enRecovery(slot, "guide")}`;
  return basePrompt;
}
