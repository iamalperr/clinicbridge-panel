import { NextResponse } from "next/server";
import { AuthError, requireAgencyAccess } from "@/lib/services/apiAuth";
import {
  LeadClinicSelectionError,
  updateAgencyLeadClinicSelection,
} from "@/lib/services/leadClinicSelectionService";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/agency/[agencyId]/leads/[leadId]/clinic-selection
 * Authenticated update of selected clinics on a lead (syncs quote + clinic_requests).
 * Does not change lead funnel status.
 */
export async function PATCH(
  req: Request,
  props: { params: Promise<{ agencyId: string; leadId: string }> }
) {
  try {
    const { agencyId, leadId } = await props.params;
    const { uid } = await requireAgencyAccess(req, agencyId);

    let body: { clinicIds?: unknown; note?: unknown; locale?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const clinicIds = Array.isArray(body.clinicIds) ? body.clinicIds : null;
    if (!clinicIds) {
      return NextResponse.json(
        { error: "INVALID_PAYLOAD", message: "clinicIds must be an array" },
        { status: 400 }
      );
    }

    const result = await updateAgencyLeadClinicSelection({
      agencyId,
      leadId,
      clinicIds: clinicIds.map((id) => String(id)),
      changedBy: uid,
      note: typeof body.note === "string" ? body.note : undefined,
      locale: typeof body.locale === "string" ? body.locale : undefined,
    });

    return NextResponse.json({
      ok: true,
      skipped: result.skipped,
      clinicIds: result.clinicIds,
      clinicNames: result.clinicNames,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof LeadClinicSelectionError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.status }
      );
    }
    console.error(
      "[agency lead clinic-selection PATCH]",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
