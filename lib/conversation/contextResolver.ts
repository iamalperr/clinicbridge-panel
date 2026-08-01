/**
 * Contextual Ellipsis & Multi-Turn Reference Resolver
 *
 * Resolves short queries (e.g., "When?", "How much?", "Which one?", "Where?", "And the price?",
 * "What about recovery?", "Morning?", "Can I come tomorrow?") using conversation history,
 * active topic, active treatment, active flow, and offered actions.
 */

import {
  ConversationSlots,
  ConversationIntent,
  InformationType,
  ConversationContext,
  IntentClassificationResult
} from "./types";
import { SlotExtractor } from "./slotExtractor";

export interface ContextualResolution {
  isEllipsis: boolean;
  resolvedIntent?: ConversationIntent;
  resolvedEntities?: Partial<ConversationSlots>;
  clarificationNeeded?: boolean;
  clarificationPrompt?: string;
  suggestedOptions?: string[];
  explanation?: string;
}

export class ContextResolver {
  /**
   * Determine if a user message is a short elliptical query requiring context resolution
   */
  public static isEllipticalQuery(raw: string, lower: string): boolean {
    const trimmed = lower.replace(/[?!.,]/g, "").trim();
    if (trimmed.length === 0) return false;

    // Short phrase patterns (< 5 words or matching specific elliptical keywords)
    const words = trimmed.split(/\s+/);
    if (words.length > 7) return false;

    // Direct short queries
    const ellipsisPatterns = [
      /^(when|ne zaman|wann|quand|متى)$/i,
      /^(how much|cost|price|and the price|and price|fiyatı|fiyati|ne kadar|fiyat|ücreti|ucreti|combien|wie viel|كم السعر)$/i,
      /^(which one|which|hangisi|welches|lequel|أي واحد)$/i,
      /^(where|nerede|neresi|wo|où|أين)$/i,
      /^(what about recovery|recovery|healing|iyileşme|iyilesme|iyileşme süreci|guérison|erholung|التعافي)$/i,
      /^(how long|duration|ne kadar sürer|kaç gün|kac gun|durée|wie lange|كم يستغرق)$/i,
      /^(morning|afternoon|evening|sabah|öğlen|akşam|morgens|nachmittags|abends|صباحاً|مساءً)$/i,
      /^(tomorrow|can i come tomorrow|yarın|yarin|yarın gelebilir miyim|morgen|demain|غداً)$/i,
      /^(next week|haftaya|önümüzdeki hafta|nächste woche|la semaine prochaine|الأسبوع القادم)$/i,
      /^(what about my wife|eşim için|eşim|fuer meine frau|pour ma femme|زوجتي)$/i
    ];

    return ellipsisPatterns.some(p => p.test(trimmed));
  }

  /**
   * Resolve an elliptical query in light of conversation context
   */
  public static resolve(
    raw: string,
    lower: string,
    context: Partial<ConversationContext> = {}
  ): ContextualResolution {
    const trimmed = lower.replace(/[?!.,]/g, "").trim();
    const locale = (context.locale || "tr").toLowerCase();
    const isEn = locale.startsWith("en");
    const isDe = locale.startsWith("de");
    const isFr = locale.startsWith("fr");
    const isAr = locale.startsWith("ar");

    const activeTreatment = context.activeTreatment || context.slots?.treatment;
    const activeClinic = context.activeClinic || context.slots?.selectedClinicName || context.clinicName;
    const isInAppointmentFlow =
      context.currentState === "APPOINTMENT_COLLECTION" ||
      context.currentState === "APPOINTMENT_REVIEW" ||
      context.currentFlow === "appointment" ||
      context.expectedSlot !== undefined;

    // 1. "When?" / "Ne zaman?"
    if (/^(when|ne zaman|wann|quand|متى)$/i.test(trimmed)) {
      if (isInAppointmentFlow || context.lastIntent === "appointment_start" || context.expectedSlot === "preferredDate") {
        return {
          isEllipsis: true,
          resolvedIntent: "availability_request",
          resolvedEntities: {
            treatment: activeTreatment,
            informationType: "availability"
          },
          explanation: "Resolved 'When?' to availability query within active appointment flow"
        };
      }

      // If active treatment exists but no active appointment flow:
      if (activeTreatment) {
        // Disambiguate contextually: visiting clinic vs price confirmation timing
        const clarificationPrompt = isEn
          ? "Do you mean when you can visit the clinic, or when the final price can be confirmed?"
          : isDe
          ? "Möchten Sie wissen, wann Sie die Klinik besuchen können, oder wann der endgültige Preis feststeht?"
          : isFr
          ? "Souhaitez-vous savoir quand vous pouvez visiter la clinique ou quand le prix final sera confirmé ?"
          : isAr
          ? "هل تقصد متى يمكنك زيارة العيادة، أم متى سيتم تأكيد السعر النهائي؟"
          : "Kliniği ne zaman ziyaret edebileceğinizi mi, yoksa net fiyatın ne zaman belirleneceğini mi öğrenmek istersiniz?";

        const suggestedOptions = isEn
          ? ["Appointment availability", "Price confirmation timing"]
          : isDe
          ? ["Terminverfügbarkeit", "Preisbestätigung"]
          : isFr
          ? ["Disponibilité du rendez-vous", "Confirmation du prix"]
          : isAr
          ? ["المواعيد المتاحة", "تأكيد السعر"]
          : ["Randevu uygunluğu", "Fiyatın kesinleşmesi"];

        return {
          isEllipsis: true,
          resolvedIntent: "availability_request",
          resolvedEntities: {
            treatment: activeTreatment,
            informationType: "availability"
          },
          clarificationNeeded: true,
          clarificationPrompt,
          suggestedOptions,
          explanation: "Disambiguated 'When?' for active treatment with structured options"
        };
      }

      // If neither treatment nor flow is active:
      return {
        isEllipsis: true,
        resolvedIntent: "working_hours_request",
        resolvedEntities: { informationType: "opening_hours" },
        explanation: "Resolved general 'When?' to working hours / availability"
      };
    }

    // 2. "How much?" / "And the price?" / "Fiyatı?" / "Ne kadar?"
    if (/^(how much|cost|price|and the price|and price|fiyatı|fiyati|ne kadar|fiyat|ücreti|ucreti|combien|wie viel|كم السعر)$/i.test(trimmed)) {
      return {
        isEllipsis: true,
        resolvedIntent: "pricing_request",
        resolvedEntities: {
          treatment: activeTreatment || "general",
          informationType: "price"
        },
        explanation: "Resolved elliptical price inquiry using active treatment context"
      };
    }

    // 3. "Where?" / "Nerede?" / "Neresi?"
    if (/^(where|nerede|neresi|wo|où|أين)$/i.test(trimmed)) {
      return {
        isEllipsis: true,
        resolvedIntent: "location_request",
        resolvedEntities: {
          clinic: activeClinic,
          informationType: "location"
        },
        explanation: "Resolved 'Where?' to clinic location inquiry"
      };
    }

    // 4. "What about recovery?" / "İyileşme süreci?"
    if (/^(what about recovery|recovery|healing|iyileşme|iyilesme|iyileşme süreci|guérison|erholung|التعافي)$/i.test(trimmed)) {
      return {
        isEllipsis: true,
        resolvedIntent: "treatment_information",
        resolvedEntities: {
          treatment: activeTreatment,
          informationType: "recovery"
        },
        explanation: "Resolved recovery inquiry using active treatment context"
      };
    }

    // 5. "How long?" / "Duration?" / "Ne kadar sürer?"
    if (/^(how long|duration|ne kadar sürer|kaç gün|kac gun|durée|wie lange|كم يستغرق)$/i.test(trimmed)) {
      return {
        isEllipsis: true,
        resolvedIntent: "treatment_information",
        resolvedEntities: {
          treatment: activeTreatment,
          informationType: "duration"
        },
        explanation: "Resolved duration inquiry using active treatment context"
      };
    }

    // 6. "Which one?" / "Hangisi?"
    if (/^(which one|which|hangisi|welches|lequel|أي واحد)$/i.test(trimmed)) {
      return {
        isEllipsis: true,
        resolvedIntent: "treatment_information",
        resolvedEntities: {
          treatment: activeTreatment,
          informationType: "suitability"
        },
        explanation: "Resolved 'Which one?' to treatment suitability/recommendation"
      };
    }

    // 7. Time / Day Ellipsis: "Morning?", "Tomorrow?", "Can I come tomorrow?", "Next week?"
    const slotRes = SlotExtractor.extractSlots(raw, context.slots, locale);
    if (slotRes.extracted.preferredDate || slotRes.extracted.preferredTime) {
      return {
        isEllipsis: true,
        resolvedIntent: isInAppointmentFlow ? "appointment_continuation" : "availability_request",
        resolvedEntities: {
          ...slotRes.extracted,
          treatment: activeTreatment
        },
        explanation: "Resolved date/time elliptical slot expression"
      };
    }

    return { isEllipsis: false };
  }
}
