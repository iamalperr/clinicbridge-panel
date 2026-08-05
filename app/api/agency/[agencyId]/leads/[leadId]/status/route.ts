import { NextResponse } from "next/server";
import { AuthError, requireAgencyAccess } from "@/lib/services/apiAuth";
import { isManualLeadStatusUpdate } from "@/lib/agency/leadStatusActions";
import {
  LeadStatusUpdateError,
  updateAgencyLeadStatus,
} from "@/lib/services/leadStatusUpdateService";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/agency/[agencyId]/leads/[leadId]/status
 * Authenticated agency lead status update (Super Admin + agency roles).
 */
export async function PATCH(
  req: Request,
  props: { params: Promise<{ agencyId: string; leadId: string }> }
) {
  try {
    const { agencyId, leadId } = await props.params;
    const { uid } = await requireAgencyAccess(req, agencyId);

    let body: { status?: unknown; note?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const status = body.status;
    if (!isManualLeadStatusUpdate(status)) {
      return NextResponse.json(
        {
          error: "INVALID_STATUS",
          message: "Status must be one of: clinic_contacted, converted, lost",
        },
        { status: 400 }
      );
    }

    const note = typeof body.note === "string" ? body.note : undefined;

    const result = await updateAgencyLeadStatus({
      agencyId,
      leadId,
      status,
      changedBy: uid,
      note,
    });

    return NextResponse.json({
      ok: true,
      status: result.status,
      skipped: result.skipped,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof LeadStatusUpdateError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    console.error("[agency lead status PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
