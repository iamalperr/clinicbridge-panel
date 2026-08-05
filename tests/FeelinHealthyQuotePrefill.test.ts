import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  appendAgentPrefillQuery,
  buildQuotePrefillFromSession,
  clearQuotePrefill,
  FEELINHEALTHY_QUOTE_PREFILL_KEY,
  loadQuotePrefill,
  saveQuotePrefill,
} from "../lib/agency/feelinhealthyQuotePrefill";

describe("FeelinHealthy quote prefill bridge", () => {
  const memory = new Map<string, string>();

  beforeEach(() => {
    memory.clear();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (k: string) => memory.get(k) ?? null,
        setItem: (k: string, v: string) => memory.set(k, v),
        removeItem: (k: string) => memory.delete(k),
      },
      location: { origin: "https://app.clinicbridge-ai.com" },
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

  it("round-trips through sessionStorage", () => {
    const prefill = buildQuotePrefillFromSession(
      { sessionId: "s1", patientName: "Ayşe", patientEmail: "a@b.com" },
      { clinicId: "c1" },
      "tr"
    );
    saveQuotePrefill(prefill);
    expect(memory.get(FEELINHEALTHY_QUOTE_PREFILL_KEY)).toBeTruthy();
    const loaded = loadQuotePrefill();
    expect(loaded?.patientName).toBe("Ayşe");
    expect(loaded?.patientEmail).toBe("a@b.com");
    clearQuotePrefill();
    expect(loadQuotePrefill()).toBeNull();
  });

  it("marks profile URLs as coming from the agent", () => {
    expect(appendAgentPrefillQuery("/agency-demo/medicalcenter/hospitadent")).toContain(
      "from=agent"
    );
    expect(appendAgentPrefillQuery("/agency-demo/medicalcenter/hospitadent")).toContain(
      "prefill=1"
    );
  });
});
