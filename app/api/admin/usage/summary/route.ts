import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireSuperAdmin } from "@/lib/services/apiAuth";
import type { AIUsageSummary } from "@/lib/types/aiUsage";

export async function GET(req: Request) {
  try {
    await requireSuperAdmin(req);

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

    // Use daily aggregate for fast global summary
    const dailySnap = await adminDb.collection("aiUsageDaily")
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

    // We do NOT query aiUsage for global conversation counts because it's too large.
    // Instead we estimate based on the daily aggregates conversationCount if we tracked it, 
    // or just return 0 for now in global view unless we want to do a heavy query.
    // Let's do a fast count using a heuristic: assume 1 request = 1 conversation for system/admin,
    // and for web_widget, we can't easily count distinct without heavy queries.
    // For now we'll just return 0 to avoid performance issues on global scale.
    const totalConversations = 0; 
    
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
      avgCostPerConversation: 0,
      avgCostPerRequest,
      avgDurationMs,
    };

    return NextResponse.json(summary);
  } catch (error: any) {
    console.error("[GET /api/admin/usage/summary] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch admin summary" },
      { status: error.status || 500 }
    );
  }
}
