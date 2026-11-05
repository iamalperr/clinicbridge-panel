"use client";

import { useLandingLang } from "@/lib/landing-translations";
import { PRICING_PLANS, formatEur } from "@/lib/pricing";

export default function PricingFaq() {
  const { t, lang } = useLandingLang();
  const phone = PRICING_PLANS.find((plan) => plan.id === "clinicPhone");
  const minutes = phone && "includedMinutes" in phone ? String(phone.includedMinutes) : "";
  const overage = phone && "overageEurPerMinute" in phone ? formatEur(phone.overageEurPerMinute, lang) : "";

  const items = t.pricing.faq.map((item) => ({
    q: item.q,
    a: item.a.replaceAll("{minutes}", minutes).replaceAll("{overage}", overage),
  }));

  return (
    <section className="lp-section lp-section-alt" id="pricing-faq">
      <div className="lp-container lp-faq">
        <h2 className="lp-section-title">{t.pricing.faqTitle}</h2>
        <div className="lp-faq-list">
          {items.map((item) => (
            <article key={item.q}>
              <h3>{item.q}</h3>
              <p>{item.a}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
