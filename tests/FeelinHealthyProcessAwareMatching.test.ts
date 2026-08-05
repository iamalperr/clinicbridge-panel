import { describe, it, expect } from "vitest";
import {
  normalizeTreatmentBranch,
  getEmptyMatchProcessReply,
  getTreatmentClarificationPrompt,
  getCuratedClinicsForFeelinHealthy,
} from "../lib/agency/feelinhealthyConfig";
import {
  inferTreatmentFromText,
  shouldAllowLlmAssistForIntakeGate,
} from "../lib/agency/feelinhealthyConversationMachine";
import { SlotExtractor } from "../lib/conversation/slotExtractor";

describe("treatment recognition for natural aesthetic / hair phrases", () => {
  it("normalizes hair aliases to hair_transplant curated branch", () => {
    expect(normalizeTreatmentBranch("hair")).toBe("hair_transplant");
    expect(normalizeTreatmentBranch("saç ekim")).toBe("hair_transplant");
    expect(normalizeTreatmentBranch("hair_transplant")).toBe("hair_transplant");
  });

  it("normalizes aesthetic phrases to aesthetic_surgery", () => {
    expect(normalizeTreatmentBranch("meme büyütme")).toBe("aesthetic_surgery");
    expect(normalizeTreatmentBranch("popo büyütme")).toBe("aesthetic_surgery");
    expect(normalizeTreatmentBranch("aesthetic")).toBe("aesthetic_surgery");
  });

  it("infers treatments from natural Turkish", () => {
    expect(inferTreatmentFromText("İstanbul Avrupa saç ekim klinikleri")).toBe(
      "hair_transplant"
    );
    expect(inferTreatmentFromText("Popo büyütme")).toBe("aesthetic_surgery");
    expect(inferTreatmentFromText("meme büyütme")).toBe("aesthetic_surgery");
  });

  it("SlotExtractor understands meme / popo büyütme", () => {
    expect(
      SlotExtractor.extractSlots("Popo büyütme", {}, "tr").extracted.treatment
    ).toBe("aesthetic_surgery");
    expect(
      SlotExtractor.extractSlots("meme büyütme", {}, "tr").extracted.treatment
    ).toBe("aesthetic_surgery");
    expect(
      SlotExtractor.extractSlots("saç ekim", {}, "tr").extracted.treatment
    ).toBe("hair_transplant");
  });

  it("hair + İstanbul Avrupa can resolve curated branch (not unknown hair key)", () => {
    const res = getCuratedClinicsForFeelinHealthy("hair", "istanbul", "european", []);
    expect(res.matchingCuratedClinics.length).toBeGreaterThan(0);
    expect(res.matchingCuratedClinics[0].clinicName).toMatch(/BHT|TEMA/i);
  });
});

describe("process-aware empty match + soft treatment ask", () => {
  it("empty match reply offers next step instead of only dead-end line", () => {
    const reply = getEmptyMatchProcessReply({
      locale: "tr",
      branchKey: "hair_transplant",
      supportedLocationLabels: ["İstanbul Avrupa Yakası", "İstanbul Anadolu Yakası"],
    });
    expect(reply).toMatch(/değerlendirelim|yakın bir bölge/i);
    expect(reply).toContain("İstanbul Avrupa Yakası");
  });

  it("treatment clarification informs process and accepts natural wording", () => {
    const prompt = getTreatmentClarificationPrompt("tr");
    expect(prompt).toMatch(/kaydettim|partner klinik/i);
    expect(prompt).not.toMatch(/Hangi tedavi veya sağlık hizmeti için destek arıyorsunuz\?$/);
  });

  it("allows LLM assist for ask_treatment and location negotiation", () => {
    expect(
      shouldAllowLlmAssistForIntakeGate(
        { kind: "ask_treatment", prompt: "x" } as any,
        "meme büyütme"
      )
    ).toBe(true);
    expect(
      shouldAllowLlmAssistForIntakeGate(
        { kind: "location_negotiation", prompt: "x" } as any,
        "Değerlendirelim"
      )
    ).toBe(true);
  });
});
