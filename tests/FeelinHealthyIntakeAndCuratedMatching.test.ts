import { describe, it, expect } from "vitest";
import {
  resolveCityAndSide,
  getCuratedClinicsForFeelinHealthy,
  evaluateFeelinHealthyIntake,
  getGroupIntakePrompt,
  getUnsupportedLocationPrompt,
  calculateAdditionalCountAndConversion,
} from "../lib/agency/feelinhealthyConfig";

describe("FeelinHealthy Curated Clinic Matching & Location Resolver", () => {
  it("correctly identifies Istanbul European vs Asian side districts", () => {
    expect(resolveCityAndSide("Şişli")).toEqual({ city: "istanbul", side: "european" });
    expect(resolveCityAndSide("Bakırköy")).toEqual({ city: "istanbul", side: "european" });
    expect(resolveCityAndSide("Mecidiyeköy")).toEqual({ city: "istanbul", side: "european" });
    expect(resolveCityAndSide("Göktürk")).toEqual({ city: "istanbul", side: "european" });
    expect(resolveCityAndSide("Fatih")).toEqual({ city: "istanbul", side: "european" });
    expect(resolveCityAndSide("Avrupa Yakası")).toEqual({ city: "istanbul", side: "european" });

    expect(resolveCityAndSide("Kadıköy")).toEqual({ city: "istanbul", side: "anatolian" });
    expect(resolveCityAndSide("Şerifali")).toEqual({ city: "istanbul", side: "anatolian" });
    expect(resolveCityAndSide("Ümraniye")).toEqual({ city: "istanbul", side: "anatolian" });
    expect(resolveCityAndSide("Ataşehir")).toEqual({ city: "istanbul", side: "anatolian" });
    expect(resolveCityAndSide("Anadolu Yakası")).toEqual({ city: "istanbul", side: "anatolian" });
  });

  it("correctly identifies non-Istanbul cities", () => {
    expect(resolveCityAndSide("Antalya")).toEqual({ city: "antalya", side: "any" });
    expect(resolveCityAndSide("Alanya")).toEqual({ city: "antalya", side: "any" });
    expect(resolveCityAndSide("İzmir")).toEqual({ city: "izmir", side: "any" });
    expect(resolveCityAndSide("Ankara")).toEqual({ city: "ankara", side: "any" });
  });

  const mockClinics = [
    { id: "HXMlMPZ74AXkXoR4sEnH", clinicSlug: "hospitadent-dental-group-mecidiyekoy", clinicName: "Hospitadent Dental Group Mecidiyeköy", treatmentCategories: ["dental"], location: { city: "İstanbul", address: "Mecidiyeköy, Şişli" } },
    { id: "Ab1OHdC020XOG4TWpR2r", slug: "bht-clinic-istanbul-tema-hastanesi", clinicName: "BHT Clinic İstanbul Tema Hastanesi", treatmentCategories: ["dental"], location: { city: "İstanbul", address: "Halkalı" } },
    { id: "9lYESxsLYFM1w4oebubu", clinicSlug: "istanbul-dis-akademisi", clinicName: "İstanbul Diş Akademisi", treatmentCategories: ["dental"], location: { city: "İstanbul", address: "Kadıköy" } },
    { id: "SUEtM1vwxLkidYvH0cLR", clinicSlug: "hospitadent-dental-group-camlica", clinicName: "Hospitadent Dental Group Çamlıca", treatmentCategories: ["dental"], location: { city: "İstanbul", address: "Üsküdar" } },
    { id: "jOfAk5EVmhPHzpfT0HX1", clinicSlug: "hospitadent-dental-group-antalya", clinicName: "Hospitadent Dental Group Antalya", treatmentCategories: ["dental"], location: { city: "Antalya", address: "Muratpaşa" } },
    { id: "dunyagoz-etiler", clinicSlug: "dunyagoz-etiler", clinicName: "Dünyagöz Etiler", treatmentCategories: ["eye_treatments"], location: { city: "İstanbul", address: "Etiler Beşiktaş" } },
    { id: "KY7x141fXMg5oIWHjBnQ", slug: "dunyagoz-atakoy", clinicName: "Dünyagöz Ataköy", treatmentCategories: ["eye_treatments"], location: { city: "İstanbul", address: "Ataköy Bakırköy" } },
    { id: "l5zwxhtDlxSqqCu8AArk", slug: "dunyagoz-antalya", clinicName: "Dünyagöz Antalya", treatmentCategories: ["eye_treatments"], location: { city: "Antalya", address: "Antalya" } },
    { id: "CnjF1vlliz4vM7IRRWKr", slug: "anadolu-medical-center", clinicName: "Anadolu Medical Center", treatmentCategories: ["oncology", "cardiology", "check_up"], location: { city: "Kocaeli", address: "Gebze" } },
  ];

  it("filters dental clinics in Istanbul Avrupa side", () => {
    const res = getCuratedClinicsForFeelinHealthy("dental", "istanbul", "european", mockClinics);
    expect(res.isUnsupportedLocation).toBe(false);
    expect(res.matchingCuratedClinics.length).toBeGreaterThan(0);
    const names = res.matchingCuratedClinics.map(c => c.clinicName);
    expect(names).toContain("Hospitadent Dental Group Mecidiyeköy");
    expect(names).toContain("BHT Clinic İstanbul Tema Hastanesi");
    expect(names).not.toContain("İstanbul Diş Akademisi");
  });

  it("filters dental clinics in Istanbul Anadolu side", () => {
    const res = getCuratedClinicsForFeelinHealthy("dental", "istanbul", "anatolian", mockClinics);
    expect(res.isUnsupportedLocation).toBe(false);
    const names = res.matchingCuratedClinics.map(c => c.clinicName);
    expect(names).toContain("İstanbul Diş Akademisi");
    expect(names).not.toContain("Hospitadent Dental Group Mecidiyeköy");
  });

  it("flags unsupported location for branch and returns alternatives", () => {
    // Eye care in Ankara (when Dünyagöz in config is only in Istanbul & Antalya)
    const res = getCuratedClinicsForFeelinHealthy("eye_treatments", "ankara", null, mockClinics);
    expect(res.isUnsupportedLocation).toBe(true);
    expect(res.supportedLocationsForBranch).toBeDefined();
    expect(res.supportedLocationsForBranch.length).toBeGreaterThan(0);
  });
});

describe("FeelinHealthy Deterministic Intake Flow (No Budget)", () => {
  it("enforces Group 1 (Name, Age, Gender) when no fields are present", () => {
    const ctx = {};
    const evalRes = evaluateFeelinHealthyIntake(ctx);
    expect(evalRes.currentGroup).toBe(1);
    expect(evalRes.missingFieldsInCurrentGroup).toEqual(["patientName", "patientAge", "patientGender"]);
    expect(evalRes.allGroupsComplete).toBe(false);

    const promptTr = getGroupIntakePrompt(evalRes, ctx, "tr");
    expect(promptTr).toContain("adınızı");
    expect(promptTr).toContain("soyadınızı");
    expect(promptTr).toContain("yaşınızı");
    expect(promptTr).toContain("cinsiyetinizi");
    expect(promptTr.toLowerCase()).not.toContain("bütçe");
    expect(promptTr.toLowerCase()).not.toContain("budget");
  });

  it("enforces Group 1 partial answers without skipping", () => {
    const ctx = { patientName: "Ahmet Yılmaz" };
    const evalRes = evaluateFeelinHealthyIntake(ctx);
    expect(evalRes.currentGroup).toBe(1);
    expect(evalRes.missingFieldsInCurrentGroup).toEqual(["patientAge", "patientGender"]);
    expect(evalRes.allGroupsComplete).toBe(false);

    // Only ask for what is still missing — do not force restating the name.
    const promptTr = getGroupIntakePrompt(evalRes, ctx, "tr");
    expect(promptTr).toContain("yaşınızı");
    expect(promptTr).toContain("cinsiyetinizi");
    expect(promptTr).not.toContain("tek bir mesajda");
  });

  it("advances to Group 2 (Email, Phone, Country) when Group 1 is complete", () => {
    const ctx = {
      patientName: "Ahmet Yılmaz",
      patientAge: 35,
      patientGender: "Erkek"
    };
    const evalRes = evaluateFeelinHealthyIntake(ctx);
    expect(evalRes.currentGroup).toBe(2);
    expect(evalRes.missingFieldsInCurrentGroup).toEqual(["patientEmail", "patientPhone", "patientCountry"]);
    expect(evalRes.allGroupsComplete).toBe(false);

    const promptTr = getGroupIntakePrompt(evalRes, ctx, "tr");
    expect(promptTr.toLowerCase()).toContain("e-posta");
    expect(promptTr.toLowerCase()).toContain("telefon");
    expect(promptTr.toLowerCase()).not.toContain("whatsapp");
    expect(promptTr.toLowerCase()).not.toContain("bütçe");
  });

  it("advances to Group 3 (Travel Date) when Group 1 and 2 are complete", () => {
    const ctx = {
      patientName: "Ahmet Yılmaz",
      patientAge: 35,
      patientGender: "Erkek",
      patientEmail: "ahmet@example.com",
      patientPhone: "+905551234567",
      patientCountry: "Almanya"
    };
    const evalRes = evaluateFeelinHealthyIntake(ctx);
    expect(evalRes.currentGroup).toBe(3);
    expect(evalRes.missingFieldsInCurrentGroup).toEqual(["travelDate"]);
    expect(evalRes.allGroupsComplete).toBe(false);

    const promptTr = getGroupIntakePrompt(evalRes, ctx, "tr");
    expect(promptTr).toMatch(/ne zaman gelmeyi düşünüyorsunuz|seyahatinizi/i);
    expect(promptTr.toLowerCase()).not.toContain("bütçe");
  });

  it("marks intake as complete when all 3 groups are populated", () => {
    const ctx = {
      patientName: "Ahmet Yılmaz",
      patientAge: 35,
      patientGender: "Erkek",
      patientEmail: "ahmet@example.com",
      patientPhone: "+905551234567",
      patientCountry: "Almanya",
      travelDate: "2026-09-15"
    };
    const evalRes = evaluateFeelinHealthyIntake(ctx);
    expect(evalRes.currentGroup).toBe("completed");
    expect(evalRes.missingFieldsInCurrentGroup).toEqual([]);
    expect(evalRes.allGroupsComplete).toBe(true);
  });
});

describe("FeelinHealthy Conversion & Additional Clinics Calculation", () => {
  it("calculates patient-specific additional eligible count", () => {
    const res = calculateAdditionalCountAndConversion(6, 2, "tr");
    expect(res.additionalCount).toBe(4);
    expect(res.conversionMessage).toContain("4 sağlık kuruluşu daha bulunuyor");
    expect(res.ctaText).toBe("Daha Fazla Teklif Al");
  });

  it("handles when displayed matches total count", () => {
    const res = calculateAdditionalCountAndConversion(2, 2, "en");
    expect(res.additionalCount).toBe(0);
    expect(res.hasConversionOffer).toBe(false);
    expect(res.ctaText).toBe("Get More Quotes");
  });

  it("generates friendly negotiation message for unsupported locations", () => {
    const prompt = getUnsupportedLocationPrompt("eye_treatments", "Ankara", [
      {
        city: "istanbul",
        side: "european",
        displayNameTr: "İstanbul (Avrupa Yakası)",
        displayNameEn: "Istanbul (European Side)",
        curatedClinics: [
          { name: "Dünyagöz Etiler", slugOrId: "dunyagoz-etiler" },
          { name: "Dünyagöz Ataköy", slugOrId: "dunyagoz-atakoy" }
        ]
      },
      {
        city: "antalya",
        side: "any",
        displayNameTr: "Antalya",
        displayNameEn: "Antalya",
        curatedClinics: [
          { name: "Dünyagöz Antalya", slugOrId: "dunyagoz-antalya" }
        ]
      }
    ], "tr");

    expect(prompt).toContain("Dünyagöz Etiler");
    expect(prompt).toContain("İstanbul (Avrupa Yakası)");
    expect(prompt).toContain("Antalya");
    expect(prompt.toLowerCase()).not.toContain("bütçe");
  });
});
