/**
 * Weekly clinic AI usage report — Europe/Istanbul week boundaries.
 *
 * Report week = previous full Mon 00:00:00 → Sun 23:59:59.999 (clinic TZ).
 * Comparison week = the immediately preceding Mon–Sun.
 */

import {
  clinicLocalDateTimeToUtcIso,
  getClinicLocalParts,
} from "@/lib/appointment/appointmentDateTimePolicy";

export const WEEKLY_REPORT_TIMEZONE = "Europe/Istanbul";

export type WeekRange = {
  /** Inclusive start (UTC ISO) */
  startUtcIso: string;
  /** Inclusive end (UTC ISO) */
  endUtcIso: string;
  /** Clinic-local Monday YYYY-MM-DD */
  weekStartDate: string;
  /** Clinic-local Sunday YYYY-MM-DD */
  weekEndDate: string;
  /** Human label e.g. "7–13 Eylül 2026" */
  labelTr: string;
  /** Human label e.g. "7–13 September 2026" */
  labelEn: string;
  /** Subject fragment e.g. "7–13 Eylül 2026" */
  subjectRangeTr: string;
};

const TR_MONTHS = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

const EN_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

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

function addDaysIso(isoDate: string, days: number, timeZone: string): string {
  const baseUtc = clinicLocalDateTimeToUtcIso(isoDate, "12:00", timeZone);
  if (!baseUtc) return isoDate;
  const next = new Date(new Date(baseUtc).getTime() + days * 86400_000);
  return getClinicLocalParts(next, timeZone).isoDate;
}

function formatRangeLabel(weekStart: string, weekEnd: string, lang: "tr" | "en"): string {
  const [ys, ms, ds] = weekStart.split("-").map((x) => parseInt(x, 10));
  const [ye, me, de] = weekEnd.split("-").map((x) => parseInt(x, 10));
  const months = lang === "tr" ? TR_MONTHS : EN_MONTHS;
  if (ys === ye && ms === me) {
    return lang === "tr"
      ? `${ds}–${de} ${months[ms - 1]} ${ys}`
      : `${ds}–${de} ${months[ms - 1]} ${ys}`;
  }
  if (ys === ye) {
    return lang === "tr"
      ? `${ds} ${months[ms - 1]} – ${de} ${months[me - 1]} ${ys}`
      : `${ds} ${months[ms - 1]} – ${de} ${months[me - 1]} ${ys}`;
  }
  return lang === "tr"
    ? `${ds} ${months[ms - 1]} ${ys} – ${de} ${months[me - 1]} ${ye}`
    : `${ds} ${months[ms - 1]} ${ys} – ${de} ${months[me - 1]} ${ye}`;
}

/**
 * Given an arbitrary "now", resolve the Monday–Sunday that fully ended before this Monday morning.
 * If `now` is Monday before/during the report run, previous week is last Mon–Sun.
 * If `now` is mid-week, still report the most recently completed Mon–Sun week.
 */
export function resolveCompletedWeekRange(
  now: Date = new Date(),
  timeZone: string = WEEKLY_REPORT_TIMEZONE
): WeekRange {
  const local = getClinicLocalParts(now, timeZone);
  const todayWd = weekdayIndexFromIsoDate(local.isoDate, timeZone); // 0=Sun … 1=Mon

  // Days since last Monday (if today is Monday, last completed week ended yesterday = Sunday)
  // Completed week end = most recent Sunday that is strictly before "today" if today is Mon–Sun
  // Simpler: find this week's Monday, then previous week is Monday-7 … Sunday-1 relative to this Monday.
  const daysSinceMonday = (todayWd + 6) % 7; // Mon=0, Tue=1, … Sun=6
  const thisWeekMonday = addDaysIso(local.isoDate, -daysSinceMonday, timeZone);
  const reportWeekStart = addDaysIso(thisWeekMonday, -7, timeZone);
  const reportWeekEnd = addDaysIso(reportWeekStart, 6, timeZone);

  return buildWeekRange(reportWeekStart, reportWeekEnd, timeZone);
}

export function resolveComparisonWeekRange(current: WeekRange, timeZone: string = WEEKLY_REPORT_TIMEZONE): WeekRange {
  const prevStart = addDaysIso(current.weekStartDate, -7, timeZone);
  const prevEnd = addDaysIso(current.weekEndDate, -7, timeZone);
  return buildWeekRange(prevStart, prevEnd, timeZone);
}

/**
 * Build a week range from explicit clinic-local YYYY-MM-DD Monday and Sunday.
 */
export function buildWeekRange(
  weekStartDate: string,
  weekEndDate: string,
  timeZone: string = WEEKLY_REPORT_TIMEZONE
): WeekRange {
  const startUtcIso = clinicLocalDateTimeToUtcIso(weekStartDate, "00:00", timeZone);
  const endUtcIso = clinicLocalDateTimeToUtcIso(weekEndDate, "23:59", timeZone);
  if (!startUtcIso || !endUtcIso) {
    throw new Error(`Invalid week range: ${weekStartDate} → ${weekEndDate}`);
  }
  // Make end inclusive through the last second of the minute: 23:59:59.999
  const endMs = new Date(endUtcIso).getTime() + 59_000 + 999;
  const endInclusive = new Date(endMs).toISOString();

  const labelTr = formatRangeLabel(weekStartDate, weekEndDate, "tr");
  const labelEn = formatRangeLabel(weekStartDate, weekEndDate, "en");

  return {
    startUtcIso,
    endUtcIso: endInclusive,
    weekStartDate,
    weekEndDate,
    labelTr,
    labelEn,
    subjectRangeTr: labelTr,
  };
}

/**
 * Idempotency key fragment: YYYY-MM-DD of the report week's Monday.
 */
export function weeklyReportIdempotencyKey(clinicId: string, weekStartDate: string): string {
  return `weekly-report:${clinicId}:${weekStartDate}`;
}

export function parseLogCreatedAt(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value === "object" && value !== null && "toDate" in value && typeof (value as any).toDate === "function") {
    try {
      return (value as any).toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && value !== null && "_seconds" in value) {
    return new Date((value as any)._seconds * 1000).toISOString();
  }
  return null;
}

export function isCreatedAtInRange(
  createdAt: unknown,
  range: Pick<WeekRange, "startUtcIso" | "endUtcIso">
): boolean {
  const iso = parseLogCreatedAt(createdAt);
  if (!iso) return false;
  return iso >= range.startUtcIso && iso <= range.endUtcIso;
}
