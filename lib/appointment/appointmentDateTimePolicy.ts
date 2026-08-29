/**
 * Canonical appointment date-time policy for single-clinic chatbot.
 *
 * LLM may interpret natural language; this module decides validity in the
 * clinic timezone before any persistence or notification.
 */

import {
  ClinicWorkingHoursResolver,
  DAY_INDEX_MAP,
  type DayOfWeek,
  type WeeklySchedule,
} from "@/lib/skills/ClinicWorkingHoursResolver";

export type AppointmentResolutionSource =
  | "structured_action"
  | "user_explicit"
  | "llm_extracted"
  | "deterministic_parser";

export type AppointmentResolutionConfidence =
  | "low"
  | "medium"
  | "high"
  | "verified";

export type AppointmentDateTimeRejectReason =
  | "PAST_DATE"
  | "PAST_TIME"
  | "OUTSIDE_WORKING_HOURS"
  | "CLOSED_DAY"
  | "MINIMUM_NOTICE"
  | "AMBIGUOUS_TIMEZONE"
  | "INVALID_DATE"
  | "INVALID_TIME"
  | "MISSING_TIMEZONE";

export interface ResolvedAppointmentDateTime {
  rawUserInput: string;
  localDate: string; // YYYY-MM-DD in clinic TZ
  localTime: string; // HH:mm in clinic TZ
  clinicTimeZone: string;
  startsAtUtc: string; // ISO instant
  sourceTimeZone?: string;
  resolutionSource: AppointmentResolutionSource;
  confidence: AppointmentResolutionConfidence;
}

export interface AppointmentDateTimeSuggestion {
  localDate: string;
  localTime: string;
  weekdayLabel: string;
  label: string;
}

export interface AppointmentDateTimeValidationResult {
  ok: boolean;
  reason?: AppointmentDateTimeRejectReason;
  resolved?: ResolvedAppointmentDateTime;
  message: string;
  suggestions: AppointmentDateTimeSuggestion[];
  requiresTimezoneClarification?: boolean;
  clinicTimeZone: string;
  clinicTimeZoneSource: string;
}

export interface ValidateAppointmentDateTimeParams {
  localDate: string | null | undefined;
  localTime: string | null | undefined;
  rawUserInput?: string | null;
  clinicTimeZone: string;
  now?: Date;
  workingHours?: WeeklySchedule | null;
  is24_7?: boolean;
  /** Existing product: none. Optional override only. Default 0 (still rejects past / current minute). */
  minimumNoticeMinutes?: number;
  locale?: string;
  resolutionSource?: AppointmentResolutionSource;
  confidence?: AppointmentResolutionConfidence;
  sourceTimeZone?: string;
}

/** Known unambiguous abbreviations → IANA. Ambiguous ones are omitted. */
const UNAMBIGUOUS_TZ_ABBREV: Record<string, string> = {
  EST: "America/New_York",
  EDT: "America/New_York",
  PST: "America/Los_Angeles",
  PDT: "America/Los_Angeles",
  MST: "America/Denver",
  MDT: "America/Denver",
  // CST/CDT/IST intentionally omitted (ambiguous across regions).
};

const AMBIGUOUS_TZ_ABBREV = new Set(["CST", "CDT", "IST", "BST", "GST", "AST", "ADT"]);

const WEEKDAY_TR = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const WEEKDAY_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function isValidIanaTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve clinic IANA timezone.
 * Precedence: explicit clinic config → country/city Türkiye mapping → unresolved.
 * Never silently apply Europe/Istanbul to non-Türkiye clinics.
 */
export function resolveClinicTimeZone(clinicData?: {
  timezone?: string | null;
  timeZone?: string | null;
  country?: string | null;
  city?: string | null;
  address?: { country?: string | null; city?: string | null } | null;
  location?: { country?: string | null; city?: string | null } | null;
} | null): { timeZone: string; source: string; confident: boolean } {
  const explicit = String(clinicData?.timezone || clinicData?.timeZone || "").trim();
  if (explicit && isValidIanaTimeZone(explicit)) {
    return { timeZone: explicit, source: "explicit_clinic_config", confident: true };
  }

  const country = String(
    clinicData?.country ||
      clinicData?.address?.country ||
      clinicData?.location?.country ||
      ""
  )
    .trim()
    .toLowerCase();
  const city = String(
    clinicData?.city || clinicData?.address?.city || clinicData?.location?.city || ""
  )
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const isTurkiye =
    country === "tr" ||
    country.includes("turkiye") ||
    country.includes("turkey") ||
    country.includes("türkiye") ||
    city.includes("istanbul") ||
    city.includes("ankara") ||
    city.includes("izmir") ||
    city.includes("antalya") ||
    city.includes("bursa");

  if (isTurkiye) {
    return {
      timeZone: "Europe/Istanbul",
      source: "country_city_fallback_turkiye",
      confident: true,
    };
  }

  return {
    timeZone: "UTC",
    source: "unresolved",
    confident: false,
  };
}

export function getClinicLocalParts(
  now: Date,
  timeZone: string
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  isoDate: string;
  hhmm: string;
} {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(now);
  const year = parseInt(parts.find((p) => p.type === "year")!.value, 10);
  const month = parseInt(parts.find((p) => p.type === "month")!.value, 10);
  const day = parseInt(parts.find((p) => p.type === "day")!.value, 10);
  let hour = parseInt(parts.find((p) => p.type === "hour")!.value, 10);
  if (hour === 24) hour = 0;
  const minute = parseInt(parts.find((p) => p.type === "minute")!.value, 10);
  return {
    year,
    month,
    day,
    hour,
    minute,
    isoDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    hhmm: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

/**
 * Convert a clinic-local civil date+time to a UTC ISO instant.
 */
export function clinicLocalDateTimeToUtcIso(
  localDate: string,
  localTime: string,
  timeZone: string
): string | null {
  const dateMatch = String(localDate || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeNorm = ClinicWorkingHoursResolver.normalizeTime(localTime);
  if (!dateMatch || !timeNorm) return null;

  const y = parseInt(dateMatch[1], 10);
  const m = parseInt(dateMatch[2], 10);
  const d = parseInt(dateMatch[3], 10);
  const [hh, mm] = timeNorm.split(":").map((x) => parseInt(x, 10));

  let utcMs = Date.UTC(y, m - 1, d, hh, mm, 0);
  for (let i = 0; i < 3; i++) {
    const asDate = new Date(utcMs);
    const parts = getClinicLocalParts(asDate, timeZone);
    const desiredAsMinutes = ((d - 1) * 24 + hh) * 60 + mm;
    const actualAsMinutes = ((parts.day - 1) * 24 + parts.hour) * 60 + parts.minute;
    const desiredKey = y * 1e8 + m * 1e6 + d * 1e4 + hh * 100 + mm;
    const actualKey =
      parts.year * 1e8 + parts.month * 1e6 + parts.day * 1e4 + parts.hour * 100 + parts.minute;
    if (desiredKey === actualKey) {
      return new Date(utcMs).toISOString();
    }
    if (parts.year === y && parts.month === m) {
      utcMs += (desiredAsMinutes - actualAsMinutes) * 60_000;
    } else {
      const desiredUtcGuess = Date.UTC(y, m - 1, d, hh, mm);
      const actualUtcGuess = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute
      );
      utcMs += desiredUtcGuess - actualUtcGuess;
    }
  }

  return new Date(utcMs).toISOString();
}

export function detectTimeZoneAbbreviation(raw: string): {
  abbrev: string | null;
  iana: string | null;
  ambiguous: boolean;
} {
  const text = String(raw || "");
  const match = text.match(/\b(EST|EDT|PST|PDT|MST|MDT|CST|CDT|IST|BST|GST|AST|ADT)\b/i);
  if (!match) return { abbrev: null, iana: null, ambiguous: false };
  const abbrev = match[1].toUpperCase();
  if (AMBIGUOUS_TZ_ABBREV.has(abbrev)) {
    return { abbrev, iana: null, ambiguous: true };
  }
  const iana = UNAMBIGUOUS_TZ_ABBREV[abbrev] || null;
  return { abbrev, iana, ambiguous: !iana };
}

/**
 * If the user provided an unambiguous foreign TZ abbreviation with a wall time,
 * convert that instant into clinic-local date/time.
 */
export function convertUserWallTimeToClinicLocal(params: {
  localDate: string;
  localTime: string;
  sourceTimeZone: string;
  clinicTimeZone: string;
}): { localDate: string; localTime: string; startsAtUtc: string } | null {
  const utcIso = clinicLocalDateTimeToUtcIso(
    params.localDate,
    params.localTime,
    params.sourceTimeZone
  );
  if (!utcIso) return null;
  const parts = getClinicLocalParts(new Date(utcIso), params.clinicTimeZone);
  return {
    localDate: parts.isoDate,
    localTime: parts.hhmm,
    startsAtUtc: utcIso,
  };
}

function guidanceMessage(
  reason: AppointmentDateTimeRejectReason,
  locale: string,
  extras?: { suggestions?: AppointmentDateTimeSuggestion[]; scheduleSummary?: string }
): string {
  const isEn = locale.toLowerCase().startsWith("en");
  const suggestionText =
    extras?.suggestions && extras.suggestions.length > 0
      ? isEn
        ? `\n\nPreferred request time options we can submit for clinic confirmation:\n${extras.suggestions
            .map((s, i) => `${i + 1}) ${s.label}`)
            .join("\n")}`
        : `\n\nKlinik onayına sunabileceğimiz saat seçenekleri:\n${extras.suggestions
            .map((s, i) => `${i + 1}) ${s.label}`)
            .join("\n")}`
      : "";

  switch (reason) {
    case "PAST_DATE":
      return (
        (isEn
          ? "The date you shared appears to be in the past. We can choose a future date within the clinic’s working hours."
          : "Belirttiğiniz tarih geçmiş görünüyor. Kliniğin çalışma saatlerine uygun ileri bir tarih seçebiliriz.") +
        suggestionText
      );
    case "PAST_TIME":
      return (
        (isEn
          ? "The time you shared appears to be earlier today. We can choose a later time within clinic hours, or another day."
          : "Belirttiğiniz saat bugün için geçmiş görünüyor. Kliniğin çalışma saatlerine uygun ileri bir saat veya başka bir gün seçebiliriz.") +
        suggestionText
      );
    case "CLOSED_DAY":
      return (
        (isEn
          ? `The clinic appears to be closed on that day.${
              extras?.scheduleSummary ? ` Working hours: ${extras.scheduleSummary}.` : ""
            } We can pick another working day.`
          : `Belirttiğiniz gün kliniğin kapalı olduğu günlerden biri görünüyor.${
              extras?.scheduleSummary ? ` Çalışma saatleri: ${extras.scheduleSummary}.` : ""
            } Dilerseniz başka bir çalışma günü seçebiliriz.`) + suggestionText
      );
    case "OUTSIDE_WORKING_HOURS":
      return (
        (isEn
          ? `That time appears to be outside the clinic’s working hours.${
              extras?.scheduleSummary ? ` Working hours: ${extras.scheduleSummary}.` : ""
            } Today’s hours may already have ended — we can choose the next suitable working day/time.`
          : `Belirttiğiniz saat kliniğin çalışma saatleri dışında görünüyor.${
              extras?.scheduleSummary ? ` Çalışma saatleri: ${extras.scheduleSummary}.` : ""
            } Bugün için çalışma saatleri sona ermiş olabilir; dilerseniz bir sonraki uygun çalışma günü için saat seçebiliriz.`) +
        suggestionText
      );
    case "MINIMUM_NOTICE":
      return (
        (isEn
          ? "That time is a bit too soon for a request. Please choose a slightly later time or another day."
          : "Belirttiğiniz saat talep iletmek için biraz yakın görünüyor. Biraz daha ileri bir saat veya başka bir gün seçebiliriz.") +
        suggestionText
      );
    case "AMBIGUOUS_TIMEZONE":
      return isEn
        ? "Just to confirm — did you mean that time in your local time zone, or in Istanbul time?"
        : "Saati kendi bulunduğunuz saat dilimine göre mi, yoksa İstanbul saatine göre mi belirttiniz?";
    case "MISSING_TIMEZONE":
      return isEn
        ? "I could not confirm the clinic’s time zone yet. Please share a preferred date and time, and the clinic team will confirm availability."
        : "Kliniğin saat dilimini netleştiremedim. İleri bir tarih ve saat paylaşabilirsiniz; kesin uygunluk klinik tarafından onaylanacaktır.";
    case "INVALID_TIME":
    case "INVALID_DATE":
    default:
      return (
        (isEn
          ? "I could not fully understand that date/time. Exact availability will be confirmed by the clinic; please share a future preferred date and a time within clinic hours."
          : "Tarih/saat bilgisini net anlayamadım. Kesin uygunluk klinik tarafından onaylanacaktır; ancak talebinizi ileri bir tarih ve klinik çalışma saatleri içerisindeki bir saatle iletebiliriz.") +
        suggestionText
      );
  }
}

export function suggestNextValidAppointmentTimes(params: {
  now: Date;
  clinicTimeZone: string;
  workingHours?: WeeklySchedule | null;
  is24_7?: boolean;
  locale?: string;
  maxSuggestions?: number;
}): AppointmentDateTimeSuggestion[] {
  const max = params.maxSuggestions ?? 3;
  const locale = params.locale || "tr";
  const isEn = locale.toLowerCase().startsWith("en");
  const out: AppointmentDateTimeSuggestion[] = [];

  if (params.is24_7) {
    for (const addH of [1, 2]) {
      const t = new Date(params.now.getTime() + addH * 3600_000);
      const p = getClinicLocalParts(t, params.clinicTimeZone);
      const wd = weekdayLabel(p.isoDate, params.clinicTimeZone, isEn);
      out.push({
        localDate: p.isoDate,
        localTime: p.hhmm,
        weekdayLabel: wd,
        label: `${wd} ${p.isoDate} ${p.hhmm}`,
      });
      if (out.length >= max) return out;
    }
    return out;
  }

  if (!params.workingHours) return out;

  const base = getClinicLocalParts(params.now, params.clinicTimeZone);
  const baseUtc = clinicLocalDateTimeToUtcIso(base.isoDate, "12:00", params.clinicTimeZone);
  if (!baseUtc) return out;

  for (let dayOffset = 0; dayOffset < 14 && out.length < max; dayOffset++) {
    const dayUtc = new Date(new Date(baseUtc).getTime() + dayOffset * 86400_000);
    const dayParts = getClinicLocalParts(dayUtc, params.clinicTimeZone);
    const wdIdx = weekdayIndexFromIsoDate(dayParts.isoDate, params.clinicTimeZone);
    const dayKey = DAY_INDEX_MAP[wdIdx] as DayOfWeek;
    const schedule = params.workingHours[dayKey];
    if (!schedule) continue;
    const [open, close] = schedule;

    const candidateTimes: string[] = [];
    if (dayOffset === 0) {
      const nowMinutes = base.hour * 60 + base.minute;
      const closeMinutes = hhmmToMinutes(close);
      const openMinutes = hhmmToMinutes(open);
      if (nowMinutes < closeMinutes) {
        const next = Math.max(nowMinutes + 30, openMinutes);
        const rounded = Math.ceil(next / 30) * 30;
        if (rounded < closeMinutes) {
          candidateTimes.push(minutesToHhmm(rounded));
        }
      }
    } else {
      candidateTimes.push(open);
      const mid = hhmmToMinutes(open) + 120;
      if (mid < hhmmToMinutes(close)) candidateTimes.push(minutesToHhmm(mid));
    }

    for (const t of candidateTimes) {
      if (out.length >= max) break;
      const wd = weekdayLabel(dayParts.isoDate, params.clinicTimeZone, isEn);
      out.push({
        localDate: dayParts.isoDate,
        localTime: t,
        weekdayLabel: wd,
        label: `${wd} ${dayParts.isoDate} ${t}`,
      });
    }
  }

  return out;
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  return h * 60 + m;
}

function minutesToHhmm(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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

function weekdayLabel(isoDate: string, timeZone: string, isEn: boolean): string {
  const idx = weekdayIndexFromIsoDate(isoDate, timeZone);
  return isEn ? WEEKDAY_EN[idx] : WEEKDAY_TR[idx];
}

/**
 * Suggest nearest open clinic days around a requested (possibly closed) date.
 */
export function suggestNearbyOpenDates(params: {
  requestedDate: string;
  now: Date;
  clinicTimeZone: string;
  workingHours: WeeklySchedule;
  locale?: string;
  maxSuggestions?: number;
  preferredTime?: string | null;
}): AppointmentDateTimeSuggestion[] {
  const max = params.maxSuggestions ?? 2;
  const locale = params.locale || "tr";
  const isEn = locale.toLowerCase().startsWith("en");
  const out: AppointmentDateTimeSuggestion[] = [];
  const seen = new Set<string>();

  const pushDay = (isoDate: string, time?: string) => {
    if (seen.has(isoDate) || out.length >= max) return;
    const wdIdx = weekdayIndexFromIsoDate(isoDate, params.clinicTimeZone);
    const dayKey = DAY_INDEX_MAP[wdIdx] as DayOfWeek;
    const schedule = params.workingHours[dayKey];
    if (!schedule) return;
    const t = time || params.preferredTime || schedule[0];
    const wd = weekdayLabel(isoDate, params.clinicTimeZone, isEn);
    seen.add(isoDate);
    out.push({
      localDate: isoDate,
      localTime: t,
      weekdayLabel: wd,
      label: formatSuggestionLabel(isoDate, wd, t, isEn),
    });
  };

  for (let offset = 1; offset <= 7 && out.length < max; offset++) {
    const before = addDaysIso(params.requestedDate, -offset, params.clinicTimeZone);
    pushDay(before);
  }
  for (let offset = 1; offset <= 7 && out.length < max; offset++) {
    const after = addDaysIso(params.requestedDate, offset, params.clinicTimeZone);
    pushDay(after);
  }

  return out.sort((a, b) => a.localDate.localeCompare(b.localDate));
}

function addDaysIso(isoDate: string, days: number, timeZone: string): string {
  const baseUtc = clinicLocalDateTimeToUtcIso(isoDate, "12:00", timeZone);
  if (!baseUtc) return isoDate;
  const next = new Date(new Date(baseUtc).getTime() + days * 86400_000);
  return getClinicLocalParts(next, timeZone).isoDate;
}

function formatSuggestionLabel(
  isoDate: string,
  weekday: string,
  time: string,
  isEn: boolean
): string {
  const [y, m, d] = isoDate.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, d);
  const dateFmt = new Intl.DateTimeFormat(isEn ? "en-US" : "tr-TR", {
    month: "long",
    day: "numeric",
  }).format(dt);
  return isEn ? `${weekday}, ${dateFmt}` : `${weekday}, ${dateFmt}`;
}

function closedDayDateMessage(
  locale: string,
  weekdayLabel: string,
  suggestions: AppointmentDateTimeSuggestion[]
): string {
  const isEn = locale.toLowerCase().startsWith("en");
  if (suggestions.length >= 2) {
    const a = suggestions[0].label;
    const b = suggestions[1].label;
    return isEn
      ? `The clinic is closed on ${weekdayLabel}. We can submit a preliminary appointment request for ${a} or ${b}. Which day would you prefer?`
      : `Kliniğimiz ${weekdayLabel} günü kapalıdır. ${a} veya ${b} için ön talep iletebiliriz. Hangi günü tercih edersiniz?`;
  }
  if (suggestions.length === 1) {
    const a = suggestions[0].label;
    return isEn
      ? `The clinic is closed on ${weekdayLabel}. We can submit a preliminary appointment request for ${a}. Would that work for you?`
      : `Kliniğimiz ${weekdayLabel} günü kapalıdır. ${a} için ön talep iletebiliriz. Uyar mı?`;
  }
  return guidanceMessage("CLOSED_DAY", locale);
}

/**
 * Validate a date without requiring a time (collection-stage date slot).
 */
export function validateAppointmentDateOnly(
  params: Omit<ValidateAppointmentDateTimeParams, "localTime"> & {
    localTime?: string | null;
  }
): AppointmentDateTimeValidationResult {
  const now = params.now ?? new Date();
  const locale = params.locale || "tr";
  const clinicTimeZone = params.clinicTimeZone;
  const date = String(params.localDate || "").trim();

  if (!clinicTimeZone || !isValidIanaTimeZone(clinicTimeZone)) {
    return {
      ok: false,
      reason: "MISSING_TIMEZONE",
      message: guidanceMessage("MISSING_TIMEZONE", locale),
      suggestions: [],
      clinicTimeZone: clinicTimeZone || "UTC",
      clinicTimeZoneSource: "invalid",
    };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      ok: false,
      reason: "INVALID_DATE",
      message: guidanceMessage("INVALID_DATE", locale),
      suggestions: suggestNextValidAppointmentTimes({
        now,
        clinicTimeZone,
        workingHours: params.workingHours,
        is24_7: params.is24_7,
        locale,
      }),
      clinicTimeZone,
      clinicTimeZoneSource: "provided",
    };
  }

  const clinicNow = getClinicLocalParts(now, clinicTimeZone);
  const wdIdx = weekdayIndexFromIsoDate(date, clinicTimeZone);
  const weekday = locale.toLowerCase().startsWith("en") ? WEEKDAY_EN[wdIdx] : WEEKDAY_TR[wdIdx];

  if (date < clinicNow.isoDate) {
    const suggestions = suggestNextValidAppointmentTimes({
      now,
      clinicTimeZone,
      workingHours: params.workingHours,
      is24_7: params.is24_7,
      locale,
    });
    return {
      ok: false,
      reason: "PAST_DATE",
      message: guidanceMessage("PAST_DATE", locale, { suggestions }),
      suggestions,
      clinicTimeZone,
      clinicTimeZoneSource: "provided",
    };
  }

  if (!params.is24_7 && params.workingHours) {
    const dayKey = DAY_INDEX_MAP[wdIdx] as DayOfWeek;
    if (!params.workingHours[dayKey]) {
      const suggestions = suggestNearbyOpenDates({
        requestedDate: date,
        now,
        clinicTimeZone,
        workingHours: params.workingHours,
        locale,
        preferredTime: params.localTime || null,
      });
      return {
        ok: false,
        reason: "CLOSED_DAY",
        message: closedDayDateMessage(locale, weekday, suggestions),
        suggestions,
        clinicTimeZone,
        clinicTimeZoneSource: "provided",
      };
    }
  }

  return {
    ok: true,
    message: "",
    suggestions: [],
    clinicTimeZone,
    clinicTimeZoneSource: "provided",
    resolved: {
      rawUserInput: params.rawUserInput || date,
      localDate: date,
      localTime: "",
      clinicTimeZone,
      startsAtUtc: clinicLocalDateTimeToUtcIso(date, "12:00", clinicTimeZone) || "",
      resolutionSource: params.resolutionSource || "deterministic_parser",
      confidence: params.confidence || "high",
    },
  };
}

/**
 * Canonical validator: past date/time, working hours, optional minimum notice.
 */
export function validateAppointmentDateTime(
  params: ValidateAppointmentDateTimeParams
): AppointmentDateTimeValidationResult {
  const now = params.now ?? new Date();
  const locale = params.locale || "tr";
  const clinicTimeZone = params.clinicTimeZone;
  const raw = params.rawUserInput || `${params.localDate || ""} ${params.localTime || ""}`;

  if (!clinicTimeZone || !isValidIanaTimeZone(clinicTimeZone)) {
    return {
      ok: false,
      reason: "MISSING_TIMEZONE",
      message: guidanceMessage("MISSING_TIMEZONE", locale),
      suggestions: [],
      clinicTimeZone: clinicTimeZone || "UTC",
      clinicTimeZoneSource: "invalid",
    };
  }

  const date = String(params.localDate || "").trim();
  const timeNorm = ClinicWorkingHoursResolver.normalizeTime(params.localTime || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      ok: false,
      reason: "INVALID_DATE",
      message: guidanceMessage("INVALID_DATE", locale),
      suggestions: suggestNextValidAppointmentTimes({
        now,
        clinicTimeZone,
        workingHours: params.workingHours,
        is24_7: params.is24_7,
        locale,
      }),
      clinicTimeZone,
      clinicTimeZoneSource: "provided",
    };
  }
  if (!timeNorm) {
    return {
      ok: false,
      reason: "INVALID_TIME",
      message: guidanceMessage("INVALID_TIME", locale),
      suggestions: suggestNextValidAppointmentTimes({
        now,
        clinicTimeZone,
        workingHours: params.workingHours,
        is24_7: params.is24_7,
        locale,
      }),
      clinicTimeZone,
      clinicTimeZoneSource: "provided",
    };
  }

  let effectiveDate = date;
  let effectiveTime = timeNorm;
  let sourceTimeZone = params.sourceTimeZone;
  let startsAtUtc =
    clinicLocalDateTimeToUtcIso(effectiveDate, effectiveTime, clinicTimeZone) || "";

  const abbrev = detectTimeZoneAbbreviation(raw);
  if (abbrev.ambiguous) {
    return {
      ok: false,
      reason: "AMBIGUOUS_TIMEZONE",
      message: guidanceMessage("AMBIGUOUS_TIMEZONE", locale),
      suggestions: [],
      requiresTimezoneClarification: true,
      clinicTimeZone,
      clinicTimeZoneSource: "provided",
    };
  }
  if (abbrev.iana && abbrev.iana !== clinicTimeZone) {
    const converted = convertUserWallTimeToClinicLocal({
      localDate: date,
      localTime: timeNorm,
      sourceTimeZone: abbrev.iana,
      clinicTimeZone,
    });
    if (!converted) {
      return {
        ok: false,
        reason: "INVALID_TIME",
        message: guidanceMessage("INVALID_TIME", locale),
        suggestions: [],
        clinicTimeZone,
        clinicTimeZoneSource: "provided",
      };
    }
    effectiveDate = converted.localDate;
    effectiveTime = converted.localTime;
    startsAtUtc = converted.startsAtUtc;
    sourceTimeZone = abbrev.iana;
  } else if (params.sourceTimeZone && params.sourceTimeZone !== clinicTimeZone) {
    const converted = convertUserWallTimeToClinicLocal({
      localDate: date,
      localTime: timeNorm,
      sourceTimeZone: params.sourceTimeZone,
      clinicTimeZone,
    });
    if (converted) {
      effectiveDate = converted.localDate;
      effectiveTime = converted.localTime;
      startsAtUtc = converted.startsAtUtc;
      sourceTimeZone = params.sourceTimeZone;
    }
  }

  if (!startsAtUtc) {
    startsAtUtc = clinicLocalDateTimeToUtcIso(effectiveDate, effectiveTime, clinicTimeZone) || "";
  }

  const clinicNow = getClinicLocalParts(now, clinicTimeZone);
  const suggestions = suggestNextValidAppointmentTimes({
    now,
    clinicTimeZone,
    workingHours: params.workingHours,
    is24_7: params.is24_7,
    locale,
  });

  if (effectiveDate < clinicNow.isoDate) {
    return {
      ok: false,
      reason: "PAST_DATE",
      message: guidanceMessage("PAST_DATE", locale, { suggestions }),
      suggestions,
      clinicTimeZone,
      clinicTimeZoneSource: "provided",
    };
  }

  if (effectiveDate === clinicNow.isoDate && effectiveTime <= clinicNow.hhmm) {
    return {
      ok: false,
      reason: "PAST_TIME",
      message: guidanceMessage("PAST_TIME", locale, { suggestions }),
      suggestions,
      clinicTimeZone,
      clinicTimeZoneSource: "provided",
      resolved: {
        rawUserInput: raw,
        localDate: effectiveDate,
        localTime: effectiveTime,
        clinicTimeZone,
        startsAtUtc,
        sourceTimeZone,
        resolutionSource: params.resolutionSource || "deterministic_parser",
        confidence: params.confidence || "high",
      },
    };
  }

  if (startsAtUtc && new Date(startsAtUtc).getTime() <= now.getTime()) {
    return {
      ok: false,
      reason: "PAST_TIME",
      message: guidanceMessage("PAST_TIME", locale, { suggestions }),
      suggestions,
      clinicTimeZone,
      clinicTimeZoneSource: "provided",
    };
  }

  const minNotice = Math.max(0, params.minimumNoticeMinutes ?? 0);
  if (minNotice > 0 && startsAtUtc) {
    const earliest = now.getTime() + minNotice * 60_000;
    if (new Date(startsAtUtc).getTime() < earliest) {
      return {
        ok: false,
        reason: "MINIMUM_NOTICE",
        message: guidanceMessage("MINIMUM_NOTICE", locale, { suggestions }),
        suggestions,
        clinicTimeZone,
        clinicTimeZoneSource: "provided",
      };
    }
  }

  if (!params.is24_7 && params.workingHours) {
    const hours = ClinicWorkingHoursResolver.validateRequestedTime({
      schedule: params.workingHours,
      is24_7: false,
      requestedDate: effectiveDate,
      requestedTime: effectiveTime,
      clinicLanguage: locale,
    });
    if (!hours.isValid) {
      const reason: AppointmentDateTimeRejectReason =
        hours.reason === "closed" ? "CLOSED_DAY" : "OUTSIDE_WORKING_HOURS";
      return {
        ok: false,
        reason,
        message: guidanceMessage(reason, locale, {
          suggestions,
          scheduleSummary: hours.scheduleSummary,
        }),
        suggestions,
        clinicTimeZone,
        clinicTimeZoneSource: "provided",
      };
    }
  }

  const resolved: ResolvedAppointmentDateTime = {
    rawUserInput: raw,
    localDate: effectiveDate,
    localTime: effectiveTime,
    clinicTimeZone,
    startsAtUtc,
    sourceTimeZone,
    resolutionSource: params.resolutionSource || "deterministic_parser",
    confidence: params.confidence || "high",
  };

  return {
    ok: true,
    resolved,
    message: "",
    suggestions: [],
    clinicTimeZone,
    clinicTimeZoneSource: "provided",
  };
}

/**
 * Inspect raw user text for timezone abbreviation ambiguity before persistence.
 */
export function evaluateRawAppointmentTimeZoneAmbiguity(
  rawUserInput: string,
  locale = "tr"
): AppointmentDateTimeValidationResult | null {
  const abbrev = detectTimeZoneAbbreviation(rawUserInput);
  if (!abbrev.abbrev) return null;
  if (abbrev.ambiguous || !abbrev.iana) {
    return {
      ok: false,
      reason: "AMBIGUOUS_TIMEZONE",
      message: guidanceMessage("AMBIGUOUS_TIMEZONE", locale),
      suggestions: [],
      requiresTimezoneClarification: true,
      clinicTimeZone: "Europe/Istanbul",
      clinicTimeZoneSource: "pending_clarification",
    };
  }
  return null;
}
