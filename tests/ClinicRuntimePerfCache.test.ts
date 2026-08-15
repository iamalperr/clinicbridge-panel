import { describe, it, expect, beforeEach } from "vitest";
import {
  getCachedClinicRuntime,
  setCachedClinicRuntime,
  invalidateClinicRuntimeCache,
  _clinicRuntimeCacheSize,
} from "../lib/performance/clinicRuntimeCache";
import { RequestTimer } from "../lib/performance/requestTimer";

describe("clinicRuntimeCache", () => {
  beforeEach(() => {
    invalidateClinicRuntimeCache();
  });

  it("returns null on miss and stores values on set", () => {
    expect(getCachedClinicRuntime("clinic-a")).toBeNull();
    setCachedClinicRuntime("clinic-a", {
      clinicData: { name: "A" },
      clinicName: "A",
      clinicWhatsapp: "",
      clinicTelegram: "",
      clinicLanguage: "tr",
      promptSettings: { model: "gpt-4o" },
      trainingDocs: [{ id: "1", title: "t", content: "c" }],
    });
    const hit = getCachedClinicRuntime("clinic-a");
    expect(hit?.clinicName).toBe("A");
    expect(hit?.trainingDocs).toHaveLength(1);
    expect(_clinicRuntimeCacheSize()).toBe(1);
  });

  it("expires after TTL", async () => {
    setCachedClinicRuntime(
      "clinic-b",
      {
        clinicData: {},
        clinicName: "B",
        clinicWhatsapp: "",
        clinicTelegram: "",
        clinicLanguage: "tr",
        promptSettings: null,
        trainingDocs: [],
      },
      20
    );
    expect(getCachedClinicRuntime("clinic-b")?.clinicName).toBe("B");
    await new Promise((r) => setTimeout(r, 35));
    expect(getCachedClinicRuntime("clinic-b")).toBeNull();
  });

  it("does not share entries across clinic IDs", () => {
    setCachedClinicRuntime("c1", {
      clinicData: {},
      clinicName: "One",
      clinicWhatsapp: "",
      clinicTelegram: "",
      clinicLanguage: "tr",
      promptSettings: null,
      trainingDocs: [],
    });
    expect(getCachedClinicRuntime("c2")).toBeNull();
  });
});

describe("RequestTimer", () => {
  it("records stage durations without message content", async () => {
    const timer = new RequestTimer({ clinicId: "x", conversationId: "y" });
    await timer.measure("clinic_config_load", async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    timer.start("intent_classify");
    timer.end("intent_classify", { intent: "pricing_request" });
    const snap = timer.snapshot();
    expect(snap.stages.some((s) => s.stage === "clinic_config_load")).toBe(true);
    expect(snap.stages.find((s) => s.stage === "intent_classify")?.meta?.intent).toBe(
      "pricing_request"
    );
    expect(JSON.stringify(snap)).not.toMatch(/fiyat|endodonti/i);
  });
});
