import { NextResponse } from "next/server";
import { AuthError, requireAgencyAccess } from "@/lib/services/apiAuth";
import {
  PatientOfferEmailError,
  sendPatientOfferEmailForLead,
} from "@/lib/services/patientOfferEmailService";

export const dynamic = "force-dynamic";

/**
 * POST /api/agency/[agencyId]/leads/[leadId]/send-offer
 * Draft offers from pricing if needed, then email the patient offer.
 * Does not itself change funnel status to converted (caller may do that first).
 */
export async function POST(
  req: Request,
  props: { params: Promise<{ agencyId: string; leadId: string }> }
) {
  try {
    const { agencyId, leadId } = await props.params;
    const { uid } = await requireAgencyAccess(req, agencyId);

    let body: { customMessage?: unknown; locale?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      /* empty ok */
    }

    const result = await sendPatientOfferEmailForLead({
      agencyId,
      leadId,
      changedBy: uid,
      customMessage: typeof body.customMessage === "string" ? body.customMessage : undefined,
      locale: typeof body.locale === "string" ? body.locale : undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof PatientOfferEmailError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.status }
      );
    }
    console.error("[send-offer]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
