/**
 * Unified Pending Action Manager for ClinicBridge AI Engine
 * 
 * Guarantees explicit "Pending Action Ownership":
 * 1. Confirmations ("evet", "yes", "olur", "lütfen") bind only to the latest, active, actionable question/offer.
 * 2. Appointment submission is strictly terminal and once consumed, subsequent confirmations NEVER re-trigger appointment creation.
 * 3. Follow-up offers (e.g. "Hekimlerimiz hakkında daha fazla bilgi almak ister misiniz?") establish their own pending action.
 */

import {
  ConversationState,
  PendingAction,
  PendingActionType,
  PendingActionStatus
} from "./types";

export interface PendingActionResolution {
  shouldExecute: boolean;
  actionType?: PendingActionType;
  isRejection?: boolean;
  action?: PendingAction | null;
  reason: string;
}

export class PendingActionManager {
  /**
   * Create a new pending action
   */
  public static createPendingAction(
    type: PendingActionType,
    payload?: any,
    sourceAssistantMessageId?: string,
    description?: string
  ): PendingAction {
    const id = `act_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    return {
      id,
      type,
      createdAt: new Date().toISOString(),
      sourceAssistantMessageId,
      payload,
      status: "pending",
      description
    };
  }

  /**
   * Mark a pending action as consumed
   */
  public static consumePendingAction(action?: PendingAction | null): PendingAction | null {
    if (!action) return null;
    return {
      ...action,
      status: "consumed"
    };
  }

  /**
   * Mark a pending action as cancelled
   */
  public static cancelPendingAction(action?: PendingAction | null): PendingAction | null {
    if (!action) return null;
    return {
      ...action,
      status: "cancelled"
    };
  }

  /**
   * Check if a message is a positive confirmation
   */
  public static isConfirmation(text: string): boolean {
    if (!text) return false;
    const clean = text.trim().toLowerCase().replace(/[.,!?;:()]/g, " ").replace(/\s+/g, " ");
    
    // Turkish confirmations
    const trPatterns = [
      /^(evet|evet lütfen|lütfen|olur|tamam|onaylıyorum|onay|tabii|tabi|kesinlikle|uygundur|kabul ediyorum|isterim|bilgi alayım|evet istiyorum|aynen|yes|yep|yup|sure|ok|okay|confirm|proceed|ja|ja bitte|gerne|d'accord|oui)\b/i,
      /\b(evet lütfen|onaylıyorum|kabul ediyorum|randevuyu onayla|bilgi almak isterim|evet bilgi verin|hekimleri öğrenmek istiyorum|doktorları öğrenmek istiyorum)\b/i
    ];

    if (trPatterns.some(p => p.test(clean))) {
      // Guard against false positives like "evet ama başka bir gün olsun" or "evet değil hayır"
      if (/\b(değil|istemiyorum|vazgeçtim|yanlış|hayır|iptal)\b/i.test(clean)) {
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Check if a message is a negative rejection / cancellation
   */
  public static isRejection(text: string): boolean {
    if (!text) return false;
    const clean = text.trim().toLowerCase().replace(/[.,!?;:()]/g, " ").replace(/\s+/g, " ");
    
    const rejectPatterns = [
      /^(hayır|istemiyorum|gerek yok|vazgeçtim|iptal|kalsın|yok|hayır teşekkürler|no|no thanks|cancel|nein|nein danke|non)\b/i,
      /\b(istemiyorum|gerek yok|vazgeçtim|iptal et|başka zaman)\b/i
    ];

    return rejectPatterns.some(p => p.test(clean));
  }

  /**
   * Detect if the assistant message made a specific question or offer that requires confirmation
   */
  public static detectOfferedAction(assistantMessage: string): PendingActionType | null {
    if (!assistantMessage) return null;
    const text = assistantMessage.toLowerCase();

    // Doctor information offer
    if (
      /(hekimlerimiz hakkında|doktorlarımız hakkında|doktorlarımızla ilgili|hekimlerimizle ilgili|uzmanlarımız hakkında|hekim bilgisi|doktor bilgisi|daha fazla bilgi almak ister misiniz|bilgi almak ister misiniz|doktorlarımızı incelemek|hekimlerimizi incelemek|about our doctors|more about our doctors|know more about our doctors|doctor information|details about our doctors|physician details|über unsere ärzte|ueber unsere aerzte|mehr über unsere ärzte|arztinformationen)/i.test(text)
    ) {
      return "show_doctor_information";
    }

    // Service & treatment information offer
    if (
      /(tedavisi süreçleri|fiyatlarımız hakkında|hizmetlerimiz hakkında|tedavi hakkında|hizmet hakkında|detaylı bilgi ister misiniz|about our services|about our dental services|dental services|treatment details|service details|details about our services|über unsere behandlungen|behandlungsinformationen|unsere leistungen)/i.test(text)
    ) {
      return "show_service_information";
    }

    // Contact / phone call / live support offer
    if (
      /(sizi telefonla aramamızı|sizi aramamızı|telefonla aramamızı|yetkili bir temsilcimizin|canlı destek|temsilcimizle görüşmek|müşteri temsilcisi|call you directly|call you|phone contact|live support|reach out to you by phone|telefonisch kontaktieren|sie anrufen)/i.test(text)
    ) {
      return "request_phone_contact";
    }

    // Appointment summary confirmation offer
    if (
      /(onaylıyor musunuz|randevunuzu onaylıyor musunuz|bilgilerinizi onaylıyor musunuz|onaylıyorsanız|randevu talebinizi iletebilmem için onay|doğru mu|do you confirm|would you like to confirm|möchten sie bestätigen)/i.test(text)
    ) {
      return "submit_appointment";
    }

    // Quote offer
    if (
      /(fiyat teklifi hazırlamamızı|özel teklif oluşturmamızı|teklif almak ister misiniz|request a quote|get a quote|angebot anfordern)/i.test(text)
    ) {
      return "request_quote";
    }

    return null;
  }

  /**
   * Resolve an incoming user confirmation or rejection against conversation state & pending actions
   */
  public static resolvePendingConfirmation(params: {
    message: string;
    pendingAction?: PendingAction | null;
    latestAssistantMessage?: string;
    conversationState?: ConversationState;
    appointmentSubmitted?: boolean;
  }): PendingActionResolution {
    const { message, pendingAction, latestAssistantMessage, conversationState, appointmentSubmitted } = params;
    const isConf = this.isConfirmation(message);
    const isRej = this.isRejection(message);

    if (!isConf && !isRej) {
      return {
        shouldExecute: false,
        reason: "not_a_confirmation_or_rejection"
      };
    }

    if (isRej) {
      return {
        shouldExecute: false,
        isRejection: true,
        action: pendingAction,
        actionType: pendingAction?.type,
        reason: "user_rejected"
      };
    }

    // ── Confirmation Detected: Determine which action owns this confirmation ──

    // 1. Explicit Active Pending Action
    if (pendingAction && pendingAction.status === "pending") {
      if (pendingAction.type === "submit_appointment") {
        if (appointmentSubmitted === true || conversationState === "APPOINTMENT_SUBMITTED" || conversationState === "COMPLETED") {
          return {
            shouldExecute: false,
            action: pendingAction,
            actionType: "submit_appointment",
            reason: "appointment_already_submitted_action_blocked"
          };
        }
        return {
          shouldExecute: true,
          action: pendingAction,
          actionType: "submit_appointment",
          reason: "valid_pending_appointment_confirmation"
        };
      }

      return {
        shouldExecute: true,
        action: pendingAction,
        actionType: pendingAction.type,
        reason: "valid_pending_action_confirmation"
      };
    }

    // 2. Infer offer from latest assistant message if pendingAction was not saved explicitly
    if (latestAssistantMessage) {
      const offeredType = this.detectOfferedAction(latestAssistantMessage);
      if (offeredType) {
        if (offeredType === "submit_appointment") {
          if (appointmentSubmitted === true || conversationState === "APPOINTMENT_SUBMITTED" || conversationState === "COMPLETED") {
            return {
              shouldExecute: false,
              reason: "appointment_already_submitted_inferred_blocked"
            };
          }
          return {
            shouldExecute: true,
            actionType: "submit_appointment",
            reason: "inferred_appointment_summary_confirmation"
          };
        }

        return {
          shouldExecute: true,
          actionType: offeredType,
          reason: "inferred_offered_action_confirmation"
        };
      }
    }

    // 3. Fallback check for active APPOINTMENT_REVIEW state
    if (conversationState === "APPOINTMENT_REVIEW" && !appointmentSubmitted) {
      return {
        shouldExecute: true,
        actionType: "submit_appointment",
        reason: "inferred_review_state_confirmation"
      };
    }

    // 4. If appointment is already submitted and no active pending action exists, strictly block appointment execution
    if (appointmentSubmitted === true || conversationState === "APPOINTMENT_SUBMITTED" || conversationState === "COMPLETED") {
      return {
        shouldExecute: false,
        reason: "no_active_pending_action_appointment_already_completed"
      };
    }

    return {
      shouldExecute: false,
      reason: "no_active_pending_action"
    };
  }

  /**
   * 5-point Action Guard to verify whether appointment creation is permitted
   */
  public static isAppointmentSubmissionPermitted(params: {
    appointmentState?: string;
    appointmentSubmitted?: boolean;
    appointmentId?: string;
    pendingAction?: PendingAction | null;
    isExplicitNewAppointmentIntent?: boolean;
  }): { allowed: boolean; reason: string } {
    const { appointmentState, appointmentSubmitted, appointmentId, pendingAction, isExplicitNewAppointmentIntent } = params;

    // Explicit new appointment request bypasses previous completed appointment guard
    if (isExplicitNewAppointmentIntent) {
      return { allowed: true, reason: "explicit_new_appointment_intent" };
    }

    if (appointmentSubmitted === true) {
      return { allowed: false, reason: "appointment_already_submitted_flag" };
    }

    if (appointmentId && appointmentId.trim().length > 0) {
      return { allowed: false, reason: "appointment_id_already_exists" };
    }

    if (appointmentState === "APPOINTMENT_SUBMITTED" || appointmentState === "COMPLETED" || appointmentState === "CREATED") {
      return { allowed: false, reason: "appointment_terminal_state" };
    }

    if (pendingAction && pendingAction.type !== "submit_appointment") {
      return { allowed: false, reason: `pending_action_mismatch_${pendingAction.type}` };
    }

    if (pendingAction && pendingAction.status !== "pending") {
      return { allowed: false, reason: `pending_action_status_${pendingAction.status}` };
    }

    return { allowed: true, reason: "appointment_submission_permitted" };
  }
}
