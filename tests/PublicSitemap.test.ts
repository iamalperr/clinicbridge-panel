import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { publicSitemapUrls } from "../lib/seo/publicSitemap";

describe("public sitemap", () => {
  it("lists only the public marketing pages as https URLs", () => {
    const urls = publicSitemapUrls();
    expect(urls).toEqual([
      "https://clinicbridge-ai.com/",
      "https://clinicbridge-ai.com/en",
      "https://clinicbridge-ai.com/sss",
      "https://clinicbridge-ai.com/en/sss",
      "https://clinicbridge-ai.com/klinikler-icin-yapay-zeka-asistani",
      "https://clinicbridge-ai.com/hakkimizda",
      "https://clinicbridge-ai.com/fiyatlandirma",
      "https://clinicbridge-ai.com/kurulum-rehberi",
    ]);
    // Legal pages are noindex,follow — must not appear in the sitemap.
    expect(urls.join("\n")).not.toMatch(/privacy|terms|kvkk|teslimat-ve-iade|mesafeli-satis/);
    expect(urls.join("\n")).not.toMatch(/onizleme|login|kayit|showcase|widget-guide|app\.clinicbridge/);
  });

  it("lets sitemap and robots through before the landing redirect", () => {
    const middleware = readFileSync("middleware.ts", "utf8");
    const allow = middleware.indexOf('pathname === "/sitemap.xml" || pathname === "/robots.txt"');
    const redirect = middleware.indexOf('return NextResponse.redirect(new URL("/", req.url))');
    expect(allow).toBeGreaterThan(-1);
    expect(allow).toBeLessThan(redirect);
  });
});