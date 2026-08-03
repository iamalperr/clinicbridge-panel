/**
 * heartbeatScheduler.ts
 *
 * Pure scheduling decisions for the analytics activity heartbeat.
 *
 * Kept free of React and browser globals so the throttling, backoff and
 * single-loop guarantees can be tested directly.
 */

/** Normal cadence for an authenticated, visible tab. */
export const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

/** Minimum spacing between heartbeats while the tab is hidden. */
export const HIDDEN_TAB_MIN_INTERVAL_MS = 15 * 60 * 1000;

/** No user interaction for this long marks the session idle. */
export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Server-side write suppression window. Shorter than HEARTBEAT_INTERVAL_MS so a
 * single tab's regular cadence still records activity, while extra tabs and
 * duplicate calls collapse into no-ops.
 */
export const MIN_ACTIVITY_WRITE_INTERVAL_MS = 4 * 60 * 1000;

/** First backoff step after a failure. Guarantees no immediate retry. */
export const BACKOFF_BASE_MS = 5 * 60 * 1000;

/** Upper bound on backoff so a recovered service is picked up within the hour. */
export const BACKOFF_MAX_MS = 60 * 60 * 1000;

/** Survives reloads so a refresh reuses its session document. */
export const SESSION_STORAGE_KEY = "cb_analytics_session_id";

export type HeartbeatSkipReason =
  | "in_flight"
  | "backoff"
  | "hidden_throttled"
  | "too_soon"
  | null;

export interface HeartbeatDecisionInput {
  now: number;
  /** Timestamp of the last attempt, or null when none has been made. */
  lastSentAt: number | null;
  visibility: "visible" | "hidden";
  /** A request is already outstanding. */
  inFlight: boolean;
  /** Earliest permitted attempt after a failure, or null when healthy. */
  retryNotBefore: number | null;
}

export interface HeartbeatDecision {
  send: boolean;
  reason: HeartbeatSkipReason;
}

/**
 * Backoff after consecutive failures: 5m, 10m, 20m, 40m, then capped at 60m.
 * Always at least BACKOFF_BASE_MS, so a quota rejection can never be retried
 * on the following tick.
 */
export function computeBackoffDelayMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return 0;
  const exponential = BACKOFF_BASE_MS * Math.pow(2, consecutiveFailures - 1);
  return Math.min(exponential, BACKOFF_MAX_MS);
}

export function nextRetryTimestamp(now: number, consecutiveFailures: number): number {
  return now + computeBackoffDelayMs(consecutiveFailures);
}

export function isIdle(now: number, lastActivityAt: number): boolean {
  return now - lastActivityAt > IDLE_TIMEOUT_MS;
}

export function shouldSendHeartbeat(input: HeartbeatDecisionInput): HeartbeatDecision {
  const { now, lastSentAt, visibility, inFlight, retryNotBefore } = input;

  if (inFlight) return { send: false, reason: "in_flight" };

  if (retryNotBefore !== null && now < retryNotBefore) {
    return { send: false, reason: "backoff" };
  }

  if (lastSentAt === null) return { send: true, reason: null };

  const elapsed = now - lastSentAt;

  if (visibility === "hidden") {
    return elapsed >= HIDDEN_TAB_MIN_INTERVAL_MS
      ? { send: true, reason: null }
      : { send: false, reason: "hidden_throttled" };
  }

  // Tolerance absorbs timer drift so a scheduled tick is never dropped.
  return elapsed >= HEARTBEAT_INTERVAL_MS - 1000
    ? { send: true, reason: null }
    : { send: false, reason: "too_soon" };
}

/**
 * Server-side counterpart: skip the activity write when the stored timestamp is
 * already recent enough to be accurate.
 */
export function shouldPersistActivity(now: number, lastActivityAt: number | null): boolean {
  if (lastActivityAt === null || lastActivityAt <= 0) return true;
  return now - lastActivityAt >= MIN_ACTIVITY_WRITE_INTERVAL_MS;
}

/**
 * One heartbeat loop per browser session, independent of how many times the
 * tracker component mounts (StrictMode double-mount, remounts on navigation).
 */
let lockOwner: string | null = null;

export function acquireHeartbeatLock(ownerId: string): boolean {
  if (lockOwner !== null && lockOwner !== ownerId) return false;
  lockOwner = ownerId;
  return true;
}

export function releaseHeartbeatLock(ownerId: string): void {
  if (lockOwner === ownerId) lockOwner = null;
}

export function isHeartbeatLockHeld(): boolean {
  return lockOwner !== null;
}

/** Test-only reset. */
export function resetHeartbeatLock(): void {
  lockOwner = null;
}
