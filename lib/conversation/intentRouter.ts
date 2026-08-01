/**
 * Unified Intent Router for ClinicBridge AI Engine
 * Two-tier classification: Tier 1 deterministic 0ms evaluation, Tier 2 contextual fallback.
 * Strictly gates RAG / Knowledge Base access to prevent false fallbacks on slot inputs.
 */

import {
  ConversationContext,
  ConversationIntent,
  ConversationSlots,
  ConversationState,
  IntentClassificationResult
} from "./types";
import { SlotExtractor } from "./slotExtractor";

export class IntentRouter {
  /**
   * Classify user message intent considering conversation state, extracted slots, and history
   */
  public static classifyConversationIntent(params: {
    message: string;
    conversationHistory?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    currentState?: ConversationState;
    collectedSlots?: Partial<ConversationSlots>;
    clinicContext?: {
      clinicId?: string;
      clinicName?: string;
      turkishContactNumber?: string;
      internationalContactNumber?: string;
    };
    agencyContext?: {
      agencyId?: string;
      agencySlug?: string;
    };
    locale?: string;
    expectedSlot?: string;
  }): IntentClassificationResult {
    const raw = (params.message || "").trim();
    const lower = raw.toLowerCase();
    const currentState = params.currentState || "INITIAL";
    const existingSlots = params.collectedSlots || {};
    const locale = params.locale || "tr";
    const expectedSlot = params.expectedSlot;

    // Step 1: Extract all identifiable slots and detect corrections
    const { extracted, isCorrection, correctedSlotKey, invalidEmailAttempt, allInfoProvidedIntent } = SlotExtractor.extractSlots(
      raw,
      existingSlots,
      locale,
      "Europe/Istanbul",
      expectedSlot
    );

    const isInAppointmentFlow =
      currentState === "APPOINTMENT_COLLECTION" ||
      currentState === "APPOINTMENT_REVIEW" ||
      currentState === "TREATMENT_DISCOVERY";

    // Step 2: High priority safety / emergency intent
    if (this.isEmergency(lower)) {
      return {
        intent: "emergency",
        confidence: 1.0,
        entities: extracted,
        requiresKnowledgeBase: false,
        shouldContinueActiveFlow: false,
        explanation: "Emergency / acute pain detected"
      };
    }

    // Step 3: High priority live support request
    if (this.isLiveSupport(lower)) {
      return {
        intent: "live_support_request",
        confidence: 1.0,
        entities: extracted,
        requiresKnowledgeBase: false,
        shouldContinueActiveFlow: false,
        explanation: "Explicit live support or human agent requested"
      };
    }

    // Step 4: "Provided all information now" check in active flow
    if (allInfoProvidedIntent) {
      return {
        intent: "appointment_continuation",
        confidence: 1.0,
        entities: extracted,
        requiresKnowledgeBase: false,
        shouldContinueActiveFlow: true,
        allInfoProvidedIntent: true,
        explanation: "Patient reported having provided all information"
      };
    }

    // Step 5: Invalid email attempt in active flow / expectedSlot === "email"
    if (invalidEmailAttempt) {
      return {
        intent: "appointment_continuation",
        confidence: 1.0,
        entities: extracted,
        requiresKnowledgeBase: false,
        shouldContinueActiveFlow: true,
        validationError: "invalid_email",
        explanation: "Invalid email attempt detected during collection"
      };
    }

    // Step 6: Complaint detection
    if (this.isComplaint(lower)) {
      return {
        intent: "complaint",
        confidence: 0.95,
        entities: extracted,
        requiresKnowledgeBase: false,
        shouldContinueActiveFlow: currentState === "APPOINTMENT_COLLECTION",
        isInterruption: currentState === "APPOINTMENT_COLLECTION",
        explanation: "Patient expressed dissatisfaction or lack of response"
      };
    }

    // Step 7: Appointment Correction (e.g. "1 Ağustos değil 3 Ağustos olsun", "Use sadia.new@hotmail.com instead")
    if (isCorrection && (extracted.preferredDate || extracted.preferredTime || extracted.email || extracted.phone || extracted.fullName)) {
      return {
        intent: "appointment_correction",
        confidence: 0.98,
        entities: extracted,
        requiresKnowledgeBase: false,
        shouldContinueActiveFlow: true,
        explanation: `Slot corrected: ${correctedSlotKey || "appointment_slot"}`
      };
    }

    // Step 8: Explicit Confirmation / Rejection in active flows
    if (this.isConfirmation(lower)) {
      const isApptReview = currentState === "APPOINTMENT_REVIEW";
      return {
        intent: isApptReview ? "appointment_confirmation" : "confirmation",
        confidence: 0.95,
        entities: extracted,
        requiresKnowledgeBase: false,
        shouldContinueActiveFlow: true,
        explanation: "Affirmative confirmation received"
      };
    }

    if (this.isRejection(lower)) {
      return {
        intent: "rejection",
        confidence: 0.95,
        entities: extracted,
        requiresKnowledgeBase: false,
        shouldContinueActiveFlow: false,
        explanation: "Rejection / cancellation received"
      };
    }

    // Step 9: Active Flow Continuation (User is in APPOINTMENT_COLLECTION or LEAD_COLLECTION)
    const hasSlotValues = Object.keys(extracted).length > 0;

    // If in appointment flow and message is clearly providing a slot (date, time, visitType, name, phone, email)
    if (isInAppointmentFlow && hasSlotValues) {
      // Check if message ALSO asks a knowledge question (e.g. "1 Ağustos olsun, peki fiyat ne kadar?")
      const hasKnowledgeQuery = this.isPricingQuery(lower) || this.isDoctorQuery(lower) || this.isTreatmentQuery(lower);
      if (!hasKnowledgeQuery) {
        return {
          intent: "appointment_continuation",
          confidence: 0.96,
          entities: extracted,
          requiresKnowledgeBase: false,
          shouldContinueActiveFlow: true,
          explanation: "Providing slot value during active appointment flow"
        };
      }
    }

    // Step 8: Appointment Start Intent
    if (this.isAppointmentStart(lower)) {
      return {
        intent: "appointment_start",
        confidence: 0.95,
        entities: extracted,
        requiresKnowledgeBase: false,
        shouldContinueActiveFlow: true,
        suggestedNextState: "APPOINTMENT_COLLECTION",
        explanation: "Explicit appointment request"
      };
    }

    // Step 9: Specific Knowledge Questions (RAG Required)
    if (this.isPricingQuery(lower)) {
      return {
        intent: "pricing_request",
        confidence: 0.92,
        entities: extracted,
        requiresKnowledgeBase: true,
        shouldContinueActiveFlow: isInAppointmentFlow,
        isInterruption: isInAppointmentFlow,
        explanation: "Pricing inquiry"
      };
    }

    if (this.isDoctorQuery(lower)) {
      return {
        intent: "doctor_information",
        confidence: 0.92,
        entities: extracted,
        requiresKnowledgeBase: true,
        shouldContinueActiveFlow: isInAppointmentFlow,
        isInterruption: isInAppointmentFlow,
        explanation: "Doctor inquiry"
      };
    }

    if (this.isLocationQuery(lower)) {
      return {
        intent: "clinic_location",
        confidence: 0.95,
        entities: extracted,
        requiresKnowledgeBase: true,
        shouldContinueActiveFlow: isInAppointmentFlow,
        isInterruption: isInAppointmentFlow,
        explanation: "Clinic location or address inquiry"
      };
    }

    if (this.isWorkingHoursQuery(lower)) {
      return {
        intent: "clinic_working_hours",
        confidence: 0.95,
        entities: extracted,
        requiresKnowledgeBase: true,
        shouldContinueActiveFlow: isInAppointmentFlow,
        isInterruption: isInAppointmentFlow,
        explanation: "Working hours inquiry"
      };
    }

    if (this.isTreatmentQuery(lower)) {
      return {
        intent: "treatment_information",
        confidence: 0.90,
        entities: extracted,
        requiresKnowledgeBase: true,
        shouldContinueActiveFlow: isInAppointmentFlow,
        isInterruption: isInAppointmentFlow,
        explanation: "Treatment details or service inquiry"
      };
    }

    // Step 10: Agency Recommendation / Comparison
    if (params.agencyContext?.agencyId && this.isAgencyMatchingQuery(lower)) {
      return {
        intent: "clinic_recommendation",
        confidence: 0.92,
        entities: extracted,
        requiresKnowledgeBase: false,
        shouldContinueActiveFlow: true,
        suggestedNextState: "CLINIC_MATCHING",
        explanation: "Agency clinic matching request"
      };
    }

    // Step 11: Contact Request (phone, whatsapp)
    if (this.isContactQuery(lower)) {
      return {
        intent: "contact_request",
        confidence: 0.90,
        entities: extracted,
        requiresKnowledgeBase: false,
        shouldContinueActiveFlow: isInAppointmentFlow,
        isInterruption: isInAppointmentFlow,
        explanation: "Clinic contact number or info inquiry"
      };
    }

    // Step 12: Greeting
    if (this.isGreeting(lower)) {
      return {
        intent: "greeting",
        confidence: 0.95,
        entities: extracted,
        requiresKnowledgeBase: false,
        shouldContinueActiveFlow: false,
        explanation: "Greeting"
      };
    }

    // Step 13: Casual Conversation / Thanks
    if (this.isCasual(lower)) {
      return {
        intent: "casual_conversation",
        confidence: 0.90,
        entities: extracted,
        requiresKnowledgeBase: false,
        shouldContinueActiveFlow: isInAppointmentFlow,
        explanation: "Polite small talk / thanks"
      };
    }

    // Step 14: In active flow with unclassified text (e.g. user answered something specific)
    if (isInAppointmentFlow && raw.length < 80) {
      return {
        intent: "appointment_continuation",
        confidence: 0.75,
        entities: extracted,
        requiresKnowledgeBase: false,
        shouldContinueActiveFlow: true,
        explanation: "Contextual input in active appointment flow"
      };
    }

    // Fallback: General Unknown
    return {
      intent: "unknown",
      confidence: 0.5,
      entities: extracted,
      requiresKnowledgeBase: true, // Allow RAG search for arbitrary questions
      shouldContinueActiveFlow: false,
      explanation: "Unclassified query"
    };
  }

  // --- Helper Predicates ---

  private static isEmergency(lower: string): boolean {
    // If it's administrative request e.g. "acil yetkili", "acil dönüş", do not trigger medical emergency
    if (/\bacil\s*(?:yetkili|temsilci|dönüş|donus|cevap|arama|destek|biri)\b/i.test(lower)) {
      return false;
    }
    return /\b(tıbbi acil|tibbi acil|kanama|dayanılmaz ağrı|dayanilmaz agri|bayılma|bayilma|nefes alamıyorum|nefes alamiyorum|şiddetli kanama|siddetli kanama|şiddetli ağrı|siddetli agri|emergency|severe pain|heavy bleeding|fainting)\b/i.test(
      lower
    ) || (/\bacil\b/i.test(lower) && /\b(ağrı|agri|kanama|hastane|doktor|ambulans|durum|tedavi)\b/i.test(lower));
  }

  private static isLiveSupport(lower: string): boolean {
    return /\b(canlı destek|canli destek|müşteri temsilcisi|yetkili|yetkiliyle|insanla görüşmek|biriyle görüşmek|temsilci|operator|human agent|live support|talk to human|representative|call me|beni arayın)\b/i.test(
      lower
    );
  }

  private static isComplaint(lower: string): boolean {
    return /\b(cevap vermiyor|cevap alamadım|cevap alamadim|ulaşamıyorum|ulasamiyorum|dönüş yapılmadı|donus yapilmadi|şikayet|sikayet|memnun kalmadım|memnun kalmadim|rezalet|kimse bakmıyor|kimse bakmiyor|no response|unreachable|complaint)\b/i.test(
      lower
    );
  }

  private static isConfirmation(lower: string): boolean {
    const cleaned = lower.replace(/[,.!\-_]/g, " ").replace(/\s+/g, " ").trim();
    return /^(evet|onaylıyorum|onayliyorum|tamam|uygun|olur|doğrudur|dogrudur|randevuyu oluştur|randevuyu olustur|yes|sure|okay|ok|confirm|i accept|evet onaylıyorum|evet onayliyorum|evet lütfen|evet lutfen|yes confirm|yes please|yes i confirm|yes sure)$/i.test(
      cleaned
    ) || /^(evet|yes|onaylıyorum|onayliyorum)\b/i.test(cleaned);
  }

  private static isRejection(lower: string): boolean {
    return /^(hayır|hayir|istemiyorum|vazgeçtim|vazgectim|iptal|iptal et|no|cancel|nevermind|don't want)$/i.test(
      lower.trim()
    );
  }

  private static isAppointmentStart(lower: string): boolean {
    return /\b(randevu|randevu almak|randevu oluştur|randevu olustur|muayene olmak|rezervasyon|görüşme talep|book appointment|make an appointment|schedule appointment|book a visit)\b/i.test(
      lower
    );
  }

  private static isPricingQuery(lower: string): boolean {
    return /\b(fiyat|fiyatı|fiyati|fiyatlar|fiyatları|ücret|ucret|ücreti|ucreti|kaç tl|kac tl|kaç para|kac para|kaç euro|kac euro|ne kadar|fiyat bilgisi|ücretli mi|ucretli mi|price|pricing|cost|how much|fee)\b/i.test(
      lower
    );
  }

  private static isDoctorQuery(lower: string): boolean {
    return /\b(doktor|doktorlar|hekim|hekimler|uzman|uzmanlar|hangi doktor|dt\.|dr\.|doctor|doctors|dentist|dentists|physician|specialist)\b/i.test(
      lower
    );
  }

  private static isLocationQuery(lower: string): boolean {
    return /\b(nerede|neredesiniz|neredesiniz acaba|nerede bulunuyorsunuz|hangi semtte|adres|adresiniz|konum|konumunuz|harita|ulaşım|ulasim|nasıl gelirim|nasil gelirim|where are you|location|address|how to get there|map)\b/i.test(
      lower
    );
  }

  private static isWorkingHoursQuery(lower: string): boolean {
    return /\b(çalışma saatleri|calisma saatleri|kaçta açılıyor|kacta aciliyor|kaçta kapanıyor|kacta kapaniyor|hafta sonu açık mı|hafta sonu acik mi|pazar açık mı|pazar acik mi|mesai|opening hours|working hours|open on sunday|open on weekend)\b/i.test(
      lower
    );
  }

  private static isTreatmentQuery(lower: string): boolean {
    return /\b(hizmet|hizmetler|hizmetleriniz|tedavi|tedaviler|tedavileriniz|neler yapıyorsunuz|ne yapıyorsunuz|hangi tedaviler|hangi işlemler|services|treatments|what do you do|procedures|what services|implant|zirkonyum|zirconium|diş beyazlatma|teeth whitening|gülüş tasarımı|smile design|kanal tedavisi|root canal|dolgu|kaplama)\b/i.test(
      lower
    );
  }

  private static isAgencyMatchingQuery(lower: string): boolean {
    return /\b(klinik öner|klinik oner|hangi klinik|istanbul'da klinik|istanbuldaki klinikler|en iyi klinik|uygun klinik|tavsiye|recommend|best clinic|which clinic|clinics in)\b/i.test(
      lower
    );
  }

  private static isContactQuery(lower: string): boolean {
    return /\b(telefon|telefonunuz|numara|numaranız|whatsapp|ulaşabilirim|ulasabilirim|iletişim|iletisim|phone|contact|call you)\b/i.test(
      lower
    );
  }

  private static isGreeting(lower: string): boolean {
    return /^(merhaba|selam|selamlar|günaydın|gunaydin|iyi günler|iyi gunler|iyi akşamlar|iyi aksamlar|hello|hi|hey|good morning|good afternoon|good evening)[!.,\s]*$/i.test(
      lower.trim()
    );
  }

  private static isCasual(lower: string): boolean {
    return /\b(teşekkür|tesekkur|teşekkürler|tesekkurler|sağol|sagol|sağolun|sagolun|rica ederim|kolay gelsin|görüşürüz|gorusuruz|thanks|thank you|have a nice day|goodbye|bye)\b/i.test(
      lower
    );
  }
}
