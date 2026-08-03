import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyAuth, AuthError } from "@/lib/services/apiAuth";
import { isSuperAdmin } from "@/lib/types";
import { parseMillis, getStartOfDay, calculateActivityStatus } from "@/lib/services/analyticsService";
import type { UserAnalyticsSummary } from "@/lib/types/analytics";

export async function GET(req: Request) {
  const startTime = Date.now();
  try {
    const authResult = await verifyAuth(req);
    const { uid, profile } = authResult;

    // Role check: Only Super Admin, Admin, Clinic Admin, and Agency Admin have access
    const role = profile.role;
    if (!isSuperAdmin(role) && role !== "clinicAdmin" && role !== "agencyAdmin") {
      return NextResponse.json(
        { error: "Bu kullanıcı verilerine erişim yetkiniz bulunmamaktadır." },
        { status: 403 }
      );
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: "Veritabanı bağlantısı kurulamadı." }, { status: 503 });
    }

    const url = new URL(req.url);
    const userParam = url.searchParams.get("user")?.trim() || null;
    const clinicParam = url.searchParams.get("clinic_id")?.trim() || null;
    const agencyParam = url.searchParams.get("agency_id")?.trim() || null;
    const roleParam = url.searchParams.get("role")?.trim() || null;
    const statusParam = url.searchParams.get("status")?.trim() || null;
    const searchParam = url.searchParams.get("search")?.toLowerCase().trim() || null;

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const sevenDaysMs = 7 * oneDayMs;
    const thirtyDaysMs = 30 * oneDayMs;
    const sevenDaysAgo = now - sevenDaysMs;
    const thirtyDaysAgo = now - thirtyDaysMs;
    const startOfToday = getStartOfDay(now);

    // 1. Fetch clinics to map clinic names & agency relationships
    const clinicsSnap = await adminDb.collection("clinics").get();
    const clinicsMap = new Map<string, string>();
    const agencyClinicIds = new Set<string>();

    clinicsSnap.forEach(doc => {
      const cData = doc.data();
      clinicsMap.set(doc.id, cData.name || "Bilinmiyor");
      if (role === "agencyAdmin" && profile.agencyId && cData.agencyId === profile.agencyId) {
        agencyClinicIds.add(doc.id);
      }
    });

    // 2. Fetch users collection
    const usersSnap = await adminDb.collection("users").get();
    const userStatsMap = new Map<string, UserAnalyticsSummary & { docId: string; uid?: string; emailLower?: string }>();
    const idToCanonicalMap = new Map<string, string>();

    usersSnap.forEach(doc => {
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
      const clinicName = userClinicId ? (clinicsMap.get(userClinicId) || "Bilinmiyor") : "-";

      // Tenant Scoping check
      let isAuthorized = false;
      if (isSuperAdmin(role)) {
        isAuthorized = true;
      } else if (role === "clinicAdmin") {
        isAuthorized = (userClinicId === profile.clinicId);
      } else if (role === "agencyAdmin") {
        isAuthorized = (userAgencyId === profile.agencyId) || (!!userClinicId && agencyClinicIds.has(userClinicId));
      }

      if (!isAuthorized) return;

      // Apply query filters
      if (clinicParam && userClinicId !== clinicParam) return;
      if (agencyParam && userAgencyId !== agencyParam) return;
      if (roleParam && userRole !== roleParam) return;
      if (statusParam && userStatus !== statusParam) return;

      if (userParam) {
        const matchesUser = (docId === userParam || userUid === userParam || emailLower === userParam.toLowerCase());
        if (!matchesUser) return;
      }

      if (searchParam) {
        const matchesSearch = userName.toLowerCase().includes(searchParam) ||
                              emailLower.includes(searchParam) ||
                              clinicName.toLowerCase().includes(searchParam) ||
                              userRole.toLowerCase().includes(searchParam);
        if (!matchesSearch) return;
      }

      // Initialize base summary for every valid user
      const userRecord: UserAnalyticsSummary & { docId: string; uid?: string; emailLower?: string } = {
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
        last_login_at: null,
        logins_today: 0,
        logins_7d: 0,
        logins_30d: 0,
        logins_total: 0,
        duration_today: 0,
        duration_7d: 0,
        duration_30d: 0,
        duration_total: 0,
        last_activity_at: null,
        activity_status: "Hiç Giriş Yapmadı"
      };

      userStatsMap.set(docId, userRecord);
      idToCanonicalMap.set(docId, docId);
      if (userUid) idToCanonicalMap.set(userUid, docId);
      if (emailLower) idToCanonicalMap.set(emailLower, docId);
    });

    // 3. Fetch user sessions and aggregate stats
    const sessionsSnap = await adminDb.collection("user_sessions").get();

    sessionsSnap.forEach(doc => {
      const data = doc.data();
      const sessionUserId = data.user_id;
      const sessionEmail = data.email?.toLowerCase();

      // Resolve canonical user ID
      const canonicalId = (sessionUserId && idToCanonicalMap.get(sessionUserId)) ||
                          (sessionEmail && idToCanonicalMap.get(sessionEmail)) ||
                          null;

      if (!canonicalId || !userStatsMap.has(canonicalId)) {
        return; // Session belongs to an excluded or out-of-scope user
      }

      const stats = userStatsMap.get(canonicalId)!;
      const loginTime = parseMillis(data.login_at);
      const activityTime = parseMillis(data.last_activity_at) || loginTime;
      const duration = typeof data.session_duration_seconds === "number" ? Math.max(0, data.session_duration_seconds) : 0;

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

    // 4. Finalize activity status
    const usersData: UserAnalyticsSummary[] = Array.from(userStatsMap.values()).map(record => {
      const { docId, uid: _uid, emailLower: _el, ...summary } = record;
      summary.activity_status = calculateActivityStatus(summary.last_activity_at, summary.logins_total, now);
      return summary;
    });

    // Sort users: active users first, then by last login desc
    usersData.sort((a, b) => {
      const aTime = a.last_activity_at || a.last_login_at || 0;
      const bTime = b.last_activity_at || b.last_login_at || 0;
      return bTime - aTime;
    });

    console.log(`[Analytics:Users] Admin: ${uid} (${role}), ReturnedUsers: ${usersData.length}, DurationMs: ${Date.now() - startTime}`);

    return NextResponse.json({ users: usersData, total: usersData.length });

  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[Analytics:Users] Error:", err);
    return NextResponse.json({ error: err.message || "İç sunucu hatası oluştu." }, { status: 500 });
  }
}
