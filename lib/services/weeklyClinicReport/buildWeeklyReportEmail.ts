/**
 * HTML email builder for weekly clinic AI usage reports (internal review).
 */

import type { WeekRange } from "./weekRange";
import type { WeeklyClinicMetricsWithDelta, MetricDelta } from "./computeWeeklyClinicMetrics";

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDeltaTr(delta: MetricDelta, opts?: { preferAbsolute?: boolean }): string {
  if (delta.absolute === 0) {
    return "→ geçen haftayla aynı";
  }
  const arrow = delta.absolute > 0 ? "↑" : "↓";
  if (opts?.preferAbsolute || delta.percent === null) {
    const n = Math.abs(delta.absolute);
    return `${arrow} ${n} geçen haftaya göre`;
  }
  return `${arrow} %${Math.abs(delta.percent)} geçen haftaya göre`;
}

function kpiCard(label: string, value: string, deltaHtml?: string): string {
  return `
    <td style="width:33%;padding:8px;vertical-align:top;">
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 12px;min-height:88px;">
        <div style="font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:#64748b;font-weight:600;">${escapeHtml(label)}</div>
        <div style="font-size:26px;font-weight:700;color:#0f172a;margin-top:6px;line-height:1.1;">${escapeHtml(value)}</div>
        ${deltaHtml ? `<div style="font-size:12px;color:#475569;margin-top:6px;">${deltaHtml}</div>` : ""}
      </div>
    </td>`;
}

export function buildWeeklyReportSubject(params: {
  clinicName: string;
  period: WeekRange;
}): string {
  return `${params.clinicName} | ClinicBridge Haftalık AI Kullanım Raporu | ${params.period.subjectRangeTr}`;
}

export function buildWeeklyReportHtml(params: {
  clinicName: string;
  period: WeekRange;
  previousPeriod: WeekRange;
  metrics: WeeklyClinicMetricsWithDelta;
  summaryTr: string;
}): { subject: string; html: string; text: string } {
  const { clinicName, period, metrics, summaryTr } = params;
  const subject = buildWeeklyReportSubject({ clinicName, period });

  const rate =
    metrics.appointmentConversionRate === null
      ? "—"
      : `%${metrics.appointmentConversionRate}`;

  const langRows =
    metrics.languages.length === 0
      ? `<tr><td style="padding:6px 0;color:#64748b;">Bu hafta dil verisi yok.</td></tr>`
      : metrics.languages
          .map(
            (l) =>
              `<tr>
                <td style="padding:6px 0;color:#0f172a;">${escapeHtml(l.label)}</td>
                <td style="padding:6px 0;text-align:right;font-weight:600;color:#0f172a;">${l.count}</td>
              </tr>`
          )
          .join("");

  const html = `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:640px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:linear-gradient(135deg,#0f766e 0%,#115e59 100%);padding:24px 28px;color:#fff;">
      <div style="font-size:13px;opacity:0.9;letter-spacing:0.06em;text-transform:uppercase;">ClinicBridge</div>
      <div style="font-size:22px;font-weight:700;margin-top:4px;">Haftalık AI Kullanım Raporu</div>
    </div>
    <div style="padding:20px 28px 8px;">
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px 12px;font-size:12px;color:#9a3412;line-height:1.45;">
        Bu rapor ClinicBridge iç değerlendirmesi için otomatik olarak oluşturulmuştur. Klinik tarafına otomatik gönderim yapılmamaktadır.
      </div>
    </div>
    <div style="padding:12px 28px 8px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr>
          <td style="padding:4px 0;color:#64748b;width:120px;">Klinik</td>
          <td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(clinicName)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#64748b;">Dönem</td>
          <td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(period.labelTr)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#64748b;">Karşılaştırma</td>
          <td style="padding:4px 0;color:#475569;">${escapeHtml(params.previousPeriod.labelTr)}</td>
        </tr>
      </table>
    </div>

    <div style="padding:8px 20px 4px;">
      <div style="font-size:13px;font-weight:700;color:#0f172a;margin:8px 8px 4px;letter-spacing:0.02em;">KPI ÖZETİ</div>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          ${kpiCard("Görüşme", String(metrics.totalConversations), escapeHtml(formatDeltaTr(metrics.deltas.totalConversations)))}
          ${kpiCard("AI Yanıtlanan", String(metrics.aiHandled))}
          ${kpiCard("Yanıtlanamadı", String(metrics.unanswered))}
        </tr>
        <tr>
          ${kpiCard("Canlı Destek", String(metrics.liveSupport), escapeHtml(formatDeltaTr(metrics.deltas.liveSupport, { preferAbsolute: metrics.deltas.liveSupport.percent === null || Math.abs(metrics.deltas.liveSupport.absolute) < 3 })))}
          ${kpiCard("Randevuya Dönüşen", String(metrics.appointmentConversions), escapeHtml(formatDeltaTr(metrics.deltas.appointmentConversions, { preferAbsolute: true })))}
          ${kpiCard("Dönüşüm Oranı", rate, metrics.appointmentConversionRate === null ? "" : escapeHtml(formatDeltaTr(metrics.deltas.appointmentConversionRate)))}
        </tr>
      </table>
      <div style="padding:4px 8px 12px;font-size:12px;color:#64748b;">
        Randevu süreci başlayan: <strong style="color:#334155;">${metrics.appointmentProcessStarted}</strong>
        &nbsp;·&nbsp; Canlı destek oranı:
        <strong style="color:#334155;">${metrics.liveSupportRate === null ? "—" : `%${metrics.liveSupportRate}`}</strong>
      </div>
    </div>

    <div style="padding:4px 28px 16px;">
      <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:8px;">DİL DAĞILIMI</div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;max-width:280px;">
        ${langRows}
      </table>
    </div>

    <div style="padding:4px 28px 28px;">
      <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:8px;">HAFTANIN ÖZETİ</div>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">${escapeHtml(summaryTr)}</p>
    </div>

    <div style="padding:14px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;">
      ClinicBridge · Haftalık AI kullanım raporu · Yalnızca iç değerlendirme
    </div>
  </div>
</body>
</html>`;

  const text = [
    "ClinicBridge — Haftalık AI Kullanım Raporu",
    `Klinik: ${clinicName}`,
    `Dönem: ${period.labelTr}`,
    "",
    `Görüşme: ${metrics.totalConversations}`,
    `AI Yanıtlanan: ${metrics.aiHandled}`,
    `Yanıtlanamadı: ${metrics.unanswered}`,
    `Canlı Destek: ${metrics.liveSupport}`,
    `Randevuya Dönüşen: ${metrics.appointmentConversions}`,
    `Dönüşüm Oranı: ${rate}`,
    "",
    summaryTr,
    "",
    "Bu rapor ClinicBridge iç değerlendirmesi için otomatik olarak oluşturulmuştur. Klinik tarafına otomatik gönderim yapılmamaktadır.",
  ].join("\n");

  return { subject, html, text };
}
