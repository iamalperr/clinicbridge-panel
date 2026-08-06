import { describe, it, expect } from "vitest";
import {
  classifyAgencyConversationTurn,
  canInterruptHardGateForInformation,
  mapStageToConversationMode,
  buildAgencyWorkflowPausePlan,
  applyAgencyWorkflowPause,
  applyAgencyWorkflowResume,
  composeInterruptedAgencyReply,
  buildAgencyIntakeResumeCue,
  getQuoteFlowPreamble,
  markQuoteFlowExplained,
  isAgencyContinueResumePhrase,
} from "../lib/agency/conversationOrchestration";
import { normalizeAgencySessionState } from "../lib/agency/agencySessionState";
import fs from "node:fs";
import path from "node:path";

describe("AgencyConversationOrchestration", () => {
  it("classifies informational interruption during G1 intake without treating short answers as digressions", () => {
    const interrupt = classifyAgencyConversationTurn({
      message: "Hospitadent'te saç ekimi süreci nasıl işliyor?",
      sessionContext: { quoteConsent: true, patientName: undefined },
      stage: "intake_group_1",
      nextAction: {
        kind: "intake",
        group: 1,
        missingFields: ["patientName", "patientAge"],
        prompt: "Adınızı öğrenebilir miyim?",
      },
    });
    expect(interrupt.kind).toBe("informational_interruption");
    expect(interrupt.shouldPauseWorkflow).toBe(true);

    const intakeAnswer = classifyAgencyConversationTurn({
      message: "Ayşe Yılmaz",
      sessionContext: { quoteConsent: true },
      stage: "intake_group_1",
      nextAction: {
        kind: "intake",
        group: 1,
        missingFields: ["patientName"],
        prompt: "Adınız?",
      },
    });
    expect(intakeAnswer.kind).toBe("intake_answer");
    expect(intakeAnswer.shouldPauseWorkflow).toBe(false);
  });

  it("pauses workflow on interrupt and resumes the same intake group on continue", () => {
    const base = normalizeAgencySessionState({
      quoteConsent: true,
      intakeStage: 1,
    });
    const paused = applyAgencyWorkflowPause(
      base,
      buildAgencyWorkflowPausePlan({
        currentMode: mapStageToConversationMode("intake_group_1"),
        message: "Fiyatlar nasıl?",
        resumeIntakeGroup: 1,
        resumePromptKey: "intake",
      })
    );
    expect(paused.workflowPaused).toBe(true);
    expect(paused.resumeIntakeGroup).toBe(1);
    expect(paused.conversationMode).toBe("information");
    expect(paused.intakeStage).toBe(1);

    expect(isAgencyContinueResumePhrase("devam edelim")).toBe(true);
    const continueTurn = classifyAgencyConversationTurn({
      message: "devam edelim",
      sessionContext: paused,
      stage: "intake_group_1",
      nextAction: {
        kind: "intake",
        group: 1,
        missingFields: ["patientAge"],
        prompt: "Yaşınız?",
      },
    });
    expect(continueTurn.kind).toBe("continue_resume");
    expect(continueTurn.shouldResumeWorkflow).toBe(true);

    const resumed = applyAgencyWorkflowResume(paused);
    expect(resumed.workflowPaused).toBe(false);
    expect(resumed.resumeIntakeGroup).toBeUndefined();
    expect(resumed.conversationMode).toBe("intake");
    expect(resumed.intakeStage).toBe(1);
  });

  it("shows quote preamble only once", () => {
    const first = classifyAgencyConversationTurn({
      message: "Teklif almak istiyorum",
      sessionContext: {},
      stage: "consent",
    });
    expect(first.kind).toBe("quote_request");
    expect(first.needsQuotePreamble).toBe(true);

    const explained = markQuoteFlowExplained({});
    expect(explained.quoteFlowExplained).toBe(true);
    const second = classifyAgencyConversationTurn({
      message: "Teklif almak istiyorum",
      sessionContext: explained,
      stage: "intake_group_1",
    });
    expect(second.needsQuotePreamble).toBe(false);
    expect(getQuoteFlowPreamble("tr").length).toBeGreaterThan(20);
  });

  it("composes answer + resume cue without discarding the answer", () => {
    const reply = composeInterruptedAgencyReply({
      answer: "Ağımızdaki klinikler saç ekimi sunabiliyor.",
      resumeCue: buildAgencyIntakeResumeCue({
        locale: "tr",
        sessionContext: {
          intakeProcessExplained: true,
          intakeGroup1Explained: true,
          lastIntakeAskKey: "1:patientAge",
        },
      }),
    });
    expect(reply).toContain("saç ekimi");
    expect(reply).toContain("kaldığımız kısa adıma");
    expect(reply).not.toContain("Talebinizi size özel oluşturabilmek");
  });

  it("only allows interruption on intake/treatment/location gates — not consent/city/side", () => {
    expect(
      canInterruptHardGateForInformation({
        kind: "intake",
        group: 1,
        missingFields: [],
        prompt: "x",
      })
    ).toBe(true);
    expect(canInterruptHardGateForInformation({ kind: "ask_treatment", prompt: "x" })).toBe(
      true
    );
    expect(
      canInterruptHardGateForInformation({
        kind: "location_negotiation",
        prompt: "x",
      } as any)
    ).toBe(true);
    expect(canInterruptHardGateForInformation({ kind: "consent" })).toBe(false);
    expect(
      canInterruptHardGateForInformation({
        kind: "ask_city",
        card: {} as any,
        availableCities: [],
      })
    ).toBe(false);
    expect(
      canInterruptHardGateForInformation({
        kind: "ask_side",
        card: {} as any,
      })
    ).toBe(false);
  });

  it("does not import AgencySessionState into single-clinic chat route", () => {
    const chatRoute = fs.readFileSync(
      path.join(process.cwd(), "app/api/public/chat/route.ts"),
      "utf8"
    );
    expect(chatRoute).not.toMatch(/agencySessionState/);
    expect(chatRoute).not.toMatch(/AgencySessionState/);
    expect(chatRoute).not.toMatch(/conversationOrchestration/);
    expect(chatRoute).not.toMatch(/agencyGroundedRetrieval/);
  });
});
