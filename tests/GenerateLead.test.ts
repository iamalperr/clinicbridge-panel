import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GA_MEASUREMENT_ID } from "../components/analytics/MarketingGoogleTag";
import { trackGenerateLead } from "../lib/analytics/generateLead";

describe("demo form generate_lead", () => {
  it("uses the single configured marketing measurement id", () => {
    expect(GA_MEASUREMENT_ID).toBe("G-DP3FV4PQWD");
    const tag = readFileSync("components/analytics/MarketingGoogleTag.tsx", "utf8");
    expect(tag.match(/G-[A-Z0-9]+/g)).toEqual(["G-DP3FV4PQWD"]);
  });

  it("sends generate_lead once through the supplied gtag and skips a missing tag", () => {
    const calls: unknown[][] = [];
    trackGenerateLead((...args) => {
      calls.push(args);
    });
    expect(calls).toEqual([["event", "generate_lead", { transport_type: "beacon" }]]);
    expect(() => trackGenerateLead(undefined)).not.toThrow();
  });

  it("fires only after the shared demo form is accepted", () => {
    const source = readFileSync("components/landing/DemoCTASection.tsx", "utf8");
    const submitAt = source.indexOf("await submitDemoRequest");
    const trackAt = source.indexOf("trackGenerateLead()");
    const failureAt = source.indexOf("setSubmitState(\"error\")");
    expect(submitAt).toBeGreaterThan(-1);
    expect(trackAt).toBeGreaterThan(submitAt);
    expect(failureAt).toBeGreaterThan(trackAt);
    expect(source.slice(failureAt)).not.toContain("trackGenerateLead");
    expect(readFileSync("components/landing/LandingHomePage.tsx", "utf8")).toContain("<DemoCTASection />");
    expect(readFileSync("app/(marketing)/klinikler-icin-yapay-zeka-asistani/page.tsx", "utf8")).toContain("<DemoCTASection />");
  });
});