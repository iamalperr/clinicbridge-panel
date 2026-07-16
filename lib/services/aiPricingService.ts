/**
 * aiPricingService.ts
 *
 * Manages AI model pricing lookups and cost calculations.
 * Reads from Firestore `aiModelPricing` collection.
 * Cost is calculated at request time and stored per-record so
 * future price changes never affect historical data.
 */

import { getAdminDb } from "@/lib/firebase-admin";
import type { AIModelPricing } from "@/lib/types/aiUsage";

// In-memory cache for pricing lookups (refreshed every 5 min)
let pricingCache: AIModelPricing[] = [];
let pricingCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Loads all active pricing entries from Firestore.
 * Uses an in-memory cache to avoid repeated reads.
 */
async function loadPricingCache(): Promise<AIModelPricing[]> {
  if (Date.now() - pricingCacheTime < CACHE_TTL_MS && pricingCache.length > 0) {
    return pricingCache;
  }

  const db = getAdminDb();
  if (!db) {
    console.warn("[aiPricingService] Admin DB not available");
    return pricingCache;
  }

  try {
    const snap = await db
      .collection("aiModelPricing")
      .where("isActive", "==", true)
      .get();

    pricingCache = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as AIModelPricing[];

    pricingCacheTime = Date.now();
  } catch (err) {
    console.error("[aiPricingService] Failed to load pricing:", err);
  }

  return pricingCache;
}

/**
 * Finds the applicable pricing for a model at a given date.
 * Matches by model name and effective date range.
 * Returns null if no matching pricing is found.
 */
export async function getModelPricing(
  model: string,
  date: Date = new Date()
): Promise<AIModelPricing | null> {
  const allPricing = await loadPricingCache();
  const dateStr = date.toISOString();

  // Find matching pricing: model matches AND effectiveFrom <= date AND (no effectiveUntil OR effectiveUntil > date)
  const candidates = allPricing.filter((p) => {
    if (p.model !== model) return false;
    if (p.effectiveFrom > dateStr) return false;
    if (p.effectiveUntil && p.effectiveUntil <= dateStr) return false;
    return true;
  });

  if (candidates.length === 0) return null;

  // If multiple candidates (shouldn't happen normally), pick the one with latest effectiveFrom
  candidates.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return candidates[0];
}

/**
 * Calculates cost in USD based on token counts and model pricing.
 */
export function calculateCost(
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number,
  pricing: AIModelPricing
): {
  inputCostUsd: number;
  cachedInputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
} {
  const inputCostUsd =
    (inputTokens / 1_000_000) * pricing.inputPricePerMillion;

  const cachedInputCostUsd =
    (cachedInputTokens / 1_000_000) *
    (pricing.cachedInputPricePerMillion ?? pricing.inputPricePerMillion);

  const outputCostUsd =
    (outputTokens / 1_000_000) * pricing.outputPricePerMillion;

  const totalCostUsd = inputCostUsd + cachedInputCostUsd + outputCostUsd;

  return {
    inputCostUsd: Math.round(inputCostUsd * 1_000_000) / 1_000_000, // 6 decimal places
    cachedInputCostUsd: Math.round(cachedInputCostUsd * 1_000_000) / 1_000_000,
    outputCostUsd: Math.round(outputCostUsd * 1_000_000) / 1_000_000,
    totalCostUsd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
  };
}

/**
 * Invalidates the pricing cache (e.g., after admin updates pricing).
 */
export function invalidatePricingCache(): void {
  pricingCacheTime = 0;
  pricingCache = [];
}
