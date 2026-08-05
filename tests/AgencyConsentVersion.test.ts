import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("Agency consent version alignment", () => {
  const consentServiceSource = readFileSync(
    join(process.cwd(), "lib/services/agencyConsentService.ts"),
    "utf8"
  );
  const leadSubmissionSource = readFileSync(
    join(process.cwd(), "lib/services/leadSubmissionService.ts"),
    "utf8"
  );
  const routeSource = readFileSync(
    join(process.cwd(), "app/api/public/agency/[slug]/matching-chat/route.ts"),
    "utf8"
  );

  it("defines shared default consent version v1.0", () => {
    expect(consentServiceSource).toContain('export const DEFAULT_AGENCY_CONSENT_VERSION = "v1.0"');
    expect(consentServiceSource).toContain("resolveAgencyConsentVersion");
  });

  it("lead submission uses shared resolver (not empty-string fallback)", () => {
    expect(leadSubmissionSource).toContain("resolveAgencyConsentVersion");
    expect(leadSubmissionSource).not.toContain('privacySettings?.version || ""');
  });

  it("matching-chat privacy gate uses the same default version", () => {
    expect(routeSource).toContain('version: agencyData.privacySettings?.version || "v1.0"');
  });
});
