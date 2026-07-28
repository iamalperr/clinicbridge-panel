import { NextResponse } from "next/server";
import { requireAgencyAccess } from "@/lib/services/apiAuth";
import { getAgencyLeadDocuments } from "@/lib/services/documentService";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { agencyId: string; leadId: string } }) {
  try {
    const { agencyId, leadId } = params;
    await requireAgencyAccess(req, agencyId);

    const documents = await getAgencyLeadDocuments(agencyId, leadId);

    // Filter out soft-deleted documents
    const activeDocuments = documents.filter(doc => !doc.deletedAt);

    return NextResponse.json({ documents: activeDocuments });
  } catch (error: any) {
    console.error("[Agency Lead Documents GET Error]", error);
    const status = error.status || 500;
    return NextResponse.json({ error: error.message || "INTERNAL_ERROR" }, { status });
  }
}
