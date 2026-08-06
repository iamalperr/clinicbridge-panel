import { describe, it, expect } from "vitest";
import {
  extractClinicOverviewFromDescription,
  mergeOverviewLabels,
} from "../lib/agency/extractClinicOverviewFromDescription";

describe("extractClinicOverviewFromDescription", () => {
  it("extracts dental specialties and treatments from long description", () => {
    const result = extractClinicOverviewFromDescription({
      longDescription:
        "The hospital offers comprehensive oral and dental health treatments including Dental Implants, Zirconium Crowns, Digital Smile Design, Laminate Veneers, Bonding Applications, and Teeth Whitening. All-on-4 and All-on-6 packages are available for full-arch restoration. Hollywood Smile design is a highlighted aesthetic service.",
      shortDescription: "Private dental hospital in Istanbul.",
    });

    expect(result.specialties).toEqual(
      expect.arrayContaining(["Implantology", "Aesthetic Dentistry", "Prosthodontics"])
    );
    expect(result.highlightedTreatments).toEqual(
      expect.arrayContaining([
        "Dental Implant",
        "Zirconium Crown",
        "Digital Smile Design",
        "Laminate Veneer",
        "Teeth Whitening",
        "All-on-4",
        "All-on-6",
        "Hollywood Smile",
      ])
    );
  });

  it("uses structured subTreatments when description is generic", () => {
    const result = extractClinicOverviewFromDescription({
      longDescription:
        "Beyazışık Dental Group provides dental care services at its Marmaris branch. High-quality care for all age groups.",
      shortDescription: "Beyazışık Dental Group provides dental care services at its Marmaris branch.",
      subTreatments: ["All-on-4", "All-on-6", "Teeth Whitening", "Dental Implant"],
      clinicName: "Beyazışık Marmaris Dental Group",
    });

    expect(result.specialties.length).toBeGreaterThan(0);
    expect(result.highlightedTreatments).toEqual(
      expect.arrayContaining(["All-on-4", "All-on-6", "Teeth Whitening", "Dental Implant"])
    );
  });

  it("extracts hair transplant signals", () => {
    const result = extractClinicOverviewFromDescription({
      longDescription:
        "BHT Clinic offers FUE and DHI hair transplant procedures with PRP support for international patients.",
    });
    expect(result.specialties).toContain("Hair Transplant");
    expect(result.highlightedTreatments).toEqual(
      expect.arrayContaining(["FUE Hair Transplant", "DHI Hair Transplant", "PRP Treatment"])
    );
  });

  it("mergeOverviewLabels keeps unique labels and can replace", () => {
    expect(mergeOverviewLabels(["Dental Implant"], ["Hollywood Smile", "Dental Implant"])).toEqual([
      "Dental Implant",
      "Hollywood Smile",
    ]);
    expect(
      mergeOverviewLabels(["All-on-4"], ["Hollywood Smile"], { replace: true })
    ).toEqual(["All-on-4"]);
  });
});
