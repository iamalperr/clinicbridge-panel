import { describe, it, expect } from "vitest";
import { isLeadSubmittedForPatientNotification } from "../lib/services/leadNotificationEligibility";

describe("patient notification lead eligibility", () => {
  it("accepts canonical agency lead statuses (not only legacy submitted)", () => {
    expect(isLeadSubmittedForPatientNotification({ status: "quote_requested" })).toBe(true);
    expect(isLeadSubmittedForPatientNotification({ status: "waiting_for_assignment" })).toBe(true);
    expect(isLeadSubmittedForPatientNotification({ status: "new" })).toBe(true);
    expect(isLeadSubmittedForPatientNotification({ status: "submitted" })).toBe(true);
  });

  it("accepts leads with submittedAt even if status drifted", () => {
    expect(
      isLeadSubmittedForPatientNotification({
        status: "waiting_for_assignment",
        submittedAt: "2026-08-05T13:17:00.000Z",
      })
    ).toBe(true);
  });

  it("rejects lost / empty status without submittedAt", () => {
    expect(isLeadSubmittedForPatientNotification({ status: "lost" })).toBe(false);
    expect(isLeadSubmittedForPatientNotification({ status: "" })).toBe(false);
    expect(isLeadSubmittedForPatientNotification({})).toBe(false);
  });
});
