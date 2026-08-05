import { describe, it, expect } from "vitest";
import {
  normalizeTreatmentBranch,
  getEmptyMatchProcessReply,
  getTreatmentClarificationPrompt,
  getCuratedClinicsForFeelinHealthy,
  buildEmptyMatchCityEscalation,
  isLocationExpansionAffirmative,
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
    expect(reply).toMatch(/aşağıdaki|anlaşmalı bölgeler/i);
    expect(reply).toContain("İstanbul Avrupa Yakası");
    expect(reply).not.toMatch(/değerlendirelim demeniz/i);
  });

  it("değerlendirelim matches expansion affirmative (conjugated form)", () => {
    expect(isLocationExpansionAffirmative("değerlendirelim")).toBe(true);
    expect(isLocationExpansionAffirmative("Değerlendirelim")).toBe(true);
    expect(isLocationExpansionAffirmative("let's evaluate")).toBe(true);
    expect(isLocationExpansionAffirmative("evet")).toBe(true);
    expect(isLocationExpansionAffirmative("implant istiyorum")).toBe(false);
  });

  it("empty match escalation returns clickable city card and clears location locks", () => {
    const result = buildEmptyMatchCityEscalation({
      locale: "tr",
      branchKey: "dental",
      sessionContext: {
        selectedCity: "istanbul",
        istanbul_side: "european",
        locationSelectionConfirmed: true,
        sideSelectionConfirmed: true,
        lastEmptyMatchKey: "dental|istanbul|european",
        pendingLocationExpansion: true,
      },
    });
    expect(result).not.toBeNull();
    expect(result!.type).toBe("city_selection");
    expect(result!.citySelectionCard.options.length).toBeGreaterThan(0);
    expect(result!.sessionContext.selectedCity).toBeUndefined();
    expect(result!.sessionContext.istanbul_side).toBeUndefined();
    expect(result!.sessionContext.lastEmptyMatchKey).toBeUndefined();
    expect(result!.sessionContext.pendingCitySelection).toBe(true);
  });

  it("treatment clarification informs process and accepts natural wording", () => {
    const prompt = getTreatmentClarificationPrompt("tr");
    expect(prompt).toMatch(/kaydettim|partner klinik/i);
    expect(prompt).not.toMatch(/Hangi tedavi veya sağlık hizmeti için destek arıyorsunuz\?$/);
  });

  it("blocks LLM assist for değerlendirelim on location negotiation", () => {
    expect(
      shouldAllowLlmAssistForIntakeGate(
        { kind: "ask_treatment", prompt: "x" } as any,
        "meme büyütme"
      )
    ).toBe(true);
    expect(
      shouldAllowLlmAssistForIntakeGate(
        { kind: "location_negotiation", prompt: "x" } as any,
        "İzmir'de bakmak istiyorum"
      )
    ).toBe(true);
    expect(
      shouldAllowLlmAssistForIntakeGate(
        { kind: "location_negotiation", prompt: "x" } as any,
        "değerlendirelim"
      )
    ).toBe(false);
    expect(
      shouldAllowLlmAssistForIntakeGate(
        { kind: "location_negotiation", prompt: "x" } as any,
        "Değerlendirelim"
      )
    ).toBe(false);
  });
});
