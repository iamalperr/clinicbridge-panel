import { isOutsideClinicHours, type ClinicWeek } from "./clinicHours";
import { detectPreviewLanguage, previewLanguageSignal, type PreviewUiLanguage } from "./previewLanguage";

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
  followUp: string | null;
}

const CONFIRM: Record<PreviewUiLanguage, string> = {
  tr: "Talebiniz klinik ekibine iletildi, en kısa sürede dönüş yapılacak",
  en: "Your request has been sent to the clinic team. They will contact you shortly.",
  de: "Ihre Anfrage wurde an das Klinikteam weitergeleitet. Wir melden uns in Kürze.",
  ar: "تم إرسال طلبكم إلى فريق العيادة، وسنتواصل معكم في أقرب وقت.",
  ru: "Ваша заявка передана команде клиники. Мы свяжемся с вами в ближайшее время.",
};

const ASK: Record<PreviewUiLanguage, { name: string; treatment: string; date: string; contact: string }> = {
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

const TREATMENT_ALIASES: { label: string; words: string[] }[] = [
  { label: "İmplant", words: ["implant", "implantat", "имплант", "زراعة"] },
  { label: "Zirkonyum kaplama", words: ["zirkon", "zirconia", "zircon", "zirkonyum", "crown", "kron"] },
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

const INTENT = /randevu|appointment|termin|موعد|запис/i;
const QUESTION = /\?|nedir|misiniz|misin|how |what |wie |warum |сколько|كم|هل/i;

function asks(text: string): "name" | "treatment" | "date" | "contact" | null {
  const prompts = Object.values(ASK);
  for (const prompt of prompts) {
    if (text === prompt.name) return "name";
    if (text === prompt.treatment) return "treatment";
    if (text === prompt.date) return "date";
    if (text === prompt.contact) return "contact";
  }
  return null;
}

function contactIn(text: string): string | null {
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (email) return email[0];
  const phone = text.match(/\+?\d[\d\s().-]{7,}\d/);
  if (phone) return phone[0].replace(/\s+/g, " ").trim();
  return null;
}

function treatmentIn(text: string, catalog: string[]): string | null {
  const folded = text.toLocaleLowerCase("tr-TR");
  for (const name of catalog) {
    if (name && folded.includes(name.toLocaleLowerCase("tr-TR"))) return name;
  }
  for (const alias of TREATMENT_ALIASES) {
    if (alias.words.some((word) => folded.includes(word))) return alias.label;
  }
  return null;
}

function countryIn(text: string): string | null {
  if (!/i'm in|i am in|\bin\b|\bfrom\b|\baus\b|из|في/i.test(text)) return null;
  return PLACES.find((place) => place.pattern.test(text))?.label ?? null;
}

function explicitName(text: string): string | null {
  const match = text.match(/(?:adım|benim adım|my name is|i am|ich hei(?:ß|ss)e|меня зовут|اسمي)\s+([^\n,.]{2,60})/i);
  if (!match) return null;
  return cleanName(match[1]);
}

function cleanName(value: string): string | null {
  const name = value.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 60) return null;
  if (contactIn(name) || /\d{3,}/.test(name) || QUESTION.test(name)) return null;
  return name;
}

function looksLikeDate(text: string): boolean {
  return /\d{1,2}[./]\d{1,2}|hafta|week|woche|недел|أسبوع|mayıs|haziran|ocak|şubat|mart|nisan|temmuz|ağustos|eylül|ekim|kasım|aralık|january|february|march|april|june|july|august|september|october|november|december|januar|februar|märz|mai|juni|juli|oktober|dezember|pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar|monday|friday/i.test(text);
}

export function advancePreviewIntake(input: {
  history: { role: "user" | "assistant"; content: string }[];
  message: string;
  language?: string | null;
  treatments?: string[];
  hours?: ClinicWeek | null;
  now?: Date;
}): IntakeResult {
  const message = input.message.trim();
  const users = [...input.history.filter((turn) => turn.role === "user").map((turn) => turn.content), message];
  const lastAssistant = [...input.history].reverse().find((turn) => turn.role === "assistant")?.content || "";
  const waiting = asks(lastAssistant);
  const earlier = [...input.history].reverse().find((turn) => turn.role === "user" && previewLanguageSignal(turn.content));
  const language = previewLanguageSignal(message)
    || (earlier ? previewLanguageSignal(earlier.content) : null)
    || detectPreviewLanguage(message, input.language);
  const intent = users.some((text) => INTENT.test(text)) || waiting !== null;
  if (!intent) return { handled: false, reply: null, lead: null, followUp: null };

  const catalog = input.treatments || [];
  const joined = users.join("\n");
  let name = explicitName(joined);
  let treatment = treatmentIn(joined, catalog);
  let datePreference: string | null = null;
  let contact = contactIn(joined);
  const country = countryIn(joined);

  for (let index = 0; index < input.history.length; index += 1) {
    const turn = input.history[index];
    if (turn.role !== "assistant") continue;
    const slot = asks(turn.content);
    const next = input.history[index + 1];
    if (!slot || !next || next.role !== "user") continue;
    if (slot === "name" && !name) name = cleanName(next.content);
    if (slot === "treatment" && !treatment) treatment = cleanName(next.content);
    if (slot === "date" && !contactIn(next.content)) datePreference = next.content.replace(/\s+/g, " ").trim().slice(0, 80);
    if (slot === "contact" && !contact) contact = cleanName(next.content);
  }

  if (waiting === "name" && !name) name = cleanName(message);
  if (waiting === "treatment" && !treatment && !QUESTION.test(message)) treatment = cleanName(message);
  if (waiting === "date" && !datePreference && !contactIn(message)) datePreference = message.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!datePreference && looksLikeDate(message) && !QUESTION.test(message)) datePreference = message.replace(/\s+/g, " ").trim().slice(0, 80);
  if (waiting === "contact" && !contact) contact = cleanName(message);

  const question = QUESTION.test(message) && !contactIn(message) && !treatmentIn(message, catalog);
  const prompts = ASK[language];
  const missing = !name ? prompts.name : !treatment ? prompts.treatment : !datePreference ? prompts.date : !contact ? prompts.contact : null;

  if (!missing && name && treatment && datePreference && contact) {
    const now = input.now || new Date();
    return {
      handled: true,
      reply: CONFIRM[language],
      followUp: null,
      lead: {
        name,
        language,
        country,
        treatment,
        datePreference,
        contact,
        summary: `${name}, ${treatment} için ${datePreference} tarihini tercih etti. İletişim: ${contact}.`,
        outsideHours: isOutsideClinicHours(now, input.hours ?? null),
        receivedAt: now.toISOString(),
      },
    };
  }

  if (question) return { handled: false, reply: null, lead: null, followUp: missing };
  return { handled: true, reply: missing, lead: null, followUp: null };
}
