/** Dev-only visual fixture for /setup-wizard-fixture. Never enabled in production unless explicitly flagged. */
export function isSetupWizardFixtureAllowed(env: {
  NODE_ENV?: string;
  ALLOW_SETUP_WIZARD_FIXTURE?: string;
} = process.env): boolean {
  if (env.ALLOW_SETUP_WIZARD_FIXTURE === "1") return true;
  return env.NODE_ENV === "development";
}
