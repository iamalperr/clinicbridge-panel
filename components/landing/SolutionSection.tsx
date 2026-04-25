"use client";

import { useLandingLang } from "@/lib/landing-translations";
import { Clock, Stethoscope, MessageCircle, CalendarCheck, Database, Globe } from "lucide-react";

const iconMap = {
  "clock-24": Clock,
  stethoscope: Stethoscope,
  "message-circle": MessageCircle,
  "calendar-check": CalendarCheck,
  database: Database,
  globe: Globe,
};

export default function SolutionSection() {
  const { t } = useLandingLang();

  return (
    <section className="lp-section" id="features">
      <div className="lp-container">
        <h2 className="lp-section-title">{t.solution.title}</h2>
        <p className="lp-section-subtitle">{t.solution.subtitle}</p>
        <div className="lp-cards-grid lp-cards-grid-3">
          {t.solution.features.map((f, i) => {
            const Icon = iconMap[f.icon as keyof typeof iconMap] || Clock;
            return (
              <div className="lp-card" key={i}>
                <div className="lp-card-icon"><Icon size={22} /></div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
