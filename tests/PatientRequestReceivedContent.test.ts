import { describe, it, expect } from "vitest";
import {
  buildPatientRequestReceivedCopy,
  buildPatientRequestReceivedSubject,
} from "../lib/services/patientRequestReceivedContent";

describe("patient request-received email content", () => {
  it("states that the agency is evaluating and lists next steps (TR)", () => {
    const subject = buildPatientRequestReceivedSubject({
      lang: "tr",
      leadReference: "CB-20260805-ABC12",
      agencyName: "FeelinHealthy",
    });
    expect(subject).toMatch(/inceliyor|alındı/i);

    const { html, text } = buildPatientRequestReceivedCopy({
      lang: "tr",
      agencyName: "FeelinHealthy",
      patientFirstName: "Alper",
      treatmentName: "implant",
      clinicNames: ["İstanbul Diş Akademisi"],
      leadReference: "CB-20260805-ABC12",
      selectedCity: "istanbul",
      travelDate: "eylül",
    });

    expect(html).toMatch(/ekibimiz inceliyor/i);
    expect(html).toContain("Şimdi ne olacak");
    expect(html).toContain("İstanbul Diş Akademisi");
    expect(html).toContain("implant");
    expect(text).toContain("FeelinHealthy ekibi talebinizi inceler");
    // CTA temporarily off by default
    expect(html).not.toContain("Talebimi Görüntüle");
    expect(text).not.toMatch(/görüntüleyin/i);
  });

  it("includes EN next-step copy without View My Request by default", () => {
    const { html } = buildPatientRequestReceivedCopy({
      lang: "en",
      agencyName: "FeelinHealthy",
      patientFirstName: "Ada",
      treatmentName: "implant",
      clinicNames: ["BHT Clinic"],
      leadReference: "CB-1",
    });
    expect(html).toMatch(/reviewing/i);
    expect(html).toContain("What happens next");
    expect(html).not.toContain("View My Request");
  });

  it("can re-enable the view-request CTA when flagged", () => {
    const { html } = buildPatientRequestReceivedCopy({
      lang: "tr",
      agencyName: "FeelinHealthy",
      patientFirstName: "Alper",
      treatmentName: "implant",
      clinicNames: ["Klinik A"],
      leadReference: "CB-1",
      secureUrl: "https://app.clinicbridge-ai.com/patient/request?token=x",
      includeViewRequestCta: true,
    });
    expect(html).toContain("Talebimi Görüntüle");
    expect(html).toContain("token=x");
  });
});
