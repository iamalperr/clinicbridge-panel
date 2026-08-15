/**
 * Phase 2B P1 regression suite for FeelinHealthy go-live.
 *
 * F — quote + secondary membership message idempotency
 * G — informational failure taxonomy
 * H — transactional failure taxonomy
 * I — post-quote explicit new clinic search
 * J — post-quote location change
 * Plus Intermed exclusion, brand resolver, unknown treatment branch.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FEELINHEALTHY_CONFIG,
  FEELINHEALTHY_PRODUCTION_CLINIC_IDS,
  getCuratedClinicsForFeelinHealthy,
  normalizeTreatmentBranch,
  UNKNOWN_TREATMENT_BRANCH,
} from "../lib/agency/feelinhealthyConfig";
import {
  beginPostQuoteRematch,
  isAgencyExplicitMatchingChangeRequest,
  shouldRouteAsPostQuoteAssistance,
} from "../lib/agency/conversationOrchestration";
import {
  deriveFeelinHealthyState,
  resolveNextConversationAction,
} from "../lib/agency/feelinhealthyConversationMachine";
import {
  claimPostQuoteMembershipMessage,
  getPostQuoteMembershipMessage,
  prepareRequestQuote,
  resolveGuestQuoteClinicLimit,
} from "../lib/agency/feelinhealthyClinicCardActions";
import { resolveAgencyBrand } from "../lib/agency/resolveAgencyBrand";
import { buildPatientOfferEmailContent } from "../lib/services/patientOfferEmailContent";
import {
  buildInformationalFailureCopy,
  buildTransactionalFailureCopy,
  resolveClientCatchFailure,
} from "../lib/agency/patientFacingErrors";

const REPO_ROOT = resolve(__dirname, "..");
const route = readFileSync(
  resolve(REPO_ROOT, "app/api/public/agency/[slug]/matching-chat/route.ts"),
  "utf8"
);
const offerService = readFileSync(
  resolve(REPO_ROOT, "lib/services/patientOfferEmailService.ts"),
  "utf8"
);
const patientNotify = readFileSync(
  resolve(REPO_ROOT, "lib/services/patientNotificationService.ts"),
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
    id: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.orionSurgeryCenter,
    clinicSlug: "orion-surgery-center",
    clinicName: "Orion Surgery Center",
    status: "active",
    treatmentCategories: ["aesthetic_surgery"],
    location: { city: "İstanbul", address: "Ataşehir" },
  },
  {
    id: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.lokmanHekimIstanbul,
    clinicSlug: "lokman-hekim-istanbul-hospital",
    clinicName: "Lokman Hekim İstanbul Hospital",
    status: "active",
    treatmentCategories: ["aesthetic_surgery"],
    location: { city: "İstanbul", address: "Kurtköy" },
  },
  {
    id: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.intermedNisantasi,
    clinicSlug: "intermed-health-group-nisantasi",
    clinicName: "Intermed Health Group Nişantaşı",
    status: "active",
    treatmentCategories: ["aesthetic_surgery"],
    location: { city: "İstanbul", address: "Nişantaşı" },
  },
  {
    id: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.bhtClinicIstanbulTema,
    clinicSlug: "bht-clinic-istanbul-tema",
    clinicName: "BHT Clinic İstanbul TEMA Hospital",
    status: "active",
    treatmentCategories: ["aesthetic_surgery"],
    location: { city: "İstanbul", address: "Halkalı" },
  },
];

describe("Fix 1 — Intermed excluded from FeelinHealthy curated recommendations", () => {
  it("never returns Intermed for aesthetic × İstanbul Avrupa", () => {
    const res = getCuratedClinicsForFeelinHealthy(
      "aesthetic_surgery",
      "istanbul",
      "european",
      aestheticPool
    );
    const names = res.matchingCuratedClinics.map((c) => String(c.clinicName || ""));
    const ids = res.matchingCuratedClinics.map((c) => String(c.id || ""));
    expect(names.join(" ")).not.toMatch(/Intermed/i);
    expect(ids).not.toContain(FEELINHEALTHY_PRODUCTION_CLINIC_IDS.intermedNisantasi);
    expect(res.matchingCuratedClinics.length).toBeGreaterThan(0);
    expect(res.matchingCuratedClinics.length).toBeLessThanOrEqual(
      FEELINHEALTHY_CONFIG.maxGuestClinics
    );
  });

  it("still surfaces other European aesthetic partners and keeps guest cap 2", () => {
    const res = getCuratedClinicsForFeelinHealthy(
      "rhinoplasty",
      "istanbul",
      "european",
      aestheticPool
    );
    expect(res.matchingCuratedClinics.some((c) => /BHT/i.test(c.clinicName))).toBe(true);
    expect(res.matchingCuratedClinics.length).toBeLessThanOrEqual(2);
  });

  it("does not add a cross-agency Intermed name filter", () => {
    expect(route).not.toMatch(/clinicName\s*[!=]=\s*["'].*Intermed/i);
    expect(route).not.toMatch(/includes\(["']intermed/i);
  });
});

describe("Fix 2 — Agency brand resolver matrix", () => {
  it("FeelinHealthy resolves display From name to FeelinHealthy on approved mailbox", () => {
    const brand = resolveAgencyBrand({
      name: "FeelinHealthy",
      settings: { supportEmail: "destek@feelinhealthy.com" },
      website: "https://www.feelinhealthy.com",
    });
    expect(brand.isAgencyBranded).toBe(true);
    expect(brand.displayName).toBe("FeelinHealthy");
    expect(brand.fromName).toBe("FeelinHealthy");
    expect(brand.fromEmail).toBe("noreply@clinicbridge-ai.com");
    expect(brand.fromHeader).toBe("FeelinHealthy <noreply@clinicbridge-ai.com>");
    expect(brand.replyTo).toBe("destek@feelinhealthy.com");
    expect(brand.websiteUrl).toContain("feelinhealthy.com");
  });

  it("another agency uses its own name", () => {
    const brand = resolveAgencyBrand({ name: "MedTravel Istanbul" });
    expect(brand.displayName).toBe("MedTravel Istanbul");
    expect(brand.fromHeader).toContain("MedTravel Istanbul");
    expect(brand.fromEmail).toBe("noreply@clinicbridge-ai.com");
  });

  it("missing agency falls back to ClinicBridge AI", () => {
    const brand = resolveAgencyBrand(null);
    expect(brand.isAgencyBranded).toBe(false);
    expect(brand.displayName).toBe("ClinicBridge AI");
    expect(brand.fromHeader).toContain("ClinicBridge AI");
  });

  it("offer email content uses agency footer without ClinicBridge AI suffix when branded", () => {
    const content = buildPatientOfferEmailContent({
      lang: "tr",
      agencyName: "FeelinHealthy",
      patientName: "Ayşe",
      treatmentLabel: "Rinoplasti",
      offers: [
        {
          clinicName: "Orion",
          treatmentName: "Rinoplasti",
          priceMin: 1000,
          priceMax: 2000,
          currency: "EUR",
        },
      ],
      footerBrand: "FeelinHealthy",
    });
    expect(content.html).toContain("FeelinHealthy");
    expect(content.html).not.toContain("FeelinHealthy · ClinicBridge AI");
    expect(content.subject).toContain("FeelinHealthy");
  });

  it("patient mailers wire resolveAgencyBrand", () => {
    expect(offerService).toContain("resolveAgencyBrand");
    expect(offerService).toContain("brand.fromHeader");
    expect(patientNotify).toContain("resolveAgencyBrand");
    expect(patientNotify).toContain("brand.fromHeader");
  });
});

describe("Fix 3 / Golden G+H — failure taxonomy", () => {
  it("Golden G — informational failure may include agency website CTA", () => {
    const copy = buildInformationalFailureCopy({
      locale: "tr",
      brand: {
        displayName: "FeelinHealthy",
        websiteUrl: "https://www.feelinhealthy.com",
      },
    });
    expect(copy.kind).toBe("informational");
    expect(copy.reply).toMatch(/web sitesini|detaylı yanıt/i);
    expect(copy.websiteUrl).toContain("feelinhealthy.com");
  });

  it("Golden G — informational without website stays soft and state-safe", () => {
    const copy = buildInformationalFailureCopy({ locale: "en", brand: null });
    expect(copy.kind).toBe("informational");
    expect(copy.reply).toMatch(/can't give a reliable answer/i);
    expect(copy.websiteUrl).toBeUndefined();
  });

  it("Golden H — transactional failure is truthful and not a website CTA", () => {
    const quoteFail = buildTransactionalFailureCopy({ locale: "tr", operation: "quote" });
    expect(quoteFail.kind).toBe("transactional");
    expect(quoteFail.reply).toMatch(/kaydedemedik|tamamlanmadı/i);
    expect(quoteFail.reply).not.toMatch(/web sitesi/i);

    const client = resolveClientCatchFailure({
      locale: "tr",
      operation: "quote",
      brand: { displayName: "FeelinHealthy", websiteUrl: "https://www.feelinhealthy.com" },
    });
    expect(client.kind).toBe("transactional");
    expect(client.reply).not.toMatch(/web sitesi/i);
  });
});

describe("Fix 4 / Golden F — post-quote membership message idempotency", () => {
  it("emits en fazla N from config and only once per quote", () => {
    const msg = getPostQuoteMembershipMessage({
      locale: "tr",
      agencyDisplayName: "FeelinHealthy",
      maxClinics: resolveGuestQuoteClinicLimit(),
    });
    expect(msg).toMatch(/en fazla 2 klinik/i);
    expect(msg).toContain(String(resolveGuestQuoteClinicLimit()));
    expect(msg.toLowerCase()).toContain("ücretsiz üye");

    const first = claimPostQuoteMembershipMessage({
      sessionContext: { ...completedIntake, sessionId: "sess_1" },
      locale: "tr",
      agencyDisplayName: "FeelinHealthy",
      quoteId: "quote_abc",
      leadId: "lead_1",
    });
    expect(first.message).toBeTruthy();
    expect(first.sessionContext.postQuoteMembershipMessageSent).toBe(true);

    const second = claimPostQuoteMembershipMessage({
      sessionContext: first.sessionContext,
      locale: "tr",
      agencyDisplayName: "FeelinHealthy",
      quoteId: "quote_abc",
      leadId: "lead_1",
    });
    expect(second.message).toBeNull();

    // Retry of request_quote after lock must not persist again.
    const locked = prepareRequestQuote({
      sessionContext: {
        ...first.sessionContext,
        leadStage: "quote_request_created",
        quoteRequestLocked: true,
        selectedClinicIds: ["c1"],
        lastRecommendedClinicIds: ["c1"],
      },
      clinicId: "c1",
      locale: "tr",
    });
    expect(locked.shouldPersistQuote).toBe(false);
    expect(locked.httpStatus).toBe(409);
  });

  it("route returns followUpReplies only after successful persist wiring", () => {
    expect(route).toContain("claimPostQuoteMembershipMessage");
    expect(route).toContain("followUpReplies");
  });
});

describe("Fix 5 / Golden I+J — post-quote explicit change", () => {
  const postQuoteCtx = {
    ...completedIntake,
    lastTreatmentCategory: "rhinoplasti",
    selectedCity: "antalya",
    locationSelectionConfirmed: true,
    selectedClinicIds: ["c1", "c2"],
    lastRecommendedClinicIds: ["c1", "c2"],
    leadStage: "quote_request_created",
    quoteRequestLocked: true,
    leadId: "lead_hist",
    quoteId: "quote_hist",
  };

  it("Golden I — başka klinik görmek istiyorum unlocks matching without second quote", () => {
    expect(isAgencyExplicitMatchingChangeRequest("Başka klinik görmek istiyorum.")).toBe(true);
    expect(
      shouldRouteAsPostQuoteAssistance({
        sessionContext: postQuoteCtx,
        message: "Başka klinik görmek istiyorum.",
      })
    ).toBe(false);

    const rematch = beginPostQuoteRematch(postQuoteCtx, { clearCity: true });
    expect(rematch.postQuoteRematchRequested).toBe(true);
    expect(rematch.leadId).toBe("lead_hist");
    expect(rematch.quoteId).toBe("quote_hist");
    expect(rematch.leadStage).toBe("quote_request_created");
    expect(rematch.quoteRequestLocked).toBe(true);
    expect(rematch.quoteConsent).toBe(true);
    expect(rematch.selectedClinicIds).toBeUndefined();
    expect(rematch.lastRecommendedClinicIds).toBeUndefined();

    const next = resolveNextConversationAction(rematch, {
      availableClinics: aestheticPool,
      locale: "tr",
      promptContext: rematch,
    });
    expect(next.kind).not.toBe("quote");
    expect(["ask_city", "ask_side", "match_clinics", "ask_treatment"]).toContain(next.kind);
  });

  it("Golden J — Antalya yerine İstanbul keeps history and asks side when needed", () => {
    const rematch = beginPostQuoteRematch(postQuoteCtx, {
      nextCity: "istanbul",
      nextSide: null,
    });
    expect(rematch.selectedCity).toBe("istanbul");
    expect(rematch.leadId).toBe("lead_hist");
    expect(rematch.quoteId).toBe("quote_hist");
    expect(rematch.istanbul_side).toBeUndefined();

    const next = resolveNextConversationAction(rematch, {
      availableClinics: aestheticPool,
      locale: "tr",
      promptContext: rematch,
    });
    expect(next.kind).toBe("ask_side");
    expect(deriveFeelinHealthyState(rematch).location.city).toBe("istanbul");
  });

  it("informational post-quote questions still stay in assistance mode", () => {
    expect(
      shouldRouteAsPostQuoteAssistance({
        sessionContext: postQuoteCtx,
        message: "Tedavi kaç gün sürüyor?",
      })
    ).toBe(true);
  });
});

describe("Fix 6 — unknown treatment must not become dental", () => {
  it("maps dental aliases including All-on-4", () => {
    expect(normalizeTreatmentBranch("All-on-4")).toBe("dental");
    expect(normalizeTreatmentBranch("implant")).toBe("dental");
    expect(normalizeTreatmentBranch("veneers")).toBe("dental");
    expect(normalizeTreatmentBranch("diş implantı")).toBe("dental");
  });

  it("maps aesthetic aliases", () => {
    expect(normalizeTreatmentBranch("rhinoplasty")).toBe("aesthetic_surgery");
    expect(normalizeTreatmentBranch("rhinoplasti")).toBe("aesthetic_surgery");
    expect(normalizeTreatmentBranch("burun estetiği")).toBe("aesthetic_surgery");
    expect(normalizeTreatmentBranch("meme büyütme")).toBe("aesthetic_surgery");
  });

  it("empty / gibberish → unknown, never dental", () => {
    expect(normalizeTreatmentBranch(null)).toBe(UNKNOWN_TREATMENT_BRANCH);
    expect(normalizeTreatmentBranch("")).toBe(UNKNOWN_TREATMENT_BRANCH);
    expect(normalizeTreatmentBranch("asdfqwerty123")).toBe(UNKNOWN_TREATMENT_BRANCH);
    expect(normalizeTreatmentBranch("xyz")).not.toBe("dental");
  });
});
