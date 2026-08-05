import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyStructuredLocationAction,
  buildGateResponseFromAction,
  canShowCityWidget,
  canShowIstanbulSideWidget,
  deriveFeelinHealthyState,
  ensureTreatmentFromPending,
  inferTreatmentFromText,
  isHardGateAction,
  mergeFeelinHealthySession,
  resolveNextConversationAction,
} from "../lib/agency/feelinhealthyConversationMachine";
import { resolveIstanbulSideFromText } from "../lib/agency/feelinhealthyConfig";
import { SlotExtractor } from "../lib/conversation/slotExtractor";

const REPO_ROOT = resolve(__dirname, "..");
const route = readFileSync(
  resolve(REPO_ROOT, "app/api/public/agency/[slug]/matching-chat/route.ts"),
  "utf8"
);

const completeIntake = {
  patientName: "Ada Yılmaz",
  firstName: "Ada",
  lastName: "Yılmaz",
  patientGender: "Kadın",
  patientAge: 34,
  patientEmail: "ada@example.com",
  patientPhone: "+905551112233",
  patientCountry: "Almanya",
  travelDate: "2026-09-15",
};

const dentalClinics = [
  {
    id: "hospitadent-mecidiyekoy",
    clinicSlug: "hospitadent-mecidiyekoy",
    clinicName: "Hospitadent Mecidiyeköy",
    treatmentCategories: ["dental"],
    location: { city: "İstanbul", address: "Mecidiyeköy" },
    status: "active",
  },
  {
    id: "westdent-clinic",
    clinicSlug: "westdent-clinic",
    clinicName: "Westdent Clinic",
    treatmentCategories: ["dental"],
    location: { city: "İzmir" },
    status: "active",
  },
];

describe("FeelinHealthy authoritative conversation state machine", () => {
  it("Test 1 – Merhaba → greeting only", () => {
    const next = resolveNextConversationAction(
      {},
      { isPureGreeting: true, locale: "tr" }
    );
    expect(next.kind).toBe("greeting");
    expect(isHardGateAction(next)).toBe(false);
  });

  it("Test 2 – İmplant istiyorum → KVKK, no intake/city", () => {
    const ctx = {
      lastTreatmentCategory: "implant",
      pendingHealthRequest: "İmplant istiyorum",
    };
    const next = resolveNextConversationAction(ctx, { locale: "tr" });
    expect(next.kind).toBe("consent");

    const state = deriveFeelinHealthyState(ctx);
    expect(canShowCityWidget(state)).toBe(false);
    expect(state.stage).toBe("consent");
  });

  it("Test 3 – Accept consent → Group 1 only", () => {
    const ctx = {
      quoteConsent: true,
      lastTreatmentCategory: "implant",
    };
    const next = resolveNextConversationAction(ctx, {
      locale: "tr",
      promptContext: ctx,
    });
    expect(next.kind).toBe("intake");
    if (next.kind === "intake") expect(next.group).toBe(1);
  });

  it("Test 4 – Complete Group 1 → Group 2 only", () => {
    const ctx = {
      quoteConsent: true,
      lastTreatmentCategory: "implant",
      patientName: "Ada Yılmaz",
      patientGender: "Kadın",
      patientAge: 34,
    };
    const next = resolveNextConversationAction(ctx, { locale: "tr", promptContext: ctx });
    expect(next.kind).toBe("intake");
    if (next.kind === "intake") expect(next.group).toBe(2);
  });

  it("Test 5 – Complete Group 2 → Group 3 only", () => {
    const ctx = {
      quoteConsent: true,
      lastTreatmentCategory: "implant",
      patientName: "Ada Yılmaz",
      patientGender: "Kadın",
      patientAge: 34,
      patientEmail: "ada@example.com",
      patientPhone: "+905551112233",
      patientCountry: "Almanya",
    };
    const next = resolveNextConversationAction(ctx, { locale: "tr", promptContext: ctx });
    expect(next.kind).toBe("intake");
    if (next.kind === "intake") expect(next.group).toBe(3);
  });

  it("Test 6 – Complete Group 3 with no city → city widget only", () => {
    const ctx = {
      quoteConsent: true,
      lastTreatmentCategory: "implant",
      ...completeIntake,
    };
    const next = resolveNextConversationAction(ctx, {
      availableClinics: dentalClinics,
      locale: "tr",
      promptContext: ctx,
    });
    expect(next.kind).toBe("ask_city");
    const state = deriveFeelinHealthyState(ctx);
    expect(canShowCityWidget(state)).toBe(true);
    expect(canShowIstanbulSideWidget(state)).toBe(false);

    const gate = buildGateResponseFromAction(next, ctx);
    expect(gate?.type).toBe("city_selection");
  });

  it("Test 7 – Select Istanbul → side widget; Group 1 must not restart", () => {
    const base = {
      quoteConsent: true,
      lastTreatmentCategory: "implant",
      ...completeIntake,
    };
    const applied = applyStructuredLocationAction(base, {
      type: "select_treatment_city",
      city: "istanbul",
      actionId: "city-1",
    });
    expect(applied.ctx.patientName).toBe("Ada Yılmaz");
    expect(applied.ctx.quoteConsent).toBe(true);
    expect(applied.ctx.lastTreatmentCategory).toBe("implant");
    expect(applied.ctx.selectedCity).toBe("istanbul");

    const next = resolveNextConversationAction(applied.ctx, {
      availableClinics: dentalClinics,
      locale: "tr",
      isStructuredAction: true,
      promptContext: applied.ctx,
    });
    expect(next.kind).toBe("ask_side");
    expect(canShowIstanbulSideWidget(deriveFeelinHealthyState(applied.ctx))).toBe(true);
  });

  it("Test 8 – Original message contains Istanbul → skip city after intake", () => {
    const loc = resolveIstanbulSideFromText("İstanbul'da implant istiyorum.");
    expect(loc.city).toBe("istanbul");

    const ctx = {
      quoteConsent: true,
      lastTreatmentCategory: "implant",
      selectedCity: "istanbul",
      locationSelectionConfirmed: true,
      ...completeIntake,
    };
    const next = resolveNextConversationAction(ctx, {
      availableClinics: dentalClinics,
      locale: "tr",
      promptContext: ctx,
    });
    expect(next.kind).toBe("ask_side");
  });

  it("Test 9 – Istanbul European Side known → matching after intake", () => {
    const loc = resolveIstanbulSideFromText("İstanbul Avrupa Yakası'nda implant istiyorum.");
    expect(loc.city).toBe("istanbul");
    expect(loc.side).toBe("european");

    const ctx = {
      quoteConsent: true,
      lastTreatmentCategory: "implant",
      selectedCity: "istanbul",
      istanbul_side: "european",
      locationSelectionConfirmed: true,
      sideSelectionConfirmed: true,
      ...completeIntake,
    };
    const next = resolveNextConversationAction(ctx, {
      availableClinics: dentalClinics,
      locale: "tr",
      promptContext: ctx,
    });
    expect(next.kind).toBe("match_clinics");
  });

  it("Test 10 – Select İzmir → no Istanbul side; matching", () => {
    const base = {
      quoteConsent: true,
      lastTreatmentCategory: "implant",
      ...completeIntake,
    };
    const applied = applyStructuredLocationAction(base, {
      type: "select_treatment_city",
      city: "izmir",
      actionId: "city-izmir",
    });
    expect(applied.ctx.istanbul_side).toBeUndefined();

    const next = resolveNextConversationAction(applied.ctx, {
      availableClinics: dentalClinics,
      locale: "tr",
      isStructuredAction: true,
      promptContext: applied.ctx,
    });
    expect(next.kind).toBe("match_clinics");
    expect(canShowIstanbulSideWidget(deriveFeelinHealthyState(applied.ctx))).toBe(false);
  });

  it("Test 11 – Refresh after Group 2 → resume at Group 3", () => {
    const ctx = {
      quoteConsent: true,
      lastTreatmentCategory: "implant",
      patientName: "Ada Yılmaz",
      patientGender: "Kadın",
      patientAge: 34,
      patientEmail: "ada@example.com",
      patientPhone: "+905551112233",
      patientCountry: "Almanya",
      // travelDate missing → Group 3
    };
    const state = deriveFeelinHealthyState(ctx);
    expect(state.stage).toBe("intake_group_3");
    const next = resolveNextConversationAction(ctx, { locale: "tr", promptContext: ctx });
    expect(next.kind).toBe("intake");
    if (next.kind === "intake") expect(next.group).toBe(3);
  });

  it("Test 12 – Double-click city selection is idempotent", () => {
    const base = {
      quoteConsent: true,
      lastTreatmentCategory: "implant",
      ...completeIntake,
    };
    const first = applyStructuredLocationAction(base, {
      type: "select_treatment_city",
      city: "istanbul",
      actionId: "dup-city",
    });
    const second = applyStructuredLocationAction(first.ctx, {
      type: "select_treatment_city",
      city: "istanbul",
      actionId: "dup-city",
    });
    expect(second.idempotentSkip).toBe(true);
    expect(second.ctx.patientName).toBe("Ada Yılmaz");
    expect(second.ctx.selectedCity).toBe("istanbul");
  });

  it("Test 13 – Clinic selected → selected_clinic; no discovery restart", () => {
    const ctx = {
      quoteConsent: true,
      lastTreatmentCategory: "implant",
      selectedCity: "istanbul",
      istanbul_side: "european",
      leadStage: "clinic_selected",
      selectedClinicId: "hospitadent-mecidiyekoy",
      selectedClinicName: "Hospitadent Mecidiyeköy",
      lastRecommendedClinicIds: ["hospitadent-mecidiyekoy"],
      ...completeIntake,
    };
    const next = resolveNextConversationAction(ctx, {
      availableClinics: dentalClinics,
      locale: "tr",
      promptContext: ctx,
    });
    expect(next.kind).toBe("selected_clinic");
    const state = deriveFeelinHealthyState(ctx);
    expect(state.stage).toBe("selected_clinic");
    expect(canShowCityWidget(state)).toBe(false);
    expect(canShowIstanbulSideWidget(state)).toBe(false);
  });

  it("Test 14 – Clean new conversation has no state leakage", () => {
    const next = resolveNextConversationAction({}, { isPureGreeting: true });
    expect(next.kind).toBe("greeting");
    const state = deriveFeelinHealthyState({});
    expect(state.consentStatus).toBe("not_requested");
    expect(state.treatment.confirmed).toBe(false);
    expect(state.location.city).toBeNull();
    expect(state.selectedClinicId).toBeNull();
    expect(state.intake.allComplete).toBe(false);
  });

  it("never shows city before consent + intake + treatment", () => {
    expect(
      canShowCityWidget(
        deriveFeelinHealthyState({
          lastTreatmentCategory: "implant",
          pendingHealthRequest: "implant",
        })
      )
    ).toBe(false);
    expect(
      canShowCityWidget(
        deriveFeelinHealthyState({
          quoteConsent: true,
          lastTreatmentCategory: "implant",
          patientName: "Ada Yılmaz",
          patientGender: "Kadın",
          patientAge: 34,
        })
      )
    ).toBe(false);
  });

  it("structured city action never clears intake or consent", () => {
    const applied = applyStructuredLocationAction(
      { quoteConsent: true, ...completeIntake, lastTreatmentCategory: "implant" },
      { type: "select_treatment_city", city: "antalya" }
    );
    expect(applied.ctx.quoteConsent).toBe(true);
    expect(applied.ctx.patientEmail).toBe("ada@example.com");
    expect(applied.ctx.travelDate).toBe("2026-09-15");
    expect(applied.ctx.lastTreatmentCategory).toBe("implant");
  });
});

describe("FeelinHealthy route wiring to state machine", () => {
  it("imports and calls resolveNextConversationAction", () => {
    expect(route).toContain("resolveNextConversationAction");
    expect(route).toContain("buildGateResponseFromAction");
    expect(route).toContain("applyStructuredLocationAction");
    expect(route).toContain("feelinhealthyConversationMachine");
  });

  it("keeps pre-LLM authoritative gate for FeelinHealthy", () => {
    expect(route).toContain("authoritative state machine (pre-LLM)");
    expect(route).toContain("isHardGateAction");
  });

  it("never hardcodes Group 1 rediscovery in degraded LLM fallback", () => {
    expect(route).not.toContain(
      'isFeelinHealthy ? "Talebinizi aldım. Size en uygun klinikleri hazırlayabilmemiz için adınızı soyadınızı, yaşınızı ve cinsiyetinizi paylaşabilir misiniz?"'
    );
    expect(route).toContain("runFeelinHealthyDegradedFallback");
    expect(route).toContain("skipLlmForDeterministicMatch");
  });
});

describe("Screenshot journey regressions (CTO P0)", () => {
  it("extracts treatment from Turkish capital İ (İmplant)", () => {
    expect(inferTreatmentFromText("İmplant yaptırmak istiyorum")).toBe("implant");
    expect(SlotExtractor.parseCanonicalTreatment("İmplant yaptırmak istiyorum")?.id).toBe("implant");
    expect(SlotExtractor.extractSlots("İmplant yaptırmak istiyorum", {}, "tr").extracted.treatment).toBe(
      "implant"
    );
  });

  it("preserves treatment through consent pending helper", () => {
    const ctx = ensureTreatmentFromPending(
      { pendingHealthRequest: "İmplant yaptırmak istiyorum" },
      "İmplant yaptırmak istiyorum"
    );
    expect(ctx.lastTreatmentCategory).toBe("implant");
  });

  it("after full intake + Istanbul + European side → match, never intake", () => {
    const ctx = {
      quoteConsent: true,
      lastTreatmentCategory: "implant",
      selectedCity: "istanbul",
      istanbul_side: "european",
      locationSelectionConfirmed: true,
      sideSelectionConfirmed: true,
      ...completeIntake,
    };
    const next = resolveNextConversationAction(ctx, {
      availableClinics: dentalClinics,
      locale: "tr",
      isStructuredAction: true,
      promptContext: ctx,
    });
    expect(next.kind).toBe("match_clinics");
    expect(next.kind).not.toBe("intake");
  });

  it("merge never wipes completed intake when LLM returns empty fields", () => {
    const previous = {
      quoteConsent: true,
      patientName: "Alper Ozgul",
      patientAge: 27,
      patientGender: "Erkek",
      patientEmail: "yusufalperozgul@hotmail.com",
      patientPhone: "+905314629921",
      patientCountry: "Turkiye",
      travelDate: "Eylül 2026",
      lastTreatmentCategory: "implant",
      selectedCity: "istanbul",
      istanbul_side: "european",
    };
    const merged = mergeFeelinHealthySession(previous, {
      patientName: null,
      patientEmail: "",
      lastTreatmentCategory: undefined,
      processingMode: "degraded",
    });
    expect(merged.patientName).toBe("Alper Ozgul");
    expect(merged.patientEmail).toBe("yusufalperozgul@hotmail.com");
    expect(merged.lastTreatmentCategory).toBe("implant");
    expect(merged.quoteConsent).toBe(true);
  });

  it("complete journey never restarts Group 1 after side selection", () => {
    let ctx: Record<string, any> = {
      quoteConsent: true,
      lastTreatmentCategory: "implant",
      pendingHealthRequest: "İmplant yaptırmak istiyorum",
    };
    // G1
    ctx = { ...ctx, patientName: "Alper Ozgul", patientGender: "Erkek", patientAge: 27 };
    expect(resolveNextConversationAction(ctx, { locale: "tr" }).kind).toBe("intake");
    // G2
    ctx = {
      ...ctx,
      patientEmail: "yusufalperozgul@hotmail.com",
      patientPhone: "+905314629921",
      patientCountry: "Turkiye",
    };
    expect((resolveNextConversationAction(ctx, { locale: "tr" }) as any).group).toBe(3);
    // G3
    ctx = { ...ctx, travelDate: "Eylül 2026" };
    expect(
      resolveNextConversationAction(ctx, { availableClinics: dentalClinics, locale: "tr" }).kind
    ).toBe("ask_city");
    // City
    ctx = applyStructuredLocationAction(ctx, { type: "select_treatment_city", city: "istanbul" }).ctx;
    expect(
      resolveNextConversationAction(ctx, {
        availableClinics: dentalClinics,
        locale: "tr",
        isStructuredAction: true,
      }).kind
    ).toBe("ask_side");
    // Side
    ctx = applyStructuredLocationAction(ctx, { type: "side_selection", side: "european" }).ctx;
    const afterSide = resolveNextConversationAction(ctx, {
      availableClinics: dentalClinics,
      locale: "tr",
      isStructuredAction: true,
    });
    expect(afterSide.kind).toBe("match_clinics");
    expect(ctx.patientName).toBe("Alper Ozgul");
    expect(ctx.lastTreatmentCategory).toBe("implant");
  });
});
