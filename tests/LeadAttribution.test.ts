/**
 * Lead attribution / demo acquisition tracking tests.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  classifyAcquisition,
  classifyFromReferrer,
} from "@/lib/attribution/classify";
import {
  extractWhitelistedParams,
  sanitizePathname,
  sanitizeReferrer,
  sanitizeAttributionPayload,
  clampString,
} from "@/lib/attribution/sanitize";
import { applyVisitToAttribution } from "@/lib/attribution/capture";
import { formatDemoAttributionEmailSection } from "@/lib/attribution/formatEmail";
import {
  ATTRIBUTION_STORAGE_KEY,
  type StoredLeadAttribution,
} from "@/lib/attribution/types";
import {
  getAttributionForSubmit,
  readStoredAttribution,
  writeStoredAttribution,
} from "@/lib/attribution/storage";

describe("Lead attribution classification", () => {
  it("A) UTM google cpc campaign", () => {
    const r = classifyAcquisition({
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "dental_clinics",
    });
    expect(r.source).toBe("google");
    expect(r.medium).toBe("cpc");
    expect(r.campaign).toBe("dental_clinics");
    expect(r.label).toBe("Google Ads");
  });

  it("B) Google organic referrer, no UTM", () => {
    const r = classifyAcquisition({
      referrer: "https://www.google.com/search?q=clinicbridge",
    });
    expect(r.source).toBe("google");
    expect(r.medium).toBe("organic");
    expect(r.label).toBe("Google Organic");
  });

  it("C) LinkedIn referrer", () => {
    const r = classifyFromReferrer("https://www.linkedin.com/feed/");
    expect(r?.label).toBe("LinkedIn");
    expect(r?.source).toBe("linkedin");
  });

  it("D) no referrer and no UTM → Direct / Unknown", () => {
    const r = classifyAcquisition({});
    expect(r.source).toBe("direct");
    expect(r.label).toBe("Direct / Unknown");
  });

  it("UTM takes priority over referrer", () => {
    const r = classifyAcquisition({
      utmSource: "newsletter",
      utmMedium: "email",
      referrer: "https://www.google.com/",
    });
    expect(r.source).toBe("newsletter");
    expect(r.medium).toBe("email");
  });
});

describe("Sanitize / whitelist", () => {
  it("only allowlisted query params are extracted", () => {
    const params = extractWhitelistedParams(
      "?utm_source=google&utm_medium=cpc&utm_campaign=dental_clinics&email=secret@x.com&token=abc&gclid=GCL123"
    );
    expect(params.utm_source).toBe("google");
    expect(params.utm_medium).toBe("cpc");
    expect(params.utm_campaign).toBe("dental_clinics");
    expect(params.gclid).toBe("GCL123");
    expect((params as any).email).toBeUndefined();
    expect((params as any).token).toBeUndefined();
  });

  it("H) malformed / oversized values are clamped", () => {
    const huge = "x".repeat(5000);
    expect(clampString(huge).length).toBeLessThanOrEqual(200);
    expect(sanitizePathname(`/${huge}?token=1`).length).toBeLessThanOrEqual(200);
    expect(sanitizeReferrer(`https://evil.example/${huge}?session=abc`).includes("session")).toBe(
      false
    );
  });

  it("pathname strips query and keeps path only", () => {
    expect(sanitizePathname("https://app.example.com/demo?utm_source=x")).toBe("/demo");
    expect(sanitizePathname("/products/ai?x=1#y")).toBe("/products/ai");
  });

  it("sanitizeAttributionPayload never throws on garbage", () => {
    expect(sanitizeAttributionPayload(null)).toBeNull();
    expect(sanitizeAttributionPayload("nope")).toBeNull();
    expect(sanitizeAttributionPayload({ firstTouch: { source: "google", medium: "cpc" } })).toBeTruthy();
  });
});

describe("First-touch / last-touch journey", () => {
  it("E/F) first landing preserved across later pages; last page updates", () => {
    const first = applyVisitToAttribution(null, {
      href: "https://clinicbridge-ai.com/?utm_source=google&utm_medium=cpc&utm_campaign=dental_clinics",
      pathname: "/",
      search: "?utm_source=google&utm_medium=cpc&utm_campaign=dental_clinics",
      referrer: "https://www.google.com/",
      now: new Date("2026-09-21T10:00:00Z"),
    });
    expect(first.firstTouch.landingPage).toBe("/");
    expect(first.firstTouch.source).toBe("google");
    expect(first.firstTouch.medium).toBe("cpc");
    expect(first.firstTouch.campaign).toBe("dental_clinics");

    const second = applyVisitToAttribution(first, {
      href: "https://clinicbridge-ai.com/privacy",
      pathname: "/privacy",
      search: "",
      referrer: "",
      now: new Date("2026-09-21T10:05:00Z"),
    });
    expect(second.firstTouch.landingPage).toBe("/");
    expect(second.firstTouch.source).toBe("google");
    expect(second.firstTouch.campaign).toBe("dental_clinics");
    expect(second.lastTouch.page).toBe("/privacy");
    // Channel preserved on internal nav
    expect(second.lastTouch.source).toBe("google");
    expect(second.lastTouch.medium).toBe("cpc");

    const third = applyVisitToAttribution(second, {
      href: "https://clinicbridge-ai.com/",
      pathname: "/",
      search: "",
      referrer: "",
      now: new Date("2026-09-21T10:10:00Z"),
    });
    expect(third.firstTouch.landingPage).toBe("/");
    expect(third.firstTouch.campaign).toBe("dental_clinics");
    expect(third.lastTouch.page).toBe("/");
  });
});

describe("Storage fail-soft", () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
      },
    });
  });

  it("G) getAttributionForSubmit returns null when empty — form can still proceed", () => {
    expect(getAttributionForSubmit()).toBeNull();
  });

  it("round-trips stored attribution for submit payload", () => {
    const stored: StoredLeadAttribution = {
      version: 1,
      firstTouch: {
        source: "google",
        medium: "organic",
        campaign: "",
        referrer: "https://www.google.com/",
        landingPage: "/",
        capturedAt: "2026-09-21T10:00:00.000Z",
      },
      lastTouch: {
        source: "google",
        medium: "organic",
        campaign: "",
        referrer: "https://www.google.com/",
        page: "/",
        capturedAt: "2026-09-21T10:00:00.000Z",
      },
      identifiers: {},
      expiresAt: Date.now() + 86400000,
    };
    expect(writeStoredAttribution(stored)).toBe(true);
    expect(readStoredAttribution()?.firstTouch.source).toBe("google");
    const payload = getAttributionForSubmit();
    expect(payload?.leadSourceLabel).toBe("Google Organic");
    expect(payload?.firstTouch.landingPage).toBe("/");
  });

  it("G) storage throw does not break getAttributionForSubmit", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
        removeItem: () => undefined,
      },
    });
    expect(getAttributionForSubmit()).toBeNull();
  });
});

describe("Email attribution section", () => {
  it("renders readable Lead Source summary", () => {
    const text = formatDemoAttributionEmailSection({
      firstTouch: {
        source: "google",
        medium: "organic",
        campaign: "",
        referrer: "https://www.google.com/",
        landingPage: "/",
        capturedAt: "2026-09-21T10:00:00.000Z",
      },
      lastTouch: {
        source: "google",
        medium: "organic",
        campaign: "",
        referrer: "https://www.google.com/",
        page: "/",
        capturedAt: "2026-09-21T10:00:00.000Z",
      },
      identifiers: { gclid: "", fbclid: "", msclkid: "" },
      leadSourceLabel: "Google Organic",
      capturedAt: "2026-09-21T10:00:00.000Z",
      version: 1,
    });
    expect(text).toContain("Lead Source: Google Organic");
    expect(text).toContain("İlk Landing Page: /");
    expect(text).toContain("GCLID: -");
  });

  it("returns empty string when attribution missing", () => {
    expect(formatDemoAttributionEmailSection(null)).toBe("");
  });
});

describe("Demo form remaining required fields (smoke)", () => {
  it("DemoRequestData still requires core fields shape", async () => {
    const mod = await import("@/lib/services/demoRequestService");
    // Type-level smoke: submit function exists and attribution is optional
    expect(typeof mod.submitDemoRequest).toBe("function");
    expect(ATTRIBUTION_STORAGE_KEY).toBe("cb_lead_attribution_v1");
  });
});
