import { normalizeInstallDomain } from "@/lib/setup/installPing";

/** Hosts that never count as a real clinic-site widget install / conversation. */
const IGNORED_EXACT = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "clinicbridge-ai.com",
  "www.clinicbridge-ai.com",
  "app.clinicbridge-ai.com",
  "demo.clinicbridge-ai.com",
]);

const IGNORED_SUFFIXES = [".vercel.app", ".clinicbridge-ai.com"];

export function hostnameFromOriginOrHost(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    if (/^https?:\/\//i.test(trimmed) || trimmed.includes("://")) {
      return normalizeInstallDomain(new URL(trimmed).hostname);
    }
  } catch {
    // fall through
  }
  return normalizeInstallDomain(trimmed);
}

export function isIgnoredLifecycleHost(host: string | null | undefined): boolean {
  if (!host) return true;
  const normalized = normalizeInstallDomain(host);
  if (!normalized) return true;
  if (IGNORED_EXACT.has(normalized)) return true;
  return IGNORED_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

/** Strip leading www. for comparison. */
export function stripWww(host: string): string {
  return host.replace(/^www\./, "");
}

/**
 * True when the request host belongs to the clinic's configured domain
 * (exact or subdomain), and is not an ignored demo/preview/local host.
 */
export function originMatchesClinicDomain(
  originOrHost: string,
  clinicDomain: string | null | undefined
): boolean {
  const requestHost = hostnameFromOriginOrHost(originOrHost);
  const clinicHost = hostnameFromOriginOrHost(clinicDomain || "");
  if (!requestHost || !clinicHost) return false;
  if (isIgnoredLifecycleHost(requestHost)) return false;
  if (isIgnoredLifecycleHost(clinicHost)) return false;
  const a = stripWww(requestHost);
  const b = stripWww(clinicHost);
  return a === b || a.endsWith(`.${b}`);
}

/** Real patient conversation: not preview/panel/demo host. */
export function isRealConversationOrigin(originOrHost: string): boolean {
  const host = hostnameFromOriginOrHost(originOrHost);
  if (!host) return false;
  return !isIgnoredLifecycleHost(host);
}
