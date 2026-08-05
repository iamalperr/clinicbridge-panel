import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  parseClinicCardAction,
  routeClinicCardAction,
  handleSelectClinic,
  handleViewClinicDetails,
  prepareRequestQuote,
  buildClinicCardActionKey,
  resolveGuestQuoteClinicLimit,
  requestQuoteSuccessCopy,
  requestQuoteFailureCopy,
  resolveClinicFromPool,
} from "../lib/agency/feelinhealthyClinicCardActions";
import { resolveAssistantRole } from "../lib/agency/assistantModes";
import { FEELINHEALTHY_CONFIG } from "../lib/agency/feelinhealthyConfig";

const baseCtx = {
  sessionId: "sess-test-1",
  quoteConsent: true,
  patientName: "Yusuf Alper",
  patientAge: 34,
  patientGender: "male",
  patientEmail: "yusuf@example.com",
  patientEmailStatus: "verified_format",
  patientPhone: "+905551112233",
  patientCountry: "TR",
  lastTreatmentCategory: "implant",
  selectedCity: "istanbul",
  istanbul_side: "european",
  travelDate: "10-19 Eylül",
  lastRecommendedClinicIds: ["clinic-a", "clinic-b"],
  leadStage: "recommendation",
  selectedClinicIds: [] as string[],
};

describe("FeelinHealthy clinic card action contracts", () => {
  it("Test 1 – Continue with clinic: enters selected_clinic, never requests quote persist", () => {
    const result = handleSelectClinic({
      sessionContext: { ...baseCtx },
      clinicId: "clinic-a",
      clinicName: "BHT Clinic",
      locale: "tr",
    });

    expect(result.shouldPersistQuote).toBe(false);
    expect(result.shouldCreateNewLead).toBe(false);
    expect(result.sessionContext.leadStage).toBe("clinic_selected");
    expect(result.sessionContext.selectedClinicId).toBe("clinic-a");
    expect(result.sessionContext.conversationStage).toBe("selected_clinic");
    expect(resolveAssistantRole(result.sessionContext)).toBe("clinic_coordinator");
    expect(result.reply).toMatch(/bu klinikle devam ediyoruz/i);
    expect(result.reply).not.toMatch(/kaydedemedim|teklif talebini henüz/i);
  });

  it("Test 2 – Learn more: no selection, no quote, opens profile URL", () => {
    const before = { ...baseCtx, leadStage: "recommendation" };
    const result = handleViewClinicDetails({
      sessionContext: before,
      clinicId: "clinic-b",
      clinicName: "Hospitadent",
      clinicSlug: "hospitadent-mecidiyekoy",
      locale: "tr",
    });

    expect(result.shouldPersistQuote).toBe(false);
    expect(result.shouldCreateNewLead).toBe(false);
    expect(result.openProfileInNewTab).toBe(true);
    expect(result.profileUrl).toContain("hospitadent-mecidiyekoy");
    expect(result.sessionContext.leadStage).toBe("recommendation");
    expect(result.sessionContext.selectedClinicId).toBeUndefined();
    expect(resolveAssistantRole(result.sessionContext)).toBe("network_advisor");
    expect(result.reply).toBeUndefined();
  });

  it("Test 3b – Request quote rejected when already locked", () => {
    const result = prepareRequestQuote({
      sessionContext: {
        ...baseCtx,
        leadStage: "quote_request_created",
        quoteRequestLocked: true,
      },
      clinicId: "clinic-a",
      clinicName: "BHT Clinic",
      locale: "tr",
    });
    expect(result.shouldPersistQuote).toBe(false);
    expect(result.httpStatus).toBe(409);
    expect(result.reply).toMatch(/zaten kaydedildi/i);
  });

  it("Test 3 – Request quote: prepares persist for clicked clinic only, no coordinator switch", () => {
    const result = prepareRequestQuote({
      sessionContext: { ...baseCtx },
      clinicId: "clinic-a",
      clinicName: "BHT Clinic",
      locale: "tr",
    });

    expect(result.shouldPersistQuote).toBe(true);
    expect(result.clinicIdsForQuote).toEqual(["clinic-a"]);
    expect(result.sessionContext.__fhQuoteRequestedByCardAction).toBe(true);
    expect(resolveAssistantRole(result.sessionContext)).toBe("network_advisor");
    expect(requestQuoteSuccessCopy("tr")).toMatch(/Teklif talebiniz başarıyla oluşturuldu/);
    expect(requestQuoteSuccessCopy("tr")).toMatch(/Şimdi ne olacak/);
    expect(requestQuoteSuccessCopy("tr")).toMatch(/e-posta/);
    expect(requestQuoteSuccessCopy("tr", "İstanbul Diş Akademisi")).toContain("İstanbul Diş Akademisi");
    expect(requestQuoteFailureCopy("tr")).toMatch(/kaydedemedik/);
    expect(requestQuoteFailureCopy("tr")).not.toMatch(/Klinik seçiminizi aldım/);
  });

  it("Test 4 – Repeated click: same actionId yields noop on second route", () => {
    const payload = parseClinicCardAction({
      action: "select_clinic",
      clinicId: "clinic-a",
      actionId: "act-1",
      clinicName: "BHT",
      locale: "tr",
    })!;

    const first = routeClinicCardAction({
      payload,
      sessionContext: { ...baseCtx },
    });
    expect(first.kind).toBe("handled");
    expect(first.shouldPersistQuote).toBe(false);

    const second = routeClinicCardAction({
      payload,
      sessionContext: first.sessionContext,
    });
    expect(second.kind).toBe("noop");
    expect(second.type).toBe("noop");
    expect(second.shouldPersistQuote).toBe(false);

    const key = buildClinicCardActionKey("sess-test-1", "clinic-a", "select_clinic", "act-1");
    expect(first.sessionContext.processedClinicCardActionIds).toContain(key);
  });

  it("Test 5 – Two-clinic quote selection accepted", () => {
    const first = prepareRequestQuote({
      sessionContext: { ...baseCtx },
      clinicId: "clinic-a",
      locale: "tr",
    });
    expect(first.shouldPersistQuote).toBe(true);
    expect(first.clinicIdsForQuote).toEqual(["clinic-a"]);

    const second = prepareRequestQuote({
      sessionContext: first.sessionContext,
      clinicId: "clinic-b",
      locale: "tr",
    });
    expect(second.shouldPersistQuote).toBe(true);
    expect(second.clinicIdsForQuote?.sort()).toEqual(["clinic-a", "clinic-b"].sort());
    expect(second.clinicIdsForQuote?.length).toBeLessThanOrEqual(resolveGuestQuoteClinicLimit());
  });

  it("Test 6 – Third clinic rejected with controlled message; first two kept", () => {
    const withTwo = {
      ...baseCtx,
      selectedClinicIds: ["clinic-a", "clinic-b"],
      lastRecommendedClinicIds: ["clinic-a", "clinic-b", "clinic-c"],
    };
    const third = prepareRequestQuote({
      sessionContext: withTwo,
      clinicId: "clinic-c",
      locale: "tr",
    });

    expect(third.kind).toBe("error");
    expect(third.httpStatus).toBe(400);
    expect(third.shouldPersistQuote).toBe(false);
    expect(third.reply).toMatch(/en fazla 2 klinik/i);
    expect(third.sessionContext.selectedClinicIds).toEqual(["clinic-a", "clinic-b"]);
  });

  it("Test 7 – Copy audit: no active max-3 copy in FeelinHealthy public flow", () => {
    const demo = readFileSync(join(process.cwd(), "app/demo/feelinhealthy/page.tsx"), "utf8");
    const route = readFileSync(
      join(process.cwd(), "app/api/public/agency/[slug]/matching-chat/route.ts"),
      "utf8"
    );
    const agencyDemo = readFileSync(join(process.cwd(), "app/agency-demo/page.tsx"), "utf8");
    const config = readFileSync(join(process.cwd(), "lib/agency/feelinhealthyConfig.ts"), "utf8");

    expect(demo).not.toMatch(/En fazla 3 klinik/);
    expect(demo).not.toMatch(/up to 3 clinics/i);
    expect(demo).toMatch(/GUEST_CLINIC_LIMIT/);
    expect(demo).toContain('action: "select_clinic"');
    expect(demo).toContain('action: "view_clinic_details"');
    expect(demo).toContain('action: "request_quote"');

    expect(agencyDemo).not.toMatch(/En fazla 3 klinik/);
    expect(agencyDemo).not.toMatch(/Max 3 clinics/);

    expect(route).toContain("parseClinicCardAction");
    expect(route).toContain("routeClinicCardAction");
    expect(route).toContain("resolveClinicFromPool");
    expect(route).toContain("fullAgencyClinics");
    // Coordinator path must not claim clinic-not-found when session has a selection.
    expect(route).toContain('never claim "not found"');

    expect(config).toContain("guestVisibleClinicLimit: 2");
    expect(config).toContain("guestQuoteClinicSelectionLimit: 2");
    expect(FEELINHEALTHY_CONFIG.maxGuestClinics).toBe(2);
    expect(resolveGuestQuoteClinicLimit()).toBe(2);
  });

  it("resolves recommended clinic by id even when truncated name lookup would fail", () => {
    const pool = [
      { id: "other-1", clinicName: "Other Clinic" },
      { id: "Ab1OHdC020XOG4TWpR2r", clinicName: "BHT Clinic İstanbul Tema Hastanesi" },
    ];
    const found = resolveClinicFromPool(pool, {
      clinicId: "Ab1OHdC020XOG4TWpR2r",
      clinicName: "BHT Clinic İstanbul Tema Hastanesi",
    });
    expect(found?.id).toBe("Ab1OHdC020XOG4TWpR2r");
  });

  it("select_clinic never depends on truncated clinic list / not-found copy", () => {
    const result = routeClinicCardAction({
      payload: {
        action: "select_clinic",
        clinicId: "Ab1OHdC020XOG4TWpR2r",
        actionId: "act-bht-1",
        clinicName: "BHT Clinic İstanbul Tema Hastanesi",
        locale: "tr",
      },
      sessionContext: { ...baseCtx },
    });
    expect(result.kind).toBe("handled");
    expect(result.shouldPersistQuote).toBe(false);
    expect(result.reply).toMatch(/bu klinikle devam ediyoruz/i);
    expect(result.reply).not.toMatch(/sistemde bulunamadı/i);
  });

  it("parses legacy action types into canonical contracts", () => {
    expect(parseClinicCardAction({ type: "clinic_selected", clinicId: "c1" })?.action).toBe(
      "select_clinic"
    );
    expect(parseClinicCardAction({ type: "clinic_info", clinicId: "c1" })?.action).toBe(
      "view_clinic_details"
    );
    expect(parseClinicCardAction({ type: "lead_capture", clinicId: "c1" })?.action).toBe(
      "request_quote"
    );
  });

  it("matching-chat wires early structured routing and guest limit 2", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/public/agency/[slug]/matching-chat/route.ts"),
      "utf8"
    );
    expect(route).toContain("guestQuoteClinicSelectionLimit");
    expect(route).toContain("Do NOT auto-call persistAgencyQuoteRequest");
    expect(route).toContain("requestQuoteFailureCopy");
  });
});
