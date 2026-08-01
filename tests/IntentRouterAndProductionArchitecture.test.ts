import { describe, it, expect } from "vitest";
import {
  IntentRouter,
  ConversationStateEngine,
  SlotExtractor,
  PendingActionManager,
  buildAppointmentReviewMessage,
  formatMultilingualPrompt,
  type ConversationContext,
  type IntentClassificationResult
} from "../lib/conversation";

describe("IntentRouter & Production Architecture Test Suite", () => {
  describe("1. Multilingual Intent Classification", () => {
    it("classifies appointment_start in Turkish", () => {
      const result = IntentRouter.classifyConversationIntent({
        message: "Merhaba, implant tedavisi için yarın saat 14:00'e randevu almak istiyorum. Adım Ahmet Yılmaz",
        currentState: "INITIAL",
        locale: "tr"
      });

      expect(result.intent).toBe("appointment_start");
      expect(result.entities?.treatment).toBe("implant");
      expect(result.entities?.preferredTime).toBe("14:00");
      expect(result.entities?.fullName).toBe("Ahmet Yılmaz");
    });

    it("classifies appointment_start in English", () => {
      const result = IntentRouter.classifyConversationIntent({
        message: "Hi, I would like to book a dental implant appointment for tomorrow at 2:00 PM. My name is John Doe",
        currentState: "INITIAL",
        locale: "en"
      });

      expect(result.intent).toBe("appointment_start");
      expect(result.entities?.treatment).toBe("implant");
      expect(result.entities?.fullName).toBe("John Doe");
      expect(result.entities?.preferredTime).toBe("14:00");
    });

    it("classifies appointment_start in German", () => {
      const result = IntentRouter.classifyConversationIntent({
        message: "Hallo, ich möchte einen Termin für Zahnimplantate vereinbaren",
        currentState: "INITIAL",
        locale: "de"
      });

      expect(result.intent).toBe("appointment_start");
      expect(result.entities?.treatment).toBe("implant");
    });

    it("classifies appointment_start in French", () => {
      const result = IntentRouter.classifyConversationIntent({
        message: "Bonjour, je voudrais prendre un rendez-vous pour un implant dentaire",
        currentState: "INITIAL",
        locale: "fr"
      });

      expect(result.intent).toBe("appointment_start");
      expect(result.entities?.treatment).toBe("implant");
    });

    it("classifies appointment_start in Arabic", () => {
      const result = IntentRouter.classifyConversationIntent({
        message: "مرحبا، أريد حجز موعد لزراعة الأسنان",
        currentState: "INITIAL",
        locale: "ar"
      });

      expect(result.intent).toBe("appointment_start");
      expect(result.entities?.treatment).toBe("implant");
    });
  });

  describe("2. Language Switching Mid-Flow", () => {
    it("detects language switch to English", () => {
      const result = IntentRouter.classifyConversationIntent({
        message: "Can we continue in English please?",
        currentState: "APPOINTMENT_COLLECTION",
        locale: "tr"
      });

      expect(result.intent).toBe("language_switch");
      expect(result.targetLocale).toBe("en");
    });

    it("detects language switch to German", () => {
      const result = IntentRouter.classifyConversationIntent({
        message: "Können wir bitte auf Deutsch sprechen?",
        currentState: "APPOINTMENT_COLLECTION",
        locale: "en"
      });

      expect(result.intent).toBe("language_switch");
      expect(result.targetLocale).toBe("de");
    });

    it("detects language switch to Turkish", () => {
      const result = IntentRouter.classifyConversationIntent({
        message: "Türkçe devam edebilir miyiz?",
        currentState: "APPOINTMENT_COLLECTION",
        locale: "en"
      });

      expect(result.intent).toBe("language_switch");
      expect(result.targetLocale).toBe("tr");
    });
  });

  describe("3. Mid-Flow Interruption Handling (Preserving State & Zero Hallucination)", () => {
    it("identifies price question during phone collection as an interruption", () => {
      const result = IntentRouter.classifyConversationIntent({
        message: "İmplant fiyatı ne kadar?",
        currentState: "APPOINTMENT_COLLECTION",
        expectedSlot: "phone",
        locale: "tr"
      });

      expect(result.isInterruption).toBe(true);
      expect(result.intent).toBe("pricing_request");
      expect(result.shouldContinueActiveFlow).toBe(true);
    });

    it("identifies doctor inquiry during email collection as an interruption", () => {
      const result = IntentRouter.classifyConversationIntent({
        message: "Who is the specialist for dental implants at your clinic?",
        currentState: "APPOINTMENT_COLLECTION",
        expectedSlot: "email",
        locale: "en"
      });

      expect(result.isInterruption).toBe(true);
      expect(result.intent).toBe("doctor_information");
      expect(result.shouldContinueActiveFlow).toBe(true);
    });

    it("identifies working hours question during appointment review as an interruption", () => {
      const result = IntentRouter.classifyConversationIntent({
        message: "Kliniğiniz hafta sonu açık mı?",
        currentState: "APPOINTMENT_REVIEW",
        expectedSlot: "confirmation",
        locale: "tr"
      });

      expect(result.isInterruption).toBe(true);
      expect(result.intent).toBe("working_hours_request");
      expect(result.shouldContinueActiveFlow).toBe(true);
    });
  });

  describe("4. Sequential 6-Slot Collection Engine", () => {
    it("identifies all missing slots when nothing is provided", () => {
      const missing = ConversationStateEngine.getMissingSlots({});
      expect(missing).toEqual(["treatment", "preferredDate", "preferredTime", "fullName", "phone", "email"]);
    });

    it("identifies missing slots when treatment and date are provided", () => {
      const missing = ConversationStateEngine.getMissingSlots({
        treatment: "İmplant",
        preferredDate: "2026-08-05"
      });
      expect(missing).toEqual(["preferredTime", "fullName", "phone", "email"]);
    });

    it("generates next prompt for treatment in Turkish", () => {
      const prompt = ConversationStateEngine.generateNextSlotPrompt({}, ["treatment"], "tr");
      expect(prompt).toContain("Hangi tedavi");
    });

    it("generates next prompt for date in English", () => {
      const prompt = ConversationStateEngine.generateNextSlotPrompt({ treatment: "Dental Implant" }, ["preferredDate"], "en");
      expect(prompt).toContain("Which date would you prefer");
    });

    it("generates next prompt for time in German", () => {
      const prompt = ConversationStateEngine.generateNextSlotPrompt({ treatment: "Implantat", preferredDate: "2026-08-05" }, ["preferredTime"], "de");
      expect(prompt).toContain("Uhrzeit");
    });

    it("generates next prompt for name with treatment context in Turkish", () => {
      const prompt = ConversationStateEngine.generateNextSlotPrompt(
        { treatment: "Zirkonyum Kaplama", preferredDate: "2026-08-05", preferredTime: "10:00" },
        ["fullName"],
        "tr"
      );
      expect(prompt).toContain("adınızı ve soyadınızı");
    });

    it("generates next prompt for phone in English", () => {
      const prompt = ConversationStateEngine.generateNextSlotPrompt(
        { treatment: "Dental Implant", preferredDate: "2026-08-05", preferredTime: "10:00", fullName: "John Doe" },
        ["phone"],
        "en"
      );
      expect(prompt).toContain("phone number");
    });

    it("generates next prompt for email in Turkish", () => {
      const prompt = ConversationStateEngine.generateNextSlotPrompt(
        { treatment: "İmplant", preferredDate: "2026-08-05", preferredTime: "10:00", fullName: "Ali Veli", phone: "05551234567" },
        ["email"],
        "tr"
      );
      expect(prompt).toContain("e-posta");
    });
  });

  describe("5. SlotExtractor Parsing & Sanitization", () => {
    it("extracts phone numbers accurately from messy sentences", () => {
      const phone1 = SlotExtractor.parsePhone("Telefon numaram +90 532 123 45 67, arayabilirsiniz.");
      expect(phone1?.replace(/\s+/g, "")).toBe("+905321234567");

      const phone2 = SlotExtractor.parsePhone("0532 111 2233");
      expect(phone2?.replace(/\s+/g, "")).toBe("+905321112233");

      const phone3 = SlotExtractor.parsePhone("No phone here!");
      expect(phone3).toBeNull();
    });

    it("extracts emails accurately without trailing punctuation", () => {
      const email1 = SlotExtractor.parseEmail("Bana test.user@clinicbridge.com adresinden ulaşabilirsiniz.");
      expect(email1).toBe("test.user@clinicbridge.com");

      const email2 = SlotExtractor.parseEmail("my-email_123@example.co.uk!");
      expect(email2).toBe("my-email_123@example.co.uk");

      const email3 = SlotExtractor.parseEmail("invalid-email@com");
      expect(email3).toBeNull();
    });

    it("extracts full names accurately while rejecting single words or commands", () => {
      const name1 = SlotExtractor.parseName("Adım Kemal Sunal");
      expect(name1?.fullName).toBe("Kemal Sunal");

      const name2 = SlotExtractor.parseName("My name is Sarah Connor");
      expect(name2?.fullName).toBe("Sarah Connor");

      const name3 = SlotExtractor.parseName("evet");
      expect(name3).toBeNull();

      const name4 = SlotExtractor.parseName("randevu almak istiyorum");
      expect(name4).toBeNull();
    });
  });

  describe("6. Complete End-to-End State Machine Transitions", () => {
    it("transitions sequentially from IDLE to APPOINTMENT_REVIEW when all 6 slots are satisfied", () => {
      const context: ConversationContext = {
        clinicId: "clinic_999",
        conversationId: "conv_test",
        channel: "web_widget",
        locale: "tr",
        currentState: "INITIAL",
        slots: {},
        history: []
      };

      // Step 1: User specifies treatment, date, and time
      const step1 = ConversationStateEngine.processTransition(context, {
        intent: "appointment_start",
        entities: {
          treatment: "Diş Beyazlatma",
          preferredDate: "2026-08-12",
          preferredTime: "11:00"
        },
        confidence: 0.95,
        requiresKnowledgeBase: false,
        shouldContinueActiveFlow: true
      });

      expect(step1.nextState).toBe("APPOINTMENT_COLLECTION");
      expect(ConversationStateEngine.getMissingSlots(step1.updatedSlots)).toEqual(["fullName", "phone", "email"]);

      // Step 2: User provides name
      context.currentState = step1.nextState;
      context.slots = step1.updatedSlots;
      const step2 = ConversationStateEngine.processTransition(context, {
        intent: "unknown",
        entities: { fullName: "Zeynep Kaya" },
        confidence: 0.95,
        requiresKnowledgeBase: false,
        shouldContinueActiveFlow: true
      });

      expect(step2.nextState).toBe("APPOINTMENT_COLLECTION");
      expect(ConversationStateEngine.getMissingSlots(step2.updatedSlots)).toEqual(["phone", "email"]);

      // Step 3: User provides phone
      context.currentState = step2.nextState;
      context.slots = step2.updatedSlots;
      const step3 = ConversationStateEngine.processTransition(context, {
        intent: "unknown",
        entities: { phone: "0544 333 22 11" },
        confidence: 0.95,
        requiresKnowledgeBase: false,
        shouldContinueActiveFlow: true
      });

      expect(step3.nextState).toBe("APPOINTMENT_COLLECTION");
      expect(ConversationStateEngine.getMissingSlots(step3.updatedSlots)).toEqual(["email"]);

      // Step 4: User provides email -> all 6 satisfied!
      context.currentState = step3.nextState;
      context.slots = step3.updatedSlots;
      const step4 = ConversationStateEngine.processTransition(context, {
        intent: "unknown",
        entities: { email: "zeynep@example.com" },
        confidence: 0.95,
        requiresKnowledgeBase: false,
        shouldContinueActiveFlow: true
      });

      expect(step4.nextState).toBe("APPOINTMENT_REVIEW");
      expect(ConversationStateEngine.getMissingSlots(step4.updatedSlots)).toEqual([]);
      expect(step4.updatedSlots).toEqual({
        treatment: "Diş Beyazlatma",
        preferredDate: "2026-08-12",
        preferredTime: "11:00",
        fullName: "Zeynep Kaya",
        phone: "0544 333 22 11",
        email: "zeynep@example.com"
      });
    });
  });

  describe("7. Anti-Duplicate & Anti-Fake Booking Guarantees", () => {
    it("strictly blocks submission when appointment is already submitted", () => {
      const check = PendingActionManager.isAppointmentSubmissionPermitted({
        appointmentState: "APPOINTMENT_SUBMITTED",
        appointmentSubmitted: true,
        appointmentId: "appt_12345"
      });

      expect(check.allowed).toBe(false);
      expect(check.reason).toBe("appointment_already_submitted_flag");
    });

    it("strictly blocks submission when confirmation resolution has no active pending action in IDLE state", () => {
      const resolution = PendingActionManager.resolvePendingConfirmation({
        message: "evet",
        conversationState: "INITIAL",
        appointmentSubmitted: false
      });

      expect(resolution.shouldExecute).toBe(false);
      expect(resolution.reason).toBe("no_active_pending_action");
    });

    it("strictly blocks submission when pending action is for doctor information", () => {
      const check = PendingActionManager.isAppointmentSubmissionPermitted({
        appointmentState: "AWAITING_CONFIRMATION",
        appointmentSubmitted: false,
        pendingAction: PendingActionManager.createPendingAction("show_doctor_information", { doctorName: "Dr. Aylin" })
      });

      expect(check.allowed).toBe(false);
      expect(check.reason).toBe("pending_action_mismatch_show_doctor_information");
    });
  });
});
