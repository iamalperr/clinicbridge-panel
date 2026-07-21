import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export async function GET(req: Request) {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) return NextResponse.json({ error: "DB error" }, { status: 500 });

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const sevenDaysMs = 7 * oneDayMs;
    const thirtyDaysMs = 30 * oneDayMs;

    const startOfToday = new Date().setHours(0, 0, 0, 0);

    // Get all users
    const usersSnap = await adminDb.collection("users").get();
    const totalUsers = usersSnap.size;

    // Get recent sessions
    const thirtyDaysAgo = now - thirtyDaysMs;
    const sessionsSnap = await adminDb.collection("user_sessions")
      .where("last_activity_at", ">=", thirtyDaysAgo)
      .get();

    const activeUsersToday = new Set<string>();
    const activeUsers7d = new Set<string>();
    const activeUsers30d = new Set<string>();
    
    let totalSessionsToday = 0;
    let totalSessionDuration30d = 0;
    let sessionCount30d = 0;
    
    let currentlyActiveUsers = 0;
    const FIVE_MINS_MS = 5 * 60 * 1000;

    sessionsSnap.forEach(doc => {
      const data = doc.data();
      const userId = data.user_id;
      
      activeUsers30d.add(userId);
      totalSessionDuration30d += (data.session_duration_seconds || 0);
      sessionCount30d++;

      if (data.last_activity_at >= now - sevenDaysMs) {
        activeUsers7d.add(userId);
      }

      if (data.last_activity_at >= startOfToday) {
        activeUsersToday.add(userId);
        totalSessionsToday++;
      }

      if (data.status === "active" && data.last_activity_at >= now - FIVE_MINS_MS) {
        currentlyActiveUsers++;
      }
    });

    const inactiveUsers30d = totalUsers - activeUsers30d.size;
    const avgSessionTimeSeconds = sessionCount30d > 0 ? Math.floor(totalSessionDuration30d / sessionCount30d) : 0;

    return NextResponse.json({
      totalUsers,
      activeUsersToday: activeUsersToday.size,
      activeUsers7d: activeUsers7d.size,
      activeUsers30d: activeUsers30d.size,
      totalSessionsToday,
      avgSessionTimeSeconds,
      inactiveUsers30d,
      currentlyActiveUsers
    });
  } catch (err: any) {
    console.error("Analytics summary error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
