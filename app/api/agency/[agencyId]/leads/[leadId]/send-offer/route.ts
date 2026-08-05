import { NextResponse } from "next/server";
import { AuthError, requireAgencyAccess } from "@/lib/services/apiAuth";
import {
  PatientOfferEmailError,
  sendPatientOfferEmailForLead,
} from "@/lib/services/patientOfferEmailService";

export const dynamic = "force-dynamic";

function asPatientOfferEmailError(err: unknown): PatientOfferEmailError | null {
  if (err instanceof PatientOfferEmailError) return err;
  if (
    err &&
    typeof err === "object" &&
    (err as { name?: string }).name === "PatientOfferEmailError" &&
    typeof (err as { code?: string }).code === "string"
  ) {
    const e = err as { code: string; message?: string; status?: number };
    return new PatientOfferEmailError(e.code, e.message || e.code, e.status || 400);
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
    const authErr = asAuthError(err);
    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: authErr.status });
    }
    const offerErr = asPatientOfferEmailError(err);
    if (offerErr) {
      return NextResponse.json(
        { error: offerErr.code, message: offerErr.message },
        { status: offerErr.status }
      );
    }
    if (
      err &&
      typeof err === "object" &&
      (err as { name?: string }).name === "ClinicOfferDraftError" &&
      typeof (err as { code?: string }).code === "string"
    ) {
      const e = err as { code: string; message?: string; status?: number };
      return NextResponse.json(
        { error: e.code, message: e.message || e.code },
        { status: e.status || 400 }
      );
    }
    console.error("[send-offer]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : "Internal error",
      },
      { status: 500 }
    );
  }
}
