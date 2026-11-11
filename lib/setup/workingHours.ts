export type WeekdayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type DayHours = {
  open: boolean;
  start: string;
  end: string;
};

export type WeeklyHoursState = Record<WeekdayKey, DayHours>;

export type WorkingHoursParseResult =
  | { ok: true; state: WeeklyHoursState; source: "empty" | "structured" | "legacy" }
  | { ok: false; raw: string };

export const WEEKDAY_ORDER: WeekdayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export const WEEKDAY_LABELS_TR: Record<WeekdayKey, string> = {
  monday: "Pazartesi",
  tuesday: "Salı",
  wednesday: "Çarşamba",
  thursday: "Perşembe",
  friday: "Cuma",
  saturday: "Cumartesi",
  sunday: "Pazar",
};

const LABEL_TO_KEY: Record<string, WeekdayKey> = Object.fromEntries(
  Object.entries(WEEKDAY_LABELS_TR).map(([key, label]) => [label.toLowerCase(), key as WeekdayKey])
) as Record<string, WeekdayKey>;

const DEFAULT_OPEN: DayHours = { open: true, start: "09:00", end: "18:00" };
const DEFAULT_CLOSED: DayHours = { open: false, start: "09:00", end: "18:00" };

const TIME_RE = /(\d{1,2})(?::(\d{2}))?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?/;

export function defaultWeeklyHours(): WeeklyHoursState {
  return {
    monday: { ...DEFAULT_OPEN },
    tuesday: { ...DEFAULT_OPEN },
    wednesday: { ...DEFAULT_OPEN },
    thursday: { ...DEFAULT_OPEN },
    friday: { ...DEFAULT_OPEN },
    saturday: { ...DEFAULT_CLOSED },
    sunday: { ...DEFAULT_CLOSED },
  };
}

/** Serialize weekday picker state into the free-text format the assistant already consumes. */
export function serializeWorkingHours(state: WeeklyHoursState): string {
  return WEEKDAY_ORDER.map((key) => {
    const day = state[key];
    const label = WEEKDAY_LABELS_TR[key];
    if (!day.open) return `${label}: Kapalı`;
    return `${label}: ${day.start}-${day.end}`;
  }).join("\n");
}

/**
 * Migrates clinic working-hours text into the picker.
 * - empty → default picker (new clinics)
 * - structured / recognizable free text → parsed picker
 * - unrecognized free text → ok:false; caller must keep raw read-only and must not overwrite until the user confirms/saves
 */
export function tryParseWorkingHours(raw: string): WorkingHoursParseResult {
  const text = raw.trim();
  if (!text) return { ok: true, state: defaultWeeklyHours(), source: "empty" };

  const structured = tryParseStructuredDays(text);
  if (structured) return { ok: true, state: structured, source: "structured" };

  const shortcut = tryParseShortcut(text);
  if (shortcut) return { ok: true, state: shortcut, source: "legacy" };

  return { ok: false, raw: text };
}

/** @deprecated Prefer tryParseWorkingHours for migration-safe loading. */
export function parseWorkingHours(raw: string): WeeklyHoursState {
  const result = tryParseWorkingHours(raw);
  return result.ok ? result.state : defaultWeeklyHours();
}

export function applyWeekdaysFromMonday(state: WeeklyHoursState): WeeklyHoursState {
  const source = state.monday;
  const next = { ...state };
  for (const key of ["tuesday", "wednesday", "thursday", "friday"] as WeekdayKey[]) {
    next[key] = { ...source };
  }
  return next;
}

function tryParseStructuredDays(text: string): WeeklyHoursState | null {
  const base = defaultWeeklyHours();
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  let matchedDay = false;

  for (const line of lines) {
    const dayMatch = line.match(/^(Pazartesi|Salı|Çarşamba|Perşembe|Cuma|Cumartesi|Pazar)\s*[:\-–]\s*(.+)$/i);
    if (!dayMatch) continue;
    const key = LABEL_TO_KEY[dayMatch[1].toLowerCase()];
    if (!key) continue;
    matchedDay = true;
    const value = dayMatch[2].trim();
    if (/kapalı|closed|kapali/i.test(value)) {
      base[key] = { ...DEFAULT_CLOSED };
      continue;
    }
    const range = parseTimeRange(value);
    if (range) base[key] = { open: true, start: range.start, end: range.end };
  }

  return matchedDay ? base : null;
}

/**
 * Handles common free-text patterns clinics already typed, e.g.
 * "Hafta içi : 10 - 18 arası\nhafta sonu : sadece cumartesi 10 - 17"
 */
function tryParseShortcut(text: string): WeeklyHoursState | null {
  const lower = text.toLowerCase();
  const hasWeekday = /hafta\s*i[cç]i|pzt|weekdays?|mon.?fri/i.test(lower);
  const hasWeekend = /hafta\s*sonu|weekend|cumartesi|pazar|saturday|sunday/i.test(lower);

  if (hasWeekday || hasWeekend) {
    const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const base = defaultWeeklyHours();
    let touched = false;

    for (const line of lines) {
      const lineLower = line.toLowerCase();
      const range = parseTimeRange(line);
      if (!range) continue;

      if (/hafta\s*i[cç]i|pzt|weekdays?|mon.?fri/i.test(lineLower)) {
        for (const key of ["monday", "tuesday", "wednesday", "thursday", "friday"] as WeekdayKey[]) {
          base[key] = { open: true, start: range.start, end: range.end };
        }
        touched = true;
        continue;
      }

      if (/hafta\s*sonu|weekend/i.test(lineLower)) {
        const onlySaturday = /sadece\s+cumartesi|only\s+saturday/i.test(lineLower);
        const onlySunday = /sadece\s+pazar|only\s+sunday/i.test(lineLower);
        if (onlySaturday) {
          base.saturday = { open: true, start: range.start, end: range.end };
          base.sunday = { ...DEFAULT_CLOSED };
        } else if (onlySunday) {
          base.sunday = { open: true, start: range.start, end: range.end };
          base.saturday = { ...DEFAULT_CLOSED };
        } else {
          base.saturday = { open: true, start: range.start, end: range.end };
          base.sunday = { open: true, start: range.start, end: range.end };
        }
        touched = true;
        continue;
      }

      if (/cumartesi|saturday/i.test(lineLower)) {
        base.saturday = { open: true, start: range.start, end: range.end };
        touched = true;
      }
      if (/pazar|sunday/i.test(lineLower)) {
        base.sunday = { open: true, start: range.start, end: range.end };
        touched = true;
      }
    }

    if (touched) {
      // If weekend wasn't mentioned, keep weekends closed.
      if (hasWeekday && !hasWeekend) {
        base.saturday = { ...DEFAULT_CLOSED };
        base.sunday = { ...DEFAULT_CLOSED };
      }
      return base;
    }
  }

  const single = parseTimeRange(text);
  if (single && /^(?:[~≈]?\s*)?\d{1,2}/.test(text) && text.length < 40) {
    const base = defaultWeeklyHours();
    for (const key of ["monday", "tuesday", "wednesday", "thursday", "friday"] as WeekdayKey[]) {
      base[key] = { open: true, start: single.start, end: single.end };
    }
    base.saturday = { ...DEFAULT_CLOSED };
    base.sunday = { ...DEFAULT_CLOSED };
    return base;
  }

  return null;
}

function parseTimeRange(value: string): { start: string; end: string } | null {
  const match = value.match(TIME_RE);
  if (!match) return null;
  const start = normalizeTimeParts(match[1], match[2]);
  const end = normalizeTimeParts(match[3], match[4]);
  if (!start || !end) return null;
  return { start, end };
}

function normalizeTimeParts(hourRaw: string, minuteRaw?: string): string | null {
  const hour = Number(hourRaw);
  const minute = minuteRaw == null || minuteRaw === "" ? 0 : Number(minuteRaw);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
