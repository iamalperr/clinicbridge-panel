import { NextResponse } from "next/server";
import { requireClinicAccess, AuthError } from "@/lib/services/apiAuth";
import {
  updateContactRequestStatus,
  type ContactRequestStatus,
} from "@/lib/contact-request";
import { getAdminDb } from "@/lib/firebase-admin";

const ALLOWED: ContactRequestStatus[] = [
  "pending",
  "acknowledged",
  "contacted",
  "resolved",
  "cancelled",
];

/**
 * PATCH /api/clinics/[clinicId]/contact-requests/[contactRequestId]
 * Clinic-scoped status updates for Contact Requests.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ clinicId: string; contactRequestId: string }> }
) {
  try {
    const { clinicId, contactRequestId } = await params;
    await requireClinicAccess(req, clinicId);

    const body = await req.json().catch(() => ({}));
    const status = body?.status as ContactRequestStatus;

    if (!status || !ALLOWED.includes(status)) {
      return NextResponse.json(
        { error: "Invalid status", code: "INVALID_STATUS" },
        { status: 400 }
      );
    }

    const result = await updateContactRequestStatus({
      clinicId,
      contactRequestId,
      status,
    });

    if (!result.success) {
      const code = result.reason === "NOT_FOUND" ? 404 : result.reason === "TENANT_MISMATCH" ? 403 : 400;
      return NextResponse.json(
        { error: result.reason || "Update failed", code: result.reason },
        { status: code }
      );
    }

    // Defense in depth: never mirror/mutate another clinic's conversation
    if (result.record && result.record.clinicId !== clinicId) {
      return NextResponse.json(
        { error: "TENANT_MISMATCH", code: "TENANT_MISMATCH" },
        { status: 403 }
      );
    }

    // Mirror status onto conversation log when linked — never demote appointment conversion
    const adminDb = getAdminDb();
    if (adminDb && result.record?.conversationId) {
      const logRef = adminDb
        .collection("clinics")
        .doc(clinicId)
        .collection("conversationLogs")
        .doc(result.record.conversationId);
      const logSnap = await logRef.get();
      const logData = logSnap.exists ? logSnap.data() : null;
      const appointmentWins =
        Boolean(logData?.convertedToAppointment) ||
        logData?.appointmentStatus === "created" ||
        (typeof logData?.appointmentId === "string" && logData.appointmentId.trim().length > 0) ||
        String(logData?.status || "").toLowerCase() === "appointment";

      const patch: Record<string, any> = {
        contactRequestStatus: status,
        updatedAt: new Date().toISOString(),
      };
      if (!appointmentWins) {
        patch.status =
          status === "resolved"
            ? "contact_request_resolved"
            : status === "cancelled"
              ? "answered"
              : "contact_request_pending";
      }
      await logRef.set(patch, { merge: true });
    }

    return NextResponse.json({
      success: true,
      contactRequest: result.record,
    });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
