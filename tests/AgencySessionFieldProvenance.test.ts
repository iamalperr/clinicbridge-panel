import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  compareAgencyFieldProvenance,
  detectAgencyFieldProvenanceConflicts,
  getAgencyFieldProvenance,
  normalizeAgencySessionState,
  sanitizeClientAgencyFieldProvenance,
  serializeAgencySessionState,
  setAgencyFieldProvenance,
  shouldReplaceAgencyFieldValue,
  updateAgencyFieldWithProvenance,
  type AgencyFieldProvenance,
  type AgencySessionState,
} from "../lib/agency/agencySessionState";
import { applyStructuredLocationAction } from "../lib/agency/feelinhealthyConversationMachine";
import { prepareRequestQuote } from "../lib/agency/feelinhealthyClinicCardActions";

const NOW = "2026-08-06T00:00:00.000Z";
const REPO_ROOT = resolve(__dirname, "..");

function prov(
  source: AgencyFieldProvenance["source"],
  confidence: AgencyFieldProvenance["confidence"]
): AgencyFieldProvenance {
  return { source, confidence, updatedAt: NOW };
}

describe("Phase 5 — AgencySessionState field provenance", () => {
  it("1. legacy state without provenance remains valid", () => {
    const state = normalizeAgencySessionState({
      sessionId: "s1",
      selectedCity: "istanbul",
      quoteConsent: false,
    });
    expect(state.stateVersion).toBe(1);
    expect(state.selectedCity).toBe("istanbul");
    expect(state.fieldProvenance).toBeUndefined();
  });

  it("2–3. provenance round-trips and preserves unknown valid keys", () => {
    const withProv = setAgencyFieldProvenance(
      {
        selectedCity: "istanbul",
        fieldProvenance: {
          experimentalField: prov("system_derived", "low"),
        },
      },
      "selectedCity",
      prov("structured_action", "high"),
      { now: NOW }
    );
    const serialized = serializeAgencySessionState(withProv);
    const again = normalizeAgencySessionState(
      JSON.parse(JSON.stringify(serialized)) as AgencySessionState
    );
    expect(getAgencyFieldProvenance(again, "selectedCity")?.source).toBe(
      "structured_action"
    );
    expect(getAgencyFieldProvenance(again, "experimentalField")?.source).toBe(
      "system_derived"
    );
    expect(again.selectedCity).toBe("istanbul");
  });

  it("4. malformed provenance entries are sanitized", () => {
    const state = normalizeAgencySessionState({
      selectedCity: "izmir",
      fieldProvenance: {
        selectedCity: { source: "nope", confidence: "high" },
        travelDate: { source: "user_explicit", confidence: "medium", updatedAt: NOW },
        bad: "string",
        empty: {},
      },
    });
    expect(getAgencyFieldProvenance(state, "selectedCity")).toBeUndefined();
    expect(getAgencyFieldProvenance(state, "travelDate")?.source).toBe("user_explicit");
    expect(getAgencyFieldProvenance(state, "bad")).toBeUndefined();
  });

  it("5–6. source and confidence ordering are deterministic", () => {
    expect(
      compareAgencyFieldProvenance(
        prov("backend_verified", "low"),
        prov("structured_action", "verified")
      )
    ).toBeGreaterThan(0);
    expect(
      compareAgencyFieldProvenance(prov("user_explicit", "high"), prov("user_explicit", "low"))
    ).toBeGreaterThan(0);
    expect(
      compareAgencyFieldProvenance(
        prov("structured_action", "high"),
        prov("user_explicit", "verified")
      )
    ).toBeGreaterThan(0);
    expect(
      compareAgencyFieldProvenance(prov("llm_extracted", "medium"), prov("legacy_client", "high"))
    ).toBeGreaterThan(0);
  });

  it("7. backend_verified beats llm_extracted", () => {
    const base = updateAgencyFieldWithProvenance(
      {},
      "selectedCity",
      "istanbul",
      prov("backend_verified", "verified"),
      { now: NOW }
    ).state;
    const blocked = updateAgencyFieldWithProvenance(
      base,
      "selectedCity",
      "izmir",
      prov("llm_extracted", "high"),
      { now: NOW }
    );
    expect(blocked.applied).toBe(false);
    expect(blocked.state.selectedCity).toBe("istanbul");
  });

  it("8. structured_action beats user_explicit", () => {
    expect(
      shouldReplaceAgencyFieldValue({
        field: "istanbul_side",
        currentValue: "european",
        currentProvenance: prov("user_explicit", "high"),
        nextValue: "anatolian",
        nextProvenance: prov("structured_action", "high"),
      })
    ).toBe(true);
  });

  it("9. explicit user correction can replace older user value", () => {
    const base = updateAgencyFieldWithProvenance(
      {},
      "lastTreatmentCategory",
      "implant",
      prov("user_explicit", "medium"),
      { now: NOW }
    ).state;
    const next = updateAgencyFieldWithProvenance(
      base,
      "lastTreatmentCategory",
      "hair",
      prov("user_explicit", "high"),
      { now: NOW }
    );
    expect(next.applied).toBe(true);
    expect(next.state.lastTreatmentCategory).toBe("hair");
  });

  it("10. weaker empty value cannot erase stronger non-empty value", () => {
    const base = updateAgencyFieldWithProvenance(
      {},
      "patientEmail",
      "a@b.com",
      prov("structured_action", "high"),
      { now: NOW }
    ).state;
    const erased = updateAgencyFieldWithProvenance(
      base,
      "patientEmail",
      "",
      prov("llm_extracted", "medium"),
      { now: NOW }
    );
    expect(erased.applied).toBe(false);
    expect(erased.reason).toBe("blocked_empty_erase");
    expect(erased.state.patientEmail).toBe("a@b.com");
  });

  it("11–12. client backend_verified / verified confidence claims are downgraded", () => {
    const raw = normalizeAgencySessionState({
      selectedCity: "istanbul",
      fieldProvenance: {
        selectedCity: {
          source: "backend_verified",
          confidence: "verified",
          updatedAt: NOW,
          verifiedAt: NOW,
        },
      },
    });
    const claims = detectAgencyFieldProvenanceConflicts(raw);
    expect(claims.some((c) => c.code === "client_backend_verified_claim")).toBe(true);
    expect(claims.some((c) => c.code === "client_verified_confidence_claim")).toBe(true);

    const sanitized = sanitizeClientAgencyFieldProvenance(raw);
    const p = getAgencyFieldProvenance(sanitized, "selectedCity");
    expect(p?.source).toBe("legacy_client");
    expect(p?.confidence).toBe("high");
    expect(p?.verifiedAt).toBeUndefined();
    expect(sanitized.selectedCity).toBe("istanbul");
  });

  it("13. selectedClinicIds: [] remains authoritative with provenance", () => {
    const base = updateAgencyFieldWithProvenance(
      { selectedClinicId: "A" },
      "selectedClinicIds",
      [],
      prov("structured_action", "high"),
      { now: NOW }
    ).state;
    expect(base.selectedClinicIds).toEqual([]);
    const blocked = updateAgencyFieldWithProvenance(
      base,
      "selectedClinicIds",
      ["B"],
      prov("legacy_client", "medium"),
      { now: NOW }
    );
    expect(blocked.applied).toBe(false);
    expect(blocked.state.selectedClinicIds).toEqual([]);
  });

  it("14. consent is not authorized by provenance", () => {
    const state = sanitizeClientAgencyFieldProvenance({
      quoteConsent: true,
      fieldProvenance: {
        quoteConsent: prov("backend_verified", "verified"),
      },
    });
    // Provenance sanitizer does not invent or elevate consent authorization.
    expect(state.quoteConsent).toBe(true);
    const matching = readFileSync(
      resolve(REPO_ROOT, "app/api/public/agency/[slug]/matching-chat/route.ts"),
      "utf8"
    );
    expect(matching).toContain("verifyAcceptedAgencyConsent");
    expect(matching).toContain("sanitizeClientAgencyFieldProvenance");
  });

  it("15. JSON serialization contains no Date/function/undefined", () => {
    const state = updateAgencyFieldWithProvenance(
      { travelDate: "soon" },
      "travelDate",
      "soon",
      prov("user_explicit", "high"),
      { now: NOW }
    ).state;
    const serialized = serializeAgencySessionState(state);
    const json = JSON.stringify(serialized);
    expect(json).not.toContain("undefined");
    expect(JSON.parse(json).fieldProvenance.travelDate.updatedAt).toBe(NOW);
    expect(typeof JSON.parse(json).fieldProvenance.travelDate.updatedAt).toBe("string");
  });

  it("16–18. adopted call sites stamp structured provenance; wiring intact", () => {
    const city = applyStructuredLocationAction(
      {},
      { type: "select_treatment_city", city: "antalya", actionId: "a1" }
    );
    expect(city.ctx.selectedCity).toBe("antalya");
    expect(getAgencyFieldProvenance(city.ctx, "selectedCity")?.source).toBe(
      "structured_action"
    );

    const side = applyStructuredLocationAction(
      { selectedCity: "istanbul" },
      { type: "select_istanbul_side", side: "european", actionId: "a2" }
    );
    expect(side.ctx.istanbul_side).toBe("european");
    expect(getAgencyFieldProvenance(side.ctx, "istanbul_side")?.source).toBe(
      "structured_action"
    );

    const quote = prepareRequestQuote({
      sessionContext: {
        lastRecommendedClinicIds: ["clinic-a"],
        patientEmail: "a@b.com",
        patientEmailStatus: "verified_format",
      },
      clinicId: "clinic-a",
      clinicName: "A",
      locale: "en",
    });
    expect(quote.shouldPersistQuote).toBe(true);
    expect(getAgencyFieldProvenance(quote.sessionContext, "selectedClinicIds")?.source).toBe(
      "structured_action"
    );

    // Weaker llm city cannot replace structured side/city.
    const blocked = updateAgencyFieldWithProvenance(
      side.ctx,
      "istanbul_side",
      "anatolian",
      prov("llm_extracted", "high"),
      { now: NOW }
    );
    expect(blocked.applied).toBe(false);
    expect(blocked.state.istanbul_side).toBe("european");
  });
});
