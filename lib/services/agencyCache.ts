/**
 * Simple In-Memory Cache for stable agency configuration
 * Useful for serverless functions during warm-starts.
 */

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry<any>>();
const DEFAULT_TTL_MS = 3 * 60 * 1000; // 3 minutes

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCached<T>(key: string, data: T, ttlMs: number = DEFAULT_TTL_MS): void {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

export function clearCache(key: string): void {
  cache.delete(key);
}

export function clearAgencyCache(agencyId: string, slug?: string): void {
  cache.delete(`agency-config:${agencyId}`);
  if (slug) cache.delete(`agency-config-slug:${slug}`);
  cache.delete(`agency-clinics:${agencyId}`);
  cache.delete(`agency-pricing:${agencyId}`);
  cache.delete(`agency-doctors:${agencyId}`);
  cache.delete(`agency-kb:${agencyId}`);
  cache.delete(`agency-kb-main:${agencyId}`);
}
