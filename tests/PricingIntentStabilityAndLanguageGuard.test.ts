import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  IntentRouter,
  ConversationStateEngine,
  evaluateAppointmentCollectionGate,
  resolveConversationLocale,
  resolveConversationLocaleWithMeta,
  detectTextLanguage,
} from "../lib/conversation";

/**
 * Stability suite for the intermittent production defect where:
 *
 *   "Merhaba Plak temizleme - diş beyazlatma için fiyat öğrenebilir miyim"
 *
 * entered appointment collection with an English date prompt, while a later
 * pricing-only turn ("Fiyat öğrenebilir miyö") correctly returned pricing.
 *
 * Root causes (verified):
 * 1. Entity-triggered appointment entry (treatment mention) — gated.
 * 2. Widget browser requestLanguage=en overriding Turkish message language.
 * 3. LLM [FLOW_ACTIVE] could still open collection without booking intent.
 */

function simulateIdleTurn(message: string, requestLanguage?: string) {
  const intentResult = IntentRouter.classifyConversationIntent({
    message,
    currentState: "INITIAL",
    locale: "tr",
  });
  const localeMeta = resolveConversationLocaleWithMeta({
    requestLanguage,
    persistedLocale: undefined,
    currentMessage: message,
    history: [],
    clinicDefaultLocale: "tr",
  });
  const gate = evaluateAppointmentCollectionGate({
    message,
    intent: intentResult.intent,
    isAppointmentFlowActive: false,
    entities: intentResult.entities,
  });

  let appointmentReply: string | undefined;
  if (gate.allowed) {
    const missing = ConversationStateEngine.getMissingSlots({
      treatment: intentResult.entities?.treatment,
      preferredDate: intentResult.entities?.preferredDate,
      preferredTime: intentResult.entities?.preferredTime,
      fullName: intentResult.entities?.fullName,
      phone: intentResult.entities?.phone,
      email: intentResult.entities?.email,
    });
    appointmentReply = ConversationStateEngine.generateNextSlotPrompt(
      {
        treatment: intentResult.entities?.treatment,
      },
      missing,
      localeMeta.locale
    );
  }

  return {
    intent: intentResult.intent,
    entities: intentResult.entities,
    gate,
    locale: localeMeta.locale,
    localeReason: localeMeta.reason,
    startsCollection: gate.allowed,
    appointmentReply,
    requiresPricingData: intentResult.requiresPricingData,
    requiresKnowledgeBase: intentResult.requiresKnowledgeBase,
  };
}

describe("Pricing intent stability (intermittent appointment drift)", () => {
  const productionMessage =
    "Merhaba Plak temizleme - diş beyazlatma için fiyat öğrenebilir miyim";

  describe("Repeated identical-input stability", () => {
    it("classifies the production message as pricing 30/30 times", () => {
      const counts: Record<string, number> = {};
      for (let i = 0; i < 30; i++) {
        const turn = simulateIdleTurn(productionMessage, "en");
        const key = `${turn.intent}|collection=${turn.startsCollection}|locale=${turn.locale}`;
        counts[key] = (counts[key] || 0) + 1;
      }
      expect(counts).toEqual({
        "pricing_request|collection=false|locale=tr": 30,
      });
    });

    it("never emits the English appointment date prompt for the production message", () => {
      for (let i = 0; i < 10; i++) {
        const turn = simulateIdleTurn(productionMessage, "en");
        expect(turn.startsCollection).toBe(false);
        expect(turn.appointmentReply).toBeUndefined();
        expect(turn.locale).toBe("tr");
      }
    });
  });

  describe("Pricing questions must not enter appointment collection", () => {
    const pricingMessages = [
      productionMessage,
      "Diş beyazlatma fiyatı nedir?",
      "Plak temizliği ne kadar?",
      "İmplant fiyatlarını öğrenebilir miyim?",
      "Do you have a price for teeth whitening?",
      "Fiyat öğrenebilir miyö",
    ];

    it.each(pricingMessages)("blocks appointment for: %s", (message) => {
      const turn = simulateIdleTurn(message, "en");
      expect(turn.startsCollection).toBe(false);
      expect(turn.gate.mode).toBe("blocked");
    });

    it("keeps pricing retrieval flags for the production message", () => {
      const turn = simulateIdleTurn(productionMessage, "en");
      expect(turn.intent).toBe("pricing_request");
      expect(turn.requiresPricingData).toBe(true);
      expect(turn.requiresKnowledgeBase).toBe(true);
      // Treatment may still be extracted as context — that alone must not open booking.
      expect(turn.entities?.treatment).toBe("teeth_whitening");
    });
  });

  describe("Legitimate appointment requests still start collection", () => {
    const bookingMessages: Array<[string, string]> = [
      ["Diş beyazlatma için randevu almak istiyorum.", "tr"],
      ["Yarın diş temizliği için gelebilir miyim?", "tr"],
      ["Diş beyazlatma için yarın saat 14:00 uygun mu?", "tr"],
      ["Can I book a teeth whitening appointment?", "en"],
    ];

    it.each(bookingMessages)("starts collection for %s", (message, expectedLocale) => {
      const turn = simulateIdleTurn(message, expectedLocale === "en" ? "tr" : "en");
      expect(turn.startsCollection).toBe(true);
      expect(turn.locale).toBe(expectedLocale);
    });
  });

  describe("Mixed pricing + appointment intent", () => {
    it("starts appointment when booking language is present alongside pricing", () => {
      const turn = simulateIdleTurn(
        "Diş beyazlatma fiyatını öğrenebilir miyim, sonra randevu almak istiyorum."
      );
      // Booking lexicon wins at IntentRouter Step 5 before informational pricing.
      expect(turn.intent).toBe("appointment_start");
      expect(turn.startsCollection).toBe(true);
      expect(turn.entities?.treatment).toBe("teeth_whitening");
    });

    it("starts appointment for pricing + visit request", () => {
      const turn = simulateIdleTurn("Diş beyazlatma ne kadar, yarın da gelebilir miyim?");
      expect(turn.startsCollection).toBe(true);
    });
  });

  describe("Conversation language guard", () => {
    it("keeps Turkish for Turkish pricing even when widget language is English", () => {
      const meta = resolveConversationLocaleWithMeta({
        requestLanguage: "en",
        currentMessage: "Diş beyazlatma fiyatını öğrenebilir miyim?",
        clinicDefaultLocale: "en",
      });
      expect(meta.locale).toBe("tr");
      expect(meta.reason).toMatch(/message_detected:tr|message_overrides_persisted/);
    });

    it("keeps English for English pricing even when clinic default is Turkish", () => {
      expect(
        resolveConversationLocale({
          requestLanguage: "tr",
          currentMessage: "How much is teeth whitening?",
          clinicDefaultLocale: "tr",
        })
      ).toBe("en");
    });

    it("honors an explicit English switch embedded in a Turkish question", () => {
      expect(
        resolveConversationLocale({
          requestLanguage: "tr",
          persistedLocale: "tr",
          currentMessage: "Diş beyazlatma fiyatı nedir? Please answer in English.",
        })
      ).toBe("en");
    });

    it("detects the production message as Turkish", () => {
      expect(detectTextLanguage(productionMessage)).toBe("tr");
    });
  });

  describe("Shared chat route wiring / observability", () => {
    const routeSource = readFileSync(
      join(process.cwd(), "app/api/public/chat/route.ts"),
      "utf8"
    );

    it("uses the meta locale resolver and logs the reason", () => {
      expect(routeSource).toContain("resolveConversationLocaleWithMeta");
      expect(routeSource).toContain("localeReason");
      expect(routeSource).toContain("APPOINTMENT_GATE_BLOCKED");
      expect(routeSource).toContain("FLOW_ACTIVE_IGNORED");
    });

    it("does not let LLM FLOW_ACTIVE open collection without the gate", () => {
      expect(routeSource).toContain("FLOW_ACTIVE_HONORED");
      expect(routeSource).toMatch(/flowActiveGate\.allowed/);
    });

    it("binds activeLang to conversationLocale after resolution", () => {
      expect(routeSource).toContain("activeLang = conversationLocale");
    });
  });
});
