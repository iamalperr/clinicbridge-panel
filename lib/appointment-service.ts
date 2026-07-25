import { getAdminDb } from "@/lib/firebase-admin";
import { sendClinicAppointmentEmail } from "@/lib/appointment-notifications";
import { Appointment } from "@/lib/types";

export interface CreateAppointmentPayload {
  clinicId: string;
  patientName: string;
  patientPhone: string;
  patientEmail?: string;
  requestedService: string;
  requestedDate: string;
  requestedTime?: string;
  preferredTimeText?: string;
  preferredTimePeriod?: string;
  preferredTimeStart?: string;
  preferredTimeEnd?: string;
  notes?: string;
  source: string;
  status: string;
  createdBy: string;
  conversationId?: string;
  idempotencyKey?: string;
  notificationChannelToSave?: string;
}

export async function createAppointmentAndNotify(payload: CreateAppointmentPayload): Promise<{
  success: boolean;
  appointmentId: string;
  duplicate?: boolean;
  clinicNotificationStatus: string;
}> {
  console.log(`[MANUAL_APPOINTMENT_CREATE_STARTED] source=${payload.source} clinicId=${payload.clinicId}`);
  
  const adminDb = getAdminDb();
  if (!adminDb) {
    throw new Error("Admin DB is not initialized.");
  }

  // 1. Idempotency Check
  if (payload.idempotencyKey) {
    const existingSnap = await adminDb.collection("clinics").doc(payload.clinicId).collection("appointments")
      .where("idempotencyKey", "==", payload.idempotencyKey).limit(1).get();
    if (!existingSnap.empty) {
      const existingDoc = existingSnap.docs[0];
      console.log(`[APPOINTMENT_DUPLICATE_DETECTED] existingId=${existingDoc.id} idempotencyKey=${payload.idempotencyKey}`);
      return { 
        success: true, 
        appointmentId: existingDoc.id, 
        duplicate: true, 
        clinicNotificationStatus: existingDoc.data().notificationStatus?.emailToClinic || "UNKNOWN" 
      };
    }
  }

  // 2. Fetch Clinic Data & Notification Settings
  console.log(`[CLINIC_NOTIFICATION_SETTINGS_LOAD_STARTED] clinicId=${payload.clinicId}`);
  const clinicSnap = await adminDb.collection("clinics").doc(payload.clinicId).get();
  if (!clinicSnap.exists) {
    throw new Error("Clinic not found");
  }
  const clinicData = clinicSnap.data()!;
  const clinicName = clinicData.name || "Klinik";
  
  // Extract settings
  const ns = clinicData.notificationSettings || {};
  const clinicEmailEnabled = ns.clinic?.newAppointmentEmailEnabled ?? true;
  let rawRecipients: string[] = ns.clinic?.recipientEmails || [];
  
  // Fallbacks if flat structure was used
  if (!rawRecipients || rawRecipients.length === 0) {
    if (clinicData.notificationEmail) rawRecipients.push(clinicData.notificationEmail);
    if (clinicData.email) rawRecipients.push(clinicData.email);
  }

  console.log(`[CLINIC_NOTIFICATION_SETTINGS_LOADED] enabled=${clinicEmailEnabled} rawRecipients=${rawRecipients.length}`);

  // 3. Insert Appointment
  const now = new Date().toISOString();
  const appointmentRef = adminDb.collection("clinics").doc(payload.clinicId).collection("appointments").doc();
  const appointmentId = appointmentRef.id;

  const newAppointment: Partial<Appointment> = {
    id: appointmentId,
    clinicId: payload.clinicId,
    patientName: payload.patientName,
    patientPhone: payload.patientPhone,
    patientPhoneRaw: payload.patientPhone,
    patientEmail: payload.patientEmail || "",
    requestedService: payload.requestedService,
    requestedDate: payload.requestedDate,
    requestedTime: payload.requestedTime || "",
    preferredDate: payload.requestedDate,
    preferredTime: payload.requestedTime || "",
    notes: payload.notes || "",
    source: payload.source,
    status: payload.status as any,
    createdAt: now,
    updatedAt: now,
    createdBy: payload.createdBy
  };

  if (payload.preferredTimeText) newAppointment.preferredTimeText = payload.preferredTimeText;
  if (payload.preferredTimePeriod) newAppointment.preferredTimePeriod = payload.preferredTimePeriod as any;
  if (payload.preferredTimeStart) newAppointment.preferredTimeStart = payload.preferredTimeStart;
  if (payload.preferredTimeEnd) newAppointment.preferredTimeEnd = payload.preferredTimeEnd;
  if (payload.conversationId) newAppointment.conversationId = payload.conversationId;
  if (payload.idempotencyKey) newAppointment.idempotencyKey = payload.idempotencyKey;
  if (payload.notificationChannelToSave) newAppointment.notificationChannel = payload.notificationChannelToSave;

  await appointmentRef.set(newAppointment);
  console.log(`[MANUAL_APPOINTMENT_CREATED] appointmentId=${appointmentId} status=${payload.status}`);

  // 3.1 Local In-App Notification Document
  try {
    await adminDb.collection("clinics").doc(payload.clinicId).collection("notifications").add({
      type: "appointment_request",
      title: "Yeni randevu talebi",
      message: `${payload.patientName} (${payload.patientPhone}) adlı hasta ${payload.requestedService} için randevu talebinde bulundu.`,
      appointmentId,
      conversationId: payload.conversationId || "",
      read: false,
      createdAt: now,
    });
    console.log(`[appointment-notification] Created local notification for clinicId=${payload.clinicId}`);
  } catch (e: any) {
    console.error("[appointment-notification] Error:", e.message);
  }

  // 4. Validate Recipients
  const validRecipients: string[] = [];
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  for (let email of rawRecipients) {
    if (!email) continue;
    let cleanEmail = email.trim().toLowerCase();
    if (cleanEmail === "ornek@klinik.com" || cleanEmail === "ornek@clinic.com") continue; // skip placeholders
    if (emailRegex.test(cleanEmail)) {
      validRecipients.push(cleanEmail);
    }
  }
  
  // Deduplicate
  const uniqueRecipients = Array.from(new Set(validRecipients));
  console.log(`[CLINIC_NOTIFICATION_RECIPIENTS_VALIDATED] configuredRecipientCount=${rawRecipients.length} validRecipientCount=${uniqueRecipients.length}`);

  // 5. Send Clinic Notification
  let notificationStatus = "DISABLED";
  
  if (clinicEmailEnabled && uniqueRecipients.length > 0) {
    console.log(`[CLINIC_NOTIFICATION_SEND_STARTED] appointmentId=${appointmentId}`);
    try {
      const result = await sendClinicAppointmentEmail({
        clinicName,
        clinicEmails: uniqueRecipients,
        patientName: payload.patientName,
        patientPhone: payload.patientPhone,
        patientEmail: payload.patientEmail,
        requestedService: payload.requestedService,
        requestedDate: payload.requestedDate,
        requestedTime: payload.requestedTime,
        preferredTimeText: payload.preferredTimeText,
        preferredTimePeriod: payload.preferredTimePeriod,
        preferredTimeStart: payload.preferredTimeStart,
        preferredTimeEnd: payload.preferredTimeEnd,
        appointmentId,
        notes: payload.notes,
        source: payload.source,
        status: payload.status
      });

      if (result.success) {
        notificationStatus = "SENT";
        console.log(`[CLINIC_NOTIFICATION_PROVIDER_ACCEPTED] appointmentId=${appointmentId} success=true`);
      } else {
        notificationStatus = "FAILED";
        console.log(`[CLINIC_NOTIFICATION_SEND_FAILED] appointmentId=${appointmentId} error=${result.error}`);
      }
    } catch (e: any) {
      notificationStatus = "FAILED";
      console.log(`[CLINIC_NOTIFICATION_SEND_FAILED] appointmentId=${appointmentId} exception=${e.message}`);
    }
  } else if (!clinicEmailEnabled) {
    notificationStatus = "DISABLED";
  } else {
    notificationStatus = "NO_VALID_RECIPIENT";
  }

  // 6. Patient Notifications
  let patientEmailSentStatus = "SKIPPED";
  if (payload.notificationChannelToSave === "email" || payload.notificationChannelToSave === "email_and_sms" || payload.notificationChannelToSave === "email_and_whatsapp") {
    if (payload.patientEmail) {
      try {
        const { sendPatientAppointmentEmail } = await import("@/lib/appointment-notifications");
        const patientResult = await sendPatientAppointmentEmail({
          clinicName,
          clinicEmails: [payload.patientEmail], // Reusing clinicEmails field in payload for recipient email
          patientName: payload.patientName,
          patientPhone: payload.patientPhone,
          patientEmail: payload.patientEmail,
          requestedService: payload.requestedService,
          requestedDate: payload.requestedDate,
          requestedTime: payload.requestedTime,
          preferredTimeStart: payload.preferredTimeStart,
          preferredTimeEnd: payload.preferredTimeEnd,
          preferredTimePeriod: payload.preferredTimePeriod,
          preferredTimeText: payload.preferredTimeText,
          appointmentId,
        });
        patientEmailSentStatus = patientResult.success ? "sent" : "failed";
      } catch (e: any) {
        console.error("[appointment-patient-email] Error:", e.message);
        patientEmailSentStatus = "failed";
      }
    } else {
        patientEmailSentStatus = "missing_contact";
    }
  }

  if (payload.notificationChannelToSave === "sms" || payload.notificationChannelToSave === "email_and_sms") {
    try {
        const { sendPatientSms } = await import("@/lib/appointment-notifications");
        await sendPatientSms({
            phone: payload.patientPhone,
            clinicName,
            requestedDate: payload.requestedDate,
            requestedTime: payload.requestedTime,
            requestedService: payload.requestedService,
        });
    } catch (e: any) {
        console.error("[appointment-sms] Error:", e.message);
    }
  }

  // 7. Update Notification Status in DB
  await appointmentRef.update({
    notificationStatus: {
      emailToClinic: notificationStatus.toLowerCase(),
      smsToPatient: (payload.notificationChannelToSave === "sms" || payload.notificationChannelToSave === "email_and_sms") ? "sent" : "skipped"
    },
    patientNotificationStatus: patientEmailSentStatus
  });
  console.log(`[CLINIC_NOTIFICATION_STATUS_SAVED] appointmentId=${appointmentId} status=${notificationStatus}`);

  return {
    success: true,
    appointmentId,
    clinicNotificationStatus: notificationStatus
  };
}
