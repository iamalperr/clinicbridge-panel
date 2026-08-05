import { NextResponse } from "next/server";
import { AuthError, requireAgencyAccess } from "@/lib/services/apiAuth";
import {
  ClinicOfferDraftError,
  draftClinicOffersForLead,
} from "@/lib/services/clinicOfferDraftService";

export const dynamic = "force-dynamic";

/**
 * POST /api/agency/[agencyId]/leads/[leadId]/draft-offers
 * Draft clinicOffers on the linked quote from uploaded clinic pricing.
 */
export async function POST(
  req: Request,
  props: { params: Promise<{ agencyId: string; leadId: string }> }
) {
  try {
    const { agencyId, leadId } = await props.params;
    await requireAgencyAccess(req, agencyId);

    let force = false;
    try {
      const body = await req.json();
      force = body?.force === true;
    } catch {
      /* empty body ok */
    }

    const result = await draftClinicOffersForLead({ agencyId, leadId, force });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof ClinicOfferDraftError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.status }
      );
    }
    console.error(
      "[draft-offers]",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
