/**
 * Unified Intent Router for ClinicBridge AI Engine
 *
 * Implements Generalized Intent + Entity + Multi-Turn Context Resolution.
 * No per-phrase or per-treatment intents: all queries resolve to standard intents
 * (e.g. pricing_request, treatment_information, contact_request, location_request)
 * accompanied by extracted entities (treatment, informationType, contactTarget, etc.).
 *
 * Strictly gates RAG / Knowledge Base access to prevent false groundedness fallbacks on valid inputs.
 */

import {
  ConversationContext,
  ConversationIntent,
  ConversationSlots,
  ConversationState,
  InformationType,
  IntentClassificationResult,
  PendingAction
} from "./types";
import { SlotExtractor } from "./slotExtractor";
import { ContextResolver } from "./contextResolver";
import { PendingActionManager } from "./PendingActionManager";
import { detectExplicitBookingIntent } from "./appointmentIntentGate";

export class IntentRouter {
  /**
   * Classify user message intent considering conversation state, extracted entities, and history
   */
  public static classifyConversationIntent(params: {
    message: string;
    conversationHistory?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    currentState?: ConversationState;
    currentFlow?: "appointment" | "lead" | "quote" | "general";
    collectedSlots?: Partial<ConversationSlots>;
    activeTreatment?: string;
    activeTopic?: string;
    activeClinic?: string;
    lastIntent?: ConversationIntent;
    pendingAction?: PendingAction | null;
    appointmentSubmitted?: boolean;
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

    // Step 1: Extract all identifiable entities, slots, and corrections
    const { extracted, isCorrection, correctedSlotKey, invalidEmailAttempt, allInfoProvidedIntent } = SlotExtractor.extractSlots(
      raw,
      existingSlots,
      locale,
      "Europe/Istanbul",
      expectedSlot
    );

    // Merge active treatment if not explicitly in current message
    if (!extracted.treatment && params.activeTreatment) {
      extracted.treatment = params.activeTreatment;
    }

    const isInAppointmentFlow =
      currentState === "APPOINTMENT_COLLECTION" ||
      currentState === "APPOINTMENT_REVIEW" ||
      currentState === "TREATMENT_DISCOVERY" ||
      params.currentFlow === "appointment" ||
      Boolean(expectedSlot);

    // Step 1: Language Switch Detection (Highest Priority)
    const langSwitch = this.detectLanguageSwitch(raw);
    if (langSwitch.isSwitch && langSwitch.targetLocale) {
      return {
        intent: "language_switch",
        confidence: 1.0,
        entities: extracted,
        targetLocale: langSwitch.targetLocale,
        requiresKnowledgeBase: false,
        shouldContinueActiveFlow: isInAppointmentFlow,
        explanation: `Explicit language switch to ${langSwitch.targetLocale}`
      };
    }

    // Step 1.1: Cancel / Reset Detection
    if (this.isCancel(lower)) {
      return {
        intent: "cancel",
        confidence: 1.0,
        entities: {},
        requiresKnowledgeBase: false,
        shouldContinueActiveFlow: false,
        explanation: "Appointment cancellation or reset requested"
      };
    }

    // Step 1.2: Multi-Intent Compound Message Detection (e.g. "Yes. Which doctor will perform my implant?")
    const multiIntent = this.detectMultiIntent(raw, lower, {
      currentState,
      isInAppointmentFlow,
      expectedSlot,
      pendingAction: params.pendingAction,
      appointmentSubmitted: params.appointmentSubmitted
    });

    if (multiIntent.isMulti && multiIntent.primaryIntent) {
      return {
        intent: multiIntent.primaryIntent,
        confidence: 0.98,
        entities: extracted,
        requiresKnowledgeBase: multiIntent.requiresKnowledgeBase || false,
        shouldContinueActiveFlow: true,
        multiIntentDetected: true,
        secondaryIntent: multiIntent.secondaryIntent,
        secondaryQuery: multiIntent.secondaryQuery,
        secondaryRequiresKnowledgeBase: multiIntent.secondaryRequiresKnowledgeBase,
        pendingAction: params.pendingAction,
        explanation: `Multi-intent detected: ${multiIntent.primaryIntent} + ${multiIntent.secondaryIntent}`
      };
    }

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

    // Step 3: High priority live support / contact request
    if (this.isContactOrLiveSupport(lower)) {
      const isLiveSupport = this.isLiveSupport(lower);
      return {
        intent: isLiveSupport ? "live_support_request" : "contact_request",
        confidence: 0.98,
        entities: {
          ...extracted,
          contactTarget: extracted.contactTarget || (isLiveSupport ? "human_agent" : "clinic_team")
        },
        requiresKnowledgeBase: false,
        shouldContinueActiveFlow: isInAppointmentFlow,
        isInterruption: isInAppointmentFlow,
        interruptionReason: "contact_inquiry",
        explanation: "Contact information or live support requested"
      };
    }

    // Step 4: Complaint Detection
    if (this.isComplaint(lower)) {
      return {
        intent: "complaint",
        confidence: 0.95,
        entities: extracted,
        requiresKnowledgeBase: false,
        shouldContinueActiveFlow: false,
        explanation: "Dissatisfaction or complaint detected"
      };
    }

    // Step 5: Appointment Start / Booking Intent (Highest precedence over generic info/treatment words)
    if (this.isAppointmentStart(lower)) {
      return {
        intent: "appointment_start",
        confidence: 0.95,
        entities: extracted,
        requiresKnowledgeBase: false,
        shouldContinueActiveFlow: true,
        suggestedNextState: "APPOINTMENT_COLLECTION",
        explanation: "Appointment creation initiated"
      };
    }

    // Step 6: Informational Questions during active appointment flow (Interruption Handling)
    // CRITICAL: Questions must NEVER be fed into slot validators (Phone, Date, Email, Name)
    const isQuestionInFlow = this.isInformationalQuestion(lower);
    if (isQuestionInFlow.isQuestion && isQuestionInFlow.intent) {
      return {
        intent: isQuestionInFlow.intent,
        confidence: 0.95,
        entities: {
          ...extracted,
          treatment: extracted.treatment || params.activeTreatment,
          informationType: isQuestionInFlow.informationType || extracted.informationType || "general"
        },
        requiresKnowledgeBase: true,
        requiresPricingData: isQuestionInFlow.intent === "pricing_request" || isQuestionInFlow.intent === "quote_request",
        shouldContinueActiveFlow: isInAppointmentFlow,
        isInterruption: isInAppointmentFlow,
        interruptionReason: isQuestionInFlow.intent,
        explanation: `Informational question (${isQuestionInFlow.intent}) during conversation`
      };
    }

    // Step 6: "Provided all information now" check in active flow
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

    // Step 7: Invalid email attempt in active flow / expectedSlot === "email"
    if (invalidEmailAttempt) {
      return {
        intent: "appointment_continuation",
        confidence: 1.0,
        entities: extracted,
        targetSlot: "email",
        requiresKnowledgeBase: false,
        shouldContinueActiveFlow: true,
        validationError: "invalid_email",
        explanation: "Malformed email detected during slot collection"
      };
    }

    // Step 8: Slot Correction (e.g. "1 Ağustos değil 3 Ağustos olsun", "Use sadia.new@hotmail.com instead")
    if (isCorrection) {
      return {
        intent: "appointment_correction",
        confidence: 1.0,
        entities: extracted,
        requiresKnowledgeBase: false,
        shouldContinueActiveFlow: true,
        explanation: `Slot correction for ${correctedSlotKey || "slot"}`
      };
    }

    // Step 9: Explicit Confirmation / Rejection and Pending Action Resolution
    const isConf = PendingActionManager.isConfirmation(raw);
    const isRej = PendingActionManager.isRejection(raw);

    if (isConf || isRej) {
      const latestAssistantMsg = params.conversationHistory?.filter(m => m.role === "assistant").pop()?.content;
      const resolution = PendingActionManager.resolvePendingConfirmation({
        message: raw,
        pendingAction: params.pendingAction,
        latestAssistantMessage: latestAssistantMsg,
        conversationState: currentState,
        appointmentSubmitted: params.appointmentSubmitted
      });

      if (resolution.isRejection) {
        return {
          intent: "rejection",
          confidence: 1.0,
          entities: extracted,
          requiresKnowledgeBase: false,
          shouldContinueActiveFlow: false,
          explanation: `User rejected action (${resolution.reason})`
        };
      }

      if (resolution.shouldExecute) {
        if (resolution.actionType === "show_doctor_information") {
          return {
            intent: "doctor_information",
            confidence: 0.96,
            entities: extracted,
            requiresKnowledgeBase: true,
            shouldContinueActiveFlow: false,
            pendingAction: params.pendingAction,
            explanation: "Doctor information offer confirmed"
          };
        }

        if (resolution.actionType === "submit_appointment") {
          return {
            intent: "appointment_confirmation",
            confidence: 1.0,
            entities: extracted,
            requiresKnowledgeBase: false,
            shouldContinueActiveFlow: true,
            pendingAction: params.pendingAction,
            explanation: "Appointment review confirmed"
          };
        }

        if (resolution.actionType === "request_quote") {
          return {
            intent: "quote_request",
            confidence: 0.95,
            entities: {
              ...extracted,
              treatment: extracted.treatment || params.activeTreatment,
              informationType: "price"
            },
            requiresKnowledgeBase: true,
            requiresPricingData: true,
            shouldContinueActiveFlow: false,
            pendingAction: params.pendingAction,
            explanation: "Quote request offer confirmed"
          };
        }

        if (resolution.actionType === "create_live_support_request") {
          return {
            intent: "live_support_request",
            confidence: 0.95,
            entities: extracted,
            requiresKnowledgeBase: false,
            shouldContinueActiveFlow: false,
            pendingAction: params.pendingAction,
            explanation: "Live support offer confirmed"
          };
        }
      }

      // If appointment was already submitted and user sent a generic confirmation without pending action
      if (params.appointmentSubmitted === true || currentState === "APPOINTMENT_SUBMITTED" || currentState === "COMPLETED") {
        return {
          intent: "casual_conversation",
          confidence: 0.9,
          entities: extracted,
          requiresKnowledgeBase: false,
          shouldContinueActiveFlow: false,
          explanation: "Generic confirmation in post-submitted state"
        };
      }

      if (currentState === "APPOINTMENT_REVIEW" || expectedSlot === "confirmation") {
        if (isConf) {
          return {
            intent: "appointment_confirmation",
            confidence: 1.0,
            entities: extracted,
            requiresKnowledgeBase: false,
            shouldContinueActiveFlow: true,
            explanation: "Appointment review confirmed"
          };
        }
      }
    }

    // Step 10: Active Appointment Flow continuation when valid slot is provided
    if (isInAppointmentFlow) {
      let targetSlot: string | undefined = undefined;
      if (extracted.preferredDate || extracted.preferredTime) targetSlot = "date";
      else if (extracted.phone) targetSlot = "phone";
      else if (extracted.email) targetSlot = "email";
      else if (extracted.fullName || extracted.firstName) targetSlot = "fullName";
      else if (expectedSlot) targetSlot = expectedSlot;

      const hasValidSlot = Boolean(
        extracted.preferredDate ||
        extracted.preferredTime ||
        extracted.email ||
        extracted.phone ||
        extracted.fullName ||
        extracted.firstName ||
        (expectedSlot && raw.length < 80)
      );

      if (hasValidSlot) {
        return {
          intent: "appointment_continuation",
          confidence: 0.95,
          entities: extracted,
          targetSlot,
          requiresKnowledgeBase: false,
          shouldContinueActiveFlow: true,
          explanation: "Slot provided in active appointment collection"
        };
      }
    }

    // Step 11: Contextual Ellipsis Resolution for short queries ("When?", "How much?", "Where?", "Recovery?")
    if (ContextResolver.isEllipticalQuery(raw, lower)) {
      const resolvedContext = ContextResolver.resolve(raw, lower, {
        currentState,
        slots: existingSlots,
        activeTreatment: params.activeTreatment || existingSlots.treatment,
        activeTopic: params.activeTopic,
        activeClinic: params.activeClinic || params.clinicContext?.clinicName,
        lastIntent: params.lastIntent,
        expectedSlot,
        locale
      });

      if (resolvedContext.isEllipsis && resolvedContext.resolvedIntent) {
        return {
          intent: resolvedContext.resolvedIntent,
          confidence: 0.92,
          entities: { ...extracted, ...resolvedContext.resolvedEntities },
          requiresKnowledgeBase: resolvedContext.resolvedIntent === "pricing_request" || resolvedContext.resolvedIntent === "treatment_information",
          requiresPricingData: resolvedContext.resolvedIntent === "pricing_request",
          shouldContinueActiveFlow: isInAppointmentFlow,
          clarificationNeeded: resolvedContext.clarificationNeeded,
          clarificationPrompt: resolvedContext.clarificationPrompt,
          suggestedOptions: resolvedContext.suggestedOptions,
          explanation: resolvedContext.explanation
        };
      }
    }

    // Step 12: Appointment Start / Booking Intent
    if (this.isAppointmentStart(lower)) {
      return {
        intent: "appointment_start",
        confidence: 0.95,
        entities: extracted,
        requiresKnowledgeBase: false,
        shouldContinueActiveFlow: true,
        suggestedNextState: "APPOINTMENT_COLLECTION",
        explanation: "Appointment creation initiated"
      };
    }

    // Step 13: Agency Recommendation / Comparison
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

    // Step 14: Greeting
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

    // Step 15: Casual Conversation / Thanks
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

    // Step 16: In active flow with unclassified short text (e.g. user answered something specific)
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

    // Fallback: General Unknown (requiresKnowledgeBase: true for open RAG)
    return {
      intent: "unknown",
      confidence: 0.5,
      entities: extracted,
      requiresKnowledgeBase: true,
      shouldContinueActiveFlow: false,
      explanation: "Unclassified query"
    };
  }

  // --- Helper Predicates ---

  public static isEmergency(lower: string): boolean {
    if (/\bacil\s*(?:yetkili|temsilci|dönüş|donus|cevap|arama|destek|biri)\b/i.test(lower)) {
      return false;
    }
    return /\b(tıbbi acil|tibbi acil|kanama|dayanılmaz ağrı|dayanilmaz agri|bayılma|bayilma|nefes alamıyorum|nefes alamiyorum|şiddetli kanama|siddetli kanama|şiddetli ağrı|siddetli agri|emergency|severe pain|heavy bleeding|fainting|severe bleeding)\b/i.test(
      lower
    ) || (/\bacil\b/i.test(lower) && /\b(ağrı|agri|kanama|hastane|doktor|ambulans|durum|tedavi)\b/i.test(lower));
  }

  public static isContactOrLiveSupport(lower: string): boolean {
    return this.isLiveSupport(lower) || this.isContactQuery(lower);
  }

  public static isLiveSupport(lower: string): boolean {
    return /\b(canlı destek|canli destek|müşteri temsilcisi|yetkili|yetkiliyle|insanla görüşmek|biriyle görüşmek|temsilci|operator|human agent|live support|talk to human|representative|call me|beni arayın|beni arayin|real person|speak with someone|speak to someone|talk to someone|connect me with a person|need human support)\b/i.test(
      lower
    );
  }

  public static isContactQuery(lower: string): boolean {
    return /\b(telefon|telefonunuz|numara|numaranız|numaraniz|whatsapp|ulaşabilirim|ulasabilirim|iletişim|iletisim|phone|phone number|contact|contact the clinic|call you|reach you|how can i reach you|talk to your team|speak to your team|let me speak with the clinic|speak with the clinic|talk to the clinic|contact details)\b/i.test(
      lower
    );
  }

  public static isComplaint(lower: string): boolean {
    return /\b(cevap vermiyor|cevap alamadım|cevap alamadim|ulaşamıyorum|ulasamiyorum|dönüş yapılmadı|donus yapilmadi|şikayet|sikayet|memnun kalmadım|memnun kalmadim|rezalet|kimse bakmıyor|kimse bakmiyor|no response|unreachable|complaint)\b/i.test(
      lower
    );
  }

  public static isConfirmation(lower: string): boolean {
    return PendingActionManager.isConfirmation(lower);
  }

  public static isRejection(lower: string): boolean {
    return PendingActionManager.isRejection(lower);
  }

  /**
   * Booking intent detection is owned by the shared appointment gate so that the
   * classifier and the appointment-entry gate can never disagree.
   */
  public static isAppointmentStart(lower: string): boolean {
    return detectExplicitBookingIntent(lower).hasBookingIntent;
  }

  public static isPricingQuery(lower: string): boolean {
    return (
      /(?:fiyat|fiyatı|fiyati|fiyatlar|fiyatları|ücret|ucret|ücreti|ucreti|ücretler|ucretler|pahalı|pahali|masraf|maliyet|kaç tl|kac tl|kaç para|kac para|kaç euro|kac euro|ne kadar|fiyat bilgisi|ücretli mi|ucretli mi|price|pricing|cost|how much|fee|how expensive|charge|what do you charge|and the price|and price)/i.test(
        lower
      )
    );
  }

  public static isQuoteRequest(lower: string): boolean {
    return /\b(fiyat teklifi|teklif al|teklif almak|teklif istiyorum|quote|get a quote|request a quote|give me a quote)\b/i.test(
      lower
    );
  }

  public static isDoctorQuery(lower: string): boolean {
    return /(?:doktor|doktorlar|hekim|hekimler|uzman|uzmanlar|hangi doktor|dt\.|dr\.|doctor|doctors|dentist|dentists|physician|specialist|ärzte|arzt|zahnarzt)/i.test(
      lower
    );
  }

  public static isLocationQuery(lower: string): boolean {
    return /(?:nerede|neredesiniz|nerede bulunuyorsunuz|hangi semtte|adres|adresiniz|konum|konumunuz|harita|ulaşım|ulasim|nasıl gelirim|nasil gelirim|where are you|location|address|how to get there|map|where is the clinic|wo sind sie|standort)/i.test(
      lower
    );
  }

  public static isWorkingHoursQuery(lower: string): boolean {
    return /(?:çalışma saatleri|calisma saatleri|kaçta açılıyor|kacta aciliyor|kaçta kapanıyor|kacta kapaniyor|hafta sonu açık|hafta sonu acik|pazar açık|pazar acik|mesai|opening hours|working hours|open on sunday|open on weekend|wann geöffnet|öffnungszeiten)/i.test(
      lower
    );
  }

  public static isTreatmentQuery(lower: string): boolean {
    return /(?:hizmet|hizmetler|hizmetleriniz|tedavi|tedaviler|tedavileriniz|neler yapıyorsunuz|ne yapıyorsunuz|hangi tedaviler|hangi işlemler|services|treatments|what do you do|procedures|what services|behandlungen|leistungen)/i.test(
      lower
    );
  }

  public static isAgencyMatchingQuery(lower: string): boolean {
    return /(?:klinik öner|klinik oner|hangi klinik|istanbul'da klinik|istanbuldaki klinikler|en iyi klinik|uygun klinik|tavsiye|recommend|best clinic|which clinic|clinics in)/i.test(
      lower
    );
  }

  public static isGreeting(lower: string): boolean {
    return /^(merhaba|selam|selamlar|günaydın|gunaydin|iyi günler|iyi gunler|iyi akşamlar|iyi aksamlar|hello|hi|hey|good morning|good afternoon|good evening)[!.,\s]*$/i.test(
      lower.trim()
    );
  }

  public static isCasual(lower: string): boolean {
    return /\b(teşekkür|tesekkur|teşekkürler|tesekkurler|sağol|sagol|sağolun|sagolun|rica ederim|kolay gelsin|görüşürüz|gorusuruz|thanks|thank you|have a nice day|goodbye|bye)\b/i.test(
      lower
    );
  }

  public static detectLanguageSwitch(raw: string): { isSwitch: boolean; targetLocale?: string } {
    const lower = raw.trim().toLowerCase();

    // English switch
    if (
      /^(?:english(?:\s+please)?|speak(?:\s+in)?\s+english|can\s+we\s+(?:speak|talk|continue|chat)\s+(?:in\s+)?english|please\s+(?:switch\s+to|speak)\s+english|in\s+english\s+please|let'?s\s+(?:speak|continue\s+in)\s+english|switch\s+to\s+english)$/i.test(lower) ||
      /(?:can\s+we\s+continue\s+in\s+english|speak\s+in\s+english|switch\s+to\s+english|english\s+please)/i.test(lower) ||
      /\b(english\s+please|speak\s+english|can\s+we\s+speak\s+english|can\s+we\s+continue\s+in\s+english|switch\s+to\s+english)\b/i.test(lower)
    ) {
      return { isSwitch: true, targetLocale: "en" };
    }

    // Turkish switch
    if (
      /^(?:türkçe(?:\s+lütfen)?|turkce(?:\s+lutfen)?|türkçe\s+konuşalım|turkce\s+konusalim|türkçe\s+devam\s+edelim|turkce\s+devam\s+edelim|türkçeye\s+geçelim|turkceye\s+gecelim)$/i.test(lower) ||
      /(?:türkçe|turkce).*(?:devam|konuş|konus|gec|geç|lütfen|lutfen)/i.test(lower) ||
      /\b(türkçe\s+lütfen|turkce\s+lutfen|türkçe\s+konuşalım|turkce\s+konusalim|türkçe\s+devam\s+edelim|turkce\s+devam\s+edelim|türkçeye\s+geç|turkceye\s+gec)\b/i.test(lower)
    ) {
      return { isSwitch: true, targetLocale: "tr" };
    }

    // German switch
    if (
      /^(?:auf\s+deutsch(?:\s+bitte)?|deutsch\s+bitte|deutsch\s+sprechen|können\s+wir\s+auf\s+deutsch\s+sprechen|bitte\s+auf\s+deutsch)$/i.test(lower) ||
      /\b(auf\s+deutsch\s+bitte|deutsch\s+sprechen|können\s+wir\s+auf\s+deutsch\s+sprechen)\b/i.test(lower)
    ) {
      return { isSwitch: true, targetLocale: "de" };
    }

    // French switch
    if (
      /^(?:en\s+français(?:\s+s'il\s+vous\s+plaît)?|en\s+francais(?:\s+svp)?|parlez\s+français|parlez\s+francais)$/i.test(lower) ||
      /\b(en\s+français\s+s'il\s+vous\s+plaît|parlez\s+français|en\s+francais\s+svp)\b/i.test(lower)
    ) {
      return { isSwitch: true, targetLocale: "fr" };
    }

    // Arabic switch
    if (
      /^(?:بالعربية(?:\s+من\s+فضلك)?|تحدث\s+بالعربية|عربي)$/i.test(lower) ||
      /\b(بالعربية\s+من\s+فضلك|تحدث\s+بالعربية)\b/i.test(lower)
    ) {
      return { isSwitch: true, targetLocale: "ar" };
    }

    return { isSwitch: false };
  }

  public static isCancel(lower: string): boolean {
    const trimmed = lower.trim();
    return (
      /^(?:hayır|hayir|iptal|iptal\s+et|vazgeçtim|vazgectim|istemiyorum|no|cancel|stop|abort|stornieren|annuler|nein|non)$/i.test(trimmed) ||
      /\b(randevuyu\s+iptal\s+et|randevu\s+almaktan\s+vazgeçtim|vazgectim|cancel\s+the\s+appointment|cancel\s+appointment)\b/i.test(trimmed)
    );
  }

  public static detectMultiIntent(
    raw: string,
    lower: string,
    context?: {
      currentState?: ConversationState;
      isInAppointmentFlow?: boolean;
      expectedSlot?: string;
      pendingAction?: PendingAction | null;
      appointmentSubmitted?: boolean;
    }
  ): {
    isMulti: boolean;
    primaryIntent?: ConversationIntent;
    secondaryIntent?: ConversationIntent;
    secondaryQuery?: string;
    requiresKnowledgeBase?: boolean;
    secondaryRequiresKnowledgeBase?: boolean;
  } {
    // Match confirmation prefix followed by secondary text (e.g. "Yes. Which doctor will perform my implant?", "Evet. İmplantı hangi hekim yapacak?")
    const confMatch = raw.match(/^(?:evet|yes|onaylıyorum|onayliyorum|tamam|olur|kabul\s+ediyorum|i\s+confirm|confirmed|proceed|sure|ok)[!.,;:\s]+(.+)$/i);
    if (confMatch) {
      const remainder = confMatch[1].trim();
      const remainderLower = remainder.toLowerCase();

      // Check if remainder is a question
      const questionCheck = this.isInformationalQuestion(remainderLower);
      if (questionCheck.isQuestion) {
        return {
          isMulti: true,
          primaryIntent: (context?.currentState === "APPOINTMENT_REVIEW" || context?.expectedSlot === "confirmation" || context?.pendingAction?.type === "submit_appointment")
            ? "appointment_confirmation"
            : "confirmation",
          secondaryIntent: questionCheck.intent,
          secondaryQuery: remainder,
          requiresKnowledgeBase: true,
          secondaryRequiresKnowledgeBase: true
        };
      }
    }

    return { isMulti: false };
  }

  public static isInformationalQuestion(lower: string): {
    isQuestion: boolean;
    intent?: ConversationIntent;
    informationType?: InformationType;
  } {
    if (this.isDoctorQuery(lower)) {
      return { isQuestion: true, intent: "doctor_information", informationType: "doctor" };
    }
    if (this.isPricingQuery(lower)) {
      return { isQuestion: true, intent: "pricing_request", informationType: "price" };
    }
    if (this.isQuoteRequest(lower)) {
      return { isQuestion: true, intent: "quote_request", informationType: "price" };
    }
    if (this.isLocationQuery(lower)) {
      return { isQuestion: true, intent: "location_request", informationType: "location" };
    }
    if (this.isWorkingHoursQuery(lower)) {
      return { isQuestion: true, intent: "working_hours_request", informationType: "opening_hours" };
    }
    if (this.isWarrantyOrMaterialQuery(lower)) {
      return { isQuestion: true, intent: "treatment_information", informationType: "warranty" };
    }
    if (this.isParkingQuery(lower)) {
      return { isQuestion: true, intent: "clinic_information", informationType: "facility" };
    }
    if (this.isTreatmentQuery(lower)) {
      return { isQuestion: true, intent: "treatment_information", informationType: "general" };
    }
    return { isQuestion: false };
  }

  public static isWarrantyOrMaterialQuery(lower: string): boolean {
    return /\b(garanti|garantisi|garantili\s+mi|materyal|malzeme|straumann|marka|markalar|ömür\s+boyu|omur\s+boyu|warranty|guarantee|lifetime|material|brand|brands)\b/i.test(
      lower
    );
  }

  public static isParkingQuery(lower: string): boolean {
    return /\b(otopark|park\s+yeri|vale|parking|car\s+park)\b/i.test(lower);
  }
}
