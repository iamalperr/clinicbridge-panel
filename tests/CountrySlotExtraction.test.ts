import { describe, it, expect } from "vitest";
import { SlotExtractor } from "../lib/conversation/slotExtractor";
import { shouldAllowLlmAssistForIntakeGate } from "../lib/agency/feelinhealthyConversationMachine";

describe("patient country extraction (FeelinHealthy intake)", () => {
  it("accepts Turkish İspanya despite İ→i̇ lowercasing", () => {
    const res = SlotExtractor.extractSlots("İspanya", {}, "tr", "Europe/Istanbul");
    expect(res.extracted.patientCountry).toBe("İspanya");
  });

  it("maps Madrid in a contact line to İspanya", () => {
    const res = SlotExtractor.extractSlots(
      "barisculha@gmail.com, 5455364392, Madrid",
      {},
      "tr",
      "Europe/Istanbul"
    );
    expect(res.extracted.email).toMatch(/barisculha@gmail.com/i);
    expect(res.extracted.phone).toBeTruthy();
    expect(res.extracted.patientCountry).toBe("İspanya");
  });

  it("accepts bare Madrid as Spain", () => {
    const res = SlotExtractor.extractSlots("Madrid", {}, "tr", "Europe/Istanbul");
    expect(res.extracted.patientCountry).toBe("İspanya");
  });

  it("accepts freeform country when patientCountry is expected", () => {
    const res = SlotExtractor.extractSlots(
      "Hırvatistan",
      {},
      "tr",
      "Europe/Istanbul",
      "patientCountry"
    );
    expect(res.extracted.patientCountry).toMatch(/hırvatistan|hirvatistan/i);
  });

  it("still recognizes Almanya / Germany", () => {
    expect(
      SlotExtractor.extractSlots("Almanya", {}, "tr").extracted.patientCountry
    ).toBe("Almanya");
    expect(
      SlotExtractor.extractSlots("Germany", {}, "en").extracted.patientCountry
    ).toBe("Almanya");
  });
});

describe("fuzzy travel date extraction", () => {
  it.each([
    ["önümüzdeki ay", /önümüzdeki ay|onumuzdeki ay/i],
    ["gelecek ay", /gelecek ay/i],
    ["şubat", /şubat|subat/i],
    ["Şubat başı", /şubat|subat/i],
    ["yakında", /yakında/i],
    ["bu yaz", /bu yaz|yaz/i],
    ["en kısa zamanda", /en kisa|en kısa|asap/i],
  ])("accepts natural phrase %j", (message, pattern) => {
    const res = SlotExtractor.extractSlots(message, {}, "tr", "Europe/Istanbul", "travelDate");
    expect(res.extracted.travelDate).toMatch(pattern);
  });

  it("accepts freeform travel when travelDate is expected", () => {
    const res = SlotExtractor.extractSlots(
      "belki eylül gibi bir şey",
      {},
      "tr",
      "Europe/Istanbul",
      "travelDate"
    );
    expect(res.extracted.travelDate).toBeTruthy();
  });
});

describe("soft intake LLM assist gate", () => {
  it("allows LLM when intake is open and patient answered naturally", () => {
    expect(
      shouldAllowLlmAssistForIntakeGate(
        { kind: "intake", group: 2, prompt: "x", missingFields: ["patientCountry"] } as any,
        "İspanya'da yaşıyorum"
      )
    ).toBe(true);
  });

  it("keeps consent / city gates hard", () => {
    expect(
      shouldAllowLlmAssistForIntakeGate({ kind: "consent", prompt: "x" } as any, "evet")
    ).toBe(false);
    expect(
      shouldAllowLlmAssistForIntakeGate({ kind: "ask_city", prompt: "x" } as any, "İstanbul")
    ).toBe(false);
  });
});
