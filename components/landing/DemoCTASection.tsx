"use client";

import { useState, FormEvent } from "react";
import { useLandingLang } from "@/lib/landing-translations";
import { CheckCircle, ArrowRight } from "lucide-react";

export default function DemoCTASection() {
  const { t } = useLandingLang();
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    // Frontend-only for now — backend integration later
    setSubmitted(true);
  };

  return (
    <section className="lp-section lp-demo-section" id="contact">
      <div className="lp-container">
        <h2 className="lp-section-title">{t.demo.title}</h2>
        <p className="lp-section-subtitle">{t.demo.subtitle}</p>

        <div className="lp-form-wrap">
          {submitted ? (
            <div className="lp-form-success">
              <div className="lp-form-success-icon"><CheckCircle size={28} /></div>
              <p>{t.demo.form.success}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="lp-form-grid">
                <div className="lp-form-group">
                  <label>{t.demo.form.name}</label>
                  <input type="text" placeholder={t.demo.form.namePlaceholder} required />
                </div>
                <div className="lp-form-group">
                  <label>{t.demo.form.clinic}</label>
                  <input type="text" placeholder={t.demo.form.clinicPlaceholder} required />
                </div>
                <div className="lp-form-group">
                  <label>{t.demo.form.phone}</label>
                  <input type="tel" placeholder={t.demo.form.phonePlaceholder} required />
                </div>
                <div className="lp-form-group">
                  <label>{t.demo.form.email}</label>
                  <input type="email" placeholder={t.demo.form.emailPlaceholder} required />
                </div>
                <div className="lp-form-group lp-form-full">
                  <label>{t.demo.form.website}</label>
                  <input type="url" placeholder={t.demo.form.websitePlaceholder} />
                </div>
                <div className="lp-form-group lp-form-full">
                  <label>{t.demo.form.message}</label>
                  <textarea placeholder={t.demo.form.messagePlaceholder} />
                </div>
              </div>
              <button type="submit" className="lp-btn lp-btn-primary lp-form-submit">
                {t.demo.form.submit} <ArrowRight size={18} />
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
