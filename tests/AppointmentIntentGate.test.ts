import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  IntentRouter,
  ConversationStateEngine,
  evaluateAppointmentCollectionGate,
  detectExplicitBookingIntent,
  hasSchedulingCommitmentEntities,
} from "../lib/conversation";

/**
 * Regression suite for the production defect where an informational clinic
 * capability question ("Kolay gelsin kurumunuzda endodonti uzmanı var mı")
 * silently entered appointment collection and answered with a date prompt.
 *
 * The defect lived in the shared single-clinic chat route, which used entity
 * presence (entities.treatment) as an appointment-flow entry trigger.
 */

/**
 * Mirrors the appointment-entry decision made by app/api/public/chat/route.ts
 * for a fresh conversation (appointmentState === "IDLE").
 */
function routeAppointmentDecision(message: string, locale = "tr") {
  const intentResult = IntentRouter.classifyConversationIntent({
    message,
    currentState: "INITIAL",
    locale,
  });

  const gate = evaluateAppointmentCollectionGate({
    message,
    intent: intentResult.intent,
    isAppointmentFlowActive: false,
    entities: intentResult.entities,
  });

  if (!gate.allowed) {
    return { gate, intent: intentResult.intent, startsCollection: false, reply: undefined as string | undefined };
  }

  const missingSlots = ConversationStateEngine.getMissingSlots({
    treatment: intentResult.entities?.treatment,
    preferredDate: intentResult.entities?.preferredDate,
    preferredTime: intentResult.entities?.preferredTime,
    fullName: intentResult.entities?.fullName,
    phone: intentResult.entities?.phone,
    email: intentResult.entities?.email,
  });

  return {
    gate,
    intent: intentResult.intent,
    startsCollection: true,
    reply: ConversationStateEngine.generateNextSlotPrompt({}, missingSlots, locale),
  };
}

describe("Appointment collection entry gate", () => {
  describe("Informational clinic questions must not start appointment collection", () => {
    const informationalMessages: Array<[string, string]> = [
      ["Kolay gelsin kurumunuzda endodonti uzmanı var mı", "tr"],
      ["Kurumunuzda endodonti uzmanı var mı?", "tr"],
      ["Ortodontistiniz var mı?", "tr"],
      ["Kanal tedavisi yapıyor musunuz?", "tr"],
      ["İmplant konusunda hangi doktorunuz ilgileniyor?", "tr"],
      ["Çocuk diş hekiminiz var mı?", "tr"],
      ["Do you have an endodontist?", "en"],
      ["Do you provide root canal treatment?", "en"],
      ["Haben Sie einen Endodontologen?", "de"],
    ];

    it.each(informationalMessages)("does not start collection for %s", (message, locale) => {
      const decision = routeAppointmentDecision(message, locale);
      expect(decision.startsCollection).toBe(false);
      expect(decision.gate.mode).toBe("blocked");
      expect(decision.reply).toBeUndefined();
    });

    it("reproduces the exact production defect: treatment entity must not open the flow", () => {
      const message = "Kolay gelsin kurumunuzda endodonti uzmanı var mı";
      const intentResult = IntentRouter.classifyConversationIntent({
        message,
        currentState: "INITIAL",
        locale: "tr",
      });

      // The classifier was always correct; the treatment entity is still extracted.
      expect(intentResult.intent).toBe("doctor_information");
      expect(intentResult.entities?.treatment).toBe("root_canal");

      const decision = routeAppointmentDecision(message);
      expect(decision.startsCollection).toBe(false);
      expect(decision.gate.reason).toBe("information_seeking_intent:doctor_information");
    });

    it("keeps the informational question routed to the knowledge base", () => {
      const intentResult = IntentRouter.classifyConversationIntent({
        message: "Kolay gelsin kurumunuzda endodonti uzmanı var mı",
        currentState: "INITIAL",
        locale: "tr",
      });
      expect(intentResult.requiresKnowledgeBase).toBe(true);
    });
  });

  describe("Information + soft treatment interest", () => {
    it("answers the question instead of collecting appointment slots", () => {
      const decision = routeAppointmentDecision("Endodonti uzmanınız var mı? Kanal tedavisi düşünüyorum.");
      expect(decision.startsCollection).toBe(false);
      expect(decision.gate.mode).toBe("blocked");
    });

    it("treats an English capability + interest message as informational", () => {
      const decision = routeAppointmentDecision(
        "Do you have an endodontist? I am considering root canal treatment.",
        "en"
      );
      expect(decision.startsCollection).toBe(false);
    });
  });

  describe("Explicit booking intent must start appointment collection", () => {
    const bookingMessages: Array<[string, string]> = [
      ["Endodonti uzmanından randevu almak istiyorum.", "tr"],
      ["Yarın kanal tedavisi için randevu alabilir miyim?", "tr"],
      ["Randevu oluşturabilir misiniz?", "tr"],
      ["Do you have an appointment available with an endodontist tomorrow?", "en"],
      ["I would like to book an appointment for a dental implant", "en"],
      ["Ich möchte einen Termin vereinbaren", "de"],
      ["Je voudrais prendre un rendez-vous", "fr"],
    ];

    it.each(bookingMessages)("starts collection for %s", (message, locale) => {
      const decision = routeAppointmentDecision(message, locale);
      expect(decision.startsCollection).toBe(true);
      expect(decision.gate.mode).toBe("start");
    });

    it("asks for the treatment first when nothing has been collected yet", () => {
      const decision = routeAppointmentDecision("Randevu almak istiyorum");
      expect(decision.reply).toContain("Hangi tedavi veya işlem için randevu almak istersiniz?");
    });
  });

  describe("Boundary cases", () => {
    it("treats an explicit visit request as booking intent", () => {
      expect(routeAppointmentDecision("Endodonti için gelmek istiyorum.").startsCollection).toBe(true);
      expect(routeAppointmentDecision("Yarın gelebilir miyim?").startsCollection).toBe(true);
      expect(routeAppointmentDecision("Can I come tomorrow?", "en").startsCollection).toBe(true);
      expect(routeAppointmentDecision("Saat ayarlayabilir miyiz?").startsCollection).toBe(true);
    });

    it("treats an availability request as booking intent", () => {
      expect(routeAppointmentDecision("Kanal tedavisi için müsaitliğiniz var mı?").startsCollection).toBe(true);
      expect(routeAppointmentDecision("Müsait randevunuz var mı?").startsCollection).toBe(true);
    });

    it("treats a request to meet a doctor as booking intent", () => {
      expect(routeAppointmentDecision("Endodonti doktoruyla görüşmek istiyorum.").startsCollection).toBe(true);
    });

    it("does not confuse treatment availability with schedule availability", () => {
      expect(detectExplicitBookingIntent("Is Invisalign available at your clinic?").hasBookingIntent).toBe(false);
      expect(detectExplicitBookingIntent("Şeffaf plak tedavisi mevcut mu?").hasBookingIntent).toBe(false);
    });

    it("does not treat directions questions as visit requests", () => {
      expect(detectExplicitBookingIntent("Kliniğinize nasıl gelebilirim?").hasBookingIntent).toBe(false);
      expect(detectExplicitBookingIntent("How can I get to the clinic?").hasBookingIntent).toBe(false);
    });
  });

  describe("Gate contract", () => {
    it("never treats a treatment mention as a scheduling commitment", () => {
      expect(hasSchedulingCommitmentEntities({ treatment: "root_canal" })).toBe(false);
      expect(hasSchedulingCommitmentEntities({ treatment: "implant", preferredDate: "2026-08-20" })).toBe(true);
    });

    it("does not treat a bare name as a scheduling commitment", () => {
      expect(hasSchedulingCommitmentEntities({ fullName: "Ahmet Yılmaz" })).toBe(false);
      expect(hasSchedulingCommitmentEntities({ fullName: "Ahmet Yılmaz", phone: "+905551112233" })).toBe(true);
    });

    it("always continues an already active appointment flow", () => {
      const gate = evaluateAppointmentCollectionGate({
        message: "Kurumunuzda endodonti uzmanı var mı?",
        intent: "doctor_information",
        isAppointmentFlowActive: true,
        entities: { treatment: "root_canal" },
      });
      expect(gate.allowed).toBe(true);
      expect(gate.mode).toBe("continue");
    });

    it("lets volunteered contact and scheduling details start the flow", () => {
      const gate = evaluateAppointmentCollectionGate({
        message: "Ahmet Yılmaz, 0555 111 22 33, ahmet@example.com",
        intent: "unknown",
        isAppointmentFlowActive: false,
        entities: { fullName: "Ahmet Yılmaz", phone: "+905551112233", email: "ahmet@example.com" },
      });
      expect(gate.allowed).toBe(true);
      expect(gate.reason).toBe("scheduling_commitment_entities");
    });

    it("exposes an inspectable reason for every decision", () => {
      const blocked = evaluateAppointmentCollectionGate({
        message: "İmplant yapıyor musunuz?",
        intent: "treatment_information",
        isAppointmentFlowActive: false,
        entities: { treatment: "implant" },
      });
      expect(blocked.allowed).toBe(false);
      expect(blocked.reason).toBe("information_seeking_intent:treatment_information");
    });
  });

  describe("Shared single-clinic chat route wiring", () => {
    const routeSource = readFileSync(join(process.cwd(), "app/api/public/chat/route.ts"), "utf8");

    it("routes appointment entry through the shared gate", () => {
      expect(routeSource).toContain("evaluateAppointmentCollectionGate");
      expect(routeSource).toContain("} else if (appointmentGate.allowed) {");
    });

    it("no longer uses entity presence as an appointment entry trigger", () => {
      expect(routeSource).not.toMatch(/const hasApptEntities = Boolean\(/);
    });

    it("contains no clinic-specific appointment logic", () => {
      expect(routeSource).not.toMatch(/Diş Akademisi/i);
    });
  });

  describe("Cross-clinic behavior (no clinic-specific logic)", () => {
    it("applies identically regardless of clinic or treatment vertical", () => {
      const dental = routeAppointmentDecision("Ortodontistiniz var mı?");
      const aesthetic = routeAppointmentDecision("Saç ekimi yapıyor musunuz?");
      const hairEn = routeAppointmentDecision("Do you perform hair transplant?", "en");

      for (const decision of [dental, aesthetic, hairEn]) {
        expect(decision.startsCollection).toBe(false);
      }
    });
  });
});
