import { createHmac, timingSafeEqual } from "crypto";

function secret(): string {
  return process.env.LIFECYCLE_EMAIL_OPT_OUT_SECRET || process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET || "dev-lifecycle-opt-out";
}

export function lifecycleOptOutToken(clinicId: string): string {
  return createHmac("sha256", secret()).update(`lifecycle-opt-out:${clinicId}`).digest("hex").slice(0, 32);
}

export function verifyLifecycleOptOutToken(clinicId: string, token: string): boolean {
  if (!clinicId || !token || token.length < 16) return false;
  const expected = lifecycleOptOutToken(clinicId);
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(token);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function lifecycleOptOutUrl(clinicId: string, appOrigin = "https://app.clinicbridge-ai.com"): string {
  const token = lifecycleOptOutToken(clinicId);
  return `${appOrigin}/api/public/lifecycle-email-opt-out?clinicId=${encodeURIComponent(clinicId)}&token=${encodeURIComponent(token)}`;
}
