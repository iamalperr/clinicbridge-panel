import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  describeClinicOfferDraftError,
  formatOfferPriceRange,
  parsePricingAmount,
  pickBestPricingForClinic,
  sanitizeDraftClinicOffer,
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

  it("never embeds undefined fields (Firestore write safety)", () => {
    const offer = pickBestPricingForClinic({
      clinicId: "c1",
      clinicName: "Clinic",
      treatmentCategory: "implant",
      pricingRows: [
        {
          id: "p1",
          treatmentName: "Implant",
          treatmentCategoryName: "implant",
          priceMin: 500,
          priceMax: 500,
          currency: "EUR",
          status: "active",
          // no packageDetails / notes
        },
      ],
    });
    expect(offer).not.toBeNull();
    expect(Object.values(offer!).some((v) => v === undefined)).toBe(false);
    expect("packageDetails" in offer!).toBe(false);
    expect("notes" in offer!).toBe(false);
    const sanitized = sanitizeDraftClinicOffer(offer!);
    expect(JSON.stringify(sanitized)).not.toContain("undefined");
  });

  it("parses string prices and matches aesthetic_surgery to Estetik group", () => {
    expect(parsePricingAmount("1.250")).toBe(1250);
    expect(parsePricingAmount("1,250.50")).toBe(1250.5);

    const offer = pickBestPricingForClinic({
      clinicId: "c1",
      clinicName: "Orion",
      treatmentCategory: "aesthetic_surgery",
      treatmentName: "aesthetic_surgery",
      pricingRows: [
        {
          id: "a1",
          treatmentName: "Rhinoplasty",
          priceGroup: "Estetik",
          treatmentCategoryName: "Estetik",
          priceMin: "3500" as unknown as number,
          priceMax: "4500" as unknown as number,
          currency: "EUR",
          status: "active",
          notes: "Ortalama fiyat",
        },
      ],
    });
    expect(offer?.sourcePricingId).toBe("a1");
    expect(offer?.priceMin).toBe(3500);
    expect(offer?.notes).toBe("Ortalama fiyat");
    expect(Object.values(offer!).some((v) => v === undefined)).toBe(false);
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
    // noreply@ sender — do not invite replies
    expect(html).not.toMatch(/bu e-postaya yanıt/i);
    expect(html).not.toMatch(/reply to this email/i);
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

  it("draft service strips undefined and resolves clinic ids safely", () => {
    const service = readFileSync(
      join(process.cwd(), "lib/services/clinicOfferDraftService.ts"),
      "utf8"
    );
    expect(service).toContain("sanitizeDraftClinicOffer");
    expect(service).toContain("normalizePricingRow");
    expect(service).toContain("resolveSelectedClinicIds");
  });
});

describe("draft error copy", () => {
  it("maps known codes to Turkish UX (not raw INTERNAL_ERROR)", () => {
    expect(describeClinicOfferDraftError("NO_PRICING_MATCH", "tr")).toMatch(/fiyat/i);
    expect(describeClinicOfferDraftError("QUOTE_NOT_FOUND", "tr")).toMatch(/teklif/i);
    expect(describeClinicOfferDraftError("INTERNAL_ERROR", "tr")).not.toBe("INTERNAL_ERROR");
  });
});
