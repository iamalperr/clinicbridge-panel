"use client";

import { useLandingLang } from "@/lib/landing-translations";
import {
  Scissors,
  Sun,
  Brain,
  Plane,
  Sparkles,
  Smile,
} from "lucide-react";

const ICON_MAP: Record<string, React.ReactNode> = {
  tooth:    <Smile    size={22} />,
  sparkles: <Sparkles size={22} />,
  scissors: <Scissors size={22} />,
  sun:      <Sun      size={22} />,
  brain:    <Brain    size={22} />,
  plane:    <Plane    size={22} />,
};

export default function ClinicTypesSection() {
  const { t } = useLandingLang();
  const { title, subtitle, cards } = t.clinicTypes;

  return (
    <section className="lp-section lp-section-alt" id="clinic-types">
      <div className="lp-container">
        <h2 className="lp-section-title">{title}</h2>
        <p className="lp-section-subtitle">{subtitle}</p>

        <div className="lp-cards-grid lp-cards-grid-3">
          {cards.map((card, i) => (
            <div key={i} className="lp-card lp-clinic-type-card">
              <div className="lp-card-icon lp-clinic-type-icon">
                {ICON_MAP[card.icon] ?? <Sparkles size={22} />}
              </div>
              <h3>{card.title}</h3>
              <p>{card.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
