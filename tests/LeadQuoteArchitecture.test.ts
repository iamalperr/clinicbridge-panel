import { describe, it, expect } from "vitest";
import {
  LEAD_STATUS_AFTER_QUOTE,
  QUOTE_STATUS_AFTER_CREATE,
  agencyLeadDetailPath,
  agencyQuotesPath,
  buildLeadQuoteLinkPatch,
  buildLeadQuoteStatusHistoryEntry,
  leadStatusToCandidateStage,
} from "../lib/agency/leadQuoteArchitecture";

describe("Lead ↔ Quote architecture", () => {
  it("maps lead statuses to patient candidate stages", () => {
    expect(leadStatusToCandidateStage("new")).toBe("discovery");
    expect(leadStatusToCandidateStage("pre_qualified")).toBe("qualified");
    expect(leadStatusToCandidateStage("waiting_for_assignment")).toBe("qualified");
    expect(leadStatusToCandidateStage("assigned_to_clinic")).toBe("clinic_selected");
    expect(leadStatusToCandidateStage("quote_requested")).toBe("quote_created");
    expect(leadStatusToCandidateStage("converted")).toBe("quote_created");
    expect(leadStatusToCandidateStage("lost")).toBe("closed");
  });

  it("builds bi-directional lead patch after quote create", () => {
    const patch = buildLeadQuoteLinkPatch({
      quoteId: "quote-abc",
      clinicIds: ["c1", "c2"],
      clinicNames: ["Hospitadent Mecidiyeköy", "DentGroup"],
      travelDate: "10-19 Eylül",
      selectedCity: "istanbul",
      istanbulSide: "european",
      nowIso: "2026-08-04T12:00:00.000Z",
    });

    expect(patch.status).toBe(LEAD_STATUS_AFTER_QUOTE);
    expect(patch.quoteId).toBe("quote-abc");
    expect(patch.quoteRequestedAt).toBe("2026-08-04T12:00:00.000Z");
    expect(patch.clinicIds).toEqual(["c1", "c2"]);
    expect(patch.clinicRequestCount).toBe(2);
    expect(patch.selectedClinicNames).toEqual(["Hospitadent Mecidiyeköy", "DentGroup"]);
    expect(patch.assignedClinicName).toBe("Hospitadent Mecidiyeköy");
    expect(patch.travelDate).toBe("10-19 Eylül");
    expect(patch.selectedCity).toBe("istanbul");
    expect(patch.istanbul_side).toBe("european");
  });

  it("uses canonical quote status after create", () => {
    expect(QUOTE_STATUS_AFTER_CREATE).toBe("requested");
    expect(LEAD_STATUS_AFTER_QUOTE).toBe("quote_requested");
  });

  it("records status history entry for quote link", () => {
    const entry = buildLeadQuoteStatusHistoryEntry("2026-08-04T12:00:00.000Z");
    expect(entry.status).toBe("quote_requested");
    expect(entry.changedAt).toBe("2026-08-04T12:00:00.000Z");
    expect(entry.note).toMatch(/Quote request created/i);
  });

  it("builds portal cross-link paths", () => {
    expect(agencyLeadDetailPath("ag1", "lead1")).toBe("/agency/agencies/ag1/leads/lead1");
    expect(agencyQuotesPath("ag1")).toBe("/agency/agencies/ag1/quotes");
    expect(agencyQuotesPath("ag1", "quote-1")).toBe(
      "/agency/agencies/ag1/quotes?quoteId=quote-1"
    );
  });
});
