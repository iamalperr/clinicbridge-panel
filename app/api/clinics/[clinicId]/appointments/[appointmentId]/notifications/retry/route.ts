import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { notificationService } from "@/lib/services/notifications/NotificationService";
import { ResendEmailProvider } from "@/lib/services/notifications/providers/ResendEmailProvider";

interface RouteParams {
  params: Promise<{ clinicId: string; appointmentId: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { clinicId, appointmentId } = await params;

    // 1. Verify Authorization
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.split("Bearer ")[1];
    
    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();
    if (!adminAuth || !adminDb) {
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    
    const userSnap = await adminDb.collection("users").where("uid", "==", decodedToken.uid).limit(1).get();
    let userData = null;
    
    if (userSnap.empty) {
      const docSnap = await adminDb.collection("users").doc(decodedToken.uid).get();
      if (docSnap.exists) userData = docSnap.data();
    } else {
      userData = userSnap.docs[0].data();
    }
    
    if (!userData || (userData.role !== "admin" && userData.clinicId !== clinicId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 2. Find the failed notification log
    const logsSnap = await adminDb.collection("notification_events")
      .where("clinic_id", "==", clinicId)
      .where("appointment_id", "==", appointmentId)
      .where("channel", "==", "email")
      .orderBy("created_at", "desc")
      .limit(1)
      .get();

    if (logsSnap.empty) {
      return NextResponse.json({ error: "No notification log found to retry." }, { status: 404 });
    }

    const logDoc = logsSnap.docs[0];
    const logData = logDoc.data();

    if (logData.status === "sent") {
      return NextResponse.json({ error: "Notification was already sent successfully." }, { status: 400 });
    }

    // 3. Retry Provider Delivery (Manually invoking the provider for the retry)
    // We cannot use NotificationEngine.sendAppointmentStatusUpdate again because it will update the status and create a new log.
    // Instead we just retry the failed log record.

    const provider = new ResendEmailProvider();

    // Reconstruct the template based on the current appointment data
    const apptSnap = await adminDb.collection("clinics").doc(clinicId).collection("appointments").doc(appointmentId).get();
    if (!apptSnap.exists) {
      return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
    }
    const apptData = apptSnap.data()!;

    const clinicSnap = await adminDb.collection("clinics").doc(clinicId).get();
    const clinicData = clinicSnap.data() || {};
    
    // Import EmailTemplateResolver dynamically so it works in edge/node
    const { getAppointmentStatusEmailTemplate } = await import("@/lib/services/notifications/EmailTemplateResolver");
    const { mapToCanonicalStatus } = await import("@/lib/types/appointment");
    const { resolveAppointmentDisplaySchedule } = await import("@/lib/services/appointments/AppointmentScheduleResolver");
    
    const canonicalStatus = mapToCanonicalStatus(apptData.status);
    const locale = apptData.language === "en" ? "en" : "tr";
    const treatment = apptData.treatmentType || apptData.requestedService || apptData.service || apptData.reason || "";
    
    const schedule = resolveAppointmentDisplaySchedule(apptData);

    const template = getAppointmentStatusEmailTemplate({
      tenantId: logData.tenant_id,
      clinicId,
      status: canonicalStatus,
      locale,
      patientName: apptData.patientName || "",
      clinicName: clinicData.name || "Klinik",
      treatment,
      requestedDate: schedule.requestedDate,
      requestedTime: schedule.requestedTime,
      confirmedDate: schedule.confirmedDate,
      confirmedTime: schedule.confirmedTime,
      changeReason: apptData.rescheduleReason || null
    });

    if (!template) {
      return NextResponse.json({ error: "Template resolution failed during retry." }, { status: 400 });
    }

    const attemptCount = (logData.attempt_count || 0) + 1;
    await logDoc.ref.update({ status: "processing", attempt_count: attemptCount, updated_at: new Date() });

    try {
      const result = await provider.send({
        language: locale,
        to: logData.recipient,
        subject: template.subject,
        variables: { htmlContent: template.htmlContent }
      });

      if (result.success) {
        await logDoc.ref.update({
          status: "sent",
          provider_message_id: result.messageId,
          sent_at: new Date(),
          updated_at: new Date()
        });

        await apptSnap.ref.update({
          patientNotificationSent: true,
          patientNotificationStatus: "ACCEPTED",
          patientNotificationProviderId: result.messageId || null,
          patientNotificationErrorCode: null,
          patientNotificationErrorMessage: null,
          notificationSentAt: new Date().toISOString()
        });

        return NextResponse.json({ success: true, messageId: result.messageId });
      } else {
        await logDoc.ref.update({
          status: "failed",
          failure_reason: result.errorMessage || "Provider error",
          failed_at: new Date(),
          updated_at: new Date()
        });

        await apptSnap.ref.update({
          patientNotificationSent: false,
          patientNotificationStatus: "FAILED",
          patientNotificationErrorCode: result.errorCode || null,
          patientNotificationErrorMessage: result.errorMessage || null,
        });

        return NextResponse.json({ success: false, error: result.errorMessage }, { status: 400 });
      }
    } catch (e: any) {
      await logDoc.ref.update({
        status: "failed",
        failure_reason: e.message,
        failed_at: new Date(),
        updated_at: new Date()
      });
      return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }

  } catch (error: any) {
    console.error("Retry Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
