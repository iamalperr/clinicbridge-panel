import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyAuth, AuthError } from "@/lib/services/apiAuth";
import { isSuperAdmin } from "@/lib/types";
import { parseMillis, getStartOfDay } from "@/lib/services/analyticsService";

export async function GET(req: Request) {
  const startTime = Date.now();
  try {
    const authResult = await verifyAuth(req);
    const { uid, profile } = authResult;

    // Role check: Only Super Admin, Admin, Clinic Admin, and Agency Admin have access
    const role = profile.role;
    if (!isSuperAdmin(role) && role !== "clinicAdmin" && role !== "agencyAdmin") {
      return NextResponse.json(
        { error: "Bu analitik verilerine erişim yetkiniz bulunmamaktadır." },
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

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const sevenDaysMs = 7 * oneDayMs;
    const thirtyDaysMs = 30 * oneDayMs;
    const sevenDaysAgo = now - sevenDaysMs;
    const thirtyDaysAgo = now - thirtyDaysMs;
    const startOfToday = getStartOfDay(now);
    const FIVE_MINS_MS = 5 * 60 * 1000;

    // 1. Fetch clinics to map agency relationships if needed
    const clinicsSnap = await adminDb.collection("clinics").get();
    const agencyClinicIds = new Set<string>();
    if (role === "agencyAdmin" && profile.agencyId) {
      clinicsSnap.forEach(doc => {
        const cData = doc.data();
        if (cData.agencyId === profile.agencyId) {
          agencyClinicIds.add(doc.id);
        }
      });
    }

    // 2. Fetch users collection
    const usersSnap = await adminDb.collection("users").get();
    
    // Map of authorized user IDs (doc.id, uid, and email) to a unique canonical user ID
    const validUserDocIds = new Set<string>();
    const idToCanonicalMap = new Map<string, string>();

    usersSnap.forEach(doc => {
      const data = doc.data();
      const docId = doc.id;
      const userUid = data.uid || docId;
      const userEmail = data.email?.toLowerCase();
      const userClinicId = data.clinicId || null;
      const userAgencyId = data.agencyId || null;
      const userRole = data.role;

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

      if (userParam) {
        const matchesUser = (docId === userParam || userUid === userParam || userEmail === userParam.toLowerCase());
        if (!matchesUser) return;
      }

      validUserDocIds.add(docId);
      idToCanonicalMap.set(docId, docId);
      if (userUid) idToCanonicalMap.set(userUid, docId);
      if (userEmail) idToCanonicalMap.set(userEmail, docId);
    });

    const totalUsers = validUserDocIds.size;

    // 3. Fetch user sessions
    const sessionsSnap = await adminDb.collection("user_sessions").get();

    const activeUsersToday = new Set<string>();
    const activeUsers7d = new Set<string>();
    const activeUsers30d = new Set<string>();
    const currentlyActiveUsers = new Set<string>();
    
    let totalSessionsToday = 0;
    let totalSessionDuration30d = 0;
    let sessionCount30d = 0;

    sessionsSnap.forEach(doc => {
      const data = doc.data();
      const sessionUserId = data.user_id;
      const sessionEmail = data.email?.toLowerCase();

      // Resolve canonical user
      const canonicalId = (sessionUserId && idToCanonicalMap.get(sessionUserId)) ||
                          (sessionEmail && idToCanonicalMap.get(sessionEmail)) ||
                          null;

      if (!canonicalId || !validUserDocIds.has(canonicalId)) {
        return; // Not in authorized scope / filtered out
      }

      const loginAt = parseMillis(data.login_at);
      const lastActivityAt = parseMillis(data.last_activity_at) || loginAt;
      const duration = typeof data.session_duration_seconds === "number" ? Math.max(0, data.session_duration_seconds) : 0;

      // Check 30-day window
      if ((lastActivityAt && lastActivityAt >= thirtyDaysAgo) || (loginAt && loginAt >= thirtyDaysAgo)) {
        activeUsers30d.add(canonicalId);
        totalSessionDuration30d += duration;
        sessionCount30d++;
      }

      // Check 7-day window
      if ((lastActivityAt && lastActivityAt >= sevenDaysAgo) || (loginAt && loginAt >= sevenDaysAgo)) {
        activeUsers7d.add(canonicalId);
      }

      // Check today's activity
      if ((lastActivityAt && lastActivityAt >= startOfToday) || (loginAt && loginAt >= startOfToday)) {
        activeUsersToday.add(canonicalId);
      }

      // Check today's login count
      if (loginAt && loginAt >= startOfToday) {
        totalSessionsToday++;
      }

      // Check currently active (status active and last activity within 5 mins)
      if (data.status === "active" && lastActivityAt && (now - lastActivityAt <= FIVE_MINS_MS)) {
        currentlyActiveUsers.add(canonicalId);
      }
    });

    const inactiveUsers30d = Math.max(0, totalUsers - activeUsers30d.size);
    const avgSessionTimeSeconds = sessionCount30d > 0 ? Math.floor(totalSessionDuration30d / sessionCount30d) : 0;

    console.log(`[Analytics:Summary] Admin: ${uid} (${role}), ScopedUsers: ${totalUsers}, ActiveToday: ${activeUsersToday.size}, Active30d: ${activeUsers30d.size}, DurationMs: ${Date.now() - startTime}`);

    return NextResponse.json({
      totalUsers,
      activeUsersToday: activeUsersToday.size,
      activeUsers7d: activeUsers7d.size,
      activeUsers30d: activeUsers30d.size,
      totalSessionsToday,
      avgSessionTimeSeconds,
      inactiveUsers30d,
      currentlyActiveUsers: currentlyActiveUsers.size
    });

  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[Analytics:Summary] Error:", err);
    return NextResponse.json({ error: err.message || "İç sunucu hatası oluştu." }, { status: 500 });
  }
}
