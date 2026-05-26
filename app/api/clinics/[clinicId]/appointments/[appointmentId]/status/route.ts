import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { sendSms } from "@/lib/sms/sendSms";

interface RouteParams {
  params: Promise<{ clinicId: string; appointmentId: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { clinicId, appointmentId } = await params;
    const body = await req.json();
    const { newStatus } = body;

    if (!newStatus) {
      return NextResponse.json({ error: "Missing newStatus" }, { status: 400 });
    }

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
    
    if (userSnap.empty) {
      return NextResponse.json({ error: "User not found" }, { status: 403 });
    }
    
    const userData = userSnap.docs[0].data();
    if (userData.role !== "admin" && userData.clinicId !== clinicId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 2. Fetch Clinic & Appointment
    const [clinicSnap, apptSnap] = await Promise.all([
      adminDb.collection("clinics").doc(clinicId).get(),
      adminDb.collection("clinics").doc(clinicId).collection("appointments").doc(appointmentId).get()
    ]);

    if (!apptSnap.exists) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    const apptData = apptSnap.data()!;
    const clinicName = clinicSnap.data()?.name || "Klinik";
    const oldStatus = apptData.status;

    if (oldStatus === newStatus) {
      return NextResponse.json({ success: true, message: "Status unchanged" });
    }

    // Prevent duplicate SMS for the same status
    if (newStatus === "confirmed" && apptData.smsNotificationLastType === "appointment_confirmed" && apptData.smsNotificationStatus === "sent") {
      // Allow status update without resending SMS
      await updateStatusOnly(adminDb, clinicId, appointmentId, newStatus, decodedToken.uid, apptData.conversationId);
      return NextResponse.json({ success: true, sms: { skipped: true, reason: "already_sent" } });
    }

    let smsResult = null;
    let smsMessage = "";
    let smsType = "";
    
    const shouldSendSms = newStatus === "confirmed" || newStatus === "cancelled";
    
    if (shouldSendSms && apptData.patientPhone) {
      const isEn = apptData.language === "en";
      
      const treatment = apptData.treatmentType || apptData.requestedService || apptData.service || apptData.reason;
      const date = apptData.preferredDate || apptData.requestedDate;
      const time = apptData.preferredTime || apptData.requestedTime;

      if (newStatus === "confirmed") {
        smsType = "appointment_confirmed";
        if (treatment && date && time) {
          smsMessage = isEn
            ? `ClinicBridge One: Your appointment request at ${clinicName} has been approved for ${treatment} on ${date} ${time}.`
            : `ClinicBridge One: ${clinicName} randevu talebinizi onayladı. ${treatment} için ${date} ${time} randevu talebiniz uygun görülmüştür. Sağlıklı günler dileriz.`;
        } else {
          smsMessage = isEn
            ? `ClinicBridge One: Your appointment request at ${clinicName} has been approved. The clinic may contact you for details.`
            : `ClinicBridge One: ${clinicName} randevu talebinizi onayladı. Detaylar için kliniğiniz sizinle iletişime geçebilir. Sağlıklı günler dileriz.`;
        }
      } else if (newStatus === "cancelled") {
        smsType = "appointment_cancelled";
        smsMessage = isEn
          ? `ClinicBridge One: Your appointment request at ${clinicName} could not be approved at this time. The clinic may contact you for alternative options.`
          : `ClinicBridge One: ${clinicName} randevu talebiniz şu an için onaylanamadı. Uygun alternatif saatler için kliniğiniz sizinle iletişime geçebilir. Sağlıklı günler dileriz.`;
      }

      // Send SMS
      smsResult = await sendSms({
        to: apptData.patientPhone,
        message: smsMessage,
        clinicId,
        appointmentId,
        type: smsType
      });
    } else if (shouldSendSms && !apptData.patientPhone) {
      smsResult = { success: false, reason: "no_phone", error: "No phone number available" };
    }

    // 3. Update Appointment Document
    const now = new Date().toISOString();
    const updateData: any = {
      status: newStatus,
      updatedAt: now,
      updatedBy: decodedToken.uid
    };

    if (smsResult) {
      updateData.smsNotificationStatus = smsResult.success ? "sent" : (smsResult.skipped ? "skipped" : (smsResult.reason === "invalid_phone" ? "invalid_phone" : "failed"));
      updateData.smsNotificationLastSentAt = now;
      if (smsType) updateData.smsNotificationLastType = smsType;
      if (smsResult.error) updateData.smsNotificationError = smsResult.error;
      updateData.smsNotificationMessagePreview = smsMessage.slice(0, 100);
    }

    await adminDb.collection("clinics").doc(clinicId).collection("appointments").doc(appointmentId).update(updateData);

    // 4. Create SMS Log if applicable
    if (smsResult && smsType) {
      await adminDb.collection("clinics").doc(clinicId).collection("appointments").doc(appointmentId).collection("smsLogs").add({
        type: smsType,
        to: apptData.patientPhone || "",
        message: smsMessage,
        status: smsResult.success ? "success" : "failed",
        provider: process.env.SMS_PROVIDER || "none",
        error: smsResult.error || null,
        reason: smsResult.reason || null,
        createdAt: now,
        triggeredBy: decodedToken.uid,
        oldStatus,
        newStatus
      });
    }

    // 5. Update Conversation Log
    if (apptData.conversationId) {
      const logRef = adminDb.collection("clinics").doc(clinicId).collection("conversationLogs").doc(apptData.conversationId);
      await logRef.update({
        appointmentStatus: newStatus,
        updatedAt: now
      }).catch(e => console.warn("Failed to update conversation log:", e));
    }

    return NextResponse.json({ success: true, sms: smsResult });
    
  } catch (error: any) {
    console.error("Error updating appointment status:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function updateStatusOnly(adminDb: any, clinicId: string, appointmentId: string, newStatus: string, uid: string, convId?: string) {
  const now = new Date().toISOString();
  await adminDb.collection("clinics").doc(clinicId).collection("appointments").doc(appointmentId).update({
    status: newStatus,
    updatedAt: now,
    updatedBy: uid
  });

  if (convId) {
    await adminDb.collection("clinics").doc(clinicId).collection("conversationLogs").doc(convId).update({
      appointmentStatus: newStatus,
      updatedAt: now
    }).catch((e: any) => console.warn("Failed to update conversation log:", e));
  }
}
