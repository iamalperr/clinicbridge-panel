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

import { persistAgencyQuoteRequest } from "../lib/services/agencyQuoteRequestService";

describe("Forged session quoteConsent cannot authorize persist", () => {
  const baseInput = {
    agencyId: "agency_1",
    conversationId: "sess_forged",
    clinicIds: ["clinic_a"],
    patientEmail: "patient@example.com",
    patientName: "Forged Session",
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
        data: () => ({ privacySettings: { version: "v1.0" }, statusHistory: [] }),
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
    mockGetAdminDb.mockReturnValue({ collection: () => makeCollection() });
  });

  it("blocks lead/quote when DB consent missing even if caller claims session consent", async () => {
    mockVerifyAcceptedAgencyConsent.mockResolvedValue({ ok: false, status: "missing" });
    const forgedSessionClaim = { quoteConsent: true, consentStatus: "accepted" };

    const result = await persistAgencyQuoteRequest({
      ...baseInput,
      conversationSummary: JSON.stringify(forgedSessionClaim),
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("CONSENT_REQUIRED");
    expect(mockSubmitAgencyLead).not.toHaveBeenCalled();
    expect(mockScheduleAgency).not.toHaveBeenCalled();
    expect(mockSchedulePatient).not.toHaveBeenCalled();
  });

  it("blocks on version mismatch (old consent version)", async () => {
    mockVerifyAcceptedAgencyConsent.mockResolvedValue({
      ok: false,
      status: "version_mismatch",
      consentRecordId: "old",
      consentVersion: "v0.5",
    });
    const result = await persistAgencyQuoteRequest(baseInput);
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("CONSENT_VERSION_MISMATCH");
    expect(mockSubmitAgencyLead).not.toHaveBeenCalled();
  });

  it("blocks rejected consent", async () => {
    mockVerifyAcceptedAgencyConsent.mockResolvedValue({
      ok: false,
      status: "rejected",
      consentRecordId: "rej",
    });
    const result = await persistAgencyQuoteRequest(baseInput);
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("CONSENT_REJECTED");
    expect(mockSubmitAgencyLead).not.toHaveBeenCalled();
  });

  it("fails closed on verification_failed", async () => {
    mockVerifyAcceptedAgencyConsent.mockResolvedValue({
      ok: false,
      status: "verification_failed",
    });
    const result = await persistAgencyQuoteRequest(baseInput);
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("CONSENT_VERIFICATION_FAILED");
    expect(mockSubmitAgencyLead).not.toHaveBeenCalled();
  });

  it("succeeds when DB consent is accepted", async () => {
    mockVerifyAcceptedAgencyConsent.mockResolvedValue({
      ok: true,
      status: "accepted",
      consentRecordId: "c_ok",
      consentVersion: "v1.0",
    });
    mockSubmitAgencyLead.mockResolvedValue({
      leadId: "lead_ok",
      agencyId: "agency_1",
      status: "created",
    });
    mockScheduleAgency.mockResolvedValue(undefined);
    mockSchedulePatient.mockResolvedValue(undefined);

    const result = await persistAgencyQuoteRequest(baseInput);
    expect(result.ok).toBe(true);
    expect(result.leadId).toBe("lead_ok");
    expect(mockSubmitAgencyLead).toHaveBeenCalledTimes(1);
    expect(mockScheduleAgency).toHaveBeenCalled();
  });
});

describe("Route wiring: no raw client boolean bootstrap", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

  it("slug lead route does not manufacture consent from consentAccepted boolean", () => {
    const source = read("app/api/public/agency/[slug]/lead/route.ts");
    expect(source).toContain("ensureAcceptedConsentForPersistence");
    expect(source).toContain("consentAction");
    expect(source).not.toMatch(/consentAccepted\s*===\s*true[\s\S]{0,200}saveConsentRecord/);
  });

  it("agency-lead route requires consent verification before write", () => {
    const source = read("app/api/public/agency-lead/route.ts");
    expect(source).toContain("ensureAcceptedConsentForPersistence");
    expect(source).toContain("submitAgencyLead");
    expect(source).not.toContain('consentStatus: consentStatus || "pending"');
    expect(source).not.toMatch(/\.collection\("leads"\)\s*\.add\(/);
  });

  it("quote-request rejects raw consentAccepted as sole authority", () => {
    const source = read("app/api/public/agency/[slug]/quote-request/route.ts");
    expect(source).toContain("ensureAcceptedConsentForPersistence");
    expect(source).toContain("consentAction");
    expect(source).not.toMatch(/if \(body\.consentAccepted === true\)/);
  });

  it("quote route requires conversationId + ensureAcceptedConsentForPersistence", () => {
    const source = read("app/api/public/agency/[slug]/quote/route.ts");
    expect(source).toContain("ensureAcceptedConsentForPersistence");
    expect(source).not.toMatch(/consentAccepted === true && body\.consentStatus/);
  });

  it("non-FH shouldCreateLead uses verifyAcceptedAgencyConsent and submitAgencyLead", () => {
    const source = read("app/api/public/agency/[slug]/matching-chat/route.ts");
    expect(source).toContain("Non-FH (product-global): hard consent gate");
    expect(source).toContain("verifyAcceptedAgencyConsent");
    expect(source).not.toMatch(/shouldCreateNewLead:\s*true/);
    expect(source).toContain("shouldCreateNewLead: false");
  });

  it("privacy gates do not trust session quoteConsent alone", () => {
    const source = read("app/api/public/agency/[slug]/matching-chat/route.ts");
    expect(source).not.toContain(
      "ctx.quoteConsent === true || (await requireAcceptedAgencyConsent"
    );
    expect(source).toContain("sessionDeclined");
  });
});
