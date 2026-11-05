import { describe, expect, it } from "vitest";
import { PRICING_PLANS, formatEur, planInterestMessage } from "../lib/pricing";

describe("pricing source", () => {
  it("keeps the four package amounts in one place", () => {
    expect(PRICING_PLANS.map((plan) => plan.monthlyEur)).toEqual([49, 149, 299, null]);
    const phone = PRICING_PLANS.find((plan) => plan.id === "clinicPhone");
    expect(phone && "overageEurPerMinute" in phone ? phone.overageEurPerMinute : null).toBe(0.35);
    expect(phone && "includedMinutes" in phone ? phone.includedMinutes : null).toBe(500);
  });

  it("formats euro amounts and the demo-form interest line", () => {
    expect(formatEur(0.35, "tr")).toBe("€0,35");
    expect(formatEur(49, "en")).toBe("€49");
    expect(planInterestMessage("Klinik", "tr")).toBe("Klinik paketi ile ilgileniyorum");
  });
});
