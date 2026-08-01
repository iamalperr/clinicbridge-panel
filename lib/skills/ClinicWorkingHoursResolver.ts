/**
 * ClinicWorkingHoursResolver.ts
 *
 * Deterministic, multi-tier working hours resolver and validator.
 *
 * Hierarchy:
 * 1. Priority 1: Structured Clinic Data (clinicData.workingHours, clinicData.businessHours, etc.)
 * 2. Priority 2: AI Knowledge Base documents (Targeted matching & deterministic parsing)
 * 3. Priority 3 / Fail-safe: Unresolved status defaults to ALLOW (never falsely claim closed)
 *
 * Tenant-isolated: Caching and resolution is strictly scoped by clinicId.
 */

export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export type DaySchedule = [string, string] | null; // e.g. ["10:00", "19:00"] or null if closed

export type WeeklySchedule = Record<DayOfWeek, DaySchedule>;

export interface WorkingHoursDocumentSource {
  id?: string;
  title?: string;
  content?: string;
  text?: string;
  category?: string;
  type?: string;
}

export interface WorkingHoursResolutionResult {
  clinicId: string;
  source: 'structured' | 'knowledge_base' | 'unresolved';
  schedule: WeeklySchedule | null;
  rawText?: string;
  is24_7?: boolean;
  confidence: number;
}

export interface WorkingHoursValidationResult {
  isValid: boolean;
  reason?: 'closed' | 'outside_hours' | 'unresolved_allowed';
  requestedDay?: DayOfWeek;
  requestedDayTr?: string;
  requestedTime?: string;
  daySchedule?: DaySchedule;
  message?: string;
  scheduleSummary?: string;
}

export interface ExtractedRequestedTime {
  day: DayOfWeek;
  time?: string;
  rawDay?: string;
  rawTime?: string;
}

export const TR_DAYS: Record<DayOfWeek, string> = {
  monday: "Pazartesi",
  tuesday: "Salı",
  wednesday: "Çarşamba",
  thursday: "Perşembe",
  friday: "Cuma",
  saturday: "Cumartesi",
  sunday: "Pazar"
};

export const EN_DAYS: Record<DayOfWeek, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday"
};

export const DAY_INDEX_MAP: Record<number, DayOfWeek> = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday'
};

export const TR_TO_DAY_MAP: Record<string, DayOfWeek> = {
  pazartesi: 'monday',
  pzt: 'monday',
  sali: 'tuesday',
  salı: 'tuesday',
  carsamba: 'wednesday',
  çarşamba: 'wednesday',
  çrş: 'wednesday',
  persembe: 'thursday',
  perşembe: 'thursday',
  prş: 'thursday',
  cuma: 'friday',
  cum: 'friday',
  cumartesi: 'saturday',
  cmt: 'saturday',
  pazar: 'sunday',
  pzr: 'sunday',
  monday: 'monday',
  mon: 'monday',
  tuesday: 'tuesday',
  tue: 'tuesday',
  wednesday: 'wednesday',
  wed: 'wednesday',
  thursday: 'thursday',
  thu: 'thursday',
  friday: 'friday',
  fri: 'friday',
  saturday: 'saturday',
  sat: 'saturday',
  sunday: 'sunday',
  sun: 'sunday'
};

// In-memory cache per clinic
const clinicWorkingHoursCache = new Map<string, WorkingHoursResolutionResult>();

export class ClinicWorkingHoursResolver {
  /**
   * Clear cache (useful for testing or when clinic materials update)
   */
  public static clearCache(clinicId?: string): void {
    if (clinicId) {
      clinicWorkingHoursCache.delete(clinicId);
    } else {
      clinicWorkingHoursCache.clear();
    }
  }

  /**
   * Normalize time string "10", "10:00", "10.00", "10:30", "9:00 AM", "6:00 PM" -> "10:00"
   */
  public static normalizeTime(timeStr: string | null | undefined): string | null {
    if (!timeStr) return null;
    const trimmed = timeStr.trim();

    // Check 12-hour AM/PM
    const ampmMatch = trimmed.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)$/i);
    if (ampmMatch) {
      let hour = parseInt(ampmMatch[1], 10);
      const minute = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
      const meridiem = ampmMatch[3].toLowerCase();
      if (meridiem === 'pm' && hour < 12) hour += 12;
      if (meridiem === 'am' && hour === 12) hour = 0;
      if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }

    // 24-hour formats
    const cleaned = trimmed.replace('.', ':');
    const match = cleaned.match(/^(\d{1,2})(?::(\d{2}))?$/);
    if (!match) {
      // Check 4 digit time without colon: "1430"
      const fourDigit = trimmed.match(/^(\d{2})(\d{2})$/);
      if (fourDigit) {
        const hour = parseInt(fourDigit[1], 10);
        const minute = parseInt(fourDigit[2], 10);
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
        return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      }
      return null;
    }

    const hour = parseInt(match[1], 10);
    const minute = match[2] ? parseInt(match[2], 10) : 0;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  /**
   * Resolve working hours for a clinic according to strict priority
   */
  public static resolveClinicWorkingHours({
    clinicId,
    clinicData,
    documents,
    trainingDocs
  }: {
    clinicId: string;
    clinicData?: any;
    documents?: WorkingHoursDocumentSource[];
    trainingDocs?: WorkingHoursDocumentSource[];
  }): WorkingHoursResolutionResult {
    if (!clinicId) {
      return { clinicId: 'unknown', source: 'unresolved', schedule: null, confidence: 0 };
    }

    if (clinicWorkingHoursCache.has(clinicId)) {
      return clinicWorkingHoursCache.get(clinicId)!;
    }

    // ─────────────────────────────────────────────────────────────
    // Priority 1: Structured Clinic Data
    // ─────────────────────────────────────────────────────────────
    const structuredHours = clinicData?.workingHours || clinicData?.working_hours || clinicData?.businessHours || clinicData?.openingHours;
    if (structuredHours && typeof structuredHours === 'object') {
      const parsed = this.parseStructuredWorkingHours(structuredHours);
      if (parsed) {
        const result: WorkingHoursResolutionResult = {
          clinicId,
          source: 'structured',
          schedule: parsed,
          confidence: 1.0
        };
        clinicWorkingHoursCache.set(clinicId, result);
        return result;
      }
    }

    // ─────────────────────────────────────────────────────────────
    // Priority 2: AI Knowledge Base Documents
    // ─────────────────────────────────────────────────────────────
    const docs = documents || trainingDocs;
    if (docs && docs.length > 0) {
      const whDoc = this.findWorkingHoursDocument(docs);
      if (whDoc) {
        const rawContent = (whDoc.content || whDoc.text || '').trim();
        const parsedSchedule = this.parseWorkingHoursText(rawContent);

        if (parsedSchedule) {
          const result: WorkingHoursResolutionResult = {
            clinicId,
            source: 'knowledge_base',
            schedule: parsedSchedule.schedule,
            is24_7: parsedSchedule.is24_7,
            rawText: rawContent,
            confidence: 0.95
          };
          clinicWorkingHoursCache.set(clinicId, result);
          return result;
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // Priority 3: Fail-safe / Unresolved
    // ─────────────────────────────────────────────────────────────
    const unresolvedResult: WorkingHoursResolutionResult = {
      clinicId,
      source: 'unresolved',
      schedule: null,
      confidence: 0
    };
    return unresolvedResult;
  }

  /**
   * Find working hours doc with high precision, excluding false positives (e.g. treatments mentioning "5 gün")
   */
  public static findWorkingHoursDocument(
    docs: WorkingHoursDocumentSource[]
  ): WorkingHoursDocumentSource | null {
    if (!docs || docs.length === 0) return null;

    // 1. Check explicit title matches
    const titleRegex = /^(?=.*(çalışma|mesai|opening|business|working|hours|hizmet|operating))(?=.*(saat|gün|hours|time|days|süreç)).*$/i;
    const titleDoc = docs.find(d => {
      const title = (d.title || '').trim();
      return titleRegex.test(title) || /çalışma\s*saatleri|mesai\s*saatleri|opening\s*hours|business\s*hours/i.test(title);
    });
    if (titleDoc) return titleDoc;

    // 2. Check content starting with or prominently describing schedule
    const prominentDoc = docs.find(d => {
      const content = (d.content || d.text || '').toLowerCase();
      return (
        content.includes("çalışma saatleri") ||
        content.includes("mesai saatleri") ||
        content.includes("haftanın 6 günü") ||
        content.includes("haftanın 7 günü") ||
        content.includes("opening hours") ||
        content.includes("business hours") ||
        content.includes("hafta içi 10:00") ||
        content.includes("hafta içi 09:00")
      );
    });
    if (prominentDoc) return prominentDoc;

    // 3. Fallback: Check for day names and time range indicators
    const fallbackDoc = docs.find(d => {
      const text = ((d.title || '') + " " + (d.content || d.text || '')).toLowerCase();
      const hasDay = /pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar|monday|friday|saturday|sunday|hafta\s*içi/i.test(text);
      const hasTime = /\d{1,2}[:.]\d{2}\s*[-–—/]\s*\d{1,2}[:.]\d{2}/.test(text);
      return hasDay && hasTime;
    });

    return fallbackDoc || null;
  }

  /**
   * Parse structured working hours (JSON/Map/Object format)
   */
  public static parseStructuredWorkingHours(data: any): WeeklySchedule | null {
    if (!data || typeof data !== 'object') return null;

    const days: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const schedule: WeeklySchedule = {
      monday: null,
      tuesday: null,
      wednesday: null,
      thursday: null,
      friday: null,
      saturday: null,
      sunday: null
    };

    let foundAnyValid = false;

    for (const day of days) {
      const rawVal = data[day] ?? data[TR_DAYS[day].toLowerCase()] ?? data[day.toUpperCase()];

      if (rawVal === null || rawVal === false || rawVal === 'closed' || rawVal === 'kapalı') {
        schedule[day] = null;
        foundAnyValid = true;
      } else if (Array.isArray(rawVal) && rawVal.length >= 2) {
        const start = this.normalizeTime(String(rawVal[0]));
        const end = this.normalizeTime(String(rawVal[1]));
        if (start && end) {
          schedule[day] = [start, end];
          foundAnyValid = true;
        }
      } else if (typeof rawVal === 'string' && rawVal.trim().length > 0) {
        if (/kapalı|closed/i.test(rawVal)) {
          schedule[day] = null;
          foundAnyValid = true;
        } else {
          const match = rawVal.match(/(\d{1,2}[:.]\d{2}|\d{1,2})\s*[-–—/]\s*(\d{1,2}[:.]\d{2}|\d{1,2})/);
          if (match) {
            const start = this.normalizeTime(match[1]);
            const end = this.normalizeTime(match[2]);
            if (start && end) {
              schedule[day] = [start, end];
              foundAnyValid = true;
            }
          }
        }
      }
    }

    return foundAnyValid ? schedule : null;
  }

  /**
   * Deterministic Natural Language Working Hours Parser (TR & EN)
   */
  public static parseWorkingHoursText(text: string): {
    schedule: WeeklySchedule;
    is24_7?: boolean;
    monday?: DaySchedule;
    tuesday?: DaySchedule;
    wednesday?: DaySchedule;
    thursday?: DaySchedule;
    friday?: DaySchedule;
    saturday?: DaySchedule;
    sunday?: DaySchedule;
  } | null {
    if (!text || text.trim().length === 0) return null;

    const lower = text.toLowerCase();

    // Check 24/7
    if (lower.includes("7/24") || lower.includes("7 gün 24 saat") || lower.includes("24 hours") || lower.includes("24/7")) {
      const schedule: WeeklySchedule = {
        monday: ["00:00", "23:59"],
        tuesday: ["00:00", "23:59"],
        wednesday: ["00:00", "23:59"],
        thursday: ["00:00", "23:59"],
        friday: ["00:00", "23:59"],
        saturday: ["00:00", "23:59"],
        sunday: ["00:00", "23:59"]
      };
      return { schedule, is24_7: true, ...schedule };
    }

    const schedule: WeeklySchedule = {
      monday: null,
      tuesday: null,
      wednesday: null,
      thursday: null,
      friday: null,
      saturday: null,
      sunday: null
    };

    let parsedAny = false;

    // Helper regex to extract time range from a clause
    const extractHoursFromClause = (str: string): DaySchedule => {
      // AM/PM format
      const ampmRegex = /(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm))\s*(?:[-–—/]|ila|ile|to)\s*(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm))/i;
      const ampmMatch = str.match(ampmRegex);
      if (ampmMatch) {
        const start = ClinicWorkingHoursResolver.normalizeTime(ampmMatch[1]);
        const end = ClinicWorkingHoursResolver.normalizeTime(ampmMatch[2]);
        if (start && end) return [start, end];
      }

      // 24-hour format: "10:00–19:00", "10:00 - 19:00", "10.00-17.00", "09.30 - 18.30", "10-19"
      const m = str.match(/(\d{1,2}(?:[:.]\d{2})?)\s*(?:[-–—/]|ila|ile|to)\s*(\d{1,2}(?:[:.]\d{2})?)/i);
      if (m) {
        const start = ClinicWorkingHoursResolver.normalizeTime(m[1]);
        const end = ClinicWorkingHoursResolver.normalizeTime(m[2]);
        if (start && end) return [start, end];
      }
      return null;
    };

    // Helper to extract hours following a specific day keyword
    const extractHoursAfterKeyword = (dayRegex: RegExp, delimiterRegex?: RegExp): DaySchedule => {
      const match = lower.match(dayRegex);
      if (!match) return null;
      const afterText = lower.slice(match.index! + match[0].length);
      const splitRegex = delimiterRegex || /[,;\n]|(?:hafta\s*sonu|cumartesi|saturday|pazar|sunday|sun|sat)/i;
      const clause = afterText.split(splitRegex)[0];
      return extractHoursFromClause(clause);
    };

    // 0. "Haftanın her günü" / "Every day"
    if (/haftanın\s*her\s*günü|her\s*gün|every\s*day/i.test(lower)) {
      const hours = extractHoursAfterKeyword(/haftanın\s*her\s*günü|her\s*gün|every\s*day/i);
      if (hours) {
        schedule.monday = hours;
        schedule.tuesday = hours;
        schedule.wednesday = hours;
        schedule.thursday = hours;
        schedule.friday = hours;
        schedule.saturday = hours;
        schedule.sunday = hours;
        return { schedule, ...schedule };
      }
    }

    // 1. Weekday range: "Hafta içi", "Pazartesi - Cuma", "Monday to Friday", "Mon-Fri"
    const weekdayHours = extractHoursAfterKeyword(/(?:hafta\s*içi|weekdays|pazartesi\s*(?:[-–—/]|ila|ile|to)\s*cuma|monday\s*(?:[-–—/]|to)\s*friday|mon\s*[-–—/]\s*fri)/i);
    if (weekdayHours) {
      schedule.monday = weekdayHours;
      schedule.tuesday = weekdayHours;
      schedule.wednesday = weekdayHours;
      schedule.thursday = weekdayHours;
      schedule.friday = weekdayHours;
      parsedAny = true;
    }

    // 2. Mon-Sat range: "Pazartesi - Cumartesi", "Monday to Saturday", "Mon-Sat"
    const monSatHours = extractHoursAfterKeyword(/(?:pazartesi\s*(?:[-–—/]|ila|ile|to)\s*cumartesi|monday\s*(?:[-–—/]|to)\s*saturday|mon\s*[-–—/]\s*sat)/i);
    if (monSatHours) {
      schedule.monday = monSatHours;
      schedule.tuesday = monSatHours;
      schedule.wednesday = monSatHours;
      schedule.thursday = monSatHours;
      schedule.friday = monSatHours;
      schedule.saturday = monSatHours;
      parsedAny = true;
    }

    // 3. Weekend range: "Hafta sonu", "Weekend", "Weekends"
    const weekendHours = extractHoursAfterKeyword(/(?:hafta\s*sonu|weekend|weekends)/i, /[,;\n]|(?:pazar|sunday|sun)/i);
    if (weekendHours) {
      const sundayClosed = /pazar\s*(?:günleri\s*)?kapalı|sunday\s*closed|sundays\s*closed/i.test(lower);
      schedule.saturday = weekendHours;
      schedule.sunday = sundayClosed ? null : weekendHours;
      parsedAny = true;
    }

    // 4. Saturday explicitly: "Cumartesi", "Saturday", "Sat"
    const satHours = extractHoursAfterKeyword(/(?:cumartesi|saturday|sat)(?!\s*[-–—/toilaile]+\s*(?:pazar|sunday|sun))/i, /[,;\n]|(?:pazar|sunday|sun)/i);
    if (satHours) {
      schedule.saturday = satHours;
      parsedAny = true;
    } else if (/cumartesi\s*[:–—-]*(?:kapalı|closed)|sat\s*[:–—-]*(?:kapalı|closed)/i.test(lower)) {
      schedule.saturday = null;
      parsedAny = true;
    }

    // 5. Sunday explicitly: "Pazar", "Sunday", "Sun"
    const sunHours = extractHoursAfterKeyword(/(?:pazar|sunday|sun)(?!\s*[-–—/toilaile])/i);
    if (sunHours && !/pazar\s*(?:günleri\s*)?kapalı|sunday\s*closed|sun\s*[:–—-]*(?:kapalı|closed)/i.test(lower)) {
      schedule.sunday = sunHours;
      parsedAny = true;
    } else if (/pazar\s*(?:günleri\s*)?kapalı|sunday\s*closed|sundays\s*closed|sun\s*[:–—-]*(?:kapalı|closed)|haftanın\s*6\s*günü/i.test(lower)) {
      schedule.sunday = null;
      parsedAny = true;
    }

    // 6. Day by day individual lines parser (scoped strictly to segments)
    const segments = lower.split(/[\n,;•*]+|\.\s+/);
    const dayNames: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const segment of segments) {
      const trimmedSeg = segment.trim();
      if (!trimmedSeg) continue;

      for (const day of dayNames) {
        const trName = TR_DAYS[day].toLowerCase();
        const enName = EN_DAYS[day].toLowerCase();
        const segRegex = new RegExp(`^(?:${trName}|${enName}|${day})\\s*[:–—-]\\s*(.+)$`, 'i');
        const segMatch = trimmedSeg.match(segRegex);
        if (segMatch) {
          const segContent = segMatch[1].trim();
          const hours = extractHoursFromClause(segContent);
          if (hours) {
            schedule[day] = hours;
            parsedAny = true;
          } else if (/^(?:kapalı|closed|hizmet\s*vermemektedir|tatil)\b/i.test(segContent) || (/kapalı|closed/i.test(segContent) && !/pazar|cumartesi|cuma|hafta|sunday|saturday/i.test(segContent))) {
            schedule[day] = null;
            parsedAny = true;
          }
        }
      }
    }

    return parsedAny ? { schedule, ...schedule } : null;
  }

  /**
   * Deterministic Day and Time slot extraction from user message
   */
  public static extractRequestedTime(message: string): ExtractedRequestedTime | null {
    if (!message || message.trim().length === 0) return null;

    const lower = message.toLowerCase().trim();

    // Check relative days: "bugün", "yarın"
    const today = new Date();
    const currentDayIdx = today.getDay(); // 0 = sunday, 1 = monday, ...
    let targetDay: DayOfWeek | null = null;
    let rawDay: string | undefined = undefined;

    // Word boundary helper for Turkish text
    const hasWord = (text: string, word: string): boolean => {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?:^|[^a-zA-ZçÇğĞıİöÖşŞüÜ0-9])${escaped}(?=[^a-zA-ZçÇğĞıİöÖşŞüÜ0-9]|$)`, 'i');
      return regex.test(text);
    };

    if (hasWord(lower, "yarın") || hasWord(lower, "yarin") || hasWord(lower, "tomorrow")) {
      const nextIdx = (currentDayIdx + 1) % 7;
      targetDay = DAY_INDEX_MAP[nextIdx];
      rawDay = "yarın";
    } else if (hasWord(lower, "bugün") || hasWord(lower, "bugun") || hasWord(lower, "today")) {
      targetDay = DAY_INDEX_MAP[currentDayIdx];
      rawDay = "bugün";
    } else {
      // Search for weekday names (longest first to avoid substring confusion)
      const sortedKeys = Object.keys(TR_TO_DAY_MAP).sort((a, b) => b.length - a.length);
      for (const key of sortedKeys) {
        if (hasWord(lower, key)) {
          targetDay = TR_TO_DAY_MAP[key];
          rawDay = key;
          break;
        }
      }
    }

    // Time extraction regexes
    let targetTime: string | null = null;
    let rawTime: string | undefined = undefined;

    // Explicit time formats: "14:00", "10:30", "14.00"
    const explicitTime = lower.match(/\b(\d{1,2}[:.]\d{2})\b/);
    if (explicitTime) {
      targetTime = this.normalizeTime(explicitTime[1]);
      rawTime = explicitTime[1];
    } else {
      // 4 digit time without colon: "1430"
      const fourDigit = lower.match(/\b(\d{2})(\d{2})\b/);
      if (fourDigit) {
        targetTime = this.normalizeTime(fourDigit[0]);
        rawTime = fourDigit[0];
      } else {
        // "saat 14", "14'te", "14 te", "saat 10"
        const hourOnlyMatch = lower.match(/(?:saat\s*(\d{1,2})|\b(\d{1,2})\s*['’](?:de|da|te|ta|e|a)\b|\b(\d{1,2})\s*(?:de|da|te|ta)\b)/i);
        if (hourOnlyMatch) {
          const rawHour = hourOnlyMatch[1] || hourOnlyMatch[2] || hourOnlyMatch[3];
          targetTime = this.normalizeTime(`${rawHour}:00`);
          rawTime = rawHour;
        } else {
          // "3 buçukta", "15 buçukta"
          const halfHourMatch = lower.match(/(\d{1,2})\s*buçuk/i);
          if (halfHourMatch) {
            let h = parseInt(halfHourMatch[1], 10);
            if (h <= 7) h += 12; // e.g. "3 buçuk" -> 15:30
            targetTime = `${String(h).padStart(2, '0')}:30`;
            rawTime = `${halfHourMatch[1]} buçuk`;
          }
        }
      }
    }

    if (!targetDay && !targetTime) {
      return null;
    }

    return {
      day: targetDay || DAY_INDEX_MAP[currentDayIdx],
      time: targetTime || undefined,
      rawDay,
      rawTime
    };
  }

  /**
   * Format human-friendly schedule summary
   */
  public static formatWorkingHoursSummary(schedule: WeeklySchedule | null, language: string | null = 'tr'): string {
    const lang = language || 'tr';
    if (!schedule) {
      return lang.toLowerCase().startsWith('en') ? 'Contact clinic for working hours' : 'Lütfen çalışma saatleri için kliniğimizle iletişime geçin.';
    }

    const isEn = lang.toLowerCase().startsWith('en');

    // Check if weekdays are identical
    const mfEqual =
      schedule.monday &&
      schedule.tuesday &&
      schedule.wednesday &&
      schedule.thursday &&
      schedule.friday &&
      schedule.monday[0] === schedule.tuesday[0] && schedule.monday[1] === schedule.tuesday[1] &&
      schedule.monday[0] === schedule.wednesday[0] && schedule.monday[1] === schedule.wednesday[1] &&
      schedule.monday[0] === schedule.thursday[0] && schedule.monday[1] === schedule.thursday[1] &&
      schedule.monday[0] === schedule.friday[0] && schedule.monday[1] === schedule.friday[1];

    if (mfEqual && schedule.monday) {
      const mfHours = `${schedule.monday[0]} - ${schedule.monday[1]}`;
      const satHours = schedule.saturday ? `${schedule.saturday[0]} - ${schedule.saturday[1]}` : (isEn ? 'Closed' : 'Kapalı');
      const sunHours = schedule.sunday ? `${schedule.sunday[0]} - ${schedule.sunday[1]}` : (isEn ? 'Closed' : 'Kapalı');

      if (isEn) {
        return `Monday - Friday: ${mfHours}, Saturday: ${satHours}, Sunday: ${sunHours}`;
      } else {
        return `Pazartesi - Cuma: ${mfHours}, Cumartesi: ${satHours}, Pazar: ${sunHours}`;
      }
    }

    // Fallback: list day by day
    const dayList: string[] = [];
    const days: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const d of days) {
      const dLabel = isEn ? EN_DAYS[d] : TR_DAYS[d];
      const h = schedule[d];
      const hStr = h ? `${h[0]} - ${h[1]}` : (isEn ? 'Closed' : 'Kapalı');
      dayList.push(`${dLabel}: ${hStr}`);
    }

    return dayList.join(', ');
  }

  /**
   * Alias for formatWorkingHoursSummary
   */
  public static formatScheduleSummary(schedule: WeeklySchedule | null, language?: string | null): string {
    return this.formatWorkingHoursSummary(schedule, language);
  }

  /**
   * Validate requested appointment time against resolved working hours
   */
  public static validateRequestedTime({
    schedule,
    is24_7,
    requestedDate,
    weekdayName,
    weekdayIndex,
    requestedTime,
    clinicLanguage = 'tr'
  }: {
    schedule: WeeklySchedule | null;
    is24_7?: boolean;
    requestedDate?: string | null;
    weekdayName?: string | null;
    weekdayIndex?: number | null;
    requestedTime?: string | null;
    clinicLanguage?: string | null;
  }): WorkingHoursValidationResult {
    // Fail-safe: If no schedule is resolved or clinic operates 24/7, allow appointment to proceed
    if (!schedule || is24_7) {
      return {
        isValid: true,
        reason: undefined,
        scheduleSummary: schedule ? this.formatWorkingHoursSummary(schedule, clinicLanguage) : undefined
      };
    }

    // Resolve target day of week
    let targetDay: DayOfWeek | null = null;
    if (weekdayIndex !== null && weekdayIndex !== undefined && DAY_INDEX_MAP[weekdayIndex]) {
      targetDay = DAY_INDEX_MAP[weekdayIndex];
    } else if (weekdayName) {
      const lowerWd = weekdayName.trim().toLowerCase();
      targetDay = TR_TO_DAY_MAP[lowerWd] || null;
    } else if (requestedDate) {
      const parts = requestedDate.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        targetDay = DAY_INDEX_MAP[d.getDay()] || null;
      }
    }

    if (!targetDay) {
      // Cannot determine day, allow fail-safe
      return { isValid: true, reason: undefined };
    }

    const dayTr = TR_DAYS[targetDay];
    const daySchedule = schedule[targetDay];
    const summary = this.formatWorkingHoursSummary(schedule, clinicLanguage);
    const isEn = (clinicLanguage || 'tr').toLowerCase().startsWith('en');
    const normTime = this.normalizeTime(requestedTime);

    // 1. Check if clinic is closed on that day
    if (!daySchedule) {
      const message = isEn
        ? `Our clinic is closed on ${EN_DAYS[targetDay]}. Our working hours are: ${summary}. Could you please specify another day and time that works for you?`
        : `Belirttiğiniz gün (${dayTr}) kliniğimiz kapalıdır. Kliniğimizin çalışma saatleri: ${summary}. Uygun olduğunuz başka bir gün ve saat paylaşabilir misiniz?`;

      return {
        isValid: false,
        reason: 'closed',
        requestedDay: targetDay,
        requestedDayTr: dayTr,
        requestedTime: normTime || requestedTime || undefined,
        daySchedule: null,
        message,
        scheduleSummary: summary
      };
    }

    // 2. Check time if requested
    if (normTime) {
      const [open, close] = daySchedule;
      if (normTime < open || normTime > close) {
        const message = isEn
          ? `The requested time (${normTime}) is outside our working hours on ${EN_DAYS[targetDay]} (${open}–${close}). Our working hours are: ${summary}. Could you please choose a time within these hours?`
          : `Belirttiğiniz ${normTime} saati ${dayTr} günü çalışma saatlerimiz (${open}–${close}) dışında kalmaktadır. Kliniğimizin çalışma saatleri: ${summary}. Bu saatler içerisinden size uygun başka bir saat paylaşabilir misiniz?`;

        return {
          isValid: false,
          reason: 'outside_hours',
          requestedDay: targetDay,
          requestedDayTr: dayTr,
          requestedTime: normTime,
          daySchedule,
          message,
          scheduleSummary: summary
        };
      }
    }

    // Day is open and time (if specified) is within working hours
    return {
      isValid: true,
      reason: undefined,
      requestedDay: targetDay,
      requestedDayTr: dayTr,
      requestedTime: normTime || undefined,
      daySchedule,
      scheduleSummary: summary
    };
  }

  /**
   * Unified end-to-end appointment validation entry point for chat and test routes
   */
  public static async validateAppointmentTime({
    clinicId,
    userMessage,
    documents,
    trainingDocs,
    clinicData,
    language = 'tr',
    requestedDate,
    weekdayName,
    weekdayIndex,
    requestedTime
  }: {
    clinicId: string;
    userMessage?: string;
    documents?: WorkingHoursDocumentSource[];
    trainingDocs?: WorkingHoursDocumentSource[];
    clinicData?: any;
    language?: string | null;
    requestedDate?: string | null;
    weekdayName?: string | null;
    weekdayIndex?: number | null;
    requestedTime?: string | null;
  }): Promise<WorkingHoursValidationResult> {
    const resolution = this.resolveClinicWorkingHours({
      clinicId,
      clinicData,
      documents: documents || trainingDocs
    });

    // If day/time not explicitly passed, attempt extraction from user message
    let effDay = weekdayName;
    let effTime = requestedTime;

    if (!effDay && !requestedDate && weekdayIndex === undefined && userMessage) {
      const extracted = this.extractRequestedTime(userMessage);
      if (extracted) {
        effDay = extracted.day;
        if (!effTime) {
          effTime = extracted.time;
        }
      } else {
        // No concrete date/time mentioned in message, pass through
        return {
          isValid: true,
          reason: undefined,
          scheduleSummary: resolution.schedule ? this.formatWorkingHoursSummary(resolution.schedule, language) : undefined
        };
      }
    }

    return this.validateRequestedTime({
      schedule: resolution.schedule,
      is24_7: resolution.is24_7,
      requestedDate,
      weekdayName: effDay,
      weekdayIndex,
      requestedTime: effTime,
      clinicLanguage: language
    });
  }
}
