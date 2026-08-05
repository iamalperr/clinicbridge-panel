import { NextResponse } from "next/server";
import { AuthError, requireAgencyAccess } from "@/lib/services/apiAuth";
import {
  ClinicOfferDraftError,
  draftClinicOffersForLead,
} from "@/lib/services/clinicOfferDraftService";

export const dynamic = "force-dynamic";

function asClinicOfferDraftError(err: unknown): ClinicOfferDraftError | null {
  if (err instanceof ClinicOfferDraftError) return err;
  // Next.js bundling can break `instanceof` across chunks — fall back to shape.
  if (
    err &&
    typeof err === "object" &&
    (err as { name?: string }).name === "ClinicOfferDraftError" &&
    typeof (err as { code?: string }).code === "string"
  ) {
    const e = err as { code: string; message?: string; status?: number };
    return new ClinicOfferDraftError(e.code, e.message || e.code, e.status || 400);
  }
  return null;
}

function asAuthError(err: unknown): AuthError | null {
  if (err instanceof AuthError) return err;
  if (
    err &&
    typeof err === "object" &&
    (err as { name?: string }).name === "AuthError" &&
    typeof (err as { status?: number }).status === "number"
  ) {
    const e = err as { message?: string; status: number };
    return new AuthError(e.message || "Unauthorized", e.status);
  }
  return null;
}

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
    const authErr = asAuthError(err);
    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: authErr.status });
    }
    const draftErr = asClinicOfferDraftError(err);
    if (draftErr) {
      return NextResponse.json(
        { error: draftErr.code, message: draftErr.message },
        { status: draftErr.status }
      );
    }
    console.error(
      "[draft-offers]",
      err instanceof Error ? err.message : err,
      err instanceof Error ? err.stack : undefined
    );
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : "Internal error",
      },
      { status: 500 }
    );
  }
}
