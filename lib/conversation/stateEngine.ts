/**
 * Unified Conversation State Engine
 * Manages state transitions, slot merging, sequential prompting, interruption recovery, and tenant isolation.
 */

import {
  ConversationContext,
  ConversationSlots,
  ConversationState,
  IntentClassificationResult,
  StateTransitionResult
} from "./types";

export class ConversationStateEngine {
  /**
   * Determine required appointment slots based on flow
   */
  public static getRequiredAppointmentSlots(): Array<keyof ConversationSlots> {
    return ["preferredDate", "preferredTime", "fullName", "phone"];
  }

  /**
   * Compute missing required slots
   */
  public static getMissingSlots(
    slots: Partial<ConversationSlots>,
    requiredSlots: Array<keyof ConversationSlots> = this.getRequiredAppointmentSlots()
  ): Array<keyof ConversationSlots> {
    return requiredSlots.filter(key => {
      const val = slots[key];
      if (key === "fullName") {
        return !slots.fullName && !slots.firstName;
      }
      return !val;
    });
  }

  /**
   * Process a state transition given the current context, intent result, and new slots
   */
  public static processTransition(
    context: ConversationContext,
    intentResult: IntentClassificationResult
  ): StateTransitionResult {
    const prevState = context.currentState || "INITIAL";
    const currentSlots: Partial<ConversationSlots> = { ...context.slots };

    // 1. Non-destructively merge newly extracted slots
    if (intentResult.entities && Object.keys(intentResult.entities).length > 0) {
      for (const [key, val] of Object.entries(intentResult.entities)) {
        if (val !== undefined && val !== null && val !== "") {
          currentSlots[key] = val;
        }
      }
    }

    let nextState: ConversationState = prevState;
    const required = this.getRequiredAppointmentSlots();

    // 2. State transition rules
    switch (prevState) {
      case "INITIAL":
      case "GENERAL_CONVERSATION":
        if (intentResult.intent === "appointment_start" || intentResult.intent === "appointment_continuation") {
          nextState = "APPOINTMENT_COLLECTION";
        } else if (intentResult.intent === "clinic_recommendation") {
          nextState = "CLINIC_MATCHING";
        } else if (intentResult.intent === "live_support_request" || intentResult.intent === "emergency") {
          nextState = "LIVE_SUPPORT_REQUIRED";
        } else {
          nextState = "GENERAL_CONVERSATION";
        }
        break;

      case "TREATMENT_DISCOVERY":
        if (intentResult.intent === "appointment_start" || intentResult.intent === "appointment_continuation") {
          nextState = "APPOINTMENT_COLLECTION";
        } else if (intentResult.intent === "clinic_recommendation") {
          nextState = "CLINIC_MATCHING";
        }
        break;

      case "CLINIC_MATCHING":
        if (currentSlots.selectedClinicId) {
          nextState = "CLINIC_SELECTED";
        } else if (intentResult.intent === "appointment_start") {
          nextState = "APPOINTMENT_COLLECTION";
        }
        break;

      case "CLINIC_SELECTED":
        if (intentResult.intent === "appointment_start" || intentResult.intent === "appointment_continuation") {
          nextState = "APPOINTMENT_COLLECTION";
        }
        break;

      case "APPOINTMENT_COLLECTION": {
        if (intentResult.intent === "rejection") {
          nextState = "GENERAL_CONVERSATION";
          break;
        }
        if (intentResult.intent === "live_support_request" || intentResult.intent === "emergency") {
          nextState = "LIVE_SUPPORT_REQUIRED";
          break;
        }

        const missing = this.getMissingSlots(currentSlots, required);
        if (missing.length === 0) {
          nextState = "APPOINTMENT_REVIEW";
        } else {
          nextState = "APPOINTMENT_COLLECTION";
        }
        break;
      }

      case "APPOINTMENT_REVIEW":
        if (intentResult.intent === "appointment_confirmation" || intentResult.intent === "confirmation") {
          nextState = "APPOINTMENT_SUBMITTED";
        } else if (intentResult.intent === "appointment_correction") {
          nextState = "APPOINTMENT_COLLECTION";
        } else if (intentResult.intent === "rejection") {
          nextState = "GENERAL_CONVERSATION";
        }
        break;

      case "APPOINTMENT_SUBMITTED":
        nextState = "COMPLETED";
        break;

      case "LIVE_SUPPORT_REQUIRED":
        if (intentResult.intent === "appointment_start" || intentResult.intent === "appointment_continuation") {
          nextState = "APPOINTMENT_COLLECTION";
        }
        break;

      case "COMPLETED":
        if (intentResult.intent === "appointment_start") {
          nextState = "APPOINTMENT_COLLECTION";
        } else {
          nextState = "GENERAL_CONVERSATION";
        }
        break;

      default:
        nextState = prevState;
        break;
    }

    const missingAfter = this.getMissingSlots(currentSlots, required);
    const isComplete = nextState === "APPOINTMENT_REVIEW" || nextState === "APPOINTMENT_SUBMITTED" || nextState === "COMPLETED";

    return {
      previousState: prevState,
      nextState,
      updatedSlots: currentSlots,
      missingRequiredSlots: missingAfter as string[],
      isComplete
    };
  }

  /**
   * Generate interactive, human-like prompt for the next missing slot or confirmation
   */
  public static generateNextSlotPrompt(
    slots: Partial<ConversationSlots>,
    missingSlots: string[],
    locale: string = "tr",
    acknowledgedSlotText?: string
  ): string {
    const isEn = locale.toLowerCase().startsWith("en");

    // If no missing slots, prompt for review confirmation
    if (missingSlots.length === 0) {
      const dateStr = slots.preferredDate || slots.rawDateText || "";
      const timeStr = slots.preferredTime || "";
      const nameStr = slots.fullName || slots.firstName || "";
      const phoneStr = slots.phone || "";
      const treatmentStr = slots.treatment ? ` (${slots.treatment})` : "";

      if (isEn) {
        return `Thank you! I have gathered your appointment request details${treatmentStr}:\n\n` +
          `📅 Date: ${dateStr}\n` +
          `⏰ Time Preference: ${timeStr}\n` +
          `👤 Name: ${nameStr}\n` +
          `📞 Phone: ${phoneStr}\n\n` +
          `Please confirm if you would like me to create this appointment request. By confirming, you agree to our KVKK Information Text (https://feelinhealthy.com/kvkk).`;
      }

      return `Harika, randevu talebi bilgilerinizi aldım${treatmentStr}:\n\n` +
        `📅 Tarih: ${dateStr}\n` +
        `⏰ Saat Tercihi: ${timeStr}\n` +
        `👤 Ad Soyad: ${nameStr}\n` +
        `📞 Telefon: ${phoneStr}\n\n` +
        `Randevu kaydınızı oluşturmamı onaylıyor musunuz? (Onayınızla birlikte https://feelinhealthy.com/kvkk Aydınlatma Metnini kabul etmiş olursunuz.)`;
    }

    const nextMissing = missingSlots[0];
    const ackPrefix = acknowledgedSlotText ? `${acknowledgedSlotText} ` : "";

    switch (nextMissing) {
      case "preferredDate":
        return isEn
          ? `${ackPrefix}Which date would you prefer for your appointment? (e.g. August 3rd)`
          : `${ackPrefix}Randevunuz için hangi tarih sizin için uygundur? (Örn: 1 Ağustos 2026)`;

      case "preferredTime":
        return isEn
          ? `${ackPrefix}What time of day or specific hour works best for you? (e.g. Morning, Afternoon, or 14:00)`
          : `${ackPrefix}Günün hangi saati veya zaman aralığı sizin için uygundur? (Örn: Sabah, Öğleden sonra veya 14:00)`;

      case "fullName":
        return isEn
          ? `${ackPrefix}Could you please share your full name so we can record your appointment?`
          : `${ackPrefix}Randevu kaydını tamamlamak için adınızı ve soyadınızı paylaşabilir misiniz?`;

      case "phone":
        return isEn
          ? `${ackPrefix}Could you please provide your phone number so the clinic team can confirm your appointment?`
          : `${ackPrefix}Klinik ekibimizin teyit için size ulaşabilmesi adına telefon numaranızı paylaşabilir misiniz?`;

      default:
        return isEn
          ? `${ackPrefix}How else can we assist you with your appointment?`
          : `${ackPrefix}Randevunuzla ilgili nasıl yardımcı olabiliriz?`;
    }
  }

  /**
   * Format an acknowledgment phrase for extracted slots (e.g. "1 Ağustos tarihini not aldım.")
   */
  public static getSlotAcknowledgment(
    newlyExtracted: Partial<ConversationSlots>,
    locale: string = "tr"
  ): string {
    const isEn = locale.toLowerCase().startsWith("en");

    if (newlyExtracted.preferredDate) {
      return isEn
        ? `I have noted the date ${newlyExtracted.preferredDate}.`
        : `Tarihi ${newlyExtracted.preferredDate} olarak not aldım.`;
    }
    if (newlyExtracted.preferredTime) {
      return isEn
        ? `Noted your time preference for ${newlyExtracted.preferredTime}.`
        : `Saat tercihinizi ${newlyExtracted.preferredTime} olarak kaydettim.`;
    }
    if (newlyExtracted.visitType === "first_visit") {
      return isEn
        ? `Understood, this will be your first visit to the clinic.`
        : `Anladım, kliniğe ilk ziyaretiniz olacak.`;
    }
    if (newlyExtracted.visitType === "control") {
      return isEn
        ? `Understood, this is a follow-up checkup visit.`
        : `Anladım, kontrol randevusu olacak.`;
    }
    if (newlyExtracted.fullName || newlyExtracted.firstName) {
      const n = newlyExtracted.fullName || newlyExtracted.firstName;
      return isEn ? `Thank you, ${n}.` : `Teşekkürler Sayın ${n}.`;
    }

    return "";
  }
}
