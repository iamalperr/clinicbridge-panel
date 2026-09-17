/**
 * Relative date / time parsing helpers used by appointment draft recovery.
 */
import type { AppointmentData } from "./types";

export function resolveRelativeDate(dateText: string, clinicTimeZone = "Europe/Istanbul"): { isoDate: string; displayText: string; validationPassed: boolean; expectedWeekday: string; resolvedWeekday: string } {
  const lower = dateText.toLowerCase().trim();
  
  // Format current date explicitly in the target timezone to avoid UTC midnight skew
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: clinicTimeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false });
  const parts = formatter.formatToParts(now);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value;
  
  const currentYear = parseInt(getPart("year")!, 10);
  const currentMonth = parseInt(getPart("month")!, 10) - 1;
  const currentDay = parseInt(getPart("day")!, 10);
  const currentHour = parseInt(getPart("hour")!, 10);
  
  const clinicNow = new Date(currentYear, currentMonth, currentDay, currentHour, 0, 0);

  const turkishDays: Record<string, number> = {
    "pazar": 0, "pazartesi": 1, "salı": 2, "sali": 2,
    "çarşamba": 3, "carsamba": 3, "perşembe": 4, "persembe": 4,
    "cuma": 5, "cumartesi": 6,
    "sunday": 0, "monday": 1, "tuesday": 2, "wednesday": 3, "thursday": 4, "friday": 5, "saturday": 6
  };

  const getIso = (d: Date) => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getWeekdayName = (d: Date) => {
    return ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"][d.getDay()];
  };

  // Check if it's already an ISO date (if LLM passed an ISO directly, we still validate weekday if it exists)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateText.trim())) {
    const d = new Date(dateText.trim() + "T12:00:00Z");
    return { isoDate: dateText.trim(), displayText: dateText.trim(), validationPassed: true, expectedWeekday: "", resolvedWeekday: getWeekdayName(d) };
  }

  // Check "bugün" / "today"
  if (lower.includes("bugün") || lower.includes("bugun") || lower === "today") {
    return { isoDate: getIso(clinicNow), displayText: dateText, validationPassed: true, expectedWeekday: getWeekdayName(clinicNow), resolvedWeekday: getWeekdayName(clinicNow) };
  }

  // Check "yarın" / "tomorrow"
  if (lower.includes("yarın") || lower.includes("yarin") || lower === "tomorrow") {
    const tomorrow = new Date(clinicNow.getFullYear(), clinicNow.getMonth(), clinicNow.getDate() + 1);
    return { isoDate: getIso(tomorrow), displayText: dateText, validationPassed: true, expectedWeekday: getWeekdayName(tomorrow), resolvedWeekday: getWeekdayName(tomorrow) };
  }

  // Check week days
  for (const [dayName, targetWeekday] of Object.entries(turkishDays)) {
    if (lower.includes(dayName)) {
      const currentWeekday = clinicNow.getDay();
      let daysAhead = (targetWeekday - currentWeekday + 7) % 7;
      
      if (daysAhead === 0 && currentHour >= 18) {
         // Same day, but it's past 18:00, push to next week
         daysAhead += 7;
      } else if (daysAhead <= 0 && !(daysAhead === 0 && currentHour < 18)) {
         // Past day of this week
         daysAhead += 7;
      }
      
      // If text implies "next week" (gelecek, next)
      if (lower.includes("gelecek") || lower.includes("next") || lower.includes("haftaya")) {
          // If daysAhead is less than 7, it means it's coming up this week, so push it to next week.
          if (daysAhead < 7) {
              daysAhead += 7;
          }
      }

      const targetDate = new Date(clinicNow.getFullYear(), clinicNow.getMonth(), clinicNow.getDate() + daysAhead);
      
      const properDayName = getWeekdayName(targetDate);
      return { 
          isoDate: getIso(targetDate), 
          displayText: `${getIso(targetDate)} ${properDayName}`, 
          validationPassed: true, 
          expectedWeekday: properDayName, 
          resolvedWeekday: properDayName 
      };
    }
  }

  return { isoDate: dateText.trim(), displayText: dateText.trim(), validationPassed: true, expectedWeekday: "", resolvedWeekday: "" };
}

export function parseTimeText(text: string) {
  const t = text.trim();
  const lower = t.toLowerCase();
  
  if (!t || lower === "belirtilmedi" || lower === "belirtilmemiş") {
    return { preferredTime: null, preferredTimeStart: null, preferredTimeEnd: null, preferredTimePeriod: null, preferredTimeText: null };
  }

  const result = {
    preferredTime: null as string | null,
    preferredTimeStart: null as string | null,
    preferredTimeEnd: null as string | null,
    preferredTimePeriod: null as "morning" | "afternoon" | "evening" | "earliest_available" | null,
    preferredTimeText: t
  };

  if (lower.includes("sabah") || lower.includes("morning")) {
    result.preferredTimePeriod = "morning";
  } else if (lower.includes("öğleden sonra") || lower.includes("öğleden_sonra") || lower.includes("afternoon")) {
    result.preferredTimePeriod = "afternoon";
  } else if (lower.includes("akşamüstü") || lower.includes("akşam") || lower.includes("evening")) {
    result.preferredTimePeriod = "evening";
  } else if (lower.includes("en erken") || lower.includes("erken") || lower.includes("earliest")) {
    result.preferredTimePeriod = "earliest_available";
  } else if (t.includes("-")) {
    const parts = t.split("-").map(p => p.trim());
    result.preferredTimeStart = parts[0]?.match(/([01]?\d|2[0-3]):?([0-5]\d)/)?.[0] || null;
    result.preferredTimeEnd = parts[1]?.match(/([01]?\d|2[0-3]):?([0-5]\d)/)?.[0] || null;
  } else {
    result.preferredTime = t.match(/([01]?\d|2[0-3]):?([0-5]\d)/)?.[0] || null;
  }

  // Preserve after/before windows extracted from summaries or free text
  const afterClock = lower.match(/\b(?:anytime\s+)?after\s+([01]?\d|2[0-3])(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)?\b/i);
  if (afterClock) {
    let h = parseInt(afterClock[1], 10);
    const m = afterClock[2] || "00";
    const ampm = afterClock[3]?.replace(/\./g, "").toLowerCase();
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    const clock = `${String(h).padStart(2, "0")}:${m}`;
    result.preferredTime = clock;
    result.preferredTimeStart = clock;
    result.preferredTimeText = `Anytime after ${clock}`;
  }

  return result;
}

export function extractAppointmentFromHistory(history: any[]): AppointmentData | null {
  const assistantMsgs = history.filter(h => h.role === "assistant").map(h => h.content as string);

  // Find the last assistant message that contains a summary with Ad: and Telefon:
  const confirmMsg = [...assistantMsgs].reverse().find(m =>
    (m.includes("Ad:") || m.includes("ad:") || m.includes("Name:") || m.includes("İsim:")) &&
    (m.includes("Telefon:") || m.includes("Phone:") || m.includes("Tel:") || m.includes("E-posta:") || m.includes("Email:") || m.includes("E-mail:"))
  );

  if (!confirmMsg) {
    console.log("[appt-extract] No confirmation summary found in history. msgs:", assistantMsgs.length);
    return null;
  }

  console.log("[appt-extract] Found summary:", confirmMsg.slice(0, 300));

  // Extract each field with flexible regex
  const nameMatch    = confirmMsg.match(/(?:Ad|Name|İsim|Hasta):\s*([^\n\r]+)/i);
  const phoneMatch   = confirmMsg.match(/(?:Telefon|Phone|Tel):\s*([0-9\s+\-().]+)/i);
  const emailMatch   = confirmMsg.match(/(?:E-posta|Email|Mail|E-mail):\s*([^\n\r\s]+)/i);
  const serviceMatch = confirmMsg.match(/(?:Hizmet|Service|Tedavi|Treatment):\s*([^\n\r]+)/i);
  const dtMatch      = confirmMsg.match(/(?:Tarih|Date):\s*([^\n\r]+)/i);
  const timeMatch    = confirmMsg.match(/(?:Saat|Time):\s*([^\n\r]+)/i);

  const patientName      = nameMatch?.[1]?.trim() ?? "";
  const patientPhone     = phoneMatch?.[1]?.replace(/\s+/g, "").trim() ?? "";
  let patientEmail     = emailMatch?.[1]?.replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase() ?? "";

  if (patientEmail) {
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (!emailRegex.test(patientEmail)) {
      patientEmail = ""; // Clear invalid email extracted from LLM summary
    }
  }
  const requestedService = serviceMatch?.[1]?.trim() ?? "Genel Muayene";

  const requestedDate = dtMatch?.[1]?.trim() ?? "";
  const rawTimeStr = timeMatch?.[1]?.trim() ?? "";
  
  const parsedTime = parseTimeText(rawTimeStr);

  if (!patientName || (!patientPhone && !patientEmail)) {
    console.log(`[appt-extract] Missing required fields: name="${patientName}" phone="${patientPhone}" email="${patientEmail}"`);
    return null;
  }

  console.log(`[appt-extract] ✅ name="${patientName}" phone="${patientPhone}" service="${requestedService}" date="${requestedDate}" time="${parsedTime.preferredTime}"`);
  return {
    patientName,
    patientPhone,
    patientEmail,
    requestedService,
    requestedDate,
    requestedTime: parsedTime.preferredTime,
    preferredTimeStart: parsedTime.preferredTimeStart,
    preferredTimeEnd: parsedTime.preferredTimeEnd,
    preferredTimePeriod: parsedTime.preferredTimePeriod,
    preferredTimeText: parsedTime.preferredTimeText,
    originalText: confirmMsg
  };
}
