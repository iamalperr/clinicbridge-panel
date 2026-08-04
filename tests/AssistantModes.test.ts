import { describe, it, expect } from "vitest";
import {
  resolveAssistantRole,
  isExplicitReturnToNetworkDiscovery,
  enterClinicCoordinator,
  exitToNetworkAdvisor,
  getCoordinatorClinicId,
  buildClinicCoordinatorSystemPrompt,
  buildPatientProfileSummary,
  estimatePromptSize,
} from "../lib/agency/assistantModes";
import {
  buildAuthoritativeSystemPrompt,
  compileAssistantPolicy,
} from "../lib/agency/assistantPolicy";

const selectedCtx = {
  leadStage: "clinic_selected",
  selectedClinicId: "HXMlMPZ74AXkXoR4sEnH",
  selectedClinicName: "Hospitadent Mecidiyeköy",
  lastFocusedClinicId: "HXMlMPZ74AXkXoR4sEnH",
  lastFocusedClinicName: "Hospitadent Mecidiyeköy",
  lastTreatmentCategory: "implant",
  selectedCity: "istanbul",
  istanbul_side: "european",
  patientName: "Ada Yılmaz",
  patientEmail: "ada@example.com",
  patientPhone: "+905551112233",
  patientCountry: "TR",
  patientAge: 34,
  patientGender: "female",
  travelDate: "2026-09-10",
  quoteConsent: true,
  lastRecommendedClinicIds: ["HXMlMPZ74AXkXoR4sEnH", "Ab1OHdC020XOG4TWpR2r"],
};

describe("Assistant dual-mode architecture", () => {
  it("enters clinic_coordinator only when leadStage is clinic_selected + clinic id", () => {
    expect(resolveAssistantRole({})).toBe("network_advisor");
    expect(
      resolveAssistantRole({
        leadStage: "recommendation",
        selectedClinicId: "x",
      })
    ).toBe("network_advisor");
    expect(
      resolveAssistantRole({
        leadStage: "clinic_selected",
      })
    ).toBe("network_advisor");
    expect(resolveAssistantRole(selectedCtx)).toBe("clinic_coordinator");
  });

  it("enterClinicCoordinator sets authoritative backend state", () => {
    const next = enterClinicCoordinator(
      { quoteConsent: true, lastTreatmentCategory: "implant", leadStage: "recommendation" } as Record<string, any>,
      { id: "HXMlMPZ74AXkXoR4sEnH", name: "Hospitadent Mecidiyeköy" }
    );
    expect(next.leadStage).toBe("clinic_selected");
    expect(next.selectedClinicId).toBe("HXMlMPZ74AXkXoR4sEnH");
    expect(resolveAssistantRole(next)).toBe("clinic_coordinator");
    expect(getCoordinatorClinicId(next)).toBe("HXMlMPZ74AXkXoR4sEnH");
  });

  it("exitToNetworkAdvisor clears selection but keeps intake/treatment memory", () => {
    const next = exitToNetworkAdvisor({ ...selectedCtx });
    expect(resolveAssistantRole(next)).toBe("network_advisor");
    expect(next.selectedClinicId).toBeUndefined();
    expect(next.patientName).toBe("Ada Yılmaz");
    expect(next.lastTreatmentCategory).toBe("implant");
    expect(next.selectedCity).toBe("istanbul");
    expect(next.quoteConsent).toBe(true);
    expect(next.leadStage).toBe("recommendation");
  });

  it("explicit rediscovery language is required to leave coordinator", () => {
    expect(isExplicitReturnToNetworkDiscovery("Kaç implant gerekir?")).toBe(false);
    expect(isExplicitReturnToNetworkDiscovery("Havalimanı transferi var mı?")).toBe(false);
    expect(isExplicitReturnToNetworkDiscovery("Başka klinik öner")).toBe(true);
    expect(isExplicitReturnToNetworkDiscovery("Compare clinics please")).toBe(true);
    expect(isExplicitReturnToNetworkDiscovery("I changed my mind")).toBe(true);
    expect(isExplicitReturnToNetworkDiscovery("Farklı şehir istiyorum")).toBe(true);
    expect(isExplicitReturnToNetworkDiscovery("Different treatment")).toBe(true);
  });

  it("policy compiler exposes assistantRole from backend state", () => {
    const discovery = compileAssistantPolicy({
      agencyId: "feelinhealthy",
      agencySlug: "feelinhealthy",
      sessionContext: { quoteConsent: true, leadStage: "discovery" },
    });
    expect(discovery.conversationState.assistantRole).toBe("network_advisor");
    expect(discovery.conversationState.isSelectedClinicMode).toBe(false);

    const selected = compileAssistantPolicy({
      agencyId: "feelinhealthy",
      agencySlug: "feelinhealthy",
      sessionContext: selectedCtx,
    });
    expect(selected.conversationState.assistantRole).toBe("clinic_coordinator");
    expect(selected.conversationState.isSelectedClinicMode).toBe(true);
  });

  it("coordinator prompt is smaller than network advisor prompt and omits unrelated clinics", () => {
    const policy = compileAssistantPolicy({
      agencyId: "feelinhealthy",
      agencySlug: "feelinhealthy",
      sessionContext: {
        quoteConsent: true,
        lastTreatmentCategory: "implant",
        selectedCity: "istanbul",
        istanbul_side: "european",
        intakeStage: "completed",
      },
      matchingConfig: { maxClinicsToShow: 2 },
    });
    const networkPrompt = buildAuthoritativeSystemPrompt({
      policy,
      clinicContext:
        "CLINIC A id=1\nCLINIC B id=2\nCLINIC C id=3\n" +
        "lots of network matching rules and intake schema padding ".repeat(40),
      contextHint: "hint ".repeat(20),
      requiredNextAction: "match clinics",
    });

    const coordinatorPrompt = buildClinicCoordinatorSystemPrompt({
      assistantName: "FeelinHealthy",
      agencyName: "FeelinHealthy",
      selectedClinicId: selectedCtx.selectedClinicId!,
      selectedClinicName: selectedCtx.selectedClinicName!,
      selectedTreatment: selectedCtx.lastTreatmentCategory,
      selectedCity: selectedCtx.selectedCity,
      selectedIstanbulSide: selectedCtx.istanbul_side,
      patientProfileSummary: buildPatientProfileSummary(selectedCtx),
      clinicKnowledge: "SELECTED CLINIC ONLY: Hospitadent Mecidiyeköy doctors, transfer, hotel.",
      communicationRules: ["Be concise"],
      forbiddenClaims: ["guaranteed outcomes"],
    });

    expect(estimatePromptSize(coordinatorPrompt)).toBeLessThan(estimatePromptSize(networkPrompt));
    expect(coordinatorPrompt).toContain("Clinic Patient Coordinator");
    expect(coordinatorPrompt).toContain(selectedCtx.selectedClinicId);
    expect(coordinatorPrompt).not.toContain("CLINIC B id=2");
    expect(coordinatorPrompt).toMatch(/NEVER re-ask/i);
    expect(coordinatorPrompt).toContain("network_rediscovery");
  });

  it("does not treat soft clinic_info focus as coordinator mode", () => {
    expect(
      resolveAssistantRole({
        leadStage: "recommendation",
        lastFocusedClinicId: "HXMlMPZ74AXkXoR4sEnH",
        lastFocusedClinicName: "Hospitadent Mecidiyeköy",
      })
    ).toBe("network_advisor");
  });
});
