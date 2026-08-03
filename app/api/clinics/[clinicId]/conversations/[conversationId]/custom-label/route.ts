import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireClinicAccess, AuthError } from "@/lib/services/apiAuth";
import {
  mapInfrastructureError,
  logInfrastructureFailure,
} from "@/lib/services/infrastructureErrors";
import { canEditConversationLabel } from "@/lib/services/conversations/customLabelClient";
import {
  MANUAL_CONVERSION_VALUE,
  buildManualLabelPayload,
  isConvertedLabelId,
  wasManuallyConverted,
} from "@/lib/services/conversations/manualLabelPayload";

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

const ROUTE_NAME =
  "PATCH /api/clinics/[clinicId]/conversations/[conversationId]/custom-label";

/** Steps tracked so a failure log names the exact operation that threw. */
type LabelUpdateOperation =
  | "resolve_params"
  | "authorize"
  | "parse_body"
  | "init_db"
  | "read_conversation"
  | "read_label"
  | "write_label";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ clinicId: string; conversationId: string }> }
) {
  // Hoisted so the catch block can report context without re-reading anything.
  let clinicId: string | null = null;
  let conversationId: string | null = null;
  let role: string | null = null;
  let operation: LabelUpdateOperation = "resolve_params";

  try {
    ({ clinicId, conversationId } = await params);

    operation = "authorize";
    const auth = await requireClinicAccess(req, clinicId);
    role = auth.profile?.role ?? null;

    // Only superAdmin, admin, and clinicAdmin can update labels
    if (!canEditConversationLabel(auth.profile?.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions to update conversation labels", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    operation = "parse_body";
    const body = await req.json();
    const { customLabelId } = body;

    // Validate: must be string or null
    if (customLabelId !== null && typeof customLabelId !== "string") {
      return NextResponse.json(
        { error: "customLabelId must be a string or null", code: "INVALID_REQUEST" },
        { status: 400 }
      );
    }

    operation = "init_db";
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

    operation = "read_conversation";
    const convSnap = await convRef.get();
    if (!convSnap.exists) {
      return NextResponse.json(
        { error: "Conversation not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const previousManualConverted = wasManuallyConverted(convSnap.data());
    const isMarkingConverted = isConvertedLabelId(customLabelId);

    let finalLabelId: string | null = null;
    let finalLabelName: string | null = null;

    if (customLabelId) {
      if (isMarkingConverted) {
        finalLabelId = MANUAL_CONVERSION_VALUE;
        finalLabelName = "Randevuya Dönüştü";
      } else {
        // Check if exists in clinic customLabels collection
        const labelRef = adminDb
          .collection("clinics")
          .doc(clinicId)
          .collection("customLabels")
          .doc(customLabelId);

        operation = "read_label";
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

    // Label and audit fields only — never the system status or appointments.
    const sanitizedPayload = buildManualLabelPayload({
      labelId: finalLabelId,
      labelName: finalLabelName,
      actorUid: auth.uid || null,
      now,
      previouslyConverted: previousManualConverted,
    });

    operation = "write_label";
    await convRef.set(sanitizedPayload, { merge: true });

    return NextResponse.json({
      ok: true,
      customLabelId: finalLabelId,
      customLabelName: finalLabelName,
      manualConversionStatus: isMarkingConverted ? MANUAL_CONVERSION_VALUE : null,
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
    const mapped = mapInfrastructureError(err);
    logInfrastructureFailure({
      route: ROUTE_NAME,
      operation,
      clinicId,
      conversationId,
      role,
      mapped,
      err,
    });
    return NextResponse.json(
      { error: mapped.error, code: mapped.code },
      { status: mapped.status }
    );
  }
}
