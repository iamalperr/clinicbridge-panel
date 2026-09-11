/**
 * Date-ranged weekly clinic metrics.
 *
 * Reuses the same conversation status + conversion definitions as the clinic
 * dashboard ("Randevuya Dönüşen", live support, unanswered) via
 * conversationStatusResolver — does NOT invent parallel KPI definitions.
 */

import {
  normalizeConversationStatus,
  isConversationConverted,
} from "@/lib/services/conversations/conversationStatusResolver";
import {
  isCreatedAtInRange,
  type WeekRange,
} from "./weekRange";

export type LanguageCount = {
  code: string;
  label: string;
  count: number;
};

export type WeeklyClinicMetrics = {
  totalConversations: number;
  /** Matches clinicMetricsService.resolvedCount definition */
  aiHandled: number;
  unanswered: number;
  liveSupport: number;
  /** collecting_appointment_information OR converted */
  appointmentProcessStarted: number;
  /** Matches dashboard "Randevuya Dönüşen" via isConversationConverted */
  appointmentConversions: number;
  /** appointmentConversions / totalConversations * 100, or null if no conversations */
  appointmentConversionRate: number | null;
  /** liveSupport / totalConversations * 100, or null */
  liveSupportRate: number | null;
  languages: LanguageCount[];
};

export type MetricDelta = {
  absolute: number;
  /** Percent change vs previous; null when previous is 0 or undefined */
  percent: number | null;
};

export type WeeklyClinicMetricsWithDelta = WeeklyClinicMetrics & {
  deltas: {
    totalConversations: MetricDelta;
    liveSupport: MetricDelta;
    appointmentConversions: MetricDelta;
    appointmentConversionRate: MetricDelta;
  };
};

const LANGUAGE_LABELS: Record<string, string> = {
  tr: "Türkçe",
  en: "English",
  de: "German",
  fr: "French",
  ar: "Arabic",
  ru: "Russian",
  es: "Spanish",
  it: "Italian",
};

export function normalizeLanguageCode(raw: unknown): string {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .slice(0, 2);
  if (!s) return "unknown";
  return s;
}

export function languageLabel(code: string): string {
  if (code === "unknown") return "Bilinmiyor";
  return LANGUAGE_LABELS[code] || code.toUpperCase();
}

/**
 * Pure metrics from an in-memory list of conversation log docs (already filtered or not).
 */
export function computeWeeklyMetricsFromLogs(
  logs: Array<Record<string, any>>,
  range?: WeekRange
): WeeklyClinicMetrics {
  const filtered = range
    ? logs.filter((d) => isCreatedAtInRange(d.createdAt, range))
    : logs;

  let aiHandled = 0;
  let unanswered = 0;
  let liveSupport = 0;
  let appointmentProcessStarted = 0;
  let appointmentConversions = 0;
  const langCounts = new Map<string, number>();

  for (const d of filtered) {
    const normalized = normalizeConversationStatus(d.status, {
      convertedToAppointment: d.convertedToAppointment,
      appointmentId: d.appointmentId,
      appointmentStatus: d.appointmentStatus,
    });
    const isConv = isConversationConverted(d);

    if (
      normalized === "successfully_answered" ||
      normalized === "converted_to_appointment" ||
      normalized === "collecting_appointment_information" ||
      isConv
    ) {
      aiHandled++;
    }

    if (normalized === "unanswered") unanswered++;
    if (normalized === "live_support_required") liveSupport++;

    if (
      normalized === "collecting_appointment_information" ||
      normalized === "converted_to_appointment" ||
      isConv
    ) {
      appointmentProcessStarted++;
    }

    if (isConv) appointmentConversions++;

    const code = normalizeLanguageCode(
      d.conversationLocale || d.detectedLanguage || d.language
    );
    langCounts.set(code, (langCounts.get(code) || 0) + 1);
  }

  const totalConversations = filtered.length;
  const appointmentConversionRate =
    totalConversations > 0
      ? Math.round((appointmentConversions / totalConversations) * 1000) / 10
      : null;
  const liveSupportRate =
    totalConversations > 0
      ? Math.round((liveSupport / totalConversations) * 1000) / 10
      : null;

  const languages: LanguageCount[] = [...langCounts.entries()]
    .map(([code, count]) => ({ code, label: languageLabel(code), count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

  return {
    totalConversations,
    aiHandled,
    unanswered,
    liveSupport,
    appointmentProcessStarted,
    appointmentConversions,
    appointmentConversionRate,
    liveSupportRate,
    languages,
  };
}

export function computeMetricDelta(current: number, previous: number): MetricDelta {
  const absolute = current - previous;
  if (previous === 0) {
    return { absolute, percent: null };
  }
  const percent = Math.round(((current - previous) / previous) * 1000) / 10;
  return { absolute, percent };
}

export function attachWeekOverWeekDeltas(
  current: WeeklyClinicMetrics,
  previous: WeeklyClinicMetrics
): WeeklyClinicMetricsWithDelta {
  return {
    ...current,
    deltas: {
      totalConversations: computeMetricDelta(
        current.totalConversations,
        previous.totalConversations
      ),
      liveSupport: computeMetricDelta(current.liveSupport, previous.liveSupport),
      appointmentConversions: computeMetricDelta(
        current.appointmentConversions,
        previous.appointmentConversions
      ),
      appointmentConversionRate: computeMetricDelta(
        current.appointmentConversionRate ?? 0,
        previous.appointmentConversionRate ?? 0
      ),
    },
  };
}

/**
 * Deterministic Turkish narrative for the email "Haftanın Özeti" section.
 */
export function buildWeeklySummaryTr(params: {
  clinicName: string;
  periodLabel: string;
  metrics: WeeklyClinicMetricsWithDelta;
}): string {
  const { clinicName, periodLabel, metrics } = params;
  const n = metrics.totalConversations;
  const live = metrics.liveSupport;
  const appt = metrics.appointmentConversions;
  const delta = metrics.deltas.totalConversations;

  if (n === 0) {
    return `${periodLabel} döneminde ${clinicName} sanal asistanı üzerinden kayıtlı hasta görüşmesi bulunmuyor.`;
  }

  let volumeClause = "";
  if (delta.percent !== null && delta.absolute !== 0) {
    const dir = delta.absolute > 0 ? "arttı" : "azaldı";
    volumeClause = ` Görüşme hacmi bir önceki haftaya göre %${Math.abs(delta.percent)} ${dir}.`;
  } else if (delta.absolute !== 0 && delta.percent === null) {
    volumeClause =
      delta.absolute > 0
        ? ` Görüşme sayısı bir önceki haftaya göre ${delta.absolute} arttı.`
        : ` Görüşme sayısı bir önceki haftaya göre ${Math.abs(delta.absolute)} azaldı.`;
  }

  let outcome: string;
  if (live === 0 && appt === 0) {
    outcome = "Bu görüşmelerden canlı destek veya randevu dönüşümü oluşmadı";
  } else if (live === 0) {
    outcome = `Bu görüşmelerin ${appt}'si randevu sürecine dönüştü; canlı destek talebi oluşmadı`;
  } else if (appt === 0) {
    outcome = `Bu görüşmelerin ${live}'si canlı destek talebine dönüştü; randevu dönüşümü gerçekleşmedi`;
  } else {
    outcome = `Bu görüşmelerin ${live}'si canlı destek talebine, ${appt}'si ise randevu sürecine dönüştü`;
  }

  return `${periodLabel} döneminde ${clinicName} sanal asistanı üzerinden ${n} hasta görüşmesi gerçekleştirildi. ${outcome}.${volumeClause}`;
}
