"use client";

import { useLandingLang } from "@/lib/landing-translations";
import { CircleDollarSign, Sparkles, SmilePlus, Calendar, MapPin, Plane } from "lucide-react";

const iconMap = {
  implant: CircleDollarSign,
  sparkle: Sparkles,
  braces: SmilePlus,
  calendar: Calendar,
  "map-pin": MapPin,
  plane: Plane,
};

export default function UseCasesSection() {
  const { t } = useLandingLang();

  return (
    <section className="lp-section" id="use-cases">
      <div className="lp-container">
        <h2 className="lp-section-title">{t.useCases.title}</h2>
        <p className="lp-section-subtitle">{t.useCases.subtitle}</p>
        <div className="lp-chips">
          {t.useCases.categories.map((cat, i) => {
            const Icon = iconMap[cat.icon as keyof typeof iconMap] || Sparkles;
            return (
              <div className="lp-chip" key={i}>
                <span className="lp-chip-icon"><Icon size={18} /></span>
                {cat.label}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
