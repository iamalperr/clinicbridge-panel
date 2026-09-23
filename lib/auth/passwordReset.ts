/**
 * Password reset token helpers (hashed doc-ID storage).
 * Raw tokens are never persisted — only SHA-256 hashes.
 */

import crypto from "crypto";

export const PASSWORD_RESET_COLLECTION = "password_reset_tokens";

/** Existing product TTL — do not change without product decision. */
export const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;

/** Stuck PROCESSING reclaim window (Auth update interrupted). */
export const PASSWORD_RESET_PROCESSING_TIMEOUT_MS = 2 * 60 * 1000;

export const PASSWORD_RESET_GENERIC_SUCCESS_MESSAGE =
  "Eğer bu e-posta adresi sistemimizde kayıtlıysa, şifre sıfırlama bağlantısı gönderilecektir.";

export type PasswordResetTokenStatus = "active" | "processing" | "used";

export interface PasswordResetTokenRecord {
  userId: string;
  email: string;
  expiresAt: number;
  createdAt: number;
  used: boolean;
  status: PasswordResetTokenStatus;
  processingStartedAt?: number;
}

export function normalizeResetEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@") || trimmed.length > 320) return null;
  // Basic shape check — reject obvious garbage without revealing account state
  const at = trimmed.indexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;
  return trimmed;
}

export function generateRawResetToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashResetToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const masked =
    local.length <= 3 ? `${local[0]}***` : `${local.slice(0, 2)}***${local.slice(-1)}`;
  return `${masked}@${domain}`;
}

/** Trusted app origin for reset links — never trust request Origin/Host. */
export function getTrustedAppOrigin(): string {
  const configured = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
  if (configured) {
    try {
      const u = new URL(configured);
      if (u.protocol === "http:" || u.protocol === "https:") {
        return u.origin;
      }
    } catch {
      // fall through
    }
  }
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }
  return "https://app.clinicbridge-ai.com";
}

export function buildPasswordResetLink(rawToken: string): string {
  const origin = getTrustedAppOrigin();
  return `${origin}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

/** Resend from — prefer env; fallback matches working demo-request sender. */
export function getPasswordResetFromAddress(): string {
  return (
    process.env.EMAIL_FROM ||
    "ClinicBridge AI <info@clinicbridge-ai.com>"
  );
}

export function isTokenExpired(expiresAt: number, now: number = Date.now()): boolean {
  return !Number.isFinite(expiresAt) || now > expiresAt;
}

export function isTokenConsumable(
  data: PasswordResetTokenRecord,
  now: number = Date.now()
): { ok: true } | { ok: false; reason: "missing" | "used" | "expired" | "processing" } {
  if (!data?.userId || !data?.email) return { ok: false, reason: "missing" };
  if (data.used === true || data.status === "used") return { ok: false, reason: "used" };
  if (isTokenExpired(data.expiresAt, now)) return { ok: false, reason: "expired" };
  if (data.status === "processing") {
    const started = data.processingStartedAt || 0;
    if (now - started < PASSWORD_RESET_PROCESSING_TIMEOUT_MS) {
      return { ok: false, reason: "processing" };
    }
    // Stale PROCESSING is reclaimable by caller
  }
  return { ok: true };
}

export function logPasswordReset(
  code: string,
  fields: Record<string, string | number | boolean | undefined>
): void {
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  console.log(`[${code}] ${parts}`);
}
