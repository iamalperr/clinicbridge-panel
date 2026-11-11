import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isSetupWizardFixtureAllowed } from "../lib/setup/fixtureAccess";

describe("setup wizard fixture access", () => {
  it("is blocked in production unless ALLOW_SETUP_WIZARD_FIXTURE=1", () => {
    expect(isSetupWizardFixtureAllowed({ NODE_ENV: "production" })).toBe(false);
    expect(isSetupWizardFixtureAllowed({ NODE_ENV: "production", ALLOW_SETUP_WIZARD_FIXTURE: "0" })).toBe(false);
    expect(isSetupWizardFixtureAllowed({ NODE_ENV: "production", ALLOW_SETUP_WIZARD_FIXTURE: "1" })).toBe(true);
    expect(isSetupWizardFixtureAllowed({ NODE_ENV: "development" })).toBe(true);
    expect(isSetupWizardFixtureAllowed({ NODE_ENV: "test" })).toBe(false);
  });

  it("returns notFound from the route when access is denied", () => {
    const page = readFileSync("app/setup-wizard-fixture/page.tsx", "utf8");
    expect(page).toContain("isSetupWizardFixtureAllowed");
    expect(page).toContain("notFound()");
  });
});
