import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applyOperatorScan, parsePreviewScanArgs, requestStatusAfterOperatorScan } from "../lib/preview/localScan";

describe("local preview scan", () => {
  it("reads the site and an optional request id", () => {
    expect(parsePreviewScanArgs(["https://klinik.example"])).toEqual({
      url: "https://klinik.example",
      requestId: null,
    });
    expect(parsePreviewScanArgs(["--request", "abc", "https://klinik.example"])).toEqual({
      url: "https://klinik.example",
      requestId: "abc",
    });
    expect(() => parsePreviewScanArgs([])).toThrow("usage");
    expect(() => parsePreviewScanArgs(["https://a.example", "--request"])).toThrow("usage");
  });

  it("keeps an already sent request sent", () => {
    expect(requestStatusAfterOperatorScan("needs_manual")).toBe("ready_for_review");
    expect(requestStatusAfterOperatorScan("received")).toBe("ready_for_review");
    expect(requestStatusAfterOperatorScan("sent")).toBe("sent");
  });

  it("rejects a private address before any crawl", async () => {
    await expect(applyOperatorScan("http://127.0.0.1", null)).rejects.toMatchObject({ code: "private" });
  });

  it("calls the shared crawl and does not add a bypass", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/preview-scan.ts"), "utf8");
    const scan = readFileSync(resolve(process.cwd(), "lib/preview/localScan.ts"), "utf8");
    expect(script).toContain('from "../lib/preview/localScan"');
    expect(script).not.toContain('from "@/');
    expect(scan).toContain("crawlSite");
    expect(scan).toContain("extractPreviewFacts");
    const combined = `${script}\n${scan}`.toLowerCase();
    expect(combined).not.toMatch(/puppeteer|playwright|stealth|2captcha|flaresolverr/);
  });
});
