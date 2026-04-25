"use client";

import { useLandingLang } from "@/lib/landing-translations";
import { Repeat, CalendarX, Clock, TrendingDown } from "lucide-react";

const iconMap = {
  repeat: Repeat,
  "calendar-x": CalendarX,
  clock: Clock,
  "trending-down": TrendingDown,
};

export default function ProblemSection() {
  const { t } = useLandingLang();

  return (
    <section className="lp-section lp-section-alt" id="problems">
      <div className="lp-container">
        <h2 className="lp-section-title">{t.problem.title}</h2>
        <div style={{ height: 48 }} />
        <div className="lp-cards-grid lp-cards-grid-4">
          {t.problem.cards.map((card, i) => {
            const Icon = iconMap[card.icon as keyof typeof iconMap] || Repeat;
            return (
              <div className="lp-card lp-problem-card" key={i}>
                <div className="lp-card-icon"><Icon size={22} /></div>
                <h3>{card.title}</h3>
                <p>{card.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
