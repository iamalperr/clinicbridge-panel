"use client";

import { useEffect, useId, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { usePathname } from "next/navigation";
import {
  SESSION_STORAGE_KEY,
  acquireHeartbeatLock,
  isIdle,
  nextRetryTimestamp,
  releaseHeartbeatLock,
  shouldSendHeartbeat,
} from "@/lib/services/analytics/heartbeatScheduler";

/** Ticks faster than the send cadence so hidden→visible transitions are noticed promptly. */
const TICK_INTERVAL_MS = 60 * 1000;

function readStoredSessionId(): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredSessionId(sessionId: string | null) {
  try {
    if (sessionId) window.sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    else window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode); heartbeat still works, just without reuse.
  }
}

export default function ActivityTracker() {
  const { user, profile } = useAuth();
  const pathname = usePathname();
  const instanceId = useId();

  const lastActivityRef = useRef<number>(Date.now());
  const isIdleRef = useRef<boolean>(false);
  const sessionIdRef = useRef<string | null>(null);
  const pathnameRef = useRef<string>(pathname);
  const inFlightRef = useRef<boolean>(false);
  const lastSentAtRef = useRef<number | null>(null);
  const retryNotBeforeRef = useRef<number | null>(null);
  const consecutiveFailuresRef = useRef<number>(0);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!user || !profile) return;

    // Only one loop per browser session, even if this component mounts twice.
    if (!acquireHeartbeatLock(instanceId)) return;

    sessionIdRef.current = readStoredSessionId();

    const handleActivity = () => {
      lastActivityRef.current = Date.now();
      if (isIdleRef.current) isIdleRef.current = false;
    };

    let throttleTimer: NodeJS.Timeout | null = null;
    const throttledHandleActivity = () => {
      if (throttleTimer) return;
      handleActivity();
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
      }, 2000);
    };

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((evt) =>
      window.addEventListener(evt, throttledHandleActivity, { passive: true })
    );

    const sendHeartbeat = async (force = false) => {
      const now = Date.now();

      // Enforced on every path: `force` may skip the cadence and visibility
      // gates, but never the in-flight guard or a failure backoff window.
      if (inFlightRef.current) return;
      if (retryNotBeforeRef.current !== null && now < retryNotBeforeRef.current) return;

      if (!force) {
        const decision = shouldSendHeartbeat({
          now,
          lastSentAt: lastSentAtRef.current,
          visibility: document.visibilityState === "hidden" ? "hidden" : "visible",
          inFlight: inFlightRef.current,
          retryNotBefore: retryNotBeforeRef.current,
        });
        if (!decision.send) return;
      }

      inFlightRef.current = true;
      lastSentAtRef.current = now;

      if (isIdle(now, lastActivityRef.current)) isIdleRef.current = true;

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
            page_path: pathnameRef.current,
          }),
          keepalive: true,
        });

        if (res.ok) {
          consecutiveFailuresRef.current = 0;
          retryNotBeforeRef.current = null;
          const data = await res.json();
          if (data.session_id && data.session_id !== sessionIdRef.current) {
            sessionIdRef.current = data.session_id;
            writeStoredSessionId(data.session_id);
          }
        } else {
          // Quota and availability failures must decay, never retry immediately.
          consecutiveFailuresRef.current += 1;
          retryNotBeforeRef.current = nextRetryTimestamp(
            Date.now(),
            consecutiveFailuresRef.current
          );
        }
      } catch {
        consecutiveFailuresRef.current += 1;
        retryNotBeforeRef.current = nextRetryTimestamp(
          Date.now(),
          consecutiveFailuresRef.current
        );
      } finally {
        inFlightRef.current = false;
      }
    };

    sendHeartbeat(true);

    const interval = setInterval(() => {
      void sendHeartbeat();
    }, TICK_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleActivity();
        void sendHeartbeat();
      }
    };

    const handleUnload = () => {
      if (!sessionIdRef.current) return;
      const payload = JSON.stringify({
        user_id: user.uid,
        session_id: sessionIdRef.current,
        is_idle: true,
        is_unload: true,
        page_path: pathnameRef.current,
      });
      navigator.sendBeacon(
        "/api/admin/analytics/heartbeat",
        new Blob([payload], { type: "application/json" })
      );
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, throttledHandleActivity));
      clearInterval(interval);
      if (throttleTimer) clearTimeout(throttleTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleUnload);
      releaseHeartbeatLock(instanceId);
    };
    // Primitive deps only: re-running this effect starts a new loop, and the
    // closure reads nothing beyond the fields listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, profile?.role, profile?.clinicId, profile?.email, instanceId]);

  // Clear the stored session on logout so the next login starts a fresh session.
  useEffect(() => {
    if (!user) {
      sessionIdRef.current = null;
      writeStoredSessionId(null);
    }
  }, [user]);

  return null;
}
