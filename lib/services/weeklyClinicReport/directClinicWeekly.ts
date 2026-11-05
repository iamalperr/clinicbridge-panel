import type { WeekRange } from "./weekRange";
import { isCreatedAtInRange } from "./weekRange";
import { ISTANBUL_DIS_AKADEMISI_CLINIC_ID } from "./weeklyClinicReportConfig";

export type HoursWindow = {
  days: number[];
  start: number;
  end: number;
};

export type DirectWeeklyStats = {
  patients: number;
  outsideHours: number | null;
  forwardedAppointments: number;
};

const DAY_INDEX: Record<string, number> = {
  pazartesi: 1,
  pzt: 1,
  monday: 1,
  mon: 1,
  sali: 2,
  tuesday: 2,
  tue: 2,
  carsamba: 3,
  wednesday: 3,
  wed: 3,
  persembe: 4,
  thursday: 4,
  thu: 4,
  cumartesi: 6,
  cmt: 6,
  saturday: 6,
  sat: 6,
  cuma: 5,
  friday: 5,
  fri: 5,
  pazar: 0,
  sunday: 0,
  sun: 0,
  paz: 0,
};

const DAY_TOKEN = Object.keys(DAY_INDEX).sort((a, b) => b.length - a.length).join("|");

export function parseWorkingHours(raw: string): HoursWindow[] | null {
  const folded = foldHours(raw);
  if (!folded) return null;
  const windows: HoursWindow[] = [];
  for (const segment of folded.split(/\n|;/)) {
    const times = [...segment.matchAll(/(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})/g)];
    const days = daysInSegment(segment);
    for (const time of times) {
      const start = toMinutes(Number(time[1]), Number(time[2]));
      const end = toMinutes(Number(time[3]), Number(time[4]));
      if (start === null || end === null || start === end) continue;
      windows.push({ days: days.length ? days : [0, 1, 2, 3, 4, 5, 6], start, end });
    }
  }
  return windows.length ? windows : null;
}

export function istanbulClock(iso: string): { day: number; minutes: number } | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value || "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const day = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[weekday];
  if (day === undefined || Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return { day, minutes: (hour % 24) * 60 + minute };
}

export function isOutsideWorkingHours(iso: string, windows: HoursWindow[] | null): boolean | null {
  if (!windows) return null;
  const clock = istanbulClock(iso);
  if (!clock) return null;
  const inside = windows.some((window) => windowCovers(window, clock.day, clock.minutes));
  return !inside;
}

export function isForwardedAppointmentRequest(log: Record<string, unknown>): boolean {
  const contactId = typeof log.contactRequestId === "string" ? log.contactRequestId.trim() : "";
  if (contactId) return true;
  if (log.convertedToAppointment === true) return true;
  const appointmentId = typeof log.appointmentId === "string" ? log.appointmentId.trim() : "";
  if (appointmentId) return true;
  return log.appointmentStatus === "created";
}

export function computeDirectWeeklyStats(
  logs: Array<Record<string, unknown>>,
  workingHours: string,
  range?: WeekRange
): DirectWeeklyStats {
  const windows = parseWorkingHours(workingHours);
  const weekLogs = range ? logs.filter((log) => isCreatedAtInRange(log.createdAt, range)) : logs;
  let outsideHours = windows ? 0 : null;
  let forwardedAppointments = 0;
  for (const log of weekLogs) {
    const created = typeof log.createdAt === "string" ? log.createdAt : "";
    const outside = isOutsideWorkingHours(created, windows);
    if (outsideHours !== null && outside) outsideHours += 1;
    if (isForwardedAppointmentRequest(log)) forwardedAppointments += 1;
  }
  return { patients: weekLogs.length, outsideHours, forwardedAppointments };
}

export function directWeeklyRecipient(input: {
  clinicId: string;
  acquisition?: unknown;
  email?: unknown;
  emailVerified?: boolean;
  claimClinicId?: unknown;
}): string | null {
  if (input.clinicId === ISTANBUL_DIS_AKADEMISI_CLINIC_ID) return null;
  if (input.acquisition !== "direct") return null;
  if (input.emailVerified !== true) return null;
  if (input.claimClinicId !== input.clinicId) return null;
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function buildDirectWeeklyEmail(input: {
  language: "tr" | "en";
  clinicName: string;
  periodLabel: string;
  stats: DirectWeeklyStats;
}): { subject: string; html: string } {
  const clinic = escapeHtml(input.clinicName);
  const period = escapeHtml(input.periodLabel);
  const { patients, outsideHours, forwardedAppointments } = input.stats;
  if (input.language === "en") {
    const outside = outsideHours === null
      ? "Business hours could not be read, so after-hours messages were not counted."
      : `${outsideHours} of them wrote outside the hours you entered.`;
    return {
      subject: `${input.clinicName} | Last week's patient summary | ${input.periodLabel}`,
      html: `<p><strong>${clinic}</strong> · ${period}</p><p>${patients} patients wrote last week. ${escapeHtml(outside)} ${forwardedAppointments} appointment requests were forwarded to the clinic.</p>`,
    };
  }
  const outside = outsideHours === null
    ? "Çalışma saatleri okunamadığı için saat dışı yazanlar sayılmadı."
    : `Bunların ${outsideHours} tanesi girdiğiniz çalışma saatleri dışında yazdı.`;
  return {
    subject: `${input.clinicName} | Geçen haftanın hasta özeti | ${input.periodLabel}`,
    html: `<p><strong>${clinic}</strong> · ${period}</p><p>Geçen hafta ${patients} hasta yazdı. ${escapeHtml(outside)} ${forwardedAppointments} randevu talebi kliniğe iletildi.</p>`,
  };
}

function foldHours(value: string): string {
  return value
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .trim();
}

function toMinutes(hour: number, minute: number): number | null {
  if (hour > 23 || minute > 59 || hour < 0 || minute < 0) return null;
  return hour * 60 + minute;
}

function daysInSegment(segment: string): number[] {
  const days = new Set<number>();
  const span = new RegExp(String.raw`\b(${DAY_TOKEN})\b\s*[-–—]\s*\b(${DAY_TOKEN})\b`, "g");
  const withoutSpans = segment.replace(span, (_full, from: string, to: string) => {
    addDaySpan(days, DAY_INDEX[from], DAY_INDEX[to]);
    return " ";
  });
  const single = new RegExp(String.raw`\b(${DAY_TOKEN})\b`, "g");
  withoutSpans.replace(single, (_full, token: string) => {
    days.add(DAY_INDEX[token]);
    return " ";
  });
  return [...days].sort((a, b) => a - b);
}

function addDaySpan(days: Set<number>, from: number, to: number): void {
  let day = from;
  for (let step = 0; step < 7; step += 1) {
    days.add(day);
    if (day === to) return;
    day = (day + 1) % 7;
  }
}

function windowCovers(window: HoursWindow, day: number, minutes: number): boolean {
  if (!window.days.includes(day)) return false;
  if (window.end > window.start) return minutes >= window.start && minutes < window.end;
  return minutes >= window.start || minutes < window.end;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function runDirectClinicWeeklyReports(params?: {
  mode?: "send" | "preview" | "dry_run";
  weekStartDate?: string;
  weekEndDate?: string;
  now?: Date;
  clinicId?: string;
}): Promise<import("./sendWeeklyClinicReport").WeeklyReportRunResult[]> {
  const { getAdminDb } = await import("@/lib/firebase-admin");
  const { ResendEmailProvider } = await import("@/lib/services/notifications/providers/ResendEmailProvider");
  const {
    attachWeekOverWeekDeltas,
    computeWeeklyMetricsFromLogs,
  } = await import("./computeWeeklyClinicMetrics");
  const {
    loadConversationLogsForRange,
    markReportStatus,
    wasAlreadySent,
  } = await import("./sendWeeklyClinicReport");
  const {
    buildWeekRange,
    resolveComparisonWeekRange,
    resolveCompletedWeekRange,
    weeklyReportIdempotencyKey,
  } = await import("./weekRange");

  const db = getAdminDb();
  if (!db) return [];
  if (params?.clinicId === ISTANBUL_DIS_AKADEMISI_CLINIC_ID) return [];

  const snaps = params?.clinicId
    ? [await db.collection("clinics").doc(params.clinicId).get()].filter((snap) => snap.exists)
    : (await db.collection("clinics").where("acquisition", "==", "direct").get()).docs;

  const mode = params?.mode || "send";
  const period = params?.weekStartDate && params?.weekEndDate
    ? buildWeekRange(params.weekStartDate, params.weekEndDate)
    : resolveCompletedWeekRange(params?.now ?? new Date());
  const previousPeriod = resolveComparisonWeekRange(period);
  const results: import("./sendWeeklyClinicReport").WeeklyReportRunResult[] = [];

  for (const snap of snaps) {
    const data = snap.data() || {};
    if (snap.id === ISTANBUL_DIS_AKADEMISI_CLINIC_ID || data.acquisition !== "direct") continue;
    const clinicName = typeof data.name === "string" ? data.name : "Klinik";
    const language = data.language === "en" ? "en" : "tr";
    const idempotencyKey = weeklyReportIdempotencyKey(snap.id, period.weekStartDate);
    try {
      const logs = await loadConversationLogsForRange(snap.id, period);
      const stats = computeDirectWeeklyStats(
        logs,
        typeof data.workingHours === "string" ? data.workingHours : "",
        period
      );
      const metrics = attachWeekOverWeekDeltas(
        computeWeeklyMetricsFromLogs(logs),
        computeWeeklyMetricsFromLogs([])
      );
      const email = buildDirectWeeklyEmail({
        language,
        clinicName,
        periodLabel: language === "en" ? period.labelEn : period.subjectRangeTr,
        stats,
      });
      const recipient = await verifiedClinicRecipient(snap.id, data.email);
      const base = {
        clinicId: snap.id,
        clinicName,
        mode,
        period,
        previousPeriod,
        metrics,
        summaryTr: email.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
        subject: email.subject,
        recipients: recipient ? [recipient] : [],
        idempotencyKey,
        directStats: stats,
      };

      if (mode !== "send") {
        await markReportStatus({
          clinicId: snap.id,
          clinicName,
          period,
          recipients: base.recipients,
          deliveryStatus: mode === "preview" ? "preview" : "dry_run",
          metrics,
          idempotencyKey,
          directStats: stats,
        });
        results.push({ ...base, html: mode === "preview" ? email.html : undefined, skippedDuplicate: false, emailSent: false });
        continue;
      }

      if (!recipient) {
        results.push({ ...base, skippedDuplicate: false, emailSent: false });
        continue;
      }
      if (await wasAlreadySent(snap.id, period.weekStartDate)) {
        results.push({ ...base, skippedDuplicate: true, emailSent: false });
        continue;
      }

      const provider = new ResendEmailProvider();
      const sent = await provider.send({
        to: recipient,
        subject: email.subject,
        language,
        templateId: "weekly_direct_clinic_report",
        variables: {
          htmlContent: email.html,
          from: process.env.EMAIL_FROM || "ClinicBridge <no-reply@clinicbridge-ai.com>",
        },
        idempotencyKey: `${idempotencyKey}:${recipient}`,
      });
      if (!sent.success) throw new Error(sent.errorMessage || "EMAIL_SEND_FAILED");
      await markReportStatus({
        clinicId: snap.id,
        clinicName,
        period,
        recipients: [recipient],
        deliveryStatus: "sent",
        metrics,
        providerMessageIds: sent.messageId ? [sent.messageId] : [],
        idempotencyKey,
        directStats: stats,
      });
      results.push({ ...base, skippedDuplicate: false, emailSent: true, providerMessageIds: sent.messageId ? [sent.messageId] : [] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        clinicId: snap.id,
        clinicName,
        mode,
        period,
        previousPeriod,
        metrics: attachWeekOverWeekDeltas(computeWeeklyMetricsFromLogs([]), computeWeeklyMetricsFromLogs([])),
        summaryTr: "",
        subject: "",
        recipients: [],
        skippedDuplicate: false,
        emailSent: false,
        error: message,
        idempotencyKey,
      });
    }
  }
  return results;
}

async function verifiedClinicRecipient(clinicId: string, email: unknown): Promise<string | null> {
  const candidate = typeof email === "string" ? email.trim().toLowerCase() : "";
  const { getAdminAuth, getAdminDb } = await import("@/lib/firebase-admin");
  const adminAuth = getAdminAuth();
  const db = getAdminDb();
  if (!adminAuth || !db || !candidate) return null;
  try {
    const user = await adminAuth.getUserByEmail(candidate);
    const claimClinicId = user.customClaims && typeof user.customClaims.clinicId === "string"
      ? user.customClaims.clinicId
      : undefined;
    let includedClinicId = claimClinicId;
    if (includedClinicId !== clinicId) {
      const profile = await db.collection("users").doc(user.uid).get();
      const profileClinicId = profile.data()?.clinicId;
      if (typeof profileClinicId === "string") includedClinicId = profileClinicId;
    }
    return directWeeklyRecipient({
      clinicId,
      acquisition: "direct",
      email: candidate,
      emailVerified: user.emailVerified === true,
      claimClinicId: includedClinicId,
    });
  } catch {
    return null;
  }
}

