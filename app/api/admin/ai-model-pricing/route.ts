import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireSuperAdmin } from "@/lib/services/apiAuth";
import type { AIModelPricing } from "@/lib/types/aiUsage";
import { invalidatePricingCache } from "@/lib/services/aiPricingService";

export async function GET(req: Request) {
  try {
    await requireSuperAdmin(req);

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    const snap = await adminDb.collection("aiModelPricing")
      .orderBy("model", "asc")
      .orderBy("effectiveFrom", "desc")
      .get();

    const prices: AIModelPricing[] = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as AIModelPricing[];

    return NextResponse.json(prices);
  } catch (error: any) {
    console.error("[GET /api/admin/ai-model-pricing] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch model pricing" },
      { status: error.status || 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    await requireSuperAdmin(req);
    const body = await req.json();

    const {
      model,
      inputPricePerMillion,
      cachedInputPricePerMillion,
      outputPricePerMillion,
      effectiveFrom,
      isActive = true
    } = body;

    if (!model || typeof inputPricePerMillion !== 'number' || typeof outputPricePerMillion !== 'number' || !effectiveFrom) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    const newPricing = {
      model,
      inputPricePerMillion,
      cachedInputPricePerMillion: cachedInputPricePerMillion ?? inputPricePerMillion,
      outputPricePerMillion,
      effectiveFrom,
      isActive,
      createdAt: new Date().toISOString()
    };

    const docRef = await adminDb.collection("aiModelPricing").add(newPricing);
    
    // Invalidate the cache so the gateway picks up the new price immediately
    invalidatePricingCache();

    return NextResponse.json({ id: docRef.id, ...newPricing }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/admin/ai-model-pricing] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create model pricing" },
      { status: error.status || 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    await requireSuperAdmin(req);
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    // Don't allow changing createdAt
    delete updates.createdAt;
    updates.updatedAt = new Date().toISOString();

    await adminDb.collection("aiModelPricing").doc(id).update(updates);
    
    // Invalidate the cache
    invalidatePricingCache();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[PUT /api/admin/ai-model-pricing] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update model pricing" },
      { status: error.status || 500 }
    );
  }
}
