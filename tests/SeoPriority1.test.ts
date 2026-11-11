import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { homeMetadata } from "../lib/seo/homeMetadata";
import { faqPageJsonLd, organizationJsonLd, softwareApplicationJsonLd } from "../lib/seo/jsonLd";
import { CHAT_SUPPORTED_LOCALES, productFaq } from "../lib/seo/productFaq";
import { PRICING_PLANS } from "../lib/pricing";
import { publicSitemapUrls } from "../lib/seo/publicSitemap";
import { isMarketingDocumentPath, isPublicRoute } from "../lib/auth/publicRoutes";

describe("SEO priority 1", () => {
  it("sets TR homepage title, description, and hreflang", () => {
    const meta = homeMetadata("tr");
    expect(meta.title).toEqual({
      absolute: "Sağlık Turizmi Klinikleri İçin Çok Dilli AI Asistan | ClinicBridge",
    });
    expect(String(meta.description)).toContain("14 gün ücretsiz");
    expect(meta.alternates?.languages).toMatchObject({
      tr: "https://clinicbridge-ai.com/",
      en: "https://clinicbridge-ai.com/en",
      "x-default": "https://clinicbridge-ai.com/",
    });
  });

  it("removes WhatsApp-coming-soon wording from landing copy", () => {
    const translations = readFileSync("lib/landing-translations.ts", "utf8");
    expect(translations).not.toMatch(/WhatsApp yakında/i);
    expect(translations).not.toMatch(/WhatsApp coming soon/i);
    expect(translations).toContain("WhatsApp/Telegram");
  });

  it("badges trial only on priced self-serve plans", () => {
    expect(PRICING_PLANS.filter((plan) => plan.trialEligible).map((plan) => plan.id)).toEqual([
      "starter",
      "clinic",
      "clinicPhone",
    ]);
    expect(PRICING_PLANS.find((plan) => plan.id === "agency")?.trialEligible).toBe(false);
  });

  it("exposes product FAQ answers and matching FAQPage schema", () => {
    const items = productFaq("tr");
    expect(items.length).toBeGreaterThanOrEqual(10);
    expect(items[0]?.answer.length).toBeGreaterThan(40);
    const schema = faqPageJsonLd("tr");
    expect(schema["@type"]).toBe("FAQPage");
    expect(schema.mainEntity).toHaveLength(items.length);
  });

  it("includes Organization, SoftwareApplication offers, sitemap lastmod paths, and llms.txt", () => {
    expect(organizationJsonLd().sameAs.length).toBeGreaterThan(0);
    const app = softwareApplicationJsonLd("tr");
    expect(app.applicationCategory).toBe("BusinessApplication");
    expect(app.offers).toHaveLength(3);
    expect(app.offers.every((offer: { priceCurrency: string }) => offer.priceCurrency === "EUR")).toBe(true);
    expect(publicSitemapUrls()).toEqual(
      expect.arrayContaining([
        "https://clinicbridge-ai.com/",
        "https://clinicbridge-ai.com/en",
        "https://clinicbridge-ai.com/sss",
        "https://clinicbridge-ai.com/en/sss",
        "https://clinicbridge-ai.com/fiyatlandirma",
      ])
    );
    expect(readFileSync("app/sitemap.ts", "utf8")).toContain("lastModified");
    expect(readFileSync("public/llms.txt", "utf8")).toContain("ClinicBridge AI");
    expect(isPublicRoute("/sss")).toBe(true);
    expect(isMarketingDocumentPath("/en")).toBe(true);
    expect(isMarketingDocumentPath("/en/sss")).toBe(true);
  });

  it("documents chat-supported locales used for marketing language claims", () => {
    expect(CHAT_SUPPORTED_LOCALES).toEqual(["tr", "en", "de", "fr", "ar", "ru", "es", "it"]);
  });
});
