/**
 * Short-lived in-process cache for relatively static single-clinic runtime data.
 *
 * Safe to cache: clinic profile, prompt settings, training materials / embeddings.
 * NOT for: conversation state, appointment drafts, leads, or other per-patient data.
 *
 * TTL is intentionally short so Portal KB/prompt edits appear within ~45s without
 * requiring a process restart. Cache is process-local (no cross-instance coherence).
 */

export interface CachedClinicRuntimeBundle {
  clinicData: any;
  clinicName: string;
  clinicWhatsapp: string;
  clinicTelegram: string;
  clinicLanguage: string;
  promptSettings: any | null;
  trainingDocs: Array<{
    id: string;
    title: string;
    content: string;
    embeddingChunks?: any[];
  }>;
  fetchedAt: number;
}

type CacheEntry = {
  expiresAt: number;
  value: CachedClinicRuntimeBundle;
};

const DEFAULT_TTL_MS = 45_000;
const cache = new Map<string, CacheEntry>();

export function getCachedClinicRuntime(clinicId: string): CachedClinicRuntimeBundle | null {
  const entry = cache.get(clinicId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(clinicId);
    return null;
  }
  return entry.value;
}

export function setCachedClinicRuntime(
  clinicId: string,
  value: Omit<CachedClinicRuntimeBundle, "fetchedAt">,
  ttlMs: number = DEFAULT_TTL_MS
): CachedClinicRuntimeBundle {
  const bundled: CachedClinicRuntimeBundle = {
    ...value,
    fetchedAt: Date.now(),
  };
  cache.set(clinicId, {
    expiresAt: Date.now() + ttlMs,
    value: bundled,
  });
  return bundled;
}

export function invalidateClinicRuntimeCache(clinicId?: string): void {
  if (!clinicId) {
    cache.clear();
    return;
  }
  cache.delete(clinicId);
}

/** Test helper */
export function _clinicRuntimeCacheSize(): number {
  return cache.size;
}
