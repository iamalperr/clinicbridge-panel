import { NextResponse } from "next/server";
import { runWeeklyClinicReportsForAllEnabled } from "@/lib/services/weeklyClinicReport/sendWeeklyClinicReport";
import type { WeeklyReportRunMode } from "@/lib/services/weeklyClinicReport/sendWeeklyClinicReport";

/**
 * POST /api/internal/weekly-clinic-report
 *
 * Generates and (optionally) emails the weekly AI usage report for configured clinics.
 * Auth: Authorization: Bearer ${CRON_SECRET} or x-cron-secret header
 *   (same pattern as /api/internal/agency-notifications/retry).
 *
 * Body (optional JSON):
 * {
 *   mode?: "send" | "preview" | "dry_run",  // default "send"
 *   clinicId?: string,
 *   weekStartDate?: "YYYY-MM-DD",  // Monday, Europe/Istanbul
 *   weekEndDate?: "YYYY-MM-DD"     // Sunday, Europe/Istanbul
 * }
 *
 * Phase 1 recipients are ALWAYS @clinicbridge-ai.com internal inboxes.
 * Never sends to clinic patient/clinic addresses.
 */
function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET;
  const auth = req.headers.get("authorization") || "";
  const headerSecret = req.headers.get("x-cron-secret") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return Boolean(secret && (bearer === secret || headerSecret === secret));
}

export async function POST(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const modeRaw = typeof body.mode === "string" ? body.mode : "send";
    const mode: WeeklyReportRunMode =
      modeRaw === "preview" || modeRaw === "dry_run" || modeRaw === "send"
        ? modeRaw
        : "send";

    const { results } = await runWeeklyClinicReportsForAllEnabled({
      mode,
      clinicId: typeof body.clinicId === "string" ? body.clinicId : undefined,
      weekStartDate: typeof body.weekStartDate === "string" ? body.weekStartDate : undefined,
      weekEndDate: typeof body.weekEndDate === "string" ? body.weekEndDate : undefined,
    });

    const anyFailed = results.some((r) => Boolean(r.error) && !r.skippedDuplicate);
    return NextResponse.json({
      ok: !anyFailed,
      mode,
      results: results.map((r) => ({
        clinicId: r.clinicId,
        clinicName: r.clinicName,
        period: {
          weekStartDate: r.period.weekStartDate,
          weekEndDate: r.period.weekEndDate,
          labelTr: r.period.labelTr,
        },
        metrics: {
          totalConversations: r.metrics.totalConversations,
          aiHandled: r.metrics.aiHandled,
          unanswered: r.metrics.unanswered,
          liveSupport: r.metrics.liveSupport,
          appointmentProcessStarted: r.metrics.appointmentProcessStarted,
          appointmentConversions: r.metrics.appointmentConversions,
          appointmentConversionRate: r.metrics.appointmentConversionRate,
          liveSupportRate: r.metrics.liveSupportRate,
          languages: r.metrics.languages,
        },
        deltas: r.metrics.deltas,
        summaryTr: r.summaryTr,
        subject: r.subject,
        recipients: r.recipients,
        skippedDuplicate: r.skippedDuplicate,
        emailSent: r.emailSent,
        error: r.error || null,
        // Preview HTML only when explicitly requested — never in cron send mode response size bloat
        html: mode === "preview" ? r.html : undefined,
      })),
    });
  } catch (err) {
    console.error(
      "[weekly-clinic-report]",
      err instanceof Error ? err.message : "unknown"
    );
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** GET — used by Vercel Cron (Monday 05:00 UTC = 08:00 Europe/Istanbul). Default mode is send. */
export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const modeParam = url.searchParams.get("mode") || "send";
  const mode: WeeklyReportRunMode =
    modeParam === "preview" || modeParam === "dry_run" || modeParam === "send"
      ? modeParam
      : "send";

  const { results } = await runWeeklyClinicReportsForAllEnabled({
    mode,
    clinicId: url.searchParams.get("clinicId") || undefined,
    weekStartDate: url.searchParams.get("weekStartDate") || undefined,
    weekEndDate: url.searchParams.get("weekEndDate") || undefined,
  });

  const anyFailed = results.some((r) => Boolean(r.error) && !r.skippedDuplicate);
  return NextResponse.json({
    ok: !anyFailed,
    mode,
    results: results.map((r) => ({
      clinicId: r.clinicId,
      clinicName: r.clinicName,
      period: {
        weekStartDate: r.period.weekStartDate,
        weekEndDate: r.period.weekEndDate,
        labelTr: r.period.labelTr,
      },
      metrics: {
        totalConversations: r.metrics.totalConversations,
        aiHandled: r.metrics.aiHandled,
        unanswered: r.metrics.unanswered,
        liveSupport: r.metrics.liveSupport,
        appointmentProcessStarted: r.metrics.appointmentProcessStarted,
        appointmentConversions: r.metrics.appointmentConversions,
        appointmentConversionRate: r.metrics.appointmentConversionRate,
        liveSupportRate: r.metrics.liveSupportRate,
        languages: r.metrics.languages,
      },
      deltas: r.metrics.deltas,
      summaryTr: r.summaryTr,
      subject: r.subject,
      recipients: r.recipients,
      skippedDuplicate: r.skippedDuplicate,
      emailSent: r.emailSent,
      error: r.error || null,
      html: mode === "preview" ? r.html : undefined,
    })),
  });
}
