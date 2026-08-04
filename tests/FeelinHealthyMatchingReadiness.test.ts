import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  decideFeelinHealthyLocationNextStep,
  evaluateFeelinHealthyIntake,
  getClinicMatchingReadyReply,
  getCuratedClinicsForFeelinHealthy,
  isReadyForClinicMatching,
  FEELINHEALTHY_CONFIG,
} from "../lib/agency/feelinhealthyConfig";

const REPO_ROOT = resolve(__dirname, "..");
const route = readFileSync(
  resolve(REPO_ROOT, "app/api/public/agency/[slug]/matching-chat/route.ts"),
  "utf8"
);

const completeIntake = {
  quoteConsent: true,
  consentStatus: "accepted",
  lastTreatmentCategory: "implant",
  patientName: "Ahmet Yılmaz",
  firstName: "Ahmet",
  lastName: "Yılmaz",
  patientGender: "Erkek",
  patientAge: 35,
  patientEmail: "ahmet@example.com",
  patientPhone: "+905551234567",
  patientCountry: "Almanya",
  travelDate: "2026-09-15",
};

const dentalClinicPool = [
  {
    id: "hospitadent-mecidiyekoy",
    clinicSlug: "hospitadent-mecidiyekoy",
    clinicName: "Hospitadent Mecidiyeköy",
    treatmentCategories: ["dental"],
    location: { city: "İstanbul", address: "Mecidiyeköy" },
  },
  {
    id: "bht-clinic-istanbul-tema",
    clinicSlug: "bht-clinic-istanbul-tema",
    clinicName: "BHT Clinic İstanbul TEMA Hospital",
    treatmentCategories: ["dental"],
    location: { city: "İstanbul", address: "Halkalı" },
  },
  {
    id: "istanbul-dis-akademisi",
    clinicSlug: "istanbul-dis-akademisi",
    clinicName: "İstanbul Diş Akademisi",
    treatmentCategories: ["dental"],
    location: { city: "İstanbul", address: "Kadıköy" },
  },
  {
    id: "hospitadent-camlica",
    clinicSlug: "hospitadent-camlica",
    clinicName: "Hospitadent Çamlıca",
    treatmentCategories: ["dental"],
    location: { city: "İstanbul", address: "Üsküdar" },
  },
  {
    id: "westdent-clinic",
    clinicSlug: "westdent-clinic",
    clinicName: "Westdent Clinic",
    treatmentCategories: ["dental"],
    location: { city: "İzmir" },
  },
  {
    id: "beyazisik-izmir-dental-group",
    clinicSlug: "beyazisik-izmir-dental-group",
    clinicName: "Beyaz Işık İzmir Dental Group",
    treatmentCategories: ["dental"],
    location: { city: "İzmir" },
  },
  {
    id: "hospitadent-antalya",
    clinicSlug: "hospitadent-antalya",
    clinicName: "Hospitadent Antalya",
    treatmentCategories: ["dental"],
    location: { city: "Antalya" },
  },
  {
    id: "memorial-hospital",
    clinicSlug: "memorial-hospital",
    clinicName: "Memorial Antalya",
    treatmentCategories: ["dental"],
    location: { city: "Antalya" },
  },
  {
    id: "hospitadent-ankara",
    clinicSlug: "hospitadent-ankara",
    clinicName: "Hospitadent Ankara",
    treatmentCategories: ["dental"],
    location: { city: "Ankara" },
  },
  {
    id: "lokman-hekim-university-ankara-hospital",
    clinicSlug: "lokman-hekim-university-ankara-hospital",
    clinicName: "Lokman Hekim Ankara",
    treatmentCategories: ["dental"],
    location: { city: "Ankara" },
  },
];

function names(idsOrClinics: { clinicName: string }[]) {
  return idsOrClinics.map((c) => c.clinicName);
}

describe("FeelinHealthy matching readiness + curated results", () => {
  it("Test 1: Implant + İstanbul + European Side + complete intake", () => {
    const ctx = {
      ...completeIntake,
      selectedCity: "istanbul",
      locationSelectionConfirmed: true,
      istanbul_side: "european" as const,
      sideSelectionConfirmed: true,
    };

    expect(evaluateFeelinHealthyIntake(ctx).allGroupsComplete).toBe(true);
    expect(isReadyForClinicMatching(ctx).ready).toBe(true);
    expect(decideFeelinHealthyLocationNextStep(ctx, [], "tr").step).toBe("ready");

    const res = getCuratedClinicsForFeelinHealthy("implant", "istanbul", "european", dentalClinicPool);
    expect(res.matchingCuratedClinics).toHaveLength(2);
    expect(res.matchingCuratedClinics.length).toBeLessThanOrEqual(FEELINHEALTHY_CONFIG.maxGuestClinics);
    expect(names(res.matchingCuratedClinics)).toEqual([
      "Hospitadent Mecidiyeköy",
      "BHT Clinic İstanbul TEMA Hospital",
    ]);
    expect(names(res.matchingCuratedClinics)).not.toContain("İstanbul Diş Akademisi");
  });

  it("Test 2: Implant + İstanbul + Anatolian Side + complete intake", () => {
    const ctx = {
      ...completeIntake,
      selectedCity: "istanbul",
      locationSelectionConfirmed: true,
      istanbul_side: "anatolian" as const,
      sideSelectionConfirmed: true,
    };

    expect(isReadyForClinicMatching(ctx).ready).toBe(true);

    const res = getCuratedClinicsForFeelinHealthy("implant", "istanbul", "anatolian", dentalClinicPool);
    expect(res.matchingCuratedClinics).toHaveLength(2);
    expect(names(res.matchingCuratedClinics)).toEqual([
      "İstanbul Diş Akademisi",
      "Hospitadent Çamlıca",
    ]);
    expect(names(res.matchingCuratedClinics)).not.toContain("Hospitadent Mecidiyeköy");
  });

  it("Test 3: Implant + İzmir + complete intake (no Istanbul side card)", () => {
    const ctx = {
      ...completeIntake,
      selectedCity: "izmir",
      locationSelectionConfirmed: true,
      lastLocation: "İzmir",
    };

    const location = decideFeelinHealthyLocationNextStep(ctx, [], "tr");
    expect(location.step).toBe("ready");
    expect(location.city).toBe("izmir");
    expect(isReadyForClinicMatching(ctx).ready).toBe(true);

    const res = getCuratedClinicsForFeelinHealthy("implant", "izmir", null, dentalClinicPool);
    expect(res.matchingCuratedClinics).toHaveLength(2);
    expect(names(res.matchingCuratedClinics)).toEqual([
      "Westdent Clinic",
      "Beyaz Işık İzmir Dental Group",
    ]);
    expect(names(res.matchingCuratedClinics)).not.toContain("Hospitadent Mecidiyeköy");
  });

  it("Test 4: city after intake remains complete and matching can run", () => {
    const beforeCity = { ...completeIntake };
    expect(evaluateFeelinHealthyIntake(beforeCity).allGroupsComplete).toBe(true);
    expect(isReadyForClinicMatching(beforeCity).missing).toContain("city");

    // Structured city action only updates location — intake fields untouched.
    const afterCity = {
      ...beforeCity,
      selectedCity: "antalya",
      locationSelectionConfirmed: true,
      lastLocation: "Antalya",
    };

    expect(evaluateFeelinHealthyIntake(afterCity).allGroupsComplete).toBe(true);
    expect(afterCity.patientName).toBe(beforeCity.patientName);
    expect(afterCity.patientEmail).toBe(beforeCity.patientEmail);
    expect(afterCity.travelDate).toBe(beforeCity.travelDate);
    expect(isReadyForClinicMatching(afterCity).ready).toBe(true);

    const res = getCuratedClinicsForFeelinHealthy("implant", "antalya", null, dentalClinicPool);
    expect(names(res.matchingCuratedClinics)).toEqual([
      "Hospitadent Antalya",
      "Memorial Antalya",
    ]);
  });

  it("Test 5: Istanbul then European Side persists and matches once (no duplicates)", () => {
    const afterIstanbul = {
      ...completeIntake,
      selectedCity: "istanbul",
      locationSelectionConfirmed: true,
      lastLocation: "İstanbul",
    };
    expect(isReadyForClinicMatching(afterIstanbul).ready).toBe(false);
    expect(isReadyForClinicMatching(afterIstanbul).missing).toContain("istanbul_side");
    expect(decideFeelinHealthyLocationNextStep(afterIstanbul, [], "tr").step).toBe("ask_side");

    const afterSide = {
      ...afterIstanbul,
      istanbul_side: "european" as const,
      sideSelectionConfirmed: true,
      lastLocation: "İstanbul Avrupa Yakası",
    };
    expect(afterSide.selectedCity).toBe("istanbul");
    expect(afterSide.istanbul_side).toBe("european");
    expect(afterSide.patientName).toBe(completeIntake.patientName);
    expect(isReadyForClinicMatching(afterSide).ready).toBe(true);

    const res = getCuratedClinicsForFeelinHealthy("implant", "istanbul", "european", dentalClinicPool);
    const ids = res.matchingCuratedClinics.map((c) => c.id);
    expect(ids).toEqual(["hospitadent-mecidiyekoy", "bht-clinic-istanbul-tema"]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeLessThanOrEqual(2);
  });

  it("also covers Dental Ankara curated IDs", () => {
    const res = getCuratedClinicsForFeelinHealthy("dental", "ankara", null, dentalClinicPool);
    expect(names(res.matchingCuratedClinics)).toEqual([
      "Hospitadent Ankara",
      "Lokman Hekim Ankara",
    ]);
  });

  it("uses human clinic-ready copy (not system jargon)", () => {
    expect(getClinicMatchingReadyReply("tr", 2)).toBe(
      "Teşekkürler. Tercihlerinize uygun iki sağlık kuruluşunu hazırladım."
    );
    expect(getClinicMatchingReadyReply("en", 2)).toBe(
      "Thank you. I’ve prepared two healthcare providers that match your preferences."
    );
    expect(getClinicMatchingReadyReply("tr", 2).toLowerCase()).not.toContain("matching");
    expect(getClinicMatchingReadyReply("en", 2).toLowerCase()).not.toContain("backend");
  });

  it("isReadyForClinicMatching is the single canonical gate", () => {
    expect(isReadyForClinicMatching({}).ready).toBe(false);
    expect(isReadyForClinicMatching({}).missing).toEqual(
      expect.arrayContaining(["consent", "treatment", "intake_group1"])
    );

    expect(route).toContain("isReadyForClinicMatching");
    expect(route).toContain("getClinicMatchingReadyReply");
    expect(route).toContain("structuredLocationAction");
    expect(route).toContain("locationSelectionConfirmed = true");
    expect(route).toContain("sideSelectionConfirmed = true");
    // City/side actions must not merge intake slots.
    expect(route).toContain("!isReplayedTreatmentRequest && !structuredLocationAction");
    // Matching runs before lead/followup short-circuit.
    const matchingIdx = route.indexOf("CLINIC MATCHING OR RECOMMENDATION");
    const leadIdx = route.indexOf("SHOULD CREATE LEAD (only after clinic matching");
    expect(matchingIdx).toBeGreaterThan(-1);
    expect(leadIdx).toBeGreaterThan(matchingIdx);
  });

  it("never restarts Group 1 after a structured Istanbul city preference message when intake is complete", () => {
    const ctx = {
      ...completeIntake,
      selectedCity: "istanbul",
      locationSelectionConfirmed: true,
    };
    const intake = evaluateFeelinHealthyIntake(ctx);
    expect(intake.allGroupsComplete).toBe(true);
    expect(intake.currentGroup).toBe("completed");
    // Group 1 prompt must not be the next step — side selection is.
    expect(decideFeelinHealthyLocationNextStep(ctx, [], "tr").step).toBe("ask_side");
  });
});
