import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireSuperAdmin } from "@/lib/services/apiAuth";
import type { AIUsageAuditEntry } from "@/lib/types/aiUsage";

export async function GET(req: Request) {
  try {
    await requireSuperAdmin(req);

    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get("limit");
    const pageSize = limitParam ? parseInt(limitParam, 10) : 100;

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    // Since we don't have a background job continuously auditing, 
    // we will run a quick scan on recent aiUsage records to find issues.
    // In a real production system, this would read from a dedicated 'aiUsageAudits' collection 
    // populated by a cron job. For now, we simulate it by scanning the last N records.
    
    const recentUsageSnap = await adminDb.collection("aiUsage")
      .orderBy("createdAt", "desc")
      .limit(pageSize * 2) // scan a bit more than we need
      .get();

    const auditEntries: AIUsageAuditEntry[] = [];
    const internalIds = new Set<string>();

    recentUsageSnap.docs.forEach(doc => {
      const data = doc.data();
      const id = doc.id;
      
      // Check duplicate
      if (internalIds.has(data.internalRequestId)) {
        auditEntries.push({
          id: `audit_${id}_dup`,
          type: "duplicate_request",
          severity: "error",
          message: `Duplicate internalRequestId found: ${data.internalRequestId}`,
          details: { id, internalRequestId: data.internalRequestId },
          createdAt: new Date().toISOString(),
        });
      }
      internalIds.add(data.internalRequestId);

      // Check missing pricing
      if (data.pricingStatus === "missing") {
        auditEntries.push({
          id: `audit_${id}_price`,
          type: "missing_pricing",
          severity: "warning",
          message: `Missing pricing for model: ${data.model}`,
          details: { id, model: data.model },
          createdAt: data.createdAt,
        });
      }

      // Check missing tokens
      if (data.status === "success" && (!data.totalTokens || data.totalTokens <= 0)) {
        auditEntries.push({
          id: `audit_${id}_token`,
          type: "missing_tokens",
          severity: "warning",
          message: `Successful request recorded 0 tokens`,
          details: { id, model: data.model, channel: data.channel },
          createdAt: data.createdAt,
        });
      }
      
      // Check missing clinic ID on non-system
      if (!data.clinicId && data.channel !== "system" && data.channel !== "portal") {
        auditEntries.push({
          id: `audit_${id}_clinic`,
          type: "missing_clinic_id",
          severity: "error",
          message: `Missing clinicId on non-system request`,
          details: { id, channel: data.channel, requestType: data.requestType },
          createdAt: data.createdAt,
        });
      }
    });

    // Sort by most recent first, limit to requested size
    const sorted = auditEntries
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, pageSize);

    return NextResponse.json(sorted);
  } catch (error: any) {
    console.error("[GET /api/admin/usage/audit] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to run audit" },
      { status: error.status || 500 }
    );
  }
}
