/**
 * Golden K–P: treatment-scoped quote cycles.
 */

import { describe, it, expect } from "vitest";
import {
  prepareRequestQuote,
  claimPostQuoteMembershipMessage,
} from "../lib/agency/feelinhealthyClinicCardActions";
import { isQuoteRequestLocked } from "../lib/agency/feelinhealthyQuotePrefill";
import { applyDetectedTreatmentUpdate } from "../lib/agency/feelinhealthyConversationMachine";
import {
  hasCompletedQuoteForTreatment,
  isCurrentTreatmentQuoteLocked,
  isSameTreatmentQuoteCycle,
  recordTreatmentQuoteSuccess,
  resolveTreatmentQuoteKey,
  syncQuoteLockForCurrentTreatment,
} from "../lib/agency/treatmentQuoteCycle";
import { normalizeTreatmentBranch } from "../lib/agency/feelinhealthyConfig";

const completedIntake = {
  quoteConsent: true,
  consentStatus: "accepted",
  patientName: "Staging Patient",
  patientAge: 34,
  patientGender: "Kadın",
  patientEmail: "staging.patient@example.com",
  patientEmailStatus: "verified_format",
  patientPhone: "+905551112233",
  patientCountry: "Almanya",
  travelDate: "2026-10-15",
  selectedCity: "istanbul",
  istanbul_side: "european",
};

const RHINO = "Ab1OHdC020XOG4TWpR2r";
const IMPLANT_A = "HXMlMPZ74AXkXoR4sEnH";
const IMPLANT_B = "Ab1OHdC020XOG4TWpR2r";

describe("Golden K — Different treatment unlocks quote", () => {
  it("Rhinoplasty quote then Implant rematch unlocks Teklif Al", () => {
    let ctx: any = {
      ...completedIntake,
      sessionId: "gold_k",
      lastTreatmentCategory: "rhinoplasty",
      lastRecommendedClinicIds: [RHINO],
      selectedClinicIds: [RHINO],
    };
    ctx = recordTreatmentQuoteSuccess(ctx, {
      treatment: "rhinoplasty",
      quoteId: "quote_rhino",
      leadId: "lead_1",
    });
    expect(isQuoteRequestLocked(ctx)).toBe(true);
    expect(isCurrentTreatmentQuoteLocked(ctx)).toBe(true);

    const switched = applyDetectedTreatmentUpdate(ctx, {
      extractedTreatment: "implant",
      message: "Diş implantı yaptırmak istiyorum",
    });
    expect(switched.changed).toBe(true);
    ctx = switched.ctx;
    ctx.lastRecommendedClinicIds = [IMPLANT_A, IMPLANT_B];
    ctx.selectedClinicIds = [IMPLANT_A];

    expect(resolveTreatmentQuoteKey(ctx.lastTreatmentCategory)).toBe("dental");
    expect(hasCompletedQuoteForTreatment(ctx, "aesthetic_surgery")).toBe(true);
    expect(hasCompletedQuoteForTreatment(ctx, "dental")).toBe(false);
    expect(isQuoteRequestLocked(ctx)).toBe(false);
    expect(ctx.quotesByTreatmentKey?.aesthetic_surgery?.quoteId).toBe("quote_rhino");
    expect(ctx.leadId).toBe("lead_1");

    const prepared = prepareRequestQuote({
      sessionContext: ctx,
      clinicId: IMPLANT_A,
      locale: "tr",
    });
    expect(prepared.kind).toBe("handled");
    expect(prepared.shouldPersistQuote).toBe(true);
  });
});

describe("Golden L — Same treatment remains locked", () => {
  it("Rhinoplasty quote blocks another Rhinoplasty request_quote", () => {
    let ctx: any = {
      ...completedIntake,
      sessionId: "gold_l",
      lastTreatmentCategory: "rhinoplasty",
      lastRecommendedClinicIds: [RHINO],
      selectedClinicIds: [RHINO],
    };
    ctx = recordTreatmentQuoteSuccess(ctx, {
      treatment: "rhinoplasty",
      quoteId: "quote_rhino",
      leadId: "lead_1",
    });
    const again = prepareRequestQuote({
      sessionContext: ctx,
      clinicId: RHINO,
      locale: "tr",
    });
    expect(again.kind).toBe("error");
    expect(again.httpStatus).toBe(409);
    expect(again.shouldPersistQuote).toBe(false);
    expect(isQuoteRequestLocked(ctx)).toBe(true);
  });
});

describe("Golden M — Two treatments, two quotes", () => {
  it("records two treatment-specific quote entries under one lead", () => {
    let ctx: any = {
      ...completedIntake,
      sessionId: "gold_m",
      lastTreatmentCategory: "rhinoplasty",
      lastRecommendedClinicIds: [RHINO],
      selectedClinicIds: [RHINO],
    };
    ctx = recordTreatmentQuoteSuccess(ctx, {
      treatment: "rhinoplasty",
      quoteId: "quote_rhino",
      leadId: "lead_shared",
    });
    const toImplant = applyDetectedTreatmentUpdate(ctx, {
      extractedTreatment: "dental implant",
    });
    ctx = toImplant.ctx;
    ctx.lastRecommendedClinicIds = [IMPLANT_A];
    ctx.selectedClinicIds = [IMPLANT_A];
    ctx = recordTreatmentQuoteSuccess(ctx, {
      treatment: "implant",
      quoteId: "quote_implant",
      leadId: "lead_shared",
    });

    expect(Object.keys(ctx.quotesByTreatmentKey || {}).sort()).toEqual([
      "aesthetic_surgery",
      "dental",
    ]);
    expect(ctx.quotesByTreatmentKey.aesthetic_surgery.quoteId).toBe("quote_rhino");
    expect(ctx.quotesByTreatmentKey.dental.quoteId).toBe("quote_implant");
    expect(ctx.leadId).toBe("lead_shared");
    expect(ctx.quoteId).toBe("quote_implant");
  });
});

describe("Golden N — Return to first treatment", () => {
  it("re-locks Rhinoplasty CTA after Implant quote without creating a third cycle", () => {
    let ctx: any = {
      ...completedIntake,
      sessionId: "gold_n",
      lastTreatmentCategory: "rhinoplasty",
    };
    ctx = recordTreatmentQuoteSuccess(ctx, {
      treatment: "rhinoplasty",
      quoteId: "quote_rhino",
      leadId: "lead_1",
    });
    ctx = applyDetectedTreatmentUpdate(ctx, { extractedTreatment: "implant" }).ctx;
    ctx = recordTreatmentQuoteSuccess(ctx, {
      treatment: "implant",
      quoteId: "quote_implant",
      leadId: "lead_1",
    });
    ctx = applyDetectedTreatmentUpdate(ctx, {
      extractedTreatment: "rhinoplasty",
      message: "Yine burun estetiği istiyorum",
    }).ctx;
    ctx = syncQuoteLockForCurrentTreatment(ctx);

    expect(resolveTreatmentQuoteKey(ctx.lastTreatmentCategory)).toBe("aesthetic_surgery");
    expect(isQuoteRequestLocked(ctx)).toBe(true);
    expect(ctx.quoteId).toBe("quote_rhino");
    const blocked = prepareRequestQuote({
      sessionContext: { ...ctx, lastRecommendedClinicIds: [RHINO], selectedClinicIds: [RHINO] },
      clinicId: RHINO,
      locale: "tr",
    });
    expect(blocked.httpStatus).toBe(409);
    expect(Object.keys(ctx.quotesByTreatmentKey || {}).length).toBe(2);
  });
});

describe("Golden O — Alias normalization", () => {
  it("rhinoplasty and burun estetiği share one quote cycle", () => {
    expect(isSameTreatmentQuoteCycle("rhinoplasty", "burun estetiği")).toBe(true);
    expect(isSameTreatmentQuoteCycle("rhinoplasty", "implant")).toBe(false);
    expect(normalizeTreatmentBranch("burun estetiği")).toBe("aesthetic_surgery");

    let ctx: any = {
      ...completedIntake,
      lastTreatmentCategory: "rhinoplasty",
    };
    ctx = recordTreatmentQuoteSuccess(ctx, {
      treatment: "rhinoplasty",
      quoteId: "quote_rhino",
      leadId: "lead_1",
    });
    const alias = applyDetectedTreatmentUpdate(ctx, {
      extractedTreatment: "burun estetiği",
      message: "burun estetiği",
    });
    expect(alias.changed).toBe(false);
    expect(isQuoteRequestLocked(alias.ctx)).toBe(true);
  });
});

describe("Golden P — Retry idempotency for same treatment", () => {
  it("second request_quote for Implant is rejected; membership stays one-shot per quote", () => {
    let ctx: any = {
      ...completedIntake,
      sessionId: "gold_p",
      lastTreatmentCategory: "implant",
      lastRecommendedClinicIds: [IMPLANT_A],
      selectedClinicIds: [IMPLANT_A],
    };
    ctx = recordTreatmentQuoteSuccess(ctx, {
      treatment: "implant",
      quoteId: "quote_implant",
      leadId: "lead_1",
    });
    const firstMembership = claimPostQuoteMembershipMessage({
      sessionContext: ctx,
      locale: "tr",
      quoteId: "quote_implant",
      leadId: "lead_1",
      conversationId: "gold_p",
    });
    expect(firstMembership.message).toBeTruthy();
    ctx = firstMembership.sessionContext;

    const retry = prepareRequestQuote({
      sessionContext: ctx,
      clinicId: IMPLANT_A,
      locale: "tr",
    });
    expect(retry.kind).toBe("error");
    expect(retry.httpStatus).toBe(409);

    const secondMembership = claimPostQuoteMembershipMessage({
      sessionContext: ctx,
      locale: "tr",
      quoteId: "quote_implant",
      leadId: "lead_1",
      conversationId: "gold_p",
    });
    expect(secondMembership.message).toBeNull();
  });
});

describe("Legacy session migration on treatment switch", () => {
  it("attributes a pre-map locked quote to the previous treatment when switching", () => {
    const legacy: any = {
      ...completedIntake,
      lastTreatmentCategory: "rhinoplasty",
      quoteRequestLocked: true,
      leadStage: "quote_request_created",
      quoteId: "quote_legacy",
      leadId: "lead_legacy",
    };
    const switched = applyDetectedTreatmentUpdate(legacy, {
      extractedTreatment: "implant",
    });
    expect(switched.changed).toBe(true);
    expect(switched.ctx.quotesByTreatmentKey?.aesthetic_surgery?.quoteId).toBe(
      "quote_legacy"
    );
    expect(isQuoteRequestLocked(switched.ctx)).toBe(false);
  });
});
