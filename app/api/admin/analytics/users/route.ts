import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

function determineActivityStatus(
  logins7d: number,
  logins30d: number,
  totalLogins: number
): string {
  if (totalLogins === 0) return "Hiç Giriş Yapmadı";
  if (logins7d >= 5) return "Çok Aktif";
  if (logins7d >= 2) return "Aktif";
  if (logins30d > 0) return "Düşük Kullanım";
  return "Pasif";
}

export async function GET(req: Request) {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) return NextResponse.json({ error: "DB error" }, { status: 500 });

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const sevenDaysMs = 7 * oneDayMs;
    const thirtyDaysMs = 30 * oneDayMs;
    const startOfToday = new Date().setHours(0, 0, 0, 0);

    const [usersSnap, sessionsSnap, clinicsSnap] = await Promise.all([
      adminDb.collection("users").get(),
      adminDb.collection("user_sessions").get(),
      adminDb.collection("clinics").get()
    ]);

    const clinicsMap = new Map<string, string>();
    clinicsSnap.forEach(doc => {
      clinicsMap.set(doc.id, doc.data().name || "Bilinmiyor");
    });

    const userStatsMap = new Map<string, any>();

    // Initialize stats for all users
    usersSnap.forEach(doc => {
      const data = doc.data();
      userStatsMap.set(doc.id, {
        user_id: doc.id,
        name: data.name || "İsimsiz Kullanıcı",
        email: data.email || "",
        role: data.role || "Bilinmiyor",
        clinic_id: data.clinicId || null,
        clinic_name: data.clinicId ? (clinicsMap.get(data.clinicId) || "Bilinmiyor") : "-",
        status: data.status || "active",
        createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : null,
        
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
      });
    });

    // Aggregate sessions
    sessionsSnap.forEach(doc => {
      const data = doc.data();
      const uid = data.user_id;
      
      if (!userStatsMap.has(uid)) return; // Session for a deleted user?
      
      const stats = userStatsMap.get(uid);
      const loginTime = data.login_at;
      const duration = data.session_duration_seconds || 0;
      
      stats.logins_total++;
      stats.duration_total += duration;

      if (!stats.last_login_at || loginTime > stats.last_login_at) {
        stats.last_login_at = loginTime;
      }
      if (!stats.last_activity_at || data.last_activity_at > stats.last_activity_at) {
        stats.last_activity_at = data.last_activity_at;
      }

      if (loginTime >= now - thirtyDaysMs) {
        stats.logins_30d++;
        stats.duration_30d += duration;
      }

      if (loginTime >= now - sevenDaysMs) {
        stats.logins_7d++;
        stats.duration_7d += duration;
      }

      if (loginTime >= startOfToday) {
        stats.logins_today++;
        stats.duration_today += duration;
      }
    });

    // Finalize status and mapping
    const usersData = Array.from(userStatsMap.values()).map(stats => {
      return {
        ...stats,
        activity_status: determineActivityStatus(stats.logins_7d, stats.logins_30d, stats.logins_total)
      };
    });

    return NextResponse.json({ users: usersData });

  } catch (err: any) {
    console.error("Analytics users error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
