"use client";

import { useState } from "react";
import { useLandingLang, LandingLanguage } from "@/lib/landing-translations";
import { Menu, X } from "lucide-react";

export default function LandingHeader() {
  const { lang, setLang, t } = useLandingLang();
  const [mobileOpen, setMobileOpen] = useState(false);

  const scrollTo = (id: string) => {
    setMobileOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const langs: LandingLanguage[] = ["tr", "en"];

  return (
    <>
      <header className="lp-header" id="lp-header">
        <div className="lp-header-inner">
          <a href="#" className="lp-logo" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
            <div className="lp-logo-icon" aria-hidden="true">
              <span>CB</span>
            </div>
            <span className="lp-logo-text">
              <span className="lp-logo-clinic">Clinic</span>
              <span className="lp-logo-bridge">Bridge</span>
              <span className="lp-logo-ai">AI</span>
            </span>
          </a>

          <nav className="lp-nav">
            <a href="#features" onClick={(e) => { e.preventDefault(); scrollTo("features"); }}>{t.nav.features}</a>
            <a href="#how-it-works" onClick={(e) => { e.preventDefault(); scrollTo("how-it-works"); }}>{t.nav.howItWorks}</a>
            <a href="#benefits" onClick={(e) => { e.preventDefault(); scrollTo("benefits"); }}>{t.nav.benefits}</a>
            <a href="#contact" onClick={(e) => { e.preventDefault(); scrollTo("contact"); }}>{t.nav.contact}</a>
          </nav>

          <div className="lp-header-actions">
            <div className="lp-lang-switch">
              {langs.map((l) => (
                <button key={l} className={`lp-lang-btn${lang === l ? " active" : ""}`} onClick={() => setLang(l)}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <button className="lp-btn lp-btn-primary" style={{ padding: "10px 24px", fontSize: 14 }} onClick={() => scrollTo("contact")}>
              {t.nav.requestDemo}
            </button>
            <button className="lp-mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu">
              {mobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </header>

      <div className={`lp-mobile-menu${mobileOpen ? " open" : ""}`}>
        <a href="#features" onClick={(e) => { e.preventDefault(); scrollTo("features"); }}>{t.nav.features}</a>
        <a href="#how-it-works" onClick={(e) => { e.preventDefault(); scrollTo("how-it-works"); }}>{t.nav.howItWorks}</a>
        <a href="#benefits" onClick={(e) => { e.preventDefault(); scrollTo("benefits"); }}>{t.nav.benefits}</a>
        <a href="#contact" onClick={(e) => { e.preventDefault(); scrollTo("contact"); }}>{t.nav.contact}</a>
        <button className="lp-btn lp-btn-primary" onClick={() => scrollTo("contact")}>{t.nav.requestDemo}</button>
      </div>
    </>
  );
}
