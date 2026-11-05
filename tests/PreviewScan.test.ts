import { describe, expect, it } from "vitest";
import { isPathAllowedByRobots } from "../lib/preview/robots";
import { isPrivateIp, parsePublicHttpUrl, PreviewUrlError } from "../lib/preview/ssrf";
import { groundPreviewFacts } from "../lib/preview/ground";
import { buildKnowledgeItems } from "../lib/preview/knowledge";
import { canAcceptPreviewMessage, buildPreviewChatMessages } from "../lib/preview/chat";
import { crawlSite, frameAllowed, readPage } from "../lib/preview/crawl";
import { PREVIEW_MAX_MESSAGES } from "../lib/preview/types";

describe("preview scan guards", () => {
  it("blocks local and private targets", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("10.1.2.3")).toBe(true);
    expect(isPrivateIp("192.168.0.4")).toBe(true);
    expect(isPrivateIp("169.254.169.254")).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    for (const raw of ["http://127.0.0.1", "http://localhost/admin", "file:///etc/passwd", "https://user:pass@example.com", "http://example.com:8080"]) {
      expect(() => parsePublicHttpUrl(raw)).toThrow(PreviewUrlError);
    }
    expect(parsePublicHttpUrl("https://example.com/klinik").hostname).toBe("example.com");
    expect(parsePublicHttpUrl("www.hospitadent.com").protocol).toBe("https:");
    expect(parsePublicHttpUrl("www.hospitadent.com").hostname).toBe("www.hospitadent.com");
    expect(parsePublicHttpUrl("hospitadent.com").href).toBe("https://hospitadent.com/");
    expect(parsePublicHttpUrl("https://www.hospitadent.com").href).toBe("https://www.hospitadent.com/");
    expect(() => parsePublicHttpUrl("abc")).toThrow(PreviewUrlError);
    expect(() => parsePublicHttpUrl("localhost")).toThrow(PreviewUrlError);
  });

  it("honors robots.txt disallow rules", () => {
    const robots = "User-agent: *\nDisallow: /gizli\n";
    expect(isPathAllowedByRobots(robots, "/gizli/sayfa")).toBe(false);
    expect(isPathAllowedByRobots(robots, "/tedaviler")).toBe(true);
    expect(isPathAllowedByRobots("", "/")).toBe(true);
  });

  it("keeps only facts present on the page", () => {
    const corpus = "Ada Clinic offers Implant for 1500 EUR. The clinic is in Istanbul near the metro.";
    const facts = groundPreviewFacts(
      {
        clinicName: "Ada Clinic",
        treatments: [
          { name: "Implant", priceRange: "9999 EUR" },
          { name: "Invented Laser", priceRange: "100 EUR" },
        ],
        phone: "+90 555 000 00 00",
        address: "Istanbul near the metro",
        faq: [{ question: "Where is the clinic located?", answer: "The clinic is in Istanbul near the metro." }],
      },
      corpus,
      { languages: ["tr", "xx"], logoUrl: "https://example.com/logo.png", primaryColor: "#112233" }
    );
    expect(facts.clinicName).toBe("Ada Clinic");
    expect(facts.treatments).toEqual([{ name: "Implant", priceRange: null }]);
    expect(facts.phone).toBeNull();
    expect(facts.languages).toEqual(["tr"]);
    expect(facts.logoUrl).toBe("https://example.com/logo.png");
    const knowledge = buildKnowledgeItems(facts);
    expect(knowledge.some((item) => item.content.includes("9999"))).toBe(false);
    expect(knowledge.some((item) => item.category === "Tedaviler" && item.title === "Implant")).toBe(true);
    expect(knowledge.some((item) => item.content.includes("555"))).toBe(false);
  });

  it("does not persist preview chat text and caps the counter", () => {
    expect(canAcceptPreviewMessage(PREVIEW_MAX_MESSAGES - 1)).toBe(true);
    expect(canAcceptPreviewMessage(PREVIEW_MAX_MESSAGES)).toBe(false);
    const messages = buildPreviewChatMessages(
      [{ title: "Implant", category: "Tedaviler", language: "TR", content: "Implant" }],
      [{ role: "user", content: "Fiyat nedir?" }],
      "Fiyat nedir?"
    );
    expect(messages.filter((message) => message.role === "user")).toHaveLength(1);
    expect(JSON.stringify(messages)).not.toContain("conversationLogs");
  });

  it("stops at robots rules and fifteen pages", async () => {
    const pages = new Map<string, string>();
    pages.set("https://example.com/robots.txt", "User-agent: *\nDisallow: /gizli\n");
    let html = `<html lang="tr"><head><meta name="theme-color" content="#112233"><meta property="og:image" content="https://example.com/logo.png"></head><body>`;
    for (let i = 0; i < 20; i++) html += `<a href="/sayfa-${i}">Sayfa ${i} implant tedavisi</a>`;
    html += `<a href="/gizli">gizli</a> Ada Clinic implant</body></html>`;
    pages.set("https://example.com/", html);
    for (let i = 0; i < 20; i++) {
      pages.set(`https://example.com/sayfa-${i}`, `<html><body>Sayfa ${i} implant tedavisi metni</body></html>`);
    }
    pages.set("https://example.com/gizli", `<html><body>secret</body></html>`);

    const fetched: string[] = [];
    const result = await crawlSite("https://example.com", {
      assertResolution: async () => undefined,
      fetchImpl: async (input) => {
        const url = String(input);
        fetched.push(url);
        const body = pages.get(url) ?? "";
        return new Response(body, {
          status: body ? 200 : 404,
          headers: { "content-type": url.endsWith("robots.txt") ? "text/plain" : "text/html" },
        });
      },
    });

    expect(result.pages.length).toBeLessThanOrEqual(15);
    expect(fetched.some((url) => url.includes("/gizli"))).toBe(false);
    expect(result.languages).toContain("tr");
    expect(result.primaryColor).toBe("#112233");
    expect(result.logoUrl).toBe("https://example.com/logo.png");
  });

  it("reads a page and detects frame blocking", () => {
    const page = readPage(`<html lang="en"><head><title>Ada</title></head><body><p>Implant bilgisi</p></body></html>`, "https://example.com");
    expect(page.title).toBe("Ada");
    expect(page.languages).toEqual(["en"]);
    expect(frameAllowed(new Headers({ "x-frame-options": "DENY" }))).toBe(false);
    expect(frameAllowed(new Headers())).toBe(true);
  });
});
