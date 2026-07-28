import { NextResponse } from "next/server";
import { validatePatientRequestViewToken } from "@/lib/services/patientPortalTokenService";
import { initializeDocumentUpload } from "@/lib/services/documentService";
import { getAdminDb } from "@/lib/firebase-admin";

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

    const { agencyId, leadId, id: tokenId } = tokenResult.data!;
    
    // Feature flag check
    const db = getAdminDb();
    if (!db) return NextResponse.json({ error: "SYSTEM_ERROR" }, { status: 500 });
    
    const agencySnap = await db.collection("agencies").doc(agencyId).get();
    const agency = agencySnap.data();
    
    if (
      agency?.settings?.documentUploadEnabled !== true ||
      !agency?.settings?.documentUploadAllowedContexts?.includes("agency_patient_request")
    ) {
      return NextResponse.json({ error: "FEATURE_DISABLED" }, { status: 403 });
    }

    const body = await req.json();
    const { category, originalFileName, mimeType, sizeBytes } = body;

    if (!category || !originalFileName || !mimeType || !sizeBytes) {
      return NextResponse.json({ error: "MISSING_PARAMETERS" }, { status: 400 });
    }

    const result = await initializeDocumentUpload(agencyId, leadId, {
      category,
      originalFileName,
      mimeType,
      sizeBytes,
      uploadedByType: "patient",
      patientAccessTokenId: tokenId
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[Patient Portal Document Init Error]", error);
    return NextResponse.json({ error: error.message || "INTERNAL_ERROR" }, { status: 400 });
  }
}
