import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { createExtendedRequestToken } from "@/lib/services/extendedRequestService";

const db = getAdminDb()!;

export async function POST(req: Request) {
  try {
    const { agencyId, leadId, conversationId, locale } = await req.json();

    if (!agencyId || !leadId || !conversationId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Verify agency
    const agencyDoc = await db.collection("agencies").doc(agencyId).get();
    if (!agencyDoc.exists) {
      return NextResponse.json({ error: "Agency not found" }, { status: 404 });
    }

    const agencyData = agencyDoc.data();
    if (agencyData?.settings?.extendedClinicRequestEnabled !== true) {
      return NextResponse.json({ error: "EXTENDED_REQUEST_NOT_ENABLED" }, { status: 403 });
    }

    // Verify lead belongs to conversation
    const leadDoc = await db.collection("agencies").doc(agencyId).collection("leads").doc(leadId).get();
    if (!leadDoc.exists) {
      return NextResponse.json({ error: "AGENCY_LEAD_NOT_FOUND" }, { status: 404 });
    }
    
    if (leadDoc.data()?.conversationId !== conversationId) {
      return NextResponse.json({ error: "TENANT_MISMATCH" }, { status: 403 });
    }

    // Generate token
    const mode = agencyData.settings.extendedClinicRequestMode || "internal_registration";
    
    const { rawToken } = await createExtendedRequestToken(
      agencyId,
      leadId,
      conversationId,
      locale || "en",
      mode
    );

    return NextResponse.json({ token: rawToken, mode });
  } catch (error: any) {
    console.error("[ExtendedRequest Generate Error]", error);
    return NextResponse.json({ error: error.message || "INTERNAL_ERROR" }, { status: 500 });
  }
}
