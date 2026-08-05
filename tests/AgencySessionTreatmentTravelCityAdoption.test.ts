import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getAgencySelectedCity,
  getAgencyTravelDate,
  getAgencyTreatmentContext,
} from "../lib/agency/agencySessionState";
import {
  evaluateFeelinHealthyIntake,
  isReadyForClinicMatching,
  decideFeelinHealthyLocationNextStep,
} from "../lib/agency/feelinhealthyConfig";
import {
  applyDetectedTreatmentUpdate,
  deriveFeelinHealthyState,
} from "../lib/agency/feelinhealthyConversationMachine";
import { buildQuotePrefillFromSession } from "../lib/agency/feelinhealthyQuotePrefill";
import { compileAssistantPolicy } from "../lib/agency/assistantPolicy";

const REPO_ROOT = resolve(__dirname, "..");

describe("Phase 4 — treatment, travel date and city accessor adoption", () => {
  it("1–3. treatment category/subcategory/id separation", () => {
    const full = getAgencyTreatmentContext({
      lastTreatmentCategory: "implant",
      lastSubTreatment: "zirconium",
      treatmentId: "hair",
    });
    expect(full.category).toBe("implant");
    expect(full.subcategory).toBe("zirconium");
    expect(full.treatmentId).toBe("hair");
  });

  it("2. treatmentId is only a weak category fallback", () => {
    expect(getAgencyTreatmentContext({ treatmentId: "dental" }).category).toBe("dental");
    expect(
      getAgencyTreatmentContext({
        lastTreatmentCategory: "implant",
        treatmentId: "dental",
      }).category
    ).toBe("implant");
  });

  it("4–5. conflicting treatment aliases are deterministic; no eligibility invent", () => {
    const ctx = getAgencyTreatmentContext({
      lastTreatmentCategory: "implant",
      treatmentId: "hair",
    });
    expect(ctx.category).toBe("implant");
    // Presence is structural — curated readiness still needs consent/intake/side.
    const ready = isReadyForClinicMatching({
      lastTreatmentCategory: "implant",
      treatmentId: "hair",
      quoteConsent: false,
    });
    expect(ready.ready).toBe(false);
    expect(ready.missing).toContain("consent");
  });

  it("6. treatment-switch behavior remains unchanged", () => {
    const switched = applyDetectedTreatmentUpdate(
      { lastTreatmentCategory: "implant", selectedCity: "istanbul", istanbul_side: "european" },
      { message: "saç ekimi istiyorum", extractedTreatment: "hair" }
    );
    expect(switched.changed).toBe(true);
    expect(switched.previous).toBe("implant");
    expect(String(switched.next || "").toLowerCase()).toMatch(/hair|saç/);
  });

  it("7–9. travelDate precedence and legacy aliases", () => {
    expect(
      getAgencyTravelDate({
        travelDate: "2026-09-01",
        travelDateStart: "soon",
        travelDateText: "next month",
      })
    ).toBe("2026-09-01");
    expect(getAgencyTravelDate({ travelDateStart: "2026-10-01" })).toBe("2026-10-01");
    expect(getAgencyTravelDate({ travelDateText: "yakında" })).toBe("yakında");
  });

  it("10. canonical travel date prevents group-3 repeat ask", () => {
    const base = {
      patientName: "Ada Lovelace",
      firstName: "Ada",
      lastName: "Lovelace",
      patientGender: "female",
      patientAge: 34,
      patientEmail: "ada@example.com",
      patientEmailStatus: "verified_format",
      patientPhone: "+905551112233",
      patientCountry: "TR",
    };
    const missing = evaluateFeelinHealthyIntake(base);
    expect(missing.group3Complete).toBe(false);
    expect(missing.missingFieldsInCurrentGroup).toContain("travelDate");

    const withAlias = evaluateFeelinHealthyIntake({
      ...base,
      travelDateText: "önümüzdeki ay",
    });
    expect(withAlias.group3Complete).toBe(true);
    expect(withAlias.missingFieldsInCurrentGroup).not.toContain("travelDate");
  });

  it("11–13. selectedCity is canonical; lastLocation/side do not manufacture city", () => {
    expect(getAgencySelectedCity({ selectedCity: "istanbul" })).toBe("istanbul");
    expect(getAgencySelectedCity({ lastLocation: "İstanbul Avrupa Yakası" })).toBeUndefined();
    expect(
      getAgencySelectedCity({ istanbul_side: "european", istanbulSide: "anatolian" })
    ).toBeUndefined();

    // Location negotiation may still resolve city from lastLocation — that is not
    // getAgencySelectedCity manufacturing selectedCity.
    const decision = decideFeelinHealthyLocationNextStep(
      {
        lastTreatmentCategory: "implant",
        lastLocation: "İstanbul",
      },
      [],
      "tr"
    );
    expect(decision.step === "ask_side" || decision.step === "ready" || decision.step === "ask_city").toBe(
      true
    );
  });

  it("14. matching readiness still requires the same conditions", () => {
    const incomplete = isReadyForClinicMatching({
      quoteConsent: true,
      lastTreatmentCategory: "implant",
      travelDate: "soon",
      patientName: "Ada",
      firstName: "Ada",
      lastName: "Yılmaz",
      patientGender: "female",
      patientAge: 30,
      patientEmail: "a@b.com",
      patientPhone: "+90",
      patientCountry: "TR",
      // no city / side
    } as any);
    expect(incomplete.ready).toBe(false);
    expect(incomplete.missing.some((m) => m === "city" || m === "istanbul_side")).toBe(true);

    const ready = isReadyForClinicMatching({
      quoteConsent: true,
      lastTreatmentCategory: "implant",
      travelDateText: "soon",
      patientName: "Ada Lovelace",
      patientGender: "female",
      patientAge: 30,
      patientEmail: "a@b.com",
      patientEmailStatus: "verified_format",
      patientPhone: "+905551112233",
      patientCountry: "TR",
      selectedCity: "istanbul",
      istanbul_side: "european",
    } as any);
    expect(ready.ready).toBe(true);
  });

  it("15. quote/lead prefill payload fields remain unchanged", () => {
    const prefill = buildQuotePrefillFromSession({
      lastTreatmentCategory: "implant",
      lastSubTreatment: "zirconium",
      treatmentId: "ignored-when-category-set",
      selectedCity: "istanbul",
      travelDateStart: "2026-09",
      sessionId: "s1",
    });
    expect(prefill.treatmentCategory).toBe("implant");
    expect(prefill.treatmentSubcategory).toBe("zirconium");
    expect(prefill.selectedCity).toBe("istanbul");
    expect(prefill.travelDate).toBe("2026-09");
    expect(Object.keys(prefill)).toEqual(
      expect.arrayContaining([
        "treatmentCategory",
        "treatmentSubcategory",
        "selectedCity",
        "travelDate",
        "sessionId",
      ])
    );
  });

  it("16–18. wiring keeps consent gates and adopts accessors", () => {
    const matching = readFileSync(
      resolve(REPO_ROOT, "app/api/public/agency/[slug]/matching-chat/route.ts"),
      "utf8"
    );
    expect(matching).toContain("getAgencyTreatmentContext");
    expect(matching).toContain("getAgencyTravelDate");
    expect(matching).toContain("getAgencySelectedCity");
    expect(matching).toContain("verifyAcceptedAgencyConsent");
    expect(matching).toContain("persistAgencyQuoteRequest");

    const policy = compileAssistantPolicy({
      agencyId: "a",
      agencySlug: "demo-agency",
      sessionContext: {
        treatmentId: "dental",
        travelDateText: "soon",
        selectedCity: "izmir",
      },
    });
    expect(policy.conversationState.treatmentKnown).toBe(true);
    expect(policy.conversationState.treatmentCategory).toBe("dental");
    expect(policy.conversationState.selectedCity).toBe("izmir");

    const state = deriveFeelinHealthyState({
      quoteConsent: true,
      treatmentId: "implant",
      travelDateStart: "next week",
      selectedCity: "antalya",
      patientName: "Ada",
      patientEmail: "a@b.com",
      patientPhone: "+90",
      patientCountry: "TR",
      patientAge: 30,
      patientGender: "female",
    });
    expect(state.treatment.branch).toBe("implant");
    expect(state.location.city).toBe("antalya");
    expect(state.intake.group3Complete).toBe(true);
  });
});
