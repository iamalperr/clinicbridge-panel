import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { parseMillis } from "@/lib/services/analyticsService";

const MAX_IDLE_BEFORE_EXPIRE_MS = 30 * 60 * 1000; // 30 minutes

function parseUserAgent(ua: string) {
  let browser = "Unknown";
  let os = "Unknown";
  let device = "desktop";

  if (/mobile/i.test(ua)) device = "mobile";
  else if (/tablet/i.test(ua)) device = "tablet";

  if (/windows/i.test(ua)) os = "Windows";
  else if (/mac/i.test(ua)) os = "MacOS";
  else if (/linux/i.test(ua)) os = "Linux";
  else if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";

  if (/chrome|crios/i.test(ua)) browser = "Chrome";
  else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
  else if (/safari/i.test(ua)) browser = "Safari";
  else if (/edg/i.test(ua)) browser = "Edge";

  return { browser, os, device };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { user_id, clinic_id, role, email, session_id, is_idle, is_unload, page_path } = body;

    if (!user_id) {
      return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
    }

    const adminDb = getAdminDb();
    if (!adminDb) return NextResponse.json({ error: "DB error" }, { status: 500 });

    const sessionsRef = adminDb.collection("user_sessions");
    const now = Date.now();

    // Grab request headers for analytics
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const userAgent = req.headers.get("user-agent") || "";
    const { browser, os, device } = parseUserAgent(userAgent);

    let currentSessionId = session_id;
    let sessionDocRef = currentSessionId ? sessionsRef.doc(currentSessionId) : null;
    let sessionData = sessionDocRef ? (await sessionDocRef.get()).data() : null;

    const lastActivity = sessionData ? (parseMillis(sessionData.last_activity_at) || parseMillis(sessionData.login_at) || 0) : 0;

    // Check if we need to create a new session
    const needsNewSession = !sessionData || 
                            sessionData.status !== "active" ||
                            (now - lastActivity > MAX_IDLE_BEFORE_EXPIRE_MS);

    if (needsNewSession) {
      if (sessionData && sessionData.status === "active") {
        // Close the old expired session
        const loginAt = parseMillis(sessionData.login_at) || lastActivity;
        const durationSec = Math.max(0, Math.floor((lastActivity - loginAt) / 1000));
        await sessionDocRef?.update({
          status: "expired",
          logout_at: lastActivity,
          session_duration_seconds: durationSec
        });
      }

      // If they are just unloading or already idle, ignore without starting new session
      if (is_unload) {
        return NextResponse.json({ success: true, message: "Unload ignored as no active session" });
      }

      // Create new session
      const newSessionRef = await sessionsRef.add({
        user_id,
        clinic_id: clinic_id || null,
        role: role || "unknown",
        email: email || "unknown",
        login_at: now,
        logout_at: null,
        last_activity_at: now,
        session_duration_seconds: 0,
        ip_address: ip,
        user_agent: userAgent,
        browser,
        operating_system: os,
        device_type: device,
        status: "active"
      });
      
      currentSessionId = newSessionRef.id;
      sessionDocRef = newSessionRef;
      sessionData = (await newSessionRef.get()).data();
      
      // Log login event
      await adminDb.collection("activity_events").add({
        user_id,
        clinic_id: clinic_id || null,
        session_id: currentSessionId,
        event_name: "user_logged_in",
        page_path: page_path || "/",
        created_at: now
      });

      // Update user doc in 'users' collection with lastLoginAt & lastActiveAt
      try {
        const userDocRef = adminDb.collection("users").doc(user_id);
        const userSnap = await userDocRef.get();
        if (userSnap.exists) {
          await userDocRef.set({ lastLoginAt: now, lastActiveAt: now }, { merge: true });
        }
      } catch (userDocErr) {
        // Non-fatal
      }
    }

    if (!sessionData || !sessionDocRef) {
      throw new Error("Failed to resolve session");
    }

    const updates: any = {};
    const sessionLoginAt = parseMillis(sessionData.login_at) || now;
    
    if (!is_idle) {
      updates.last_activity_at = now;
      updates.session_duration_seconds = Math.max(0, Math.floor((now - sessionLoginAt) / 1000));
    } else {
      // If idle for more than 30 mins, mark expired
      if (now - lastActivity > MAX_IDLE_BEFORE_EXPIRE_MS) {
        updates.status = "expired";
        updates.logout_at = lastActivity;
      }
    }

    if (Object.keys(updates).length > 0) {
      await sessionDocRef.update(updates);
    }

    return NextResponse.json({ success: true, session_id: currentSessionId });

  } catch (err: any) {
    console.error("Heartbeat error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
