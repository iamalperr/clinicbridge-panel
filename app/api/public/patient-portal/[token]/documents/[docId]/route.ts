import { NextResponse } from "next/server";
import { validatePatientRequestViewToken } from "@/lib/services/patientPortalTokenService";
import { softDeleteDocument } from "@/lib/services/documentService";

export async function DELETE(req: Request, { params }: { params: { token: string; docId: string } }) {
  try {
    const { token, docId } = params;
    const tokenResult = await validatePatientRequestViewToken(token);
    
    if (!tokenResult.valid) {
      return NextResponse.json({ error: "INVALID_PORTAL_TOKEN" }, { status: 401 });
    }

    const { agencyId, leadId } = tokenResult.data!;
    
    // We do not check feature flag here to allow patients to delete their documents even if the feature was turned off.

    await softDeleteDocument(agencyId, leadId, docId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Patient Portal Document Delete Error]", error);
    return NextResponse.json({ error: error.message || "INTERNAL_ERROR" }, { status: 400 });
  }
}
