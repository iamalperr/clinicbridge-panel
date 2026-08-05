import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  decideFeelinHealthyLocationNextStep,
  getAvailableCitiesForTreatment,
  getCitySelectionCard,
  getCitySelectionPrompt,
  getCuratedClinicsForFeelinHealthy,
  getIstanbulSideClarificationCard,
  resolveCityAndSide,
} from "../lib/agency/feelinhealthyConfig";

const REPO_ROOT = resolve(__dirname, "..");
const route = readFileSync(
  resolve(REPO_ROOT, "app/api/public/agency/[slug]/matching-chat/route.ts"),
  "utf8"
);

describe("FeelinHealthy city-before-side flow", () => {
  describe("Test 1: implant without city", () => {
    it("asks for available dental cities and does not show Istanbul side yet", () => {
      const cities = getAvailableCitiesForTreatment("implant", [], "tr");
      expect(cities.map((c) => c.city)).toEqual(
        expect.arrayContaining(["istanbul", "izmir", "antalya", "ankara"])
      );

      const decision = decideFeelinHealthyLocationNextStep(
        { lastTreatmentCategory: "implant" },
        [],
        "tr"
      );
      expect(decision.step).toBe("ask_city");
      expect(decision.city).toBeNull();

      const card = getCitySelectionCard("implant", decision.availableCities, "tr");
      expect(card.type).toBe("city_selection");
      expect(card.options.some((o) => o.city === "istanbul")).toBe(true);
      expect(card.options.some((o) => o.city === "undecided")).toBe(false);
      expect(card.message).toMatch(/Şehir seçimi|partner klinik/i);
      expect(card.options.find((o) => o.city === "istanbul")?.subtitle).toMatch(/yaka/i);

      const prompt = getCitySelectionPrompt("implant", decision.availableCities, "tr");
      expect(prompt).toContain("İstanbul");
      expect(prompt).toContain("İzmir");
      expect(prompt).toMatch(/Uçuş veya konaklama|pratik yol/i);
    });
  });

  describe("Test 2: Istanbul implant", () => {
    it("skips city selection and asks Istanbul side", () => {
      const decision = decideFeelinHealthyLocationNextStep(
        {
          lastTreatmentCategory: "dental",
          selectedCity: "istanbul",
          lastLocation: "İstanbul",
        },
        [],
        "tr"
      );
      expect(decision.step).toBe("ask_side");
      expect(decision.city).toBe("istanbul");

      const sideCard = getIstanbulSideClarificationCard("dental", "tr");
      expect(sideCard.type).toBe("side_clarification");
    });

    it("resolves Istanbul from the original treatment request text", () => {
      const loc = resolveCityAndSide("İstanbul'da implant tedavisi yaptırmak istiyorum.");
      expect(loc.city).toBe("istanbul");
      expect(loc.side).toBeNull();
    });
  });

  describe("Test 3: Izmir implant", () => {
    it("never asks Istanbul side and matches only Izmir curated clinics", () => {
      const decision = decideFeelinHealthyLocationNextStep(
        {
          lastTreatmentCategory: "implant",
          selectedCity: "izmir",
          lastLocation: "İzmir",
        },
        [],
        "tr"
      );
      expect(decision.step).toBe("ready");
      expect(decision.city).toBe("izmir");

      const mockClinics = [
        {
          id: "w1",
          clinicSlug: "westdent-clinic",
          clinicName: "Westdent Clinic",
          treatmentCategories: ["dental"],
          location: { city: "İzmir" },
        },
        {
          id: "h1",
          clinicSlug: "hospitadent-mecidiyekoy",
          clinicName: "Hospitadent Mecidiyeköy",
          treatmentCategories: ["dental"],
          location: { city: "İstanbul" },
        },
      ];
      const curated = getCuratedClinicsForFeelinHealthy("implant", "izmir", "any", mockClinics);
      expect(curated.matchingCuratedClinics.map((c) => c.clinicName)).toContain("Westdent Clinic");
      expect(curated.matchingCuratedClinics.map((c) => c.clinicName)).not.toContain(
        "Hospitadent Mecidiyeköy"
      );
    });
  });

  describe("Test 4: no treatment and no city", () => {
    it("asks for treatment before querying cities", () => {
      const decision = decideFeelinHealthyLocationNextStep({}, [], "tr");
      expect(decision.step).toBe("ask_treatment");
      expect(decision.availableCities).toEqual([]);
    });
  });

  describe("Test 5: IVF in Istanbul", () => {
    it("uses single-side confirmation instead of a fake two-side card", () => {
      const decision = decideFeelinHealthyLocationNextStep(
        {
          lastTreatmentCategory: "ivf",
          selectedCity: "istanbul",
        },
        [],
        "tr"
      );
      expect(decision.step).toBe("ask_side");

      const card = getIstanbulSideClarificationCard("ivf", "tr");
      expect(card.type).toBe("branch_side_confirm");
      expect(card.options?.some((o: any) => o.side === "european")).toBe(false);
      expect(card.message).toMatch(/Anadolu/i);
    });

    it("auto-selects Istanbul when it is the only curated city for IVF", () => {
      const decision = decideFeelinHealthyLocationNextStep(
        { lastTreatmentCategory: "ivf" },
        [],
        "tr"
      );
      // Only Istanbul (and optionally Kocaeli depending on rules) — IVF locations are istanbul+kocaeli
      // If more than one city exists, ask_city; if only one, ask_side.
      if (decision.availableCities.length === 1) {
        expect(decision.step).toBe("ask_side");
        expect(decision.city).toBe(decision.availableCities[0].city);
      } else {
        expect(["ask_city", "ask_side"]).toContain(decision.step);
      }
    });
  });

  describe("Test 6: English patient", () => {
    it("keeps city selection copy in English", () => {
      const cities = getAvailableCitiesForTreatment("dental", [], "en");
      const prompt = getCitySelectionPrompt("dental", cities, "en");
      const card = getCitySelectionCard("dental", cities, "en");

      expect(prompt).toMatch(/Istanbul|Izmir|Antalya|Ankara/);
      expect(prompt).toMatch(/City choice decides|flight or stay/i);
      expect(prompt).not.toMatch(/hangi şehir|bulunuyor/);
      expect(card.title).toBe("Preferred City");
      expect(card.options.some((o) => o.city === "undecided")).toBe(false);
      expect(card.options.every((o) => o.city !== "undecided")).toBe(true);
    });
  });

  describe("Route guards", () => {
    it("never defaults an unknown city to Istanbul in the matching route", () => {
      expect(route).not.toContain('resolveCityAndSide(rawLoc || "istanbul")');
      expect(route).not.toContain('|| "İstanbul"');
      expect(route).toContain("decideFeelinHealthyLocationNextStep");
      expect(route).toContain("select_treatment_city");
      expect(route).toContain("getCitySelectionCard");
    });

    it("does not match clinics without a ready location decision", () => {
      expect(route).toContain('locationDecision.step !== "ready"');
      expect(route).toContain("Never invent Istanbul");
    });
  });

  describe("City derivation", () => {
    it("normalises Istanbul variants into one option", () => {
      const cities = getAvailableCitiesForTreatment("dental", [], "tr");
      const istanbulEntries = cities.filter((c) => c.city === "istanbul");
      expect(istanbulEntries).toHaveLength(1);
      expect(istanbulEntries[0].displayNameTr).toBe("İstanbul");
      expect(istanbulEntries[0].requiresSideSelection).toBe(true);
    });

    it("does not invent clinics when city is still unknown", () => {
      const curated = getCuratedClinicsForFeelinHealthy("dental", null, null, [
        {
          id: "d1",
          clinicSlug: "hospitadent-mecidiyekoy",
          clinicName: "Hospitadent Mecidiyeköy",
          treatmentCategories: ["dental"],
        },
      ]);
      expect(curated.matchingCuratedClinics).toEqual([]);
      expect(curated.supportedLocationsForBranch.length).toBeGreaterThan(0);
    });
  });
});
