import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ensureTreatmentFromPending,
  inferTreatmentFromText,
  resolveNextConversationAction,
  shouldAllowLlmAssistForIntakeGate,
} from "../lib/agency/feelinhealthyConversationMachine";
import { composeExplainBeforeAskIntakePrompt } from "../lib/agency/intakeExplainBeforeAsk";
import { getKnownTreatmentAcknowledgement } from "../lib/agency/feelinhealthyConfig";

const REPO_ROOT = resolve(__dirname, "..");
const routeSource = readFileSync(
  resolve(REPO_ROOT, "app/api/public/agency/[slug]/matching-chat/route.ts"),
  "utf8"
);

describe("FeelinHealthy: remember first command after KVKK consent", () => {
  it("infers aesthetic intent from natural clinic-search phrasing", () => {
    expect(inferTreatmentFromText("estetik kliniği arıyorum")).toBe("aesthetic_surgery");
    expect(inferTreatmentFromText("saç ekimi yaptırmak istiyorum")).toBe("hair_transplant");
  });

  it("persists inferred treatment onto session via ensureTreatmentFromPending", () => {
    const next = ensureTreatmentFromPending({}, "estetik kliniği arıyorum");
    expect(next.lastTreatmentCategory).toBe("aesthetic_surgery");
  });

  it("does not allow LLM intake assist for replayed post-consent treatment commands", () => {
    expect(
      shouldAllowLlmAssistForIntakeGate(
        { kind: "intake", group: 1, missingFields: ["patientName"], prompt: "x" },
        "estetik kliniği arıyorum",
        { isReplayedTreatmentRequest: true }
      )
    ).toBe(false);

    expect(
      shouldAllowLlmAssistForIntakeGate(
        { kind: "intake", group: 1, missingFields: ["patientName"], prompt: "x" },
        "estetik kliniği arıyorum"
      )
    ).toBe(false);
  });

  it("still allows LLM assist for real Group 1 answers", () => {
    expect(
      shouldAllowLlmAssistForIntakeGate(
        { kind: "intake", group: 1, missingFields: ["patientName"], prompt: "x" },
        "Emma Johnson, Kadın, 35"
      )
    ).toBe(true);
  });

  it("after consent with known treatment, next action is Group 1 intake — not ask_treatment", () => {
    const next = resolveNextConversationAction(
      {
        quoteConsent: true,
        lastTreatmentCategory: "aesthetic_surgery",
        pendingHealthRequest: "estetik kliniği arıyorum",
      },
      { locale: "tr" }
    );
    expect(next.kind).toBe("intake");
    if (next.kind === "intake") {
      expect(next.group).toBe(1);
      expect(next.prompt).not.toMatch(/Hangi tedavi için destek istiyorsunuz/i);
      expect(next.prompt).toMatch(/not ettim|Estetik|estetik/i);
    }
  });

  it("acknowledges known treatment without re-asking it", () => {
    const ack = getKnownTreatmentAcknowledgement("aesthetic_surgery", "tr");
    expect(ack).toBeTruthy();
    expect(ack!).not.toMatch(/Hangi tedavi/i);

    const composed = composeExplainBeforeAskIntakePrompt({
      context: { lastTreatmentCategory: "aesthetic_surgery" },
      locale: "tr",
      variant: "standard",
    });
    expect(composed.prompt).toMatch(/not ettim/i);
    expect(composed.prompt).not.toMatch(/Hangi tedavi için destek istiyorsunuz/i);
    expect(composed.prompt).toMatch(/Adınızı|soyadınızı/i);
  });

  it("route recovers pending health command after consent and forces hard-gate", () => {
    expect(routeSource).toContain("pendingHealthRequest || \"\"");
    expect(routeSource).toContain("recover the original health command from history");
    expect(routeSource).toContain("{ isReplayedTreatmentRequest }");
    expect(routeSource).toContain("ensureTreatmentFromPending(sessionContext, pendingMsg)");
  });
});
