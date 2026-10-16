/**
 * Canonical timestamp normalization for ClinicBridge conversation / analytics dates.
 *
 * Supports every representation observed in this codebase and production data:
 * - ISO / parseable date strings
 * - epoch numbers (seconds or milliseconds)
 * - JS Date
 * - Firestore Timestamp (.toMillis / .toDate)
 * - plain { seconds, nanoseconds } (client Timestamp spread / JSON)
 * - plain { _seconds, _nanoseconds } (admin JSON / some serializers)
 *
 * Returns null for missing or unrecoverable values — never invents "now".
 */

export type TimestampLike =
  | string
  | number
  | Date
  | { toMillis: () => number }
  | { toDate: () => Date }
  | { seconds: number; nanoseconds?: number }
  | { _seconds: number; _nanoseconds?: number }
  | null
  | undefined;

/** Epoch milliseconds, or null if the value cannot be turned into a real instant. */
export function normalizeTimestampMs(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    // Heuristic: values below 1e11 are unix seconds (year ~1973 in ms vs 1973+ in seconds).
    return value < 100_000_000_000 ? Math.round(value * 1000) : Math.round(value);
  }

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : ms;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }

  if (typeof value === "object") {
    const v = value as Record<string, unknown>;

    if (typeof (v as { toMillis?: unknown }).toMillis === "function") {
      try {
        const ms = (v as { toMillis: () => number }).toMillis();
        return Number.isFinite(ms) ? ms : null;
      } catch {
        return null;
      }
    }

    if (typeof (v as { toDate?: unknown }).toDate === "function") {
      try {
        const d = (v as { toDate: () => Date }).toDate();
        const ms = d?.getTime?.();
        return typeof ms === "number" && !Number.isNaN(ms) ? ms : null;
      } catch {
        return null;
      }
    }

    if (typeof v.seconds === "number" && Number.isFinite(v.seconds)) {
      const nanos = typeof v.nanoseconds === "number" ? v.nanoseconds : 0;
      return v.seconds * 1000 + Math.round(nanos / 1_000_000);
    }

    if (typeof v._seconds === "number" && Number.isFinite(v._seconds)) {
      const nanos = typeof v._nanoseconds === "number" ? v._nanoseconds : 0;
      return v._seconds * 1000 + Math.round(nanos / 1_000_000);
    }
  }

  return null;
}

/** Date instance, or null. Never returns an Invalid Date. */
export function normalizeTimestamp(value: unknown): Date | null {
  const ms = normalizeTimestampMs(value);
  if (ms == null) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ISO-8601 UTC string, or null. */
export function normalizeTimestampIso(value: unknown): string | null {
  const d = normalizeTimestamp(value);
  return d ? d.toISOString() : null;
}

/**
 * Conversation list / CSV / filter instant.
 * Prefer createdAt; fall back to updatedAt when createdAt was never written
 * (appointment-state shell created before the first logConversation).
 * Does not invent the current time.
 */
export function resolveConversationTimestamp(log: {
  createdAt?: unknown;
  updatedAt?: unknown;
}): Date | null {
  return normalizeTimestamp(log.createdAt) ?? normalizeTimestamp(log.updatedAt);
}

export function formatConversationListDate(
  log: { createdAt?: unknown; updatedAt?: unknown },
  locale: string,
  missingLabel = "—"
): string {
  const d = resolveConversationTimestamp(log);
  if (!d) return missingLabel;
  return d.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
