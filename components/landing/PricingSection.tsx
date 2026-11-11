"use client";

import { useRouter } from "next/navigation";
import { useLandingLang } from "@/lib/landing-translations";
import {
  PLAN_INTEREST_STORAGE_KEY,
  PRICING_PLANS,
  formatEur,
  planInterestMessage,
  type PricingPlan,
} from "@/lib/pricing";

const SIGNUP_URL = "https://app.clinicbridge-ai.com/kayit";

function fill(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), template);
}

function planFeatures(plan: PricingPlan, features: ReturnType<typeof useLandingLang>["t"]["pricing"]["features"], lang: "tr" | "en") {
  if (plan.id === "starter") {
    return [features.webChat, fill(features.monthlyChats, { count: String(plan.chatsPerMonth) }), features.panel];
  }
  if (plan.id === "clinic") {
    return [
      features.webChatWhatsapp,
      fill(features.monthlyChats, { count: String(plan.chatsPerMonth) }),
      features.allLanguages,
      features.appointmentDelivery,
      features.weeklyReport,
    ];
  }
  if (plan.id === "clinicPhone") {
    return [
      features.everythingInClinic,
      features.phoneAssistant,
      fill(features.includedMinutes, { count: String(plan.includedMinutes) }),
      fill(features.overage, { price: formatEur(plan.overageEurPerMinute, lang) }),
      features.setup,
    ];
  }
  return [features.agencyScope, features.agencySetup];
}

export default function PricingSection() {
  const { t, lang } = useLandingLang();
  const router = useRouter();

  const choose = (plan: PricingPlan, planName: string) => {
    if (plan.trialEligible) {
      window.location.href = SIGNUP_URL;
      return;
    }
    const message = planInterestMessage(planName, lang);
    sessionStorage.setItem(PLAN_INTEREST_STORAGE_KEY, message);
    const contact = document.getElementById("contact");
    if (contact) {
      window.dispatchEvent(new CustomEvent("lp-plan-interest", { detail: message }));
      contact.scrollIntoView({ behavior: "smooth" });
      return;
    }
    router.push("/#contact");
  };

  return (
    <section className="lp-section" id="pricing">
      <div className="lp-container">
        <h2 className="lp-section-title">{t.pricing.title}</h2>
        <p className="lp-section-subtitle">{t.pricing.subtitle}</p>
        <p className="lp-pricing-canonical">
          <a href="/fiyatlandirma">{lang === "en" ? "Full pricing page" : "Detaylı fiyatlandırma sayfası"}</a>
        </p>
        <div className="lp-pricing-grid">
          {PRICING_PLANS.map((plan) => {
            const name = t.pricing.names[plan.id];
            const cta = plan.cta === "start" || plan.cta === "buy" ? (plan.trialEligible ? t.pricing.ctaStart : t.pricing.ctaBuy) : t.pricing.ctaContact;
            return (
              <article className={`lp-card lp-pricing-card${plan.popular ? " lp-pricing-card-popular" : ""}`} key={plan.id}>
                {plan.trialEligible ? (
                  <p className="lp-pricing-badge lp-pricing-badge-trial">{t.pricing.trialBadge}</p>
                ) : plan.popular ? (
                  <p className="lp-pricing-badge">{t.pricing.popular}</p>
                ) : (
                  <p className="lp-pricing-badge lp-pricing-badge-spacer" aria-hidden="true" />
                )}
                {plan.popular && plan.trialEligible ? <p className="lp-pricing-popular-tag">{t.pricing.popular}</p> : null}
                <h3>{name}</h3>
                <p className="lp-pricing-price">
                  {plan.monthlyEur == null ? t.pricing.customPrice : formatEur(plan.monthlyEur, lang)}
                  {plan.monthlyEur != null ? <span> {t.pricing.perMonth}</span> : null}
                </p>
                <ul>
                  {planFeatures(plan, t.pricing.features, lang).map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <button type="button" className={`lp-btn ${plan.popular ? "lp-btn-primary" : "lp-btn-secondary"} lp-pricing-cta`} onClick={() => choose(plan, name)}>
                  {cta}
                </button>
              </article>
            );
          })}
        </div>
        <p className="lp-pricing-note">{t.pricing.note}</p>
      </div>
    </section>
  );
}
