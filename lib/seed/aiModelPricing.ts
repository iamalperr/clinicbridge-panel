/**
 * aiModelPricing.ts
 *
 * Seed data for AI model pricing.
 * Run once to populate Firestore `aiModelPricing` collection.
 *
 * Usage: Import and call seedModelPricing() from an API route or script.
 */

import type { AIModelPricing } from "@/lib/types/aiUsage";

const NOW = new Date().toISOString();

/**
 * Default pricing for commonly used OpenAI models.
 * Prices are per million tokens in USD.
 * Source: https://openai.com/api/pricing/ (as of July 2026)
 */
export const DEFAULT_MODEL_PRICING: Omit<AIModelPricing, "id">[] = [
  {
    model: "gpt-4o-mini",
    inputPricePerMillion: 0.15,
    cachedInputPricePerMillion: 0.075,
    outputPricePerMillion: 0.60,
    effectiveFrom: "2024-07-18T00:00:00Z",
    isActive: true,
    createdAt: NOW,
  },
  {
    model: "gpt-4o",
    inputPricePerMillion: 2.50,
    cachedInputPricePerMillion: 1.25,
    outputPricePerMillion: 10.00,
    effectiveFrom: "2024-05-13T00:00:00Z",
    isActive: true,
    createdAt: NOW,
  },
  {
    model: "gpt-4-turbo",
    inputPricePerMillion: 10.00,
    cachedInputPricePerMillion: 5.00,
    outputPricePerMillion: 30.00,
    effectiveFrom: "2024-04-09T00:00:00Z",
    isActive: true,
    createdAt: NOW,
  },
  {
    model: "gpt-4.1-mini",
    inputPricePerMillion: 0.40,
    cachedInputPricePerMillion: 0.10,
    outputPricePerMillion: 1.60,
    effectiveFrom: "2025-04-14T00:00:00Z",
    isActive: true,
    createdAt: NOW,
  },
  {
    model: "gpt-4.1",
    inputPricePerMillion: 2.00,
    cachedInputPricePerMillion: 0.50,
    outputPricePerMillion: 8.00,
    effectiveFrom: "2025-04-14T00:00:00Z",
    isActive: true,
    createdAt: NOW,
  },
  {
    model: "gpt-4.1-nano",
    inputPricePerMillion: 0.10,
    cachedInputPricePerMillion: 0.025,
    outputPricePerMillion: 0.40,
    effectiveFrom: "2025-04-14T00:00:00Z",
    isActive: true,
    createdAt: NOW,
  },
  {
    model: "o4-mini",
    inputPricePerMillion: 1.10,
    cachedInputPricePerMillion: 0.275,
    outputPricePerMillion: 4.40,
    effectiveFrom: "2025-04-16T00:00:00Z",
    isActive: true,
    createdAt: NOW,
  },
];

/**
 * Seeds the aiModelPricing collection in Firestore.
 * Skips models that already have an active pricing entry.
 */
export async function seedModelPricing(
  adminDb: FirebaseFirestore.Firestore
): Promise<{ created: number; skipped: number }> {
  const col = adminDb.collection("aiModelPricing");
  let created = 0;
  let skipped = 0;

  for (const pricing of DEFAULT_MODEL_PRICING) {
    // Check if already exists
    const existing = await col
      .where("model", "==", pricing.model)
      .where("isActive", "==", true)
      .limit(1)
      .get();

    if (!existing.empty) {
      skipped++;
      continue;
    }

    await col.add(pricing);
    created++;
  }

  return { created, skipped };
}
