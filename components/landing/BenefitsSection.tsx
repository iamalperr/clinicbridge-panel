"use client";

import { useLandingLang } from "@/lib/landing-translations";
import { Check } from "lucide-react";

export default function BenefitsSection() {
  const { t } = useLandingLang();

  return (
    <section className="lp-section lp-section-alt" id="benefits">
      <div className="lp-container">
        <h2 className="lp-section-title">{t.benefits.title}</h2>
        <div style={{ height: 48 }} />
        <div className="lp-benefits-list">
          {t.benefits.items.map((item, i) => (
            <div className="lp-benefit-item" key={i}>
              <div className="lp-benefit-check"><Check size={16} strokeWidth={3} /></div>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
