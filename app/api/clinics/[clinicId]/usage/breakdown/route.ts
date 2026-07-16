import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireClinicAccess } from "@/lib/services/apiAuth";
import { CHANNEL_LABELS, REQUEST_TYPE_LABELS } from "@/lib/types/aiUsage";
import type { AIUsageBreakdowns, AIUsageBreakdownItem } from "@/lib/types/aiUsage";

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

    const dailySnap = await adminDb.collection("aiUsageDaily")
      .where("clinicId", "==", clinicId)
      .where("date", ">=", startDateStr)
      .where("date", "<=", endDateStr)
      .get();

    const byModel: Record<string, AIUsageBreakdownItem & { _duration: number; _success: number }> = {};
    const byChannel: Record<string, AIUsageBreakdownItem & { _duration: number; _success: number }> = {};
    const byRequestType: Record<string, AIUsageBreakdownItem & { _duration: number; _success: number }> = {};
    
    let totalOverallCost = 0;

    dailySnap.docs.forEach(doc => {
      const data = doc.data();
      const cost = data.totalCostUsd || 0;
      totalOverallCost += cost;

      const addToMap = (
        map: Record<string, any>,
        key: string,
        label: string
      ) => {
        if (!map[key]) {
          map[key] = {
            key,
            label,
            requestCount: 0,
            inputTokens: 0,
            cachedInputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            totalCostUsd: 0,
            avgDurationMs: 0,
            failedCount: 0,
            sharePercent: 0,
            _duration: 0,
            _success: 0,
          };
        }
        const item = map[key];
        item.requestCount += data.requestCount || 0;
        item.inputTokens += data.inputTokens || 0;
        item.cachedInputTokens += data.cachedInputTokens || 0;
        item.outputTokens += data.outputTokens || 0;
        item.totalTokens += data.totalTokens || 0;
        item.totalCostUsd += cost;
        item.failedCount += data.failedCount || 0;
        item._duration += data.totalDurationMs || 0;
        item._success += data.successCount || 0;
      };

      if (data.model) addToMap(byModel, data.model, data.model);
      if (data.channel) addToMap(byChannel, data.channel, CHANNEL_LABELS[data.channel as keyof typeof CHANNEL_LABELS] || data.channel);
      if (data.requestType) addToMap(byRequestType, data.requestType, REQUEST_TYPE_LABELS[data.requestType as keyof typeof REQUEST_TYPE_LABELS] || data.requestType);
    });

    const finalizeMap = (map: Record<string, any>) => {
      return Object.values(map)
        .map(item => {
          if (item._success > 0) {
            item.avgDurationMs = item._duration / item._success;
          }
          if (totalOverallCost > 0) {
            item.sharePercent = (item.totalCostUsd / totalOverallCost) * 100;
          }
          delete item._duration;
          delete item._success;
          return item as AIUsageBreakdownItem;
        })
        .sort((a, b) => b.totalCostUsd - a.totalCostUsd); // sort by cost desc
    };

    // Language breakdown requires querying raw aiUsage since we don't aggregate it daily
    // For large datasets, this might be slow, but for clinic level it's usually fine
    const rawSnap = await adminDb.collection("aiUsage")
      .where("clinicId", "==", clinicId)
      .where("createdAt", ">=", `${startDateStr}T00:00:00.000Z`)
      .where("createdAt", "<=", `${endDateStr}T23:59:59.999Z`)
      .select("language", "totalCostUsd", "totalTokens", "inputTokens", "outputTokens", "cachedInputTokens", "durationMs", "status")
      .get();

    const byLanguage: Record<string, any> = {};
    rawSnap.docs.forEach(doc => {
      const data = doc.data();
      const lang = data.language || "unknown";
      const key = lang.toLowerCase();
      const label = key === "tr" ? "Türkçe" : key === "en" ? "İngilizce" : key === "ar" ? "Arapça" : key === "unknown" ? "Bilinmeyen" : lang.toUpperCase();
      
      if (!byLanguage[key]) {
        byLanguage[key] = {
          key, label, requestCount: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0,
          totalTokens: 0, totalCostUsd: 0, avgDurationMs: 0, failedCount: 0, sharePercent: 0,
          _duration: 0, _success: 0
        };
      }
      
      const item = byLanguage[key];
      item.requestCount += 1;
      item.inputTokens += data.inputTokens || 0;
      item.cachedInputTokens += data.cachedInputTokens || 0;
      item.outputTokens += data.outputTokens || 0;
      item.totalTokens += data.totalTokens || 0;
      item.totalCostUsd += data.totalCostUsd || 0;
      
      if (data.status === "success") {
        item._duration += data.durationMs || 0;
        item._success += 1;
      } else {
        item.failedCount += 1;
      }
    });

    const breakdowns: AIUsageBreakdowns = {
      byModel: finalizeMap(byModel),
      byChannel: finalizeMap(byChannel),
      byRequestType: finalizeMap(byRequestType),
      byLanguage: finalizeMap(byLanguage),
    };

    return NextResponse.json(breakdowns);
  } catch (error: any) {
    console.error("[GET /api/clinics/:clinicId/usage/breakdown] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch breakdowns" },
      { status: error.status || 500 }
    );
  }
}
