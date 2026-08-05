import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  leadEmailHistoryBadgeLabel,
  resolveLeadEmailHistoryBadge,
} from "../lib/agency/leadEmailHistory";

describe("lead email history badges", () => {
  it("shows sent when agency notification job is sent (even without legacy flag)", () => {
    expect(
      resolveLeadEmailHistoryBadge({
        kind: "agency",
        jobs: [{ eventType: "agency_lead_submitted", status: "sent" }],
        lead: { notificationEmailSent: false },
      })
    ).toBe("sent");
  });

  it("falls back to lead.notificationStatus / notificationSentAt", () => {
    expect(
      resolveLeadEmailHistoryBadge({
        kind: "agency",
        jobs: [],
        lead: { notificationStatus: "sent" },
      })
    ).toBe("sent");
    expect(
      resolveLeadEmailHistoryBadge({
        kind: "agency",
        jobs: [],
        lead: { notificationSentAt: "2026-08-05T13:39:00.000Z" },
      })
    ).toBe("sent");
  });

  it("keeps legacy notificationEmailSent / patientEmailSent working", () => {
    expect(
      resolveLeadEmailHistoryBadge({
        kind: "agency",
        jobs: [],
        lead: { notificationEmailSent: true },
      })
    ).toBe("sent");
    expect(
      resolveLeadEmailHistoryBadge({
        kind: "patient",
        jobs: [],
        lead: { patientEmailSent: true },
      })
    ).toBe("sent");
  });

  it("maps patient job status and labels in Turkish", () => {
    expect(
      resolveLeadEmailHistoryBadge({
        kind: "patient",
        jobs: [{ eventType: "patient_request_received", status: "skipped" }],
        lead: {},
      })
    ).toBe("skipped");
    expect(leadEmailHistoryBadgeLabel("sent", "tr")).toBe("Gönderildi");
    expect(leadEmailHistoryBadgeLabel("not_sent", "tr")).toBe("Gönderilmedi");
  });

  it("lead detail page uses resolver instead of only legacy flags", () => {
    const page = readFileSync(
      join(process.cwd(), "app/agency/agencies/[agencyId]/leads/[leadId]/page.tsx"),
      "utf8"
    );
    expect(page).toContain("resolveLeadEmailHistoryBadge");
    expect(page).not.toContain("(lead as any).notificationEmailSent");
  });

  it("agency notification service dual-writes notificationEmailSent on sent", () => {
    const service = readFileSync(
      join(process.cwd(), "lib/services/agencyNotificationService.ts"),
      "utf8"
    );
    expect(service).toContain("notificationEmailSent: true");
  });
});
