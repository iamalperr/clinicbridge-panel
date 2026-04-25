"use client";

import { useLandingLang } from "@/lib/landing-translations";

export default function PatientJourneySection() {
  const { t } = useLandingLang();

  return (
    <section className="lp-section lp-section-alt" id="how-it-works">
      <div className="lp-container">
        <h2 className="lp-section-title">{t.journey.title}</h2>
        <div style={{ height: 48 }} />
        <div className="lp-timeline">
          {t.journey.steps.map((step, i) => (
            <div className="lp-timeline-step" key={i}>
              <div className="lp-timeline-num">{i + 1}</div>
              <div className="lp-timeline-content">
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
