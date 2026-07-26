import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireClinicAccess } from "@/lib/services/apiAuth";
import type { AIUsageSummary } from "@/lib/types/aiUsage";

// Extend the type locally if we need to return additional metrics like totalMessages
export interface ExtendedAIUsageSummary extends AIUsageSummary {
  totalMessages?: number;
  resolvedConversations?: number;
}

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

    // Get accurate conversation and message counts from conversationLogs
    const convSnap = await adminDb.collection("clinics").doc(clinicId).collection("conversationLogs")
      .where("createdAt", ">=", `${startDateStr}T00:00:00.000Z`)
      .where("createdAt", "<=", `${endDateStr}T23:59:59.999Z`)
      .get();

    let totalConversations = 0;
    let totalMessages = 0;
    let resolvedConversations = 0;

    convSnap.docs.forEach(doc => {
      totalConversations++;
      const data = doc.data();
      totalMessages += data.totalMessages || 0;
      if (data.status === "answered" || data.status === "resolved") {
        resolvedConversations++;
      }
    });

    // Get accurate appointments count from appointments collection
    const apptSnap = await adminDb.collection("clinics").doc(clinicId).collection("appointments")
      .where("createdAt", ">=", `${startDateStr}T00:00:00.000Z`)
      .where("createdAt", "<=", `${endDateStr}T23:59:59.999Z`)
      .get();
      
    let aiAppointmentsCount = 0;
    apptSnap.docs.forEach(doc => {
      const data = doc.data();
      if (data.source === "ai_chatbot" || data.createdBy === "ai_assistant" || data.source === "ai_agent" || !data.source) {
        aiAppointmentsCount++;
        resolvedConversations++; // Appointments also count as resolved conversations
      }
    });

    const avgCostPerConversation = totalConversations > 0 ? totalCostUsd / totalConversations : 0;
    const avgCostPerRequest = totalRequests > 0 ? totalCostUsd / totalRequests : 0;
    const avgDurationMs = successfulRequests > 0 ? totalDurationMs / successfulRequests : 0;

    const summary: ExtendedAIUsageSummary = {
      totalCostUsd,
      totalTokens,
      inputTokens,
      outputTokens,
      cachedInputTokens,
      totalRequests,
      successfulRequests,
      failedRequests,
      totalConversations,
      totalMessages,
      resolvedConversations,
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
