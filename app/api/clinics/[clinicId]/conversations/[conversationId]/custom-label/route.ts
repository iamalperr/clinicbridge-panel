import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireClinicAccess, AuthError } from "@/lib/services/apiAuth";

/**
 * PATCH /api/clinics/[clinicId]/conversations/[conversationId]/custom-label
 *
 * Updates the custom label on a conversation log document.
 * 
 * Rules:
 * - NEVER modifies the system `status` field
 * - Does NOT create appointments, send emails, or trigger notifications
 * - Does NOT change agent state or conversation transcript
 * - Writes audit fields: customLabelUpdatedBy, customLabelUpdatedAt
 * - Accepts { customLabelId: string | null }
 * - null clears the label
 *
 * Permission: Super Admin, Clinic Admin (NOT clinicUser)
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ clinicId: string; conversationId: string }> }
) {
  try {
    const { clinicId, conversationId } = await params;
    const auth = await requireClinicAccess(req, clinicId);

    // Only superAdmin, admin, and clinicAdmin can update labels
    const allowedRoles = ["superAdmin", "admin", "clinicAdmin"];
    if (!allowedRoles.includes(auth.profile.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions to update conversation labels" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { customLabelId } = body;

    // Validate: must be string or null
    if (customLabelId !== null && typeof customLabelId !== "string") {
      return NextResponse.json(
        { error: "customLabelId must be a string or null" },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    // Verify conversation exists and belongs to this clinic
    const convRef = adminDb
      .collection("clinics")
      .doc(clinicId)
      .collection("conversationLogs")
      .doc(conversationId);

    const convSnap = await convRef.get();
    if (!convSnap.exists) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // If setting a label, verify it exists in the clinic's custom labels
    let labelName: string | null = null;
    if (customLabelId) {
      const labelRef = adminDb
        .collection("clinics")
        .doc(clinicId)
        .collection("customLabels")
        .doc(customLabelId);

      const labelSnap = await labelRef.get();
      if (!labelSnap.exists) {
        return NextResponse.json(
          { error: "Custom label not found" },
          { status: 404 }
        );
      }
      const labelData = labelSnap.data();
      labelName = labelData?.labelTr || labelData?.labelEn || customLabelId;
    }

    // Update ONLY custom label fields — NEVER touch status
    const updatePayload: Record<string, any> = {
      customLabelId: customLabelId || null,
      customLabelName: labelName,
      customLabelUpdatedBy: auth.uid,
      customLabelUpdatedAt: new Date().toISOString(),
    };

    await convRef.update(updatePayload);

    return NextResponse.json({
      ok: true,
      customLabelId: customLabelId || null,
      customLabelName: labelName,
    });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[custom-label-update] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
