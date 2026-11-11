/**
 * Self-serve signup always starts a 14-day `trial` clinic (see /api/public/signup).
 * Badge applies to the three priced packages that funnel into that trial — not custom agency.
 */
export const PRICING_PLANS = [
  { id: "starter", monthlyEur: 49, chatsPerMonth: 100, popular: false, cta: "start", trialEligible: true },
  { id: "clinic", monthlyEur: 149, chatsPerMonth: 500, popular: true, cta: "buy", trialEligible: true },
  { id: "clinicPhone", monthlyEur: 299, includedMinutes: 500, overageEurPerMinute: 0.35, popular: false, cta: "buy", trialEligible: true },
  { id: "agency", monthlyEur: null, popular: false, cta: "contact", trialEligible: false },
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

export type SignupPlan = "trial" | "baslangic" | "klinik" | "klinik_telefon";

/** Trial uses the Klinik package chat allowance until a paid plan is chosen. */
export function chatsPerMonthForSignupPlan(plan: SignupPlan): number {
  const starter = PRICING_PLANS.find((item) => item.id === "starter");
  const clinic = PRICING_PLANS.find((item) => item.id === "clinic");
  const starterChats = starter && "chatsPerMonth" in starter ? starter.chatsPerMonth : 100;
  const clinicChats = clinic && "chatsPerMonth" in clinic ? clinic.chatsPerMonth : 500;
  return plan === "baslangic" ? starterChats : clinicChats;
}
