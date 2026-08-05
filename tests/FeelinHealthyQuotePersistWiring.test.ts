import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("FeelinHealthy quote request persistence wiring", () => {
  const routeSource = readFileSync(
    join(process.cwd(), "app/api/public/agency/[slug]/matching-chat/route.ts"),
    "utf8"
  );
  const serviceSource = readFileSync(
    join(process.cwd(), "lib/services/agencyQuoteRequestService.ts"),
    "utf8"
  );
  const demoSource = readFileSync(
    join(process.cwd(), "app/demo/feelinhealthy/page.tsx"),
    "utf8"
  );

  it("matching-chat persists lead+quote server-side before claiming success", () => {
    expect(routeSource).toContain("persistAgencyQuoteRequest");
    expect(routeSource).toContain("Teklif talebiniz başarıyla oluşturuldu");
    expect(routeSource).toContain("shouldCreateNewLead: false");
    expect(routeSource).toContain("quotePersistError");
    expect(routeSource).toContain("request_quote");
  });

  it("blocks LLM fake quote-sent claims without backend confirmation", () => {
    expect(routeSource).toContain("teklif talebinizi ilettim");
    expect(routeSource).toContain("Never let the model claim a quote was sent");
  });

  it("quote request service writes both leads path and quotes collection", () => {
    expect(serviceSource).toContain("submitAgencyLead");
    expect(serviceSource).toContain('.collection("quotes")');
    expect(serviceSource).toContain("selectedClinicNames");
    expect(serviceSource).toContain("travelDate");
    expect(serviceSource).toContain("deferNotifications: true");
  });

  it("lead submission aligns consent version with matching-chat before persist", () => {
    const leadSubmissionSource = readFileSync(
      join(process.cwd(), "lib/services/leadSubmissionService.ts"),
      "utf8"
    );
    expect(leadSubmissionSource).toContain("resolveAgencyConsentVersion");
  });

  it("lead transaction reads clinics before any writes (Firestore rule)", () => {
    const leadSubmissionSource = readFileSync(
      join(process.cwd(), "lib/services/leadSubmissionService.ts"),
      "utf8"
    );
    const validateIdx = leadSubmissionSource.indexOf("Validate clinics (reads) before any writes");
    const leadSetIdx = leadSubmissionSource.indexOf("transaction.set(leadRef, leadData)");
    expect(validateIdx).toBeGreaterThan(-1);
    expect(leadSetIdx).toBeGreaterThan(validateIdx);
  });

  it("demo uses structured clinic card actions (not shared lead_capture path)", () => {
    expect(demoSource).toContain('action: "select_clinic"');
    expect(demoSource).toContain('action: "view_clinic_details"');
    expect(demoSource).toContain('action: "request_quote"');
    expect(demoSource).not.toContain('type: "lead_capture"');
  });

  it("demo opens profile with URL-encoded prefill and has quote-request fallback", () => {
    expect(demoSource).toContain("appendAgentPrefillQuery(data.profileUrl, prefill)");
    expect(demoSource).toContain("/quote-request");
  });

  it("dedicated quote-request route exists and bootstraps consent", () => {
    const quoteRequestSource = readFileSync(
      join(process.cwd(), "app/api/public/agency/[slug]/quote-request/route.ts"),
      "utf8"
    );
    expect(quoteRequestSource).toContain("saveConsentRecord");
    expect(quoteRequestSource).toContain("persistAgencyQuoteRequest");
  });
});
