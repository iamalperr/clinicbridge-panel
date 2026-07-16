import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireClinicAccess } from "@/lib/services/apiAuth";
import type { AIUsageRecordRow } from "@/lib/types/aiUsage";

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
    const lastVisibleStr = searchParams.get("lastVisible"); // For pagination
    const limitParam = searchParams.get("limit");
    const pageSize = limitParam ? parseInt(limitParam, 10) : 50;

    if (!startDateStr || !endDateStr) {
      return NextResponse.json({ error: "Missing date range" }, { status: 400 });
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    let query = adminDb.collection("aiUsage")
      .where("clinicId", "==", clinicId)
      .where("createdAt", ">=", `${startDateStr}T00:00:00.000Z`)
      .where("createdAt", "<=", `${endDateStr}T23:59:59.999Z`)
      .orderBy("createdAt", "desc");

    // Pagination: if lastVisible is provided, use it as a starting point.
    // Note: Firestore requires the document snapshot or the exact field value.
    // Here we use the createdAt string value. For precise pagination with potential duplicates,
    // we'd also need to order by document ID, but createdAt (ISO string with ms) is usually unique enough here.
    if (lastVisibleStr) {
      query = query.startAfter(lastVisibleStr);
    }

    query = query.limit(pageSize);

    const snap = await query.get();
    
    const records: AIUsageRecordRow[] = snap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        createdAt: data.createdAt,
        requestType: data.requestType,
        channel: data.channel,
        model: data.model,
        conversationId: data.conversationId,
        inputTokens: data.inputTokens || 0,
        outputTokens: data.outputTokens || 0,
        totalTokens: data.totalTokens || 0,
        totalCostUsd: data.totalCostUsd || 0,
        durationMs: data.durationMs,
        status: data.status,
      };
    });

    const newLastVisible = records.length > 0 ? records[records.length - 1].createdAt : null;

    return NextResponse.json({
      records,
      lastVisible: newLastVisible,
      hasMore: records.length === pageSize
    });
  } catch (error: any) {
    console.error("[GET /api/clinics/:clinicId/usage/records] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch records" },
      { status: error.status || 500 }
    );
  }
}
