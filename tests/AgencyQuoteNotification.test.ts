import { describe, it, expect } from "vitest";
import {
  buildAgencyLeadNotificationJobId,
  buildPatientLeadNotificationJobId,
  buildAgencyQuoteNotificationContent,
  buildQuoteRequestPortalUrl,
  collectQuoteNotificationRecipients,
  computeNextRetryAt,
  isRetryableNotificationJob,
  normalizeQuoteNotificationSettings,
  pickOfficialClinicName,
  resolveQuoteNotificationDelivery,
  validateQuoteNotificationSettingsInput,
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

  it("Test 3b – quote-scoped job ids differ per quote under the same lead", () => {
    const lead = "lead-shared";
    const q1 = buildAgencyLeadNotificationJobId(lead, "quote_rhino");
    const q2 = buildAgencyLeadNotificationJobId(lead, "quote_implant");
    const q1Retry = buildAgencyLeadNotificationJobId(lead, "quote_rhino");
    expect(q1).toBe("job_lead-shared_agency_lead_submitted_quote_rhino");
    expect(q2).toBe("job_lead-shared_agency_lead_submitted_quote_implant");
    expect(q1).not.toBe(q2);
    expect(q1Retry).toBe(q1);
    // Legacy lead-only key remains for non-quote callers
    expect(buildAgencyLeadNotificationJobId(lead)).toBe(
      "job_lead-shared_agency_lead_submitted"
    );
  });

  it("Test 3c – patient notification job ids are quote-scoped when quoteId present", () => {
    const lead = "lead-shared";
    const p1 = buildPatientLeadNotificationJobId(lead, "quote_rhino");
    const p2 = buildPatientLeadNotificationJobId(lead, "quote_implant");
    expect(p1).toBe("job_lead-shared_patient_request_received_quote_rhino");
    expect(p2).toBe("job_lead-shared_patient_request_received_quote_implant");
    expect(p1).not.toBe(p2);
    expect(buildPatientLeadNotificationJobId(lead, "quote_rhino")).toBe(p1);
    expect(buildPatientLeadNotificationJobId(lead)).toBe(
      "job_lead-shared_patient_request_received"
    );
  });

  it("Test 4 – retry is idempotent on same quoteRequestId + notificationType", () => {
    const keyA = buildAgencyLeadNotificationJobId("lead-4");
    const keyB = buildAgencyLeadNotificationJobId("lead-4");
    expect(keyA).toBe(keyB);
    expect(isRetryableNotificationJob({ status: "sent", attemptCount: 1, maxAttempts: 3 })).toBe(
      false
    );
    // Fresh processing is owned by an in-flight worker.
    expect(
      isRetryableNotificationJob({
        status: "processing",
        attemptCount: 1,
        maxAttempts: 3,
        lastAttemptAt: new Date().toISOString(),
      })
    ).toBe(false);
    // Stale processing (serverless freeze) must be reclaimable.
    expect(
      isRetryableNotificationJob({
        status: "processing",
        attemptCount: 1,
        maxAttempts: 3,
        lastAttemptAt: new Date(Date.now() - 120_000).toISOString(),
      })
    ).toBe(true);
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

  it("quoteNotificationSettings: disabled skips send", () => {
    const delivery = resolveQuoteNotificationDelivery({
      quoteNotificationSettings: {
        enabled: false,
        recipients: ["ops@feelinhealthy.com"],
        cc: [],
      },
    });
    expect(delivery.outcome).toBe("disabled");
    expect(delivery.recipients).toEqual([]);
  });

  it("quoteNotificationSettings: enabled without recipients → config_missing", () => {
    const delivery = resolveQuoteNotificationDelivery({
      quoteNotificationSettings: {
        enabled: true,
        recipients: ["bad", "  ", "not-an-email"],
        cc: ["also-bad"],
      },
    });
    expect(delivery.outcome).toBe("config_missing");
    expect(delivery.configError).toBe("NO_RECIPIENTS_CONFIGURED");
  });

  it("quoteNotificationSettings: validates, trims, dedupes recipients/cc/replyTo", () => {
    const settings = normalizeQuoteNotificationSettings({
      enabled: true,
      recipients: [" Ops@FeelinHealthy.com ", "ops@feelinhealthy.com", "bad", ""],
      cc: ["cc@feelinhealthy.com", "ops@feelinhealthy.com"],
      replyTo: " Reply@FeelinHealthy.com ",
    });
    expect(settings.recipients).toEqual(["ops@feelinhealthy.com"]);
    expect(settings.cc).toEqual(["cc@feelinhealthy.com"]);
    expect(settings.replyTo).toBe("reply@feelinhealthy.com");

    const delivery = resolveQuoteNotificationDelivery({
      quoteNotificationSettings: settings,
    });
    expect(delivery.outcome).toBe("ready");
    expect(delivery.recipients).toEqual(["ops@feelinhealthy.com"]);
    expect(delivery.cc).toEqual(["cc@feelinhealthy.com"]);
    expect(delivery.replyTo).toBe("reply@feelinhealthy.com");
  });

  it("warns when enabled without recipients", () => {
    const result = validateQuoteNotificationSettingsInput({
      enabled: true,
      recipients: [],
      cc: [],
    });
    expect(result.warnings).toContain("ENABLED_WITHOUT_RECIPIENTS");
  });

  it("does not retry skipped or config_missing jobs", () => {
    expect(isRetryableNotificationJob({ status: "skipped", attemptCount: 0, maxAttempts: 3 })).toBe(
      false
    );
    expect(
      isRetryableNotificationJob({ status: "config_missing", attemptCount: 1, maxAttempts: 3 })
    ).toBe(false);
  });
});
