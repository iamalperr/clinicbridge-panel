import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const {
  mockGetAdminDb,
  mockVerifyAcceptedAgencyConsent,
  mockConsentVerificationErrorCode,
  mockResolveAgencyConsentVersion,
  mockSubmitAgencyLead,
  mockScheduleAgency,
  mockSchedulePatient,
} = vi.hoisted(() => ({
  mockGetAdminDb: vi.fn(),
  mockVerifyAcceptedAgencyConsent: vi.fn(
    async (_agencyId?: string, _sessionId?: string, _requiredVersion?: string) =>
      ({
        ok: false,
        status: "missing",
      }) as { ok: boolean; status: string; consentRecordId?: string; consentVersion?: string }
  ),
  mockConsentVerificationErrorCode: vi.fn((r: { status?: string }) => {
    if (r?.status === "rejected") return "CONSENT_REJECTED";
    if (r?.status === "version_mismatch") return "CONSENT_VERSION_MISMATCH";
    if (r?.status === "verification_failed") return "CONSENT_VERIFICATION_FAILED";
    return "CONSENT_REQUIRED";
  }),
  mockResolveAgencyConsentVersion: vi.fn((_privacySettings?: unknown) => "v1.0"),
  mockSubmitAgencyLead: vi.fn(async (_input?: unknown) => ({
    leadId: "lead_1",
    agencyId: "agency_1",
    status: "created",
  })),
  mockScheduleAgency: vi.fn(async (_agencyId?: string, _leadId?: string) => undefined),
  mockSchedulePatient: vi.fn(async (_agencyId?: string, _leadId?: string) => undefined),
}));

vi.mock("../lib/firebase-admin", () => ({
  getAdminDb: () => mockGetAdminDb(),
}));

vi.mock("../lib/services/agencyConsentService", () => ({
  resolveAgencyConsentVersion: (privacySettings?: { version?: string } | null) =>
    mockResolveAgencyConsentVersion(privacySettings),
  verifyAcceptedAgencyConsent: (
    agencyId: string,
    sessionId: string,
    requiredVersion: string
  ) => mockVerifyAcceptedAgencyConsent(agencyId, sessionId, requiredVersion),
  consentVerificationErrorCode: (r: { status?: string }) => mockConsentVerificationErrorCode(r),
  DEFAULT_AGENCY_CONSENT_VERSION: "v1.0",
}));

vi.mock("../lib/services/leadSubmissionService", () => ({
  submitAgencyLead: (input: unknown) => mockSubmitAgencyLead(input),
}));

vi.mock("../lib/services/agencyNotificationService", () => ({
  scheduleAndProcessAgencyLeadNotification: (agencyId: string, leadId: string) =>
    mockScheduleAgency(agencyId, leadId),
}));

vi.mock("../lib/services/patientNotificationService", () => ({
  scheduleAndProcessPatientLeadNotification: (agencyId: string, leadId: string) =>
    mockSchedulePatient(agencyId, leadId),
}));

vi.mock("../lib/services/agencyQuoteNotificationContent", () => ({
  pickOfficialClinicName: (_data: unknown, id: string) => id,
}));

import {
  consentVerificationErrorCode,
  DEFAULT_AGENCY_CONSENT_VERSION,
  resolveAgencyConsentVersion,
} from "../lib/services/agencyConsentService";
import { persistAgencyQuoteRequest } from "../lib/services/agencyQuoteRequestService";

describe("Agency consent verification helpers (mocked module surface)", () => {
  it("exposes default version constant", () => {
    expect(DEFAULT_AGENCY_CONSENT_VERSION).toBe("v1.0");
    expect(resolveAgencyConsentVersion({})).toBe("v1.0");
  });

  it("maps verification statuses to explicit error codes", () => {
    expect(consentVerificationErrorCode({ ok: false, status: "missing" })).toBe("CONSENT_REQUIRED");
    expect(consentVerificationErrorCode({ ok: false, status: "rejected" })).toBe("CONSENT_REJECTED");
    expect(consentVerificationErrorCode({ ok: false, status: "version_mismatch" })).toBe(
      "CONSENT_VERSION_MISMATCH"
    );
    expect(consentVerificationErrorCode({ ok: false, status: "verification_failed" })).toBe(
      "CONSENT_VERIFICATION_FAILED"
    );
  });
});

describe("persistAgencyQuoteRequest consent gate", () => {
  const baseInput = {
    agencyId: "agency_1",
    conversationId: "sess_1",
    clinicIds: ["clinic_a"],
    patientEmail: "patient@example.com",
    patientName: "Test Patient",
    language: "tr",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAgencyConsentVersion.mockReturnValue("v1.0");
    mockConsentVerificationErrorCode.mockImplementation((r: { status?: string }) => {
      if (r?.status === "rejected") return "CONSENT_REJECTED";
      if (r?.status === "version_mismatch") return "CONSENT_VERSION_MISMATCH";
      if (r?.status === "verification_failed") return "CONSENT_VERIFICATION_FAILED";
      return "CONSENT_REQUIRED";
    });
    const emptySnap = { empty: true, docs: [], exists: false, data: () => null };
    const makeQuery = (): any => ({
      where: () => makeQuery(),
      limit: () => makeQuery(),
      get: async () => emptySnap,
    });
    const makeDoc = (id = "doc"): any => ({
      id,
      get: async () => ({
        exists: true,
        data: () => ({ privacySettings: { version: "v1.0" }, statusHistory: [], name: "Clinic A" }),
      }),
      set: async () => undefined,
      update: async () => undefined,
      collection: () => makeCollection(),
    });
    const makeCollection = (): any => ({
      doc: (id?: string) => makeDoc(id || "quote_1"),
      where: () => makeQuery(),
      add: async () => ({ id: "new" }),
    });
    mockGetAdminDb.mockReturnValue({
      collection: () => makeCollection(),
    });
  });

  it("returns CONSENT_REQUIRED and does not create lead/quote/notifications when consent missing", async () => {
    mockVerifyAcceptedAgencyConsent.mockResolvedValue({ ok: false, status: "missing" });

    const result = await persistAgencyQuoteRequest(baseInput);

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("CONSENT_REQUIRED");
    expect(mockSubmitAgencyLead).not.toHaveBeenCalled();
    expect(mockScheduleAgency).not.toHaveBeenCalled();
    expect(mockSchedulePatient).not.toHaveBeenCalled();
  });

  it("blocks persistence when consent was rejected", async () => {
    mockVerifyAcceptedAgencyConsent.mockResolvedValue({
      ok: false,
      status: "rejected",
      consentRecordId: "c1",
    });

    const result = await persistAgencyQuoteRequest(baseInput);

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("CONSENT_REJECTED");
    expect(mockSubmitAgencyLead).not.toHaveBeenCalled();
  });

  it("blocks persistence when consent verification fails", async () => {
    mockVerifyAcceptedAgencyConsent.mockResolvedValue({
      ok: false,
      status: "verification_failed",
    });

    const result = await persistAgencyQuoteRequest(baseInput);

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("CONSENT_VERIFICATION_FAILED");
    expect(mockSubmitAgencyLead).not.toHaveBeenCalled();
  });

  it("persists lead+quote when existing accepted consent verifies", async () => {
    mockVerifyAcceptedAgencyConsent.mockResolvedValue({
      ok: true,
      status: "accepted",
      consentRecordId: "c_ok",
      consentVersion: "v1.0",
    });
    mockSubmitAgencyLead.mockResolvedValue({
      leadId: "lead_1",
      agencyId: "agency_1",
      status: "created",
    });
    mockScheduleAgency.mockResolvedValue(undefined);
    mockSchedulePatient.mockResolvedValue(undefined);

    const result = await persistAgencyQuoteRequest(baseInput);

    expect(result.ok).toBe(true);
    expect(result.leadId).toBe("lead_1");
    expect(mockSubmitAgencyLead).toHaveBeenCalledTimes(1);
    expect(mockScheduleAgency).toHaveBeenCalledWith("agency_1", "lead_1");
    expect(mockSchedulePatient).toHaveBeenCalledWith("agency_1", "lead_1");
  });
});

describe("Consent auto-accept removal wiring", () => {
  it("persistAgencyQuoteRequest no longer writes accepted consent as fallback", () => {
    const source = readFileSync(
      join(process.cwd(), "lib/services/agencyQuoteRequestService.ts"),
      "utf8"
    );
    expect(source).toContain("verifyAcceptedAgencyConsent");
    expect(source).toContain("CONSENT_REQUIRED");
    expect(source).not.toMatch(/if \(!hasConsent\)[\s\S]{0,200}saveConsentRecord/);
    expect(source).not.toMatch(/message === "CONSENT_REQUIRED"[\s\S]{0,300}saveConsentRecord/);
  });

  it("quote-request route does not silently bootstrap acceptance", () => {
    const source = readFileSync(
      join(process.cwd(), "app/api/public/agency/[slug]/quote-request/route.ts"),
      "utf8"
    );
    expect(source).toContain("ensureAcceptedConsentForPersistence");
    expect(source).toContain("consentAction");
    expect(source).toContain("CONSENT_REQUIRED");
    expect(source).not.toContain("Always bootstraps consent");
    expect(source).not.toMatch(/if \(body\.consentAccepted === true\)/);
  });

  it("matching-chat clinic/card quote paths do not auto-save accepted consent", () => {
    const source = readFileSync(
      join(process.cwd(), "app/api/public/agency/[slug]/matching-chat/route.ts"),
      "utf8"
    );
    expect(source).not.toContain("consent ensure failed (request_quote)");
    expect(source).not.toContain("consent ensure failed (clinic_selection_complete)");
    expect(source).toContain('action.type === "privacy_consent_response"');
    expect(source).toContain("Never manufacture consent");
    expect(source).toContain('type: "consent_request"');
  });

  it("feelinhealthy demo does not fallback-persist after CONSENT_* errors", () => {
    const source = readFileSync(join(process.cwd(), "app/demo/feelinhealthy/page.tsx"), "utf8");
    expect(source).toContain('!String(data.quotePersistError).startsWith("CONSENT_")');
  });

  it("shared lead submission uses verifyAcceptedAgencyConsent (product-global gate)", () => {
    const source = readFileSync(
      join(process.cwd(), "lib/services/leadSubmissionService.ts"),
      "utf8"
    );
    expect(source).toContain("verifyAcceptedAgencyConsent");
    expect(source).toContain("consentVerificationErrorCode");
  });
});
