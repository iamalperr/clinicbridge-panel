import { notFound } from "next/navigation";
import { isSetupWizardFixtureAllowed } from "@/lib/setup/fixtureAccess";
import FixtureClient from "./FixtureClient";

export default function SetupWizardFixturePage() {
  if (!isSetupWizardFixtureAllowed()) notFound();
  return <FixtureClient />;
}
