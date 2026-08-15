/**
 * Multilingual formatters for appointment flow summaries, sequential prompts,
 * safe pricing fallbacks, contact responses, and locale resolution across TR, EN, DE, FR, AR.
 */
import { normalizeTurkishPhone } from "../phoneUtils";

export interface AppointmentSummaryInput {
  patientName?: string | null;
  patientPhone?: string | null;
  patientEmail?: string | null;
  requestedService?: string | null;
  requestedDate?: string | null;
  preferredDateDisplay?: string | null;
  requestedWeekday?: string | null;
  requestedTime?: string | null;
  preferredTimeDisplay?: string | null;
  visitType?: string | null;
  clinicName?: string | null;
}

export interface LocaleResolutionParams {
  requestLanguage?: string | null;
  persistedLocale?: string | null;
  currentMessage?: string | null;
  history?: Array<{ role: "user" | "assistant" | "system" | string; content: string }> | null;
  clinicDefaultLocale?: string | null;
}

export interface LocaleResolutionResult {
  locale: string;
  reason: string;
}

const SUPPORTED_LOCALES = new Set(["en", "tr", "de", "fr", "ar", "ru", "es", "it"]);

function normalizeLocaleCode(value?: string | null): string | null {
  if (!value || typeof value !== "string") return null;
  const clean = value.trim().toLowerCase().slice(0, 2);
  return SUPPORTED_LOCALES.has(clean) ? clean : null;
}

function wordCount(text?: string | null): number {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * Resolves the conversation locale with an inspectable reason.
 *
 * Priority (product rule: patient message language must not be overridden by
 * widget browser language / requestLanguage unless the user clearly switches):
 * 1. Explicit language-switch command in the current message
 * 2. Strong language detected from the current message
 * 3. Persisted conversation locale (may follow a clear language change in #2)
 * 4. Soft requestLanguage hint from the client / widget
 * 5. Language detected from recent user history
 * 6. Clinic default locale
 * 7. "tr"
 */
export function resolveConversationLocaleWithMeta(
  params: LocaleResolutionParams
): LocaleResolutionResult {
  const currentMsg = (params.currentMessage || "").trim().toLowerCase();
  const detectedFromMsg = detectTextLanguage(params.currentMessage || "");
  const requestLang = normalizeLocaleCode(params.requestLanguage);
  const persistedLang = normalizeLocaleCode(params.persistedLocale);
  const clinicLang = normalizeLocaleCode(params.clinicDefaultLocale);

  // 1. Explicit command in current message
  if (
    currentMsg.includes("speak in english") ||
    currentMsg.includes("english please") ||
    currentMsg.includes("in english") ||
    currentMsg.includes("switch to english") ||
    currentMsg.includes("can we speak english") ||
    currentMsg.includes("let's speak in english") ||
    currentMsg.includes("can we talk in english")
  ) {
    return { locale: "en", reason: "explicit_switch_command:en" };
  }
  if (
    currentMsg.includes("türkçe konuşalım") ||
    currentMsg.includes("türkçe lütfen") ||
    currentMsg.includes("türkçe devam edelim") ||
    (currentMsg.includes("türkçe") && (currentMsg.includes("geç") || currentMsg.includes("konuş")))
  ) {
    return { locale: "tr", reason: "explicit_switch_command:tr" };
  }
  if (currentMsg.includes("auf deutsch") || currentMsg.includes("deutsch bitte")) {
    return { locale: "de", reason: "explicit_switch_command:de" };
  }
  if (currentMsg.includes("en français") || currentMsg.includes("français s'il vous plaît")) {
    return { locale: "fr", reason: "explicit_switch_command:fr" };
  }
  if (currentMsg.includes("باللغة العربية") || currentMsg.includes("تكلم بالعربية")) {
    return { locale: "ar", reason: "explicit_switch_command:ar" };
  }

  // 2. Strong message-content detection beats widget browser language.
  //    A Turkish pricing question must stay Turkish even when navigator.language is "en".
  if (detectedFromMsg && wordCount(params.currentMessage) >= 2) {
    if (!persistedLang || persistedLang === detectedFromMsg) {
      return { locale: detectedFromMsg, reason: `message_detected:${detectedFromMsg}` };
    }
    // Clear language change mid-conversation (e.g. persisted EN, user writes full TR)
    if (wordCount(params.currentMessage) >= 3) {
      return {
        locale: detectedFromMsg,
        reason: `message_overrides_persisted:${persistedLang}->${detectedFromMsg}`,
      };
    }
  }

  // 3. Persisted conversation locale from existing session
  if (persistedLang) {
    return { locale: persistedLang, reason: `persisted:${persistedLang}` };
  }

  // 4. Soft requestLanguage hint (widget UI / browser preference) — only when
  //    the message itself does not clearly establish a different language.
  if (requestLang) {
    return { locale: requestLang, reason: `request_language:${requestLang}` };
  }

  // 5. Recent user history detection
  if (params.history && Array.isArray(params.history) && params.history.length > 0) {
    for (let i = params.history.length - 1; i >= 0; i--) {
      const item = params.history[i];
      if (item && item.role === "user" && item.content) {
        const detectedFromHist = detectTextLanguage(item.content);
        if (detectedFromHist) {
          return { locale: detectedFromHist, reason: `history_detected:${detectedFromHist}` };
        }
      }
    }
  }

  // 6. Clinic default
  if (clinicLang) {
    return { locale: clinicLang, reason: `clinic_default:${clinicLang}` };
  }

  return { locale: "tr", reason: "fallback:tr" };
}

/**
 * Resolves the conversation locale according to the guarded priority above.
 */
export function resolveConversationLocale(params: LocaleResolutionParams): string {
  return resolveConversationLocaleWithMeta(params).locale;
}

/**
 * Lightweight heuristic text language detector for appointment and medical queries.
 */
export function detectTextLanguage(text: string): string | null {
  if (!text || typeof text !== "string") return null;
  const t = text.trim().toLowerCase();
  if (t.length < 2) return null;

  // English indicators
  const enPatterns = [
    /\b(i want|i would like|i need|can i|appointment|book|schedule|consultation|implant|doctor|dentist|teeth|tooth|filling|whitening|crown|checkup|tomorrow|today|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|evening|pm|am|please|thank you|thanks|hello|hi|good morning|yes|no|my name is|my phone is|my email is)\b/i,
    /\b(cost|price|how much|location|where are you|contact)\b/i
  ];

  // Turkish indicators
  const trPatterns = [
    /\b(merhaba|selam|randevu|almak istiyorum|muayene|doktor|diş|dolgu|beyazlatma|kaplama|implant|zirkonyum|kanal|tedavi|yarın|bugün|pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar|sabah|öğleden sonra|akşam|saat|lütfen|teşekkürler|teşekkür ederim|adım|telefonum|eposta|evet|hayır|fiyat|ne kadar|ücret|neredesiniz)\b/i,
    /[çğıöşü]/i
  ];

  // German indicators
  const dePatterns = [
    /\b(ich möchte|termin|vereinbaren|untersuchung|zahnarzt|zahn|füllung|bleaching|krone|morgen|heute|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|vormittag|nachmittag|bitte|danke|hallo|guten tag|ja|nein|mein name ist|meine telefonnummer|kosten|wie viel)\b/i,
    /[äöüß]/i
  ];

  // Arabic indicators
  const arPattern = /[\u0600-\u06FF]/;
  if (arPattern.test(t)) return "ar";

  let enScore = 0;
  let trScore = 0;
  let deScore = 0;

  for (const p of enPatterns) {
    const matches = t.match(new RegExp(p, "gi"));
    if (matches) enScore += matches.length;
  }
  for (const p of trPatterns) {
    const matches = t.match(new RegExp(p, "gi"));
    if (matches) trScore += matches.length;
  }
  for (const p of dePatterns) {
    const matches = t.match(new RegExp(p, "gi"));
    if (matches) deScore += matches.length;
  }

  if (trScore > enScore && trScore > deScore && trScore >= 1) return "tr";
  if (enScore > trScore && enScore > deScore && enScore >= 1) return "en";
  if (deScore > enScore && deScore > trScore && deScore >= 1) return "de";

  return null;
}

const TR_MONTHS: Record<number, string> = {
  0: "Ocak", 1: "Şubat", 2: "Mart", 3: "Nisan", 4: "Mayıs", 5: "Haziran",
  6: "Temmuz", 7: "Ağustos", 8: "Eylül", 9: "Ekim", 10: "Kasım", 11: "Aralık"
};

const EN_MONTHS: Record<number, string> = {
  0: "January", 1: "February", 2: "March", 3: "April", 4: "May", 5: "June",
  6: "July", 7: "August", 8: "September", 9: "October", 10: "November", 11: "December"
};

const DE_MONTHS: Record<number, string> = {
  0: "Januar", 1: "Februar", 2: "März", 3: "April", 4: "Mai", 5: "Juni",
  6: "Juli", 7: "August", 8: "September", 9: "Oktober", 10: "November", 11: "Dezember"
};

const TR_WEEKDAYS: Record<number, string> = {
  0: "Pazar", 1: "Pazartesi", 2: "Salı", 3: "Çarşamba", 4: "Perşembe", 5: "Cuma", 6: "Cumartesi"
};

const EN_WEEKDAYS: Record<number, string> = {
  0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday"
};

const DE_WEEKDAYS: Record<number, string> = {
  0: "Sonntag", 1: "Montag", 2: "Dienstag", 3: "Mittwoch", 4: "Donnerstag", 5: "Freitag", 6: "Samstag"
};

/**
 * Formats an ISO date (YYYY-MM-DD) or date text into a strictly localized date string.
 * Example for 2026-08-05:
 *   - EN: "Wednesday, August 5, 2026"
 *   - TR: "5 Ağustos 2026 Çarşamba"
 *   - DE: "Mittwoch, 5. August 2026"
 */
export function formatLocalizedDate(
  dateInput?: string | null,
  locale: string = "tr",
  timeZone: string = "Europe/Istanbul"
): string {
  if (!dateInput || dateInput.trim() === "" || dateInput.trim() === "-") {
    return "-";
  }

  const raw = dateInput.trim();
  const isEn = locale.toLowerCase().startsWith("en");
  const isDe = locale.toLowerCase().startsWith("de");
  const isFr = locale.toLowerCase().startsWith("fr");

  // Check for ISO format YYYY-MM-DD
  const isoMatch = raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);

    // Calculate weekday using noon UTC to avoid DST day-shifts
    const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
    const dayIdx = d.getUTCDay();

    if (isEn) {
      return `${EN_WEEKDAYS[dayIdx]}, ${EN_MONTHS[month]} ${day}, ${year}`;
    }
    if (isDe) {
      return `${DE_WEEKDAYS[dayIdx]}, ${day}. ${DE_MONTHS[month]} ${year}`;
    }
    if (isFr) {
      return `${day} ${EN_MONTHS[month]} ${year}`;
    }
    // Default Turkish
    return `${day} ${TR_MONTHS[month]} ${year} ${TR_WEEKDAYS[dayIdx]}`;
  }

  // If already formatted with mixed Turkish weekday (e.g. "2026-08-05 Çarşamba" or "5 Ağustos 2026 Çarşamba")
  // and locale is English, translate it cleanly
  if (isEn) {
    const trMatch = raw.match(/(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+(\d{4})/);
    if (trMatch) {
      const day = parseInt(trMatch[1], 10);
      const mName = trMatch[2].toLowerCase();
      const year = parseInt(trMatch[3], 10);

      const trMonthMap: Record<string, number> = {
        "ocak": 0, "şubat": 1, "subat": 1, "mart": 2, "nisan": 3, "mayıs": 4, "mayis": 4,
        "haziran": 5, "temmuz": 6, "ağustos": 7, "agustos": 7, "eylül": 8, "eylul": 8,
        "ekim": 9, "kasım": 10, "kasim": 10, "aralık": 11, "aralik": 11
      };
      if (trMonthMap[mName] !== undefined) {
        const mIdx = trMonthMap[mName];
        const d = new Date(Date.UTC(year, mIdx, day, 12, 0, 0));
        const dayIdx = d.getUTCDay();
        return `${EN_WEEKDAYS[dayIdx]}, ${EN_MONTHS[mIdx]} ${day}, ${year}`;
      }
    }
  }

  return raw;
}

/**
 * Formats time into standard localized representation (12-hour AM/PM for EN, 24-hour for TR/others).
 */
export function formatLocalizedTime(
  timeInput?: string | null,
  locale: string = "tr"
): string {
  const isEn = locale.toLowerCase().startsWith("en");
  const isDe = locale.toLowerCase().startsWith("de");

  if (!timeInput || timeInput.trim() === "" || timeInput.toLowerCase() === "belirtilmedi" || timeInput.toLowerCase() === "not specified") {
    return isEn ? "Not specified" : isDe ? "Nicht angegeben" : "Belirtilmedi";
  }

  const raw = timeInput.trim();
  const lower = raw.toLowerCase();

  // Period translations
  if (lower === "sabah" || lower === "morning") {
    return isEn ? "Morning" : isDe ? "Vormittag" : "Sabah";
  }
  if (lower === "öğleden sonra" || lower === "ogleden sonra" || lower === "afternoon") {
    return isEn ? "Afternoon" : isDe ? "Nachmittag" : "Öğleden Sonra";
  }
  if (lower === "akşam" || lower === "aksam" || lower === "evening") {
    return isEn ? "Evening" : isDe ? "Abend" : "Akşam";
  }

  // Time range e.g. 10:00-12:00
  const rangeMatch = raw.match(/^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/);
  if (rangeMatch) {
    const h1 = parseInt(rangeMatch[1], 10);
    const m1 = rangeMatch[2];
    const h2 = parseInt(rangeMatch[3], 10);
    const m2 = rangeMatch[4];

    if (isEn) {
      const formatHour = (h: number, m: string) => {
        const ampm = h >= 12 ? "PM" : "AM";
        const h12 = h % 12 === 0 ? 12 : h % 12;
        return `${h12}:${m} ${ampm}`;
      };
      return `${formatHour(h1, m1)} - ${formatHour(h2, m2)}`;
    }
    return `${h1.toString().padStart(2, "0")}:${m1} - ${h2.toString().padStart(2, "0")}:${m2}`;
  }

  // Single time e.g. 14:00 or 14:00:00 or 2:00 PM
  const singleMatch = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(am|pm))?$/i);
  if (singleMatch) {
    let h = parseInt(singleMatch[1], 10);
    const m = singleMatch[2];
    const ampm = singleMatch[3]?.toLowerCase();

    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;

    if (isEn) {
      const p = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return `${h12}:${m} ${p}`;
    }
    return `${h.toString().padStart(2, "0")}:${m}`;
  }

  return raw;
}

/**
 * Standardized mapping for treatment display names across locales.
 */
export function formatLocalizedTreatment(
  treatmentInput?: string | null,
  locale: string = "tr"
): string {
  const isEn = locale.toLowerCase().startsWith("en");
  const isDe = locale.toLowerCase().startsWith("de");
  const isFr = locale.toLowerCase().startsWith("fr");
  const isAr = locale.toLowerCase().startsWith("ar");

  if (!treatmentInput || treatmentInput.trim() === "" || treatmentInput.trim() === "-") {
    if (isEn) return "General Consultation";
    if (isDe) return "Allgemeine Untersuchung";
    if (isFr) return "Consultation Générale";
    if (isAr) return "استشارة عامة";
    return "Genel Muayene";
  }

  const raw = treatmentInput.trim();
  const lower = raw.toLowerCase().replace(/_/g, " ");

  if (
    lower.includes("implant") ||
    lower.includes("vidalı") ||
    lower.includes("all on")
  ) {
    if (lower.includes("danışman") || lower.includes("consultation") || lower.includes("muayene")) {
      if (isEn) return "Implant consultation";
      if (isDe) return "Implantatberatung";
      return "İmplant Muayenesi";
    }
    if (isEn) return "Dental Implant";
    if (isDe) return "Zahnimplantat";
    return "Diş İmplantı";
  }

  if (
    lower.includes("muayene") ||
    lower.includes("consultation") ||
    lower.includes("kontrol") ||
    lower.includes("checkup") ||
    lower.includes("general")
  ) {
    if (isEn) return "General Consultation";
    if (isDe) return "Allgemeine Untersuchung";
    if (isFr) return "Consultation Générale";
    if (isAr) return "استشارة عامة";
    return "Genel Muayene";
  }

  if (lower.includes("dolgu") || lower.includes("filling") || lower.includes("kompozit") || lower.includes("composite")) {
    if (isEn) return "Composite Filling";
    if (isDe) return "Kompositfüllung";
    return "Kompozit Dolgu";
  }

  if (lower.includes("beyazlatma") || lower.includes("whitening") || lower.includes("bleaching")) {
    if (isEn) return "Teeth Whitening";
    if (isDe) return "Zahnaufhellung";
    return "Diş Beyazlatma";
  }

  if (lower.includes("kanal") || lower.includes("root canal") || lower.includes("endodonti")) {
    if (isEn) return "Root Canal";
    if (isDe) return "Wurzelkanalbehandlung";
    return "Kanal Tedavisi";
  }

  if (lower.includes("zirkonyum") || lower.includes("zirconium") || lower.includes("zirconia")) {
    if (isEn) return "Zirconium Crown";
    if (isDe) return "Zirkonkrone";
    return "Zirkonyum Kaplama";
  }

  if (lower.includes("lamine") || lower.includes("veneer") || lower.includes("yaprak porselen")) {
    if (isEn) return "Veneer";
    if (isDe) return "Veneers";
    return "Lamine Kaplama";
  }

  if (lower.includes("gülüş") || lower.includes("smile design") || lower.includes("hollywood")) {
    if (isEn) return "Smile Design";
    if (isDe) return "Lächeln-Design";
    return "Gülüş Tasarımı";
  }

  if (lower.includes("ortodonti") || lower.includes("orthodontic") || lower.includes("plak") || lower.includes("aligner") || lower.includes("invisalign")) {
    if (isEn) return "Orthodontics / Aligners";
    if (isDe) return "Kieferorthopädie / Aligner";
    return "Ortodonti / Şeffaf Plak";
  }

  if (lower.includes("çekim") || lower.includes("extraction") || lower.includes("20lik") || lower.includes("wisdom")) {
    if (isEn) return "Tooth Extraction";
    if (isDe) return "Zahnextraktion";
    return "Diş Çekimi";
  }

  // Clean raw string if snake_case
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Builds the canonical patient-facing appointment review / summary message strictly in the given locale.
 * Zero mixed languages.
 */
export function buildAppointmentReviewMessage(
  paramsOrData:
    | {
        locale?: string;
        appointmentData: AppointmentSummaryInput;
        clinicName?: string;
        timeZone?: string;
      }
    | AppointmentSummaryInput,
  maybeLocale?: string,
  maybeClinicName?: string
): string {
  let locale = "tr";
  let draft: AppointmentSummaryInput;
  let clinicName: string | undefined;
  let timeZone = "Europe/Istanbul";

  if ("appointmentData" in paramsOrData && (paramsOrData as any).appointmentData) {
    draft = (paramsOrData as any).appointmentData;
    locale = ((paramsOrData as any).locale || "tr").toLowerCase().trim();
    clinicName = (paramsOrData as any).clinicName;
    timeZone = (paramsOrData as any).timeZone || "Europe/Istanbul";
  } else {
    draft = paramsOrData as AppointmentSummaryInput;
    locale = (maybeLocale || "tr").toLowerCase().trim();
    clinicName = maybeClinicName;
  }

  const isEn = locale.startsWith("en");
  const isDe = locale.startsWith("de");
  const isFr = locale.startsWith("fr");
  const isAr = locale.startsWith("ar");

  const name = draft.patientName || "-";

  let phone = draft.patientPhone || "-";
  if (phone !== "-") {
    const phoneCheck = normalizeTurkishPhone(phone);
    if (phoneCheck.valid) phone = phoneCheck.display;
  }

  const email = draft.patientEmail || "-";
  const treatment = formatLocalizedTreatment(draft.requestedService, locale);
  
  const rawDate = draft.preferredDateDisplay || draft.requestedDate || "-";
  const localizedDate = formatLocalizedDate(rawDate, locale, timeZone);

  const rawTime = draft.preferredTimeDisplay || draft.requestedTime || "-";
  const localizedTime = formatLocalizedTime(rawTime, locale);

  if (isEn) {
    return (
      `Preliminary appointment request summary:\n\n` +
      `Full name: ${name}\n` +
      `Phone: ${phone}\n` +
      `Email: ${email}\n` +
      `Treatment: ${treatment}\n` +
      `Preferred date: ${localizedDate}\n` +
      `Preferred time: ${localizedTime}\n\n` +
      `Would you like me to submit this preliminary appointment request to the clinic for review?`
    );
  }

  if (isDe) {
    return (
      `Zusammenfassung Ihrer vorläufigen Terminanfrage:\n\n` +
      `Vollständiger Name: ${name}\n` +
      `Telefon: ${phone}\n` +
      `E-Mail: ${email}\n` +
      `Behandlung: ${treatment}\n` +
      `Bevorzugtes Datum: ${localizedDate}\n` +
      `Bevorzugte Uhrzeit: ${localizedTime}\n\n` +
      `Möchten Sie, dass ich diese vorläufige Terminanfrage zur Überprüfung an die Klinik weiterleite?`
    );
  }

  if (isFr) {
    return (
      `Récapitulatif de votre demande de rendez-vous préliminaire:\n\n` +
      `Nom complet: ${name}\n` +
      `Téléphone: ${phone}\n` +
      `E-mail: ${email}\n` +
      `Traitement: ${treatment}\n` +
      `Date souhaitée: ${localizedDate}\n` +
      `Heure souhaitée: ${localizedTime}\n\n` +
      `Souhaitez-vous que je transmette cette demande de rendez-vous préliminaire à la clinique pour examen ?`
    );
  }

  if (isAr) {
    return (
      `ملخص طلب الموعد المبدئي:\n\n` +
      `الاسم الكامل: ${name}\n` +
      `الهاتف: ${phone}\n` +
      `البريد الإلكتروني: ${email}\n` +
      `العلاج: ${treatment}\n` +
      `التاريخ المفضل: ${localizedDate}\n` +
      `الوقت المفضل: ${localizedTime}\n\n` +
      `هل تود أن أقوم بإرسال طلب الموعد المبدئي هذا إلى العيادة لمراجعته؟`
    );
  }

  // Default Turkish
  return (
    `Ön randevu talebinizin özeti:\n\n` +
    `Ad Soyad: ${name}\n` +
    `Telefon: ${phone}\n` +
    `E-posta: ${email}\n` +
    `Hizmet: ${treatment}\n` +
    `Tercih Edilen Tarih: ${localizedDate}\n` +
    `Tercih Edilen Saat: ${localizedTime}\n\n` +
    `Bu bilgilerle ön randevu talebinizi kliniğin değerlendirmesine iletmemi onaylıyor musunuz?`
  );
}

/**
 * Backward-compatible alias that calls buildAppointmentReviewMessage.
 */
export function formatMultilingualSummary(draft: AppointmentSummaryInput, locale: string = "tr"): string {
  return buildAppointmentReviewMessage({
    locale,
    appointmentData: draft
  });
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
  const treatment = String(treatmentName || "").trim();

  if (isEn) {
    const subject = treatment ? `for ${treatment}` : "for this treatment";
    return (
      `I don’t have a verified list price ${subject} on hand — the final amount is confirmed after the clinic’s evaluation. ` +
      `Share the details we still need and we’ll get back to you quickly with clear pricing so you can decide with confidence.`
    );
  }
  if (isDe) {
    return (
      "Einen verifizierten Listenpreis habe ich gerade nicht vorliegen — der endgültige Preis wird nach der Untersuchung durch die Klinik festgelegt. " +
      "Wenn Sie die noch fehlenden Angaben teilen, melden wir uns zügig mit einer klaren Preiseinschätzung bei Ihnen."
    );
  }
  if (isFr) {
    return (
      "Je n’ai pas de tarif listé vérifié pour le moment — le montant final est confirmé après l’évaluation de la clinique. " +
      "Partagez les informations encore nécessaires et nous vous répondrons rapidement avec une estimation claire."
    );
  }
  if (isAr) {
    return (
      "لا يتوفر لدي حالياً سعر قائمة موثوق — يتم تحديد المبلغ النهائي بعد تقييم العيادة. " +
      "شاركنا التفاصيل الناقصة وسنعود إليك بسرعة بتوضيح واضح للأسعار."
    );
  }

  const subject = treatment ? `${treatment} için` : "Bu tedavi için";
  return (
    `${subject} şu anda doğrulanmış bir liste fiyatı paylaşamıyorum; net tutar klinik değerlendirmesi sonrası kişiye özel belirleniyor. ` +
    `Gerekli bilgilerinizi tamamlarsanız, fiyat konusunda size hızlı ve memnuniyet odaklı bir dönüş sağlarız.`
  );
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
