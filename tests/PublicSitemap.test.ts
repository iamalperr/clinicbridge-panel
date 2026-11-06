import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { publicSitemapUrls } from "../lib/seo/publicSitemap";

describe("public sitemap", () => {
  it("lists only the public marketing pages as https URLs", () => {
    const urls = publicSitemapUrls();
    expect(urls).toEqual([
      "https://clinicbridge-ai.com/",
      "https://clinicbridge-ai.com/hakkimizda",
      "https://clinicbridge-ai.com/fiyatlandirma",
      "https://clinicbridge-ai.com/privacy",
      "https://clinicbridge-ai.com/terms",
      "https://clinicbridge-ai.com/kvkk",
      "https://clinicbridge-ai.com/teslimat-ve-iade",
      "https://clinicbridge-ai.com/mesafeli-satis-sozlesmesi",
    ]);
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