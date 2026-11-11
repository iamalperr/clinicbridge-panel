"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import SetupWizard from "@/components/setup/SetupWizard";

function FixtureInner() {
  const params = useSearchParams();
  const empty = params.get("empty") === "1";
  const stepRaw = Number(params.get("step") || "0");
  const step = (stepRaw === 1 || stepRaw === 2 ? stepRaw : 0) as 0 | 1 | 2;
  const openEditor = params.get("editor");

  useEffect(() => {
    if (!openEditor) return;
    const map: Record<string, string> = {
      treatment: "[data-testid='setup-add-treatment']",
      faq: "[data-testid='setup-add-faq']",
      knowledge: "[data-testid='setup-add-knowledge']",
      edit: "[data-testid='setup-edit-treatment']",
    };
    const selector = map[openEditor];
    if (!selector) return;
    const timer = window.setTimeout(() => {
      document.querySelector<HTMLButtonElement>(selector)?.click();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [openEditor]);

  return <SetupWizard forceFixture fixtureEmpty={empty} fixtureStep={step} />;
}

export default function FixtureClient() {
  return (
    <Suspense fallback={<main style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>Fixture…</main>}>
      <FixtureInner />
    </Suspense>
  );
}
