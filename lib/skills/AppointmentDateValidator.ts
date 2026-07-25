export interface DateValidationResult {
  originalInput: string;
  resolvedDate: string | null;
  resolvedTime: string | null;
  resolvedWeekday: string | null;
  mentionedWeekday: string | null;
  timezone: string;
  isValid: boolean;
  hasConflict: boolean;
  conflictType: 'PAST_DATE' | 'WEEKDAY_MISMATCH' | 'AMBIGUOUS' | null;
  alternatives: string[];
  clarificationMessage: string | null;
}

export class AppointmentDateValidator {
  private static readonly turkishDays: Record<string, number> = {
    "pazar": 0, "pazartesi": 1, "salı": 2, "sali": 2,
    "çarşamba": 3, "carsamba": 3, "perşembe": 4, "persembe": 4,
    "cuma": 5, "cumartesi": 6,
    "sunday": 0, "monday": 1, "tuesday": 2, "wednesday": 3, "thursday": 4, "friday": 5, "saturday": 6
  };

  private static readonly weekdayNames = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

  public static validate(
    dateText: string,
    timeText: string | null,
    clinicTimeZone: string = "Europe/Istanbul"
  ): DateValidationResult {
    const lower = dateText.toLowerCase().trim();
    
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", { 
      timeZone: clinicTimeZone, 
      year: "numeric", 
      month: "2-digit", 
      day: "2-digit", 
      hour: "2-digit", 
      minute: "2-digit",
      hour12: false 
    });
    
    const parts = formatter.formatToParts(now);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value;
    
    const currentYear = parseInt(getPart("year")!, 10);
    const currentMonth = parseInt(getPart("month")!, 10) - 1;
    const currentDay = parseInt(getPart("day")!, 10);
    const currentHour = parseInt(getPart("hour")!, 10);
    const currentMinute = parseInt(getPart("minute")!, 10);
    
    const clinicNow = new Date(currentYear, currentMonth, currentDay, currentHour, currentMinute, 0);

    const result: DateValidationResult = {
      originalInput: dateText,
      resolvedDate: null,
      resolvedTime: timeText,
      resolvedWeekday: null,
      mentionedWeekday: null,
      timezone: clinicTimeZone,
      isValid: false,
      hasConflict: false,
      conflictType: null,
      alternatives: [],
      clarificationMessage: null
    };

    if (lower === "belirtilmedi" || !lower) {
      result.isValid = false;
      return result;
    }

    // Detect mentioned weekday
    for (const [dayName, dayIndex] of Object.entries(this.turkishDays)) {
      if (lower.includes(dayName)) {
        result.mentionedWeekday = this.weekdayNames[dayIndex];
        break;
      }
    }

    let parsedDate: Date | null = null;

    // Check ISO
    const isoMatch = dateText.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      parsedDate = new Date(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, parseInt(isoMatch[3], 10), 12, 0, 0);
    } 
    // Check "bugün"
    else if (lower.includes("bugün") || lower.includes("bugun") || lower === "today") {
      parsedDate = new Date(currentYear, currentMonth, currentDay, 12, 0, 0);
    } 
    // Check "yarın"
    else if (lower.includes("yarın") || lower.includes("yarin") || lower === "tomorrow") {
      parsedDate = new Date(currentYear, currentMonth, currentDay + 1, 12, 0, 0);
    } 
    // Check next week relative days (only if it doesn't contain a specific day number)
    else if (result.mentionedWeekday && !lower.match(/\d{1,2}/)) {
       const targetWeekday = this.turkishDays[result.mentionedWeekday.toLowerCase()];
       const currentWeekday = clinicNow.getDay();
       let daysAhead = (targetWeekday - currentWeekday + 7) % 7;
       
       if (daysAhead === 0 && currentHour >= 18) {
          daysAhead += 7;
       } else if (daysAhead <= 0 && !(daysAhead === 0 && currentHour < 18)) {
          daysAhead += 7;
       }
       
       if (lower.includes("haftaya") || lower.includes("gelecek") || lower.includes("next")) {
         if (daysAhead < 7) daysAhead += 7;
       }
       
       parsedDate = new Date(currentYear, currentMonth, currentDay + daysAhead, 12, 0, 0);
    }
    // Very naive parse for "26 Temmuz 2026" formats (since LLMs generally format it as DD Month YYYY or YYYY-MM-DD)
    else {
      const trMonths: Record<string, number> = {
        "ocak": 0, "şubat": 1, "subat": 1, "mart": 2, "nisan": 3, "mayıs": 4, "mayis": 4, "haziran": 5,
        "temmuz": 6, "ağustos": 7, "agustos": 7, "eylül": 8, "eylul": 8, "ekim": 9, "kasım": 10, "kasim": 10, "aralık": 11, "aralik": 11,
        "january": 0, "february": 1, "march": 2, "april": 3, "may": 4, "june": 5, "july": 6, "august": 7, "september": 8, "october": 9, "november": 10, "december": 11
      };
      
      const dateParts = lower.match(/(\d{1,2})\s+([a-zçğıöşü]+)(?:\s+(\d{4}))?/);
      if (dateParts) {
         const day = parseInt(dateParts[1], 10);
         const monthStr = dateParts[2];
         const year = dateParts[3] ? parseInt(dateParts[3], 10) : currentYear;
         if (trMonths[monthStr] !== undefined) {
            parsedDate = new Date(year, trMonths[monthStr], day, 12, 0, 0);
         }
      } else {
         // Maybe it's just standard DD/MM/YYYY
         const ddmmyyyy = lower.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
         if (ddmmyyyy) {
           parsedDate = new Date(parseInt(ddmmyyyy[3], 10), parseInt(ddmmyyyy[2], 10) - 1, parseInt(ddmmyyyy[1], 10), 12, 0, 0);
         }
      }
    }

    if (!parsedDate) {
       result.isValid = false;
       return result;
    }

    const isoDateStr = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}`;
    result.resolvedDate = isoDateStr;
    result.resolvedWeekday = this.weekdayNames[parsedDate.getDay()];

    // 1. Check for Past Date
    const isToday = isoDateStr === `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;
    if (parsedDate.getTime() < clinicNow.getTime() && !isToday) {
       result.hasConflict = true;
       result.conflictType = 'PAST_DATE';
       result.clarificationMessage = `Belirttiğiniz tarih (${isoDateStr}) geçmiş bir tarih. Lütfen geçerli bir tarih belirtir misiniz?`;
       return result;
    }

    // Check for Past Time if it's today
    if (isToday && timeText && timeText.toLowerCase() !== "belirtilmedi") {
       const timeMatch = timeText.match(/(\d{1,2}):(\d{2})/);
       if (timeMatch) {
         const reqHour = parseInt(timeMatch[1], 10);
         const reqMin = parseInt(timeMatch[2], 10);
         if (reqHour < currentHour || (reqHour === currentHour && reqMin < currentMinute)) {
            result.hasConflict = true;
            result.conflictType = 'PAST_DATE';
            result.clarificationMessage = `Belirttiğiniz saat (${timeText}) bugün için geçmiş bir saat. Lütfen geçerli bir saat belirtir misiniz?`;
            return result;
         }
       }
    }

    // 2. Check for Weekday Mismatch
    if (result.mentionedWeekday && result.mentionedWeekday !== result.resolvedWeekday) {
      result.hasConflict = true;
      result.conflictType = 'WEEKDAY_MISMATCH';
      
      const alt1 = `${isoDateStr} ${result.resolvedWeekday}`;
      
      const targetDayIndex = this.turkishDays[result.mentionedWeekday.toLowerCase()];
      let diff = targetDayIndex - parsedDate.getDay();
      if (diff === 0) diff = 7;
      if (diff < 0) diff += 7; 
      
      const nextDate = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate() + diff, 12, 0, 0);
      const nextIso = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;
      const alt2 = `${nextIso} ${result.mentionedWeekday}`;

      result.alternatives = [alt1, alt2];
      result.clarificationMessage = `Belirttiğiniz tarih ile gün uyuşmuyor. Hangisini kastettiniz?\n\n1) ${alt1}\n2) ${alt2}\n\nLütfen seçiminizi 1 veya 2 olarak belirtin.`;
      
      return result;
    }

    result.isValid = true;
    return result;
  }
}
