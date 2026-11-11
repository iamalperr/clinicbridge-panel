import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isMarketingDocumentPath, isPublicRoute } from "../lib/auth/publicRoutes";
import { publicSitemapUrls } from "../lib/seo/publicSitemap";

describe("setup guide marketing page", () => {
  it("is public, marketing-document, and sitemap-indexed", () => {
    expect(isPublicRoute("/kurulum-rehberi")).toBe(true);
    expect(isMarketingDocumentPath("/kurulum-rehberi")).toBe(true);
    expect(publicSitemapUrls()).toContain("https://clinicbridge-ai.com/kurulum-rehberi");
  });

  it("stays on the landing host and does not collide with the app wizard redirect", () => {
    const middleware = readFileSync("middleware.ts", "utf8");
    expect(middleware).toContain('"/kurulum-rehberi"');
    expect(middleware).toMatch(/pathname === "\/kayit" \|\| pathname === "\/kurulum"/);
    expect(middleware.indexOf('"/kurulum-rehberi"')).toBeGreaterThan(
      middleware.indexOf('pathname === "/kayit" || pathname === "/kurulum"')
    );
  });

  it("uses the real signup route and youtube-nocookie video helper", () => {
    const content = readFileSync("components/landing/SetupGuideContent.tsx", "utf8");
    const video = readFileSync("components/landing/SetupGuideVideo.tsx", "utf8");
    const page = readFileSync("app/kurulum-rehberi/page.tsx", "utf8");
    expect(content).toContain("https://app.clinicbridge-ai.com/kayit");
    expect(content).toContain("https://www.youtube.com/watch?v=cOXqqOgulNo");
    expect(content).toContain("WPCode");
    expect(content).toContain("ücretli plan ve bağlı alan adı gerektirir");
    expect(content).toContain("Deneme bitince sizden otomatik ücret alınmaz; asistan kapanır. Devam etmek için paket seçersiniz.");
    expect(video).toContain("youtube-nocookie.com");
    expect(video).toContain('preload="none"');
    expect(page).toContain("FAQPage");
    expect(page).toContain("HowTo");
  });

  it("links the in-app wizard to the public guide in a new tab", () => {
    const wizard = readFileSync("app/kurulum/page.tsx", "utf8");
    expect(wizard).toContain("https://clinicbridge-ai.com/kurulum-rehberi");
    expect(wizard).toContain('target="_blank"');
    expect(wizard).toContain("setup.guideLink");
  });
});
