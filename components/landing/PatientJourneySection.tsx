"use client";

import { useLandingLang } from "@/lib/landing-translations";

export default function PatientJourneySection() {
  const { t, lang } = useLandingLang();

  return (
    <section className="lp-section lp-section-alt" id="how-it-works">
      <div className="lp-container">
        {/* Section header */}
        <h2 className="lp-section-title">{t.journey.title}</h2>
        <p className="lp-section-subtitle">{t.journey.subtitle}</p>

        {/* Main content: timeline + highlight card */}
        <div className="lp-journey-layout">
          {/* Timeline */}
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

          {/* Highlight card */}
          <div className="lp-journey-highlight-card">
            <div className="lp-journey-highlight-icon">
              {/* Brain / sparkle icon */}
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a4 4 0 0 1 4 4c0 .34-.04.67-.1 1A4 4 0 0 1 20 11a4 4 0 0 1-2.5 3.7V15a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4v-.3A4 4 0 0 1 4 11a4 4 0 0 1 4.1-4c-.06-.33-.1-.66-.1-1a4 4 0 0 1 4-4z"/>
                <line x1="12" y1="19" x2="12" y2="22"/>
                <line x1="9" y1="22" x2="15" y2="22"/>
              </svg>
            </div>

            <div className="lp-journey-highlight-badge">ClinicBridge One</div>

            <h3 className="lp-journey-highlight-title">
              {t.journey.highlightCard.title}
            </h3>
            <p className="lp-journey-highlight-desc">
              {t.journey.highlightCard.desc}
            </p>

            {/* Feature pills */}
            <ul className="lp-journey-highlight-pills">
              <li>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                {lang === "tr" ? "Kliniğe özel eğitim" : "Clinic-specific training"}
              </li>
              <li>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                {lang === "tr" ? "Markanıza uygun ton" : "Matches your brand tone"}
              </li>
              <li>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                {lang === "tr" ? "Dönüşüm odaklı yönlendirme" : "Conversion-focused routing"}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
