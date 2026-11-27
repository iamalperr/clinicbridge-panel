import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isMarketingDocumentPath } from "../lib/auth/publicRoutes";
import { publicSitemapUrls } from "../lib/seo/publicSitemap";

describe("clinic assistant SEO page", () => {
  it("keeps the URL, canonical, sitemap entry and homepage title", () => {
    const page = readFileSync("app/klinikler-icin-yapay-zeka-asistani/page.tsx", "utf8");
    const home = readFileSync("app/page.tsx", "utf8");
    expect(page).toContain('absolute: "Klinikler İçin Yapay Zekâ Asistanı | ClinicBridge AI"');
    expect(page).toContain('const PATH = "/klinikler-icin-yapay-zeka-asistani"');
    expect(page).toContain("alternates: { canonical: CANONICAL }");
    expect(publicSitemapUrls()).toContain(
      "https://clinicbridge-ai.com/klinikler-icin-yapay-zeka-asistani"
    );
    expect(home).toContain("homeMetadata");
    expect(home).toContain('homeMetadata("tr")');
  });

  it("describes three clinic flows and clinic appointment approval in the page source", () => {
    const page = readFileSync("app/klinikler-icin-yapay-zeka-asistani/page.tsx", "utf8");
    expect(page).toContain("<h1>Klinikler İçin Yapay Zekâ Asistanı</h1>");
    expect(page).toContain("Gelen telefon araması");
    expect(page).toContain("Web sitesindeki hasta sorusu");
    expect(page).toContain("Kliniğe iletilen randevu talebi");
    expect(page).toContain("Randevu klinik tarafından onaylanır");
    expect(page).toContain("<DemoCTASection />");
  });

  it("links from the homepage products section with the exact Turkish anchor text", () => {
    const home = readFileSync("app/page.tsx", "utf8");
    expect(home).toContain('href="/klinikler-icin-yapay-zeka-asistani"');
    expect(home).toContain(">Klinikler için yapay zekâ asistanı</Link>");
    expect(readFileSync("components/landing/ProductsSection.tsx", "utf8")).toContain(
      "assistantLink"
    );
  });

  it("renders marketing documents outside the panel AuthGuard shell", () => {
    expect(isMarketingDocumentPath("/")).toBe(true);
    expect(isMarketingDocumentPath("/klinikler-icin-yapay-zeka-asistani")).toBe(true);
    expect(isMarketingDocumentPath("/clinics")).toBe(false);
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toContain("isMarketingDocumentPath");
    expect(layout).toContain("marketingDocument");
  });
});
