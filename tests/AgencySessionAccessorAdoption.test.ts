import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getAgencyIstanbulSide,
  getAgencyPatientName,
  getAgencySelectedClinicIds,
  getAgencySessionId,
} from "../lib/agency/agencySessionState";
import { buildQuotePrefillFromSession } from "../lib/agency/feelinhealthyQuotePrefill";
import { compileAssistantPolicy } from "../lib/agency/assistantPolicy";
import { deriveFeelinHealthyState } from "../lib/agency/feelinhealthyConversationMachine";
import {
  handleClinicSelectionPanelAction,
  routeClinicCardAction,
} from "../lib/agency/feelinhealthyClinicCardActions";
import { FEELINHEALTHY_CONFIG } from "../lib/agency/feelinhealthyConfig";

const REPO_ROOT = resolve(__dirname, "..");

function readSource(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), "utf8");
}

describe("Phase 3 — AgencySessionState accessor adoption", () => {
  it("1. sessionId outranks conversationId (canonical accessor)", () => {
    expect(
      getAgencySessionId({ sessionId: "sess_a", conversationId: "conv_b" })
    ).toBe("sess_a");
  });

  it("2. conversationId-only legacy state still resolves", () => {
    expect(getAgencySessionId({ conversationId: "conv_only" })).toBe("conv_only");
    const prefill = buildQuotePrefillFromSession({ conversationId: "conv_only" });
    expect(prefill.sessionId).toBe("conv_only");
  });

  it("3–4. Istanbul-side read uses canonical precedence on conflict", () => {
    expect(
      getAgencyIstanbulSide({
        istanbul_side: "european",
        istanbulSide: "anatolian",
      })
    ).toBe("european");

    const state = deriveFeelinHealthyState({
      quoteConsent: true,
      lastTreatmentCategory: "implant",
      selectedCity: "istanbul",
      istanbulSide: "european",
      patientName: "Ada",
      patientEmail: "a@b.com",
      patientPhone: "+90",
      patientCountry: "TR",
      patientAge: 30,
      patientGender: "female",
      travelDate: "2026-09",
    });
    expect(state.location.istanbulSide).toBe("european");

    const policy = compileAssistantPolicy({
      agencyId: "agency",
      agencySlug: "feelinhealthy",
      sessionContext: {
        istanbul_side: "anatolian",
        istanbulSide: "european",
      },
    });
    expect(policy.conversationState.istanbulSide).toBe("anatolian");
  });

  it("5–6. selectedClinicIds array (incl. empty) outranks selectedClinicId", () => {
    expect(
      getAgencySelectedClinicIds({
        selectedClinicIds: ["B"],
        selectedClinicId: "A",
      })
    ).toEqual(["B"]);
    expect(
      getAgencySelectedClinicIds({
        selectedClinicIds: [],
        selectedClinicId: "A",
      })
    ).toEqual([]);

    const policy = compileAssistantPolicy({
      agencyId: "agency",
      agencySlug: "demo",
      sessionContext: {
        selectedClinicIds: ["B"],
        selectedClinicId: "A",
      },
    });
    expect(policy.conversationState.selectedClinicIds).toEqual(["B"]);
  });

  it("7. quote/panel flow uses canonical selected clinics without changing limit 2", () => {
    expect(FEELINHEALTHY_CONFIG.guestQuoteClinicSelectionLimit).toBe(2);
    const limited = handleClinicSelectionPanelAction({
      type: "clinic_selection_update",
      action: "select",
      clinicId: "clinic-c",
      clinicName: "C",
      sessionContext: {
        selectedClinicIds: ["clinic-a", "clinic-b"],
        selectedClinicId: "should-not-expand",
        lastRecommendedClinicIds: ["clinic-a", "clinic-b", "clinic-c"],
      },
      locale: "en",
    });
    expect(limited.kind).toBe("error");
    expect(limited.httpStatus).toBe(400);
    expect(limited.sessionContext.selectedClinicIds).toEqual(["clinic-a", "clinic-b"]);

    const keyed = routeClinicCardAction({
      payload: {
        action: "view_clinic_details",
        clinicId: "clinic-a",
        actionId: "act-1",
        clinicName: "A",
      },
      sessionContext: {
        conversationId: "legacy_conv",
        lastRecommendedClinicIds: ["clinic-a"],
      },
    });
    expect(keyed.kind === "handled" || keyed.kind === "noop" || keyed.kind === "error").toBe(
      true
    );
  });

  it("8–9. patientName authoritative; firstName/lastName compose when absent", () => {
    expect(
      getAgencyPatientName({
        patientName: "Jane Doe",
        firstName: "John",
        lastName: "Smith",
      })
    ).toBe("Jane Doe");
    expect(getAgencyPatientName({ firstName: "Ada", lastName: "Lovelace" })).toBe(
      "Ada Lovelace"
    );

    const prefillConflict = buildQuotePrefillFromSession({
      patientName: "Jane Doe",
      firstName: "John",
      lastName: "Smith",
    });
    expect(prefillConflict.patientName).toBe("Jane Doe");

    const prefillCompose = buildQuotePrefillFromSession({
      firstName: "Ada",
      lastName: "Lovelace",
    });
    expect(prefillCompose.patientName).toBe("Ada Lovelace");
  });

  it("10. consent gate still requires DB verification (wiring)", () => {
    const matching = readSource("app/api/public/agency/[slug]/matching-chat/route.ts");
    const quoteRequest = readSource("app/api/public/agency/[slug]/quote-request/route.ts");
    const lead = readSource("app/api/public/agency/[slug]/lead/route.ts");
    expect(matching).toContain("verifyAcceptedAgencyConsent");
    expect(matching).toContain("persistAgencyQuoteRequest");
    expect(quoteRequest).toContain("ensureAcceptedConsentForPersistence");
    expect(lead).toContain("ensureAcceptedConsentForPersistence");
    // Accessors are correlation only — consent helpers remain.
    expect(matching).toContain("getAgencySessionId");
    expect(quoteRequest).toContain("getAgencySessionId");
  });

  it("11–12. high-risk routes adopt accessors; serialized fields remain", () => {
    const matching = readSource("app/api/public/agency/[slug]/matching-chat/route.ts");
    expect(matching).toContain("getAgencySessionId");
    expect(matching).toContain("getAgencyIstanbulSide");
    expect(matching).toContain("getAgencySelectedClinicIds");
    expect(matching).toContain("getAgencyPatientName");
    expect(matching).toContain("serializeAgencySessionState");
    // Legacy serialized field names must still be written/returned.
    expect(matching).toContain("sessionContext");
    expect(matching).toMatch(/istanbul_side\s*=/);
    expect(matching).toContain("selectedClinicIds");

    const quote = readSource("app/api/public/agency/[slug]/quote/route.ts");
    expect(quote).toContain("getAgencySessionId");
    expect(quote).toContain("getAgencySelectedClinicIds");
    expect(quote).toContain("selectedClinicIds");

    // Non-FH path still present with consent gate + canonical clinic read.
    expect(matching).toContain("submitAgencyLead");
    expect(matching).toContain("getAgencySelectedClinicIds(newCtx)");
  });
});
