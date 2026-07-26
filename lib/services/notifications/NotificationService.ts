import { getAdminDb } from '../../firebase-admin';
import { CanonicalAppointmentStatus, isValidTransition, APPOINTMENT_STATUS_TRANSITIONS } from '../../types/appointment';
import { getAppointmentStatusEmailTemplate } from './EmailTemplateResolver';
import { 
  AppointmentEventType, 
  NotificationChannel, 
  NotificationEvent,
  NotificationStatus
} from '../../types/notification';
import { NotificationProvider, NotificationPayload } from './providers/NotificationProvider';
import { ResendEmailProvider } from './providers/ResendEmailProvider';

export class NotificationService {
  private providers: Map<NotificationChannel, NotificationProvider>;

  constructor() {
    this.providers = new Map();
    // Register default providers
    this.registerProvider(new ResendEmailProvider());
    // Future: this.registerProvider(new TwilioSmsProvider());
    // Future: this.registerProvider(new WhatsAppProvider());
  }

  public registerProvider(provider: NotificationProvider) {
    this.providers.set(provider.channel, provider);
  }

  /**
   * Send a notification for a specific event
   */
  public async sendNotification(
    eventData: {
      tenant_id: string;
      agency_id?: string;
      clinic_id: string;
      appointment_id?: string;
      patient_id?: string;
      event_type: AppointmentEventType;
      channel: NotificationChannel;
      recipient: string;
      template_id?: string;
      idempotency_key?: string;
    },
    payload: Omit<NotificationPayload, 'to' | 'idempotencyKey'>
  ): Promise<{ 
    success: boolean; 
    attempted: boolean;
    accepted: boolean;
    status: "ACCEPTED" | "FAILED" | "MISSING_RECIPIENT" | "NOT_CONFIGURED" | "UNKNOWN";
    messageId?: string;
    errorCode?: string | null;
    errorMessage?: string | null;
    eventId?: string; 
    error?: string; 
  }> {
    const adminDb = getAdminDb();
    
    // 1. Idempotency Check
    if (adminDb && eventData.idempotency_key) {
      const existingEvents = await adminDb
        .collection('notification_events')
        .where('idempotency_key', '==', eventData.idempotency_key)
        .limit(1)
        .get();

      if (!existingEvents.empty) {
        const doc = existingEvents.docs[0];
        console.log(`[NotificationService] Idempotency hit for key: ${eventData.idempotency_key}`);
        return { 
          success: true, 
          attempted: false, 
          accepted: true, 
          status: "ACCEPTED", 
          eventId: doc.id 
        };
      }
    }

    // 2. Initialize Event Log
    const eventLog: NotificationEvent = {
      ...eventData,
      status: 'queued',
      attempt_count: 0,
      created_at: new Date(),
      updated_at: new Date(),
    };

    let eventDocRef: any = null;
    if (adminDb) {
      eventDocRef = adminDb.collection('notification_events').doc();
      eventLog.id = eventDocRef.id;
      await eventDocRef.set(eventLog);
    }

    const provider = this.providers.get(eventData.channel);
    if (!provider) {
      const errorMsg = `No provider registered for channel: ${eventData.channel}`;
      await this.updateEventStatus(eventDocRef, 'permanently_failed', { failure_reason: errorMsg });
      return { 
        success: false, 
        attempted: false,
        accepted: false,
        status: "NOT_CONFIGURED",
        errorCode: "missing_provider",
        errorMessage: errorMsg,
        error: errorMsg, 
        eventId: eventLog.id 
      };
    }

    // 4. Send Notification
    await this.updateEventStatus(eventDocRef, 'processing', { attempt_count: 1 });
    
    const sendPayload: NotificationPayload = {
      ...payload,
      to: eventData.recipient,
      idempotencyKey: eventData.idempotency_key,
    };

    let result;
    try {
      console.log(JSON.stringify({
        checkpoint: "PATIENT_STATUS_EMAIL_REQUEST",
        traceId: "auto",
        appointmentId: eventData.appointment_id || "unknown",
        provider: provider.channel,
        hasApiKey: true,
        hasFromAddress: true,
        fromDomain: "system",
        hasRecipient: !!sendPayload.to,
        maskedRecipient: sendPayload.to ? sendPayload.to.replace(/(.{2})(.*)(@.*)/, "$1***$3") : "none",
        subjectPresent: !!sendPayload.subject,
        htmlPresent: !!sendPayload.variables?.htmlContent
      }));

      result = await provider.send(sendPayload);

      console.log(JSON.stringify({
        checkpoint: "PATIENT_STATUS_EMAIL_PROVIDER_RESPONSE",
        traceId: "auto",
        appointmentId: eventData.appointment_id || "unknown",
        provider: provider.channel,
        httpStatus: (result as any).rawResponse?.statusCode || 200,
        success: result.success,
        providerMessageId: result.messageId || null,
        accepted: result.accepted,
        rejected: !result.accepted,
        errorCode: result.errorCode || null,
        safeErrorMessage: result.errorMessage || null
      }));
    } catch (err: any) {
      console.error(JSON.stringify({
        checkpoint: "PATIENT_STATUS_EMAIL_EXCEPTION",
        traceId: "auto",
        appointmentId: eventData.appointment_id || "unknown",
        errorName: err.name || "Exception",
        errorCode: err.code || "UNKNOWN_ERR",
        safeErrorMessage: err.message,
        stackLocation: "NotificationService"
      }));
      result = {
        success: false,
        attempted: true,
        accepted: false,
        status: "FAILED" as const,
        errorCode: "provider_exception",
        errorMessage: err.message || "Unknown provider error",
        error: err.message
      };
    }

    // 5. Update Status
    if (result.success) {
      await this.updateEventStatus(eventDocRef, 'sent', {
        provider_message_id: result.messageId,
        sent_at: new Date(),
      });
      return { 
        success: true, 
        attempted: result.attempted,
        accepted: result.accepted,
        status: result.status,
        messageId: result.messageId,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        eventId: eventLog.id 
      };
    } else {
      // Logic for retry could be implemented here
      await this.updateEventStatus(eventDocRef, 'failed', {
        failure_reason: result.errorMessage || "Unknown error",
        failed_at: new Date(),
      });
      
      // Log delivery attempt
      if (adminDb && eventDocRef) {
        await adminDb.collection('notification_delivery_attempts').add({
          event_id: eventDocRef.id,
          attempt_number: 1,
          error: result.errorMessage || "Unknown error",
          raw_response: result.rawResponse || null,
          created_at: new Date()
        });
      }

      return { 
        success: false, 
        attempted: result.attempted,
        accepted: result.accepted,
        status: result.status,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        error: result.errorMessage || "Unknown error", 
        eventId: eventLog.id 
      };
    }
  }

  /**
   * Transactional outbox pattern for updating appointment status and sending notification
   */
  public async sendAppointmentStatusUpdate(params: {
    tenantId: string;
    clinicId: string;
    appointmentId: string;
    oldStatus: CanonicalAppointmentStatus;
    newStatus: CanonicalAppointmentStatus;
    actorUserId: string;
  }): Promise<{
    success: boolean;
    appointmentUpdated: boolean;
    emailSent: boolean;
    emailSkipped: boolean;
    appointmentId: string;
    oldStatus: string;
    newStatus: string;
    notificationId?: string;
    provider?: string;
    providerMessageId?: string;
    skipReason?: string;
    errorCode?: string;
    message?: string;
  }> {
    const adminDb = getAdminDb();
    if (!adminDb) {
      return {
        success: false, appointmentUpdated: false, emailSent: false, emailSkipped: false,
        appointmentId: params.appointmentId, oldStatus: params.oldStatus, newStatus: params.newStatus,
        errorCode: "DB_UNAVAILABLE", message: "Database is unavailable."
      };
    }

    if (!isValidTransition(params.oldStatus, params.newStatus)) {
      return {
        success: false, appointmentUpdated: false, emailSent: false, emailSkipped: false,
        appointmentId: params.appointmentId, oldStatus: params.oldStatus, newStatus: params.newStatus,
        errorCode: "INVALID_STATUS_TRANSITION", message: "This appointment status transition is not allowed."
      };
    }

    let notificationLogId = "";
    let emailSkipped = false;
    let skipReason = "";
    let patientEmailToUse = "";
    let locale: "tr" | "en" = "tr";
    let clinicName = "";
    let patientName = "";
    let treatment = "";
    let requestedDate = "";
    let requestedTime = "";

    try {
      await adminDb.runTransaction(async (t) => {
        const clinicRef = adminDb.collection("clinics").doc(params.clinicId);
        const apptRef = clinicRef.collection("appointments").doc(params.appointmentId);
        
        const [clinicSnap, apptSnap] = await Promise.all([t.get(clinicRef), t.get(apptRef)]);
        
        if (!clinicSnap.exists || !apptSnap.exists) {
          throw new Error("NOT_FOUND");
        }

        const clinicData = clinicSnap.data()!;
        const apptData = apptSnap.data()!;
        
        clinicName = clinicData.name || "Klinik";
        locale = apptData.language === "en" ? "en" : "tr";
        patientName = apptData.patientName || "";
        treatment = apptData.treatmentType || apptData.requestedService || apptData.service || apptData.reason || "";
        requestedDate = apptData.preferredDate || apptData.requestedDate || apptData.proposedDate || "";
        
        // Time resolution logic
        if (apptData.preferredTimeText && apptData.preferredTimeText.toLowerCase() !== "belirtilmedi" && apptData.preferredTimeText.toLowerCase() !== "belirtilmemiş") {
          requestedTime = apptData.preferredTimeText;
        } else if (apptData.preferredTimePeriod) {
          const periodMap: Record<string, string> = { morning: "Sabah", afternoon: "Öğleden sonra", evening: "Akşam", earliest_available: "En erken uygun saat" };
          requestedTime = periodMap[apptData.preferredTimePeriod] || apptData.preferredTimePeriod;
        } else if (apptData.preferredTimeStart && apptData.preferredTimeEnd) {
          requestedTime = `${apptData.preferredTimeStart} - ${apptData.preferredTimeEnd}`;
        } else {
          requestedTime = apptData.preferredTime || apptData.requestedTime || apptData.appointmentTime || apptData.startTime || "";
        }

        patientEmailToUse = (apptData.patientEmail || apptData.email || apptData.contactEmail || "")?.trim().toLowerCase();

        // 1. Resolve notification settings
        let primaryChannel = "email";
        let emailEnabled = true;

        if (clinicData.notificationSettings) {
          primaryChannel = clinicData.notificationSettings.patientAppointmentChannel || "email";
        } else if (clinicData.patientNotificationSettings) {
          primaryChannel = clinicData.patientNotificationSettings.primaryChannel || "email";
        }

        if (!primaryChannel.includes("email") && primaryChannel !== "all") {
          emailEnabled = false;
          emailSkipped = true;
          skipReason = "EMAIL_CHANNEL_DISABLED";
        } else if (!patientEmailToUse) {
          emailEnabled = false;
          emailSkipped = true;
          skipReason = "PATIENT_EMAIL_MISSING";
        }

        // 2. Perform the update
        const now = new Date().toISOString();
        t.update(apptRef, {
          status: params.newStatus,
          updatedAt: now,
          statusUpdatedAt: now,
          statusUpdatedBy: params.actorUserId
        });
        
        if (apptData.conversationId) {
          const logRef = clinicRef.collection("conversationLogs").doc(apptData.conversationId);
          t.update(logRef, { appointmentStatus: params.newStatus, updatedAt: now });
        }

        // 3. Create Outbox Notification Log
        if (emailEnabled) {
          const notifRef = adminDb.collection('notification_events').doc();
          notificationLogId = notifRef.id;
          
          const eventTypeMap: Record<string, any> = {
            "approved": "appointment.clinic.approved",
            "confirmed": "appointment.confirmed",
            "rejected": "appointment.rejected",
            "cancelled": "appointment.cancelled"
          };
          
          const eventType = eventTypeMap[params.newStatus] || "appointment.request.created";
          
          const notifEvent: NotificationEvent = {
            id: notificationLogId,
            tenant_id: params.tenantId,
            clinic_id: params.clinicId,
            appointment_id: params.appointmentId,
            event_type: eventType as AppointmentEventType,
            channel: 'email',
            recipient: patientEmailToUse,
            status: 'queued',
            attempt_count: 0,
            created_at: new Date(),
            updated_at: new Date()
          };
          t.set(notifRef, notifEvent);
        }
      });
    } catch (e: any) {
      if (e.message === "NOT_FOUND") {
        return {
          success: false, appointmentUpdated: false, emailSent: false, emailSkipped: false,
          appointmentId: params.appointmentId, oldStatus: params.oldStatus, newStatus: params.newStatus,
          errorCode: "NOT_FOUND", message: "Clinic or appointment not found."
        };
      }
      return {
        success: false, appointmentUpdated: false, emailSent: false, emailSkipped: false,
        appointmentId: params.appointmentId, oldStatus: params.oldStatus, newStatus: params.newStatus,
        errorCode: "APPOINTMENT_UPDATE_FAILED", message: "The appointment status could not be updated."
      };
    }

    if (emailSkipped) {
      return {
        success: true, appointmentUpdated: true, emailSent: false, emailSkipped: true,
        appointmentId: params.appointmentId, oldStatus: params.oldStatus, newStatus: params.newStatus,
        skipReason: skipReason
      };
    }
    
    if (!notificationLogId) {
      return {
        success: true, appointmentUpdated: true, emailSent: false, emailSkipped: true,
        appointmentId: params.appointmentId, oldStatus: params.oldStatus, newStatus: params.newStatus,
        skipReason: "NO_NOTIFICATION_LOG_CREATED"
      };
    }

    // 4. Resolve Template and Send Email
    const template = getAppointmentStatusEmailTemplate({
      tenantId: params.tenantId,
      clinicId: params.clinicId,
      status: params.newStatus,
      locale,
      patientName,
      clinicName,
      treatment,
      requestedDate,
      requestedTime
    });

    if (!template) {
      await adminDb.collection('notification_events').doc(notificationLogId).update({ status: "skipped", failure_reason: "TEMPLATE_NOT_FOUND" });
      return {
        success: true, appointmentUpdated: true, emailSent: false, emailSkipped: true,
        appointmentId: params.appointmentId, oldStatus: params.oldStatus, newStatus: params.newStatus,
        skipReason: "TEMPLATE_NOT_FOUND"
      };
    }

    const provider = this.providers.get("email");
    if (!provider) {
       await adminDb.collection('notification_events').doc(notificationLogId).update({ status: "permanently_failed", failure_reason: "NO_PROVIDER" });
       return {
        success: false, appointmentUpdated: true, emailSent: false, emailSkipped: false,
        appointmentId: params.appointmentId, oldStatus: params.oldStatus, newStatus: params.newStatus,
        notificationId: notificationLogId, errorCode: "EMAIL_SEND_FAILED", message: "No email provider configured."
       };
    }

    await adminDb.collection('notification_events').doc(notificationLogId).update({ status: "processing", attempt_count: 1, updated_at: new Date() });

    try {
      const result = await provider.send({
        language: locale,
        to: patientEmailToUse,
        subject: template.subject,
        variables: { htmlContent: template.htmlContent }
      });

      if (result.success) {
        await adminDb.collection('notification_events').doc(notificationLogId).update({
          status: "sent",
          provider_message_id: result.messageId,
          sent_at: new Date(),
          updated_at: new Date()
        });
        
        await adminDb.collection("clinics").doc(params.clinicId).collection("appointments").doc(params.appointmentId).update({
          patientNotificationSent: true,
          patientNotificationStatus: "ACCEPTED",
          patientNotificationProviderId: result.messageId || null,
          notificationSentAt: new Date().toISOString(),
          notificationChannel: "email"
        });

        return {
          success: true, appointmentUpdated: true, emailSent: true, emailSkipped: false,
          appointmentId: params.appointmentId, oldStatus: params.oldStatus, newStatus: params.newStatus,
          notificationId: notificationLogId, provider: "email", providerMessageId: result.messageId
        };
      } else {
        await adminDb.collection('notification_events').doc(notificationLogId).update({
          status: "failed",
          failure_reason: result.errorMessage || "Provider error",
          failed_at: new Date(),
          updated_at: new Date()
        });
        
        await adminDb.collection("clinics").doc(params.clinicId).collection("appointments").doc(params.appointmentId).update({
          patientNotificationSent: false,
          patientNotificationStatus: "FAILED",
          patientNotificationErrorCode: result.errorCode || null,
          patientNotificationErrorMessage: result.errorMessage || null,
        });

        return {
          success: false, appointmentUpdated: true, emailSent: false, emailSkipped: false,
          appointmentId: params.appointmentId, oldStatus: params.oldStatus, newStatus: params.newStatus,
          notificationId: notificationLogId, errorCode: result.errorCode || "EMAIL_SEND_FAILED",
          message: result.errorMessage || "Appointment status was updated, but the patient email could not be sent."
        };
      }
    } catch (err: any) {
      await adminDb.collection('notification_events').doc(notificationLogId).update({
        status: "failed",
        failure_reason: err.message,
        failed_at: new Date(),
        updated_at: new Date()
      });
      return {
        success: false, appointmentUpdated: true, emailSent: false, emailSkipped: false,
        appointmentId: params.appointmentId, oldStatus: params.oldStatus, newStatus: params.newStatus,
        notificationId: notificationLogId, errorCode: "EMAIL_SEND_EXCEPTION",
        message: err.message || "Exception during email send."
      };
    }
  }

  private async updateEventStatus(
    docRef: any, 
    status: NotificationStatus, 
    extraFields: Partial<NotificationEvent> = {}
  ) {
    if (!docRef) return;
    try {
      await docRef.update({
        status,
        updated_at: new Date(),
        ...extraFields
      });
    } catch (err) {
      console.error('[NotificationService] Failed to update event status', err);
    }
  }
}

// Export a singleton instance
export const notificationService = new NotificationService();
