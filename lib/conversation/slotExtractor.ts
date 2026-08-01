/**
 * Deterministic, locale-aware entity and slot extractor.
 * High-performance extractor for dates, times, visit types, names, contact info,
 * canonical treatments, information types, contact targets, and corrections.
 */

import { ConversationSlots, VisitType, InformationType, ContactTarget } from "./types";
import { AppointmentDateValidator } from "../skills/AppointmentDateValidator";
import { normalizeTurkishPhone } from "../phoneUtils";

const MONTHS_TR: Record<string, number> = {
  ocak: 1, şubat: 2, subat: 2, mart: 3, nisan: 4, mayıs: 5, mayis: 5, haziran: 6,
  temmuz: 7, ağustos: 8, agustos: 8, eylül: 9, eylul: 9, ekim: 10, kasım: 11, kasim: 11, aralık: 12, aralik: 12
};

const MONTHS_EN: Record<string, number> = {
  january: 1, feb: 2, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, aug: 8, august: 8, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
};

export interface CanonicalTreatment {
  id: string;
  displayName: {
    tr: string;
    en: string;
  };
  keywords: string[];
}

export const CANONICAL_TREATMENTS: CanonicalTreatment[] = [
  {
    id: "composite_filling",
    displayName: { tr: "Kompozit Dolgu", en: "Composite Filling" },
    keywords: [
      "composite filling", "kompozit dolgu", "composite", "kompozit", "filling", "dolgu",
      "estetik dolgu", "beyaz dolgu", "amalgam dolgu", "tooth filling", "dental filling"
    ]
  },
  {
    id: "implant",
    displayName: { tr: "Diş İmplantı", en: "Dental Implant" },
    keywords: [
      "implant", "dental implant", "diş implantı", "dis implanti", "implant tedavisi", "vidalı diş",
      "vidali dis", "all on 4", "all on 6", "all-on-4", "all-on-6", "straumann", "nobel"
    ]
  },
  {
    id: "zirconium",
    displayName: { tr: "Zirkonyum Kaplama", en: "Zirconium Crown" },
    keywords: [
      "zirkonyum", "zirconium", "zirconia", "zirkon kaplama", "zirconia crown", "zirkon"
    ]
  },
  {
    id: "teeth_whitening",
    displayName: { tr: "Diş Beyazlatma", en: "Teeth Whitening" },
    keywords: [
      "diş beyazlatma", "dis beyazlatma", "teeth whitening", "whitening", "bleaching", "lazerle beyazlatma", "office bleaching"
    ]
  },
  {
    id: "root_canal",
    displayName: { tr: "Kanal Tedavisi", en: "Root Canal" },
    keywords: [
      "kanal tedavisi", "root canal", "endodonti", "endodontics", "kanal"
    ]
  },
  {
    id: "veneer",
    displayName: { tr: "Lamine Kaplama", en: "Veneer" },
    keywords: [
      "lamine", "laminate", "veneer", "veneers", "yaprak porselen", "porcelain veneer", "lamina", "e-max", "emax"
    ]
  },
  {
    id: "smile_design",
    displayName: { tr: "Gülüş Tasarımı", en: "Smile Design" },
    keywords: [
      "gülüş tasarımı", "gulus tasarimi", "smile design", "hollywood smile", "estetik gülüş"
    ]
  },
  {
    id: "orthodontics",
    displayName: { tr: "Ortodonti / Şeffaf Plak", en: "Orthodontics / Aligners" },
    keywords: [
      "ortodonti", "orthodontics", "şeffaf plak", "seffaf plak", "invisalign", "aligners", "diş teli", "braces"
    ]
  },
  {
    id: "crown",
    displayName: { tr: "Porselen Kaplama / Kron", en: "Crown" },
    keywords: [
      "kaplama", "crown", "kron", "porselen kaplama", "porselen diş"
    ]
  },
  {
    id: "tooth_extraction",
    displayName: { tr: "Diş Çekimi", en: "Tooth Extraction" },
    keywords: [
      "diş çekimi", "dis cekimi", "tooth extraction", "20lik diş", "20'lik diş", "yirmilik diş", "wisdom tooth"
    ]
  },
  {
    id: "denture",
    displayName: { tr: "Diş Protezi", en: "Denture" },
    keywords: [
      "protez", "denture", "damak", "total protez", "hareketli protez"
    ]
  },
  {
    id: "hair_transplant",
    displayName: { tr: "Saç Ekimi", en: "Hair Transplant" },
    keywords: [
      "saç ekimi", "sac ekimi", "hair transplant", "fue", "dhi"
    ]
  },
  {
    id: "rhinoplasty",
    displayName: { tr: "Burun Estetiği", en: "Rhinoplasty" },
    keywords: [
      "burun estetiği", "burun estetigi", "rhinoplasty", "rinoplasti"
    ]
  },
  {
    id: "blepharoplasty",
    displayName: { tr: "Göz Kapağı Estetiği", en: "Blepharoplasty" },
    keywords: [
      "göz kapağı", "goz kapagi", "blepharoplasty", "blefaroplasti"
    ]
  },
  {
    id: "consultation",
    displayName: { tr: "Muayene / Danışma", en: "Consultation / Checkup" },
    keywords: [
      "muayene", "consultation", "checkup", "check-up", "kontrol", "danışma"
    ]
  }
];

export class SlotExtractor {
  /**
   * Extract all identifiable slots and entities from a message, optionally in context of previous slots and expectedSlot
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
      // User sent an incomplete or malformed email
      invalidEmailAttempt = true;
    }

    // 3. Date Extraction (if not already extracted by correction)
    if (!extracted.preferredDate) {
      const dateRes = this.parseDate(raw, lower, timeZone);
      if (dateRes) {
        extracted.preferredDate = dateRes.isoDate;
        extracted.date = dateRes.isoDate;
        extracted.rawDateText = dateRes.rawText;
        extracted.preferredWeekday = dateRes.weekday;
      }
    }

    // 4. Time Extraction
    if (!extracted.preferredTime) {
      const timeRes = this.parseTime(raw, lower);
      if (timeRes) {
        extracted.preferredTime = timeRes.time;
        extracted.time = timeRes.time;
        extracted.rawTimeText = timeRes.rawText;
        extracted.timePreference = timeRes.timePreference;
      }
    }

    // 5. Visit Type Extraction (ilk gelişimiz, kontrol vb.)
    if (!extracted.visitType) {
      const visitRes = this.parseVisitType(lower);
      if (visitRes) {
        extracted.visitType = visitRes;
      }
    }

    // 6. Treatment Entity Extraction (Canonicalized)
    if (!extracted.treatment) {
      const treatmentRes = this.parseCanonicalTreatment(lower);
      if (treatmentRes) {
        extracted.treatment = treatmentRes.id;
        extracted.rawTreatmentText = treatmentRes.matchedRaw;
      }
    }

    // 7. Information Type Extraction (price, duration, recovery, etc.)
    const infoType = this.parseInformationType(lower);
    if (infoType) {
      extracted.informationType = infoType;
    }

    // 8. Contact Target Extraction (clinic_team, doctor, whatsapp, phone)
    const contactTarget = this.parseContactTarget(lower);
    if (contactTarget) {
      extracted.contactTarget = contactTarget;
    }

    // 9. Currency Extraction
    const currency = this.parseCurrency(raw, lower);
    if (currency) {
      extracted.priceCurrency = currency;
      extracted.currency = currency;
    }

    // 10. Phone Extraction
    const phoneRes = this.parsePhone(raw);
    if (phoneRes) {
      extracted.phone = phoneRes;
    }

    // 11. Name Extraction
    if (!extracted.fullName && !extracted.firstName) {
      const nameRes = this.parseName(raw, lower, existingSlots, expectedSlot);
      if (nameRes) {
        extracted.fullName = nameRes.fullName;
        extracted.firstName = nameRes.firstName;
        extracted.lastName = nameRes.lastName;
      }
    }

    // 12. KVKK Consent
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
    locale: string = "tr",
    timeZone: string = "Europe/Istanbul"
  ): { isCorrection: boolean; slotKey?: keyof ConversationSlots; slots: Partial<ConversationSlots> } {
    const slots: Partial<ConversationSlots> = {};

    // Pattern A: "X değil Y olsun" / "X değil Y" (Date / Time / Name / Phone)
    const degilMatch = lower.match(/(.+?)\s+değil[,\s]+(.+?)(?:\s+olsun|\s+lütfen|\.|$)/i) ||
      lower.match(/(.+?)\s+degil[,\s]+(.+?)(?:\s+olsun|\s+lutfen|\.|$)/i);

    if (degilMatch) {
      const targetPhrase = degilMatch[2].trim();
      const dateRes = this.parseDate(targetPhrase, targetPhrase.toLowerCase(), timeZone);
      if (dateRes) {
        slots.preferredDate = dateRes.isoDate;
        slots.date = dateRes.isoDate;
        slots.rawDateText = dateRes.rawText;
        slots.preferredWeekday = dateRes.weekday;
        return { isCorrection: true, slotKey: "preferredDate", slots };
      }

      const timeRes = this.parseTime(targetPhrase, targetPhrase.toLowerCase());
      if (timeRes) {
        slots.preferredTime = timeRes.time;
        slots.time = timeRes.time;
        slots.rawTimeText = timeRes.rawText;
        return { isCorrection: true, slotKey: "preferredTime", slots };
      }
    }

    // Pattern B: English "Use X instead", "Change date to X", "Actually X", "Make it X"
    const enChangeMatch = lower.match(/(?:use|change date to|change time to|change to|actually|make it)\s+(.+?)(?:instead|\.|$)/i);
    if (enChangeMatch) {
      const targetPhrase = enChangeMatch[1].trim();

      const emailMatch = this.parseEmail(targetPhrase);
      if (emailMatch) {
        slots.email = emailMatch;
        return { isCorrection: true, slotKey: "email", slots };
      }

      const phoneMatch = this.parsePhone(targetPhrase);
      if (phoneMatch) {
        slots.phone = phoneMatch;
        return { isCorrection: true, slotKey: "phone", slots };
      }

      const dateRes = this.parseDate(targetPhrase, targetPhrase.toLowerCase(), timeZone);
      if (dateRes) {
        slots.preferredDate = dateRes.isoDate;
        slots.date = dateRes.isoDate;
        slots.rawDateText = dateRes.rawText;
        slots.preferredWeekday = dateRes.weekday;
        return { isCorrection: true, slotKey: "preferredDate", slots };
      }
    }

    return { isCorrection: false, slots: {} };
  }

  /**
   * Parse canonical treatment entity from text
   */
  public static parseCanonicalTreatment(lower: string): { id: string; matchedRaw: string } | null {
    // Check specific/longer keywords first to avoid prefix shadowing (e.g. "composite filling" before "filling")
    for (const t of CANONICAL_TREATMENTS) {
      for (const kw of t.keywords) {
        const regex = new RegExp(`\\b${kw.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
        if (regex.test(lower)) {
          return { id: t.id, matchedRaw: kw };
        }
      }
    }
    return null;
  }

  /**
   * Parse Information Type (price, duration, recovery, suitability, process, etc.)
   */
  public static parseInformationType(lower: string): InformationType | undefined {
    // 1. Price
    if (/\b(fiyat|fiyati|fiyatı|fiyatlar|ücret|ucret|ücreti|kaç tl|kac tl|kaç para|kac para|kaç euro|ne kadar|fiyat bilgisi|ücretli mi|ucretli mi|price|pricing|cost|how much|fee|charge|expensive|quote|teklif)\b/i.test(lower)) {
      return "price";
    }
    // 2. Duration
    if (/\b(kaç gün|kac gun|kaç saat|kac saat|ne kadar sürer|ne kadar surer|kaç seans|kac seans|how long|how many days|duration|time take|how much time)\b/i.test(lower)) {
      return "duration";
    }
    // 3. Recovery
    if (/\b(iyileşme|iyilesme|iyileşme süreci|ağrı olur mu|agri olur mu|şişlik|sislik|morluk|after surgery|recovery|healing|side effects|pain after|downtime)\b/i.test(lower)) {
      return "recovery";
    }
    // 4. Suitability / Candidacy
    if (/\b(uygun muyum|kimlere yapılır|kimlere yapilir|kimler yaptırabilir|yaş sınırı|yas siniri|am i suitable|who is suitable|candidacy|contraindications|can i have|can i get)\b/i.test(lower)) {
      return "suitability";
    }
    // 5. Process / Procedure steps
    if (/\b(nasıl yapılır|nasil yapilir|aşamaları|asamalari|işlem sırası|islem sirasi|prosedür|prosedur|how is it done|process|procedure|steps|what happens)\b/i.test(lower)) {
      return "process";
    }
    // 6. Material / Brand
    if (/\b(hangi malzeme|hangi marka|marka|markalar|malzeme|kalite|material|brand|quality|is it safe)\b/i.test(lower)) {
      return "material";
    }
    // 7. Warranty / Guarantee
    if (/\b(garanti|garantisi|ömür|omur|kaç yıl garanti|kac yil garanti|warranty|guarantee|lifetime|how long lasts)\b/i.test(lower)) {
      return "warranty";
    }
    // 8. Availability
    if (/\b(ne zaman gelebilirim|müsait|musait|hangi günler|hangi gunler|açık mı|acik mi|available|when can i come|open on)\b/i.test(lower)) {
      return "availability";
    }
    // 9. Location
    if (/\b(nerede|neredesiniz|adres|konum|harita|ulaşım|ulasim|where|location|address|how to get)\b/i.test(lower)) {
      return "location";
    }
    // 10. Opening hours
    if (/\b(çalışma saatleri|calisma saatleri|kaçta açılıyor|kaçta kapanıyor|mesai|opening hours|working hours)\b/i.test(lower)) {
      return "opening_hours";
    }
    return undefined;
  }

  /**
   * Parse Contact Target
   */
  public static parseContactTarget(lower: string): ContactTarget | undefined {
    if (/\b(whatsapp|wp|whats app)\b/i.test(lower)) {
      return "whatsapp";
    }
    if (/\b(telefon|numara|arama|arayın|arayin|call me|phone number|call you|phone)\b/i.test(lower)) {
      return "phone";
    }
    if (/\b(doktor|doktorla|hekim|hekimle|doctor|dentist|physician)\b/i.test(lower)) {
      return "doctor";
    }
    if (/\b(canlı destek|canli destek|müşteri temsilcisi|yetkili|temsilci|human agent|live support|representative|talk to human|real person)\b/i.test(lower)) {
      return "human_agent";
    }
    if (/\b(ekip|ekiple|klinik ekibi|talk to your team|speak to someone|speak to your team|contact the clinic|reach you|reach the clinic|talk to a representative)\b/i.test(lower)) {
      return "clinic_team";
    }
    return undefined;
  }

  /**
   * Parse Currency
   */
  public static parseCurrency(raw: string, lower: string): string | undefined {
    if (/\b(eur|euro|€)\b/i.test(lower) || raw.includes("€")) return "EUR";
    if (/\b(usd|dollar|dolar|\$)\b/i.test(lower) || raw.includes("$")) return "USD";
    if (/\b(gbp|pound|sterlin|£)\b/i.test(lower) || raw.includes("£")) return "GBP";
    if (/\b(try|tl|lira|₺)\b/i.test(lower) || raw.includes("₺")) return "TRY";
    return undefined;
  }

  /**
   * Parse date in multiple formats (numeric, relative, full text Turkish/English)
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

    // 4. English text dates: "August 3rd", "August 3", "3rd of August", "3 August 2026"
    for (const [mName, mNum] of Object.entries(MONTHS_EN)) {
      const regexEn1 = new RegExp(`\\b${mName}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?\\b`, "i");
      const matchEn1 = lower.match(regexEn1);
      if (matchEn1) {
        const day = parseInt(matchEn1[1], 10);
        const year = matchEn1[2] ? parseInt(matchEn1[2], 10) : currentYear;
        const iso = `${year}-${String(mNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const weekdayInfo = AppointmentDateValidator.getCanonicalWeekday({ isoDate: iso, timeZone });
        return { isoDate: iso, rawText: matchEn1[0], weekday: weekdayInfo.weekdayTr };
      }

      const regexEn2 = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${mName}(?:\\s+(\\d{4}))?\\b`, "i");
      const matchEn2 = lower.match(regexEn2);
      if (matchEn2) {
        const day = parseInt(matchEn2[1], 10);
        const year = matchEn2[2] ? parseInt(matchEn2[2], 10) : currentYear;
        const iso = `${year}-${String(mNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const weekdayInfo = AppointmentDateValidator.getCanonicalWeekday({ isoDate: iso, timeZone });
        return { isoDate: iso, rawText: matchEn2[0], weekday: weekdayInfo.weekdayTr };
      }
    }

    return null;
  }

  /**
   * Parse time preference (exact 24h clock, e.g. 14:00, or fuzzy: sabah, öğleden sonra, morning, afternoon)
   */
  public static parseTime(
    raw: string,
    lower: string
  ): { time: string; rawText: string; timePreference?: string } | null {
    // Exact clock time: "14:00", "14.30", "09:15", "9:00", "14:00'te"
    const exactMatch = raw.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
    if (exactMatch) {
      const h = String(parseInt(exactMatch[1], 10)).padStart(2, "0");
      const m = exactMatch[2];
      return { time: `${h}:${m}`, rawText: exactMatch[0], timePreference: "specific" };
    }

    // Exact hour: "saat 14", "saat 2'de", "at 2 PM", "at 14:00"
    const hourMatch = lower.match(/\bsaat\s*([01]?\d|2[0-3])(?:\s*(?:de|da|te|ta|civarı))?\b/i) ||
      lower.match(/\bat\s*([01]?\d|2[0-3])\s*(am|pm)?\b/i);
    if (hourMatch) {
      let h = parseInt(hourMatch[1], 10);
      if (hourMatch[2] && hourMatch[2].toLowerCase() === "pm" && h < 12) {
        h += 12;
      }
      return { time: `${String(h).padStart(2, "0")}:00`, rawText: hourMatch[0], timePreference: "specific" };
    }

    // Fuzzy Time: Turkish
    if (/\b(sabah|sabahları|öğleden önce|ogleden once|morning)\b/i.test(lower)) {
      return { time: "10:00", rawText: "sabah", timePreference: "morning" };
    }
    if (/\b(öğle|ogle|öğlen|oglen|noon|midday)\b/i.test(lower)) {
      return { time: "12:00", rawText: "öğlen", timePreference: "afternoon" };
    }
    if (/\b(öğleden sonra|ogleden sonra|afternoon)\b/i.test(lower)) {
      return { time: "14:00", rawText: "öğleden sonra", timePreference: "afternoon" };
    }
    if (/\b(akşam|aksam|akşamüstü|aksamustu|evening)\b/i.test(lower)) {
      return { time: "17:00", rawText: "akşam", timePreference: "evening" };
    }

    return null;
  }

  /**
   * Parse Visit Type (first_visit vs control / follow-up)
   */
  public static parseVisitType(lower: string): VisitType | null {
    if (
      /\b(ilk gelişimiz|ilk gelisimiz|ilk defa geliyorum|ilk kez geliyorum|yeni hastayım|yeni hastayim|ilk muayene|first visit|first time|new patient)\b/i.test(
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
   * Parse email address with sanitization
   */
  public static parseEmail(raw: string): string | null {
    if (!raw) return null;
    const sanitized = raw.replace(/^[\s,.;:<>]+|[\s,.;:<>]+$/g, "").trim();
    const despaced = sanitized.replace(/\s*@\s*/g, "@").replace(/\s*\.\s*/g, ".");
    const emailMatch = despaced.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return emailMatch ? emailMatch[0].toLowerCase() : null;
  }

  /**
   * Parse and normalize phone number (Turkish and international)
   */
  public static parsePhone(raw: string): string | null {
    if (!raw) return null;
    const norm = normalizeTurkishPhone(raw);
    if (norm.valid) {
      return norm.display;
    }

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
    existingSlots: Partial<ConversationSlots> = {},
    expectedSlot?: string
  ): { fullName: string; firstName: string; lastName: string } | null {
    // Pattern 1: "Adım Ahmet Yılmaz", "İsmim Ahmet Yılmaz", "My name is John Doe"
    const explicitNameMatch = raw.match(/(?:adım|adim|ismim|my name is|i am|i'm)\s+([A-Za-zÇĞİÖŞÜçğıöşü]{2,}\s+[A-Za-zÇĞİÖŞÜçğıöşü]{2,})/i);
    if (explicitNameMatch) {
      const full = explicitNameMatch[1].trim();
      const parts = full.split(/\s+/);
      return {
        fullName: full,
        firstName: parts[0],
        lastName: parts.slice(1).join(" ")
      };
    }

    // Pattern 2: When expectedSlot is fullName / name, or in APPOINTMENT_COLLECTION without a name
    if (expectedSlot === "fullName" || expectedSlot === "name") {
      const clean = raw.trim();
      const parts = clean.split(/\s+/);
      if (parts.length >= 2 && parts.length <= 4 && /^[A-Za-zÇĞİÖŞÜçğıöşü\s]+$/.test(clean) && clean.length <= 40) {
        // Exclude system words
        const badWords = ["randevu", "fiyat", "tarih", "saat", "doktor", "klinik", "bilgi", "evet", "hayır", "tamam", "yes", "no", "okay"];
        const hasBad = parts.some(p => badWords.includes(p.toLowerCase()));
        if (!hasBad) {
          return {
            fullName: clean,
            firstName: parts[0],
            lastName: parts.slice(1).join(" ")
          };
        }
      }
    }

    return null;
  }

  /**
   * Parse KVKK / Privacy consent acceptance
   */
  public static isKvkkConsent(lower: string): boolean {
    return /\b(kvkk|aydınlatma metnini okudum|onaylıyorum|kabul ediyorum|açık rıza|acik riza|i accept the privacy|accept terms|consent given)\b/i.test(
      lower
    );
  }
}
