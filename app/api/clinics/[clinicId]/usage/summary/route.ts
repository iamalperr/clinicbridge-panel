import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireClinicAccess } from "@/lib/services/apiAuth";
import type { AIUsageSummary } from "@/lib/types/aiUsage";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  try {
    const { clinicId } = await params;
    await requireClinicAccess(req, clinicId);

    const { searchParams } = new URL(req.url);
    const startDateStr = searchParams.get("startDate");
    const endDateStr = searchParams.get("endDate");

    if (!startDateStr || !endDateStr) {
      return NextResponse.json({ error: "Missing date range" }, { status: 400 });
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    // We use the daily aggregate for faster summary calculation
    const dailySnap = await adminDb.collection("aiUsageDaily")
      .where("clinicId", "==", clinicId)
      .where("date", ">=", startDateStr)
      .where("date", "<=", endDateStr)
      .get();

    let totalCostUsd = 0;
    let totalTokens = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let cachedInputTokens = 0;
    let totalRequests = 0;
    let successfulRequests = 0;
    let failedRequests = 0;
    let totalDurationMs = 0;

    dailySnap.docs.forEach(doc => {
      const data = doc.data();
      totalCostUsd += data.totalCostUsd || 0;
      totalTokens += data.totalTokens || 0;
      inputTokens += data.inputTokens || 0;
      outputTokens += data.outputTokens || 0;
      cachedInputTokens += data.cachedInputTokens || 0;
      totalRequests += data.requestCount || 0;
      successfulRequests += data.successCount || 0;
      failedRequests += data.failedCount || 0;
      totalDurationMs += data.totalDurationMs || 0;
    });

    // To get accurate conversation count, we must query the actual usage records and group by conversationId
    // For large datasets, this might be slow, but for clinic level it's usually fine
    const rawSnap = await adminDb.collection("aiUsage")
      .where("clinicId", "==", clinicId)
      .where("createdAt", ">=", `${startDateStr}T00:00:00.000Z`)
      .where("createdAt", "<=", `${endDateStr}T23:59:59.999Z`)
      .select("conversationId")
      .get();

    const uniqueConversations = new Set<string>();
    rawSnap.docs.forEach(doc => {
      const convId = doc.data().conversationId;
      if (convId) uniqueConversations.add(convId);
    });

    const totalConversations = uniqueConversations.size;
    const avgCostPerConversation = totalConversations > 0 ? totalCostUsd / totalConversations : 0;
    const avgCostPerRequest = totalRequests > 0 ? totalCostUsd / totalRequests : 0;
    const avgDurationMs = successfulRequests > 0 ? totalDurationMs / successfulRequests : 0;

    const summary: AIUsageSummary = {
      totalCostUsd,
      totalTokens,
      inputTokens,
      outputTokens,
      cachedInputTokens,
      totalRequests,
      successfulRequests,
      failedRequests,
      totalConversations,
      avgCostPerConversation,
      avgCostPerRequest,
      avgDurationMs,
    };

    return NextResponse.json(summary);
  } catch (error: any) {
    console.error("[GET /api/clinics/:clinicId/usage/summary] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch summary" },
      { status: error.status || 500 }
    );
  }
}
