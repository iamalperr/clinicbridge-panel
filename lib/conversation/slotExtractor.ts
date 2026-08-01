/**
 * Deterministic, locale-aware entity and slot extractor.
 * High-performance extractor for dates, times, visit types, names, contact info, and corrections.
 */

import { ConversationSlots, VisitType } from "./types";
import { AppointmentDateValidator } from "../skills/AppointmentDateValidator";

const MONTHS_TR: Record<string, number> = {
  ocak: 1, şubat: 2, subat: 2, mart: 3, nisan: 4, mayıs: 5, mayis: 5, haziran: 6,
  temmuz: 7, ağustos: 8, agustos: 8, eylül: 9, eylul: 9, ekim: 10, kasım: 11, kasim: 11, aralık: 12, aralik: 12
};

const MONTHS_EN: Record<string, number> = {
  january: 1, feb: 2, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, aug: 8, august: 8, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
};

const COMMON_TREATMENTS = [
  "implant", "zirkonyum", "zirconium", "diş beyazlatma", "teeth whitening", "whitening",
  "gülüş tasarımı", "smile design", "hollywood smile", "ortodonti", "orthodontics", "şeffaf plak", "invisalign",
  "kanal tedavisi", "root canal", "endodonti", "diş çekimi", "tooth extraction", "20lik diş",
  "dolgu", "filling", "kompozit", "lamine", "laminate veneer", "veneer", "kaplama", "crown",
  "protez", "denture", "periodontoloji", "diş eti", "pedodonti", "çocuk diş", "estetik diş",
  "saç ekimi", "hair transplant", "burun estetiği", "rhinoplasty", "göz kapağı", "blepharoplasty"
];

export class SlotExtractor {
  /**
   * Extract all identifiable slots from a message, optionally in context of previous slots and expectedSlot
   */
  public static extractSlots(
    message: string,
    existingSlots: Partial<ConversationSlots> = {},
    locale: string = "tr",
    timeZone: string = "Europe/Istanbul",
    expectedSlot?: string
  ): {
    extracted: Partial<ConversationSlots>;
    isCorrection: boolean;
    correctedSlotKey?: keyof ConversationSlots;
    invalidEmailAttempt?: boolean;
    allInfoProvidedIntent?: boolean;
  } {
    const raw = (message || "").trim();
    if (!raw) return { extracted: {}, isCorrection: false };

    const lower = raw.toLowerCase();
    const extracted: Partial<ConversationSlots> = {};
    let isCorrection = false;
    let correctedSlotKey: keyof ConversationSlots | undefined;
    let invalidEmailAttempt = false;

    // 0. "Provided all information now" / "Tüm bilgileri verdim" Check
    if (this.isAllInfoProvided(lower)) {
      return {
        extracted: {},
        isCorrection: false,
        allInfoProvidedIntent: true
      };
    }

    // 1. Correction Detection (e.g. "1 Ağustos değil 3 Ağustos olsun", "Use sadia.new@hotmail.com instead")
    const correctionCheck = this.parseCorrection(raw, lower, locale, timeZone);
    if (correctionCheck.isCorrection) {
      isCorrection = true;
      correctedSlotKey = correctionCheck.slotKey;
      Object.assign(extracted, correctionCheck.slots);
    }

    // 2. Email Extraction & Validation
    const emailRes = this.parseEmail(raw);
    if (emailRes) {
      extracted.email = emailRes;
    } else if (
      expectedSlot === "email" ||
      (raw.includes("@") && !raw.includes(" ")) ||
      /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\b/.test(raw)
    ) {
      // User sent an incomplete or malformed email (e.g. sadiahammad1@hotmail without .com or invalid domain)
      invalidEmailAttempt = true;
    }

    // 3. Date Extraction (if not already extracted by correction)
    if (!extracted.preferredDate) {
      const dateRes = this.parseDate(raw, lower, timeZone);
      if (dateRes) {
        extracted.preferredDate = dateRes.isoDate;
        extracted.rawDateText = dateRes.rawText;
        extracted.preferredWeekday = dateRes.weekday;
      }
    }

    // 4. Time / Time-Preference Extraction
    if (!extracted.preferredTime) {
      const timeRes = this.parseTime(raw, lower);
      if (timeRes) {
        extracted.preferredTime = timeRes.value;
        extracted.rawTimeText = timeRes.rawText;
      }
    }

    // 5. Visit Type Extraction (ilk gelişimiz, kontrol vb.)
    if (!extracted.visitType) {
      const visitRes = this.parseVisitType(lower);
      if (visitRes) {
        extracted.visitType = visitRes;
      }
    }

    // 6. Treatment Extraction
    if (!extracted.treatment) {
      const treatmentRes = this.parseTreatment(lower);
      if (treatmentRes) {
        extracted.treatment = treatmentRes;
      }
    }

    // 7. Phone Extraction
    const phoneRes = this.parsePhone(raw);
    if (phoneRes) {
      extracted.phone = phoneRes;
    }

    // 8. Name Extraction (when explicitly phrased, matching name pattern, or expectedSlot is fullName/name)
    if (!extracted.fullName && !extracted.firstName) {
      const nameRes = this.parseName(raw, lower, existingSlots, expectedSlot);
      if (nameRes) {
        extracted.fullName = nameRes.fullName;
        extracted.firstName = nameRes.firstName;
        extracted.lastName = nameRes.lastName;
      }
    }

    // 9. KVKK Consent
    if (this.isKvkkConsent(lower)) {
      extracted.kvkkConsent = true;
    }

    return {
      extracted,
      isCorrection,
      correctedSlotKey,
      invalidEmailAttempt,
      allInfoProvidedIntent: false
    };
  }

  /**
   * Check if patient says they already provided all details
   */
  public static isAllInfoProvided(lower: string): boolean {
    return /\b(provided all information now|provided all info|gave all info|all information provided|given all details|all details provided|sent all details|tüm bilgileri verdim|tum bilgileri verdim|hepsini verdim|tümünü paylaştım|bilgileri paylaştım|bilgilerimi verdim)\b/i.test(
      lower
    );
  }

  /**
   * Parse slot corrections like "X değil Y olsun", "Use sadia.new@hotmail.com instead"
   */
  public static parseCorrection(
    raw: string,
    lower: string,
    locale: string,
    timeZone: string
  ): { isCorrection: boolean; slotKey?: keyof ConversationSlots; slots: Partial<ConversationSlots> } {
    // 1. Email correction pattern: "Use sadia.new@hotmail.com instead", "e-posta sadia.new@hotmail.com olsun"
    const emailDirectMatch = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (
      emailDirectMatch &&
      /\b(use|instead|actually|aslında|yerine|değil|degil|olsun|lütfen|please)\b/i.test(lower)
    ) {
      return {
        isCorrection: true,
        slotKey: "email",
        slots: { email: emailDirectMatch[0].toLowerCase() }
      };
    }

    // 2. Turkish correction pattern: "... değil ... olsun" / "... yerine ..."
    const trDeğilMatch = raw.match(/(?:aslında\s+)?(.+?)\s+değil(?:dir)?(?:,\s*|\s+)(.+?)(?:\s+olsun|\s+lütfen|\.?$)/i);
    const trYerineMatch = raw.match(/(.+?)\s+yerine\s+(.+?)(?:\s+olsun|\s+lütfen|\.?$)/i);
    const enInsteadMatch = raw.match(/(?:actually\s+)?(?:use\s+)?(.+?)\s+instead(?:\s+of\s+(.+?))?(?:\s+please|\.?$)/i);
    const enNotMatch = raw.match(/(?:actually\s+)?not\s+(.+?)(?:,\s*|\s+)but\s+(.+?)(?:\s+please|\.?$)/i);

    const targetChunk = trDeğilMatch?.[2] || trYerineMatch?.[2] || enInsteadMatch?.[1] || enNotMatch?.[2];

    if (targetChunk) {
      const trimmedTarget = targetChunk.trim();
      const targetLower = trimmedTarget.toLowerCase();

      // Check if target is a date
      const dateRes = this.parseDate(trimmedTarget, targetLower, timeZone);
      if (dateRes) {
        return {
          isCorrection: true,
          slotKey: "preferredDate",
          slots: {
            preferredDate: dateRes.isoDate,
            rawDateText: dateRes.rawText,
            preferredWeekday: dateRes.weekday
          }
        };
      }

      // Check if target is a time
      const timeRes = this.parseTime(trimmedTarget, targetLower);
      if (timeRes) {
        return {
          isCorrection: true,
          slotKey: "preferredTime",
          slots: {
            preferredTime: timeRes.value,
            rawTimeText: timeRes.rawText
          }
        };
      }

      // Check if target is an email
      const emailTarget = this.parseEmail(trimmedTarget);
      if (emailTarget) {
        return {
          isCorrection: true,
          slotKey: "email",
          slots: { email: emailTarget }
        };
      }
    }

    return { isCorrection: false, slots: {} };
  }

  /**
   * Parse date text into ISO YYYY-MM-DD
   */
  public static parseDate(
    raw: string,
    lower: string,
    timeZone: string = "Europe/Istanbul"
  ): { isoDate: string; rawText: string; weekday?: string } | null {
    const now = new Date();
    const currentYear = now.getFullYear();

    // Relative dates: "yarın" / "tomorrow"
    if (/\b(yarın|yarin|tomorrow)\b/i.test(lower)) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const iso = tomorrow.toISOString().split("T")[0];
      const weekdayInfo = AppointmentDateValidator.getCanonicalWeekday({ isoDate: iso, timeZone });
      return { isoDate: iso, rawText: raw, weekday: weekdayInfo.weekdayTr };
    }

    // Relative dates: "bugün" / "today"
    if (/\b(bugün|bugun|today)\b/i.test(lower)) {
      const iso = now.toISOString().split("T")[0];
      const weekdayInfo = AppointmentDateValidator.getCanonicalWeekday({ isoDate: iso, timeZone });
      return { isoDate: iso, rawText: raw, weekday: weekdayInfo.weekdayTr };
    }

    // 1. Regex for D/M/YYYY or DD.MM.YYYY or DD-MM-YYYY (e.g. 1/8/2026, 01.08.2026, 1-8-2026)
    const dmyFullMatch = raw.match(/\b(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{4})\b/);
    if (dmyFullMatch) {
      const day = parseInt(dmyFullMatch[1], 10);
      const month = parseInt(dmyFullMatch[2], 10);
      const year = parseInt(dmyFullMatch[3], 10);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const weekdayInfo = AppointmentDateValidator.getCanonicalWeekday({ isoDate: iso, timeZone });
        return { isoDate: iso, rawText: dmyFullMatch[0], weekday: weekdayInfo.weekdayTr };
      }
    }

    // 2. Regex for D/M (e.g. 1/8, 01.08) without year -> infer current or next year
    const dmyShortMatch = raw.match(/\b(\d{1,2})[\.\/\-](\d{1,2})\b/);
    if (dmyShortMatch) {
      const day = parseInt(dmyShortMatch[1], 10);
      const month = parseInt(dmyShortMatch[2], 10);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const year = currentYear;
        const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const weekdayInfo = AppointmentDateValidator.getCanonicalWeekday({ isoDate: iso, timeZone });
        return { isoDate: iso, rawText: dmyShortMatch[0], weekday: weekdayInfo.weekdayTr };
      }
    }

    // 3. Turkish text dates: "1 Ağustos", "1 Ağustos 2026", "Ağustos 1"
    for (const [mName, mNum] of Object.entries(MONTHS_TR)) {
      const regex1 = new RegExp(`\\b(\\d{1,2})\\s+${mName}(?:\\s+(\\d{4}))?\\b`, "i");
      const match1 = lower.match(regex1);
      if (match1) {
        const day = parseInt(match1[1], 10);
        const year = match1[2] ? parseInt(match1[2], 10) : currentYear;
        const iso = `${year}-${String(mNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const weekdayInfo = AppointmentDateValidator.getCanonicalWeekday({ isoDate: iso, timeZone });
        return { isoDate: iso, rawText: match1[0], weekday: weekdayInfo.weekdayTr };
      }

      const regex2 = new RegExp(`\\b${mName}\\s+(\\d{1,2})(?:\\s+(\\d{4}))?\\b`, "i");
      const match2 = lower.match(regex2);
      if (match2) {
        const day = parseInt(match2[1], 10);
        const year = match2[2] ? parseInt(match2[2], 10) : currentYear;
        const iso = `${year}-${String(mNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const weekdayInfo = AppointmentDateValidator.getCanonicalWeekday({ isoDate: iso, timeZone });
        return { isoDate: iso, rawText: match2[0], weekday: weekdayInfo.weekdayTr };
      }
    }

    // 4. English text dates: "August 3rd", "August 3", "3rd August 2026"
    for (const [mName, mNum] of Object.entries(MONTHS_EN)) {
      const regex1 = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${mName}(?:\\s+(\\d{4}))?\\b`, "i");
      const match1 = lower.match(regex1);
      if (match1) {
        const day = parseInt(match1[1], 10);
        const year = match1[2] ? parseInt(match1[2], 10) : currentYear;
        const iso = `${year}-${String(mNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const weekdayInfo = AppointmentDateValidator.getCanonicalWeekday({ isoDate: iso, timeZone });
        return { isoDate: iso, rawText: match1[0], weekday: weekdayInfo.weekdayEn };
      }

      const regex2 = new RegExp(`\\b${mName}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?\\b`, "i");
      const match2 = lower.match(regex2);
      if (match2) {
        const day = parseInt(match2[1], 10);
        const year = match2[2] ? parseInt(match2[2], 10) : currentYear;
        const iso = `${year}-${String(mNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const weekdayInfo = AppointmentDateValidator.getCanonicalWeekday({ isoDate: iso, timeZone });
        return { isoDate: iso, rawText: match2[0], weekday: weekdayInfo.weekdayEn };
      }
    }

    return null;
  }

  /**
   * Parse clock time or general time preference (sabah, öğleden sonra, 14:00)
   */
  public static parseTime(
    raw: string,
    lower: string
  ): { value: string; rawText: string } | null {
    // 1. Clock time e.g. "14:00", "14.30", "saat 14", "saat 2"
    const clockMatch = raw.match(/\b(?:saat\s*)?(\d{1,2})[:\.](\d{2})\b/i);
    if (clockMatch) {
      const h = parseInt(clockMatch[1], 10);
      const m = parseInt(clockMatch[2], 10);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        const val = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        return { value: val, rawText: clockMatch[0] };
      }
    }

    const saatSingleMatch = raw.match(/\bsaat\s*(\d{1,2})\b/i);
    if (saatSingleMatch) {
      let h = parseInt(saatSingleMatch[1], 10);
      if (h >= 1 && h <= 23) {
        // if user says "saat 2" or "saat 3", in daytime context treat as 14:00 or 15:00 if h <= 7
        if (h <= 7) h += 12;
        const val = `${String(h).padStart(2, "0")}:00`;
        return { value: val, rawText: saatSingleMatch[0] };
      }
    }

    // 2. Turkish general time preference
    if (/(?:^|[^\wığüşöçİĞÜŞÖÇ])(sabah|sabahları|sabahleyin|öğleden önce|ogleden once)(?:$|[^\wığüşöçİĞÜŞÖÇ])/iu.test(lower)) {
      return { value: "sabah", rawText: "sabah" };
    }
    if (/(?:^|[^\wığüşöçİĞÜŞÖÇ])(öğlen|oglen|öğle|ogle)(?:$|[^\wığüşöçİĞÜŞÖÇ])/iu.test(lower)) {
      return { value: "öğle", rawText: "öğle" };
    }
    if (/(?:^|[^\wığüşöçİĞÜŞÖÇ])(öğleden sonra|ogleden sonra|ikindi|öğleden-sonra)(?:$|[^\wığüşöçİĞÜŞÖÇ])/iu.test(lower)) {
      return { value: "öğleden_sonra", rawText: "öğleden sonra" };
    }
    if (/(?:^|[^\wığüşöçİĞÜŞÖÇ])(akşam|aksam|akşamüstü|aksamustu|akşamleyin)(?:$|[^\wığüşöçİĞÜŞÖÇ])/iu.test(lower)) {
      return { value: "akşam", rawText: "akşam" };
    }

    // 3. English general time preference
    if (/\b(morning|in the morning|am)\b/i.test(lower)) {
      return { value: "morning", rawText: "morning" };
    }
    if (/\b(afternoon|in the afternoon|pm)\b/i.test(lower)) {
      return { value: "afternoon", rawText: "afternoon" };
    }
    if (/\b(evening|in the evening)\b/i.test(lower)) {
      return { value: "evening", rawText: "evening" };
    }

    return null;
  }

  /**
   * Parse Visit Type (first visit, control)
   */
  public static parseVisitType(lower: string): VisitType | null {
    if (
      /\b(ilk geliş|ilk gelis|ilk gelişimiz|ilk gelisimiz|ilk defa|ilk kez|ilk muayene|yeni hasta|first visit|first time|new patient)\b/i.test(
        lower
      )
    ) {
      return "first_visit";
    }

    if (
      /\b(kontrol|kontrole|kontrol randevusu|takip|muayene kontrolü|follow[- ]?up|check[- ]?up|control visit)\b/i.test(
        lower
      )
    ) {
      return "control";
    }

    return null;
  }

  /**
   * Parse recognized treatment name
   */
  public static parseTreatment(lower: string): string | null {
    for (const t of COMMON_TREATMENTS) {
      if (lower.includes(t)) {
        return t;
      }
    }
    return null;
  }

  /**
   * Parse email address with sanitization
   */
  public static parseEmail(raw: string): string | null {
    if (!raw) return null;
    const sanitized = raw.replace(/^[\s,.;:<>]+|[\s,.;:<>]+$/g, "").trim();
    const emailMatch = sanitized.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return emailMatch ? emailMatch[0].toLowerCase() : null;
  }

  /**
   * Parse and normalize phone number (Turkish and international)
   */
  public static parsePhone(raw: string): string | null {
    if (!raw) return null;
    // 1. Match international format with country code (e.g. +44 7911 123456, +49 151 23456789, +90 532 123 45 67)
    const intlMatch = raw.match(/\+\d{1,4}(?:[\s.-]?\(?\d{1,4}\)?)*(?:[\s.-]?\d{1,4}){2,5}/);
    if (intlMatch) {
      const digits = intlMatch[0].replace(/\D/g, "");
      if (digits.length >= 9 && digits.length <= 16) {
        return intlMatch[0].trim();
      }
    }

    // 2. Match standard local phone format with optional leading zero or parentheses
    const localMatch = raw.match(/(?:\+?\d{1,3}[\s-]?)?\(?0?\d{2,4}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/) ||
      raw.match(/\b(?:\+\d{1,3}[\s-]?)?\d{9,14}\b/);

    if (localMatch) {
      const clean = localMatch[0].replace(/[\s\(\)\-]/g, "");
      const digits = clean.replace(/\D/g, "");
      if (digits.length >= 9 && digits.length <= 16) {
        return localMatch[0].trim();
      }
    }

    // 3. Fallback: check if the string itself is a clean phone number
    const allDigits = raw.replace(/\D/g, "");
    if (allDigits.length >= 9 && allDigits.length <= 16 && (raw.startsWith("+") || raw.startsWith("0") || raw.startsWith("5"))) {
      return raw.trim();
    }

    return null;
  }

  /**
   * Parse Name (e.g. "Adım Ahmet Yılmaz", "Ahmet Yılmaz", or when expectedSlot is fullName)
   */
  public static parseName(
    raw: string,
    lower: string,
    existingSlots: Partial<ConversationSlots>,
    expectedSlot?: string
  ): { fullName: string; firstName: string; lastName: string } | null {
    // 1. Phrased patterns: "Adım Ahmet Yılmaz", "İsmim Mehmet", "My name is John Doe", "I am Sadia Hammad"
    const nameMatch = raw.match(/\b(?:adım|ismim|ben|my name is|i am|name is|it is)\s+([A-ZÇĞİÖŞÜa-zçğıöşü]{2,}(?:\s+[A-ZÇĞİÖŞÜa-zçğıöşü]{2,}){0,3})/i);
    if (nameMatch) {
      const full = nameMatch[1].trim();
      const parts = full.split(/\s+/);
      const first = parts.slice(0, -1).join(" ") || parts[0];
      const last = parts.length > 1 ? parts[parts.length - 1] : "";
      return { fullName: full, firstName: first, lastName: last };
    }

    // 2. Expected slot is fullName or name
    if (expectedSlot === "fullName" || expectedSlot === "name") {
      const trimmed = raw.trim();
      const words = trimmed.split(/\s+/);
      if (
        words.length >= 1 &&
        words.length <= 4 &&
        !/\d/.test(trimmed) &&
        !trimmed.includes("@") &&
        !/(randevu|istiyorum|fiyat|nerede|saat|gün|implant|diş|doktor|evet|hayır|yes|no|help|price|cost)/i.test(lower)
      ) {
        const allWordsLetter = words.every(w => /^[A-ZÇĞİÖŞÜa-zçğıöşü\.\-]+$/.test(w));
        if (allWordsLetter) {
          const full = words.join(" ");
          const first = words.slice(0, -1).join(" ") || words[0];
          const last = words.length > 1 ? words[words.length - 1] : "";
          return { fullName: full, firstName: first, lastName: last };
        }
      }
    }

    // 3. If in appointment collection and only a 2-3 word string with no numbers is provided
    const words = raw.trim().split(/\s+/);
    if (
      words.length >= 2 &&
      words.length <= 4 &&
      !/\d/.test(raw) &&
      !raw.includes("@") &&
      !/(randevu|istiyorum|fiyat|nerede|saat|gün|implant|diş|doktor|evet|hayır|yes|no|help|price|cost)/i.test(lower)
    ) {
      const allWordValid = words.every(w => /^[A-ZÇĞİÖŞÜa-zçğıöşü\.]+$/.test(w));
      if (allWordValid) {
        const full = words.join(" ");
        const first = words.slice(0, -1).join(" ");
        const last = words[words.length - 1];
        return { fullName: full, firstName: first, lastName: last };
      }
    }

    return null;
  }

  /**
   * Check KVKK consent approval
   */
  public static isKvkkConsent(lower: string): boolean {
    return (
      /\b(kvkk|aydınlatma metni|onaylıyorum|kabul ediyorum|okudum|onay veriyorum|i accept|i agree)\b/i.test(
        lower
      )
    );
  }
}
