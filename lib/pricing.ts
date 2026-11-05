export const PRICING_PLANS = [
  { id: "starter", monthlyEur: 49, chatsPerMonth: 100, popular: false, cta: "start" },
  { id: "clinic", monthlyEur: 149, chatsPerMonth: 500, popular: true, cta: "buy" },
  { id: "clinicPhone", monthlyEur: 299, includedMinutes: 500, overageEurPerMinute: 0.35, popular: false, cta: "buy" },
  { id: "agency", monthlyEur: null, popular: false, cta: "contact" },
] as const;

export type PricingPlan = (typeof PRICING_PLANS)[number];
export type PricingPlanId = PricingPlan["id"];

export const PLAN_INTEREST_STORAGE_KEY = "lp-plan-interest";

export function formatEur(amount: number, lang: "tr" | "en"): string {
  const formatted = new Intl.NumberFormat(lang === "tr" ? "tr-TR" : "en-GB", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `€${formatted}`;
}

export function planInterestMessage(planName: string, lang: "tr" | "en"): string {
  return lang === "tr" ? `${planName} paketi ile ilgileniyorum` : `I'm interested in the ${planName} plan`;
}
