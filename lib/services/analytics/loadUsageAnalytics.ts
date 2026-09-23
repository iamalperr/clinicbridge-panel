/**
 * Shared Kullanım Analitiği loader — one bounded session enrichment pass,
 * summary KPIs from user docs + cheap session aggregations (no duplicate scans).
 */

import { AggregateField, type Firestore, type Query } from "firebase-admin/firestore";
import { isSuperAdmin } from "@/lib/types";
import type { UserAnalyticsSummary } from "@/lib/types/analytics";
import {
  calculateActivityStatus,
  getStartOfDay,
  parseMillis,
} from "@/lib/services/analyticsService";
import {
  ANALYTICS_SESSION_WINDOW_MS,
  buildAnalyticsSessionQueryPlan,
  fetchUserSessionsForAnalytics,
} from "@/lib/services/analytics/userSessionsQuery";

const FIVE_MINS_MS = 5 * 60 * 1000;
const USERS_HARD_LIMIT = 2000;
const CLINICS_HARD_LIMIT = 500;

export type UsageAnalyticsSummary = {
  totalUsers: number;
  activeUsersToday: number;
  activeUsers7d: number;
  activeUsers30d: number;
  totalSessionsToday: number | null;
  avgSessionTimeSeconds: number | null;
  inactiveUsers30d: number;
  currentlyActiveUsers: number;
};

export type UsageAnalyticsMeta = {
  sessionWindowDays: number;
  sessionDocsLoaded: number;
  sessionReadsEstimate: number;
  truncated: boolean;
  /** Per-user login/duration columns may undercount when truncated */
  sessionStatsPartial: boolean;
  /** Summary distinct-user KPIs come from users.* timestamps — reliable even if truncated */
  summaryReliable: boolean;
  aggregationsOk: boolean;
};

export type UsageAnalyticsPayload = {
  summary: UsageAnalyticsSummary;
  users: UserAnalyticsSummary[];
  meta: UsageAnalyticsMeta;
};

export type UsageAnalyticsAuthProfile = {
  role: string;
  clinicId?: string | null;
  agencyId?: string | null;
};

async function aggregateSessionStats(
  adminDb: Firestore,
  opts: { sinceMs: number; loginSinceMs: number; userIds: string[] | null }
): Promise<{
  sessionsToday: number;
  sessions30d: number;
  duration30d: number;
  ok: boolean;
}> {
  try {
    const col = adminDb.collection("user_sessions");

    // Today logins (by login_at)
    let todayQ: Query = col.where("login_at", ">=", opts.loginSinceMs);
    // 30d activity window
    let windowQ: Query = col.where("last_activity_at", ">=", opts.sinceMs);

    // Filtered-user: constrain aggregations too (use primary auth uid when possible)
    if (opts.userIds && opts.userIds.length === 1) {
      todayQ = todayQ.where("user_id", "==", opts.userIds[0]);
      windowQ = windowQ.where("user_id", "==", opts.userIds[0]);
    } else if (opts.userIds && opts.userIds.length > 1) {
      // Multiple ids (docId + uid): run for first uid-like id only if we can; else skip filter
      // Prefer the longer set by querying without user filter only when unfiltered.
      // For multi-id filtered mode, use the first id and accept slight undercount vs scanning all.
      todayQ = todayQ.where("user_id", "==", opts.userIds[0]);
      windowQ = windowQ.where("user_id", "==", opts.userIds[0]);
    }

    const [todaySnap, windowSnap] = await Promise.all([
      todayQ.aggregate({ count: AggregateField.count() }).get(),
      windowQ
        .aggregate({
          count: AggregateField.count(),
          totalDuration: AggregateField.sum("session_duration_seconds"),
        })
        .get(),
    ]);

    const sessionsToday = Number(todaySnap.data().count || 0);
    const sessions30d = Number(windowSnap.data().count || 0);
    const duration30d = Number(windowSnap.data().totalDuration || 0);

    return { sessionsToday, sessions30d, duration30d, ok: true };
  } catch (err) {
    console.error("[Analytics] Session aggregation failed:", err);
    return { sessionsToday: 0, sessions30d: 0, duration30d: 0, ok: false };
  }
}

export async function loadUsageAnalytics(
  adminDb: Firestore,
  profile: UsageAnalyticsAuthProfile,
  query: {
    user?: string | null;
    clinic_id?: string | null;
    agency_id?: string | null;
    role?: string | null;
    status?: string | null;
    search?: string | null;
  }
): Promise<UsageAnalyticsPayload> {
  const role = profile.role;
  const userParam = query.user?.trim() || null;
  const clinicParam = query.clinic_id?.trim() || null;
  const agencyParam = query.agency_id?.trim() || null;
  const roleParam = query.role?.trim() || null;
  const statusParam = query.status?.trim() || null;
  const searchParam = query.search?.toLowerCase().trim() || null;

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = now - ANALYTICS_SESSION_WINDOW_MS;
  const startOfToday = getStartOfDay(now);

  // Clinics (bounded hard cap — fail loudly if exceeded)
  const clinicsSnap = await adminDb.collection("clinics").limit(CLINICS_HARD_LIMIT + 1).get();
  if (clinicsSnap.size > CLINICS_HARD_LIMIT) {
    throw new Error(
      `Klinik sayısı analitik limitini (${CLINICS_HARD_LIMIT}) aşıyor. Lütfen destek ile iletişime geçin.`
    );
  }
  const clinicsMap = new Map<string, string>();
  const agencyClinicIds = new Set<string>();
  clinicsSnap.forEach((doc) => {
    const cData = doc.data();
    clinicsMap.set(doc.id, cData.name || "Bilinmiyor");
    if (role === "agencyAdmin" && profile.agencyId && cData.agencyId === profile.agencyId) {
      agencyClinicIds.add(doc.id);
    }
  });

  // Users (bounded hard cap)
  const usersSnap = await adminDb.collection("users").limit(USERS_HARD_LIMIT + 1).get();
  if (usersSnap.size > USERS_HARD_LIMIT) {
    throw new Error(
      `Kullanıcı sayısı analitik limitini (${USERS_HARD_LIMIT}) aşıyor. Lütfen destek ile iletişime geçin.`
    );
  }

  const userStatsMap = new Map<
    string,
    UserAnalyticsSummary & { docId: string; uid?: string; emailLower?: string }
  >();
  const idToCanonicalMap = new Map<string, string>();
  const sessionUserIds = new Set<string>();

  usersSnap.forEach((doc) => {
    const data = doc.data();
    const docId = doc.id;
    const userUid = data.uid || docId;
    const userEmail = data.email || "";
    const emailLower = userEmail.toLowerCase();
    const userClinicId = data.clinicId || null;
    const userAgencyId = data.agencyId || null;
    const userRole = data.role || "Bilinmiyor";
    const userStatus = data.status || "active";
    const userName = data.name || userEmail || "İsimsiz Kullanıcı";
    const clinicName = userClinicId ? clinicsMap.get(userClinicId) || "Bilinmiyor" : "-";

    let isAuthorized = false;
    if (isSuperAdmin(role)) isAuthorized = true;
    else if (role === "clinicAdmin") isAuthorized = userClinicId === profile.clinicId;
    else if (role === "agencyAdmin") {
      isAuthorized =
        userAgencyId === profile.agencyId ||
        (!!userClinicId && agencyClinicIds.has(userClinicId));
    }
    if (!isAuthorized) return;

    if (clinicParam && userClinicId !== clinicParam) return;
    if (agencyParam && userAgencyId !== agencyParam) return;
    if (roleParam && userRole !== roleParam) return;
    if (statusParam && userStatus !== statusParam) return;

    if (userParam) {
      const matchesUser =
        docId === userParam ||
        userUid === userParam ||
        emailLower === userParam.toLowerCase();
      if (!matchesUser) return;
    }

    if (searchParam) {
      const matchesSearch =
        userName.toLowerCase().includes(searchParam) ||
        emailLower.includes(searchParam) ||
        clinicName.toLowerCase().includes(searchParam) ||
        userRole.toLowerCase().includes(searchParam);
      if (!matchesSearch) return;
    }

    const lastLoginAt = parseMillis(data.lastLoginAt);
    const lastActiveAt = parseMillis(data.lastActiveAt) || lastLoginAt;

    userStatsMap.set(docId, {
      docId,
      uid: userUid,
      emailLower,
      user_id: docId,
      name: userName,
      email: userEmail,
      role: userRole,
      clinic_id: userClinicId,
      clinic_name: clinicName,
      status: userStatus,
      last_login_at: lastLoginAt,
      logins_today: 0,
      logins_7d: 0,
      logins_30d: 0,
      logins_total: 0,
      duration_today: 0,
      duration_7d: 0,
      duration_30d: 0,
      duration_total: 0,
      last_activity_at: lastActiveAt,
      activity_status: "Hiç Giriş Yapmadı",
    });

    idToCanonicalMap.set(docId, docId);
    if (userUid) {
      idToCanonicalMap.set(userUid, docId);
      sessionUserIds.add(userUid);
    }
    sessionUserIds.add(docId);
    if (emailLower) idToCanonicalMap.set(emailLower, docId);
  });

  const totalUsers = userStatsMap.size;

  // Distinct-user KPIs from user docs (reliable; no session scan)
  const activeUsersToday = new Set<string>();
  const activeUsers7d = new Set<string>();
  const activeUsers30d = new Set<string>();
  const currentlyActiveUsers = new Set<string>();

  for (const [docId, u] of userStatsMap) {
    const ts = u.last_activity_at || u.last_login_at;
    if (!ts) continue;
    if (ts >= thirtyDaysAgo) activeUsers30d.add(docId);
    if (ts >= sevenDaysAgo) activeUsers7d.add(docId);
    if (ts >= startOfToday) activeUsersToday.add(docId);
    if (now - ts <= FIVE_MINS_MS) currentlyActiveUsers.add(docId);
  }

  // Cheap session aggregations for global session KPIs
  const aggUserIds =
    userParam && sessionUserIds.size > 0 ? Array.from(sessionUserIds) : null;
  // Prefer Auth uid for aggregation filter when available
  let aggFilterIds: string[] | null = null;
  if (aggUserIds && aggUserIds.length > 0) {
    const preferred = Array.from(userStatsMap.values())
      .map((u) => u.uid)
      .filter(Boolean) as string[];
    aggFilterIds = preferred.length > 0 ? [preferred[0]] : [aggUserIds[0]];
  }

  const agg = await aggregateSessionStats(adminDb, {
    sinceMs: thirtyDaysAgo,
    loginSinceMs: startOfToday,
    userIds: aggFilterIds,
  });

  const avgSessionTimeSeconds =
    agg.ok && agg.sessions30d > 0
      ? Math.floor(agg.duration30d / agg.sessions30d)
      : agg.ok
        ? 0
        : null;

  // One bounded session enrichment for per-user table columns
  let sessionDocs: Awaited<ReturnType<typeof fetchUserSessionsForAnalytics>>["docs"] = [];
  let truncated = false;
  let readsEstimate = 0;

  if (!userParam || sessionUserIds.size > 0) {
    const plan = buildAnalyticsSessionQueryPlan({
      now,
      userIds: userParam ? Array.from(sessionUserIds) : null,
    });
    const fetched = await fetchUserSessionsForAnalytics(adminDb, plan);
    sessionDocs = fetched.docs;
    truncated = fetched.truncated;
    readsEstimate = fetched.readsEstimate;
  }

  sessionDocs.forEach((doc) => {
    const data = doc.data();
    const sessionUserId = data.user_id;
    const sessionEmail = data.email?.toLowerCase();
    const canonicalId =
      (sessionUserId && idToCanonicalMap.get(sessionUserId)) ||
      (sessionEmail && idToCanonicalMap.get(sessionEmail)) ||
      null;
    if (!canonicalId || !userStatsMap.has(canonicalId)) return;

    const stats = userStatsMap.get(canonicalId)!;
    const loginTime = parseMillis(data.login_at);
    const activityTime = parseMillis(data.last_activity_at) || loginTime;
    const duration =
      typeof data.session_duration_seconds === "number"
        ? Math.max(0, data.session_duration_seconds)
        : 0;

    stats.logins_total++;
    stats.duration_total += duration;

    if (loginTime) {
      if (!stats.last_login_at || loginTime > stats.last_login_at) {
        stats.last_login_at = loginTime;
      }
      if (loginTime >= thirtyDaysAgo) {
        stats.logins_30d++;
        stats.duration_30d += duration;
      }
      if (loginTime >= sevenDaysAgo) {
        stats.logins_7d++;
        stats.duration_7d += duration;
      }
      if (loginTime >= startOfToday) {
        stats.logins_today++;
        stats.duration_today += duration;
      }
    }

    if (activityTime) {
      if (!stats.last_activity_at || activityTime > stats.last_activity_at) {
        stats.last_activity_at = activityTime;
      }
    }
  });

  const users: UserAnalyticsSummary[] = Array.from(userStatsMap.values()).map((record) => ({
    user_id: record.user_id,
    name: record.name,
    email: record.email,
    role: record.role,
    clinic_id: record.clinic_id,
    clinic_name: record.clinic_name,
    status: record.status,
    last_login_at: record.last_login_at,
    logins_today: record.logins_today,
    logins_7d: record.logins_7d,
    logins_30d: record.logins_30d,
    logins_total: record.logins_total,
    duration_today: record.duration_today,
    duration_7d: record.duration_7d,
    duration_30d: record.duration_30d,
    duration_total: record.duration_total,
    last_activity_at: record.last_activity_at,
    activity_status: calculateActivityStatus(
      record.last_activity_at,
      // Prefer activity timestamps from user doc even when session enrichment is empty
      Math.max(record.logins_total, record.last_activity_at ? 1 : 0),
      now
    ),
  }));

  users.sort((a, b) => {
    const aTime = a.last_activity_at || a.last_login_at || 0;
    const bTime = b.last_activity_at || b.last_login_at || 0;
    return bTime - aTime;
  });

  return {
    summary: {
      totalUsers,
      activeUsersToday: activeUsersToday.size,
      activeUsers7d: activeUsers7d.size,
      activeUsers30d: activeUsers30d.size,
      totalSessionsToday: agg.ok ? agg.sessionsToday : null,
      avgSessionTimeSeconds,
      inactiveUsers30d: Math.max(0, totalUsers - activeUsers30d.size),
      currentlyActiveUsers: currentlyActiveUsers.size,
    },
    users,
    meta: {
      sessionWindowDays: 30,
      sessionDocsLoaded: sessionDocs.length,
      sessionReadsEstimate: readsEstimate,
      truncated,
      sessionStatsPartial: truncated,
      summaryReliable: true,
      aggregationsOk: agg.ok,
    },
  };
}
