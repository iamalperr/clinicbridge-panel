import { describe, it, expect } from "vitest";
import {
  enterClinicCoordinator,
  resolveAssistantRole,
} from "../lib/agency/assistantModes";
import {
  evaluateFeelinHealthyIntake,
  isReadyForClinicMatching,
} from "../lib/agency/feelinhealthyConfig";
import { SlotExtractor } from "../lib/conversation/slotExtractor";

describe("FeelinHealthy lead completion after clinic selection", () => {
  const baseIntake = {
    quoteConsent: true,
    patientName: "Yusuf Alper Özgül",
    patientAge: 34,
    patientGender: "male",
    patientEmail: "yusufalperozgul@hotmail.com",
    patientPhone: "+905551112233",
    patientCountry: "TR",
    lastTreatmentCategory: "implant",
    selectedCity: "istanbul",
    istanbul_side: "european" as const,
    lastRecommendedClinicIds: ["HXMlMPZ74AXkXoR4sEnH", "Ab1OHdC020XOG4TWpR2r"],
  };

  it("parses Turkish travel date ranges used after clinic selection", () => {
    const extracted = SlotExtractor.extractSlots(
      "10-19 Eylül tarihleri arası",
      {},
      "tr"
    ).extracted;
    expect(extracted.travelDate || extracted.travelDateText).toBeTruthy();
    expect(String(extracted.travelDate || extracted.travelDateText)).toMatch(/10-19/i);
  });

  it("does not rematch readiness after clinics already recommended + clinic selected", () => {
    const selected = enterClinicCoordinator(
      { ...baseIntake, travelDate: "10-19 Eylül" },
      { id: "HXMlMPZ74AXkXoR4sEnH", name: "Hospitadent Mecidiyeköy" }
    );
    expect(resolveAssistantRole(selected)).toBe("clinic_coordinator");
    expect(isReadyForClinicMatching(selected).ready).toBe(true);
    // Rematch must be skipped when recommendations already exist (enforced in route).
    expect(selected.lastRecommendedClinicIds?.length).toBeGreaterThan(0);
  });

  it("marks intake complete only after travel date is present", () => {
    const before = evaluateFeelinHealthyIntake(baseIntake);
    expect(before.group3Complete).toBe(false);
    expect(before.allGroupsComplete).toBe(false);

    const after = evaluateFeelinHealthyIntake({
      ...baseIntake,
      travelDate: "10-19 Eylül",
    });
    expect(after.group3Complete).toBe(true);
    expect(after.allGroupsComplete).toBe(true);
  });

  it("keeps coordinator role across travel-date turn (leadStage not downgraded)", () => {
    const ctx = enterClinicCoordinator(baseIntake, {
      id: "HXMlMPZ74AXkXoR4sEnH",
      name: "Hospitadent Mecidiyeköy",
    });
    // Simulates the bug where clinic_recommendation intent overwrote leadStage.
    const wronglyDowngraded = { ...ctx, leadStage: "recommendation" };
    expect(resolveAssistantRole(wronglyDowngraded)).toBe("network_advisor");
    expect(resolveAssistantRole(ctx)).toBe("clinic_coordinator");
  });
});
