import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireSuperAdmin } from "@/lib/services/apiAuth";
import type { AdminClinicUsageRow } from "@/lib/types/aiUsage";

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

    // 1. Fetch all clinics
    const clinicsSnap = await adminDb.collection("clinics").get();
    const clinicMap: Record<string, any> = {};
    clinicsSnap.docs.forEach(doc => {
      clinicMap[doc.id] = { id: doc.id, ...doc.data() };
    });

    // 2. Fetch daily aggregates
    const dailySnap = await adminDb.collection("aiUsageDaily")
      .where("date", ">=", startDateStr)
      .where("date", "<=", endDateStr)
      .get();

    const usageMap: Record<string, AdminClinicUsageRow & { _duration: number; _success: number; _failed: number }> = {};

    // Initialize map for all clinics so even those with 0 usage appear
    for (const clinicId of Object.keys(clinicMap)) {
      const c = clinicMap[clinicId];
      usageMap[clinicId] = {
        clinicId,
        clinicName: c.name || "Unknown",
        plan: c.plan || "free",
        status: c.status || "active",
        conversationCount: 0,
        requestCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        totalCostUsd: 0,
        avgCostPerConversation: 0,
        avgDurationMs: 0,
        errorRate: 0,
        _duration: 0,
        _success: 0,
        _failed: 0,
      };
      
      const limit = c.aiUsageSettings?.budgetLimitUsd;
      if (limit) {
        usageMap[clinicId].limitUsagePercent = 0; // calculated later
      }
    }

    // Add system usage entry
    usageMap["system"] = {
      clinicId: "system",
      clinicName: "System / Agency",
      plan: "N/A",
      status: "active",
      conversationCount: 0,
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      totalCostUsd: 0,
      avgCostPerConversation: 0,
      avgDurationMs: 0,
      errorRate: 0,
      _duration: 0,
      _success: 0,
      _failed: 0,
    };

    // 3. Aggregate data per clinic
    dailySnap.docs.forEach(doc => {
      const data = doc.data();
      const cid = data.clinicId || "system";
      
      if (!usageMap[cid]) {
        // Fallback if a clinic was deleted but usage remains
        usageMap[cid] = {
          clinicId: cid,
          clinicName: "Deleted Clinic",
          plan: "N/A",
          status: "inactive",
          conversationCount: 0,
          requestCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          totalCostUsd: 0,
          avgCostPerConversation: 0,
          avgDurationMs: 0,
          errorRate: 0,
          _duration: 0,
          _success: 0,
          _failed: 0,
        };
      }

      const item = usageMap[cid];
      item.requestCount += data.requestCount || 0;
      item.inputTokens += data.inputTokens || 0;
      item.outputTokens += data.outputTokens || 0;
      item.totalTokens += data.totalTokens || 0;
      item.totalCostUsd += data.totalCostUsd || 0;
      item._duration += data.totalDurationMs || 0;
      item._success += data.successCount || 0;
      item._failed += data.failedCount || 0;
    });

    // 4. Finalize calculations
    const result = Object.values(usageMap)
      .filter(item => item.requestCount > 0 || item.clinicId !== "system") // filter out empty system usage
      .map(item => {
        if (item._success > 0) {
          item.avgDurationMs = item._duration / item._success;
        }
        if (item.requestCount > 0) {
          item.errorRate = (item._failed / item.requestCount) * 100;
        }
        
        // Calculate limit percent if applicable
        const c = clinicMap[item.clinicId];
        if (c && c.aiUsageSettings?.budgetLimitUsd) {
          // Note: The limit is monthly. If the date range is not a month, this % is just proportional.
          item.limitUsagePercent = (item.totalCostUsd / c.aiUsageSettings.budgetLimitUsd) * 100;
        }

        delete (item as any)._duration;
        delete (item as any)._success;
        delete (item as any)._failed;
        return item;
      })
      .sort((a, b) => b.totalCostUsd - a.totalCostUsd); // sort by cost descending

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[GET /api/admin/usage/clinics] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch clinic comparison" },
      { status: error.status || 500 }
    );
  }
}
