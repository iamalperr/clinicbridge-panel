import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isMarketingAnalyticsHost } from "../lib/analytics/marketingHost";

describe("marketing Google tag host", () => {
  it("includes only the public marketing hosts", () => {
    expect(isMarketingAnalyticsHost("clinicbridge-ai.com")).toBe(true);
    expect(isMarketingAnalyticsHost("www.clinicbridge-ai.com")).toBe(true);
    expect(isMarketingAnalyticsHost("app.clinicbridge-ai.com")).toBe(false);
    expect(isMarketingAnalyticsHost("widget.clinicbridge-ai.com")).toBe(false);
    expect(isMarketingAnalyticsHost("localhost:3000")).toBe(false);
  });

  it("keeps a single GA4 config and does not load it from the root layout", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    const tag = readFileSync("components/analytics/MarketingGoogleTag.tsx", "utf8");
    expect(layout.match(/<MarketingGoogleTag /g)).toHaveLength(1);
    expect(layout).not.toContain("G-DP3FV4PQWD");
    expect(tag).not.toContain("send_page_view");
    expect(tag.match(/gtag\('config'/g)).toHaveLength(1);
  });
});