import { NextResponse } from "next/server";
import { requireAgencyAccess } from "@/lib/services/apiAuth";
import { getSignedDownloadUrl } from "@/lib/services/documentService";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { agencyId: string; leadId: string; docId: string } }) {
  try {
    const { agencyId, leadId, docId } = params;
    await requireAgencyAccess(req, agencyId);

    const downloadUrl = await getSignedDownloadUrl(agencyId, leadId, docId);

    return NextResponse.json({ downloadUrl });
  } catch (error: any) {
    console.error("[Agency Document Download Error]", error);
    const status = error.message === "DOCUMENT_NOT_AVAILABLE" || error.message === "DOCUMENT_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ error: error.message || "INTERNAL_ERROR" }, { status });
  }
}
