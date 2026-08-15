/**
 * Golden P0 regression fixtures for the FeelinHealthy go-live findings.
 *
 * A — informational question while city/side/matching is pending
 * B — informational question after a quote was created
 * C — Antalya chosen once, kept after an empty match
 * D — Istanbul chosen once, side asked, never re-asked as a city
 *
 * Plus the state invariants those conversations must never violate.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyAgencyWorkflowPause,
  buildAgencyWorkflowPausePlan,
  canInterruptHardGateForInformation,
  classifyAgencyConversationTurn,
  isAgencyExplicitMatchingChangeRequest,
  isAgencyQuoteCompletedSession,
  mapStageToConversationMode,
  shouldDeferMatchingForInformation,
  shouldRouteAsPostQuoteAssistance,
} from "../lib/agency/conversationOrchestration";
import {
  applyStructuredLocationAction,
  deriveFeelinHealthyState,
  resolveNextConversationAction,
} from "../lib/agency/feelinhealthyConversationMachine";
import {
  buildEmptyMatchCityEscalation,
  decideFeelinHealthyLocationNextStep,
  FEELINHEALTHY_CONFIG,
} from "../lib/agency/feelinhealthyConfig";
import { isQuoteRequestLocked } from "../lib/agency/feelinhealthyQuotePrefill";

const REPO_ROOT = resolve(__dirname, "..");
const route = readFileSync(
  resolve(REPO_ROOT, "app/api/public/agency/[slug]/matching-chat/route.ts"),
  "utf8"
);

const completedIntake = {
  quoteConsent: true,
  consentStatus: "accepted",
  patientName: "Ayşe Yılmaz",
  firstName: "Ayşe",
  lastName: "Yılmaz",
  patientGender: "Kadın",
  patientAge: 34,
  patientEmail: "ayse@example.com",
  patientPhone: "+905551234567",
  patientCountry: "Almanya",
  travelDate: "2026-09-15",
};

const aestheticPool = [
  {
    id: "orion-surgery-center",
    clinicSlug: "orion-surgery-center",
    clinicName: "Orion Surgery Center",
    status: "active",
    treatmentCategories: ["aesthetic_surgery"],
    location: { city: "İstanbul", address: "Ataşehir" },
  },
  {
    id: "lokman-hekim-istanbul-hospital",
    clinicSlug: "lokman-hekim-istanbul-hospital",
    clinicName: "Lokman Hekim İstanbul Hospital",
    status: "active",
    treatmentCategories: ["aesthetic_surgery"],
    location: { city: "İstanbul", address: "Kurtköy" },
  },
];

/** rhinoplasty + Istanbul, side still unknown — the reported conversation state. */
function rhinoplastyIstanbulPendingSide() {
  return {
    ...completedIntake,
    lastTreatmentCategory: "rhinoplasti",
    selectedCity: "istanbul",
    locationSelectionConfirmed: true,
    lastLocation: "İstanbul",
    pendingSideClarification: true,
    leadStage: "discovery",
  };
}

function classifyInfoTurn(message: string, ctx: Record<string, any>) {
  const nextAction = resolveNextConversationAction(ctx, {
    availableClinics: aestheticPool,
    locale: "tr",
    promptContext: ctx,
  });
  const turn = classifyAgencyConversationTurn({
    message,
    sessionContext: ctx,
    stage: deriveFeelinHealthyState(ctx).stage,
    nextAction,
  });
  return { nextAction, turn };
}

describe("Golden A — informational question while city/side/matching is pending", () => {
  const questions = [
    "Tedavi süreci nasıl ilerliyor. Kaç günlük bir tedavi olacak",
    "Kaç günlük bir tedavi olacak?",
    "Operasyon kaç gün sürer?",
    "İyileşme süreci ne kadar?",
    "Rinoplasti sonrası kaç gün İstanbul'da kalmam gerekir?",
    "How long does the treatment take?",
    "How many days should I stay in Turkey?",
  ];

  it.each(questions)("routes %s to the informational path, not to matching", (message) => {
    const ctx = rhinoplastyIstanbulPendingSide();
    const { nextAction, turn } = classifyInfoTurn(message, ctx);

    expect(nextAction.kind).toBe("ask_side");
    expect(turn.kind).toBe("informational_interruption");
    expect(canInterruptHardGateForInformation(nextAction)).toBe(true);
    expect(
      shouldDeferMatchingForInformation({ turnKind: turn.kind, message })
    ).toBe(true);
  });

  it("preserves the pending side gate and the confirmed city while answering", () => {
    const ctx = rhinoplastyIstanbulPendingSide();
    const { nextAction, turn } = classifyInfoTurn("Kaç günlük bir tedavi olacak?", ctx);

    const paused = applyAgencyWorkflowPause(
      ctx,
      buildAgencyWorkflowPausePlan({
        currentMode: mapStageToConversationMode("istanbul_side_selection"),
        message: "Kaç günlük bir tedavi olacak?",
        resumePromptKey: nextAction.kind,
        pauseReason: turn.informationType,
      })
    );

    expect(paused.selectedCity).toBe("istanbul");
    expect(paused.locationSelectionConfirmed).toBe(true);
    expect(paused.pendingSideClarification).toBe(true);
    expect(paused.lastTreatmentCategory).toBe("rhinoplasti");
    expect(paused.workflowPaused).toBe(true);

    // The gate is resumable: the very next resolution still asks the side.
    const resumedAction = resolveNextConversationAction(paused, {
      availableClinics: aestheticPool,
      locale: "tr",
      promptContext: paused,
    });
    expect(resumedAction.kind).toBe("ask_side");
  });

  it("keeps structured city/side card turns transactional", () => {
    // Card replay copy is phrased as a question; it must never become a digression.
    const cardMessage =
      "İstanbul Avrupa Yakası'nı tercih ediyorum. Uygun klinikleri listeleyebilir misiniz?";
    expect(
      shouldDeferMatchingForInformation({
        turnKind: "informational_interruption",
        message: cardMessage,
        isStructuredAction: true,
      })
    ).toBe(false);
  });

  it("keeps explicit clinic-search asks on the matching path", () => {
    for (const message of [
      "Hangi klinikleri önerirsiniz?",
      "Başka klinik görmek istiyorum",
      "Which clinic do you recommend?",
    ]) {
      expect(
        shouldDeferMatchingForInformation({
          turnKind: "informational_interruption",
          message,
        })
      ).toBe(false);
    }
  });
});

describe("Golden B — informational question after a successful quote", () => {
  const postQuoteCtx = {
    ...completedIntake,
    lastTreatmentCategory: "meme büyütme",
    selectedCity: "istanbul",
    istanbul_side: "anatolian",
    locationSelectionConfirmed: true,
    sideSelectionConfirmed: true,
    selectedClinicIds: ["orion-surgery-center", "lokman-hekim-istanbul-hospital"],
    lastRecommendedClinicIds: ["orion-surgery-center", "lokman-hekim-istanbul-hospital"],
    leadStage: "quote_request_created",
    quoteRequestLocked: true,
    leadId: "lead_123",
  };

  it("answers follow-up questions instead of rematching", () => {
    for (const message of [
      "Kaç günlük bir operasyon olacak?",
      "İyileşme süreci nasıl?",
      "Fiyat ne zaman belli olur?",
      "How long is the recovery?",
    ]) {
      expect(
        shouldRouteAsPostQuoteAssistance({ sessionContext: postQuoteCtx, message })
      ).toBe(true);
    }
    expect(isAgencyQuoteCompletedSession(postQuoteCtx)).toBe(true);
    expect(isQuoteRequestLocked(postQuoteCtx)).toBe(true);
  });

  it("does not restart intake, matching or city selection", () => {
    const next = resolveNextConversationAction(postQuoteCtx, {
      availableClinics: aestheticPool,
      locale: "tr",
      promptContext: postQuoteCtx,
    });
    expect(next.kind).toBe("quote");
    expect(deriveFeelinHealthyState(postQuoteCtx).stage).toBe("quote");
    expect(postQuoteCtx.selectedCity).toBe("istanbul");
    expect(postQuoteCtx.selectedClinicIds).toHaveLength(2);
  });

  it("still allows an explicit change or new search through the normal flow", () => {
    for (const message of [
      "Başka klinik görmek istiyorum.",
      "Seçimimi değiştirebilir miyim?",
      "Antalya yerine İstanbul istiyorum.",
    ]) {
      expect(isAgencyExplicitMatchingChangeRequest(message)).toBe(true);
      expect(
        shouldRouteAsPostQuoteAssistance({ sessionContext: postQuoteCtx, message })
      ).toBe(false);
    }
  });

  it("blocks a second lead/quote for a conversation that already has one", () => {
    expect(route).toContain(
      'const leadAlreadyCreated = ctx.leadStage === "quote_request_created" || ctx.leadStage === "completed";'
    );
    expect(route).toContain("if (parsed.shouldCreateLead && !leadAlreadyCreated) {");
  });
});

describe("Golden C — Antalya is chosen once and kept", () => {
  const antalyaSeeker = {
    ...completedIntake,
    lastTreatmentCategory: "meme büyütme",
    pendingCitySelection: true,
    leadStage: "discovery",
  };

  it("stores Antalya once and skips a duplicate identical selection", () => {
    const first = applyStructuredLocationAction(antalyaSeeker, {
      type: "select_treatment_city",
      city: "antalya",
      actionId: "act-1",
    });
    expect(first.idempotentSkip).toBe(false);
    expect(first.ctx.selectedCity).toBe("antalya");
    expect(first.ctx.locationSelectionConfirmed).toBe(true);
    expect(first.ctx.pendingCitySelection).toBe(false);

    const repeat = applyStructuredLocationAction(first.ctx, {
      type: "select_treatment_city",
      city: "antalya",
      actionId: "act-2",
    });
    expect(repeat.idempotentSkip).toBe(true);
    expect(repeat.ctx.selectedCity).toBe("antalya");
  });

  it("treats a typed city preference as a state change, not a digression", () => {
    const { turn } = classifyInfoTurn("Antalya tercih ediyorum", antalyaSeeker);
    expect(turn.kind).not.toBe("informational_interruption");
    expect(
      shouldDeferMatchingForInformation({ turnKind: turn.kind, message: "Antalya tercih ediyorum" })
    ).toBe(false);
  });

  it("keeps Antalya when matching returns nothing", () => {
    const escalation = buildEmptyMatchCityEscalation({
      locale: "tr",
      branchKey: "aesthetic_surgery",
      sessionContext: {
        ...antalyaSeeker,
        selectedCity: "antalya",
        locationSelectionConfirmed: true,
        pendingCitySelection: false,
      },
    });
    expect(escalation).not.toBeNull();
    expect(escalation!.sessionContext.selectedCity).toBe("antalya");
    expect(escalation!.sessionContext.locationSelectionConfirmed).toBe(true);
    expect(escalation!.citySelectionCard.options.length).toBeGreaterThan(0);
  });
});

describe("Golden D — Istanbul is chosen once and the side question follows", () => {
  const istanbulSeeker = {
    ...completedIntake,
    lastTreatmentCategory: "rhinoplasti",
    pendingCitySelection: true,
    leadStage: "discovery",
  };

  it("moves from city to side without re-asking the city", () => {
    const applied = applyStructuredLocationAction(istanbulSeeker, {
      type: "select_treatment_city",
      city: "istanbul",
      actionId: "act-city",
    });
    expect(applied.ctx.selectedCity).toBe("istanbul");

    const next = resolveNextConversationAction(applied.ctx, {
      availableClinics: aestheticPool,
      locale: "tr",
      promptContext: applied.ctx,
    });
    expect(next.kind).toBe("ask_side");

    const withSide = applyStructuredLocationAction(applied.ctx, {
      type: "side_selection",
      side: "anatolian",
      actionId: "act-side",
    });
    expect(withSide.ctx.selectedCity).toBe("istanbul");
    expect(withSide.ctx.istanbul_side).toBe("anatolian");
    expect(withSide.ctx.sideSelectionConfirmed).toBe(true);
  });

  it("treats Istanbul without a side as an unfinished side step, not a dead end", () => {
    const decision = decideFeelinHealthyLocationNextStep(
      {
        lastTreatmentCategory: "rhinoplasti",
        selectedCity: "istanbul",
        locationSelectionConfirmed: true,
      },
      aestheticPool,
      "tr"
    );
    expect(decision.step).toBe("ask_side");
    expect(decision.city).toBe("istanbul");
    expect(route).toContain('if (emptyLocation.step === "ask_side") {');
  });

  it("keeps Istanbul and the chosen side when matching returns nothing", () => {
    const escalation = buildEmptyMatchCityEscalation({
      locale: "tr",
      branchKey: "aesthetic_surgery",
      sessionContext: {
        ...istanbulSeeker,
        selectedCity: "istanbul",
        istanbul_side: "european",
        locationSelectionConfirmed: true,
        sideSelectionConfirmed: true,
      },
    });
    expect(escalation).not.toBeNull();
    expect(escalation!.sessionContext.selectedCity).toBe("istanbul");
    expect(escalation!.sessionContext.istanbul_side).toBe("european");
    expect(escalation!.sessionContext.sideSelectionConfirmed).toBe(true);
  });
});

describe("P0 state invariants", () => {
  it("Invariant 1 — a matching failure never clears a confirmed preference", () => {
    for (const city of ["antalya", "izmir", "istanbul"]) {
      const escalation = buildEmptyMatchCityEscalation({
        locale: "tr",
        branchKey: "dental",
        sessionContext: { selectedCity: city, locationSelectionConfirmed: true },
      });
      expect(escalation?.sessionContext.selectedCity).toBe(city);
    }
  });

  it("Invariant 2 — an informational digression does not mutate transactional state", () => {
    const before = {
      ...completedIntake,
      lastTreatmentCategory: "rhinoplasti",
      selectedCity: "istanbul",
      istanbul_side: "european",
      selectedClinicIds: ["orion-surgery-center"],
      leadStage: "recommendation",
      leadId: "lead_9",
    };
    const after = applyAgencyWorkflowPause(
      before,
      buildAgencyWorkflowPausePlan({
        currentMode: "matching",
        message: "İyileşme süreci ne kadar?",
      })
    );
    expect(after.leadStage).toBe("recommendation");
    expect(after.leadId).toBe("lead_9");
    expect(after.selectedClinicIds).toEqual(["orion-surgery-center"]);
    expect(after.selectedCity).toBe("istanbul");
    expect(after.istanbul_side).toBe("european");
    expect(after.quoteConsent).toBe(true);
  });

  it("Invariant 3 — post-quote Q&A cannot create a second quote", () => {
    const ctx = { leadStage: "quote_request_created", quoteRequestLocked: true };
    expect(isAgencyQuoteCompletedSession(ctx)).toBe(true);
    expect(isQuoteRequestLocked(ctx)).toBe(true);
    expect(
      shouldRouteAsPostQuoteAssistance({
        sessionContext: ctx,
        message: "Kaç günlük bir operasyon olacak?",
      })
    ).toBe(true);
  });

  it("Invariant 4 — guest clinic limits stay at 2", () => {
    expect(FEELINHEALTHY_CONFIG.maxGuestClinics).toBe(2);
    expect(FEELINHEALTHY_CONFIG.guestQuoteClinicSelectionLimit).toBe(2);
  });

  it("Invariant 5 — consent is never bypassed by an informational interruption", () => {
    expect(canInterruptHardGateForInformation({ kind: "consent" })).toBe(false);
    const withoutConsent = {
      lastTreatmentCategory: "rhinoplasti",
      pendingHealthRequest: "burun estetiği istiyorum",
    };
    const next = resolveNextConversationAction(withoutConsent, {
      availableClinics: aestheticPool,
      locale: "tr",
      promptContext: withoutConsent,
    });
    expect(next.kind).toBe("consent");
  });
});

describe("route wiring for the P0 guards", () => {
  it("marks informational and post-quote turns before matching is forced", () => {
    expect(route).toContain("shouldDeferMatchingForInformation({");
    expect(route).toContain("shouldRouteAsPostQuoteAssistance({");
    expect(route).toContain("(ctx as any).__informationalDigression = true;");
    expect(route).toContain(
      'if (nextAction.kind === "match_clinics" && !(ctx as any).__informationalDigression) {'
    );
  });

  it("skips clinic matching for informational and post-quote turns", () => {
    expect(route).toContain("!(isFeelinHealthy && (ctx as any).__informationalDigression) &&");
  });

  it("only reports a matching outcome when matching actually ran", () => {
    expect(route).toContain(
      "!isFeelinHealthy || (feelinHealthyReady && allowFeelinHealthyMatch)"
    );
  });

  it("resets the location only on an explicit request to look elsewhere", () => {
    expect(route).toContain("allowLocationReset: true");
    expect(route.match(/allowLocationReset: true/g) || []).toHaveLength(1);
  });
});
