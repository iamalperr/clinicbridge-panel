import { describe, it, expect } from "vitest";
import {
  FEELINHEALTHY_CURATED_RULES,
  FEELINHEALTHY_PRODUCTION_CLINIC_IDS,
  getAvailableCitiesForTreatment,
  getCuratedClinicsForFeelinHealthy,
  normalizeTreatmentBranch,
} from "../lib/agency/feelinhealthyConfig";

describe("FeelinHealthy aesthetic_surgery curated matching", () => {
  it("has a curated aesthetic_surgery branch with Istanbul/Antalya/Ankara", () => {
    const rule = FEELINHEALTHY_CURATED_RULES.find((b) => b.branchKey === "aesthetic_surgery");
    expect(rule).toBeTruthy();
    const cities = (rule?.locations || []).map((l) => l.city);
    expect(cities).toContain("istanbul");
    expect(cities).toContain("antalya");
    expect(cities).toContain("ankara");
  });

  it("returns active city options for estetik / aesthetic_surgery", () => {
    const fromPhrase = getAvailableCitiesForTreatment("estetik", [], "tr");
    const fromBranch = getAvailableCitiesForTreatment("aesthetic_surgery", [], "tr");
    expect(fromPhrase.length).toBeGreaterThan(0);
    expect(fromBranch.map((c) => c.city)).toEqual(
      expect.arrayContaining(["istanbul", "antalya", "ankara"])
    );
    expect(fromPhrase.some((c) => c.city === "istanbul" && c.requiresSideSelection)).toBe(true);
  });

  it("matches Orion / BHT for Istanbul sides after city+side are known", () => {
    const connected = [
      {
        id: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.orionSurgeryCenter,
        clinicName: "Orion Surgery Center",
        clinicSlug: "orion-surgery-center",
        status: "active",
        treatmentCategories: ["aesthetic_surgery"],
        location: { city: "İstanbul" },
      },
      {
        id: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.bhtClinicIstanbulTema,
        clinicName: "BHT Clinic İstanbul Tema Hastanesi",
        clinicSlug: "bht-clinic-istanbul-tema-hastanesi",
        status: "active",
        treatmentCategories: ["aesthetic_surgery"],
        location: { city: "İstanbul" },
      },
    ];

    const anatolian = getCuratedClinicsForFeelinHealthy(
      "aesthetic_surgery",
      "istanbul",
      "anatolian",
      connected
    );
    expect(anatolian.matchingCuratedClinics.map((c) => c.id)).toContain(
      FEELINHEALTHY_PRODUCTION_CLINIC_IDS.orionSurgeryCenter
    );

    const european = getCuratedClinicsForFeelinHealthy(
      "aesthetic_surgery",
      "istanbul",
      "european",
      connected
    );
    expect(european.matchingCuratedClinics.map((c) => c.id)).toContain(
      FEELINHEALTHY_PRODUCTION_CLINIC_IDS.bhtClinicIstanbulTema
    );
  });

  it("normalizes memorial aesthetic category labels to aesthetic_surgery", () => {
    expect(normalizeTreatmentBranch("aesthetic_plastic_reconstructive_surgery")).toBe(
      "aesthetic_surgery"
    );
    expect(normalizeTreatmentBranch("plastic_surgery")).toBe("aesthetic_surgery");
  });
});
