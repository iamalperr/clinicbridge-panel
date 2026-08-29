/**
 * Deterministic weekday → ISO date resolution in clinic local timezone.
 * Used by SlotExtractor and appointment scheduling validation.
 */

import {
  clinicLocalDateTimeToUtcIso,
  getClinicLocalParts,
} from "@/lib/appointment/appointmentDateTimePolicy";
import { AppointmentDateValidator } from "@/lib/skills/AppointmentDateValidator";

const WEEKDAY_MAP: Record<string, number> = {
  pazar: 0,
  sunday: 0,
  sun: 0,
  pazartesi: 1,
  monday: 1,
  mon: 1,
  sali: 2,
  salı: 2,
  tuesday: 2,
  tue: 2,
  carsamba: 3,
  çarşamba: 3,
  wednesday: 3,
  wed: 3,
  persembe: 4,
  perşembe: 4,
  thursday: 4,
  thu: 4,
  cuma: 5,
  friday: 5,
  fri: 5,
  cumartesi: 6,
  saturday: 6,
  sat: 6,
};

function addDaysToIsoDate(isoDate: string, days: number, timeZone: string): string {
  const baseUtc = clinicLocalDateTimeToUtcIso(isoDate, "12:00", timeZone);
  if (!baseUtc) return isoDate;
  const next = new Date(new Date(baseUtc).getTime() + days * 86400_000);
  return getClinicLocalParts(next, timeZone).isoDate;
}

function detectWeekdayIndex(lower: string): number | null {
  const sortedKeys = Object.keys(WEEKDAY_MAP).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(
      `(?:^|[^a-zA-ZçÇğĞıİöÖşŞüÜ0-9])${escaped}(?=[^a-zA-ZçÇğĞıİöÖşŞüÜ0-9]|$)`,
      "i"
    );
    if (regex.test(lower)) return WEEKDAY_MAP[key];
  }
  return null;
}

function normalizeHourFromTimeText(rawTimeText?: string | null): number | null {
  if (!rawTimeText) return null;
  const ampm = rawTimeText.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const mer = ampm[3].toLowerCase();
    if (mer === "pm" && h < 12) h += 12;
    if (mer === "am" && h === 12) h = 0;
    return h;
  }
  const m24 = rawTimeText.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) return parseInt(m24[1], 10);
  const hourOnly = rawTimeText.match(/^(\d{1,2})$/);
  if (hourOnly) return parseInt(hourOnly[1], 10);
  return null;
}

export function resolveWeekdayFromMessage(params: {
  raw: string;
  lower: string;
  timeZone: string;
  now?: Date;
  rawTimeText?: string | null;
}): { isoDate: string; rawText: string; weekday: string } | null {
  const now = params.now ?? new Date();
  const lower = params.lower || params.raw.toLowerCase();
  const targetWd = detectWeekdayIndex(lower);
  if (targetWd === null) return null;

  const clinicNow = getClinicLocalParts(now, params.timeZone);
  const currentWd = weekdayIndexFromIsoDate(clinicNow.isoDate, params.timeZone);

  let daysAhead = (targetWd - currentWd + 7) % 7;

  const reqHour = normalizeHourFromTimeText(params.rawTimeText);
  if (daysAhead === 0) {
    if (reqHour !== null && reqHour <= clinicNow.hour) {
      daysAhead += 7;
    } else if (reqHour === null && clinicNow.hour >= 18) {
      daysAhead += 7;
    }
  }

  const isNext =
    /\b(next|gelecek|haftaya|sonraki)\b/i.test(lower) &&
    !/\bthis\b/i.test(lower);
  const isThis = /\bthis\b/i.test(lower) || /\bbu\b/i.test(lower);

  if (isNext) {
    if (daysAhead < 7) daysAhead += 7;
  } else if (!isThis && daysAhead === 0 && reqHour === null && clinicNow.hour >= 18) {
    daysAhead += 7;
  }

  const isoDate = addDaysToIsoDate(clinicNow.isoDate, daysAhead, params.timeZone);
  const weekdayInfo = AppointmentDateValidator.getCanonicalWeekday({
    isoDate,
    timeZone: params.timeZone,
  });

  const sortedKeys = Object.keys(WEEKDAY_MAP).sort((a, b) => b.length - a.length);
  let rawText = params.raw.trim();
  for (const key of sortedKeys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(
      `(?:^|[^a-zA-ZçÇğĞıİöÖşŞüÜ0-9])(${escaped})(?=[^a-zA-ZçÇğĞıİöÖşŞüÜ0-9]|$)`,
      "i"
    );
    const match = lower.match(regex);
    if (match) {
      rawText = match[1];
      break;
    }
  }

  return { isoDate, rawText, weekday: weekdayInfo.weekdayTr };
}

function weekdayIndexFromIsoDate(isoDate: string, timeZone: string): number {
  const utcIso = clinicLocalDateTimeToUtcIso(isoDate, "12:00", timeZone);
  if (!utcIso) return 0;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).formatToParts(new Date(utcIso));
  const wd = parts.find((p) => p.type === "weekday")?.value || "Sun";
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[wd] ?? 0;
}

export function clinicLocalTodayIso(timeZone: string, now: Date = new Date()): string {
  return getClinicLocalParts(now, timeZone).isoDate;
}

export function clinicLocalTomorrowIso(timeZone: string, now: Date = new Date()): string {
  const today = clinicLocalTodayIso(timeZone, now);
  return addDaysToIsoDate(today, 1, timeZone);
}
