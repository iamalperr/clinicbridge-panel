/**
 * Treatment-quote email idempotency: same lead, two treatment quotes → two jobs;
 * retries of the same quoteId do not create a second job key.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  buildAgencyLeadNotificationJobId,
  buildPatientLeadNotificationJobId,
} from "../lib/services/agencyQuoteNotificationContent";

describe("Treatment quote email idempotency contract", () => {
  const leadId = "lead_shared";
  const quoteRhino = "quote_rhino";
  const quoteImplant = "quote_implant";

  it("Q1 and Q2 under the same lead get distinct patient + agency job keys", () => {
    const patientQ1 = buildPatientLeadNotificationJobId(leadId, quoteRhino);
    const patientQ2 = buildPatientLeadNotificationJobId(leadId, quoteImplant);
    const agencyQ1 = buildAgencyLeadNotificationJobId(leadId, quoteRhino);
    const agencyQ2 = buildAgencyLeadNotificationJobId(leadId, quoteImplant);

    expect(patientQ1).not.toBe(patientQ2);
    expect(agencyQ1).not.toBe(agencyQ2);
    expect(patientQ1).toContain(quoteRhino);
    expect(patientQ2).toContain(quoteImplant);
  });

  it("retry of the same quoteId is idempotent (same job key)", () => {
    expect(buildPatientLeadNotificationJobId(leadId, quoteRhino)).toBe(
      buildPatientLeadNotificationJobId(leadId, quoteRhino)
    );
    expect(buildAgencyLeadNotificationJobId(leadId, quoteImplant)).toBe(
      buildAgencyLeadNotificationJobId(leadId, quoteImplant)
    );
  });

  it("persistAgencyQuoteRequest passes quoteId into both schedulers", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/services/agencyQuoteRequestService.ts"),
      "utf8"
    );
    expect(src).toContain("scheduleAndProcessAgencyLeadNotification(input.agencyId, leadId, { quoteId })");
    expect(src).toContain("scheduleAndProcessPatientLeadNotification(input.agencyId, leadId, { quoteId })");
    expect(src).toContain("quoteCreated");
  });

  it("patient/agency schedulers accept optional quoteId", () => {
    const patientSrc = readFileSync(
      join(process.cwd(), "lib/services/patientNotificationService.ts"),
      "utf8"
    );
    const agencySrc = readFileSync(
      join(process.cwd(), "lib/services/agencyNotificationService.ts"),
      "utf8"
    );
    expect(patientSrc).toContain("opts?: { quoteId?: string | null }");
    expect(patientSrc).toContain("buildPatientLeadNotificationJobId");
    expect(agencySrc).toContain("opts?: { quoteId?: string | null }");
    expect(agencySrc).toContain("buildAgencyLeadNotificationJobId(leadId, quoteId)");
  });
});
