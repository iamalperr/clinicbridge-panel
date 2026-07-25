import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { sendSms } from "@/lib/sms/sendSms";
import { sendPatientAppointmentStatusEmail } from "@/lib/appointment-notifications";

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
    const clinicData = clinicSnap.data() || {};
    const clinicName = clinicData.name || "Klinik";
    const oldStatus = apptData.status;

    // ── AŞAMA 9: SERVER LOG (START) ──
    const traceId = Math.random().toString(36).substring(7);
    console.log(JSON.stringify({
      checkpoint: "APPT_STATUS_UPDATE_START",
      traceId,
      appointmentId,
      clinicId,
      previousStatus: oldStatus,
      requestedStatus: newStatus,
      userId: decodedToken.uid
    }));

    // ── AŞAMA 3: ENUM KONTROLÜ ──
    const allowedStatuses = ["PENDING_REVIEW", "APPROVED", "CONFIRMED", "REJECTED", "CANCELLED"];
    if (!allowedStatuses.includes(newStatus)) {
      console.log(JSON.stringify({ checkpoint: "APPT_STATUS_UPDATE_FAILED", traceId, appointmentId, reason: "INVALID_APPOINTMENT_STATUS" }));
      return NextResponse.json({
        success: false,
        appointmentUpdated: false,
        errorCode: "INVALID_APPOINTMENT_STATUS",
        message: "Geçersiz randevu durumu."
      }, { status: 400 });
    }

    // ── AŞAMA 7: IDEMPOTENCY ──
    if (oldStatus === newStatus) {
      return NextResponse.json({ 
        success: true, 
        appointmentUpdated: false,
        unchanged: true,
        status: newStatus,
        patientNotificationSent: false
      });
    }

    let notificationSettings = {
      patientAppointmentChannel: "email",
      requireEmail: true,
      requirePhone: false
    };

    if (clinicData.notificationSettings) {
      notificationSettings = clinicData.notificationSettings;
    } else if (clinicData.patientNotificationSettings) {
      notificationSettings = {
        patientAppointmentChannel: clinicData.patientNotificationSettings.primaryChannel === "email_and_sms" || clinicData.patientNotificationSettings.primaryChannel === "email_and_whatsapp" ? "email" : (clinicData.patientNotificationSettings.primaryChannel || "email"),
        requireEmail: clinicData.patientNotificationSettings.collectEmail ?? true,
        requirePhone: clinicData.patientNotificationSettings.collectPhone ?? false
      };
    } else {
      // No configuration found
      return NextResponse.json({ error: "Clinic notification channel is missing or invalid. Please configure notification settings." }, { status: 400 });
    }

    const primaryChannel = notificationSettings.patientAppointmentChannel;

    let notificationResult = null;
    let notificationChannelUsed = "";
    
    // Check if we should trigger a notification
    const shouldNotify = newStatus === "CONFIRMED" || newStatus === "APPROVED" || newStatus === "CANCELLED" || newStatus === "REJECTED";

    if (shouldNotify) {
      const treatment = apptData.treatmentType || apptData.requestedService || apptData.service || apptData.reason || "Genel Muayene";
      const date = apptData.preferredDate || apptData.requestedDate || apptData.proposedDate || "";
      const time = apptData.preferredTime || apptData.requestedTime || apptData.proposedTime || "";

      notificationChannelUsed = primaryChannel;
      
      console.log(JSON.stringify({
        checkpoint: "PATIENT_STATUS_NOTIFICATION_START",
        traceId,
        appointmentId,
        status: newStatus,
        hasPatientEmail: !!apptData.patientEmail,
        notificationChannel: primaryChannel
      }));

      if (primaryChannel === "email") {
        if (apptData.patientEmail) {
          notificationResult = await sendPatientAppointmentStatusEmail({
            patientEmail: apptData.patientEmail,
            patientName: apptData.patientName || "Değerli Hastamız",
            clinicName,
            treatment,
            requestedDate: date,
            requestedTime: time,
            status: newStatus,
            appointmentId
          });
          
          if (notificationResult.success) {
            console.log(JSON.stringify({ checkpoint: "PATIENT_STATUS_NOTIFICATION_SUCCESS", traceId, appointmentId, status: newStatus }));
          } else {
            console.error(JSON.stringify({ checkpoint: "PATIENT_STATUS_NOTIFICATION_FAILED", traceId, appointmentId, status: newStatus, errorCode: "EMAIL_FAILED", errorMessage: notificationResult.error }));
          }
        } else {
          notificationResult = { success: false, reason: "no_email", error: "Hastanın e-posta adresi bulunmuyor." };
          console.warn(JSON.stringify({ checkpoint: "PATIENT_STATUS_NOTIFICATION_FAILED", traceId, appointmentId, status: newStatus, errorCode: "PATIENT_EMAIL_MISSING", errorMessage: "Hastanın e-posta adresi bulunmuyor." }));
        }
      } else if (primaryChannel === "sms") {
        if (apptData.patientPhone) {
          const { sendPatientSms } = await import('@/lib/appointment-notifications');
          
          const isEn = apptData.language === "en";
          let smsMessage = "";
          let smsType = "";

          if (newStatus === "CONFIRMED" || newStatus === "APPROVED") {
            smsType = "appointment_confirmed";
            if (treatment && date && time) {
              smsMessage = isEn
                ? `ClinicBridge AI: Your appointment request at ${clinicName} has been approved for ${treatment} on ${date} ${time}.`
                : `ClinicBridge AI: ${clinicName} randevu talebinizi onayladı. ${treatment} için ${date} ${time} randevu talebiniz uygun görülmüştür. Sağlıklı günler dileriz.`;
            } else {
              smsMessage = isEn
                ? `ClinicBridge AI: Your appointment request at ${clinicName} has been approved. The clinic may contact you for details.`
                : `ClinicBridge AI: ${clinicName} randevu talebinizi onayladı. Detaylar için kliniğiniz sizinle iletişime geçebilir. Sağlıklı günler dileriz.`;
            }
          } else if (newStatus === "CANCELLED" || newStatus === "REJECTED") {
            smsType = "appointment_cancelled";
            smsMessage = isEn
              ? `ClinicBridge AI: Your appointment request at ${clinicName} could not be approved at this time. The clinic may contact you for alternative options.`
              : `ClinicBridge AI: ${clinicName} randevu talebiniz şu an için onaylanamadı. Uygun alternatif saatler için kliniğiniz sizinle iletişime geçebilir. Sağlıklı günler dileriz.`;
          }

          if (smsMessage) {
            notificationResult = await sendPatientSms({
              phone: apptData.patientPhone,
              clinicName: clinicName,
              requestedDate: date,
              requestedTime: time,
              requestedService: treatment,
            });
            (notificationResult as any).smsType = smsType;
            (notificationResult as any).smsMessage = smsMessage;
            
            if (notificationResult.success) {
              console.log(JSON.stringify({ checkpoint: "PATIENT_STATUS_NOTIFICATION_SUCCESS", traceId, appointmentId, status: newStatus }));
            } else {
              console.error(JSON.stringify({ checkpoint: "PATIENT_STATUS_NOTIFICATION_FAILED", traceId, appointmentId, status: newStatus, errorCode: "SMS_FAILED", errorMessage: notificationResult.error }));
            }
          }
        } else {
          notificationResult = { success: false, reason: "no_phone", error: "Hastanın telefon numarası bulunmuyor." };
          console.warn(JSON.stringify({ checkpoint: "PATIENT_STATUS_NOTIFICATION_FAILED", traceId, appointmentId, status: newStatus, errorCode: "PATIENT_PHONE_MISSING", errorMessage: "Hastanın telefon numarası bulunmuyor." }));
        }
      } else if (primaryChannel === "whatsapp") {
        if (apptData.patientPhone) {
          console.log(`[WhatsApp Mock] Sending to ${apptData.patientPhone} for appointment ${appointmentId} status ${newStatus}`);
          notificationResult = { success: true, reason: "mock_whatsapp", message: "WhatsApp notification logged (not sent to real API yet)." };
          console.log(JSON.stringify({ checkpoint: "PATIENT_STATUS_NOTIFICATION_SUCCESS", traceId, appointmentId, status: newStatus }));
        } else {
          notificationResult = { success: false, reason: "no_phone", error: "Hastanın telefon numarası bulunmuyor." };
        }
      } else {
        notificationResult = { success: false, reason: "invalid_channel", error: "Geçersiz bildirim kanalı." };
      }
    }

    // 3. Update Appointment Document
    const now = new Date().toISOString();
    const updateData: any = {
      status: newStatus,
      updatedAt: now,
      updatedBy: decodedToken.uid
    };

    if (notificationResult) {
      updateData.patientNotificationStatus = notificationResult.success ? "sent" : ((notificationResult as any).reason === "no_email" || (notificationResult as any).reason === "no_phone" ? "missing_contact" : "failed");
      updateData.notificationSentAt = now;
      updateData.notificationChannel = notificationChannelUsed;
      if (notificationResult.error) updateData.notificationError = notificationResult.error;
    }

    await adminDb.collection("clinics").doc(clinicId).collection("appointments").doc(appointmentId).update(updateData);

    // 4. Create Notification Log if applicable (for SMS to preserve legacy log, and maybe for Email)
    if (notificationResult && notificationChannelUsed === "sms" && (notificationResult as any).smsType) {
      await adminDb.collection("clinics").doc(clinicId).collection("appointments").doc(appointmentId).collection("smsLogs").add({
        type: (notificationResult as any).smsType,
        to: apptData.patientPhone || "",
        message: (notificationResult as any).smsMessage,
        status: notificationResult.success ? "success" : "failed",
        provider: process.env.SMS_PROVIDER || "none",
        error: notificationResult.error || null,
        reason: (notificationResult as any).reason || null,
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

    console.log(JSON.stringify({ checkpoint: "APPT_STATUS_UPDATE_SUCCESS", traceId, appointmentId, previousStatus: oldStatus, status: newStatus }));

    return NextResponse.json({ 
      success: true, 
      appointmentUpdated: true,
      appointmentId,
      previousStatus: oldStatus,
      status: newStatus,
      patientNotificationSent: notificationResult ? notificationResult.success : false,
      patientNotificationError: notificationResult && !notificationResult.success ? notificationResult.error : null,
      notification: {
        channel: notificationChannelUsed,
        result: notificationResult
      } 
    });
    
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
