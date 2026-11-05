import { describe, expect, it } from "vitest";
import { classifyPreviewCrawlError } from "../lib/preview/fulfillRequest";
import { PreviewUrlError } from "../lib/preview/ssrf";
import { crawlSite } from "../lib/preview/crawl";

describe("preview request crawl outcomes", () => {
  it("maps crawl failures onto the manual-review statuses", () => {
    expect(classifyPreviewCrawlError(new PreviewUrlError("blocked"))).toBe("blocked");
    expect(classifyPreviewCrawlError(new PreviewUrlError("timeout"))).toBe("timeout");
    expect(classifyPreviewCrawlError(new PreviewUrlError("dns"))).toBe("not_found");
    expect(classifyPreviewCrawlError(new PreviewUrlError("empty"))).toBe("empty");
    expect(classifyPreviewCrawlError(new PreviewUrlError("private"))).toBe("blocked");
  });

  it("treats a forbidden homepage as blocked", async () => {
    await expect(crawlSite("https://example.com", {
      assertResolution: async () => undefined,
      fetchImpl: async () => new Response("no", { status: 403, headers: { "content-type": "text/html" } }),
    })).rejects.toMatchObject({ code: "blocked" });
  });

  it("treats a missing homepage as not found", async () => {
    await expect(crawlSite("https://example.com", {
      assertResolution: async () => undefined,
      fetchImpl: async () => new Response("missing", { status: 404, headers: { "content-type": "text/html" } }),
    })).rejects.toMatchObject({ code: "not_found" });
  });
});
