import { describe, it, expect } from "vitest";
import {
  applyDetectedTreatmentUpdate,
  inferTreatmentFromText,
} from "../lib/agency/feelinhealthyConversationMachine";
import { normalizeTreatmentBranch } from "../lib/agency/feelinhealthyConfig";

describe("mid-chat treatment switch", () => {
  it("updates implant → saç ekimi and clears empty-match locks", () => {
    const before = {
      lastTreatmentCategory: "implant",
      pendingLocationExpansion: true,
      pendingLocationBranch: "dental",
      lastEmptyMatchKey: "dental|istanbul|european",
      lastRecommendedClinicIds: ["x"],
      leadStage: "recommendation",
    };
    const result = applyDetectedTreatmentUpdate(before, {
      message: "saç ekimi",
      extractedTreatment: "hair_transplant",
    });
    expect(result.changed).toBe(true);
    expect(normalizeTreatmentBranch(result.next)).toBe("hair_transplant");
    expect(result.ctx.lastTreatmentCategory).toBe("hair_transplant");
    expect(result.ctx.pendingLocationExpansion).toBeUndefined();
    expect(result.ctx.lastEmptyMatchKey).toBeUndefined();
    expect(result.ctx.__forceClinicMatching).toBe(true);
  });

  it("does not thrash when the same branch is restated", () => {
    const before = { lastTreatmentCategory: "implant", selectedCity: "istanbul" };
    const result = applyDetectedTreatmentUpdate(before, {
      message: "implant yaptırmak istiyorum",
    });
    expect(result.changed).toBe(false);
    expect(result.ctx.selectedCity).toBe("istanbul");
  });

  it("infers saç ekimi from bare patient reply", () => {
    expect(inferTreatmentFromText("saç ekimi")).toBe("hair_transplant");
    expect(normalizeTreatmentBranch("saç ekimi")).toBe("hair_transplant");
  });
});
