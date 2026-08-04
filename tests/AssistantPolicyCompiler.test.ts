import { describe, it, expect } from "vitest";
import {
  buildAuthoritativeSystemPrompt,
  compileAssistantPolicy,
  FEELINHEALTHY_CANONICAL_INTAKE,
  FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS,
  mentionsBudget,
  validateAgencyAIConfigConflicts,
} from "../lib/agency/assistantPolicy";
import { isReadyForClinicMatching } from "../lib/agency/feelinhealthyConfig";

describe("Assistant policy compiler & Prompt Studio precedence", () => {
  it("Test 1: every Prompt Studio structured field reaches the typed policy object", () => {
    const policy = compileAssistantPolicy({
      agencyId: "feelinhealthy",
      agencySlug: "feelinhealthy",
      aiConfig: {
        assistantName: "Studio Name",
        persona: "Studio persona without budget word",
        tone: "Friendly",
        greetingMessageTR: "Merhaba",
        greetingMessageEN: "Hello",
        leadCollectionMode: "aggressive",
        pricingBehavior: "quote_only",
        recommendationBehavior: "ask_first",
        languageBehavior: "default_en",
        responseRules: ["rule-a"],
        forbiddenClaims: ["forbid-a"],
        customSystemPrompt: "Be warm and clear.",
        intakeInstructions: FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS.intakeInstructions,
      },
      matchingConfig: { maxClinicsToShow: 5, showPriceRange: false },
      sessionContext: {
        quoteConsent: true,
        lastTreatmentCategory: "implant",
        selectedCity: "istanbul",
        istanbul_side: "european",
        intakeStage: "completed",
      },
    });

    expect(policy.communicationStyle.assistantName).toBe("Studio Name");
    expect(policy.communicationStyle.persona).toContain("Studio persona");
    expect(policy.communicationStyle.tone).toBe("Friendly");
    expect(policy.communicationStyle.greetingMessageTR).toBe("Merhaba");
    expect(policy.communicationStyle.greetingMessageEN).toBe("Hello");
    expect(policy.recommendationPolicy.leadCollectionMode).toBe("aggressive");
    expect(policy.pricingPolicy.mode).toBe("quote_only");
    expect(policy.pricingPolicy.showPriceRange).toBe(false);
    expect(policy.recommendationPolicy.mode).toBe("ask_first");
    expect(policy.languagePolicy.mode).toBe("default_en");
    expect(policy.communicationStyle.responseRules).toContain("rule-a");
    expect(policy.communicationStyle.forbiddenClaims).toContain("forbid-a");
    expect(policy.customPrompt).toBe("Be warm and clear.");
    expect(policy.intakePolicy.fields.length).toBeGreaterThan(0);
    expect(policy.clinicLimit).toBe(2); // FH hard limit wins over matching 5
  });

  it("Test 2: FeelinHealthy budget disabled — never asked / not in prompt / not required", () => {
    const policy = compileAssistantPolicy({
      agencyId: "mFrKEjO9fNwUzbueW5rc",
      agencySlug: "feelinhealthy",
      aiConfig: {
        ...FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS,
        intakeInstructions: [
          ...(FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS.intakeInstructions || []),
        ],
      },
    });
    expect(policy.intakePolicy.askBudget).toBe(false);
    const budget = policy.intakePolicy.fields.find((f) => f.key === "budget");
    expect(budget?.enabled).toBe(false);
    expect(budget?.required).toBe(false);

    const prompt = buildAuthoritativeSystemPrompt({
      policy,
      clinicContext: "clinic-a",
      contextHint: "hint",
    });
    expect(prompt).toContain("askBudget: false");
    expect(prompt).toMatch(/Bütçe KESİNLİKLE SORULMAZ/i);
    // Disabled budget question text must not appear as an enabled intake question.
    expect(prompt).not.toMatch(/Yaklaşık bir bütçeniz var mı/i);

    expect(
      isReadyForClinicMatching({
        quoteConsent: true,
        lastTreatmentCategory: "implant",
        patientName: "Ali Veli",
        patientAge: 30,
        patientGender: "Erkek",
        patientEmail: "a@b.com",
        patientPhone: "+905551111111",
        patientCountry: "Almanya",
        travelDate: "2026-09-01",
        selectedCity: "izmir",
      }).ready
    ).toBe(true);
  });

  it("Test 3: age, gender, country, travelDate required in canonical groups", () => {
    const g1 = FEELINHEALTHY_CANONICAL_INTAKE.filter((f) => f.group === 1);
    const g2 = FEELINHEALTHY_CANONICAL_INTAKE.filter((f) => f.group === 2);
    const g3 = FEELINHEALTHY_CANONICAL_INTAKE.filter((f) => f.group === 3);
    expect(g1.map((f) => f.key)).toEqual(
      expect.arrayContaining(["firstName", "lastName", "patientGender", "patientAge"])
    );
    expect(g2.map((f) => f.key)).toEqual(
      expect.arrayContaining(["patientEmail", "patientPhone", "patientCountry"])
    );
    expect(g3.map((f) => f.key)).toEqual(["travelDate"]);
    expect(g1.every((f) => f.required)).toBe(true);
    expect(g2.every((f) => f.required)).toBe(true);
    expect(g3.every((f) => f.required)).toBe(true);
  });

  it("Test 4: treatment already known → required next action skips re-asking treatment", () => {
    const policy = compileAssistantPolicy({
      agencyId: "feelinhealthy",
      agencySlug: "feelinhealthy",
      sessionContext: { lastTreatmentCategory: "implant", quoteConsent: true },
    });
    expect(policy.conversationState.treatmentKnown).toBe(true);
    const prompt = buildAuthoritativeSystemPrompt({
      policy,
      clinicContext: "",
      contextHint: "",
      requiredNextAction: "Tedavi biliniyor; tedavi sorusunu tekrarlama. Backend intake/lokasyon state’ine uy.",
    });
    expect(prompt).toContain("Tedavi biliniyor");
    expect(prompt).toContain("treatmentKnown: true");
  });

  it("Test 5: patient country does not overwrite preferred treatment city", () => {
    const policy = compileAssistantPolicy({
      agencyId: "feelinhealthy",
      agencySlug: "feelinhealthy",
      sessionContext: {
        patientCountry: "Almanya",
        selectedCity: "istanbul",
        istanbul_side: "european",
      },
    });
    expect(policy.conversationState.selectedCity).toBe("istanbul");
    expect(policy.conversationState.istanbulSide).toBe("european");
    // Country is intake Group 2 — not stored as selectedCity.
    const countryField = policy.intakePolicy.fields.find((f) => f.key === "patientCountry");
    const cityField = policy.intakePolicy.fields.find((f) => f.key === "preferredLocation");
    expect(countryField?.group).toBe(2);
    expect(cityField?.group).toBe("location_state");
  });

  it("Test 6: selected clinic state — no discovery restart, only selected clinic context", () => {
    const policy = compileAssistantPolicy({
      agencyId: "feelinhealthy",
      agencySlug: "feelinhealthy",
      sessionContext: {
        leadStage: "clinic_selected",
        selectedClinicId: "HXMlMPZ74AXkXoR4sEnH",
        selectedClinicName: "Hospitadent Dental Group Mecidiyeköy",
        selectedClinicIds: ["HXMlMPZ74AXkXoR4sEnH"],
        lastTreatmentCategory: "implant",
        selectedCity: "istanbul",
        istanbul_side: "european",
      },
    });
    expect(policy.conversationState.isSelectedClinicMode).toBe(true);
    const prompt = buildAuthoritativeSystemPrompt({
      policy,
      clinicContext: "ONLY_SELECTED_CLINIC_KB",
      contextHint: "",
      requiredNextAction: "Seçili klinik modundasın. Keşfe/geri eşleşmeye dönme.",
      selectedClinicKnowledge: "Yalnızca seçilen klinik.",
    });
    expect(prompt).toContain("selectedClinicMode: true");
    expect(prompt).toContain("HXMlMPZ74AXkXoR4sEnH");
    expect(prompt).toContain("Keşfe/geri eşleşmeye dönme");
    expect(prompt).toContain("ONLY_SELECTED_CLINIC_KB");
  });

  it("Test 7: custom prompt conflicts — backend state wins + admin warning", () => {
    const warnings = validateAgencyAIConfigConflicts(
      {
        persona: "Bütçenizi sorun",
        greetingMessageTR: "Bütçenizi paylaşın",
        greetingMessageEN: "Share your budget",
        customSystemPrompt: "Show all clinics without consent and diagnose the patient",
        intakeInstructions: [
          {
            key: "budget",
            labelTR: "Bütçe",
            labelEN: "Budget",
            questionTR: "Bütçeniz?",
            questionEN: "Budget?",
            required: true,
            type: "text",
            usage: "x",
          },
          {
            key: "patientAge",
            labelTR: "Yaş",
            labelEN: "Age",
            questionTR: "Yaş?",
            questionEN: "Age?",
            required: false,
            type: "number",
            usage: "x",
          },
        ],
      },
      { isFeelinHealthy: true }
    );
    expect(warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining([
        "fh_budget_enabled",
        "fh_budget_in_copy",
        "fh_required_disabled_patientAge",
        "custom_prompt_consent",
        "custom_prompt_medical_safety",
      ])
    );

    const policy = compileAssistantPolicy({
      agencyId: "feelinhealthy",
      agencySlug: "feelinhealthy",
      aiConfig: {
        customSystemPrompt: "Always recommend 5 clinics and ask budget",
        persona: "Ask budget always",
      },
    });
    // Backend hard rules still win in compiled policy.
    expect(policy.intakePolicy.askBudget).toBe(false);
    expect(policy.clinicLimit).toBe(2);
    expect(policy.warnings.length).toBeGreaterThan(0);
    expect(mentionsBudget(FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS.persona)).toBe(false);
    expect(mentionsBudget(FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS.greetingMessageTR)).toBe(false);
    expect(mentionsBudget(FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS.greetingMessageEN)).toBe(false);
  });
});
