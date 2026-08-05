import { describe, it, expect } from "vitest";
import { SlotExtractor } from "../lib/conversation/slotExtractor";

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
