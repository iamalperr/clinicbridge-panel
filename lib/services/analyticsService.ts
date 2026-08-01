/**
 * analyticsService.ts
 *
 * Analizler sayfası için merkezi hesaplama ve veri servisleri.
 * Tüm kliniklerin conversationLogs verilerini toplayıp global metrikleri hesaplar.
 */

import {
  collection,
  query,
  orderBy,
  onSnapshot,
  getDocs,
  QuerySnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Clinic, Plan } from "@/lib/types";

// ─── Types ──────────────────────────────────────────────────────────────────

export type DateRange = "today" | "7d" | "30d" | "month" | "all";

export interface ConversationLogDoc {
  id: string;
  clinicId?: string;
  status: string;
  totalMessages: number;
  createdAt: string;
  updatedAt?: string;
  patientName?: string;
  language?: string;
  needsTraining?: boolean;
  convertedToAppointment?: boolean;
}

export interface ClinicAnalytics {
  clinicId: string;
  clinicName: string;
  plan: Plan | "starter" | undefined;
  modules?: { ai: boolean; widget: boolean; voice: boolean; sms?: boolean };
  status?: string;
  totalConversations: number;
  totalMessages: number;
  resolvedCount: number;
  resolvedRate: number | null;
  appointments: number;
  liveSupport: number;
  unanswered: number;
  needsTraining: number;
  lastActivity: string | null;
  /** Günlük görüşme sayıları { "2026-07-01": 5, ... } */
  dailyConversations: Record<string, number>;
  /** Günlük mesaj sayıları { "2026-07-01": 42, ... } */
  dailyMessages: Record<string, number>;
  /** Status dağılımı */
  statusDistribution: Record<string, number>;
}

export interface GlobalAnalytics {
  totalClinics: number;
  activeClinics: number;
  totalConversations: number;
  totalMessages: number;
  resolvedCount: number;
  resolvedRate: number | null;
  appointments: number;
  liveSupport: number;
  unanswered: number;
  needsTraining: number;
  dailyConversations: Record<string, number>;
  dailyMessages: Record<string, number>;
  statusDistribution: Record<string, number>;
  clinics: ClinicAnalytics[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** "Çözülmüş" sayılan status değerleri */
export const RESOLVED_STATUSES = new Set([
  "answered",
  "appointment",
  "successful",
  "resolved",
  "completed",
  "appointment_converted",
]);

/** Status → Türkçe etiket */
export const STATUS_LABELS: Record<string, string> = {
  answered:              "Başarılı Yanıtlandı",
  appointment:           "Randevuya Dönüştü",
  collecting:            "Randevu Bilgisi Toplanıyor",
  liveSupport:           "Canlı Destek Talebi",
  unanswered:            "Yanıtlanamayan",
  needsTraining:         "Eğitim Gerekiyor",
  successful:            "Başarılı Yanıtlandı",
  resolved:              "Başarılı Yanıtlandı",
  completed:             "Tamamlandı",
  appointment_converted: "Randevuya Dönüştü",
};

/** Status → badge rengi */
export const STATUS_COLORS: Record<string, string> = {
  answered:    "#34d399",
  appointment: "#818cf8",
  collecting:  "#f59e0b",
  liveSupport: "#38bdf8",
  unanswered:  "#f87171",
  needsTraining: "#fb923c",
  other:       "#6b7280",
};

// ─── Date Helpers ─────────────────────────────────────────────────────────────

export function getDateRangeStart(range: DateRange): Date | null {
  const now = new Date();
  switch (range) {
    case "today": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "7d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d;
    }
    case "30d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return d;
    }
    case "month": {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return d;
    }
    case "all":
      return null;
  }
}

export function isInDateRange(dateStr: string, rangeStart: Date | null): boolean {
  if (!rangeStart) return true;
  try {
    const d = new Date(dateStr);
    return d >= rangeStart;
  } catch {
    return true;
  }
}

export function formatDayKey(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toISOString().slice(0, 10); // "2026-07-01"
  } catch {
    return dateStr;
  }
}

/** Son N gün için tarih anahtarları üretir */
export function generateDayKeys(range: DateRange): string[] {
  const keys: string[] = [];
  const now = new Date();
  let days = 7;
  if (range === "today") days = 1;
  else if (range === "7d") days = 7;
  else if (range === "30d" || range === "month") days = 30;
  else if (range === "all") days = 30; // all'da son 30 günü göster

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

/** Gün anahtarını kısa formata çevirir: "2026-07-01" → "1 Tem" */
export function formatDayLabel(key: string): string {
  try {
    const d = new Date(key + "T12:00:00Z");
    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  } catch {
    return key;
  }
}

// ─── Core Calculation ─────────────────────────────────────────────────────────

export function calculateClinicMetrics(
  clinicId: string,
  clinicName: string,
  clinic: Partial<Clinic>,
  logs: ConversationLogDoc[],
  rangeStart: Date | null
): ClinicAnalytics {
  const filtered = logs.filter((l) => isInDateRange(l.createdAt, rangeStart));

  const totalConversations = filtered.length;
  const totalMessages = filtered.reduce(
    (s, l) => s + (typeof l.totalMessages === "number" ? l.totalMessages : 0),
    0
  );
  const resolvedCount = filtered.filter((l) => RESOLVED_STATUSES.has(l.status)).length;
  const appointments = filtered.filter((l) => l.status === "appointment" || l.status === "appointment_converted").length;
  const liveSupport = filtered.filter((l) => l.status === "liveSupport").length;
  const unanswered = filtered.filter((l) => l.status === "unanswered").length;
  const needsTraining = filtered.filter((l) => l.needsTraining).length;

  const resolvedRate = totalConversations > 0
    ? Math.round((resolvedCount / totalConversations) * 100)
    : null;

  // Daily buckets
  const dailyConversations: Record<string, number> = {};
  const dailyMessages: Record<string, number> = {};
  filtered.forEach((l) => {
    const key = formatDayKey(l.createdAt);
    dailyConversations[key] = (dailyConversations[key] ?? 0) + 1;
    dailyMessages[key] = (dailyMessages[key] ?? 0) + (l.totalMessages ?? 0);
  });

  // Status distribution
  const statusDistribution: Record<string, number> = {};
  filtered.forEach((l) => {
    const s = l.status || "other";
    statusDistribution[s] = (statusDistribution[s] ?? 0) + 1;
  });

  // Last activity
  const sortedDates = filtered
    .map((l) => l.updatedAt || l.createdAt)
    .filter(Boolean)
    .sort()
    .reverse();
  const lastActivity = sortedDates[0] ?? null;

  return {
    clinicId,
    clinicName,
    plan: clinic.plan,
    modules: clinic.modules,
    status: clinic.status,
    totalConversations,
    totalMessages,
    resolvedCount,
    resolvedRate,
    appointments,
    liveSupport,
    unanswered,
    needsTraining,
    lastActivity,
    dailyConversations,
    dailyMessages,
    statusDistribution,
  };
}

export function calculateGlobalMetrics(
  clinics: Clinic[],
  clinicAnalyticsList: ClinicAnalytics[]
): GlobalAnalytics {
  const totalClinics = clinics.length;
  const activeClinics = clinics.filter((c) => c.status === "active").length;

  const totalConversations = clinicAnalyticsList.reduce((s, c) => s + c.totalConversations, 0);
  const totalMessages = clinicAnalyticsList.reduce((s, c) => s + c.totalMessages, 0);
  const resolvedCount = clinicAnalyticsList.reduce((s, c) => s + c.resolvedCount, 0);
  const appointments = clinicAnalyticsList.reduce((s, c) => s + c.appointments, 0);
  const liveSupport = clinicAnalyticsList.reduce((s, c) => s + c.liveSupport, 0);
  const unanswered = clinicAnalyticsList.reduce((s, c) => s + c.unanswered, 0);
  const needsTraining = clinicAnalyticsList.reduce((s, c) => s + c.needsTraining, 0);

  const resolvedRate = totalConversations > 0
    ? Math.round((resolvedCount / totalConversations) * 100)
    : null;

  // Merge daily buckets
  const dailyConversations: Record<string, number> = {};
  const dailyMessages: Record<string, number> = {};
  const statusDistribution: Record<string, number> = {};

  clinicAnalyticsList.forEach((ca) => {
    Object.entries(ca.dailyConversations).forEach(([k, v]) => {
      dailyConversations[k] = (dailyConversations[k] ?? 0) + v;
    });
    Object.entries(ca.dailyMessages).forEach(([k, v]) => {
      dailyMessages[k] = (dailyMessages[k] ?? 0) + v;
    });
    Object.entries(ca.statusDistribution).forEach(([k, v]) => {
      statusDistribution[k] = (statusDistribution[k] ?? 0) + v;
    });
  });

  return {
    totalClinics,
    activeClinics,
    totalConversations,
    totalMessages,
    resolvedCount,
    resolvedRate,
    appointments,
    liveSupport,
    unanswered,
    needsTraining,
    dailyConversations,
    dailyMessages,
    statusDistribution,
    clinics: clinicAnalyticsList,
  };
}

// ─── Relative Time ────────────────────────────────────────────────────────────

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Az önce";
    if (mins < 60) return `${mins} dk önce`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} saat önce`;
    const days = Math.floor(hrs / 24);
    return `${days} gün önce`;
  } catch {
    return "—";
  }
}

// ─── Package Limits ───────────────────────────────────────────────────────────

export interface PackageLimit {
  maxConversations: number | "unlimited";
  maxMessages: number | "unlimited";
  aiActive: boolean;
  widgetActive: boolean;
  voiceActive: boolean;
  voiceOptional?: boolean;
}

export const PACKAGE_LIMITS: Record<string, PackageLimit> = {
  trial: {
    maxConversations: 100,
    maxMessages: 1000,
    aiActive: true,
    widgetActive: true,
    voiceActive: false,
  },
  starter: {
    maxConversations: 100,
    maxMessages: 1000,
    aiActive: true,
    widgetActive: true,
    voiceActive: false,
  },
  pro: {
    maxConversations: 1000,
    maxMessages: 10000,
    aiActive: true,
    widgetActive: true,
    voiceActive: false,
    voiceOptional: true,
  },
  enterprise: {
    maxConversations: "unlimited",
    maxMessages: "unlimited",
    aiActive: true,
    widgetActive: true,
    voiceActive: true,
    voiceOptional: true,
  }
};

export function getUsageWarnings(usagePercentage: number): {
  level: "normal" | "warning" | "critical";
  message: string | null;
  color: string;
} {
  if (usagePercentage >= 100) {
    return {
      level: "critical",
      message: "Bu klinik mevcut paket limitini aştı.",
      color: "#ef4444" // red
    };
  }
  if (usagePercentage >= 90) {
    return {
      level: "critical",
      message: "Bu klinik aylık kullanım limitine yaklaştı. Paket yükseltme önerilebilir.",
      color: "#ef4444" // red
    };
  }
  if (usagePercentage >= 70) {
    return {
      level: "warning",
      message: `Bu klinik aylık kullanım limitinin %${usagePercentage}'sini geçti.`,
      color: "#fb923c" // orange
    };
  }
  return {
    level: "normal",
    message: null,
    color: "#10b981" // green
  };
}
