/**
 * In-memory rate limiter for password-reset forgot endpoint.
 * No shared rate-limit helper existed in the repo; scoped to auth recovery only.
 *
 * Note: multi-instance serverless does not share memory — still reduces
 * single-instance / burst abuse without leaking account existence.
 */

type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

export interface PasswordResetRateLimitConfig {
  /** Max attempts per window */
  maxAttempts: number;
  /** Window length in ms */
  windowMs: number;
}

export const DEFAULT_FORGOT_PASSWORD_RATE_LIMIT: PasswordResetRateLimitConfig = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
};

function prune(bucket: Bucket, windowStart: number): void {
  bucket.timestamps = bucket.timestamps.filter((t) => t >= windowStart);
}

/**
 * Returns whether the request is allowed.
 * On allow, records the attempt. On deny, does not mutate further.
 */
export function consumePasswordResetRateLimit(
  key: string,
  config: PasswordResetRateLimitConfig = DEFAULT_FORGOT_PASSWORD_RATE_LIMIT,
  now: number = Date.now()
): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const windowStart = now - config.windowMs;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }
  prune(bucket, windowStart);

  if (bucket.timestamps.length >= config.maxAttempts) {
    const oldest = bucket.timestamps[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + config.windowMs - now) / 1000));
    return { allowed: false, retryAfterSec };
  }

  bucket.timestamps.push(now);
  return { allowed: true };
}

/** Test-only: clear all buckets */
export function __resetPasswordResetRateLimitForTests(): void {
  buckets.clear();
}

export function buildForgotPasswordRateLimitKey(ip: string, email: string): string {
  return `fp:${ip || "unknown"}:${email}`;
}

export function extractClientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);
  return "unknown";
}
