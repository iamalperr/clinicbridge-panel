/**
 * Agency-facing notification sender branding must use resolveAgencyBrand,
 * not a hardcoded ClinicBridge AI From header.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { resolveAgencyBrand } from "../lib/agency/resolveAgencyBrand";
import {
  buildAgencyLeadNotificationJobId,
  buildAgencyQuoteNotificationContent,
} from "../lib/services/agencyQuoteNotificationContent";

describe("Agency notification sender branding", () => {
  it("TEST A — FeelinHealthy From uses agency brand", () => {
    const brand = resolveAgencyBrand({
      name: "FeelinHealthy",
      branding: { displayName: "FeelinHealthy" },
    });
    expect(brand.fromHeader).toBe("FeelinHealthy <noreply@clinicbridge-ai.com>");
    expect(brand.fromHeader).not.toContain("ClinicBridge AI");
    expect(brand.fromEmail).toBe("noreply@clinicbridge-ai.com");
  });

  it("TEST B — other branded agency uses its display name", () => {
    const brand = resolveAgencyBrand({
      name: "Example Agency",
      branding: { displayName: "Example Agency" },
    });
    expect(brand.fromHeader).toBe("Example Agency <noreply@clinicbridge-ai.com>");
  });

  it("TEST C — no agency context falls back to ClinicBridge AI", () => {
    const brand = resolveAgencyBrand(null);
    expect(brand.fromHeader).toBe("ClinicBridge AI <noreply@clinicbridge-ai.com>");
    expect(brand.isAgencyBranded).toBe(false);
  });

  it("TEST D — quote-scoped idempotency keys unchanged by branding", () => {
    const lead = "lead_shared";
    const q1 = buildAgencyLeadNotificationJobId(lead, "quote_hair");
    const q2 = buildAgencyLeadNotificationJobId(lead, "quote_implant");
    expect(q1).toBe("job_lead_shared_agency_lead_submitted_quote_hair");
    expect(q2).toBe("job_lead_shared_agency_lead_submitted_quote_implant");
    expect(q1).not.toBe(q2);
    expect(buildAgencyLeadNotificationJobId(lead, "quote_hair")).toBe(q1);
  });

  it("live Yeni Teklif Talebi path wires brand.fromHeader (not hardcoded ClinicBridge)", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/services/agencyNotificationService.ts"),
      "utf8"
    );
    expect(src.includes('from: "ClinicBridge AI <noreply@clinicbridge-ai.com>"')).toBe(false);
    expect(src).toContain("resolveAgencyBrand");
    expect(src).toContain("from: brand.fromHeader");
    expect(src).toContain("buildAgencyQuoteNotificationContent");
  });

  it("subject for Yeni Teklif Talebi remains request-shaped (not ClinicBridge-branded)", () => {
    const content = buildAgencyQuoteNotificationContent({
      lang: "tr",
      patientName: "Andrew Mathewson",
      treatmentLabel: "hair_transplant",
      clinicNames: ["Hospitadent Mecidiyeköy"],
      quoteRequestId: "lead-synth",
      portalUrl: "https://app.clinicbridge-ai.com/agency/agencies/feelinhealthy/leads/lead-synth",
    });
    expect(content.subject).toBe("Yeni Teklif Talebi – Andrew Mathewson – hair_transplant");
    expect(content.subject).not.toMatch(/ClinicBridge/i);
  });

  it("legacy sendAgencyLeadNotification also uses resolveAgencyBrand", () => {
    const src = readFileSync(join(process.cwd(), "lib/services/emailService.ts"), "utf8");
    expect(src).toContain("sendAgencyLeadNotification");
    expect(src).toContain("resolveAgencyBrand");
    expect(src).toContain("from: brand.fromHeader");
    expect(src.includes('from: "ClinicBridge AI <noreply@clinicbridge-ai.com>"')).toBe(false);
  });
});
