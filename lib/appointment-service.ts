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

export async function createAppointmentRecord(payload: CreateAppointmentPayload): Promise<Partial<Appointment> | null> {
  const adminDb = getAdminDb();
  if (!adminDb) {
    throw new Error("Admin DB is not initialized.");
  }
  
  console.log(`[APPOINTMENT_DATABASE_INSERT_STARTED] convId=${payload.conversationId} clinicId=${payload.clinicId} timestamp=${new Date().toISOString()}`);
  
  try {
    // 1. Idempotency Check
    if (payload.idempotencyKey) {
      const existingSnap = await adminDb.collection("clinics").doc(payload.clinicId).collection("appointments")
        .where("idempotencyKey", "==", payload.idempotencyKey).limit(1).get();
      if (!existingSnap.empty) {
        const existingDoc = existingSnap.docs[0];
        console.log(`[APPOINTMENT_DUPLICATE_DETECTED] existingId=${existingDoc.id} idempotencyKey=${payload.idempotencyKey}`);
        return { id: existingDoc.id, ...existingDoc.data() } as Partial<Appointment>;
      }
    }

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
        throw new Error("Record was not found after insertion");
    }
    console.log(`[APPOINTMENT_RECORD_VERIFIED] convId=${payload.conversationId} clinicId=${payload.clinicId} appointmentId=${appointmentId} timestamp=${new Date().toISOString()}`);

    console.log(`[APPOINTMENT_DATABASE_INSERT_SUCCEEDED] convId=${payload.conversationId} clinicId=${payload.clinicId} appointmentId=${appointmentId} timestamp=${new Date().toISOString()}`);
    
    // Create in-app notification
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
    } catch (e: any) {
      console.error("[appointment-notification] Error:", e.message);
    }
    
    return newAppointment;
  } catch (err: any) {
    console.log(`[APPOINTMENT_DATABASE_INSERT_FAILED] convId=${payload.conversationId} clinicId=${payload.clinicId} error=${err.message} timestamp=${new Date().toISOString()}`);
    return null;
  }
}

export async function sendClinicNewAppointmentNotification(appointment: Partial<Appointment>): Promise<{ status: string }> {
  const adminDb = getAdminDb();
  if (!adminDb || !appointment.clinicId) return { status: "FAILED" };

  console.log(`[CLINIC_NOTIFICATION_SETTINGS_LOADED] convId=${appointment.conversationId} clinicId=${appointment.clinicId} appointmentId=${appointment.id} timestamp=${new Date().toISOString()}`);
  
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

  console.log(`[CLINIC_NOTIFICATION_SEND_STARTED] convId=${appointment.conversationId} clinicId=${appointment.clinicId} appointmentId=${appointment.id} timestamp=${new Date().toISOString()}`);

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

    if (result.success) {
      console.log(`[CLINIC_NOTIFICATION_SENT] convId=${appointment.conversationId} clinicId=${appointment.clinicId} appointmentId=${appointment.id} timestamp=${new Date().toISOString()}`);
      return { status: "SENT" };
    } else {
      console.log(`[CLINIC_NOTIFICATION_FAILED] convId=${appointment.conversationId} clinicId=${appointment.clinicId} appointmentId=${appointment.id} error=${result.error} timestamp=${new Date().toISOString()}`);
      return { status: "FAILED" };
    }
  } catch (e: any) {
    console.log(`[CLINIC_NOTIFICATION_FAILED] convId=${appointment.conversationId} clinicId=${appointment.clinicId} appointmentId=${appointment.id} exception=${e.message} timestamp=${new Date().toISOString()}`);
    return { status: "FAILED" };
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
}> {
  try {
    const validatedPayload = validateAppointmentPayload(draft);
    const appointment = await createAppointmentRecord(validatedPayload);
    
    if (!appointment?.id) { 
        return { success: false, code: "APPOINTMENT_INSERT_FAILED" }; 
    }
    
    const clinicNotification = await sendClinicNewAppointmentNotification(appointment);
    const patientNotification = await sendPatientAppointmentAcknowledgement(appointment);
    
    const adminDb = getAdminDb();
    if (adminDb) {
        await adminDb.collection("clinics").doc(appointment.clinicId!).collection("appointments").doc(appointment.id).update({
            notificationStatus: {
              emailToClinic: clinicNotification.status.toLowerCase(),
              smsToPatient: (appointment.notificationChannel === "sms" || appointment.notificationChannel === "email_and_sms") ? "sent" : "skipped"
            },
            patientNotificationStatus: patientNotification.status.toLowerCase()
        });
    }

    return { 
        success: true, 
        appointmentId: appointment.id, 
        status: appointment.status as string, 
        clinicNotificationStatus: clinicNotification.status, 
        patientNotificationStatus: patientNotification.status 
    };
  } catch (err: any) {
      console.log(`[APPOINTMENT_SUBMISSION_EXCEPTION] convId=${draft.conversationId} clinicId=${draft.clinicId} error=${err.message} timestamp=${new Date().toISOString()}`);
      return { success: false, code: "UNEXPECTED_ERROR" };
  }
}

