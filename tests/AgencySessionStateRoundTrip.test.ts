import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  AGENCY_SESSION_STATE_VERSION,
  createAgencySessionState,
  isAgencySessionState,
  mergeAgencySessionState,
  normalizeAgencySessionState,
  serializeAgencySessionState,
  type AgencySessionState,
} from "../lib/agency/agencySessionState";

const richLegacyState = {
  sessionId: "sess_legacy_1",
  leadStage: "recommendation",
  patientName: "Ada Lovelace",
  patientEmail: "ada@example.com",
  patientEmailStatus: "verified_format",
  patientPhone: "+905551112233",
  patientCountry: "TR",
  patientAge: 0,
  patientGender: "female",
  quoteConsent: false,
  consentVersion: "v1.0",
  lastTreatmentCategory: "implant",
  lastSubTreatment: "zirconium",
  lastLocation: "İstanbul Avrupa Yakası",
  selectedCity: "istanbul",
  istanbul_side: "european",
  istanbul_side_source: "structured_card",
  locationSelectionConfirmed: true,
  sideSelectionConfirmed: true,
  lastRecommendedClinicIds: ["c1", "c2"],
  selectedClinicIds: [],
  selectedClinicId: undefined,
  quoteRequestLocked: false,
  leadId: undefined,
  quoteId: undefined,
  pendingLocationExpansion: false,
  lastEmptyMatchKey: "implant|istanbul|european",
  // Unknown legacy extension — must survive.
  legacyWidgetFlag: true,
  experimentalScore: 42,
};

describe("AgencySessionState round-trip", () => {
  it("normalizes legacy unversioned state and adds stateVersion", () => {
    const normalized = normalizeAgencySessionState(richLegacyState);
    expect(normalized.stateVersion).toBe(AGENCY_SESSION_STATE_VERSION);
    expect(normalized.sessionId).toBe("sess_legacy_1");
    expect(normalized.lastTreatmentCategory).toBe("implant");
    expect(isAgencySessionState(normalized)).toBe(true);
  });

  it("serializes and round-trips without losing known fields", () => {
    const normalized = normalizeAgencySessionState(richLegacyState);
    const serialized = serializeAgencySessionState(normalized);
    const again = normalizeAgencySessionState(
      JSON.parse(JSON.stringify(serialized)) as AgencySessionState
    );

    expect(again.sessionId).toBe("sess_legacy_1");
    expect(again.patientName).toBe("Ada Lovelace");
    expect(again.patientEmail).toBe("ada@example.com");
    expect(again.patientAge).toBe(0);
    expect(again.quoteConsent).toBe(false);
    expect(again.selectedCity).toBe("istanbul");
    expect(again.istanbul_side).toBe("european");
    expect(again.lastTreatmentCategory).toBe("implant");
    expect(again.lastRecommendedClinicIds).toEqual(["c1", "c2"]);
    expect(again.selectedClinicIds).toEqual([]);
    expect(again.quoteRequestLocked).toBe(false);
    expect(again.stateVersion).toBe(AGENCY_SESSION_STATE_VERSION);
  });

  it("preserves unknown legacy fields", () => {
    const normalized = normalizeAgencySessionState(richLegacyState);
    expect((normalized as Record<string, unknown>).legacyWidgetFlag).toBe(true);
    expect((normalized as Record<string, unknown>).experimentalScore).toBe(42);
    const serialized = serializeAgencySessionState(normalized);
    expect((serialized as Record<string, unknown>).legacyWidgetFlag).toBe(true);
    expect((serialized as Record<string, unknown>).experimentalScore).toBe(42);
  });

  it("preserves explicit false values", () => {
    const state = normalizeAgencySessionState({
      quoteConsent: false,
      quoteRequestLocked: false,
      pendingLocationExpansion: false,
      locationSelectionConfirmed: false,
    });
    expect(state.quoteConsent).toBe(false);
    expect(state.quoteRequestLocked).toBe(false);
    expect(state.pendingLocationExpansion).toBe(false);
    expect(state.locationSelectionConfirmed).toBe(false);
  });

  it("does not erase current values with undefined patch fields", () => {
    const current = normalizeAgencySessionState({
      selectedCity: "antalya",
      patientName: "Kept",
      quoteConsent: true,
    });
    const merged = mergeAgencySessionState(current, {
      selectedCity: undefined,
      patientName: undefined,
      travelDate: "2026-09-01",
    });
    expect(merged.selectedCity).toBe("antalya");
    expect(merged.patientName).toBe("Kept");
    expect(merged.travelDate).toBe("2026-09-01");
    expect(merged.quoteConsent).toBe(true);
  });

  it("preserves empty arrays and zero values", () => {
    const state = normalizeAgencySessionState({
      selectedClinicIds: [],
      lastRecommendedClinicIds: [],
      patientAge: 0,
      emailValidationFails: 0,
    });
    expect(state.selectedClinicIds).toEqual([]);
    expect(state.lastRecommendedClinicIds).toEqual([]);
    expect(state.patientAge).toBe(0);
    expect(state.emailValidationFails).toBe(0);
  });

  it("preserves city, Istanbul side, treatment, intake, clinic and lock fields", () => {
    const state = serializeAgencySessionState({
      selectedCity: "istanbul",
      istanbul_side: "anatolian",
      lastTreatmentCategory: "hair_transplant",
      patientName: "Test",
      patientPhone: "555",
      patientEmail: "t@example.com",
      patientCountry: "DE",
      selectedClinicIds: ["a", "b"],
      lastRecommendedClinicIds: ["a", "b", "c"],
      quoteRequestLocked: true,
      leadId: "lead_1",
      quoteId: "quote_1",
      leadStage: "quote_request_created",
    });
    expect(state.selectedCity).toBe("istanbul");
    expect(state.istanbul_side).toBe("anatolian");
    expect(state.lastTreatmentCategory).toBe("hair_transplant");
    expect(state.patientName).toBe("Test");
    expect(state.selectedClinicIds).toEqual(["a", "b"]);
    expect(state.lastRecommendedClinicIds).toEqual(["a", "b", "c"]);
    expect(state.quoteRequestLocked).toBe(true);
    expect(state.leadId).toBe("lead_1");
    expect(state.quoteId).toBe("quote_1");
  });

  it("preserves consent-related client fields structurally without implying verified consent", () => {
    const state = serializeAgencySessionState({
      quoteConsent: true,
      consentVersion: "v1.0",
      consentStatus: "accepted",
    });
    expect(state.quoteConsent).toBe(true);
    expect(state.consentVersion).toBe("v1.0");
    expect(state.consentStatus).toBe("accepted");
    // Documentation assertion: these fields alone must never authorize writes.
    // Persistence still requires verifyAcceptedAgencyConsent (P0 gate).
    expect(state.quoteConsent === true).toBe(true);
  });

  it("JSON serialization contains no Date, function, or undefined values", () => {
    const withJunk = {
      sessionId: "sess_x",
      travelDate: "soon",
      weirdDate: new Date("2026-01-02T00:00:00.000Z"),
      fn: () => "nope",
      nested: { keep: "yes", drop: undefined as unknown },
      maybe: undefined as unknown,
    };
    const serialized = serializeAgencySessionState(withJunk);
    const json = JSON.stringify(serialized);
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect(json).not.toContain("undefined");
    expect(typeof parsed.fn).toBe("undefined");
    expect(parsed.weirdDate).toBe("2026-01-02T00:00:00.000Z");
    expect(parsed).not.toHaveProperty("maybe");
    expect((parsed.nested as Record<string, unknown>).keep).toBe("yes");
    expect(parsed.nested as Record<string, unknown>).not.toHaveProperty("drop");
  });

  it("createAgencySessionState seeds empty versioned state", () => {
    const empty = createAgencySessionState();
    expect(empty.stateVersion).toBe(AGENCY_SESSION_STATE_VERSION);
    expect(Object.keys(empty)).toEqual(["stateVersion"]);
  });

  it("null/non-object input normalizes safely", () => {
    expect(normalizeAgencySessionState(null).stateVersion).toBe(1);
    expect(normalizeAgencySessionState(undefined).stateVersion).toBe(1);
    expect(normalizeAgencySessionState("bad" as unknown as AgencySessionState).stateVersion).toBe(1);
  });
});

describe("Canonical type wiring (no duplicate SessionContext interfaces)", () => {
  it("matching-chat, agency-demo and feelinhealthy demo import agencySessionState", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/public/agency/[slug]/matching-chat/route.ts"),
      "utf8"
    );
    const agencyDemo = readFileSync(join(process.cwd(), "app/agency-demo/page.tsx"), "utf8");
    const fhDemo = readFileSync(join(process.cwd(), "app/demo/feelinhealthy/page.tsx"), "utf8");

    expect(route).toContain('from "@/lib/agency/agencySessionState"');
    expect(route).toContain("normalizeAgencySessionState");
    expect(route).toContain("serializeAgencySessionState");
    expect(route).not.toMatch(/interface SessionContext \{/);

    expect(agencyDemo).toContain('from "@/lib/agency/agencySessionState"');
    expect(agencyDemo).toContain("AgencySessionState");
    expect(agencyDemo).not.toMatch(/interface SessionContext \{/);

    expect(fhDemo).toContain('from "@/lib/agency/agencySessionState"');
    expect(fhDemo).toContain("AgencySessionState");
  });

  it("conversationHelper serializes/normalizes at persistence boundary", () => {
    const helper = readFileSync(
      join(process.cwd(), "lib/services/conversationHelper.ts"),
      "utf8"
    );
    expect(helper).toContain("serializeAgencySessionState");
    expect(helper).toContain("normalizeAgencySessionState");
  });
});
