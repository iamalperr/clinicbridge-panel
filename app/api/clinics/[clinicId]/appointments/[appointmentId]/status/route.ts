import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { sendSms } from "@/lib/sms/sendSms";
import { sendPatientAppointmentStatusEmail, resolvePatientEmail } from "@/lib/appointment-notifications";

interface RouteParams {
  params: Promise<{ clinicId: string; appointmentId: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  return handleStatusUpdate(req, params);
}

export async function PATCH(req: Request, { params }: RouteParams) {
  return handleStatusUpdate(req, params);
}

async function handleStatusUpdate(req: Request, paramsPromise: Promise<{ clinicId: string; appointmentId: string }>) {
  try {
    const { clinicId, appointmentId } = await paramsPromise;
    const body = await req.json();
    const reqStatus = body.status || body.newStatus;

    if (!reqStatus) {
      return NextResponse.json({ error: "Missing status" }, { status: 400 });
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
    
    // Robust User Authentication Check
    const userSnap = await adminDb.collection("users").where("uid", "==", decodedToken.uid).limit(1).get();
    let userData = null;
    
    if (userSnap.empty) {
      const docSnap = await adminDb.collection("users").doc(decodedToken.uid).get();
      if (docSnap.exists) {
        userData = docSnap.data();
      }
    } else {
      userData = userSnap.docs[0].data();
    }
    
    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 403 });
    }
    
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
      requestedStatus: reqStatus,
      userId: decodedToken.uid
    }));

    // ── AŞAMA 3: ENUM KONTROLÜ ──
    const allowedStatuses = ["PENDING_REVIEW", "APPROVED", "CONFIRMED", "REJECTED", "CANCELLED"];
    if (!allowedStatuses.includes(reqStatus)) {
      console.log(JSON.stringify({ checkpoint: "APPT_STATUS_UPDATE_FAILED", traceId, appointmentId, reason: "INVALID_APPOINTMENT_STATUS" }));
      return NextResponse.json({
        success: false,
        appointmentUpdated: false,
        errorCode: "INVALID_APPOINTMENT_STATUS",
        message: "Geçersiz randevu durumu."
      }, { status: 400 });
    }

    // ── AŞAMA 7: IDEMPOTENCY ──
    if (oldStatus === reqStatus) {
      return NextResponse.json({ 
        success: true, 
        appointmentUpdated: false,
        unchanged: true,
        status: reqStatus,
        patientNotificationSent: false
      });
    }

    // ── AŞAMA 4: UPDATE FIRESTORE FIRST ──
    const now = new Date().toISOString();
    const updateData: any = {
      status: reqStatus,
      updatedAt: now,
      statusUpdatedAt: now,
      statusUpdatedBy: decodedToken.uid
    };

    try {
      await adminDb.collection("clinics").doc(clinicId).collection("appointments").doc(appointmentId).update(updateData);
      
      if (apptData.conversationId) {
        const logRef = adminDb.collection("clinics").doc(clinicId).collection("conversationLogs").doc(apptData.conversationId);
        await logRef.update({
          appointmentStatus: reqStatus,
          updatedAt: now
        }).catch(e => console.warn("Failed to update conversation log:", e));
      }
    } catch (dbError) {
      console.error("Firestore update error:", dbError);
      throw new Error("Veritabanı güncellenemedi.");
    }

    // ── AŞAMA 5: SEND NOTIFICATION ──
    let notificationSettings = {
      patientAppointmentChannel: "email",
      requireEmail: true,
      requirePhone: false
    };
    
    let hasValidConfig = true;

    if (clinicData.notificationSettings) {
      notificationSettings = clinicData.notificationSettings;
    } else if (clinicData.patientNotificationSettings) {
      notificationSettings = {
        patientAppointmentChannel: clinicData.patientNotificationSettings.primaryChannel === "email_and_sms" || clinicData.patientNotificationSettings.primaryChannel === "email_and_whatsapp" ? "email" : (clinicData.patientNotificationSettings.primaryChannel || "email"),
        requireEmail: clinicData.patientNotificationSettings.collectEmail ?? true,
        requirePhone: clinicData.patientNotificationSettings.collectPhone ?? false
      };
    } else {
      console.warn("Clinic notification channel is missing. Proceeding without email notification.");
      hasValidConfig = false;
    }

    const primaryChannel = notificationSettings.patientAppointmentChannel ?? "NOT_CONFIGURED";

    let notificationResult = null;
    let notificationChannelUsed = "";
    
    // Check if we should trigger a notification
    const shouldNotify = hasValidConfig && (reqStatus === "CONFIRMED" || reqStatus === "APPROVED" || reqStatus === "CANCELLED" || reqStatus === "REJECTED");

    if (shouldNotify) {
      const treatment = apptData.treatmentType || apptData.requestedService || apptData.service || apptData.reason || "Genel Muayene";
      const date = apptData.preferredDate || apptData.requestedDate || apptData.proposedDate || "";
      const time = apptData.preferredTime || apptData.requestedTime || apptData.proposedTime || "";

      notificationChannelUsed = primaryChannel;
      
      console.log(JSON.stringify({
        checkpoint: "PATIENT_STATUS_NOTIFICATION_START",
        traceId,
        appointmentId,
        status: reqStatus,
        hasPatientEmail: !!apptData.patientEmail,
        notificationChannel: primaryChannel
      }));

      if (primaryChannel === "email") {
        try {
          notificationResult = await sendPatientAppointmentStatusEmail({
            patientEmail: apptData.patientEmail,
            email: apptData.email,
            patient: apptData.patient,
            contactEmail: apptData.contactEmail,
            patientName: apptData.patientName || "Değerli Hastamız",
            clinicName,
            treatment,
            requestedDate: date,
            requestedTime: time,
            status: reqStatus,
            appointmentId
          } as any);
          
          if (notificationResult.success) {
            console.log(JSON.stringify({ checkpoint: "PATIENT_STATUS_NOTIFICATION_SUCCESS", traceId, appointmentId, status: reqStatus }));
          } else {
            console.error(JSON.stringify({ checkpoint: "PATIENT_STATUS_NOTIFICATION_FAILED", traceId, appointmentId, status: reqStatus, errorCode: "EMAIL_FAILED", errorMessage: notificationResult.error || (notificationResult as any).errorMessage }));
          }
        } catch (notifErr: any) {
          notificationResult = { success: false, reason: "exception", error: notifErr.message };
          console.error(JSON.stringify({ checkpoint: "PATIENT_STATUS_NOTIFICATION_FAILED", traceId, appointmentId, status: reqStatus, errorCode: "EXCEPTION", errorMessage: notifErr.message }));
        }
      } else if (primaryChannel === "sms") {
        if (apptData.patientPhone) {
          const { sendPatientSms } = await import('@/lib/appointment-notifications');
          
          const isEn = apptData.language === "en";
          let smsMessage = "";
          let smsType = "";

          if (reqStatus === "CONFIRMED" || reqStatus === "APPROVED") {
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
          } else if (reqStatus === "CANCELLED" || reqStatus === "REJECTED") {
            smsType = "appointment_cancelled";
            smsMessage = isEn
              ? `ClinicBridge AI: Your appointment request at ${clinicName} could not be approved at this time. The clinic may contact you for alternative options.`
              : `ClinicBridge AI: ${clinicName} randevu talebiniz şu an için onaylanamadı. Uygun alternatif saatler için kliniğiniz sizinle iletişime geçebilir. Sağlıklı günler dileriz.`;
          }

          if (smsMessage) {
            try {
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
                console.log(JSON.stringify({ checkpoint: "PATIENT_STATUS_NOTIFICATION_SUCCESS", traceId, appointmentId, status: reqStatus }));
              } else {
                console.error(JSON.stringify({ checkpoint: "PATIENT_STATUS_NOTIFICATION_FAILED", traceId, appointmentId, status: reqStatus, errorCode: "SMS_FAILED", errorMessage: notificationResult.error }));
              }
            } catch (smsErr: any) {
              notificationResult = { success: false, reason: "exception", error: smsErr.message };
              console.error(JSON.stringify({ checkpoint: "PATIENT_STATUS_NOTIFICATION_FAILED", traceId, appointmentId, status: reqStatus, errorCode: "EXCEPTION", errorMessage: smsErr.message }));
            }
          }
        } else {
          notificationResult = { success: false, reason: "no_phone", error: "Hastanın telefon numarası bulunmuyor." };
          console.warn(JSON.stringify({ checkpoint: "PATIENT_STATUS_NOTIFICATION_FAILED", traceId, appointmentId, status: reqStatus, errorCode: "PATIENT_PHONE_MISSING", errorMessage: "Hastanın telefon numarası bulunmuyor." }));
        }
      } else if (primaryChannel === "whatsapp") {
        if (apptData.patientPhone) {
          console.log(`[WhatsApp Mock] Sending to ${apptData.patientPhone} for appointment ${appointmentId} status ${reqStatus}`);
          notificationResult = { success: true, reason: "mock_whatsapp", message: "WhatsApp notification logged (not sent to real API yet)." };
          console.log(JSON.stringify({ checkpoint: "PATIENT_STATUS_NOTIFICATION_SUCCESS", traceId, appointmentId, status: reqStatus }));
        } else {
          notificationResult = { success: false, reason: "no_phone", error: "Hastanın telefon numarası bulunmuyor." };
        }
      } else {
        notificationResult = { success: false, reason: "invalid_channel", error: "Geçersiz bildirim kanalı." };
      }
    }

    // 6. Update Notification Status in Firestore if applicable
    if (notificationResult) {
      const isAccepted = notificationResult.success;
      const notifUpdateData: any = {
        patientNotificationSent: isAccepted,
        patientNotificationStatus: isAccepted ? "ACCEPTED" : "FAILED",
        patientNotificationProviderId: (notificationResult as any).messageId || null,
        patientNotificationErrorCode: (notificationResult as any).errorCode || null,
        patientNotificationErrorMessage: (notificationResult as any).errorMessage || notificationResult.error || null,
        notificationSentAt: now,
      };
      
      if (notificationChannelUsed !== undefined) {
        notifUpdateData.notificationChannel = notificationChannelUsed;
      }
      
      const safeUpdateData = Object.fromEntries(
        Object.entries(notifUpdateData).filter(([, value]) => value !== undefined)
      );

      await adminDb.collection("clinics").doc(clinicId).collection("appointments").doc(appointmentId).update(safeUpdateData);
    }

    // Create Notification Log if applicable (for SMS to preserve legacy log)
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
        newStatus: reqStatus
      });
    }

    console.log(JSON.stringify({ checkpoint: "APPT_STATUS_UPDATE_SUCCESS", traceId, appointmentId, previousStatus: oldStatus, status: reqStatus }));

    const responsePayload = { 
      success: true, 
      appointmentUpdated: true,
      appointmentId,
      previousStatus: oldStatus,
      status: reqStatus,
      patientNotificationSent: notificationResult ? notificationResult.success : false,
      patientNotificationStatus: notificationResult ? ((notificationResult as any).status || (notificationResult.success ? "ACCEPTED" : "FAILED")) : "NOT_ATTEMPTED",
      patientNotificationErrorCode: notificationResult ? ((notificationResult as any).errorCode || null) : null,
      patientNotificationErrorMessage: notificationResult ? ((notificationResult as any).errorMessage || notificationResult.error || null) : null,
      patientNotificationProvider: notificationChannelUsed,
      patientNotificationAttempted: notificationResult ? (notificationResult as any).attempted : false,
      patientNotificationProviderId: notificationResult ? ((notificationResult as any).messageId || (notificationResult as any).providerMessageId || null) : null,
      notification: {
        channel: notificationChannelUsed,
        result: notificationResult
      } 
    };

    console.log("[APPOINTMENT_STATUS_NOTIFICATION_RESULT]", JSON.stringify(responsePayload));

    return NextResponse.json(responsePayload);
    
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
