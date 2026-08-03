"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { usePathname } from "next/navigation";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const PING_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

export default function ActivityTracker() {
  const { user, profile } = useAuth();
  const pathname = usePathname();
  const lastActivityRef = useRef<number>(Date.now());
  const isIdleRef = useRef<boolean>(false);
  const sessionIdRef = useRef<string | null>(null);
  const pathnameRef = useRef<string>(pathname);
  const isSendingRef = useRef<boolean>(false);

  // Update pathname ref when route changes
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!user || !profile) return; // Only track logged-in users

    // Reset activity on interactions
    const handleActivity = () => {
      lastActivityRef.current = Date.now();
      if (isIdleRef.current) {
        isIdleRef.current = false;
      }
    };

    // Throttle event listeners to avoid performance issues
    let throttleTimer: NodeJS.Timeout | null = null;
    const throttledHandleActivity = () => {
      if (throttleTimer) return;
      handleActivity();
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
      }, 2000); // 2 second throttle
    };

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    events.forEach(evt => window.addEventListener(evt, throttledHandleActivity, { passive: true }));

    // Heartbeat logic
    const sendHeartbeat = async () => {
      if (isSendingRef.current) return;
      isSendingRef.current = true;

      const now = Date.now();
      
      // Check idle status
      if (now - lastActivityRef.current > IDLE_TIMEOUT_MS) {
        isIdleRef.current = true;
      }

      try {
        const res = await fetch("/api/admin/analytics/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: user.uid,
            clinic_id: profile.clinicId || null,
            role: profile.role,
            email: profile.email || user.email,
            session_id: sessionIdRef.current,
            is_idle: isIdleRef.current,
            page_path: pathnameRef.current
          }),
          keepalive: true
        });

        if (res.ok) {
          const data = await res.json();
          if (data.session_id) {
            sessionIdRef.current = data.session_id;
          }
        }
      } catch (err) {
        // Silently fail if network issue
      } finally {
        isSendingRef.current = false;
      }
    };

    // Send initial heartbeat when tracking starts
    sendHeartbeat();

    // Setup interval for subsequent heartbeats
    const interval = setInterval(sendHeartbeat, PING_INTERVAL_MS);

    // Send closing heartbeat on unmount/unload
    const handleUnload = () => {
      const payload = JSON.stringify({
        user_id: user.uid,
        session_id: sessionIdRef.current,
        is_idle: true,
        is_unload: true,
        page_path: pathnameRef.current
      });
      navigator.sendBeacon("/api/admin/analytics/heartbeat", new Blob([payload], { type: "application/json" }));
    };

    window.addEventListener("beforeunload", handleUnload);

    return () => {
      events.forEach(evt => window.removeEventListener(evt, throttledHandleActivity));
      clearInterval(interval);
      if (throttleTimer) clearTimeout(throttleTimer);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [user?.uid, profile?.role, profile?.clinicId, profile?.email]);

  return null; // Headless component
}
