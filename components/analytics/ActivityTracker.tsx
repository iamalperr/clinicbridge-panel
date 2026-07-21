"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { usePathname } from "next/navigation";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const PING_INTERVAL_MS = 60 * 1000; // 1 minute

export default function ActivityTracker() {
  const { user, profile } = useAuth();
  const pathname = usePathname();
  const lastActivityRef = useRef<number>(Date.now());
  const isIdleRef = useRef<boolean>(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !profile) return; // Only track logged-in users

    // Reset activity on interactions
    const handleActivity = () => {
      lastActivityRef.current = Date.now();
      if (isIdleRef.current) {
        isIdleRef.current = false;
        // User came back from idle
      }
    };

    // Throttle event listeners to avoid performance issues
    let throttleTimer: NodeJS.Timeout | null = null;
    const throttledHandleActivity = () => {
      if (throttleTimer) return;
      handleActivity();
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
      }, 1000); // 1 second throttle
    };

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    events.forEach(evt => window.addEventListener(evt, throttledHandleActivity, { passive: true }));

    // Heartbeat logic
    const sendHeartbeat = async () => {
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
            session_id: sessionId,
            is_idle: isIdleRef.current,
            page_path: pathname
          }),
          // Using keepalive allows the request to outlive the page if navigating away
          keepalive: true
        });

        if (res.ok) {
          const data = await res.json();
          if (data.session_id && data.session_id !== sessionId) {
            setSessionId(data.session_id); // Update session ID if server created a new one
          }
        }
      } catch (err) {
        // Silently fail if network issue
        console.warn("Analytics heartbeat failed");
      }
    };

    // Send initial heartbeat immediately when tracking starts
    sendHeartbeat();

    // Setup interval for subsequent heartbeats
    const interval = setInterval(sendHeartbeat, PING_INTERVAL_MS);

    // Send closing heartbeat on unmount/unload
    const handleUnload = () => {
      // Use navigator.sendBeacon for reliable delivery on exit if possible
      const payload = JSON.stringify({
        user_id: user.uid,
        session_id: sessionId,
        is_idle: true, // They are leaving
        is_unload: true,
        page_path: pathname
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
  }, [user, profile, pathname, sessionId]);

  return null; // This is a headless component
}
