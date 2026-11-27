import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  trackBeginCheckout,
  trackGenerateLead,
  trackSignUp,
} from "../lib/analytics/marketingEvents";
import { buildAppSignupUrl, APP_SIGNUP_BASE_URL } from "../lib/analytics/signupRedirect";
import {
  applyConsentModeUpdate,
  consentModeBootstrapScript,
  CONSENT_DENIED,
  CONSENT_GRANTED,
} from "../lib/analytics/consentMode";
import {
  isMarketingAnalyticsHost,
  sanitizeMetaPixelId,
  shouldLoadMarketingPixels,
} from "../lib/analytics/marketingHost";

describe("marketing conversion events", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      dataLayer: [],
      sessionStorage: {
        store: {} as Record<string, string>,
        getItem(key: string) {
          return this.store[key] ?? null;
        },
        setItem(key: string, value: string) {
          this.store[key] = value;
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fires generate_lead to gtag and Lead to Meta without PII", () => {
    const gtagCalls: unknown[][] = [];
    const fbqCalls: unknown[][] = [];
    trackGenerateLead(
      (...args) => gtagCalls.push(args),
      (...args) => fbqCalls.push(args)
    );
    expect(gtagCalls).toEqual([["event", "generate_lead", { transport_type: "beacon" }]]);
    expect(fbqCalls).toEqual([["track", "Lead"]]);
    expect(JSON.stringify(gtagCalls)).not.toMatch(/@|phone|\+90/i);
  });

  it("fires sign_up once with method email and CompleteRegistration", () => {
    const gtagCalls: unknown[][] = [];
    const fbqCalls: unknown[][] = [];
    trackSignUp(
      (...args) => gtagCalls.push(args),
      (...args) => fbqCalls.push(args)
    );
    trackSignUp(
      (...args) => gtagCalls.push(args),
      (...args) => fbqCalls.push(args)
    );
    expect(gtagCalls).toHaveLength(1);
    expect(gtagCalls[0][0]).toBe("event");
    expect(gtagCalls[0][1]).toBe("sign_up");
    expect(gtagCalls[0][2]).toMatchObject({ method: "email" });
    expect(fbqCalls).toEqual([["track", "CompleteRegistration", { content_name: "email_signup" }]]);
  });

  it("fires begin_checkout with plan id only (no personal data)", () => {
    const gtagCalls: unknown[][] = [];
    const fbqCalls: unknown[][] = [];
    trackBeginCheckout(
      { planId: "clinic", planName: "Clinic", value: 149, currency: "EUR" },
      (...args) => gtagCalls.push(args),
      (...args) => fbqCalls.push(args)
    );
    expect(gtagCalls[0][1]).toBe("begin_checkout");
    expect(gtagCalls[0][2]).toMatchObject({
      currency: "EUR",
      value: 149,
      items: [{ item_id: "clinic", item_name: "Clinic" }],
    });
    expect(fbqCalls[0][1]).toBe("InitiateCheckout");
    expect(JSON.stringify(gtagCalls)).not.toMatch(/email|phone|@/i);
  });
});

describe("signup UTM redirect", () => {
  it("appends allowlisted attribution params to /kayit", () => {
    const url = buildAppSignupUrl({
      search: "?utm_source=google&utm_medium=cpc&utm_campaign=dental&email=secret@x.com",
    });
    expect(url.startsWith(APP_SIGNUP_BASE_URL)).toBe(true);
    expect(url).toContain("utm_source=google");
    expect(url).toContain("utm_medium=cpc");
    expect(url).toContain("utm_campaign=dental");
    expect(url).not.toContain("secret@");
    expect(url).not.toContain("email=");
  });
});

describe("Consent Mode v2", () => {
  it("bootstraps default denied before tags and restores prior accept", () => {
    const script = consentModeBootstrapScript();
    expect(script).toContain("gtag('consent', 'default'");
    expect(script).toContain("analytics_storage: 'denied'");
    expect(script).toContain("wait_for_update: 500");
    expect(script).toContain("url_passthrough");
    expect(script).toContain("ads_data_redaction");
    expect(script).toContain("cb-cookie-consent");
    expect(script).toContain("analytics_storage: 'granted'");
  });

  it("updates Google + Meta consent on accept / reject", () => {
    const gtagCalls: unknown[][] = [];
    const fbqCalls: unknown[][] = [];
    applyConsentModeUpdate(
      "accepted",
      (...args) => gtagCalls.push(args),
      (...args) => fbqCalls.push(args)
    );
    applyConsentModeUpdate(
      "rejected",
      (...args) => gtagCalls.push(args),
      (...args) => fbqCalls.push(args)
    );
    expect(gtagCalls[0]).toEqual(["consent", "update", { ...CONSENT_GRANTED }]);
    expect(gtagCalls[1]).toEqual(["consent", "update", { ...CONSENT_DENIED }]);
    expect(fbqCalls).toEqual([
      ["consent", "grant"],
      ["consent", "revoke"],
    ]);
  });

  it("loads consent bootstrap before GTM in root layout", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    const consentAt = layout.indexOf("google-consent-default");
    const gtmAt = layout.indexOf("google-tag-manager");
    expect(consentAt).toBeGreaterThan(-1);
    expect(gtmAt).toBeGreaterThan(consentAt);
    expect(layout).toContain("consentModeBootstrapScript");
  });
});

describe("marketing GA / Meta host gate", () => {
  it("loads pixels on marketing hosts and app /kayit only", () => {
    expect(isMarketingAnalyticsHost("clinicbridge-ai.com")).toBe(true);
    expect(isMarketingAnalyticsHost("app.clinicbridge-ai.com")).toBe(false);
    expect(shouldLoadMarketingPixels("clinicbridge-ai.com", "/")).toBe(true);
    expect(shouldLoadMarketingPixels("app.clinicbridge-ai.com", "/kayit")).toBe(true);
    expect(shouldLoadMarketingPixels("app.clinicbridge-ai.com", "/clinics")).toBe(false);
    expect(shouldLoadMarketingPixels("widget.clinicbridge-ai.com", "/kayit")).toBe(false);
  });

  it("keeps a single direct GA4 config and does not block page_view", () => {
    const tag = readFileSync("components/analytics/MarketingGoogleTag.tsx", "utf8");
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(tag.match(/gtag\('config'/g)).toHaveLength(1);
    expect(tag).not.toContain("send_page_view: false");
    expect(layout).toContain("<MarketingGoogleTag ");
    expect(layout.match(/G-DP3FV4PQWD/g) || []).toHaveLength(0);
  });

  it("loads Meta Pixel only with a valid NEXT_PUBLIC_META_PIXEL_ID", () => {
    expect(sanitizeMetaPixelId("")).toBeNull();
    expect(sanitizeMetaPixelId("abc")).toBeNull();
    expect(sanitizeMetaPixelId("1234567890")).toBe("1234567890");
    const pixel = readFileSync("components/analytics/MarketingMetaPixel.tsx", "utf8");
    expect(pixel).toContain("fbq('consent','revoke')");
    expect(pixel).toContain("PageView");
    expect(readFileSync("app/layout.tsx", "utf8")).toContain("<MarketingMetaPixel ");
  });
});

describe("wiring", () => {
  it("fires sign_up after successful /kayit signup", () => {
    const source = readFileSync("app/kayit/page.tsx", "utf8");
    const okAt = source.indexOf("if (!response.ok)");
    const trackAt = source.indexOf("trackSignUp()");
    expect(trackAt).toBeGreaterThan(okAt);
  });

  it("fires begin_checkout when a pricing plan is chosen", () => {
    const source = readFileSync("components/landing/PricingSection.tsx", "utf8");
    expect(source).toContain("trackBeginCheckout");
    expect(source).toContain("buildAppSignupUrl");
  });

  it("keeps TR homepage absolute title; EN is /en + root fallback only", () => {
    const home = readFileSync("lib/seo/homeMetadata.ts", "utf8");
    const rootPage = readFileSync("app/page.tsx", "utf8");
    const enPage = readFileSync("app/en/page.tsx", "utf8");
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(home).toContain(
      "Sağlık Turizmi Klinikleri İçin Çok Dilli AI Asistan | ClinicBridge"
    );
    expect(home).toContain(
      "Multilingual AI Assistant for Medical Tourism Clinics | ClinicBridge AI"
    );
    expect(rootPage).toContain('homeMetadata("tr")');
    expect(enPage).toContain('homeMetadata("en")');
    expect(layout).toContain(
      "Multilingual AI Assistant for Medical Tourism Clinics | ClinicBridge AI"
    );
    expect(layout).not.toContain("AI Clinic Management Platform");
  });
});
