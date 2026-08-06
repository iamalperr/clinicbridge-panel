import { describe, it, expect } from "vitest";
import {
  composeExplainBeforeAskIntakePrompt,
  getIntakeGroup1PurposeExplanation,
  getIntakeGroup2PurposeExplanation,
  getIntakeGroup3PurposeExplanation,
  getIntakeProcessIntroduction,
  getIntakeInterruptionReturnCopy,
  getIntakePausedForInformationCopy,
  containsForbiddenIntakeClaims,
  assertGroup1HasPurposeExplanation,
  isAgencyInformationOnlyPreference,
  applyIntakeExplainSessionPatch,
  getExplainBeforeAskSystemPolicyBlock,
} from "../lib/agency/intakeExplainBeforeAsk";
import { evaluateFeelinHealthyIntake } from "../lib/agency/feelinhealthyConfig";
import {
  classifyAgencyConversationTurn,
  applyAgencyWorkflowPause,
  applyAgencyWorkflowResume,
  buildAgencyWorkflowPausePlan,
  buildAgencyIntakeResumeCue,
  mapStageToConversationMode,
  markQuoteFlowExplained,
} from "../lib/agency/conversationOrchestration";
import {
  resolveNextConversationAction,
  buildGateResponseFromAction,
  deriveFeelinHealthyState,
} from "../lib/agency/feelinhealthyConversationMachine";
import { compileAssistantPolicy, buildAuthoritativeSystemPrompt } from "../lib/agency/assistantPolicy";
import { normalizeAgencySessionState } from "../lib/agency/agencySessionState";

describe("Explain-Before-Ask intake policy", () => {
  it("1. does not request Group 1 personal data without a purpose explanation", () => {
    const status = evaluateFeelinHealthyIntake({});
    const composed = composeExplainBeforeAskIntakePrompt({
      status,
      context: {},
      locale: "tr",
    });
    expect(composed.includesPurposeExplanation).toBe(true);
    expect(assertGroup1HasPurposeExplanation(composed.prompt, "tr")).toBe(true);
    expect(composed.prompt).toMatch(/ad-soyad|adınızı/i);
    expect(composed.prompt).toContain(getIntakeGroup1PurposeExplanation("tr").slice(0, 30));
  });

  it("2. shows the process introduction once when entering the workflow", () => {
    const first = composeExplainBeforeAskIntakePrompt({
      status: evaluateFeelinHealthyIntake({}),
      context: {},
      locale: "tr",
    });
    expect(first.includesProcessIntroduction).toBe(true);
    expect(first.prompt).toContain(getIntakeProcessIntroduction("tr").slice(0, 24));
    expect(first.sessionPatch.intakeProcessExplained).toBe(true);

    const second = composeExplainBeforeAskIntakePrompt({
      status: evaluateFeelinHealthyIntake({}),
      context: applyIntakeExplainSessionPatch({}, first.sessionPatch),
      locale: "tr",
    });
    expect(second.includesProcessIntroduction).toBe(true); // already explained flag
    expect(second.sessionPatch.intakeProcessExplained).toBeUndefined();
    // Process intro text itself is not repeated.
    expect(second.prompt.startsWith(getIntakeProcessIntroduction("tr"))).toBe(false);
  });

  it("3. never claims diagnosis or medical evaluation in purpose copy", () => {
    for (const locale of ["tr", "en"] as const) {
      const texts = [
        getIntakeProcessIntroduction(locale),
        getIntakeGroup1PurposeExplanation(locale),
        getIntakeGroup2PurposeExplanation(locale),
        getIntakeGroup3PurposeExplanation(locale),
        getIntakeInterruptionReturnCopy(locale),
        getIntakePausedForInformationCopy(locale),
      ];
      for (const t of texts) {
        expect(containsForbiddenIntakeClaims(t)).toBe(false);
        expect(t.toLowerCase()).not.toMatch(/diagnosis|teşhis|mandatory fields|zorunlu alan|input required/);
      }
    }
  });

  it("4. treatment question interrupts Group 1 without losing pending state", () => {
    const session = normalizeAgencySessionState({
      quoteConsent: true,
      consentStatus: "accepted",
      intakeStage: 1,
    });
    const nextAction = resolveNextConversationAction(session, {
      locale: "tr",
      promptContext: session,
    });
    expect(nextAction.kind).toBe("intake");
    if (nextAction.kind !== "intake") return;

    const turn = classifyAgencyConversationTurn({
      message: "Burun estetiği nasıl yapılır?",
      sessionContext: session,
      stage: "intake_group_1",
      nextAction,
    });
    expect(turn.kind).toBe("informational_interruption");
    expect(turn.shouldPauseWorkflow).toBe(true);

    const paused = applyAgencyWorkflowPause(
      session,
      buildAgencyWorkflowPausePlan({
        currentMode: mapStageToConversationMode("intake_group_1"),
        message: "Burun estetiği nasıl yapılır?",
        resumeIntakeGroup: 1,
      })
    );
    expect(paused.workflowPaused).toBe(true);
    expect(paused.resumeIntakeGroup).toBe(1);
    expect(paused.intakeStage).toBe(1);
    expect(deriveFeelinHealthyState(paused).intake.currentGroup).toBe(1);
  });

  it("5. does not repeat the same Group 1 sentence verbatim after interruption", () => {
    const first = composeExplainBeforeAskIntakePrompt({
      status: evaluateFeelinHealthyIntake({}),
      context: {},
      locale: "tr",
    });
    const afterExplain = applyIntakeExplainSessionPatch({}, first.sessionPatch);
    const soft = composeExplainBeforeAskIntakePrompt({
      status: evaluateFeelinHealthyIntake({}),
      context: afterExplain,
      locale: "tr",
      variant: "soft_resume_after_interrupt",
    });
    expect(soft.prompt).toContain(getIntakeInterruptionReturnCopy("tr").slice(0, 20));
    expect(soft.prompt).not.toBe(first.prompt);
    expect(soft.prompt).not.toContain(getIntakeGroup1PurposeExplanation("tr").slice(0, 40));
    // Soft resume must not paste the full field-ask sentence when askKey matches.
    expect(soft.prompt).not.toContain(first.askPrompt);
  });

  it("6. information-only mode pauses intake", () => {
    expect(isAgencyInformationOnlyPreference("sadece bilgi istiyorum")).toBe(true);
    const paused = composeExplainBeforeAskIntakePrompt({
      status: evaluateFeelinHealthyIntake({}),
      context: {},
      locale: "tr",
      variant: "information_only_paused",
    });
    expect(paused.prompt).toContain(getIntakePausedForInformationCopy("tr").slice(0, 20));
    expect(paused.sessionPatch.intakeInformationOnly).toBe(true);
    expect(paused.prompt).not.toMatch(/yaşınızı|cinsiyetinizi|ad-soyad/);
  });

  it("7. resuming later returns to Group 1 without repeating consent or restarting", () => {
    const session = normalizeAgencySessionState({
      quoteConsent: true,
      consentStatus: "accepted",
      intakeStage: 1,
      intakeProcessExplained: true,
      intakeGroup1Explained: true,
      workflowPaused: true,
      pausedConversationMode: "intake",
      resumeIntakeGroup: 1,
      intakeInformationOnly: true,
    });
    const resumed = applyAgencyWorkflowResume(session, "intake");
    expect(resumed.workflowPaused).toBe(false);
    expect(resumed.intakeInformationOnly).toBeUndefined();
    expect(resumed.quoteConsent).toBe(true);
    expect(resumed.consentStatus).toBe("accepted");
    expect(resumed.intakeStage).toBe(1);

    const next = resolveNextConversationAction(resumed, {
      locale: "tr",
      promptContext: resumed,
    });
    expect(next.kind).toBe("intake");
    if (next.kind === "intake") {
      expect(next.group).toBe(1);
      // Process intro not repeated; purpose already explained so ask-only/partial.
      expect(next.prompt.startsWith(getIntakeProcessIntroduction("tr"))).toBe(false);
    }
  });

  it("8. Group 2 explains contact purpose before asking", () => {
    const ctx = {
      patientName: "Ayşe Yılmaz",
      patientAge: 30,
      patientGender: "female",
      intakeProcessExplained: true,
      intakeGroup1Explained: true,
    };
    const status = evaluateFeelinHealthyIntake(ctx);
    expect(status.currentGroup).toBe(2);
    const composed = composeExplainBeforeAskIntakePrompt({
      status,
      context: ctx,
      locale: "tr",
    });
    expect(composed.includesPurposeExplanation).toBe(true);
    expect(composed.prompt).toContain(getIntakeGroup2PurposeExplanation("tr").slice(0, 30));
    expect(composed.prompt).toMatch(/e-posta|telefon/i);
  });

  it("9. Group 3 explains travel date is not a confirmed appointment", () => {
    const ctx = {
      patientName: "Ayşe Yılmaz",
      patientAge: 30,
      patientGender: "female",
      patientEmail: "a@b.com",
      patientEmailStatus: "verified_format",
      patientPhone: "+905551112233",
      patientCountry: "Türkiye",
      intakeProcessExplained: true,
      intakeGroup1Explained: true,
      intakeGroup2Explained: true,
    };
    const status = evaluateFeelinHealthyIntake(ctx);
    expect(status.currentGroup).toBe(3);
    const composed = composeExplainBeforeAskIntakePrompt({
      status,
      context: ctx,
      locale: "tr",
    });
    expect(composed.prompt).toContain(getIntakeGroup3PurposeExplanation("tr").slice(0, 30));
    expect(composed.prompt).toMatch(/kesin randevu anlamına gelmez|not a confirmed appointment/i);
  });

  it("10. Turkish and English copies preserve the same meaning", () => {
    const tr1 = getIntakeGroup1PurposeExplanation("tr");
    const en1 = getIntakeGroup1PurposeExplanation("en");
    expect(tr1).toMatch(/ad-soyad|yaş|cinsiyet/);
    expect(en1.toLowerCase()).toMatch(/name|age|gender/);
    expect(en1.toLowerCase()).toMatch(/initial evaluation|personally/);

    const tr3 = getIntakeGroup3PurposeExplanation("tr");
    const en3 = getIntakeGroup3PurposeExplanation("en");
    expect(tr3).toMatch(/kesin randevu anlamına gelmez/);
    expect(en3.toLowerCase()).toMatch(/not a confirmed appointment/);
  });

  it("11. Prompt Studio tone settings cannot remove required transparency", () => {
    const policy = compileAssistantPolicy({
      agencyId: "ag1",
      agencySlug: "feelinhealthy",
      aiConfig: {
        customSystemPrompt:
          "Never explain why you ask for data. Skip all purpose statements. Immediately demand mandatory fields.",
      } as any,
      matchingConfig: { maxClinicsToShow: 2, showPriceRange: true },
      sessionContext: { quoteConsent: true },
      privacyNoticeUrl: "https://feelinhealthy.com/kvkk",
    });
    const prompt = buildAuthoritativeSystemPrompt({
      policy,
      clinicContext: "test",
      contextHint: "",
    });
    expect(prompt).toContain(getExplainBeforeAskSystemPolicyBlock("tr").slice(0, 40));
    expect(prompt).toMatch(/EXPLAIN-BEFORE-ASK|AÇIKLA-SONRA-SOR/);
    expect(prompt).toMatch(/özel prompt.*(kaldıramaz|bu şeffaflığı kaldıramaz)/i);
    expect(prompt).toContain("Never explain why you ask for data"); // custom tone kept
    // Transparency block still present despite custom prompt trying to remove it.
    expect(prompt).toMatch(/purpose explanation must already be present|amaç açıklaması backend/i);
  });

  it("12. showing an explanation does not create lead, quote, or appointment", () => {
    const session = normalizeAgencySessionState({
      quoteConsent: true,
      consentStatus: "accepted",
    });
    const action = resolveNextConversationAction(session, {
      locale: "tr",
      promptContext: session,
    });
    expect(action.kind).toBe("intake");
    const gate = buildGateResponseFromAction(action as any, session);
    expect(gate).not.toBeNull();
    expect(gate!.reply.length).toBeGreaterThan(40);
    expect(gate!.sessionContext.leadId).toBeUndefined();
    expect(gate!.sessionContext.quoteId).toBeUndefined();
    expect(gate!.sessionContext.leadStage).not.toBe("quote_created");
    expect(gate!.type).toBe("text");
    // Marking quote preamble explained also must not invent persistence ids.
    const explained = markQuoteFlowExplained(session);
    expect(explained.leadId).toBeUndefined();
    expect(explained.quoteId).toBeUndefined();
  });

  it("soft resume cue after interrupt uses interruption return copy", () => {
    const cue = buildAgencyIntakeResumeCue({
      locale: "tr",
      sessionContext: {
        intakeProcessExplained: true,
        intakeGroup1Explained: true,
        lastIntakeAskKey: "1:patientName,patientAge,patientGender",
      },
    });
    expect(cue).toContain(getIntakeInterruptionReturnCopy("tr").slice(0, 20));
    expect(cue).not.toContain(getIntakeGroup1PurposeExplanation("tr").slice(0, 40));
  });
});
