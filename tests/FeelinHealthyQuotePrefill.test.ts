import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  appendAgentPrefillQuery,
  buildQuotePrefillFromSession,
  clearQuotePrefill,
  decodePrefillPayload,
  FEELINHEALTHY_QUOTE_PREFILL_KEY,
  loadQuotePrefill,
  saveQuotePrefill,
} from "../lib/agency/feelinhealthyQuotePrefill";

describe("FeelinHealthy quote prefill bridge", () => {
  const localMemory = new Map<string, string>();
  const sessionMemory = new Map<string, string>();

  beforeEach(() => {
    localMemory.clear();
    sessionMemory.clear();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => localMemory.get(k) ?? null,
        setItem: (k: string, v: string) => localMemory.set(k, v),
        removeItem: (k: string) => localMemory.delete(k),
      },
      sessionStorage: {
        getItem: (k: string) => sessionMemory.get(k) ?? null,
        setItem: (k: string, v: string) => sessionMemory.set(k, v),
        removeItem: (k: string) => sessionMemory.delete(k),
      },
      location: { origin: "https://app.clinicbridge-ai.com", search: "" },
      btoa: (s: string) => Buffer.from(s, "binary").toString("base64"),
      atob: (s: string) => Buffer.from(s, "base64").toString("binary"),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds prefill from agent session context", () => {
    const prefill = buildQuotePrefillFromSession(
      {
        sessionId: "sess-1",
        patientName: "Alper Özgül",
        patientEmail: "alper@example.com",
        patientPhone: "+905551112233",
        patientCountry: "TR",
        lastTreatmentCategory: "implant",
        selectedCity: "istanbul",
        istanbul_side: "european",
        travelDate: "10-19 Eylül",
      },
      {
        clinicId: "HXMlMPZ74AXkXoR4sEnH",
        clinicName: "Hospitadent Mecidiyeköy",
        clinicSlug: "hospitadent-dental-group-mecidiyekoy",
      },
      "tr"
    );

    expect(prefill.patientName).toBe("Alper Özgül");
    expect(prefill.patientEmail).toBe("alper@example.com");
    expect(prefill.clinicId).toBe("HXMlMPZ74AXkXoR4sEnH");
    expect(prefill.treatmentCategory).toBe("implant");
    expect(prefill.istanbulSide).toBe("european");
  });

  it("round-trips through localStorage (cross-tab safe)", () => {
    const prefill = buildQuotePrefillFromSession(
      { sessionId: "s1", patientName: "Ayşe", patientEmail: "a@b.com" },
      { clinicId: "c1" },
      "tr"
    );
    saveQuotePrefill(prefill);
    expect(localMemory.get(FEELINHEALTHY_QUOTE_PREFILL_KEY)).toBeTruthy();
    expect(sessionMemory.get(FEELINHEALTHY_QUOTE_PREFILL_KEY)).toBeTruthy();
    const loaded = loadQuotePrefill();
    expect(loaded?.patientName).toBe("Ayşe");
    expect(loaded?.patientEmail).toBe("a@b.com");
    clearQuotePrefill();
    expect(loadQuotePrefill()).toBeNull();
  });

  it("encodes patient fields into profile URL for new-tab opens", () => {
    const prefill = buildQuotePrefillFromSession(
      { sessionId: "s1", patientName: "Ayşe Yılmaz", patientEmail: "a@b.com", patientPhone: "555" },
      { clinicId: "c1", clinicSlug: "hospitadent" },
      "tr"
    );
    const url = appendAgentPrefillQuery("/agency-demo/medicalcenter/hospitadent", prefill);
    expect(url).toContain("from=agent");
    expect(url).toContain("prefill=1");
    expect(url).toContain("cbp=");

    const cbp = new URL(url, "https://app.clinicbridge-ai.com").searchParams.get("cbp");
    const decoded = decodePrefillPayload(cbp);
    expect(decoded?.patientName).toBe("Ayşe Yılmaz");
    expect(decoded?.patientEmail).toBe("a@b.com");
  });

  it("loads prefill from URL even when storage is empty (new tab)", () => {
    const prefill = buildQuotePrefillFromSession(
      { sessionId: "s9", patientName: "Can", patientEmail: "can@x.com", patientCountry: "TR" },
      { clinicId: "c9" },
      "tr"
    );
    const url = appendAgentPrefillQuery("/agency-demo/medicalcenter/x", prefill);
    const search = new URL(url, "https://app.clinicbridge-ai.com").search;
    // Simulate a fresh tab: empty storage, only URL.
    localMemory.clear();
    sessionMemory.clear();
    const loaded = loadQuotePrefill(search);
    expect(loaded?.patientName).toBe("Can");
    expect(loaded?.patientEmail).toBe("can@x.com");
    // Mirrored into localStorage for subsequent modal opens.
    expect(localMemory.get(FEELINHEALTHY_QUOTE_PREFILL_KEY)).toBeTruthy();
  });
});
