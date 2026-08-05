import { describe, expect, it } from "vitest";
import {
  AGENCY_SESSION_STATE_VERSION,
  detectAgencySessionAliasConflicts,
  getAgencyClientConsentHint,
  getAgencyIstanbulSide,
  getAgencyLeadId,
  getAgencyPatientAge,
  getAgencyPatientGender,
  getAgencyPatientName,
  getAgencyRecommendedClinicIds,
  getAgencySelectedCity,
  getAgencySelectedClinicIds,
  getAgencySessionId,
  getAgencyTravelDate,
  getAgencyTreatmentContext,
  normalizeAgencySessionState,
  serializeAgencySessionState,
  type AgencySessionState,
} from "../lib/agency/agencySessionState";

describe("AgencySessionState alias precedence", () => {
  it("1. sessionId outranks conversationId", () => {
    expect(
      getAgencySessionId({
        sessionId: "sess_a",
        conversationId: "conv_b",
      })
    ).toBe("sess_a");
  });

  it("2. conversationId-only state still resolves a session ID", () => {
    expect(getAgencySessionId({ conversationId: "conv_only" })).toBe("conv_only");
    const normalized = normalizeAgencySessionState({ conversationId: "conv_only" });
    expect(normalized.sessionId).toBe("conv_only");
    expect(normalized.conversationId).toBe("conv_only");
  });

  it("3. snake_case and camelCase Istanbul-side compatibility", () => {
    expect(getAgencyIstanbulSide({ istanbul_side: "european" })).toBe("european");
    expect(getAgencyIstanbulSide({ istanbulSide: "anatolian" })).toBe("anatolian");
    const mirrored = normalizeAgencySessionState({ istanbulSide: "european" });
    expect(mirrored.istanbul_side).toBe("european");
    expect(mirrored.istanbulSide).toBe("european");
  });

  it("4. conflicting Istanbul-side aliases resolve deterministically", () => {
    const state = {
      istanbul_side: "european" as const,
      istanbulSide: "anatolian",
    };
    expect(getAgencyIstanbulSide(state)).toBe("european");
    const conflicts = detectAgencySessionAliasConflicts(state);
    expect(conflicts.some((c) => c.code === "istanbul_side_mismatch")).toBe(true);
    // Normalize must not overwrite stronger snake_case with camelCase.
    const normalized = normalizeAgencySessionState(state);
    expect(normalized.istanbul_side).toBe("european");
    expect(normalized.istanbulSide).toBe("anatolian");
  });

  it("5. patientName and firstName/lastName compatibility", () => {
    expect(getAgencyPatientName({ patientName: "Jane Doe" })).toBe("Jane Doe");
    expect(getAgencyPatientName({ firstName: "Ada", lastName: "Lovelace" })).toBe(
      "Ada Lovelace"
    );
    expect(getAgencyPatientName({ firstName: "Ada" })).toBe("Ada");
  });

  it("6. empty aliases do not erase valid names", () => {
    expect(
      getAgencyPatientName({
        patientName: "Jane Doe",
        firstName: "",
        lastName: "",
      })
    ).toBe("Jane Doe");
    expect(
      getAgencyPatientName({
        patientName: "Jane Doe",
        firstName: "John",
        lastName: "Smith",
      })
    ).toBe("Jane Doe");
    const conflicts = detectAgencySessionAliasConflicts({
      patientName: "Jane Doe",
      firstName: "John",
      lastName: "Smith",
    });
    expect(conflicts.some((c) => c.code === "patient_name_mismatch")).toBe(true);
    const normalized = normalizeAgencySessionState({
      patientName: "Jane Doe",
      firstName: "",
      lastName: "",
    });
    expect(normalized.patientName).toBe("Jane Doe");
  });

  it("7. age aliases preserve zero and valid numeric values", () => {
    expect(getAgencyPatientAge({ patientAge: 0 })).toBe(0);
    expect(getAgencyPatientAge({ age: 0 })).toBe(0);
    expect(getAgencyPatientAge({ patientAge: 42, age: 17 })).toBe(42);
    const mirrored = normalizeAgencySessionState({ age: 0 });
    expect(mirrored.patientAge).toBe(0);
    expect(mirrored.age).toBe(0);
  });

  it("8. gender aliases resolve deterministically", () => {
    expect(getAgencyPatientGender({ patientGender: "female", gender: "male" })).toBe(
      "female"
    );
    expect(getAgencyPatientGender({ gender: "male" })).toBe("male");
    const conflicts = detectAgencySessionAliasConflicts({
      patientGender: "female",
      gender: "male",
    });
    expect(conflicts.some((c) => c.code === "gender_mismatch")).toBe(true);
  });

  it("9. selectedClinicIds outranks weaker selectedClinicId", () => {
    expect(
      getAgencySelectedClinicIds({
        selectedClinicIds: ["B"],
        selectedClinicId: "A",
      })
    ).toEqual(["B"]);
    const conflicts = detectAgencySessionAliasConflicts({
      selectedClinicIds: ["B"],
      selectedClinicId: "A",
    });
    expect(conflicts.some((c) => c.code === "selected_clinic_mismatch")).toBe(true);
    // Explicit empty array is authoritative — do not invent from singleton.
    expect(
      getAgencySelectedClinicIds({
        selectedClinicIds: [],
        selectedClinicId: "A",
      })
    ).toEqual([]);
    const normalized = normalizeAgencySessionState({
      selectedClinicIds: [],
      selectedClinicId: "A",
    });
    expect(normalized.selectedClinicIds).toEqual([]);
    expect(normalized.selectedClinicId).toBe("A");
  });

  it("10. legacy single selectedClinicId remains supported", () => {
    expect(getAgencySelectedClinicIds({ selectedClinicId: "clinic_1" })).toEqual([
      "clinic_1",
    ]);
    const normalized = normalizeAgencySessionState({ selectedClinicId: "clinic_1" });
    expect(normalized.selectedClinicIds).toEqual(["clinic_1"]);
    expect(normalized.selectedClinicId).toBe("clinic_1");
  });

  it("11. recommended clinic aliases remain compatible", () => {
    expect(
      getAgencyRecommendedClinicIds({
        lastRecommendedClinicIds: ["a", "b"],
        recommendedClinicIds: ["x"],
      })
    ).toEqual(["a", "b"]);
    expect(getAgencyRecommendedClinicIds({ recommendedClinicIds: ["x", "y"] })).toEqual([
      "x",
      "y",
    ]);
    const mirrored = normalizeAgencySessionState({
      recommendedClinicIds: ["x", "y"],
    });
    expect(mirrored.lastRecommendedClinicIds).toEqual(["x", "y"]);
  });

  it("12. treatment context resolves without inventing certainty", () => {
    expect(
      getAgencyTreatmentContext({
        lastTreatmentCategory: "implant",
        lastSubTreatment: "zirconium",
        treatmentId: "implant",
      })
    ).toEqual({
      category: "implant",
      subcategory: "zirconium",
      treatmentId: "implant",
    });
    expect(getAgencyTreatmentContext({ treatmentId: "hair_transplant" })).toEqual({
      category: "hair_transplant",
      subcategory: undefined,
      treatmentId: "hair_transplant",
    });
    expect(getAgencyTreatmentContext({})).toEqual({
      category: undefined,
      subcategory: undefined,
      treatmentId: undefined,
    });
  });

  it("13. consent alias conflicts do not imply verified consent", () => {
    const hint = getAgencyClientConsentHint({
      quoteConsent: true,
      consentStatus: "rejected",
    });
    expect(hint.conflict).toBe(true);
    expect(hint.clientAcceptedHint).toBe(false);
    const conflicts = detectAgencySessionAliasConflicts({
      quoteConsent: true,
      consentStatus: "rejected",
    });
    expect(conflicts.some((c) => c.code === "consent_alias_mismatch")).toBe(true);
    // Normalize must not mirror consent acceptance.
    const normalized = normalizeAgencySessionState({
      consentStatus: "accepted",
    });
    expect(normalized.quoteConsent).toBeUndefined();
    expect(normalized.consentStatus).toBe("accepted");
  });

  it("14. unknown legacy fields still round-trip", () => {
    const state = normalizeAgencySessionState({
      conversationId: "c1",
      weirdLegacyBag: { nested: true },
      anotherFlag: "keep-me",
    });
    const serialized = serializeAgencySessionState(state);
    const again = JSON.parse(JSON.stringify(serialized)) as AgencySessionState;
    expect((again as Record<string, unknown>).weirdLegacyBag).toEqual({ nested: true });
    expect((again as Record<string, unknown>).anotherFlag).toBe("keep-me");
  });

  it("15. no API serialized field is deleted", () => {
    const input = {
      sessionId: "s1",
      conversationId: "s1",
      istanbul_side: "european" as const,
      istanbulSide: "european",
      patientName: "Ada",
      firstName: "Ada",
      lastName: "Lovelace",
      patientAge: 36,
      age: 36,
      patientGender: "female",
      gender: "female",
      selectedClinicId: "c1",
      selectedClinicIds: ["c1"],
      lastRecommendedClinicIds: ["c1"],
      recommendedClinicIds: ["c1"],
      travelDate: "2026-09-01",
      travelDateText: "September",
      travelDateStart: "2026-09-01",
      quoteConsent: false,
      consentStatus: "pending",
      leadId: "lead_1",
      leadReference: "ref_1",
      selectedCity: "istanbul",
      lastLocation: "Istanbul",
    };
    const serialized = serializeAgencySessionState(input);
    for (const key of Object.keys(input)) {
      expect(Object.prototype.hasOwnProperty.call(serialized, key)).toBe(true);
    }
  });

  it("16. existing version-1 state remains JSON-compatible", () => {
    const v1 = normalizeAgencySessionState({
      stateVersion: 1,
      sessionId: "sess_v1",
      quoteConsent: false,
      selectedClinicIds: [],
    });
    expect(v1.stateVersion).toBe(AGENCY_SESSION_STATE_VERSION);
    const json = JSON.stringify(serializeAgencySessionState(v1));
    const parsed = JSON.parse(json) as AgencySessionState;
    expect(parsed.stateVersion).toBe(1);
    expect(parsed.sessionId).toBe("sess_v1");
    expect(parsed.quoteConsent).toBe(false);
    expect(parsed.selectedClinicIds).toEqual([]);
  });

  it("travel and city accessors do not invent values", () => {
    expect(getAgencyTravelDate({ travelDateText: "next month" })).toBe("next month");
    expect(
      getAgencyTravelDate({
        travelDate: "2026-01-01",
        travelDateText: "soon",
      })
    ).toBe("2026-01-01");
    expect(getAgencySelectedCity({ lastLocation: "Istanbul Avrupa" })).toBeUndefined();
    expect(getAgencySelectedCity({ selectedCity: "istanbul" })).toBe("istanbul");
  });

  it("leadId outranks leadReference", () => {
    expect(getAgencyLeadId({ leadId: "L1", leadReference: "R1" })).toBe("L1");
    expect(getAgencyLeadId({ leadReference: "R1" })).toBe("R1");
  });
});
