/**
 * Orchestrates weekly clinic AI usage report generation + internal email delivery.
 */

import { getAdminDb } from "@/lib/firebase-admin";
import { ResendEmailProvider } from "@/lib/services/notifications/providers/ResendEmailProvider";
import {
  assertInternalOnlyRecipients,
  getEnabledWeeklyReportTargets,
  type WeeklyClinicReportTarget,
} from "./weeklyClinicReportConfig";
import {
  attachWeekOverWeekDeltas,
  buildWeeklySummaryTr,
  computeWeeklyMetricsFromLogs,
  type WeeklyClinicMetricsWithDelta,
} from "./computeWeeklyClinicMetrics";
import { buildWeeklyReportHtml } from "./buildWeeklyReportEmail";
import {
  resolveCompletedWeekRange,
  resolveComparisonWeekRange,
  buildWeekRange,
  weeklyReportIdempotencyKey,
  WEEKLY_REPORT_TIMEZONE,
  type WeekRange,
} from "./weekRange";

export type WeeklyReportRunMode = "send" | "preview" | "dry_run";

export type WeeklyReportRunResult = {
  clinicId: string;
  clinicName: string;
  mode: WeeklyReportRunMode;
  period: WeekRange;
  previousPeriod: WeekRange;
  metrics: WeeklyClinicMetricsWithDelta;
  summaryTr: string;
  subject: string;
  html?: string;
  recipients: string[];
  skippedDuplicate: boolean;
  emailSent: boolean;
  providerMessageIds?: string[];
  error?: string;
  idempotencyKey: string;
};

function reportDocId(clinicId: string, weekStartDate: string): string {
  return `${clinicId}_${weekStartDate}`;
}

async function loadConversationLogsForRange(
  clinicId: string,
  range: WeekRange
): Promise<Array<Record<string, any>>> {
  const adminDb = getAdminDb();
  if (!adminDb) throw new Error("Database unavailable");

  // Prefer indexed range query; fall back to bounded scan if index missing.
  try {
    const snap = await adminDb
      .collection("clinics")
      .doc(clinicId)
      .collection("conversationLogs")
      .where("createdAt", ">=", range.startUtcIso)
      .where("createdAt", "<=", range.endUtcIso)
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err: any) {
    console.warn(
      JSON.stringify({
        event: "weekly-clinic-report",
        checkpoint: "query_fallback_scan",
        clinicId,
        error: err?.message || String(err),
      })
    );
    const snap = await adminDb
      .collection("clinics")
      .doc(clinicId)
      .collection("conversationLogs")
      .orderBy("createdAt", "desc")
      .limit(2000)
      .get();
    const rows: Array<Record<string, any>> = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    return rows.filter((d) => {
      const created = String(d.createdAt || "");
      return created >= range.startUtcIso && created <= range.endUtcIso;
    });
  }
}

async function wasAlreadySent(clinicId: string, weekStartDate: string): Promise<boolean> {
  const adminDb = getAdminDb();
  if (!adminDb) return false;
  const doc = await adminDb
    .collection("weeklyClinicReports")
    .doc(reportDocId(clinicId, weekStartDate))
    .get();
  if (!doc.exists) return false;
  const data = doc.data() || {};
  return data.deliveryStatus === "sent";
}

async function markReportStatus(params: {
  clinicId: string;
  clinicName: string;
  period: WeekRange;
  recipients: string[];
  deliveryStatus: "sent" | "failed" | "preview" | "dry_run";
  metrics: WeeklyClinicMetricsWithDelta;
  error?: string;
  providerMessageIds?: string[];
  idempotencyKey: string;
}): Promise<void> {
  const adminDb = getAdminDb();
  if (!adminDb) return;
  const now = new Date().toISOString();
  const ref = adminDb.collection("weeklyClinicReports").doc(
    reportDocId(params.clinicId, params.period.weekStartDate)
  );
  const existing = await ref.get();
  const payload: Record<string, unknown> = {
    clinicId: params.clinicId,
    clinicName: params.clinicName,
    reportWeekStart: params.period.weekStartDate,
    reportWeekEnd: params.period.weekEndDate,
    periodStartUtc: params.period.startUtcIso,
    periodEndUtc: params.period.endUtcIso,
    recipients: params.recipients,
    deliveryStatus: params.deliveryStatus,
    idempotencyKey: params.idempotencyKey,
    metrics: {
      totalConversations: params.metrics.totalConversations,
      aiHandled: params.metrics.aiHandled,
      unanswered: params.metrics.unanswered,
      liveSupport: params.metrics.liveSupport,
      appointmentProcessStarted: params.metrics.appointmentProcessStarted,
      appointmentConversions: params.metrics.appointmentConversions,
      appointmentConversionRate: params.metrics.appointmentConversionRate,
      liveSupportRate: params.metrics.liveSupportRate,
      languages: params.metrics.languages,
    },
    updatedAt: now,
    timezone: WEEKLY_REPORT_TIMEZONE,
  };
  if (!existing.exists) {
    payload.generatedAt = now;
  }
  if (params.deliveryStatus === "sent") {
    payload.sentAt = now;
    payload.providerMessageIds = params.providerMessageIds || [];
    payload.error = null;
  }
  if (params.deliveryStatus === "failed") {
    payload.error = params.error || "unknown";
  }
  await ref.set(payload, { merge: true });
}

export async function generateWeeklyClinicReport(params: {
  target: WeeklyClinicReportTarget;
  mode?: WeeklyReportRunMode;
  /** Override: clinic-local Monday YYYY-MM-DD */
  weekStartDate?: string;
  /** Override: clinic-local Sunday YYYY-MM-DD */
  weekEndDate?: string;
  now?: Date;
}): Promise<WeeklyReportRunResult> {
  const mode = params.mode || "send";
  const period = params.weekStartDate && params.weekEndDate
    ? buildWeekRange(params.weekStartDate, params.weekEndDate)
    : resolveCompletedWeekRange(params.now ?? new Date());
  const previousPeriod = resolveComparisonWeekRange(period);
  const idempotencyKey = weeklyReportIdempotencyKey(
    params.target.clinicId,
    period.weekStartDate
  );

  console.log(
    JSON.stringify({
      event: "weekly-clinic-report",
      checkpoint: "started",
      clinicId: params.target.clinicId,
      mode,
      weekStart: period.weekStartDate,
      weekEnd: period.weekEndDate,
    })
  );

  assertInternalOnlyRecipients(params.target.internalRecipients);

  if (mode === "send") {
    const already = await wasAlreadySent(params.target.clinicId, period.weekStartDate);
    if (already) {
      console.log(
        JSON.stringify({
          event: "weekly-clinic-report",
          checkpoint: "skipped_duplicate",
          clinicId: params.target.clinicId,
          weekStart: period.weekStartDate,
        })
      );
      const emptyMetrics = attachWeekOverWeekDeltas(
        computeWeeklyMetricsFromLogs([]),
        computeWeeklyMetricsFromLogs([])
      );
      return {
        clinicId: params.target.clinicId,
        clinicName: params.target.clinicName,
        mode,
        period,
        previousPeriod,
        metrics: emptyMetrics,
        summaryTr: "",
        subject: "",
        recipients: params.target.internalRecipients,
        skippedDuplicate: true,
        emailSent: false,
        idempotencyKey,
      };
    }
  }

  const [currentLogs, previousLogs] = await Promise.all([
    loadConversationLogsForRange(params.target.clinicId, period),
    loadConversationLogsForRange(params.target.clinicId, previousPeriod),
  ]);

  const currentMetrics = computeWeeklyMetricsFromLogs(currentLogs);
  const previousMetrics = computeWeeklyMetricsFromLogs(previousLogs);
  const metrics = attachWeekOverWeekDeltas(currentMetrics, previousMetrics);
  const summaryTr = buildWeeklySummaryTr({
    clinicName: params.target.clinicName,
    periodLabel: period.labelTr,
    metrics,
  });

  console.log(
    JSON.stringify({
      event: "weekly-clinic-report",
      checkpoint: "metrics_calculated",
      clinicId: params.target.clinicId,
      weekStart: period.weekStartDate,
      totalConversations: metrics.totalConversations,
      appointmentConversions: metrics.appointmentConversions,
      liveSupport: metrics.liveSupport,
    })
  );

  const email = buildWeeklyReportHtml({
    clinicName: params.target.clinicName,
    period,
    previousPeriod,
    metrics,
    summaryTr,
  });

  if (mode === "preview" || mode === "dry_run") {
    await markReportStatus({
      clinicId: params.target.clinicId,
      clinicName: params.target.clinicName,
      period,
      recipients: params.target.internalRecipients,
      deliveryStatus: mode === "preview" ? "preview" : "dry_run",
      metrics,
      idempotencyKey,
    });
    return {
      clinicId: params.target.clinicId,
      clinicName: params.target.clinicName,
      mode,
      period,
      previousPeriod,
      metrics,
      summaryTr,
      subject: email.subject,
      html: mode === "preview" ? email.html : undefined,
      recipients: params.target.internalRecipients,
      skippedDuplicate: false,
      emailSent: false,
      idempotencyKey,
    };
  }

  const provider = new ResendEmailProvider();
  const providerMessageIds: string[] = [];
  try {
    for (const to of params.target.internalRecipients) {
      const result = await provider.send({
        to,
        subject: email.subject,
        language: "tr",
        templateId: "weekly_clinic_ai_usage_report",
        variables: {
          htmlContent: email.html,
          from: process.env.EMAIL_FROM || "ClinicBridge <no-reply@clinicbridge-ai.com>",
        },
        idempotencyKey: `${idempotencyKey}:${to}`,
      });

      if (!result.success) {
        throw new Error(result.errorMessage || result.errorCode || "EMAIL_SEND_FAILED");
      }
      if (result.messageId) providerMessageIds.push(result.messageId);
    }

    await markReportStatus({
      clinicId: params.target.clinicId,
      clinicName: params.target.clinicName,
      period,
      recipients: params.target.internalRecipients,
      deliveryStatus: "sent",
      metrics,
      providerMessageIds,
      idempotencyKey,
    });

    console.log(
      JSON.stringify({
        event: "weekly-clinic-report",
        checkpoint: "email_sent",
        clinicId: params.target.clinicId,
        weekStart: period.weekStartDate,
        recipients: params.target.internalRecipients,
      })
    );

    return {
      clinicId: params.target.clinicId,
      clinicName: params.target.clinicName,
      mode,
      period,
      previousPeriod,
      metrics,
      summaryTr,
      subject: email.subject,
      recipients: params.target.internalRecipients,
      skippedDuplicate: false,
      emailSent: true,
      providerMessageIds,
      idempotencyKey,
    };
  } catch (err: any) {
    const message = err?.message || String(err);
    await markReportStatus({
      clinicId: params.target.clinicId,
      clinicName: params.target.clinicName,
      period,
      recipients: params.target.internalRecipients,
      deliveryStatus: "failed",
      metrics,
      error: message,
      idempotencyKey,
    });
    console.error(
      JSON.stringify({
        event: "weekly-clinic-report",
        checkpoint: "failed",
        clinicId: params.target.clinicId,
        weekStart: period.weekStartDate,
        error: message,
      })
    );
    return {
      clinicId: params.target.clinicId,
      clinicName: params.target.clinicName,
      mode,
      period,
      previousPeriod,
      metrics,
      summaryTr,
      subject: email.subject,
      recipients: params.target.internalRecipients,
      skippedDuplicate: false,
      emailSent: false,
      error: message,
      idempotencyKey,
    };
  }
}

export async function runWeeklyClinicReportsForAllEnabled(params?: {
  mode?: WeeklyReportRunMode;
  weekStartDate?: string;
  weekEndDate?: string;
  now?: Date;
  clinicId?: string;
}): Promise<{ results: WeeklyReportRunResult[] }> {
  const mode = params?.mode || "send";
  let targets = getEnabledWeeklyReportTargets();
  if (params?.clinicId) {
    targets = targets.filter((t) => t.clinicId === params.clinicId);
  }

  const results: WeeklyReportRunResult[] = [];
  for (const target of targets) {
    try {
      const result = await generateWeeklyClinicReport({
        target,
        mode,
        weekStartDate: params?.weekStartDate,
        weekEndDate: params?.weekEndDate,
        now: params?.now,
      });
      results.push(result);
    } catch (err: any) {
      console.error(
        JSON.stringify({
          event: "weekly-clinic-report",
          checkpoint: "failed",
          clinicId: target.clinicId,
          error: err?.message || String(err),
        })
      );
      results.push({
        clinicId: target.clinicId,
        clinicName: target.clinicName,
        mode,
        period: resolveCompletedWeekRange(params?.now ?? new Date()),
        previousPeriod: resolveComparisonWeekRange(
          resolveCompletedWeekRange(params?.now ?? new Date())
        ),
        metrics: attachWeekOverWeekDeltas(
          computeWeeklyMetricsFromLogs([]),
          computeWeeklyMetricsFromLogs([])
        ),
        summaryTr: "",
        subject: "",
        recipients: target.internalRecipients,
        skippedDuplicate: false,
        emailSent: false,
        error: err?.message || String(err),
        idempotencyKey: weeklyReportIdempotencyKey(
          target.clinicId,
          resolveCompletedWeekRange(params?.now ?? new Date()).weekStartDate
        ),
      });
    }
  }
  return { results };
}
