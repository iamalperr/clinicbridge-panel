/**
 * Weekly clinic AI usage report — date ranges, metrics, email recipients, idempotency.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildWeekRange,
  resolveCompletedWeekRange,
  resolveComparisonWeekRange,
  weeklyReportIdempotencyKey,
  isCreatedAtInRange,
  WEEKLY_REPORT_TIMEZONE,
} from "../lib/services/weeklyClinicReport/weekRange";
import {
  computeWeeklyMetricsFromLogs,
  attachWeekOverWeekDeltas,
  computeMetricDelta,
  buildWeeklySummaryTr,
} from "../lib/services/weeklyClinicReport/computeWeeklyClinicMetrics";
import { buildWeeklyReportHtml, buildWeeklyReportSubject } from "../lib/services/weeklyClinicReport/buildWeeklyReportEmail";
import {
  assertInternalOnlyRecipients,
  ISTANBUL_DIS_AKADEMISI_CLINIC_ID,
  WEEKLY_CLINIC_REPORT_TARGETS,
} from "../lib/services/weeklyClinicReport/weeklyClinicReportConfig";
import { computeClinicMetrics } from "../lib/services/clinicMetricsService";

describe("Weekly report week ranges (Europe/Istanbul)", () => {
  it("1. Monday morning resolves previous Mon–Sun", () => {
    // Monday 14 Sep 2026 08:00 Istanbul = 05:00 UTC
    const now = new Date("2026-09-14T05:00:00.000Z");
    const week = resolveCompletedWeekRange(now, WEEKLY_REPORT_TIMEZONE);
    expect(week.weekStartDate).toBe("2026-09-07");
    expect(week.weekEndDate).toBe("2026-09-13");
    expect(week.labelTr).toMatch(/7–13 Eylül 2026/);
  });

  it("2. Comparison week is the prior Mon–Sun", () => {
    const current = buildWeekRange("2026-09-07", "2026-09-13");
    const prev = resolveComparisonWeekRange(current);
    expect(prev.weekStartDate).toBe("2026-08-31");
    expect(prev.weekEndDate).toBe("2026-09-06");
  });

  it("3. Range UTC bounds cover full Istanbul days", () => {
    const week = buildWeekRange("2026-09-07", "2026-09-13");
    // Monday 00:00 Istanbul = Sunday 21:00 UTC
    expect(week.startUtcIso).toBe("2026-09-06T21:00:00.000Z");
    // Sunday 23:59:59.999 Istanbul
    expect(week.endUtcIso >= "2026-09-13T20:59:59.000Z").toBe(true);
    expect(week.endUtcIso <= "2026-09-13T21:00:00.000Z").toBe(true);
  });

  it("filters createdAt into the week correctly", () => {
    const week = buildWeekRange("2026-09-07", "2026-09-13");
    expect(isCreatedAtInRange("2026-09-07T00:30:00.000+03:00", week)).toBe(true);
    expect(isCreatedAtInRange("2026-09-06T20:59:00.000Z", week)).toBe(false);
    expect(isCreatedAtInRange("2026-09-13T23:50:00.000+03:00", week)).toBe(true);
  });
});

describe("Weekly metrics from conversation logs", () => {
  const sampleLogs = [
    {
      createdAt: "2026-09-08T10:00:00.000Z",
      status: "answered",
      language: "tr",
      conversationLocale: "tr",
    },
    {
      createdAt: "2026-09-09T10:00:00.000Z",
      status: "liveSupport",
      language: "en",
      liveSupportRequested: true,
    },
    {
      createdAt: "2026-09-10T10:00:00.000Z",
      status: "unanswered",
      language: "tr",
    },
    {
      createdAt: "2026-09-11T10:00:00.000Z",
      status: "collecting",
      language: "de",
    },
    {
      createdAt: "2026-09-12T10:00:00.000Z",
      status: "appointment",
      convertedToAppointment: true,
      appointmentId: "appt_1",
      language: "tr",
    },
    // Outside week
    {
      createdAt: "2026-09-01T10:00:00.000Z",
      status: "answered",
      language: "tr",
    },
  ];

  const week = buildWeekRange("2026-09-07", "2026-09-13");

  it("3–5. totals, conversion, live support for the week only", () => {
    const m = computeWeeklyMetricsFromLogs(sampleLogs, week);
    expect(m.totalConversations).toBe(5);
    expect(m.liveSupport).toBe(1);
    expect(m.unanswered).toBe(1);
    expect(m.appointmentConversions).toBe(1);
    expect(m.appointmentProcessStarted).toBe(2); // collecting + converted
    expect(m.appointmentConversionRate).toBe(20); // 1/5
  });

  it("6. zero denominators yield null rates", () => {
    const m = computeWeeklyMetricsFromLogs([]);
    expect(m.totalConversations).toBe(0);
    expect(m.appointmentConversionRate).toBeNull();
    expect(m.liveSupportRate).toBeNull();
  });

  it("7. previous-week comparisons avoid Infinity%", () => {
    expect(computeMetricDelta(5, 0)).toEqual({ absolute: 5, percent: null });
    expect(computeMetricDelta(0, 0)).toEqual({ absolute: 0, percent: null });
    expect(computeMetricDelta(23, 20).percent).toBe(15);
  });

  it("8. language aggregation", () => {
    const m = computeWeeklyMetricsFromLogs(sampleLogs, week);
    expect(m.languages.find((l) => l.code === "tr")?.count).toBe(3);
    expect(m.languages.find((l) => l.code === "en")?.count).toBe(1);
    expect(m.languages.find((l) => l.code === "de")?.count).toBe(1);
  });

  it("appointment conversion matches dashboard isConversationConverted definition", () => {
    const weekLogs = sampleLogs.filter((l) => isCreatedAtInRange(l.createdAt, week));
    const weekly = computeWeeklyMetricsFromLogs(weekLogs);
    const dashboard = computeClinicMetrics(weekLogs, []);
    expect(weekly.appointmentConversions).toBe(dashboard.appointments);
    expect(weekly.liveSupport).toBe(dashboard.liveSupport);
    expect(weekly.unanswered).toBe(dashboard.unanswered);
    expect(weekly.totalConversations).toBe(dashboard.totalConversations);
  });

  it("11. zero-activity summary is graceful", () => {
    const metrics = attachWeekOverWeekDeltas(
      computeWeeklyMetricsFromLogs([]),
      computeWeeklyMetricsFromLogs([])
    );
    const summary = buildWeeklySummaryTr({
      clinicName: "İstanbul Diş Akademisi",
      periodLabel: "7–13 Eylül 2026",
      metrics,
    });
    expect(summary).toMatch(/kayıtlı hasta görüşmesi bulunmuyor/i);
    expect(summary).not.toMatch(/Infinity|NaN|%null/i);
  });
});

describe("Email recipients and idempotency", () => {
  it("9. idempotency key format", () => {
    expect(weeklyReportIdempotencyKey("ByTnY4VEmBTJxogqCQ7q", "2026-09-07")).toBe(
      "weekly-report:ByTnY4VEmBTJxogqCQ7q:2026-09-07"
    );
  });

  it("12. email recipients are ONLY info@clinicbridge-ai.com for IDA", () => {
    const ida = WEEKLY_CLINIC_REPORT_TARGETS.find(
      (t) => t.clinicId === ISTANBUL_DIS_AKADEMISI_CLINIC_ID
    );
    expect(ida).toBeTruthy();
    expect(ida!.internalRecipients).toEqual(["info@clinicbridge-ai.com"]);
    expect(assertInternalOnlyRecipients(ida!.internalRecipients)).toBeUndefined();
    expect(() => assertInternalOnlyRecipients(["clinic@example.com"])).toThrow(
      /non-internal recipient/
    );
  });

  it("subject and HTML never include clinic inbox addresses", () => {
    const period = buildWeekRange("2026-09-07", "2026-09-13");
    const previousPeriod = resolveComparisonWeekRange(period);
    const metrics = attachWeekOverWeekDeltas(
      computeWeeklyMetricsFromLogs([
        {
          createdAt: "2026-09-08T10:00:00.000Z",
          status: "answered",
          language: "tr",
        },
      ]),
      computeWeeklyMetricsFromLogs([])
    );
    const summaryTr = buildWeeklySummaryTr({
      clinicName: "İstanbul Diş Akademisi",
      periodLabel: period.labelTr,
      metrics,
    });
    const email = buildWeeklyReportHtml({
      clinicName: "İstanbul Diş Akademisi",
      period,
      previousPeriod,
      metrics,
      summaryTr,
    });
    expect(email.subject).toContain("İstanbul Diş Akademisi");
    expect(email.subject).toContain("7–13 Eylül 2026");
    expect(email.html).toMatch(/iç değerlendirmesi/i);
    expect(email.html).not.toMatch(/@istanbul|clinic@|hasta@/i);
    expect(buildWeeklyReportSubject({ clinicName: "İstanbul Diş Akademisi", period })).toBe(
      email.subject
    );
  });
});

describe("Wiring / security / schedule", () => {
  it("cron route uses CRON_SECRET auth and vercel schedule is Monday 05:00 UTC", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/internal/weekly-clinic-report/route.ts"),
      "utf8"
    );
    const vercel = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
    expect(route).toContain("CRON_SECRET");
    expect(route).toContain("INTERNAL_API_SECRET");
    expect(route).toContain("runWeeklyClinicReportsForAllEnabled");
    expect(vercel).toContain("/api/internal/weekly-clinic-report");
    expect(vercel).toContain("0 5 * * 1");
  });

  it("uses canonical IDA clinic id, not display name as identifier", () => {
    expect(ISTANBUL_DIS_AKADEMISI_CLINIC_ID).toBe("ByTnY4VEmBTJxogqCQ7q");
    expect(WEEKLY_CLINIC_REPORT_TARGETS[0].clinicId).toBe("ByTnY4VEmBTJxogqCQ7q");
  });

  it("send path refuses non-internal recipients before mailing", () => {
    const sendSrc = readFileSync(
      join(process.cwd(), "lib/services/weeklyClinicReport/sendWeeklyClinicReport.ts"),
      "utf8"
    );
    expect(sendSrc).toContain("assertInternalOnlyRecipients");
    expect(sendSrc).toContain("skipped_duplicate");
    expect(sendSrc).toContain("weeklyClinicReports");
  });
});
