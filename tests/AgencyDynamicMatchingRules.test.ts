import { describe, it, expect } from "vitest";
import {
  FEELINHEALTHY_CONFIG,
  FEELINHEALTHY_PRODUCTION_CLINIC_IDS,
  getCuratedClinicsForFeelinHealthy,
} from "../lib/agency/feelinhealthyConfig";
import {
  PLATFORM_MAX_RECOMMENDED_CLINICS,
  assertNoIntermedInRules,
  buildFeelinHealthyMigrationRules,
  compareLegacyVsDynamicParity,
  extractLiveCuratedMatrix,
  resolveAgencyClinicRecommendations,
  sanitizeMatchingClinicIds,
  type AgencyMatchingRule,
} from "../lib/agency/agencyMatchingRules";
import { hasCompletedQuoteForTreatment } from "../lib/agency/treatmentQuoteCycle";

const IDS = FEELINHEALTHY_PRODUCTION_CLINIC_IDS;

function clinic(
  id: string,
  opts: {
    name?: string;
    status?: string;
    cats?: string[];
    city?: string;
  } = {}
) {
  return {
    id,
    clinicName: opts.name || id,
    status: opts.status || "active",
    treatmentCategories: opts.cats || ["dental"],
    location: { city: opts.city || "İstanbul" },
  };
}

const pool = [
  clinic(IDS.istanbulDisAkademisi, { name: "İstanbul Diş Akademisi", cats: ["dental"], city: "İstanbul" }),
  clinic(IDS.hospitadentCamlica, { name: "Hospitadent Çamlıca", cats: ["dental"], city: "İstanbul" }),
  clinic(IDS.hospitadentMecidiyekoy, { name: "Hospitadent Mecidiyeköy", cats: ["dental"], city: "İstanbul" }),
  clinic(IDS.bhtClinicIstanbulTema, {
    name: "BHT Clinic",
    cats: ["dental", "aesthetic_surgery", "eye_treatments", "hair_transplant"],
    city: "İstanbul",
  }),
  clinic(IDS.westdentClinic, { name: "Westdent", cats: ["dental"], city: "İzmir" }),
  clinic(IDS.beyazisikIzmir, { name: "Beyaz Işık", cats: ["dental"], city: "İzmir" }),
  clinic(IDS.hospitadentAntalya, { name: "Hospitadent Antalya", cats: ["dental"], city: "Antalya" }),
  clinic(IDS.memorialAntalya, {
    name: "Memorial Antalya",
    cats: ["dental", "aesthetic_surgery"],
    city: "Antalya",
  }),
  clinic(IDS.hospitadentAnkara, { name: "Hospitadent Ankara", cats: ["dental"], city: "Ankara" }),
  clinic(IDS.lokmanHekimAnkara, {
    name: "Lokman Hekim Ankara",
    cats: ["dental", "aesthetic_surgery"],
    city: "Ankara",
  }),
  clinic(IDS.lokmanHekimIstanbul, {
    name: "Lokman Hekim İstanbul",
    cats: ["ivf", "cardiology", "check_up", "hair_transplant", "aesthetic_surgery"],
    city: "İstanbul",
  }),
  clinic(IDS.anadoluMedicalCenter, {
    name: "Anadolu Medical Center",
    cats: ["ivf", "cardiology", "check_up"],
    city: "Kocaeli",
  }),
  clinic(IDS.dunyagozAtakoy, { name: "Dünyagöz Ataköy", cats: ["eye_treatments"], city: "İstanbul" }),
  clinic(IDS.dunyagozAntalya, { name: "Dünyagöz Antalya", cats: ["eye_treatments"], city: "Antalya" }),
  clinic(IDS.orionSurgeryCenter, {
    name: "Orion Surgery Center",
    cats: ["aesthetic_surgery"],
    city: "İstanbul",
  }),
  clinic(IDS.intermedNisantasi, {
    name: "Intermed Health Group Nişantaşı",
    cats: ["aesthetic_surgery"],
    city: "İstanbul",
  }),
];

describe("Dynamic agency matching rules", () => {
  const migrated = buildFeelinHealthyMigrationRules("feelinhealthy");

  it("extracts the full live curated matrix without inventing clinics", () => {
    const matrix = extractLiveCuratedMatrix();
    expect(matrix.length).toBeGreaterThanOrEqual(15);
    const dentalAnadolu = matrix.find(
      (r) => r.treatmentBranch === "dental" && r.city === "istanbul" && r.side === "anatolian"
    );
    expect(dentalAnadolu?.clinicIds).toEqual([
      IDS.istanbulDisAkademisi,
      IDS.hospitadentCamlica,
    ]);
    const aestheticEurope = matrix.find(
      (r) =>
        r.treatmentBranch === "aesthetic_surgery" &&
        r.city === "istanbul" &&
        r.side === "european"
    );
    expect(aestheticEurope?.clinicIds).toEqual([IDS.bhtClinicIstanbulTema]);
    expect(aestheticEurope?.clinicIds).not.toContain(IDS.intermedNisantasi);
  });

  it("Test A — Migration parity: legacy == migrated dynamic for every curated row", () => {
    const matrix = extractLiveCuratedMatrix();
    let ok = 0;
    let fail = 0;
    const failures: string[] = [];
    for (const row of matrix) {
      const cmp = compareLegacyVsDynamicParity({
        category: row.treatmentBranch,
        city: row.city,
        side: row.side,
        availableClinics: pool,
        migratedRules: migrated,
      });
      if (cmp.match) ok++;
      else {
        fail++;
        failures.push(
          `${row.treatmentBranch}/${row.city}/${row.side}: legacy=${cmp.legacyIds.join(",")} dyn=${cmp.dynamicIds.join(",")}`
        );
      }
    }
    expect(failures).toEqual([]);
    expect(fail).toBe(0);
    expect(ok).toBe(matrix.length);
  });

  it("Test B — Dynamic replacement changes future match", () => {
    const rules: AgencyMatchingRule[] = migrated.map((r) =>
      r.id === "dental__istanbul__anatolian"
        ? {
            ...r,
            clinicIds: [IDS.istanbulDisAkademisi, IDS.hospitadentMecidiyekoy],
            source: "agency_ui",
          }
        : r
    );
    const res = resolveAgencyClinicRecommendations({
      category: "dental",
      city: "istanbul",
      side: "anatolian",
      availableClinics: pool,
      agencyRules: rules,
      agencySlug: "feelinhealthy",
    });
    expect(res.source).toBe("agency_dynamic");
    expect(res.matchingCuratedClinics.map((c) => c.id)).toEqual([
      IDS.istanbulDisAkademisi,
      IDS.hospitadentMecidiyekoy,
    ]);
    expect(res.matchingCuratedClinics.map((c) => c.id)).not.toContain(IDS.hospitadentCamlica);
  });

  it("Test C — Reorder swaps clinic 1 / clinic 2", () => {
    const rules: AgencyMatchingRule[] = migrated.map((r) =>
      r.id === "dental__istanbul__european"
        ? {
            ...r,
            clinicIds: [IDS.bhtClinicIstanbulTema, IDS.hospitadentMecidiyekoy],
            source: "agency_ui",
          }
        : r
    );
    const res = resolveAgencyClinicRecommendations({
      category: "implant",
      city: "istanbul",
      side: "european",
      availableClinics: pool,
      agencyRules: rules,
      agencySlug: "feelinhealthy",
    });
    expect(res.matchingCuratedClinics.map((c) => c.id)).toEqual([
      IDS.bhtClinicIstanbulTema,
      IDS.hospitadentMecidiyekoy,
    ]);
  });

  it("Test D — Max 2 even if malformed config has >2", () => {
    const rules: AgencyMatchingRule[] = [
      {
        id: "dental__istanbul__european",
        agencyId: "feelinhealthy",
        treatmentBranch: "dental",
        city: "istanbul",
        side: "european",
        clinicIds: [
          IDS.hospitadentMecidiyekoy,
          IDS.bhtClinicIstanbulTema,
          IDS.istanbulDisAkademisi,
          IDS.westdentClinic,
        ],
        enabled: true,
        schemaVersion: 1,
        source: "agency_ui",
      },
    ];
    const res = resolveAgencyClinicRecommendations({
      category: "dental",
      city: "istanbul",
      side: "european",
      availableClinics: pool,
      agencyRules: rules,
      agencySlug: "feelinhealthy",
      maxClinics: 99,
    });
    expect(res.matchingCuratedClinics).toHaveLength(PLATFORM_MAX_RECOMMENDED_CLINICS);
    expect(res.matchingCuratedClinics).toHaveLength(FEELINHEALTHY_CONFIG.maxGuestClinics);
  });

  it("Test E — Inactive configured clinic is skipped; next eligible used", () => {
    const rules: AgencyMatchingRule[] = [
      {
        id: "dental__istanbul__anatolian",
        agencyId: "feelinhealthy",
        treatmentBranch: "dental",
        city: "istanbul",
        side: "anatolian",
        clinicIds: [IDS.istanbulDisAkademisi, IDS.hospitadentCamlica],
        enabled: true,
        schemaVersion: 1,
        source: "agency_ui",
      },
    ];
    const withInactive = pool.map((c) =>
      c.id === IDS.istanbulDisAkademisi ? { ...c, status: "inactive" } : c
    );
    const res = resolveAgencyClinicRecommendations({
      category: "dental",
      city: "istanbul",
      side: "anatolian",
      availableClinics: withInactive,
      agencyRules: rules,
      agencySlug: "feelinhealthy",
    });
    expect(res.matchingCuratedClinics.map((c) => c.id)).toEqual([IDS.hospitadentCamlica]);
    expect(res.matchingCuratedClinics.map((c) => c.id)).not.toContain(IDS.istanbulDisAkademisi);
  });

  it("Test F — Agency isolation: Agency A change does not affect Agency B", () => {
    const rulesA: AgencyMatchingRule[] = [
      {
        id: "dental__istanbul__european",
        agencyId: "agency-a",
        treatmentBranch: "dental",
        city: "istanbul",
        side: "european",
        clinicIds: [IDS.bhtClinicIstanbulTema],
        enabled: true,
        schemaVersion: 1,
        source: "agency_ui",
      },
    ];
    const rulesB: AgencyMatchingRule[] = [
      {
        id: "dental__istanbul__european",
        agencyId: "agency-b",
        treatmentBranch: "dental",
        city: "istanbul",
        side: "european",
        clinicIds: [IDS.hospitadentMecidiyekoy, IDS.bhtClinicIstanbulTema],
        enabled: true,
        schemaVersion: 1,
        source: "agency_ui",
      },
    ];
    const a = resolveAgencyClinicRecommendations({
      category: "dental",
      city: "istanbul",
      side: "european",
      availableClinics: pool,
      agencyRules: rulesA,
      agencyId: "agency-a",
    });
    const b = resolveAgencyClinicRecommendations({
      category: "dental",
      city: "istanbul",
      side: "european",
      availableClinics: pool,
      agencyRules: rulesB,
      agencyId: "agency-b",
    });
    expect(a.matchingCuratedClinics.map((c) => c.id)).toEqual([IDS.bhtClinicIstanbulTema]);
    expect(b.matchingCuratedClinics.map((c) => c.id)).toEqual([
      IDS.hospitadentMecidiyekoy,
      IDS.bhtClinicIstanbulTema,
    ]);
  });

  it("Test G — Missing config falls back to legacy curated for FeelinHealthy", () => {
    const legacy = getCuratedClinicsForFeelinHealthy(
      "dental",
      "istanbul",
      "european",
      pool
    );
    const res = resolveAgencyClinicRecommendations({
      category: "dental",
      city: "istanbul",
      side: "european",
      availableClinics: pool,
      agencyRules: [],
      agencySlug: "feelinhealthy",
    });
    expect(res.source).toBe("legacy_curated");
    expect(res.matchingCuratedClinics.map((c) => c.id)).toEqual(
      legacy.matchingCuratedClinics.map((c: any) => c.id)
    );
  });

  it("Test H — Intermed never in migration seed or FH dynamic resolve", () => {
    expect(() => assertNoIntermedInRules(migrated)).not.toThrow();
    const withIntermedForced: AgencyMatchingRule[] = [
      {
        id: "aesthetic_surgery__istanbul__european",
        agencyId: "feelinhealthy",
        treatmentBranch: "aesthetic_surgery",
        city: "istanbul",
        side: "european",
        clinicIds: [IDS.intermedNisantasi, IDS.bhtClinicIstanbulTema],
        enabled: true,
        schemaVersion: 1,
        source: "agency_ui",
      },
    ];
    const res = resolveAgencyClinicRecommendations({
      category: "aesthetic_surgery",
      city: "istanbul",
      side: "european",
      availableClinics: pool,
      agencyRules: withIntermedForced,
      agencySlug: "feelinhealthy",
    });
    expect(res.matchingCuratedClinics.map((c) => c.id)).not.toContain(IDS.intermedNisantasi);
    expect(res.matchingCuratedClinics.map((c) => c.id)).toEqual([IDS.bhtClinicIstanbulTema]);
    expect(
      sanitizeMatchingClinicIds([IDS.intermedNisantasi, IDS.bhtClinicIstanbulTema], {
        excludeIds: new Set([IDS.intermedNisantasi]),
      })
    ).toEqual([IDS.bhtClinicIstanbulTema]);
  });

  it("Test I — İstanbul Europe / Anatolia remain isolated", () => {
    const anatolian = resolveAgencyClinicRecommendations({
      category: "dental",
      city: "istanbul",
      side: "anatolian",
      availableClinics: pool,
      agencyRules: migrated,
      agencySlug: "feelinhealthy",
    });
    const european = resolveAgencyClinicRecommendations({
      category: "dental",
      city: "istanbul",
      side: "european",
      availableClinics: pool,
      agencyRules: migrated,
      agencySlug: "feelinhealthy",
    });
    expect(anatolian.matchingCuratedClinics.map((c) => c.id)).toEqual([
      IDS.istanbulDisAkademisi,
      IDS.hospitadentCamlica,
    ]);
    expect(european.matchingCuratedClinics.map((c) => c.id)).toEqual([
      IDS.hospitadentMecidiyekoy,
      IDS.bhtClinicIstanbulTema,
    ]);
    const overlap = anatolian.matchingCuratedClinics.filter((a) =>
      european.matchingCuratedClinics.some((e) => e.id === a.id)
    );
    expect(overlap).toHaveLength(0);
  });

  it("Test J — treatment-specific quote cycle still works with dynamic matching context", () => {
    const ctx = {
      quotesByTreatmentKey: {
        dental: { quoteId: "q1", clinicIds: [IDS.hospitadentMecidiyekoy] },
      },
      lastTreatmentCategory: "dental",
    } as any;
    expect(hasCompletedQuoteForTreatment(ctx, "dental")).toBe(true);
    expect(hasCompletedQuoteForTreatment(ctx, "aesthetic_surgery")).toBe(false);
    const match = resolveAgencyClinicRecommendations({
      category: "aesthetic_surgery",
      city: "istanbul",
      side: "anatolian",
      availableClinics: pool,
      agencyRules: migrated,
      agencySlug: "feelinhealthy",
    });
    expect(match.matchingCuratedClinics.map((c) => c.id)).toEqual([
      IDS.orionSurgeryCenter,
      IDS.lokmanHekimIstanbul,
    ]);
  });
});
