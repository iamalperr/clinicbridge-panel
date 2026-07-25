import { getAdminDb } from '../../firebase-admin';
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
      result = await provider.send(sendPayload);
    } catch (err: any) {
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
