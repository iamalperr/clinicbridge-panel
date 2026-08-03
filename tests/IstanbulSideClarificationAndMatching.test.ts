import { describe, it, expect } from "vitest";
import {
  resolveIstanbulSideFromText,
  resolveCityAndSide,
  getBranchIstanbulSideAvailability,
  getIstanbulSideClarificationCard,
  getSideGuidancePrompt,
  formatClinicCardLocation,
  getCuratedClinicsForFeelinHealthy,
} from "../lib/agency/feelinhealthyConfig";

describe("Istanbul Side Clarification & FeelinHealthy Curated Routing", () => {
  // Test 1: Hair Transplant in Istanbul without Side -> Triggers side clarification
  it("Test 1: Hair transplant in Istanbul without side returns clarification requirement", () => {
    const card = getIstanbulSideClarificationCard("hair_transplant", "tr");
    expect(card.type).toBe("side_clarification");
    expect(card.options.length).toBe(3);
    expect(card.options.map(o => o.side)).toEqual(["european", "anatolian", "unsure"]);
  });

  // Test 2: Hair Transplant in Istanbul with European Side -> European clinics only
  it("Test 2: Hair transplant with European side returns European clinics only", () => {
    const mockClinics = [
      { id: "c1", clinicSlug: "bht-tema", clinicName: "BHT Clinic İstanbul TEMA", treatmentCategories: ["hair_transplant"], location: { city: "İstanbul", address: "Halkalı" } },
      { id: "c2", clinicSlug: "lokman-istanbul", clinicName: "Lokman Hekim İstanbul", treatmentCategories: ["hair_transplant"], location: { city: "İstanbul", address: "Kurtköy" } },
    ];
    const res = getCuratedClinicsForFeelinHealthy("hair_transplant", "istanbul", "european", mockClinics);
    expect(res.isUnsupportedLocation).toBe(false);
    expect(res.locationRule?.side).toBe("european");
  });

  // Test 3: Hair Transplant in Istanbul with Anatolian Side -> Anatolian clinics only
  it("Test 3: Hair transplant with Anatolian side returns Anatolian clinics only", () => {
    const mockClinics = [
      { id: "c1", clinicSlug: "bht-tema", clinicName: "BHT Clinic İstanbul TEMA", treatmentCategories: ["hair_transplant"], location: { city: "İstanbul", address: "Halkalı" } },
      { id: "c2", clinicSlug: "lokman-istanbul", clinicName: "Lokman Hekim İstanbul", treatmentCategories: ["hair_transplant"], location: { city: "İstanbul", address: "Kurtköy" } },
    ];
    const res = getCuratedClinicsForFeelinHealthy("hair_transplant", "istanbul", "anatolian", mockClinics);
    expect(res.isUnsupportedLocation).toBe(false);
    expect(res.locationRule?.side).toBe("anatolian");
  });

  // Test 4: Dental in Istanbul with European Side -> European clinics only
  it("Test 4: Dental in Istanbul with European side returns European clinics only", () => {
    const mockClinics = [
      { id: "d1", clinicSlug: "hospitadent-mecidiyekoy", clinicName: "Hospitadent Mecidiyeköy", treatmentCategories: ["dental"], location: { city: "İstanbul", address: "Mecidiyeköy" } },
      { id: "d2", clinicSlug: "istanbul-dis-akademisi", clinicName: "İstanbul Diş Akademisi", treatmentCategories: ["dental"], location: { city: "İstanbul", address: "Kadıköy" } },
    ];
    const res = getCuratedClinicsForFeelinHealthy("dental", "istanbul", "european", mockClinics);
    expect(res.matchingCuratedClinics.map(c => c.clinicName)).toContain("Hospitadent Mecidiyeköy");
    expect(res.matchingCuratedClinics.map(c => c.clinicName)).not.toContain("İstanbul Diş Akademisi");
  });

  // Test 5: Dental in Istanbul with Anatolian Side -> Anatolian clinics only
  it("Test 5: Dental in Istanbul with Anatolian side returns Anatolian clinics only", () => {
    const mockClinics = [
      { id: "d1", clinicSlug: "hospitadent-mecidiyekoy", clinicName: "Hospitadent Mecidiyeköy", treatmentCategories: ["dental"], location: { city: "İstanbul", address: "Mecidiyeköy" } },
      { id: "d2", clinicSlug: "istanbul-dis-akademisi", clinicName: "İstanbul Diş Akademisi", treatmentCategories: ["dental"], location: { city: "İstanbul", address: "Kadıköy" } },
    ];
    const res = getCuratedClinicsForFeelinHealthy("dental", "istanbul", "anatolian", mockClinics);
    expect(res.matchingCuratedClinics.map(c => c.clinicName)).toContain("İstanbul Diş Akademisi");
    expect(res.matchingCuratedClinics.map(c => c.clinicName)).not.toContain("Hospitadent Mecidiyeköy");
  });

  // Test 6: Dental in Izmir -> Westdent / Beyaz Işık (Side not asked)
  it("Test 6: Dental in Izmir returns Izmir clinics without asking side", () => {
    const loc = resolveCityAndSide("İzmir");
    expect(loc.city).toBe("izmir");
    expect(loc.side).toBe("any");
  });

  // Test 7: Cardiology in Istanbul -> Anatolian side (Anadolu Medical Center)
  it("Test 7: Cardiology branch availability resolves properly", () => {
    const avail = getBranchIstanbulSideAvailability("cardiology");
    expect(avail.hasAnatolian).toBe(true);
  });

  // Test 8: Eye treatments in Istanbul -> European side (Dünyagöz Etiler / Ataköy)
  it("Test 8: Eye treatments in Istanbul resolves to European side", () => {
    const avail = getBranchIstanbulSideAvailability("eye_treatments");
    expect(avail.hasEuropean).toBe(true);
  });

  // Test 9: Airport IST -> Automatically resolves to European Side
  it("Test 9: IST airport resolves to European side", () => {
    const res1 = resolveIstanbulSideFromText("IST havalimanına ineceğim");
    expect(res1.side).toBe("european");
    expect(res1.source).toBe("airport_cue");

    const res2 = resolveIstanbulSideFromText("İstanbul Havalimanı transferi istiyorum");
    expect(res2.side).toBe("european");
    expect(res2.source).toBe("airport_cue");
  });

  // Test 10: Airport SAW -> Automatically resolves to Anatolian Side
  it("Test 10: SAW airport resolves to Anatolian side", () => {
    const res1 = resolveIstanbulSideFromText("Sabiha Gökçen havalimanına iniş yapacağım");
    expect(res1.side).toBe("anatolian");
    expect(res1.source).toBe("airport_cue");

    const res2 = resolveIstanbulSideFromText("SAW airport arrival");
    expect(res2.side).toBe("anatolian");
    expect(res2.source).toBe("airport_cue");
  });

  // Test 11: District Taksim/Beşiktaş -> Automatically resolves to European Side
  it("Test 11: European districts resolve to European side", () => {
    expect(resolveIstanbulSideFromText("Taksim civarında otelde kalacağım").side).toBe("european");
    expect(resolveIstanbulSideFromText("Beşiktaş veya Şişli olsun").side).toBe("european");
    expect(resolveIstanbulSideFromText("Mecidiyeköy").side).toBe("european");
    expect(resolveIstanbulSideFromText("Bakırköy").side).toBe("european");
  });

  // Test 12: District Kadıköy/Üsküdar -> Automatically resolves to Anatolian Side
  it("Test 12: Anatolian districts resolve to Anatolian side", () => {
    expect(resolveIstanbulSideFromText("Kadıköy'de kalıyorum").side).toBe("anatolian");
    expect(resolveIstanbulSideFromText("Ataşehir veya Üsküdar").side).toBe("anatolian");
    expect(resolveIstanbulSideFromText("Kurtköy Sabiha yakınları").side).toBe("anatolian");
    expect(resolveIstanbulSideFromText("Çamlıca").side).toBe("anatolian");
  });

  // Test 13: "Emin Değilim" -> Guidance prompt explaining IST vs SAW airports
  it("Test 13: Emin Değilim produces airport guidance prompt", () => {
    const trPrompt = getSideGuidancePrompt(null, "tr");
    expect(trPrompt).toContain("İstanbul Havalimanı");
    expect(trPrompt).toContain("Sabiha Gökçen");

    const enPrompt = getSideGuidancePrompt(null, "en");
    expect(enPrompt).toContain("Istanbul Airport (IST)");
    expect(enPrompt).toContain("Sabiha Gökçen Airport (SAW)");
  });

  // Test 14: Dynamic side switch (European -> Anatolian)
  it("Test 14: Dynamic side switch clears and updates location properly", () => {
    const firstChoice = resolveIstanbulSideFromText("Avrupa Yakası");
    expect(firstChoice.side).toBe("european");

    const switchedChoice = resolveIstanbulSideFromText("Vazgeçtim, Anadolu Yakası olsun");
    expect(switchedChoice.side).toBe("anatolian");
  });

  // Test 15: Single side branch user rejects -> Offers alternatives
  it("Test 15: Single side branch clarification card renders confirmation type", () => {
    const card = getIstanbulSideClarificationCard("cardiology", "tr");
    expect(card.type).toBe("branch_side_confirm");
    expect(card.options.length).toBe(2);
  });

  // Test 16: Clinic card location formatter outputs explicit side
  it("Test 16: Clinic card location displays explicit side and district", () => {
    const euroClinic = {
      location: { city: "İstanbul", address: "Mecidiyeköy, Şişli" },
      district: "Mecidiyeköy",
    };
    const euroLabelTr = formatClinicCardLocation(euroClinic, "tr");
    expect(euroLabelTr).toContain("Avrupa Yakası");

    const anatolianClinic = {
      location: { city: "İstanbul", address: "Kadıköy, İstanbul" },
      district: "Kadıköy",
    };
    const anatolianLabelTr = formatClinicCardLocation(anatolianClinic, "tr");
    expect(anatolianLabelTr).toContain("Anadolu Yakası");
  });

  // Test 17: Non-Istanbul city (Antalya) never asks for Istanbul side
  it("Test 17: Antalya or non-Istanbul request does not ask for Istanbul side", () => {
    const loc = resolveCityAndSide("Antalya");
    expect(loc.city).toBe("antalya");
    expect(loc.side).toBe("any");
  });
});
