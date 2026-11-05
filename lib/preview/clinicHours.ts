export interface ClinicDayHours {
  start: number;
  end: number;
}

/** Weekday index matches JavaScript: Sunday is 0. */
export type ClinicWeek = Partial<Record<0 | 1 | 2 | 3 | 4 | 5 | 6, ClinicDayHours>>;

const DAY_WORDS: Record<string, 0 | 1 | 2 | 3 | 4 | 5 | 6> = {
  pazar: 0,
  sunday: 0,
  pazartesi: 1,
  monday: 1,
  sali: 2,
  salı: 2,
  tuesday: 2,
  carsamba: 3,
  çarşamba: 3,
  wednesday: 3,
  persembe: 4,
  perşembe: 4,
  thursday: 4,
  cuma: 5,
  friday: 5,
  cumartesi: 6,
  saturday: 6,
};

function foldDay(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR");
}

export function istanbulClock(date: Date): { weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const index = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[weekday || ""] ?? 0;
  return { weekday: index as 0 | 1 | 2 | 3 | 4 | 5 | 6, minutes: hour * 60 + minute };
}

export function isOutsideClinicHours(date: Date, week: ClinicWeek | null): boolean {
  if (!week) return false;
  const clock = istanbulClock(date);
  const day = week[clock.weekday];
  if (!day) return true;
  return clock.minutes < day.start || clock.minutes >= day.end;
}

function daysMentioned(chunk: string): Array<0 | 1 | 2 | 3 | 4 | 5 | 6> {
  const keys = Object.keys(DAY_WORDS).sort((left, right) => right.length - left.length);
  let masked = foldDay(chunk);
  const found: { index: number; day: 0 | 1 | 2 | 3 | 4 | 5 | 6 }[] = [];
  for (const key of keys) {
    const index = masked.indexOf(key);
    if (index === -1) continue;
    found.push({ index, day: DAY_WORDS[key] });
    masked = `${masked.slice(0, index)}${" ".repeat(key.length)}${masked.slice(index + key.length)}`;
  }
  return found.sort((left, right) => left.index - right.index).map((item) => item.day);
}

function minutes(value: string): number | null {
  const match = value.match(/(\d{1,2})[:.](\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** Reads ranges such as "Pazartesi–Cuma 09:00–19:00, Cumartesi 10:00–16:00". */
export function parseClinicHours(text: string | null | undefined): ClinicWeek | null {
  if (!text || !text.trim()) return null;
  const week: ClinicWeek = {};
  const chunks = text.split(/,|;|\n/);
  let found = false;
  for (const chunk of chunks) {
    const range = chunk.match(/(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/);
    if (!range) continue;
    const start = minutes(range[1]);
    const end = minutes(range[2]);
    if (start === null || end === null || end <= start) continue;
    const days = daysMentioned(chunk);
    if (days.length >= 2) {
      const from = days[0];
      const to = days[days.length - 1];
      const step = from <= to ? 1 : -1;
      for (let day = from; day !== to + step; day += step) {
        week[day as 0 | 1 | 2 | 3 | 4 | 5 | 6] = { start, end };
      }
      found = true;
    } else if (days.length === 1) {
      week[days[0]] = { start, end };
      found = true;
    }
  }
  return found ? week : null;
}
