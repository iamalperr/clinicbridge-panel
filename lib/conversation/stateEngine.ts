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
import { buildAppointmentReviewMessage } from "./formatters";

export class ConversationStateEngine {
  /**
   * Determine required appointment slots based on flow
   * Strict 6-field requirement: Treatment, Preferred Date, Preferred Time, Full Name, Phone, Email.
   */
  public static getRequiredAppointmentSlots(slots?: Partial<ConversationSlots>): Array<keyof ConversationSlots> {
    return ["treatment", "preferredDate", "preferredTime", "fullName", "phone", "email"];
  }

  /**
   * Compute missing required slots
   */
  public static getMissingSlots(
    slots: Partial<ConversationSlots>,
    requiredSlots?: Array<keyof ConversationSlots>
  ): Array<keyof ConversationSlots> {
    const required = requiredSlots || this.getRequiredAppointmentSlots(slots);
    return required.filter(key => {
      const val = slots[key];
      if (key === "fullName") {
        return !slots.fullName && !slots.firstName;
      }
      return !val || (typeof val === "string" && val.trim() === "");
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
    let expectedSlot = context.expectedSlot;
    const required = this.getRequiredAppointmentSlots(currentSlots);

    // 2. Handle cancel / reset
    if (intentResult.intent === "cancel") {
      return {
        previousState: prevState,
        nextState: "GENERAL_CONVERSATION",
        updatedSlots: {},
        missingRequiredSlots: [],
        expectedSlot: undefined,
        pendingAction: null,
        isComplete: false
      };
    }

    // 3. Handle validation error (e.g. invalid_email)
    if (intentResult.validationError === "invalid_email") {
      return {
        previousState: prevState,
        nextState: "APPOINTMENT_COLLECTION",
        updatedSlots: currentSlots,
        missingRequiredSlots: this.getMissingSlots(currentSlots, required) as string[],
        expectedSlot: "email",
        validationError: "invalid_email",
        isComplete: false
      };
    }

    // 4. State transition rules
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
        if (intentResult.intent === "appointment_start") {
          nextState = "APPOINTMENT_COLLECTION";
        } else {
          nextState = "GENERAL_CONVERSATION";
        }
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

    let pendingAction: any = context.pendingAction || null;

    if (nextState === "APPOINTMENT_COLLECTION") {
      expectedSlot = missingAfter.length > 0 ? (missingAfter[0] as string) : undefined;
      pendingAction = null;
    } else if (nextState === "APPOINTMENT_REVIEW") {
      expectedSlot = "confirmation";
      if (!pendingAction || pendingAction.type !== "submit_appointment" || pendingAction.status !== "pending") {
        pendingAction = {
          id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: "submit_appointment",
          createdAt: new Date().toISOString(),
          status: "pending",
          description: "Appointment confirmation pending"
        };
      }
    } else if (nextState === "APPOINTMENT_SUBMITTED" || nextState === "COMPLETED") {
      expectedSlot = undefined;
      pendingAction = null;
    } else {
      expectedSlot = undefined;
    }

    return {
      previousState: prevState,
      nextState,
      updatedSlots: currentSlots,
      missingRequiredSlots: missingAfter as string[],
      expectedSlot,
      pendingAction,
      isComplete
    };
  }

  /**
   * Generate interactive, human-like prompt for the next missing slot or confirmation
   */
  public static generateNextSlotPrompt(
    slots: Partial<ConversationSlots>,
    missingSlots: (keyof ConversationSlots)[] | string[],
    locale: string = "tr",
    acknowledgedSlotText?: string,
    validationError?: string,
    allInfoProvidedIntent?: boolean
  ): string {
    const isEn = locale.toLowerCase().startsWith("en");
    const isDe = locale.toLowerCase().startsWith("de");
    const isFr = locale.toLowerCase().startsWith("fr");
    const isAr = locale.toLowerCase().startsWith("ar");

    // 1. Handle validation error
    if (validationError === "invalid_email") {
      if (isEn) return "That email address appears to be incomplete. Could you please check it and send it again?";
      if (isDe) return "Diese E-Mail-Adresse scheint unvollständig zu sein. Bitte überprüfen Sie sie und senden Sie sie erneut.";
      if (isFr) return "Cette adresse e-mail semble incomplète. Pourriez-vous la vérifier et la renvoyer ?";
      if (isAr) return "يبدو أن عنوان البريد الإلكتروني غير مكتمل. يرجى التحقق منه وإرساله مرة أخرى.";
      return "E-posta adresiniz eksik veya geçersiz görünüyor. Lütfen kontrol edip tekrar paylaşabilir misiniz?";
    }

    // 2. Handle "Provided all information now" with missing slots
    if (allInfoProvidedIntent && missingSlots.length > 0) {
      const nextMissing = missingSlots[0];
      if (isEn) {
        return `Almost done! I have your details, but I still need your ${this.getSlotDisplayName(nextMissing, "en")} to finalize your appointment request.`;
      }
      return `Neredeyse tamamladık! Bilgilerinizi aldım, randevu kaydınızı tamamlamak için yalnızca ${this.getSlotDisplayName(nextMissing, "tr")} bilginize ihtiyacım var.`;
    }

    // 3. If no missing slots, prompt for review confirmation using centralized formatters
    if (missingSlots.length === 0) {
      return buildAppointmentReviewMessage(
        {
          patientName: slots.fullName || slots.firstName || "",
          patientPhone: slots.phone || "",
          patientEmail: slots.email || "",
          requestedService: slots.treatment || "",
          requestedDate: slots.preferredDate || slots.rawDateText || "",
          requestedTime: slots.preferredTime || ""
        },
        locale
      );
    }

    const nextMissing = missingSlots[0];
    const ackPrefix = acknowledgedSlotText ? `${acknowledgedSlotText} ` : "";

    switch (nextMissing) {
      case "treatment":
        if (isEn) return `${ackPrefix}Which treatment or dental procedure would you like to make an appointment for? (e.g. Implant, Teeth Whitening, Examination)`;
        if (isDe) return `${ackPrefix}Für welche Behandlung möchten Sie einen Termin vereinbaren? (z.B. Implantat, Zahnreinigung, Untersuchung)`;
        if (isFr) return `${ackPrefix}Pour quel traitement souhaitez-vous prendre rendez-vous ? (ex. Implant, Blanchiment, Consultation)`;
        if (isAr) return `${ackPrefix}ما هو العلاج أو الإجراء الذي ترغب في حجز موعد له؟ (مثل: زراعة الأسنان، تبييض الأسنان، الفحص)`;
        return `${ackPrefix}Hangi tedavi veya işlem için randevu almak istersiniz? (Örn: İmplant, Diş Beyazlatma, Genel Muayene)`;

      case "preferredDate":
        if (isEn) return `${ackPrefix}Which date would you prefer for your appointment? (e.g. August 5th or Tomorrow)`;
        if (isDe) return `${ackPrefix}Welches Datum bevorzugen Sie für Ihren Termin? (z.B. 5. August oder Morgen)`;
        if (isFr) return `${ackPrefix}Quelle date préférez-vous pour votre rendez-vous ? (ex. 5 août ou Demain)`;
        if (isAr) return `${ackPrefix}ما هو التاريخ الذي تفضله لموعدك؟ (مثل: 5 أغسطس أو غداً)`;
        return `${ackPrefix}Randevunuz için hangi tarih sizin için uygundur? (Örn: 5 Ağustos 2026 veya Yarın)`;

      case "preferredTime":
        if (isEn) return `${ackPrefix}What time or time period works best for you? (e.g. 2:00 PM, Morning, or Afternoon)`;
        if (isDe) return `${ackPrefix}Welche Uhrzeit oder Tageszeit passt Ihnen am besten? (z.B. 14:00 Uhr, Vormittag oder Nachmittag)`;
        if (isFr) return `${ackPrefix}Quelle heure ou période de la journée vous convient le mieux ? (ex. 14h00, Matin ou Après-midi)`;
        if (isAr) return `${ackPrefix}ما هو الوقت أو الفترة الزمنية الأنسب لك؟ (مثل: 2:00 ظهراً، الصباح، أو بعد الظهر)`;
        return `${ackPrefix}Randevu talebinizi kliniğe doğru şekilde iletebilmem için tercih ettiğiniz saat veya saat aralığını da paylaşabilir misiniz? (Örn: 14:00, Sabah veya Öğleden sonra)`;

      case "fullName":
        if (isEn) return `${ackPrefix}Could you please share your full name so we can record your appointment?`;
        if (isDe) return `${ackPrefix}Könnten Sie bitte Ihren vollständigen Namen angeben?`;
        if (isFr) return `${ackPrefix}Pourriez-vous indiquer votre nom complet pour la réservation ?`;
        if (isAr) return `${ackPrefix}هل يمكنك مشاركة اسمك الكامل حتى نتمكن من تسجيل موعدك؟`;
        return `${ackPrefix}Randevu kaydını oluşturabilmem için adınızı ve soyadınızı paylaşabilir misiniz?`;

      case "phone":
        if (isEn) return `${ackPrefix}Could you please provide your phone number so the clinic team can contact you?`;
        if (isDe) return `${ackPrefix}Könnten Sie bitte Ihre Telefonnummer angeben, damit die Klinik Sie kontaktieren kann?`;
        if (isFr) return `${ackPrefix}Pourriez-vous fournir votre numéro de téléphone pour que la clinique puisse vous contacter ?`;
        if (isAr) return `${ackPrefix}هل يمكنك تزويدنا برقم هاتفك حتى يتمكن فريق العيادة من التواصل معك؟`;
        return `${ackPrefix}Kliniğimizin randevu talebinizle ilgili sizinle iletişime geçebilmesi için telefon numaranızı paylaşabilir misiniz?`;

      case "email":
        if (isEn) return `${ackPrefix}Could you please provide your email address so we can send you the confirmation details?`;
        if (isDe) return `${ackPrefix}Könnten Sie bitte Ihre E-Mail-Adresse angeben?`;
        if (isFr) return `${ackPrefix}Pourriez-vous fournir votre adresse e-mail pour recevoir les détails ?`;
        if (isAr) return `${ackPrefix}هل يمكنك تزويدنا بعنوان بريدك الإلكتروني لإرسال تفاصيل الموعد؟`;
        return `${ackPrefix}Randevu sonucunu ve detaylarını iletebilmemiz için e-posta adresinizi paylaşabilir misiniz?`;

      default:
        return isEn
          ? `${ackPrefix}How else can we assist you with your appointment?`
          : `${ackPrefix}Randevunuzla ilgili nasıl yardımcı olabiliriz?`;
    }
  }

  /**
   * Get user-friendly name for a slot key
   */
  public static getSlotDisplayName(key: string | keyof ConversationSlots, locale: string = "tr"): string {
    const keyStr = String(key);
    const isEn = locale.toLowerCase().startsWith("en");
    switch (keyStr) {
      case "preferredDate": return isEn ? "preferred date" : "tarih";
      case "preferredTime": return isEn ? "time preference" : "saat tercihi";
      case "fullName": return isEn ? "full name" : "ad soyad";
      case "phone": return isEn ? "phone number" : "telefon numarası";
      case "email": return isEn ? "email address" : "e-posta adresi";
      case "treatment": return isEn ? "treatment" : "tedavi";
      default: return keyStr;
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

    if (newlyExtracted.email) {
      return isEn
        ? `Thank you for sharing your email (${newlyExtracted.email}).`
        : `E-posta adresinizi (${newlyExtracted.email}) kaydettim.`;
    }
    if (newlyExtracted.phone) {
      return isEn
        ? `Thank you for sharing your phone number.`
        : `Telefon numaranızı not aldım.`;
    }
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
