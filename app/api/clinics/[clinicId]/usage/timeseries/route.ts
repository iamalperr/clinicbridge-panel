import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireClinicAccess } from "@/lib/services/apiAuth";
import type { AIUsageTimeseriesPoint } from "@/lib/types/aiUsage";

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
    // grouping could be 'day' or 'hour', let's stick to 'day' using aiUsageDaily
    const grouping = searchParams.get("grouping") || "day";

    if (!startDateStr || !endDateStr) {
      return NextResponse.json({ error: "Missing date range" }, { status: 400 });
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    const dataPoints: Record<string, AIUsageTimeseriesPoint> = {};

    if (grouping === "day") {
      // 1. Fetch AI Usage daily aggregates
      const dailySnap = await adminDb.collection("aiUsageDaily")
        .where("clinicId", "==", clinicId)
        .where("date", ">=", startDateStr)
        .where("date", "<=", endDateStr)
        .get();

      dailySnap.docs.forEach(doc => {
        const data = doc.data();
        const date = data.date;
        
        if (!dataPoints[date]) {
          dataPoints[date] = {
            date,
            totalCostUsd: 0,
            totalTokens: 0,
            inputTokens: 0,
            outputTokens: 0,
            cachedInputTokens: 0,
            requestCount: 0,
            conversationCount: 0,
            messageCount: 0,
            failedCount: 0,
            avgDurationMs: 0,
          };
        }

        const pt = dataPoints[date];
        pt.totalCostUsd += data.totalCostUsd || 0;
        pt.totalTokens += data.totalTokens || 0;
        pt.inputTokens += data.inputTokens || 0;
        pt.outputTokens += data.outputTokens || 0;
        pt.cachedInputTokens += data.cachedInputTokens || 0;
        pt.requestCount += data.requestCount || 0;
        pt.failedCount += data.failedCount || 0;
        // We accumulate totalDurationMs here, then average it later
        (pt as any)._totalDuration = ((pt as any)._totalDuration || 0) + (data.totalDurationMs || 0);
        (pt as any)._successCount = ((pt as any)._successCount || 0) + (data.successCount || 0);
      });

      // 2. Fetch true conversation and message counts from conversationLogs
      const convSnap = await adminDb.collection("clinics").doc(clinicId).collection("conversationLogs")
        .where("createdAt", ">=", `${startDateStr}T00:00:00.000Z`)
        .where("createdAt", "<=", `${endDateStr}T23:59:59.999Z`)
        .get();

      convSnap.docs.forEach(doc => {
        const data = doc.data();
        const isoDate = data.createdAt;
        if (!isoDate) return;
        
        const date = isoDate.split("T")[0]; // YYYY-MM-DD
        
        // Skip if outside range (edge case due to timezones, but roughly safe)
        if (date < startDateStr || date > endDateStr) return;

        if (!dataPoints[date]) {
          dataPoints[date] = {
            date,
            totalCostUsd: 0,
            totalTokens: 0,
            inputTokens: 0,
            outputTokens: 0,
            cachedInputTokens: 0,
            requestCount: 0,
            conversationCount: 0,
            messageCount: 0,
            failedCount: 0,
            avgDurationMs: 0,
          };
        }

        const pt = dataPoints[date];
        pt.conversationCount += 1;
        pt.messageCount += data.totalMessages || 0;
      });

    } else {
      // 'hour' or raw grouping would require querying the raw `aiUsage` collection.
      // Skipping implementation for brevity, returning 400
      return NextResponse.json({ error: "Only 'day' grouping is supported currently" }, { status: 400 });
    }

    // Finalize averages and convert to sorted array
    const result = Object.values(dataPoints)
      .map(pt => {
        const _pt = pt as any;
        if (_pt._successCount > 0) {
          pt.avgDurationMs = _pt._totalDuration / _pt._successCount;
        }
        delete _pt._totalDuration;
        delete _pt._successCount;
        return pt;
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[GET /api/clinics/:clinicId/usage/timeseries] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch timeseries" },
      { status: error.status || 500 }
    );
  }
}
