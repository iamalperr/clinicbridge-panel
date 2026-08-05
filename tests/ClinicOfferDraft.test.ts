import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  describeClinicOfferDraftError,
  formatOfferPriceRange,
  pickBestPricingForClinic,
} from "../lib/agency/clinicOfferDraft";
import { buildPatientOfferEmailContent } from "../lib/services/patientOfferEmailContent";

describe("clinic offer draft matching", () => {
  it("picks best pricing row for implant subcategory", () => {
    const offer = pickBestPricingForClinic({
      clinicId: "c1",
      clinicName: "İstanbul Diş Akademisi",
      treatmentCategory: "implant",
      treatmentSubcategory: "dental implant",
      treatmentName: "implant",
      pricingRows: [
        {
          id: "p1",
          treatmentCategoryName: "implant",
          subTreatmentName: "dental implant",
          treatmentName: "Dental Implant",
          priceMin: 400,
          priceMax: 700,
          currency: "EUR",
          status: "active",
        },
        {
          id: "p2",
          treatmentCategoryName: "veneers",
          treatmentName: "Veneer",
          priceMin: 200,
          priceMax: 300,
          currency: "EUR",
          status: "active",
        },
      ],
    });
    expect(offer?.sourcePricingId).toBe("p1");
    expect(offer?.priceMin).toBe(400);
    expect(formatOfferPriceRange(offer!)).toContain("EUR");
  });

  it("ignores inactive pricing", () => {
    const offer = pickBestPricingForClinic({
      clinicId: "c1",
      clinicName: "Clinic",
      treatmentCategory: "implant",
      pricingRows: [
        {
          id: "x",
          treatmentCategoryName: "implant",
          treatmentName: "Implant",
          priceMin: 100,
          priceMax: 100,
          currency: "EUR",
          status: "inactive",
        },
      ],
    });
    expect(offer).toBeNull();
  });
});

describe("patient offer email", () => {
  it("includes clinic price table in TR copy", () => {
    const { subject, html, text } = buildPatientOfferEmailContent({
      lang: "tr",
      agencyName: "FeelinHealthy",
      patientName: "Alper Ozgul",
      treatmentLabel: "implant",
      offers: [
        {
          clinicName: "İstanbul Diş Akademisi",
          treatmentName: "Dental Implant",
          priceMin: 400,
          priceMax: 700,
          currency: "EUR",
        },
      ],
    });
    expect(subject).toMatch(/teklifiniz hazır/i);
    expect(html).toContain("İstanbul Diş Akademisi");
    expect(html).toContain("400");
    expect(text).toContain("400–700 EUR");
  });
});

describe("offer draft wiring", () => {
  it("lead detail drafts offers and sends on convert", () => {
    const page = readFileSync(
      join(process.cwd(), "app/agency/agencies/[agencyId]/leads/[leadId]/page.tsx"),
      "utf8"
    );
    expect(page).toContain("draftLeadOffers");
    expect(page).toContain("sendLeadPatientOffer");
    expect(page).toContain("Hastaya Özel Teklif Taslağı");
    expect(page).toContain('actionKey === "converted"');
    expect(page).toContain("describeClinicOfferDraftError");
  });

  it("draft-offers route recovers typed errors without instanceof", () => {
    const route = readFileSync(
      join(
        process.cwd(),
        "app/api/agency/[agencyId]/leads/[leadId]/draft-offers/route.ts"
      ),
      "utf8"
    );
    expect(route).toContain("asClinicOfferDraftError");
    expect(route).toContain('name === "ClinicOfferDraftError"');
    expect(route).toContain("message: draftErr.message");
  });
});

describe("draft error copy", () => {
  it("maps known codes to Turkish UX (not raw INTERNAL_ERROR)", () => {
    expect(describeClinicOfferDraftError("NO_PRICING_MATCH", "tr")).toMatch(/fiyat/i);
    expect(describeClinicOfferDraftError("QUOTE_NOT_FOUND", "tr")).toMatch(/teklif/i);
    expect(describeClinicOfferDraftError("INTERNAL_ERROR", "tr")).not.toBe("INTERNAL_ERROR");
  });
});
