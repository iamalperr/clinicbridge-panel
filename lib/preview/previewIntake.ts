import { isOutsideClinicHours, type ClinicWeek } from "./clinicHours";
import { detectPreviewLanguage, previewLanguageSignal, type PreviewUiLanguage } from "./previewLanguage";

export type IntakeSlot = "name" | "treatment" | "date" | "contact";
export type PreviewBookingIntent = "booking" | "question" | "both" | "other";

export interface PreviewIntakeState {
  active: boolean;
  waitingFor: IntakeSlot | null;
  name: string | null;
  treatment: string | null;
  datePreference: string | null;
  contact: string | null;
  country: string | null;
  language: PreviewUiLanguage;
  clarified: boolean;
}

export interface PreviewBookingFields {
  intent?: PreviewBookingIntent | null;
  name?: string | null;
  treatment?: string | null;
  datePreference?: string | null;
  contact?: string | null;
  country?: string | null;
}

export interface PreviewLead {
  name: string;
  language: PreviewUiLanguage;
  country: string | null;
  treatment: string;
  datePreference: string;
  contact: string;
  summary: string;
  outsideHours: boolean;
  receivedAt: string;
}

export interface IntakeResult {
  handled: boolean;
  reply: string | null;
  lead: PreviewLead | null;
  intakeState: PreviewIntakeState;
  answerQuestion: boolean;
}

const UNSPECIFIED = "belirtilmedi";

const CONFIRM: Record<PreviewUiLanguage, string> = {
  tr: "Talebiniz klinik ekibine iletildi",
  en: "Your request has been sent to the clinic team.",
  de: "Ihre Anfrage wurde an das Klinikteam weitergeleitet.",
  ar: "تم إرسال طلبكم إلى فريق العيادة.",
  ru: "Ваша заявка передана команде клиники.",
};

export const CLINIC_NOTE: Record<PreviewUiLanguage, string> = {
  tr: "Bu konuyu klinik ekibine not ediyorum, size dönecekler.",
  en: "I'll note this for the clinic team. They will get back to you.",
  de: "Ich notiere das für das Klinikteam. Man meldet sich bei Ihnen.",
  ar: "سأدوّن هذا لفريق العيادة، وسيتواصلون معكم.",
  ru: "Я передам это команде клиники. Они вам ответят.",
};

const ASK: Record<PreviewUiLanguage, Record<IntakeSlot, string>> = {
  tr: {
    name: "Randevu için adınızı ve soyadınızı yazar mısınız?",
    treatment: "Hangi tedaviyle ilgileniyorsunuz?",
    date: "Hangi tarihi veya haftayı tercih edersiniz?",
    contact: "Size ulaşabilmemiz için telefon numaranızı veya e-postanızı yazar mısınız?",
  },
  en: {
    name: "May I have your first and last name for the appointment request?",
    treatment: "Which treatment are you interested in?",
    date: "Which date or week do you prefer?",
    contact: "What phone number or email should the clinic use to reach you?",
  },
  de: {
    name: "Wie heißen Sie? Vor- und Nachname genügen für die Terminanfrage.",
    treatment: "Welche Behandlung interessiert Sie?",
    date: "Welches Datum oder welche Woche bevorzugen Sie?",
    contact: "Unter welcher Telefonnummer oder E-Mail erreicht Sie die Klinik?",
  },
  ar: {
    name: "ما اسمكم الكامل لطلب الموعد؟",
    treatment: "أي علاج يهمكم؟",
    date: "ما التاريخ أو الأسبوع الذي تفضلونه؟",
    contact: "ما رقم الهاتف أو البريد الإلكتروني للتواصل معكم؟",
  },
  ru: {
    name: "Как вас зовут? Для заявки достаточно имени и фамилии.",
    treatment: "Какое лечение вас интересует?",
    date: "Какую дату или неделю вы предпочитаете?",
    contact: "По какому телефону или e-mail клинике с вами связаться?",
  },
};

const CLARIFY: Record<PreviewUiLanguage, Record<IntakeSlot, string>> = {
  tr: {
    name: "Tam adınızı yazar mısınız? Örneğin: Ayşe Yılmaz.",
    treatment: "Tedavi adını kısaca yazar mısınız? Örneğin: implant.",
    date: "Tercih ettiğiniz günü veya haftayı yazar mısınız? Örneğin: 15 Aralık.",
    contact: "Telefon numaranızı veya e-postanızı yazar mısınız?",
  },
  en: {
    name: "Please write your full name, for example Anna Smith.",
    treatment: "Please name the treatment, for example implant.",
    date: "Please write a day or week, for example 15 December.",
    contact: "Please write a phone number or email address.",
  },
  de: {
    name: "Bitte schreiben Sie Ihren vollständigen Namen, zum Beispiel Anna Schmidt.",
    treatment: "Bitte nennen Sie die Behandlung, zum Beispiel Implantat.",
    date: "Bitte nennen Sie einen Tag oder eine Woche, zum Beispiel 15. Dezember.",
    contact: "Bitte schreiben Sie eine Telefonnummer oder E-Mail.",
  },
  ar: {
    name: "اكتبوا اسمكم الكامل، مثلاً: ليلى أحمد.",
    treatment: "اكتبوا اسم العلاج باختصار، مثلاً: زراعة.",
    date: "اكتبوا اليوم أو الأسبوع، مثلاً: 15 ديسمبر.",
    contact: "اكتبوا رقم الهاتف أو البريد الإلكتروني.",
  },
  ru: {
    name: "Напишите, пожалуйста, имя и фамилию, например Анна Иванова.",
    treatment: "Напишите лечение коротко, например имплант.",
    date: "Напишите день или неделю, например 15 декабря.",
    contact: "Напишите телефон или e-mail.",
  },
};

const TREATMENT_ALIASES: { label: string; words: string[] }[] = [
  { label: "İmplant", words: ["implant", "implantat", "имплант", "زراعة"] },
  { label: "Zirkonyum kaplama", words: ["zirkon", "zirconia", "zircon", "zirkonyum", "kron"] },
  { label: "Lamina", words: ["lamina", "veneer", "veneers"] },
  { label: "Hollywood smile", words: ["hollywood", "هوليود", "голливуд"] },
  { label: "Diş beyazlatma", words: ["beyazlat", "whitening", "bleaching", "отбел"] },
  { label: "All-on-4", words: ["all-on-4", "all on 4", "all-on-four", "all on four"] },
];

const PLACES: { pattern: RegExp; label: string }[] = [
  { pattern: /london|londra/i, label: "Londra" },
  { pattern: /berlin/i, label: "Berlin" },
  { pattern: /moscow|moskau|moskova|москв/i, label: "Moskova" },
  { pattern: /dubai|dubay|دبي/i, label: "Dubai" },
  { pattern: /paris|pariz/i, label: "Paris" },
  { pattern: /new york/i, label: "New York" },
];

const BOOKING = /randevu|appointment|\bbook\b|termin|موعد|запис/i;
const FILLER = /^(evet|tamam|ok|okay|yes|ja|да|نعم|hayır|no|nein)$/i;
const SIDE_QUESTION = /\?|ne kadar|nedir|nasıl|misiniz|misin|how long|how much|what |wie lange|wie viel|warum|сколько|كم|هل/i;
const SLOTS: IntakeSlot[] = ["name", "treatment", "date", "contact"];

function clip(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function contactIn(text: string): string | null {
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (email) return email[0].slice(0, 80);
  const phone = text.match(/\+\d[\d\s().-]{7,}\d|\b\d[\d\s().-]{8,}\d/);
  if (!phone) return null;
  return phone[0].replace(/\s+/g, " ").trim().slice(0, 40);
}

function isSideQuestion(text: string): boolean {
  return SIDE_QUESTION.test(text);
}

function acceptName(value: string): string | null {
  const name = clip(value, 60);
  if (name.length < 2 || FILLER.test(name) || contactIn(name) || isSideQuestion(name) || /\d/.test(name)) return null;
  if (!/\p{L}{2}/u.test(name)) return null;
  return name;
}

function fold(value: string): string {
  return value.toLocaleLowerCase("tr-TR").replace(/ı/g, "i");
}

function treatmentIn(text: string, catalog: string[]): string | null {
  const folded = fold(text);
  for (const name of catalog) {
    if (name && folded.includes(fold(name))) return clip(name, 80);
  }
  for (const alias of TREATMENT_ALIASES) {
    if (alias.words.some((word) => folded.includes(fold(word)))) return alias.label;
  }
  return null;
}

function dateIn(text: string): string | null {
  const dated = text.match(/\d{1,2}(?:[./]\d{1,2}(?:[./]\d{2,4})?|\s+[A-Za-zÀ-ÿğüşöçıİĞÜŞÖÇ]{3,12})/i);
  if (dated) return clip(dated[0], 80);
  if (!isSideQuestion(text) && text.length <= 80 && /hafta|week|woche|недел|أسبوع|mayıs|haziran|aralık|december|dezember|январ|ديسمبر/i.test(text)) {
    return clip(text, 80);
  }
  return null;
}

function countryIn(text: string): string | null {
  if (!/i'm in|i am in|\bin\b|\bfrom\b|\baus\b|из|في/i.test(text)) return null;
  return PLACES.find((place) => place.pattern.test(text))?.label ?? null;
}

function explicitName(text: string): string | null {
  const match = text.match(/(?:benim adım|adım|ben|my name is|i am|ich hei(?:ß|ss)e|меня зовут|اسمي)\s+([^,\n]{2,60})/i);
  if (!match) return null;
  return acceptName(match[1]);
}

function blankState(language: PreviewUiLanguage): PreviewIntakeState {
  return {
    active: false,
    waitingFor: null,
    name: null,
    treatment: null,
    datePreference: null,
    contact: null,
    country: null,
    language,
    clarified: false,
  };
}

function asLanguage(value: unknown, fallback: PreviewUiLanguage): PreviewUiLanguage {
  return value === "tr" || value === "en" || value === "de" || value === "ar" || value === "ru" ? value : fallback;
}

function asSlot(value: unknown): IntakeSlot | null {
  return value === "name" || value === "treatment" || value === "date" || value === "contact" ? value : null;
}

function asField(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = clip(value, max);
  return text || null;
}

/** Accepts a client-supplied booking draft. Invalid shapes are ignored. */
export function readIntakeState(value: unknown, fallbackLanguage: PreviewUiLanguage): PreviewIntakeState | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.active !== "boolean") return null;
  if (record.waitingFor !== null && record.waitingFor !== undefined && !asSlot(record.waitingFor)) return null;
  return {
    active: record.active,
    waitingFor: asSlot(record.waitingFor),
    name: asField(record.name, 60),
    treatment: asField(record.treatment, 80),
    datePreference: asField(record.datePreference, 80),
    contact: asField(record.contact, 80),
    country: asField(record.country, 40),
    language: asLanguage(record.language, fallbackLanguage),
    clarified: record.clarified === true,
  };
}

function extractFields(text: string, catalog: string[], classified?: PreviewBookingFields | null) {
  return {
    name: acceptName(classified?.name || "") || explicitName(text),
    treatment: treatmentIn(classified?.treatment || "", catalog) || treatmentIn(text, catalog),
    datePreference: dateIn(classified?.datePreference || "") || dateIn(text),
    contact: contactIn(classified?.contact || "") || contactIn(text),
    country: countryIn(classified?.country || "") || countryIn(text),
  };
}

function slotValue(state: PreviewIntakeState, slot: IntakeSlot): string | null {
  if (slot === "name") return state.name;
  if (slot === "treatment") return state.treatment;
  if (slot === "date") return state.datePreference;
  return state.contact;
}

function withSlot(state: PreviewIntakeState, slot: IntakeSlot, value: string): PreviewIntakeState {
  const next = { ...state, clarified: false };
  if (slot === "name") next.name = value;
  else if (slot === "treatment") next.treatment = value;
  else if (slot === "date") next.datePreference = value;
  else next.contact = value;
  return next;
}

function firstMissing(state: PreviewIntakeState): IntakeSlot | null {
  return SLOTS.find((slot) => !slotValue(state, slot)) ?? null;
}

function summaryOf(state: PreviewIntakeState): string {
  return `${state.name}, ${state.treatment} için ${state.datePreference} tarihini tercih etti. İletişim: ${state.contact}.`;
}

function finish(state: PreviewIntakeState, hours: ClinicWeek | null | undefined, now: Date): IntakeResult {
  const language = state.language;
  return {
    handled: true,
    answerQuestion: false,
    reply: `${summaryOf(state)}\n${CONFIRM[language]}`,
    lead: {
      name: state.name || UNSPECIFIED,
      language,
      country: state.country,
      treatment: state.treatment || UNSPECIFIED,
      datePreference: state.datePreference || UNSPECIFIED,
      contact: state.contact || UNSPECIFIED,
      summary: summaryOf(state),
      outsideHours: isOutsideClinicHours(now, hours ?? null),
      receivedAt: now.toISOString(),
    },
    intakeState: blankState(language),
  };
}

function ask(state: PreviewIntakeState, slot: IntakeSlot): IntakeResult {
  return {
    handled: true,
    answerQuestion: false,
    reply: ASK[state.language][slot],
    lead: null,
    intakeState: { ...state, active: true, waitingFor: slot, clarified: false },
  };
}

export function composePreviewIntakeReply(result: IntakeResult, knowledgeAnswer: string | null): string {
  if (!result.answerQuestion) return result.reply || "";
  const unusable = !knowledgeAnswer || /bilgiye sahip değilim|do not have that information|bilgim yok/i.test(knowledgeAnswer);
  const answer = unusable ? CLINIC_NOTE[result.intakeState.language] : knowledgeAnswer;
  return `${answer}\n\n${result.reply || ""}`.trim();
}

export function advancePreviewIntake(input: {
  message: string;
  state?: unknown;
  language?: string | null;
  treatments?: string[];
  hours?: ClinicWeek | null;
  now?: Date;
  classified?: PreviewBookingFields | null;
}): IntakeResult {
  const message = input.message.trim();
  const language = previewLanguageSignal(message) || detectPreviewLanguage(message, input.language);
  const stored = readIntakeState(input.state, language);
  const state = stored ?? blankState(language);
  if (previewLanguageSignal(message)) state.language = language;
  const catalog = input.treatments || [];
  const extracted = extractFields(message, catalog, input.classified);
  const intent = input.classified?.intent;
  const filledCount = [extracted.name, extracted.treatment, extracted.datePreference, extracted.contact].filter(Boolean).length;
  const booking = state.active || intent === "booking" || intent === "both" || filledCount >= 3 || BOOKING.test(message);
  const now = input.now || new Date();

  if (!booking) {
    return { handled: false, reply: null, lead: null, intakeState: state.active ? state : blankState(language), answerQuestion: false };
  }

  let next: PreviewIntakeState = {
    ...state,
    active: true,
    language: state.language,
    country: state.country || extracted.country,
  };

  if (!state.active) {
    next = {
      ...next,
      name: extracted.name,
      treatment: extracted.treatment,
      datePreference: extracted.datePreference,
      contact: extracted.contact,
      clarified: false,
    };
  } else if (isSideQuestion(message)) {
    const pending = state.waitingFor || firstMissing(next);
    return {
      handled: true,
      answerQuestion: true,
      reply: pending ? ASK[next.language][pending] : null,
      lead: null,
      intakeState: { ...next, waitingFor: pending, clarified: false },
    };
  } else {
    const slot = state.waitingFor;
    const accepted = slot === "name"
      ? extracted.name || acceptName(message)
      : slot === "treatment"
        ? extracted.treatment || (message.length <= 80 && !FILLER.test(message) && !contactIn(message) ? acceptName(message) : null)
        : slot === "date"
          ? extracted.datePreference
          : slot === "contact"
            ? extracted.contact
            : null;
    if (slot && accepted) {
      next = withSlot(next, slot, accepted);
      if (slot !== "name" && extracted.name) next.name = next.name || extracted.name;
      if (slot !== "treatment" && extracted.treatment) next.treatment = next.treatment || extracted.treatment;
      if (slot !== "date" && extracted.datePreference) next.datePreference = next.datePreference || extracted.datePreference;
      if (slot !== "contact" && extracted.contact) next.contact = next.contact || extracted.contact;
    } else if (slot && !state.clarified) {
      return {
        handled: true,
        answerQuestion: false,
        reply: CLARIFY[next.language][slot],
        lead: null,
        intakeState: { ...next, waitingFor: slot, clarified: true },
      };
    } else if (slot) {
      next = withSlot(next, slot, UNSPECIFIED);
    }
  }

  const missing = firstMissing(next);
  if (!missing) return finish(next, input.hours, now);
  return ask(next, missing);
}
