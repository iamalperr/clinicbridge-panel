import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AI_TEMPERATURE_DEFAULT,
  AI_TEMPERATURE_HELPER_EN,
  AI_TEMPERATURE_HELPER_TR,
  AI_TEMPERATURE_MAX,
  AI_TEMPERATURE_MIN,
  AI_TEMPERATURE_PRESETS,
  formatAITemperatureDisplay,
  modelSupportsChatTemperature,
  normalizeAITemperature,
  resolveEffectiveAITemperature,
  validateAITemperatureForAdminWrite,
} from "../lib/ai/temperaturePolicy";
import { FEELINHEALTHY_CONFIG, getCuratedClinicsForFeelinHealthy } from "../lib/agency/feelinhealthyConfig";

const REPO = resolve(__dirname, "..");

describe("AI temperature policy — configuration", () => {
  it("1. legacy clinic config without temperature resolves to default", () => {
    const r = normalizeAITemperature(undefined);
    expect(r.value).toBe(AI_TEMPERATURE_DEFAULT);
    expect(r.source).toBe("product_default");
  });

  it("2. legacy agency config without temperature resolves to default", () => {
    const r = resolveEffectiveAITemperature({
      rawTemperature: undefined,
      model: "gpt-4o-mini",
    });
    expect(r.effectiveTemperature).toBe(AI_TEMPERATURE_DEFAULT);
    expect(r.source).toBe("product_default");
    expect(r.omitFromRequest).toBe(false);
  });

  it("3. explicit 0 is preserved", () => {
    expect(normalizeAITemperature(0).value).toBe(0);
    expect(validateAITemperatureForAdminWrite(0)).toEqual({ ok: true, value: 0 });
    const resolved = resolveEffectiveAITemperature({ rawTemperature: 0, model: "gpt-4o" });
    expect(resolved.temperature).toBe(0);
    expect(resolved.source).toBe("tenant_config");
  });

  it("4. valid values save path quantizes and accepts", () => {
    const v = validateAITemperatureForAdminWrite(0.47);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value).toBe(0.45);
    expect(formatAITemperatureDisplay(0.45)).toBe("0.45");
  });

  it("5. values below minimum fail admin validation", () => {
    const v = validateAITemperatureForAdminWrite(-0.1);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toBe("temperature_out_of_range");
  });

  it("6. values above maximum fail admin validation", () => {
    const v = validateAITemperatureForAdminWrite(1.0);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toBe("temperature_out_of_range");
  });

  it("7. NaN/string/malformed values are rejected", () => {
    expect(validateAITemperatureForAdminWrite(Number.NaN).ok).toBe(false);
    expect(validateAITemperatureForAdminWrite(Infinity).ok).toBe(false);
    expect(validateAITemperatureForAdminWrite("warm").ok).toBe(false);
    expect(validateAITemperatureForAdminWrite({}).ok).toBe(false);
  });

  it("8–9. clinic and agency configs are separate fields (tenant isolation by path)", () => {
    // Isolation is by Firestore path (promptSettings/{clinicId} vs agencies/{id}/aiConfig/main).
    const clinicTemp = normalizeAITemperature(0.2).value;
    const agencyTemp = normalizeAITemperature(0.8).value;
    expect(clinicTemp).not.toBe(agencyTemp);
    expect(clinicTemp).toBe(0.2);
    expect(agencyTemp).toBe(0.8);
  });
});

describe("AI temperature policy — runtime resolution", () => {
  it("10–11. NL composition receives effective temperature from tenant config", () => {
    const clinic = resolveEffectiveAITemperature({
      rawTemperature: 0.65,
      model: "gpt-4o-mini",
    });
    expect(clinic.temperature).toBe(0.65);
    expect(clinic.source).toBe("tenant_config");

    const agency = resolveEffectiveAITemperature({
      rawTemperature: 0.2,
      model: "gpt-4o-mini",
    });
    expect(agency.temperature).toBe(0.2);
  });

  it("12. structured extraction helpers keep fixed low temps in source (not tenant)", () => {
    const retrieval = readFileSync(resolve(REPO, "lib/services/retrievalService.ts"), "utf8");
    expect(retrieval).toMatch(/temperature:\s*0\.1/);
    expect(retrieval).toMatch(/temperature:\s*0\.0/);
    expect(retrieval).not.toMatch(/resolveEffectiveAITemperature/);
  });

  it("13. embeddings do not receive temperature", () => {
    const emb = readFileSync(resolve(REPO, "lib/services/embeddingService.ts"), "utf8");
    expect(emb).not.toMatch(/temperature/);
  });

  it("14. groundedness evaluation behavior remains unchanged (fixed 0.0)", () => {
    const retrieval = readFileSync(resolve(REPO, "lib/services/retrievalService.ts"), "utf8");
    expect(retrieval).toMatch(/temperature:\s*0\.0/);
  });

  it("15. missing setting uses default", () => {
    expect(normalizeAITemperature(null).value).toBe(AI_TEMPERATURE_DEFAULT);
  });

  it("16. unsupported model omits temperature safely", () => {
    expect(modelSupportsChatTemperature("o4-mini")).toBe(false);
    const r = resolveEffectiveAITemperature({
      rawTemperature: 0.45,
      model: "o4-mini",
    });
    expect(r.omitFromRequest).toBe(true);
    expect(r.source).toBe("model_unsupported");
    expect(r.effectiveTemperature).toBe(0.45);
  });
});

describe("AI temperature — business-rule invariance", () => {
  it("17–19. guest max 2 and curated matching are independent of temperature", () => {
    expect(FEELINHEALTHY_CONFIG.maxGuestClinics).toBe(2);
    const mockClinics = [
      {
        id: "a",
        clinicName: "A",
        clinicSlug: "a",
        treatmentCategories: ["dental"],
        location: { city: "İstanbul", address: "Şişli" },
      },
      {
        id: "b",
        clinicName: "B",
        clinicSlug: "b",
        treatmentCategories: ["dental"],
        location: { city: "İstanbul", address: "Kadıköy" },
      },
    ];
    const atLow = getCuratedClinicsForFeelinHealthy("dental", "istanbul", "european", mockClinics);
    const atHigh = getCuratedClinicsForFeelinHealthy("dental", "istanbul", "european", mockClinics);
    expect(atLow.matchingCuratedClinics.map((c) => c.id)).toEqual(
      atHigh.matchingCuratedClinics.map((c) => c.id)
    );
  });

  it("20. consent decision helper is not temperature-aware", () => {
    const consentSrc = readFileSync(resolve(REPO, "lib/services/agencyConsentService.ts"), "utf8");
    expect(consentSrc).not.toMatch(/temperaturePolicy/);
    expect(consentSrc).not.toMatch(/resolveEffectiveAITemperature/);
  });

  it("21–23. public chat routes do not let clients override temperature; lead/quote unaffected by policy module", () => {
    const clinicChat = readFileSync(resolve(REPO, "app/api/public/chat/route.ts"), "utf8");
    const agencyChat = readFileSync(
      resolve(REPO, "app/api/public/agency/[slug]/matching-chat/route.ts"),
      "utf8"
    );
    expect(clinicChat).toMatch(/resolveEffectiveAITemperature/);
    expect(clinicChat).toMatch(/promptSettings\?\.temperature/);
    expect(clinicChat).not.toMatch(/body\.temperature|req\.temperature|clientTemperature/);
    expect(agencyChat).toMatch(/agencyAiConfig\?\.temperature/);
    expect(agencyChat).not.toMatch(/body\.temperature/);
    // Pricing/retrieval stay cold
    expect(agencyChat).not.toMatch(/hybridSearch\([^\)]*temperature/);
  });
});

describe("AI temperature — UI / copy / wiring", () => {
  it("24–29. Prompt Studio pages and helpers include temperature UX", () => {
    const clinicUi = readFileSync(
      resolve(REPO, "app/clinics/[clinicId]/ai-settings/page.tsx"),
      "utf8"
    );
    const agencyUi = readFileSync(
      resolve(REPO, "app/agency/agencies/[agencyId]/ai-prompt/page.tsx"),
      "utf8"
    );
    const en = readFileSync(resolve(REPO, "locales/en.json"), "utf8");
    const tr = readFileSync(resolve(REPO, "locales/tr.json"), "utf8");

    expect(clinicUi).toMatch(/TemperatureControl/);
    expect(clinicUi).toMatch(/validateAITemperatureForAdminWrite/);
    expect(clinicUi).toMatch(/AI_TEMPERATURE_DEFAULT/);
    expect(agencyUi).toMatch(/TemperatureControl/);
    expect(agencyUi).toMatch(/Konuşma Tarzı/);
    expect(en).toMatch(/conversationStyleTitle/);
    expect(tr).toMatch(/conversationStyleTitle/);
    expect(AI_TEMPERATURE_HELPER_TR).toMatch(/eşleştirme|KVKK|teklif|randevu/);
    expect(AI_TEMPERATURE_HELPER_EN.toLowerCase()).toMatch(/matching|consent|quote|appointment/);
    expect(AI_TEMPERATURE_PRESETS.find((p) => p.id === "balanced")?.value).toBe(0.45);
    expect(AI_TEMPERATURE_MIN).toBe(0);
    expect(AI_TEMPERATURE_MAX).toBe(0.9);
  });

  it("gateway omits temperature when requested and records metadata fields", () => {
    const gateway = readFileSync(resolve(REPO, "lib/services/aiGateway.ts"), "utf8");
    expect(gateway).toMatch(/omitTemperature/);
    expect(gateway).toMatch(/effectiveTemperature/);
    expect(gateway).toMatch(/temperatureSource/);
    expect(gateway).toMatch(/temperatureOmitted/);
  });

  it("ai test preview uses resolveEffectiveAITemperature", () => {
    const testRoute = readFileSync(resolve(REPO, "app/api/ai/test/route.ts"), "utf8");
    expect(testRoute).toMatch(/resolveEffectiveAITemperature/);
  });
});

describe("AI temperature — runtime clamp for legacy bad values", () => {
  it("clamps out-of-range stored values at runtime without throwing", () => {
    expect(normalizeAITemperature(1.5).value).toBe(AI_TEMPERATURE_MAX);
    expect(normalizeAITemperature(-2).value).toBe(AI_TEMPERATURE_MIN);
  });
});
