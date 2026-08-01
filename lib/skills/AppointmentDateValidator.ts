export interface DateValidationConsistencyResult {
  originalInput: string;
  rawDateText: string | null;
  rawTimeText: string | null;

  mentionedDate: string | null;
  mentionedWeekday: string | null;
  mentionedWeekdayIndex: number | null;

  resolvedDate: string | null;
  resolvedTime: string | null;
  resolvedWeekday: string | null;
  resolvedWeekdayEn?: string | null;
  resolvedWeekdayTr?: string | null;
  resolvedWeekdayIndex: number | null;

  timeZone: string;

  isValid: boolean;
  hasConflict: boolean;

  conflictType:
    | null
    | "DATE_WEEKDAY_MISMATCH"
    | "PAST_DATE"
    | "PAST_TIME"
    | "AMBIGUOUS_DATE"
    | "INVALID_DATE"
    | "INVALID_TIME";

  alternatives: Array<{
    date: string;
    time: string | null;
    weekday: string;
    label: string;
  }>;

  requiresClarification: boolean;
  clarificationMessage?: string;
}

export class AppointmentDateValidator {
  private static readonly weekdayMap: Record<string, number> = {
    pazar: 0, sunday: 0,
    pazartesi: 1, monday: 1,
    sali: 2, salı: 2, tuesday: 2,
    carsamba: 3, çarşamba: 3, wednesday: 3,
    persembe: 4, perşembe: 4, thursday: 4,
    cuma: 5, friday: 5,
    cumartesi: 6, saturday: 6
  };

  private static readonly weekdayNamesTr = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
  private static readonly weekdayNamesEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  private static readonly trMonths: Record<string, number> = {
    "ocak": 0, "şubat": 1, "subat": 1, "mart": 2, "nisan": 3, "mayıs": 4, "mayis": 4, "haziran": 5,
    "temmuz": 6, "ağustos": 7, "agustos": 7, "eylül": 8, "eylul": 8, "ekim": 9, "kasım": 10, "kasim": 10, "aralık": 11, "aralik": 11,
    "january": 0, "february": 1, "march": 2, "april": 3, "may": 4, "june": 5, "july": 6, "august": 7, "september": 8, "october": 9, "november": 10, "december": 11
  };

  public static getCanonicalWeekday({ isoDate, timeZone }: { isoDate: string, timeZone: string }) {
    const parts = isoDate.split("-");
    if (parts.length !== 3) return { weekdayIndex: -1, weekdayTr: "", weekdayEn: "" };
    
    // Create date at noon UTC to avoid shift
    const d = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0));
    
    // Int.DateTimeFormat with weekday="numeric" is not standard, let's just use part extraction
    const dtf = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    const formattedParts = dtf.formatToParts(d);
    
    const year = parseInt(formattedParts.find(p => p.type === 'year')!.value);
    const month = parseInt(formattedParts.find(p => p.type === 'month')!.value) - 1;
    const day = parseInt(formattedParts.find(p => p.type === 'day')!.value);
    
    const localDate = new Date(year, month, day);
    const idx = localDate.getDay();

    return {
      weekdayIndex: idx,
      weekdayTr: this.weekdayNamesTr[idx],
      weekdayEn: this.weekdayNamesEn[idx]
    };
  }

  public static validateAppointmentDateConsistency({
    rawDateText,
    rawTimeText,
    inferredDate,
    inferredTime,
    currentClinicDateTime,
    timeZone
  }: {
    rawDateText: string | null;
    rawTimeText: string | null;
    inferredDate: string | null;
    inferredTime: string | null;
    currentClinicDateTime: Date;
    timeZone: string;
  }): DateValidationConsistencyResult {
    
    const result: DateValidationConsistencyResult = {
      originalInput: rawDateText || "",
      rawDateText,
      rawTimeText,
      mentionedDate: null,
      mentionedWeekday: null,
      mentionedWeekdayIndex: null,
      resolvedDate: null,
      resolvedTime: inferredTime,
      resolvedWeekday: null,
      resolvedWeekdayIndex: null,
      timeZone,
      isValid: false,
      hasConflict: false,
      conflictType: null,
      alternatives: [],
      requiresClarification: false
    };

    if (!rawDateText || rawDateText.toLowerCase().trim() === "belirtilmedi") {
      result.conflictType = "AMBIGUOUS_DATE";
      return result;
    }

    const lowerRaw = rawDateText.toLocaleLowerCase("tr-TR").trim();
    
    // Get current clinic Date based on timezone
    const dtf = new Intl.DateTimeFormat("en-US", { 
      timeZone, 
      year: "numeric", month: "2-digit", day: "2-digit", 
      hour: "2-digit", minute: "2-digit", hour12: false 
    });
    const parts = dtf.formatToParts(currentClinicDateTime);
    const currentYear = parseInt(parts.find(p => p.type === 'year')!.value);
    const currentMonth = parseInt(parts.find(p => p.type === 'month')!.value) - 1;
    const currentDay = parseInt(parts.find(p => p.type === 'day')!.value);
    const currentHour = parseInt(parts.find(p => p.type === 'hour')!.value);
    const currentMinute = parseInt(parts.find(p => p.type === 'minute')!.value);
    
    const clinicNow = new Date(currentYear, currentMonth, currentDay, currentHour, currentMinute);

    // Extract mentioned weekday (sort by length descending to match "pazartesi" before "pazar")
    const sortedKeys = Object.keys(this.weekdayMap).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
      const val = this.weekdayMap[key];
      // Need exact word match for short days like "cuma"
      const regex = new RegExp(`\\b${key}\\b`, 'i');
      if (regex.test(lowerRaw) || lowerRaw.includes(key)) {
        result.mentionedWeekdayIndex = val;
        result.mentionedWeekday = this.weekdayNamesTr[val];
        break;
      }
    }

    // Determine if user explicitly mentioned a date number (e.g. "26 Temmuz", "31")
    const dateRegex = /(\d{1,2})\s*([a-zçğıöşü]+)/;
    const dateMatch = lowerRaw.match(dateRegex);
    let explicitDateStr = null;
    if (dateMatch && this.trMonths[dateMatch[2]] !== undefined) {
       explicitDateStr = `${currentYear}-${String(this.trMonths[dateMatch[2]] + 1).padStart(2, '0')}-${String(parseInt(dateMatch[1])).padStart(2, '0')}`;
       result.mentionedDate = explicitDateStr;
    }

    let parsedDateObj: Date | null = null;
    
    // Relative keywords
    if (lowerRaw.includes("bugün") || lowerRaw.includes("bugun") || lowerRaw === "today") {
       parsedDateObj = new Date(currentYear, currentMonth, currentDay);
    } else if (lowerRaw.includes("yarın") || lowerRaw.includes("yarin") || lowerRaw === "tomorrow") {
       parsedDateObj = new Date(currentYear, currentMonth, currentDay + 1);
    } 
    // Only weekday provided (no explicit date) -> resolve deterministically
    else if (result.mentionedWeekdayIndex !== null && !explicitDateStr) {
       const currentWd = clinicNow.getDay();
       const targetWd = result.mentionedWeekdayIndex;
       
       let daysAhead = (targetWd - currentWd + 7) % 7;
       
       // Rules: 
       // If same day but time passed -> next week
       // If same day but time NOT passed -> today
       if (daysAhead === 0) {
         if (rawTimeText) {
            const timeMatch = rawTimeText.match(/(\d{1,2})/);
            if (timeMatch) {
               const reqHour = parseInt(timeMatch[1]);
               // very naive time check
               if (reqHour <= currentHour) {
                  daysAhead += 7;
               }
            }
         } else if (currentHour >= 18) {
            daysAhead += 7;
         }
       } else if (daysAhead < 0) {
          daysAhead += 7;
       }

       if (lowerRaw.includes("haftaya") || lowerRaw.includes("gelecek") || lowerRaw.includes("next")) {
         if (daysAhead < 7) daysAhead += 7;
       }

       parsedDateObj = new Date(currentYear, currentMonth, currentDay + daysAhead);
    } 
    // Explicit date was parsed
    else if (explicitDateStr) {
       parsedDateObj = new Date(
         parseInt(explicitDateStr.split("-")[0]), 
         parseInt(explicitDateStr.split("-")[1]) - 1, 
         parseInt(explicitDateStr.split("-")[2])
       );
    }
    // Fallback to LLM inferred date if all else fails, BUT we will validate it strictly!
    else if (inferredDate) {
       const parts = inferredDate.split("-");
       if (parts.length === 3) {
         parsedDateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
       }
    }

    if (!parsedDateObj) {
      result.conflictType = "INVALID_DATE";
      return result;
    }

    const isoDateStr = `${parsedDateObj.getFullYear()}-${String(parsedDateObj.getMonth() + 1).padStart(2, '0')}-${String(parsedDateObj.getDate()).padStart(2, '0')}`;
    const canonical = this.getCanonicalWeekday({ isoDate: isoDateStr, timeZone });
    
    result.resolvedDate = isoDateStr;
    result.resolvedWeekday = canonical.weekdayTr;
    result.resolvedWeekdayTr = canonical.weekdayTr;
    result.resolvedWeekdayEn = canonical.weekdayEn;
    result.resolvedWeekdayIndex = canonical.weekdayIndex;

    // Check Past Date
    const isToday = isoDateStr === `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;
    if (parsedDateObj.getTime() < new Date(currentYear, currentMonth, currentDay).getTime()) {
      result.hasConflict = true;
      result.conflictType = "PAST_DATE";
      result.requiresClarification = true;
      result.clarificationMessage = `Belirttiğiniz tarih (${isoDateStr}) geçmiş bir tarih. Lütfen geçerli bir tarih belirtir misiniz?`;
      return result;
    }

    // Check Mismatch
    // If the user explicitly mentioned a date AND a weekday, and they don't match:
    if (explicitDateStr && result.mentionedWeekdayIndex !== null && result.mentionedWeekdayIndex !== canonical.weekdayIndex) {
      result.hasConflict = true;
      result.conflictType = "DATE_WEEKDAY_MISMATCH";
      result.requiresClarification = true;

      const alt1Date = isoDateStr; // The date they explicitly said
      const alt1Weekday = canonical.weekdayTr;

      // Find the CLOSEST occurrence of the weekday they mentioned (-3 to +3 days)
      let diff = result.mentionedWeekdayIndex - canonical.weekdayIndex;
      if (diff > 3) diff -= 7;
      if (diff < -3) diff += 7;

      const alt2Obj = new Date(parsedDateObj.getFullYear(), parsedDateObj.getMonth(), parsedDateObj.getDate() + diff);
      
      // If alt2Obj is in the past compared to clinicNow, push it to next week
      if (alt2Obj.getTime() < new Date(currentYear, currentMonth, currentDay).getTime()) {
         alt2Obj.setDate(alt2Obj.getDate() + 7);
      } else if (alt2Obj.getTime() === new Date(currentYear, currentMonth, currentDay).getTime()) {
         // Same day, check time if provided
         if (inferredTime) {
            const timeMatch = inferredTime.match(/(\d{1,2}):(\d{2})/);
            if (timeMatch) {
               const reqHour = parseInt(timeMatch[1]);
               const reqMin = parseInt(timeMatch[2]);
               if (reqHour < currentHour || (reqHour === currentHour && reqMin < currentMinute)) {
                  alt2Obj.setDate(alt2Obj.getDate() + 7);
               }
            }
         }
      }
      const alt2Date = `${alt2Obj.getFullYear()}-${String(alt2Obj.getMonth() + 1).padStart(2, '0')}-${String(alt2Obj.getDate()).padStart(2, '0')}`;
      const alt2Weekday = result.mentionedWeekday!;

      const formatter = new Intl.DateTimeFormat("tr-TR", { month: "long", day: "numeric", year: "numeric" });
      
      const alt1Label = `${formatter.format(parsedDateObj)} ${alt1Weekday}${inferredTime ? ', ' + inferredTime : ''}`;
      const alt2Label = `${formatter.format(alt2Obj)} ${alt2Weekday}${inferredTime ? ', ' + inferredTime : ''}`;

      result.alternatives = [
        { date: alt1Date, time: inferredTime, weekday: alt1Weekday, label: alt1Label },
        { date: alt2Date, time: inferredTime, weekday: alt2Weekday, label: alt2Label }
      ];

      result.clarificationMessage = `Belirttiğiniz tarih ile hafta günü arasında bir uyuşmazlık fark ettim. Hangisini tercih edersiniz?\n1) ${alt1Label}\n2) ${alt2Label}`;
      return result;
    }
    
    // Test 14 explicit rule: if user JUST says "Perşembe" but LLM hallucinates "2026-07-31" (Friday)
    // The instructions say: "If user just says weekday, we MUST pick the valid one." (Kurallar 1)
    
    if (!result.hasConflict) {
      result.isValid = true;
    }

    return result;
  }
}
