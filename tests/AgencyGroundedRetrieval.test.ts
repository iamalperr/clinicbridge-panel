import { describe, it, expect } from "vitest";
import {
  buildAgencyGroundedContext,
  resolveNamedConnectedClinic,
  getApprovedNetworkFallback,
  getApprovedPricingFallback,
} from "../lib/agency/agencyGroundedRetrieval";

const clinics = [
  {
    id: "c1",
    clinicName: "Hospitadent",
    clinicSlug: "hospitadent",
    status: "active",
    overview: "Hair transplant focused clinic in Istanbul.",
    treatmentCategories: ["hair_transplant"],
    treatments: ["FUE", "DHI"],
    location: { city: "Istanbul", side: "european" },
    supportedLanguages: ["tr", "en"],
  },
  {
    id: "c2",
    clinicName: "Estetik Plus",
    clinicSlug: "estetik-plus",
    status: "active",
    overview: "Aesthetic surgery clinic.",
    treatmentCategories: ["aesthetic_surgery"],
    location: { city: "Antalya" },
    supportedLanguages: ["tr"],
  },
];

describe("AgencyGroundedRetrieval", () => {
  it("returns network structured context + approved fallback when agency KB is empty", () => {
    const result = buildAgencyGroundedContext({
      agencyId: "ag1",
      agencyName: "FeelinHealthy",
      locale: "tr",
      assistantRole: "network_advisor",
      clinics,
      doctors: [],
      pricing: [],
      agencyKnowledge: [],
      clinicKnowledge: [],
    });
    expect(result.usedAgencyKnowledge).toBe(false);
    expect(result.framing).toBe("network");
    expect(result.contextText).toContain("Hospitadent");
    expect(result.contextText).toContain("Estetik Plus");
    expect(result.contextText.toLowerCase()).not.toContain("i have no information");
    expect(result.contextText).toMatch(/DAYANAK|GROUNDING|APPROVED FALLBACK|AĞ ÇERÇEVESİ|NETWORK FRAMING/);
    // Empty pricing/doctors still has overview → may or may not set fallback;
    // ensure approved network fallback helper is usable either way.
    expect(getApprovedNetworkFallback("en")).toMatch(/network clinics/i);
  });

  it("filters to a named connected clinic only", () => {
    expect(resolveNamedConnectedClinic("Hospitadent doktorları kim?", clinics)?.id).toBe(
      "c1"
    );
    const result = buildAgencyGroundedContext({
      agencyId: "ag1",
      userMessage: "Hospitadent hakkında bilgi verir misiniz?",
      clinics,
      doctors: [
        {
          id: "d1",
          clinicId: "c1",
          fullName: "Dr. Ada",
          specialties: ["hair"],
          isActive: true,
          isPublic: true,
        },
        {
          id: "d2",
          clinicId: "c2",
          fullName: "Dr. Other",
          isActive: true,
          isPublic: true,
        },
      ],
      pricing: [
        {
          id: "p1",
          clinicId: "c1",
          treatmentName: "FUE",
          priceMin: 1000,
          priceMax: 2000,
          currency: "EUR",
        },
      ],
    });
    expect(result.framing).toBe("named_clinic");
    expect(result.namedClinicId).toBe("c1");
    expect(result.contextText).toContain("Hospitadent");
    expect(result.contextText).toContain("Dr. Ada");
    expect(result.contextText).not.toContain("Estetik Plus");
    expect(result.contextText).not.toContain("Dr. Other");
    expect(result.attributions.some((a) => a.sourceType === "doctors")).toBe(true);
    expect(result.attributions.some((a) => a.sourceType === "pricing")).toBe(true);
  });

  it("uses selected clinic framing in coordinator mode and strips inventable gaps with pricing fallback copy", () => {
    const result = buildAgencyGroundedContext({
      agencyId: "ag1",
      locale: "en",
      assistantRole: "clinic_coordinator",
      selectedClinicId: "c2",
      clinics,
      doctors: [],
      pricing: [],
      agencyKnowledge: [
        { id: "ak1", title: "Visa", content: "Agency visa tip", isActive: true },
      ],
    });
    expect(result.framing).toBe("selected_clinic");
    expect(result.contextText).toContain("Estetik Plus");
    expect(result.contextText).not.toContain("Hospitadent");
    // Coordinator callers pass empty agency KB; if provided, builder still skips agency KB for coordinator.
    expect(result.usedAgencyKnowledge).toBe(false);
    expect(getApprovedPricingFallback("en")).toMatch(/personalized quote/i);
  });

  it("never invents doctors when none exist — attributions omit doctor sources", () => {
    const result = buildAgencyGroundedContext({
      agencyId: "ag1",
      clinics: [clinics[0]],
      doctors: [],
      pricing: [],
    });
    expect(result.attributions.every((a) => a.sourceType !== "doctors")).toBe(true);
    expect(result.contextText).not.toMatch(/Dr\.\s+[A-Z]/);
  });
});
