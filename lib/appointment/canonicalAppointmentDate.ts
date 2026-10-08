/**
 * Canonical appointment civil-date resolution.
 *
 * Single source of truth for:
 * - yearless month/day → next future clinic-local occurrence
 * - explicit year (never rewritten)
 * - month-only pending context (no fabricated day)
 * - calendar validity (no JS Date rollover)
 *
 * Relative phrases (today / tomorrow / weekday) stay in resolveWeekdayDate / SlotExtractor.
 * Past/future and working-hours policy remain in appointmentDateTimePolicy.
 */

import { getClinicLocalParts } from "@/lib/appointment/appointmentDateTimePolicy";

export type PendingAppointmentDate = {
  /** 1–12 */
  month: number;
  year: number;
  yearExplicit: boolean;
  /**
   * Bare day numerals ("5", "5th") may complete this pending month ONLY when true.
   * Existence of pending alone is never sufficient.
   * Set true when month context is created/refreshed or day collection is explicitly resumed.
   * Set false after non-date / topic-interrupting turns.
   */
  awaitingDayReply: boolean;
};

/** Whether a bare day-of-month message may complete pending month context. */
export function isPendingDayCompletionEligible(params: {
  pending?: PendingAppointmentDate | null;
  expectedSlot?: string | null;
  /** True when a complete preferredDate/requestedDate already exists */
  hasResolvedDate?: boolean;
}): boolean {
  const pending = params.pending;
  if (!pending) return false;
  if (pending.awaitingDayReply !== true) return false;
  if (params.hasResolvedDate) return false;
  // Must be actively collecting the appointment date (not time/name/phone/etc.)
  if (params.expectedSlot !== "preferredDate") return false;
  return true;
}

export function markPendingDayIneligible(
  pending: PendingAppointmentDate
): PendingAppointmentDate {
  return { ...pending, awaitingDayReply: false };
}

export function markPendingDayEligible(
  pending: PendingAppointmentDate
): PendingAppointmentDate {
  return { ...pending, awaitingDayReply: true };
}

export function withPendingDayEligibility(
  pending: Omit<PendingAppointmentDate, "awaitingDayReply"> & {
    awaitingDayReply?: boolean;
  },
  awaitingDayReply: boolean
): PendingAppointmentDate {
  return {
    month: pending.month,
    year: pending.year,
    yearExplicit: pending.yearExplicit,
    awaitingDayReply,
  };
}

export type CanonicalAppointmentDateResult =
  | {
      status: "complete";
      isoDate: string;
      yearExplicit: boolean;
      month: number;
      day: number;
      year: number;
    }
  | {
      status: "partial_month";
      pending: PendingAppointmentDate;
    }
  | {
      status: "invalid_calendar";
      reason: "INVALID_DATE";
      month?: number;
      day?: number;
      year?: number;
    };

export type ResolveCivilAppointmentDateParams = {
  /** 1–12 */
  month: number;
  /** 1–31 when known; omit/null for month-only */
  day?: number | null;
  /** Explicit calendar year when the patient stated one */
  year?: number | null;
  /** True only when the patient supplied the year in text */
  yearExplicit?: boolean;
  clinicTimeZone: string;
  now?: Date;
};

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Deterministic civil calendar check — never uses JS Date rollover. */
export function isValidCivilDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return false;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(day) || day < 1) return false;
  const maxDay = month === 2 ? (isLeapYear(year) ? 29 : 28) : DAYS_IN_MONTH[month - 1];
  return day <= maxDay;
}

export function formatCivilIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Resolve year for a yearless month (and optional day) using clinic-local today.
 * Comparison is DATE-only (ISO YYYY-MM-DD strings), never wall-clock time.
 */
export function resolveYearlessOccurrence(params: {
  month: number;
  day: number | null;
  clinicTodayIso: string;
}): { year: number } {
  const todayYear = parseInt(params.clinicTodayIso.slice(0, 4), 10);
  const dayForCompare = params.day ?? 1;

  // For month-only, compare on the first of the month: if that month has fully
  // started relative to today (today's month > target, or same month), bump year
  // when the civil month is already in the past.
  if (params.day == null) {
    const todayMonth = parseInt(params.clinicTodayIso.slice(5, 7), 10);
    if (params.month > todayMonth) {
      return { year: todayYear };
    }
    if (params.month < todayMonth) {
      return { year: todayYear + 1 };
    }
    // Same month, day unknown — still this year's month (days remaining)
    return { year: todayYear };
  }

  const candidate = formatCivilIso(todayYear, params.month, dayForCompare);
  if (candidate < params.clinicTodayIso) {
    return { year: todayYear + 1 };
  }
  return { year: todayYear };
}

/**
 * Canonical civil appointment date resolution.
 * Does not run past/hours policy — callers validate after receiving a complete ISO.
 */
export function canonicalResolveAppointmentDate(
  params: ResolveCivilAppointmentDateParams
): CanonicalAppointmentDateResult {
  const now = params.now ?? new Date();
  const clinicTodayIso = getClinicLocalParts(now, params.clinicTimeZone).isoDate;
  const month = params.month;
  const day = params.day == null ? null : params.day;
  const yearExplicit = Boolean(params.yearExplicit && params.year != null);

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { status: "invalid_calendar", reason: "INVALID_DATE", month, day: day ?? undefined };
  }

  let year: number;
  if (yearExplicit && params.year != null) {
    year = params.year;
  } else {
    year = resolveYearlessOccurrence({
      month,
      day,
      clinicTodayIso,
    }).year;
  }

  if (day == null) {
    return {
      status: "partial_month",
      pending: {
        month,
        year,
        yearExplicit,
        awaitingDayReply: true,
      },
    };
  }

  if (!isValidCivilDate(year, month, day)) {
    return {
      status: "invalid_calendar",
      reason: "INVALID_DATE",
      year,
      month,
      day,
    };
  }

  return {
    status: "complete",
    isoDate: formatCivilIso(year, month, day),
    yearExplicit,
    year,
    month,
    day,
  };
}

/**
 * Compose a day onto pending month/year context.
 * When the year was inferred (not explicit), re-apply next-future-occurrence
 * so "September" + "20" on 2026-09-24 → 2027-09-20 (same as yearless "September 20").
 */
export function composeDayWithPendingAppointmentDate(params: {
  day: number;
  pending: PendingAppointmentDate;
  clinicTimeZone: string;
  now?: Date;
}): CanonicalAppointmentDateResult {
  const { day, pending } = params;
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return {
      status: "invalid_calendar",
      reason: "INVALID_DATE",
      day,
      month: pending.month,
      year: pending.year,
    };
  }

  if (pending.yearExplicit) {
    if (!isValidCivilDate(pending.year, pending.month, day)) {
      return {
        status: "invalid_calendar",
        reason: "INVALID_DATE",
        year: pending.year,
        month: pending.month,
        day,
      };
    }
    return {
      status: "complete",
      isoDate: formatCivilIso(pending.year, pending.month, day),
      yearExplicit: true,
      year: pending.year,
      month: pending.month,
      day,
    };
  }

  return canonicalResolveAppointmentDate({
    month: pending.month,
    day,
    year: null,
    yearExplicit: false,
    clinicTimeZone: params.clinicTimeZone,
    now: params.now,
  });
}

/** True when the message is only a day-of-month numeral (optionally with ordinal). */
export function isBareDayOfMonthMessage(raw: string): number | null {
  const m = String(raw || "")
    .trim()
    .match(/^(\d{1,2})(?:st|nd|rd|th)?\.?$/i);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  if (day < 1 || day > 31) return null;
  return day;
}
