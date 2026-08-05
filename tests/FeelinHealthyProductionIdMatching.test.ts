import { describe, it, expect } from "vitest";
import {
  FEELINHEALTHY_CONFIG,
  FEELINHEALTHY_PRODUCTION_CLINIC_IDS,
  buildFeelinHealthyMatchingDiagnostics,
  calculateAdditionalCountAndConversion,
  getClinicMatchingReadyReply,
  getCuratedClinicsForFeelinHealthy,
} from "../lib/agency/feelinhealthyConfig";

/**
 * Production-like Fixtures — schema mirrors agencies/{id}/clinics from
 * https://app.clinicbridge-ai.com/api/public/agency/feelinhealthy/clinics
 */
const productionLikeClinics = [
  {
    id: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.hospitadentMecidiyekoy,
    clinicSlug: "hospitadent-dental-group-mecidiyekoy",
    clinicName: "Hospitadent Dental Group Mecidiyeköy",
    status: "active",
    treatmentCategories: ["dental"],
    location: { city: "İstanbul", district: "Şişli", region: "İstanbul European Side" },
  },
  {
    id: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.bhtClinicIstanbulTema,
    slug: "bht-clinic-istanbul-tema-hastanesi",
    clinicName: "BHT Clinic İstanbul Tema Hastanesi",
    status: "active",
    treatmentCategories: ["dental", "eye_treatments", "ivf"],
    location: { city: "İstanbul", area: "İstanbul Avrupa Yakası" },
  },
  {
    id: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.istanbulDisAkademisi,
    clinicSlug: "istanbul-dis-akademisi",
    clinicName: "İstanbul Diş Akademisi",
    status: "active",
    treatmentCategories: ["dental"],
    location: { city: "İstanbul", district: "Maltepe", region: "İstanbul Asian Side" },
  },
  {
    id: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.hospitadentCamlica,
    clinicSlug: "hospitadent-dental-group-camlica",
    clinicName: "Hospitadent Dental Group Çamlıca",
    status: "active",
    treatmentCategories: ["dental"],
    location: { city: "Istanbul", region: "Asian Side" },
  },
  {
    id: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.westdentClinic,
    slug: "westdent-clinic",
    clinicName: "Westdent Clinic",
    status: "active",
    treatmentCategories: ["i̇mplant", "crown"],
    location: { city: "İzmir" },
  },
  {
    id: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.beyazisikIzmir,
    slug: "beyazisik-izmir-dental-group",
    clinicName: "Beyazışık İzmir Dental Group",
    status: "active",
    treatmentCategories: ["i̇mplant"],
    location: { city: "İzmir" },
  },
  {
    id: "inactive-european-dental",
    clinicSlug: "inactive-european",
    clinicName: "Inactive European Dental",
    status: "inactive",
    treatmentCategories: ["dental"],
    location: { city: "İstanbul", region: "İstanbul European Side" },
  },
  {
    id: "wrong-side-clinic",
    clinicSlug: "hospitadent-dental-group-serifali",
    clinicName: "Hospitadent Dental Group Şerifali",
    status: "active",
    treatmentCategories: ["dental"],
    location: { city: "İstanbul", region: "İstanbul Asian Side" },
  },
];

describe("P0 production ID matching — Dental Implant Istanbul European", () => {
  it("Test 1: returns Hospitadent Mecidiyeköy + BHT TEMA by production Firestore IDs", () => {
    const res = getCuratedClinicsForFeelinHealthy(
      "implant",
      "istanbul",
      "european",
      productionLikeClinics.filter((c) => c.status === "active")
    );

    const ids = res.matchingCuratedClinics.map((c) => c.id);
    expect(ids).toEqual([
      FEELINHEALTHY_PRODUCTION_CLINIC_IDS.hospitadentMecidiyekoy,
      FEELINHEALTHY_PRODUCTION_CLINIC_IDS.bhtClinicIstanbulTema,
    ]);
    expect(ids).toHaveLength(2);
    expect(ids.length).toBeLessThanOrEqual(FEELINHEALTHY_CONFIG.maxGuestClinics);
    expect(ids).not.toContain("wrong-side-clinic");
    expect(ids).not.toContain("inactive-european-dental");
    expect(getClinicMatchingReadyReply("tr", ids.length).toLowerCase()).not.toContain(
      "aktif bir partner"
    );
  });

  it("Test 2: Anatolian Side uses production IDs", () => {
    const res = getCuratedClinicsForFeelinHealthy(
      "dental",
      "istanbul",
      "anatolian",
      productionLikeClinics.filter((c) => c.status === "active")
    );
    expect(res.matchingCuratedClinics.map((c) => c.id)).toEqual([
      FEELINHEALTHY_PRODUCTION_CLINIC_IDS.istanbulDisAkademisi,
      FEELINHEALTHY_PRODUCTION_CLINIC_IDS.hospitadentCamlica,
    ]);
  });

  it("Test 3: Izmir matches via production id + slug field (not clinicSlug)", () => {
    const res = getCuratedClinicsForFeelinHealthy(
      "implant",
      "izmir",
      null,
      productionLikeClinics.filter((c) => c.status === "active")
    );
    expect(res.matchingCuratedClinics.map((c) => c.id)).toEqual([
      FEELINHEALTHY_PRODUCTION_CLINIC_IDS.westdentClinic,
      FEELINHEALTHY_PRODUCTION_CLINIC_IDS.beyazisikIzmir,
    ]);
  });

  it("Test 4: additional eligible count and registration CTA", () => {
    const res = getCuratedClinicsForFeelinHealthy(
      "dental",
      "istanbul",
      "european",
      productionLikeClinics.filter((c) => c.status === "active")
    );
    // allEligible includes curated + other dental clinics in same city from pool
    const visible = res.matchingCuratedClinics.slice(0, 2);
    const conv = calculateAdditionalCountAndConversion(
      Math.max(res.allEligibleClinics.length, 5),
      visible.length,
      "tr"
    );
    expect(visible).toHaveLength(2);
    expect(conv.additionalCount).toBeGreaterThan(0);
    expect(conv.ctaText).toBe("Daha Fazla Teklif Al");
    expect(conv.registrationUrl).toBe("https://www.feelinhealthy.com/register");
    expect(conv.conversionMessage).toMatch(/FeelinHealthy yapay zeka asistanı/i);
    expect(conv.conversionMessage).toMatch(/öneri sunuyor/);
  });

  it("Test 5: exactly 2 eligible → no false additional CTA", () => {
    const onlyTwo = productionLikeClinics.filter((c) =>
      [
        FEELINHEALTHY_PRODUCTION_CLINIC_IDS.hospitadentMecidiyekoy,
        FEELINHEALTHY_PRODUCTION_CLINIC_IDS.bhtClinicIstanbulTema,
      ].includes(c.id as any)
    );
    const res = getCuratedClinicsForFeelinHealthy("dental", "istanbul", "european", onlyTwo);
    const conv = calculateAdditionalCountAndConversion(
      res.allEligibleClinics.length,
      res.matchingCuratedClinics.length,
      "tr"
    );
    expect(res.matchingCuratedClinics).toHaveLength(2);
    expect(conv.additionalCount).toBe(0);
    expect(conv.hasConversionOffer).toBe(false);
  });

  it("Test 6: no real eligible clinic → safe empty result", () => {
    const res = getCuratedClinicsForFeelinHealthy("dental", "istanbul", "european", [
      {
        id: "other-city",
        clinicSlug: "westdent-clinic",
        clinicName: "Westdent Clinic",
        status: "active",
        treatmentCategories: ["dental"],
        location: { city: "İzmir" },
      },
    ]);
    // Curated IDs not present in available pool and pool non-empty → no synthetic invent
    expect(res.matchingCuratedClinics).toHaveLength(0);
    expect(getClinicMatchingReadyReply("tr", 0)).toContain(
      "doğrudan gösterebileceğimiz bir sağlık kuruluşu bulunmuyor"
    );
  });

  it("legacy kebab-case config IDs must not be the primary production keys anymore", () => {
    expect(FEELINHEALTHY_PRODUCTION_CLINIC_IDS.hospitadentMecidiyekoy).toBe("HXMlMPZ74AXkXoR4sEnH");
    expect(FEELINHEALTHY_PRODUCTION_CLINIC_IDS.bhtClinicIstanbulTema).toBe("Ab1OHdC020XOG4TWpR2r");
    expect(FEELINHEALTHY_PRODUCTION_CLINIC_IDS.hospitadentMecidiyekoy).not.toBe(
      "hospitadent-mecidiyekoy"
    );
  });

  it("diagnostics payload never includes patient fields", () => {
    const diag = buildFeelinHealthyMatchingDiagnostics({
      agencyId: "feelinhealthy",
      treatmentBranch: "dental",
      treatmentId: "implant",
      city: "istanbul",
      istanbulSide: "european",
      linkedClinicIds: ["a", "b"],
      activeClinicIds: ["a", "b"],
      treatmentMatchedIds: ["a"],
      cityMatchedIds: ["a"],
      sideMatchedIds: ["a"],
      curatedMatchedIds: [
        FEELINHEALTHY_PRODUCTION_CLINIC_IDS.hospitadentMecidiyekoy,
        FEELINHEALTHY_PRODUCTION_CLINIC_IDS.bhtClinicIstanbulTema,
      ],
      finalIds: [
        FEELINHEALTHY_PRODUCTION_CLINIC_IDS.hospitadentMecidiyekoy,
        FEELINHEALTHY_PRODUCTION_CLINIC_IDS.bhtClinicIstanbulTema,
      ],
    });
    const serialized = JSON.stringify(diag);
    expect(serialized).not.toMatch(/"email"|"phone"|"patientName"|"patientEmail"|"healthMessage"/i);
    expect(Object.keys(diag)).not.toContain("patientName");
    expect(Object.keys(diag)).not.toContain("email");
    expect(diag.finalClinicIds).toEqual([
      FEELINHEALTHY_PRODUCTION_CLINIC_IDS.hospitadentMecidiyekoy,
      FEELINHEALTHY_PRODUCTION_CLINIC_IDS.bhtClinicIstanbulTema,
    ]);
  });
});
