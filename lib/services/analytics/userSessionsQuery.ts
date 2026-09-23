/**
 * Bounded user_sessions reads for Kullanım Analitiği.
 * NEVER full-collection scan — date window + optional user_id filters + hard limit.
 */

import type {
  Firestore,
  Query,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";

/** Analytics dashboard window (matches existing 30-day KPIs). */
export const ANALYTICS_SESSION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Defensive cap for per-user table enrichment (summary KPIs use aggregations / user docs). */
export const USER_SESSIONS_QUERY_HARD_LIMIT = 500;

export type AnalyticsSessionQueryPlan = {
  mode: "date_window" | "user_and_date";
  sinceMs: number;
  /** Firebase Auth UIDs / stored user_id values to filter (null = all users in tenant scope) */
  userIds: string[] | null;
  hardLimit: number;
  /** Time fields queried with >= sinceMs (merged client-side by doc id) */
  timeFields: Array<"last_activity_at" | "login_at">;
};

export function buildAnalyticsSessionQueryPlan(opts: {
  now?: number;
  /** When set, sessions are loaded only for these user_id values */
  userIds?: string[] | null;
  windowMs?: number;
  hardLimit?: number;
}): AnalyticsSessionQueryPlan {
  const now = opts.now ?? Date.now();
  const windowMs = opts.windowMs ?? ANALYTICS_SESSION_WINDOW_MS;
  const userIds =
    opts.userIds && opts.userIds.length > 0
      ? Array.from(new Set(opts.userIds.filter(Boolean)))
      : null;

  return {
    mode: userIds ? "user_and_date" : "date_window",
    sinceMs: now - windowMs,
    userIds,
    hardLimit: opts.hardLimit ?? USER_SESSIONS_QUERY_HARD_LIMIT,
    // Heartbeat always writes last_activity_at; one range query avoids doubling reads.
    timeFields: ["last_activity_at"],
  };
}

/**
 * Guard used by tests / callers: a plan must never describe an unbounded collection read.
 */
export function assertAnalyticsSessionQueryIsBounded(plan: AnalyticsSessionQueryPlan): void {
  if (!Number.isFinite(plan.sinceMs) || plan.sinceMs <= 0) {
    throw new Error("Analytics session query missing date bound");
  }
  if (!plan.hardLimit || plan.hardLimit <= 0 || plan.hardLimit > 10_000) {
    throw new Error("Analytics session query hard limit invalid");
  }
  if (plan.mode === "user_and_date" && (!plan.userIds || plan.userIds.length === 0)) {
    throw new Error("user_and_date plan requires userIds");
  }
}

async function runBoundedTimeQuery(
  adminDb: Firestore,
  timeField: "last_activity_at" | "login_at",
  sinceMs: number,
  hardLimit: number,
  userId?: string
): Promise<QueryDocumentSnapshot[]> {
  let q: Query = adminDb.collection("user_sessions");
  if (userId) {
    q = q.where("user_id", "==", userId);
  }
  q = q.where(timeField, ">=", sinceMs).orderBy(timeField, "desc").limit(hardLimit);
  const snap = await q.get();
  return snap.docs;
}

/**
 * Load session docs for analytics. Merges login_at / last_activity_at windows
 * and optional per-user filters. Dedupes by document id.
 */
export async function fetchUserSessionsForAnalytics(
  adminDb: Firestore,
  plan: AnalyticsSessionQueryPlan
): Promise<{ docs: QueryDocumentSnapshot[]; truncated: boolean; readsEstimate: number }> {
  assertAnalyticsSessionQueryIsBounded(plan);

  const byId = new Map<string, QueryDocumentSnapshot>();
  let readsEstimate = 0;
  let truncated = false;

  const userIdList = plan.userIds && plan.userIds.length > 0 ? plan.userIds : [undefined];

  for (const userId of userIdList) {
    for (const timeField of plan.timeFields) {
      const docs = await runBoundedTimeQuery(
        adminDb,
        timeField,
        plan.sinceMs,
        plan.hardLimit,
        userId
      );
      readsEstimate += docs.length;
      if (docs.length >= plan.hardLimit) truncated = true;
      for (const d of docs) {
        byId.set(d.id, d);
      }
    }
  }

  if (truncated) {
    console.warn(
      `[Analytics:Sessions] Query hit hard limit=${plan.hardLimit} mode=${plan.mode} sinceMs=${plan.sinceMs}`
    );
  }

  return { docs: Array.from(byId.values()), truncated, readsEstimate };
}
