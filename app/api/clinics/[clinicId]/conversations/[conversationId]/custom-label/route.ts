import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireClinicAccess, AuthError } from "@/lib/services/apiAuth";
import { mapInfrastructureError } from "@/lib/services/infrastructureErrors";
import { canEditConversationLabel } from "@/lib/services/conversations/customLabelClient";

/**
 * PATCH /api/clinics/[clinicId]/conversations/[conversationId]/custom-label
 *
 * Updates the manual custom label / manual conversion status on a conversation log document.
 * 
 * Rules:
 * - NEVER modifies the automatic system `status` field
 * - Does NOT create appointments, send emails, or trigger notifications
 * - Does NOT change agent state, conversation transcript, or existing appointment records
 * - Writes audit fields: customLabelUpdatedBy, customLabelUpdatedAt, manualConversionMarkedAt/By, manualConversionRemovedAt/By
 * - Accepts { customLabelId: string | null }
 * - null clears the label
 *
 * Permission: Super Admin, Admin, Clinic Admin (403 for clinicUser or unauthorized roles)
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ clinicId: string; conversationId: string }> }
) {
  try {
    const { clinicId, conversationId } = await params;
    const auth = await requireClinicAccess(req, clinicId);

    // Only superAdmin, admin, and clinicAdmin can update labels
    if (!canEditConversationLabel(auth.profile?.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions to update conversation labels", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { customLabelId } = body;

    // Validate: must be string or null
    if (customLabelId !== null && typeof customLabelId !== "string") {
      return NextResponse.json(
        { error: "customLabelId must be a string or null", code: "INVALID_REQUEST" },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json(
        { error: "Database unavailable", code: "SERVICE_UNAVAILABLE" },
        { status: 503 }
      );
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
        { error: "Conversation not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const convData = convSnap.data() || {};
    const previousManualConverted =
      convData.manualConversionStatus === "converted_to_appointment" ||
      convData.customLabel === "converted_to_appointment" ||
      convData.customLabelId === "converted_to_appointment" ||
      convData.customLabelId === "appointment_converted";

    const isMarkingConverted =
      customLabelId === "converted_to_appointment" ||
      customLabelId === "appointment_converted";

    let finalLabelId: string | null = null;
    let finalLabelName: string | null = null;

    if (customLabelId) {
      if (isMarkingConverted) {
        finalLabelId = "converted_to_appointment";
        finalLabelName = "Randevuya Dönüştü";
      } else {
        // Check if exists in clinic customLabels collection
        const labelRef = adminDb
          .collection("clinics")
          .doc(clinicId)
          .collection("customLabels")
          .doc(customLabelId);

        const labelSnap = await labelRef.get();
        if (labelSnap.exists) {
          const labelData = labelSnap.data();
          finalLabelId = customLabelId;
          finalLabelName = labelData?.labelTr || labelData?.labelEn || customLabelId;
        } else {
          finalLabelId = customLabelId;
          finalLabelName = customLabelId;
        }
      }
    }

    const now = new Date().toISOString();

    // Update ONLY custom label and manual conversion fields — NEVER touch system status or appointments
    const updatePayload: Record<string, any> = {
      customLabelId: finalLabelId ?? null,
      customLabelName: finalLabelName ?? null,
      customLabel: isMarkingConverted ? "converted_to_appointment" : (finalLabelId || null),
      manualConversionStatus: isMarkingConverted ? "converted_to_appointment" : null,
      customLabelUpdatedBy: auth.uid || null,
      customLabelUpdatedAt: now,
      updatedAt: now,
    };

    if (isMarkingConverted) {
      updatePayload.manualConversionMarkedAt = now;
      updatePayload.manualConversionMarkedBy = auth.uid || null;
    } else if (previousManualConverted) {
      updatePayload.manualConversionRemovedAt = now;
      updatePayload.manualConversionRemovedBy = auth.uid || null;
      updatePayload.manualConversionMarkedAt = null;
      updatePayload.manualConversionMarkedBy = null;
    }

    const sanitizedPayload: Record<string, any> = {};
    for (const [k, v] of Object.entries(updatePayload)) {
      sanitizedPayload[k] = v === undefined ? null : v;
    }

    await convRef.set(sanitizedPayload, { merge: true });

    return NextResponse.json({
      ok: true,
      customLabelId: finalLabelId,
      customLabelName: finalLabelName,
      manualConversionStatus: isMarkingConverted ? "converted_to_appointment" : null,
      updatedAt: now,
    });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message, code: err.status === 403 ? "FORBIDDEN" : "UNAUTHORIZED" },
        { status: err.status }
      );
    }
    // Provider text (e.g. "8 RESOURCE_EXHAUSTED: Quota exceeded") stays in the
    // server log; the client receives only a stable code.
    console.error("[custom-label-update] Error:", err);
    const mapped = mapInfrastructureError(err);
    return NextResponse.json(
      { error: mapped.error, code: mapped.code },
      { status: mapped.status }
    );
  }
}
