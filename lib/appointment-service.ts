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

export function validateAppointmentPayload(payload: CreateAppointmentPayload): CreateAppointmentPayload {
  console.log(`[APPOINTMENT_PAYLOAD_VALIDATED] convId=${payload.conversationId} clinicId=${payload.clinicId} timestamp=${new Date().toISOString()}`);
  if (!payload.clinicId) throw new Error("Missing clinicId");
  if (!payload.patientName) throw new Error("Missing patientName");
  if (!payload.patientPhone) throw new Error("Missing patientPhone");
  return payload;
}

export async function createAppointmentRecord(payload: CreateAppointmentPayload): Promise<{ record: Partial<Appointment> | null, step_failed?: string, reason?: string, stack?: string }> {
  const adminDb = getAdminDb();
  if (!adminDb) {
    return { record: null, step_failed: "STEP 5", reason: "Admin DB not initialized", stack: new Error().stack };
  }
  
  console.log(`[STEP 5] attempting database insert for clinicId: ${payload.clinicId}`);
  
  try {
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
    
    // Verify insertion
    const verifySnap = await appointmentRef.get();
    if (!verifySnap.exists) {
        return { record: null, step_failed: "STEP 6", reason: "Record was not found after insertion", stack: new Error().stack };
    }
    
    console.log(`[STEP 6] database insert result: SUCCESS`);
    console.log(`[STEP 7] generated appointment id: ${appointmentId}`);
    
    // Create in-app notification silently
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
    } catch (e: any) { }
    
    return { record: newAppointment };
  } catch (err: any) {
    return { record: null, step_failed: "STEP 5", reason: err.message, stack: err.stack };
  }
}

export async function sendClinicNewAppointmentNotification(appointment: Partial<Appointment>): Promise<{ status: string, providerResponse?: any }> {
  const adminDb = getAdminDb();
  if (!adminDb || !appointment.clinicId) return { status: "FAILED" };

  console.log(`[STEP 8] loading notification settings`);
  
  let clinicSnap: any = await adminDb.collection("clinics").doc(appointment.clinicId).get();
  
  // Fallback for agency clinics where clinicId is a slug instead of the root document ID
  if (!clinicSnap.exists) {
    const agenciesSnap = await adminDb.collection("agencies").get();
    for (const agency of agenciesSnap.docs) {
      const aClinicsQuery = await adminDb.collection("agencies").doc(agency.id).collection("clinics").where("clinicSlug", "==", appointment.clinicId).limit(1).get();
      if (!aClinicsQuery.empty) {
        clinicSnap = aClinicsQuery.docs[0];
        break;
      }
      
      // Also try to check if the doc ID matches in case it was passed
      const directSnap = await adminDb.collection("agencies").doc(agency.id).collection("clinics").doc(appointment.clinicId).get();
      if (directSnap.exists) {
        clinicSnap = directSnap;
        break;
      }
    }
  }

  if (!clinicSnap.exists) {
    console.error(`[CLINIC_NOTIFICATION_FAILED] Could not find clinic data for clinicId=${appointment.clinicId}`);
    return { status: "FAILED" };
  }
  
  console.log(`[STEP 9] notification settings found`);
  
  const clinicData = clinicSnap.data()!;
  const clinicName = clinicData.clinicName || clinicData.name || "Klinik";
  
  const ns = clinicData.notificationSettings || {};
  const clinicEmailEnabled = ns.clinic?.newAppointmentEmailEnabled ?? true;
  let rawRecipients: string[] = ns.clinic?.recipientEmails || [];
  
  if (!rawRecipients || rawRecipients.length === 0) {
    if (clinicData.notificationEmail) rawRecipients.push(clinicData.notificationEmail);
    if (clinicData.email) rawRecipients.push(clinicData.email);
  }

  const validRecipients: string[] = [];
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (let email of rawRecipients) {
    if (!email) continue;
    let cleanEmail = email.trim().toLowerCase();
    if (cleanEmail === "ornek@klinik.com" || cleanEmail === "ornek@clinic.com") continue;
    if (emailRegex.test(cleanEmail)) validRecipients.push(cleanEmail);
  }
  const uniqueRecipients = Array.from(new Set(validRecipients));

  if (!clinicEmailEnabled || uniqueRecipients.length === 0) {
     return { status: "DISABLED" };
  }

  console.log(`[STEP 10] sending email`);

  try {
    const result = await sendClinicAppointmentEmail({
      clinicName,
      clinicEmails: uniqueRecipients,
      patientName: appointment.patientName!,
      patientPhone: appointment.patientPhone!,
      patientEmail: appointment.patientEmail,
      requestedService: appointment.requestedService!,
      requestedDate: appointment.requestedDate!,
      requestedTime: appointment.requestedTime,
      preferredTimeText: appointment.preferredTimeText,
      preferredTimePeriod: appointment.preferredTimePeriod,
      preferredTimeStart: appointment.preferredTimeStart,
      preferredTimeEnd: appointment.preferredTimeEnd,
      appointmentId: appointment.id!,
      notes: appointment.notes,
      source: appointment.source!,
      status: appointment.status!
    });

    console.log(`[STEP 11] provider response:`, result);

    if (result.success) {
      return { status: "SENT", providerResponse: result };
    } else {
      return { status: "FAILED", providerResponse: result };
    }
  } catch (e: any) {
    console.log(`[STEP 11] provider response (exception): ${e.message}`);
    return { status: "FAILED", providerResponse: { error: e.message } };
  }
}

export async function sendPatientAppointmentAcknowledgement(appointment: Partial<Appointment>): Promise<{ status: string }> {
  let patientEmailSentStatus = "SKIPPED";
  
  const adminDb = getAdminDb();
  if (!adminDb || !appointment.clinicId) return { status: "FAILED" };
  const clinicSnap = await adminDb.collection("clinics").doc(appointment.clinicId).get();
  const clinicName = clinicSnap.exists ? clinicSnap.data()?.name || "Klinik" : "Klinik";

  if (appointment.notificationChannel === "email" || appointment.notificationChannel === "email_and_sms" || appointment.notificationChannel === "email_and_whatsapp") {
    if (appointment.patientEmail) {
      try {
        const { sendPatientAppointmentEmail } = await import("@/lib/appointment-notifications");
        const patientResult = await sendPatientAppointmentEmail({
          clinicName,
          clinicEmails: [appointment.patientEmail],
          patientName: appointment.patientName!,
          patientPhone: appointment.patientPhone!,
          patientEmail: appointment.patientEmail,
          requestedService: appointment.requestedService!,
          requestedDate: appointment.requestedDate!,
          requestedTime: appointment.requestedTime,
          preferredTimeStart: appointment.preferredTimeStart,
          preferredTimeEnd: appointment.preferredTimeEnd,
          preferredTimePeriod: appointment.preferredTimePeriod,
          preferredTimeText: appointment.preferredTimeText,
          appointmentId: appointment.id!,
        });
        patientEmailSentStatus = patientResult.success ? "SENT" : "FAILED";
      } catch (e: any) {
        patientEmailSentStatus = "FAILED";
      }
    } else {
        patientEmailSentStatus = "FAILED";
    }
  }

  if (patientEmailSentStatus === "SENT") {
      console.log(`[PATIENT_NOTIFICATION_SENT] convId=${appointment.conversationId} clinicId=${appointment.clinicId} appointmentId=${appointment.id} timestamp=${new Date().toISOString()}`);
  } else if (patientEmailSentStatus === "FAILED") {
      console.log(`[PATIENT_NOTIFICATION_FAILED] convId=${appointment.conversationId} clinicId=${appointment.clinicId} appointmentId=${appointment.id} timestamp=${new Date().toISOString()}`);
  }

  return { status: patientEmailSentStatus };
}

export async function createAppointmentAndNotify(draft: CreateAppointmentPayload): Promise<{
  success: boolean;
  appointmentId?: string;
  code?: string;
  status?: string;
  clinicNotificationStatus?: string;
  patientNotificationStatus?: string;
  step_failed?: string;
  reason?: string;
  stack?: string;
}> {
  try {
    const validatedPayload = validateAppointmentPayload(draft);
    const { record, step_failed, reason, stack } = await createAppointmentRecord(validatedPayload);
    
    if (!record || !record.id) { 
        return { success: false, step_failed: step_failed || "STEP 5", reason: reason || "APPOINTMENT_INSERT_FAILED", stack }; 
    }
    let clinicNotificationStatus = "NOT_CONFIGURED";
    let patientNotificationStatus = "NOT_ATTEMPTED";

    try {
        const clinicNotification = await sendClinicNewAppointmentNotification(record);
        clinicNotificationStatus = clinicNotification.status.toLowerCase();
    } catch (e: any) {
        console.error(`[CLINIC_NOTIFICATION_ERROR] ${e.message}`);
    }

    try {
        const patientNotification = await sendPatientAppointmentAcknowledgement(record);
        patientNotificationStatus = patientNotification.status.toLowerCase();
    } catch (e: any) {
        console.error(`[PATIENT_NOTIFICATION_ERROR] ${e.message}`);
    }
    
    const adminDb = getAdminDb();
    if (adminDb) {
        try {
            await adminDb.collection("clinics").doc(record.clinicId!).collection("appointments").doc(record.id).update({
                notificationStatus: {
                  emailToClinic: clinicNotificationStatus,
                  smsToPatient: (record.notificationChannel === "sms" || record.notificationChannel === "email_and_sms") ? "sent" : "skipped"
                },
                patientNotificationStatus: patientNotificationStatus
            });
        } catch (e: any) {
             console.error(`[NOTIFICATION_STATUS_UPDATE_ERROR] ${e.message}`);
        }
    }

    return { 
        success: true, 
        appointmentId: record.id, 
        status: record.status as string, 
        clinicNotificationStatus: clinicNotificationStatus, 
        patientNotificationStatus: patientNotificationStatus 
    };
  } catch (err: any) {
      console.log(`[APPOINTMENT_SUBMISSION_EXCEPTION] convId=${draft.conversationId} clinicId=${draft.clinicId} error=${err.message} timestamp=${new Date().toISOString()}`);
      return { success: false, step_failed: "UNKNOWN", reason: err.message, stack: err.stack };
  }
}

