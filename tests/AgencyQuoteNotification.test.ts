import { describe, it, expect } from "vitest";
import {
  buildAgencyLeadNotificationJobId,
  buildAgencyQuoteNotificationContent,
  buildQuoteRequestPortalUrl,
  collectQuoteNotificationRecipients,
  computeNextRetryAt,
  isRetryableNotificationJob,
  pickOfficialClinicName,
} from "../lib/services/agencyQuoteNotificationContent";

describe("FeelinHealthy quote request email notifications", () => {
  it("Test 1 – single clinic content includes official name + portal conversation link", () => {
    const portalUrl = buildQuoteRequestPortalUrl("agency-fh", "lead-1");
    const content = buildAgencyQuoteNotificationContent({
      lang: "tr",
      patientName: "Ada Yılmaz",
      patientEmail: "ada@example.com",
      patientPhone: "+905551112233",
      patientCountry: "TR",
      treatmentLabel: "implant",
      preferredCity: "istanbul",
      istanbulSide: "european",
      travelDate: "2026-09-10",
      clinicNames: ["Hospitadent Mecidiyeköy"],
      quoteRequestId: "lead-1",
      conversationId: "sess-abc",
      portalUrl,
      createdAt: "2026-08-04T12:00:00.000Z",
      status: "waiting_for_assignment",
    });

    expect(content.subject).toBe("Yeni Teklif Talebi – Ada Yılmaz – implant");
    expect(content.subject).not.toMatch(/implant sayısı|x-ray|röntgen/i);
    expect(content.html).toContain("Hospitadent Mecidiyeköy");
    expect(content.html).toContain("Ada Yılmaz");
    expect(content.html).toContain("ada@example.com");
    expect(content.html).toContain("+905551112233");
    expect(content.html).toContain("TR");
    expect(content.html).toContain("istanbul");
    expect(content.html).toContain("Avrupa Yakası");
    expect(content.html).toContain("2026-09-10");
    expect(content.html).toContain(portalUrl);
    expect(content.html).toContain("lead-1");
    expect(portalUrl).toBe(
      "https://app.clinicbridge-ai.com/agency/agencies/agency-fh/leads/lead-1"
    );
  });

  it("Test 2 – two clinics listed in one notification email", () => {
    const content = buildAgencyQuoteNotificationContent({
      lang: "tr",
      patientName: "Ada Yılmaz",
      patientEmail: "ada@example.com",
      treatmentLabel: "implant",
      clinicNames: ["Hospitadent Mecidiyeköy", "BHT Clinic İstanbul TEMA Hospital"],
      quoteRequestId: "lead-2",
      portalUrl: buildQuoteRequestPortalUrl("agency-fh", "lead-2"),
    });
    expect(content.html).toContain("Hospitadent Mecidiyeköy");
    expect(content.html).toContain("BHT Clinic İstanbul TEMA Hospital");
    expect(content.text).toContain("- Hospitadent Mecidiyeköy");
    expect(content.text).toContain("- BHT Clinic İstanbul TEMA Hospital");
  });

  it("Test 3 – email failure remains trackable (retryable failed job)", () => {
    const job = {
      status: "failed",
      attemptCount: 1,
      maxAttempts: 3,
      nextAttemptAt: new Date(Date.now() - 1000).toISOString(),
    };
    expect(isRetryableNotificationJob(job)).toBe(true);
    expect(buildAgencyLeadNotificationJobId("lead-3")).toBe("job_lead-3_agency_lead_submitted");
  });

  it("Test 4 – retry is idempotent on same quoteRequestId + notificationType", () => {
    const keyA = buildAgencyLeadNotificationJobId("lead-4");
    const keyB = buildAgencyLeadNotificationJobId("lead-4");
    expect(keyA).toBe(keyB);
    expect(isRetryableNotificationJob({ status: "sent", attemptCount: 1, maxAttempts: 3 })).toBe(
      false
    );
    expect(
      isRetryableNotificationJob({ status: "processing", attemptCount: 1, maxAttempts: 3 })
    ).toBe(false);
    expect(computeNextRetryAt(1)).toMatch(/T/);
  });

  it("Test 5 – missing recipient config is explicit (no invented address)", () => {
    const result = collectQuoteNotificationRecipients({});
    expect(result.recipients).toEqual([]);
    expect(result.configError).toBe("NO_RECIPIENTS_CONFIGURED");

    const fromQuoteList = collectQuoteNotificationRecipients({
      quoteNotificationEmails: ["ops@feelinhealthy.com", "bad-email", "ops@feelinhealthy.com"],
      notificationEmail: "ignored@example.com",
    });
    expect(fromQuoteList.recipients).toEqual(["ops@feelinhealthy.com"]);
    expect(fromQuoteList.source).toBe("quoteNotificationEmails");
  });

  it("Test 6 – portal link is authenticated Portal lead route (no PII query params)", () => {
    const url = buildQuoteRequestPortalUrl("fh-agency", "lead-xyz");
    expect(url).toContain("/agency/agencies/fh-agency/leads/lead-xyz");
    expect(url).not.toMatch(/email=|phone=|patient=/i);
  });

  it("resolves official clinic names from backend clinic docs", () => {
    expect(pickOfficialClinicName({ clinicName: "Hospitadent Mecidiyeköy" }, "id1")).toBe(
      "Hospitadent Mecidiyeköy"
    );
    expect(pickOfficialClinicName({ name: "BHT Clinic" }, "id2")).toBe("BHT Clinic");
    expect(pickOfficialClinicName(null, "HXMlMPZ74AXkXoR4sEnH")).toBe("HXMlMPZ74AXkXoR4sEnH");
  });

  it("database-first contract: notification job id is derived from persisted lead id", () => {
    // Email scheduling uses leadId only after submitAgencyLead returns created/already_exists.
    const leadId = "persisted-lead-id";
    expect(buildAgencyLeadNotificationJobId(leadId)).toContain(leadId);
  });
});
