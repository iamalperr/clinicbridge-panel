import { describe, it, expect } from "vitest";
import {
  PendingActionManager,
  IntentRouter,
  ConversationStateEngine,
  ConversationContext,
  IntentClassificationResult
} from "../lib/conversation";

describe("PendingActionManager & Duplicate Appointment Prevention", () => {
  describe("PendingAction creation & detection", () => {
    it("creates a well-formed pending action", () => {
      const action = PendingActionManager.createPendingAction(
        "submit_appointment",
        { patientName: "Ahmet Yılmaz", patientPhone: "05321112233" },
        undefined,
        "Randevu onay özeti"
      );

      expect(action.type).toBe("submit_appointment");
      expect(action.payload.patientName).toBe("Ahmet Yılmaz");
      expect(action.description).toBe("Randevu onay özeti");
      expect(action.createdAt).toBeDefined();
      expect(action.status).toBe("pending");
    });

    it("detects doctor information offers from assistant replies", () => {
      const replyTr1 = "Klinik ekibimiz başvurunuzu inceledikten sonra hekimimizi belirleyecektir. Hekimlerimiz hakkında daha fazla bilgi ister misiniz?";
      const replyTr2 = "Doktorlarımız ve uzmanlık alanları hakkında bilgi almak ister misiniz?";
      const replyEn = "Would you like to know more about our doctors?";
      const replyDe = "Möchten Sie mehr über unsere Ärzte erfahren?";

      expect(PendingActionManager.detectOfferedAction(replyTr1)).toBe("show_doctor_information");
      expect(PendingActionManager.detectOfferedAction(replyTr2)).toBe("show_doctor_information");
      expect(PendingActionManager.detectOfferedAction(replyEn)).toBe("show_doctor_information");
      expect(PendingActionManager.detectOfferedAction(replyDe)).toBe("show_doctor_information");
    });

    it("detects service / treatment offers from assistant replies", () => {
      const replyTr = "İmplant tedavisi süreçleri ve fiyatlarımız hakkında detaylı bilgi ister misiniz?";
      const replyEn = "Would you like more details about our dental services?";

      expect(PendingActionManager.detectOfferedAction(replyTr)).toBe("show_service_information");
      expect(PendingActionManager.detectOfferedAction(replyEn)).toBe("show_service_information");
    });

    it("detects contact / phone call offers from assistant replies", () => {
      const replyTr = "Dilerseniz sizi telefonla aramamızı ister misiniz?";
      const replyEn = "Would you like our clinic team to call you directly?";

      expect(PendingActionManager.detectOfferedAction(replyTr)).toBe("request_phone_contact");
      expect(PendingActionManager.detectOfferedAction(replyEn)).toBe("request_phone_contact");
    });
  });

  describe("isAppointmentSubmissionPermitted Guards", () => {
    it("allows submission when state is AWAITING_CONFIRMATION with submit_appointment action", () => {
      const pendingAction = PendingActionManager.createPendingAction("submit_appointment", { patientName: "Test" });
      const check = PendingActionManager.isAppointmentSubmissionPermitted({
        appointmentState: "AWAITING_CONFIRMATION",
        appointmentSubmitted: false,
        pendingAction
      });

      expect(check.allowed).toBe(true);
      expect(check.reason).toBe("appointment_submission_permitted");
    });

    it("allows submission when state is AWAITING_CONFIRMATION without explicit pendingAction (backward compatibility)", () => {
      const check = PendingActionManager.isAppointmentSubmissionPermitted({
        appointmentState: "AWAITING_CONFIRMATION",
        appointmentSubmitted: false
      });

      expect(check.allowed).toBe(true);
    });

    it("strictly BLOCKS submission when appointment is already marked submitted", () => {
      const check = PendingActionManager.isAppointmentSubmissionPermitted({
        appointmentState: "APPOINTMENT_SUBMITTED",
        appointmentSubmitted: true,
        appointmentId: "appt_12345"
      });

      expect(check.allowed).toBe(false);
      expect(check.reason).toBe("appointment_already_submitted_flag");
    });

    it("strictly BLOCKS submission when an existing appointmentId is present", () => {
      const check = PendingActionManager.isAppointmentSubmissionPermitted({
        appointmentState: "AWAITING_CONFIRMATION", // even if state lingered
        appointmentSubmitted: false,
        appointmentId: "appt_real_id_999"
      });

      expect(check.allowed).toBe(false);
      expect(check.reason).toBe("appointment_id_already_exists");
    });

    it("strictly BLOCKS submission when pending action belongs to another flow (e.g. show_doctor_information)", () => {
      const doctorAction = PendingActionManager.createPendingAction("show_doctor_information");
      const check = PendingActionManager.isAppointmentSubmissionPermitted({
        appointmentState: "APPOINTMENT_SUBMITTED",
        appointmentSubmitted: true,
        pendingAction: doctorAction
      });

      expect(check.allowed).toBe(false);
      expect(check.reason).toBe("appointment_already_submitted_flag");
    });

    it("strictly BLOCKS submission when pending action is show_doctor_information even if state is IDLE", () => {
      const doctorAction = PendingActionManager.createPendingAction("show_doctor_information");
      const check = PendingActionManager.isAppointmentSubmissionPermitted({
        appointmentState: "IDLE",
        appointmentSubmitted: false,
        pendingAction: doctorAction
      });

      expect(check.allowed).toBe(false);
      expect(check.reason).toBe("pending_action_mismatch_show_doctor_information");
    });
  });

  describe("Intent Routing with Pending Actions & Post-Submission", () => {
    it("routes 'evet' to doctor_information when pendingAction is show_doctor_information", () => {
      const doctorAction = PendingActionManager.createPendingAction("show_doctor_information");
      const result = IntentRouter.classifyConversationIntent({
        message: "evet",
        currentState: "APPOINTMENT_SUBMITTED",
        appointmentSubmitted: true,
        pendingAction: doctorAction,
        conversationHistory: [
          { role: "user", content: "Hangi doktor ilgilenecek?" },
          { role: "assistant", content: "Klinik ekibimiz başvurunuzu inceledikten sonra uzman hekimimizi belirleyecektir. Hekimlerimiz hakkında daha fazla bilgi almak ister misiniz?" }
        ]
      });

      expect(result.intent).toBe("doctor_information");
    });

    it("routes 'evet' to appointment_confirmation when in AWAITING_CONFIRMATION state", () => {
      const submitAction = PendingActionManager.createPendingAction("submit_appointment");
      const result = IntentRouter.classifyConversationIntent({
        message: "evet onaylıyorum",
        currentState: "APPOINTMENT_REVIEW",
        expectedSlot: "confirmation",
        pendingAction: submitAction,
        appointmentSubmitted: false
      });

      expect(result.intent).toBe("appointment_confirmation");
    });

    it("does NOT classify 'evet' as appointment_confirmation if appointment was already submitted", () => {
      const result = IntentRouter.classifyConversationIntent({
        message: "evet",
        currentState: "APPOINTMENT_SUBMITTED",
        appointmentSubmitted: true,
        conversationHistory: [
          { role: "assistant", content: "Teşekkürler, randevu talebiniz iletildi." },
          { role: "user", content: "Kliniğin otoparkı var mı?" },
          { role: "assistant", content: "Evet, misafirlerimiz için ücretsiz otoparkımız mevcuttur. Başka bir konuda yardımcı olabilir miyim?" }
        ]
      });

      expect(result.intent).not.toBe("appointment_confirmation");
    });
  });

  describe("Full End-to-End State Machine Simulation", () => {
    it("handles complete appointment flow followed by doctor info query without double booking", () => {
      // Step 1: User completes appointment details
      const context: ConversationContext = {
        clinicId: "clinic_123",
        conversationId: "conv_abc",
        channel: "web_widget",
        locale: "tr",
        currentState: "APPOINTMENT_COLLECTION",
        slots: {
          fullName: "Kemal Demir",
          preferredDate: "2026-08-10",
          preferredTime: "14:00",
          treatment: "İmplant Muayenesi",
          email: "kemal@example.com"
        },
        history: []
      };

      const intentResult: IntentClassificationResult = {
        intent: "unknown",
        entities: {
          phone: "0532 999 88 77"
        },
        confidence: 0.95,
        requiresKnowledgeBase: false,
        shouldContinueActiveFlow: false
      };

      const step1 = ConversationStateEngine.processTransition(context, intentResult);

      expect(step1.nextState).toBe("APPOINTMENT_REVIEW");
      expect(step1.updatedSlots.phone).toBe("0532 999 88 77");

      // Step 2: System sets submit_appointment pending action
      let pendingAction: any = PendingActionManager.createPendingAction("submit_appointment", step1.updatedSlots);
      
      // Step 3: User confirms appointment
      const canSubmit = PendingActionManager.isAppointmentSubmissionPermitted({
        appointmentState: step1.nextState,
        appointmentSubmitted: false,
        pendingAction
      });
      expect(canSubmit.allowed).toBe(true);

      // Simulate successful submission
      const state = "APPOINTMENT_SUBMITTED";
      const appointmentId = "appt_mock_7788";
      const appointmentSubmitted = true;
      pendingAction = null; // cleared upon submission

      // Step 4: User asks a follow-up question: "Hangi hekim bakacak?"
      const followUpIntent = IntentRouter.classifyConversationIntent({
        message: "Hangi hekim bakacak?",
        currentState: "APPOINTMENT_SUBMITTED",
        appointmentSubmitted: true
      });
      expect(followUpIntent.intent).toBe("doctor_information");

      // Step 5: Assistant offers doctor details
      const assistantReply = "Klinik ekibimiz başvurunuzu inceledikten sonra uzman hekimimizi belirleyecektir. Hekimlerimiz hakkında daha fazla bilgi ister misiniz?";
      const detectedOffer = PendingActionManager.detectOfferedAction(assistantReply);
      expect(detectedOffer).toBe("show_doctor_information");
      
      pendingAction = PendingActionManager.createPendingAction(detectedOffer!);

      // Step 6: User answers "evet" to doctor offer
      const secondSubmitCheck = PendingActionManager.isAppointmentSubmissionPermitted({
        appointmentState: state,
        appointmentSubmitted,
        appointmentId,
        pendingAction
      });
      // MUST BE BLOCKED!
      expect(secondSubmitCheck.allowed).toBe(false);
      expect(secondSubmitCheck.reason).toBe("appointment_already_submitted_flag");

      // IntentRouter must route to doctor_information, NOT appointment_confirmation
      const secondConfirmIntent = IntentRouter.classifyConversationIntent({
        message: "evet",
        currentState: "APPOINTMENT_SUBMITTED",
        appointmentSubmitted: true,
        pendingAction
      });
      expect(secondConfirmIntent.intent).toBe("doctor_information");
    });
  });
});
