import { NextResponse } from "next/server";
import { validatePatientRequestViewToken } from "@/lib/services/patientPortalTokenService";
import { getPatientDocuments } from "@/lib/services/documentService";
import { getAdminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { token: string } }) {
  try {
    const { token } = params;
    const tokenResult = await validatePatientRequestViewToken(token);
    
    if (!tokenResult.valid) {
      return NextResponse.json({ error: "INVALID_PORTAL_TOKEN" }, { status: 401 });
    }

    const { agencyId, leadId } = tokenResult.data!;
    
    // Feature flag check
    const db = getAdminDb();
    if (!db) return NextResponse.json({ error: "SYSTEM_ERROR" }, { status: 500 });
    
    const agencySnap = await db.collection("agencies").doc(agencyId).get();
    const agency = agencySnap.data();
    
    if (
      agency?.settings?.documentUploadEnabled !== true ||
      !agency?.settings?.documentUploadAllowedContexts?.includes("agency_patient_request")
    ) {
      // Just return empty instead of 403 to not break UI if feature toggled off suddenly
      return NextResponse.json({ documents: [] });
    }

    const documents = await getPatientDocuments(agencyId, leadId);

    // Filter out deleted documents and return only safe fields to client
    const safeDocuments = documents.filter(doc => !doc.deletedAt).map(doc => ({
      id: doc.id,
      category: doc.category,
      sanitizedFileName: doc.sanitizedFileName,
      sizeBytes: doc.sizeBytes,
      status: doc.status,
      scanStatus: doc.scanStatus,
      createdAt: doc.createdAt
    }));

    return NextResponse.json({ documents: safeDocuments });
  } catch (error: any) {
    console.error("[Patient Portal Document List Error]", error);
    return NextResponse.json({ error: error.message || "INTERNAL_ERROR" }, { status: 400 });
  }
}
