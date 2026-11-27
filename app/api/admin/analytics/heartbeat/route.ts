import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { parseMillis } from "@/lib/services/analyticsService";
import { shouldPersistActivity } from "@/lib/services/analytics/heartbeatScheduler";
import { mapInfrastructureError } from "@/lib/services/infrastructureErrors";

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

    // Module-level singleton (lib/firebase-admin) — do not re-init per request.
    const adminDb = getAdminDb();
    if (!adminDb) return NextResponse.json({ error: "DB error" }, { status: 500 });

    // Unload without a known session: nothing to close.
    if (is_unload && !session_id) {
      return NextResponse.json({ success: true, message: "Unload ignored as no active session" });
    }

    const sessionsRef = adminDb.collection("user_sessions");
    const now = Date.now();

    let currentSessionId = typeof session_id === "string" && session_id ? session_id : null;
    let sessionDocRef = currentSessionId ? sessionsRef.doc(currentSessionId) : null;
    let sessionData = sessionDocRef ? (await sessionDocRef.get()).data() : null;
    let isFreshSession = false;

    const lastActivity = sessionData
      ? parseMillis(sessionData.last_activity_at) || parseMillis(sessionData.login_at) || 0
      : 0;

    const needsNewSession =
      !sessionData ||
      sessionData.status !== "active" ||
      now - lastActivity > MAX_IDLE_BEFORE_EXPIRE_MS;

    // Hot path: existing active session whose last_activity is still fresh → one read, zero writes.
    if (!needsNewSession && sessionDocRef && currentSessionId) {
      if (is_unload) {
        // Beacon unload: mark idle/expire only when past the idle window; otherwise no-op.
        if (now - lastActivity > MAX_IDLE_BEFORE_EXPIRE_MS) {
          await sessionDocRef.update({
            status: "expired",
            logout_at: lastActivity,
          });
        }
        return NextResponse.json({ success: true, session_id: currentSessionId });
      }

      if (!is_idle) {
        if (!shouldPersistActivity(now, lastActivity)) {
          return NextResponse.json({ success: true, session_id: currentSessionId });
        }
        const sessionLoginAt = parseMillis(sessionData!.login_at) || now;
        await sessionDocRef.update({
          last_activity_at: now,
          session_duration_seconds: Math.max(0, Math.floor((now - sessionLoginAt) / 1000)),
        });
        return NextResponse.json({ success: true, session_id: currentSessionId });
      }

      // Idle ping: expire only when past the window.
      if (now - lastActivity > MAX_IDLE_BEFORE_EXPIRE_MS) {
        await sessionDocRef.update({
          status: "expired",
          logout_at: lastActivity,
        });
      }
      return NextResponse.json({ success: true, session_id: currentSessionId });
    }

    // Cold path: open / rotate session (UA parse only here).
    if (sessionData && sessionData.status === "active" && sessionDocRef) {
      const loginAt = parseMillis(sessionData.login_at) || lastActivity;
      const durationSec = Math.max(0, Math.floor((lastActivity - loginAt) / 1000));
      await sessionDocRef.update({
        status: "expired",
        logout_at: lastActivity,
        session_duration_seconds: durationSec,
      });
    }

    if (is_unload) {
      return NextResponse.json({ success: true, message: "Unload ignored as no active session" });
    }

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const userAgent = req.headers.get("user-agent") || "";
    const { browser, os, device } = parseUserAgent(userAgent);

    const newSessionData = {
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
      status: "active",
    };

    const newSessionRef = await sessionsRef.add(newSessionData);
    currentSessionId = newSessionRef.id;
    sessionDocRef = newSessionRef;
    sessionData = newSessionData;
    isFreshSession = true;

    await adminDb.collection("activity_events").add({
      user_id,
      clinic_id: clinic_id || null,
      session_id: currentSessionId,
      event_name: "user_logged_in",
      page_path: page_path || "/",
      created_at: now,
    });

    try {
      const userDocRef = adminDb.collection("users").doc(user_id);
      const userSnap = await userDocRef.get();
      if (userSnap.exists) {
        await userDocRef.set({ lastLoginAt: now, lastActiveAt: now }, { merge: true });
      }
    } catch {
      // Non-fatal
    }

    if (!sessionData || !sessionDocRef) {
      throw new Error("Failed to resolve session");
    }

    // Fresh session already stamped last_activity_at; no second update needed.
    void isFreshSession;

    return NextResponse.json({ success: true, session_id: currentSessionId });
  } catch (err: unknown) {
    console.error("Heartbeat error:", err);
    const mapped = mapInfrastructureError(err);
    return NextResponse.json(
      { error: mapped.error, code: mapped.code },
      { status: mapped.status }
    );
  }
}
