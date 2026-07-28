import { NextResponse } from "next/server";
import { validatePatientRequestViewToken } from "@/lib/services/patientPortalTokenService";
import { completeDocumentUpload } from "@/lib/services/documentService";

export async function POST(
  req: Request,
  props: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await props.params;
    const tokenResult = await validatePatientRequestViewToken(token);
    
    if (!tokenResult.valid) {
      return NextResponse.json({ error: "INVALID_PORTAL_TOKEN" }, { status: 401 });
    }

    const { agencyId, leadId } = tokenResult.data!;
    
    const body = await req.json();
    const { documentId } = body;

    if (!documentId) {
      return NextResponse.json({ error: "MISSING_PARAMETERS" }, { status: 400 });
    }

    await completeDocumentUpload(agencyId, leadId, documentId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Patient Portal Document Complete Error]", error);
    return NextResponse.json({ error: error.message || "INTERNAL_ERROR" }, { status: 400 });
  }
}
