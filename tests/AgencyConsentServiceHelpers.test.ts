import { describe, expect, it } from "vitest";
import {
  consentVerificationErrorCode,
  DEFAULT_AGENCY_CONSENT_VERSION,
  parseStructuredConsentAcceptAction,
  resolveAgencyConsentVersion,
} from "../lib/services/agencyConsentService";

describe("AgencyConsentService pure helpers", () => {
  it("resolves consent versions with v1.0 default", () => {
    expect(DEFAULT_AGENCY_CONSENT_VERSION).toBe("v1.0");
    expect(resolveAgencyConsentVersion(null)).toBe("v1.0");
    expect(resolveAgencyConsentVersion({ version: "  " })).toBe("v1.0");
    expect(resolveAgencyConsentVersion({ version: "v2.1" })).toBe("v2.1");
  });

  it("maps verification failures to persistence error codes", () => {
    expect(consentVerificationErrorCode({ ok: true, status: "accepted" })).toBe("");
    expect(consentVerificationErrorCode({ ok: false, status: "missing" })).toBe("CONSENT_REQUIRED");
    expect(consentVerificationErrorCode({ ok: false, status: "rejected" })).toBe("CONSENT_REJECTED");
    expect(consentVerificationErrorCode({ ok: false, status: "expired" })).toBe("CONSENT_EXPIRED");
    expect(consentVerificationErrorCode({ ok: false, status: "version_mismatch" })).toBe(
      "CONSENT_VERSION_MISMATCH"
    );
    expect(consentVerificationErrorCode({ ok: false, status: "verification_failed" })).toBe(
      "CONSENT_VERIFICATION_FAILED"
    );
  });

  it("validates structured consent actions and rejects booleans", () => {
    expect(parseStructuredConsentAcceptAction(true, "v1.0").ok).toBe(false);
    expect(
      parseStructuredConsentAcceptAction(
        { type: "privacy_consent_response", action: "accept", consentVersion: "v1.0" },
        "v1.0"
      ).ok
    ).toBe(true);
  });
});
