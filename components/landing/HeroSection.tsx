"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useLandingLang } from "@/lib/landing-translations";
import { ArrowRight, ChevronDown, Bot, Globe, Phone } from "lucide-react";

export default function HeroSection() {
  const { t } = useLandingLang();
  const [msgIdx, setMsgIdx] = useState(0);
  const [clinicName, setClinicName] = useState("");
  const [website, setWebsite] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setMsgIdx((i) => (i + 1) % 3), 5000);
    return () => clearInterval(timer);
  }, []);

  async function onRequest(event: FormEvent) {
    event.preventDefault();
    const websiteOk = website.trim().length > 2;
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!clinicName.trim() || !websiteOk || !emailOk || !consent) {
      setError(t.hero.requestInvalid);
      return;
    }
    setError("");
    try {
      const response = await fetch("/api/public/preview-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicName, website, email, phone, consent }),
      });
      if (response.status === 429) {
        setError(t.hero.requestLimited);
        return;
      }
      if (!response.ok) {
        setError(response.status >= 500 ? t.hero.requestUnavailable : t.hero.requestInvalid);
        return;
      }
      setSubmitted(true);
    } catch {
      setError(t.hero.requestUnavailable);
    }
  }

  return (
    <section className="lp-hero" id="hero">
      <div className="lp-container">
        <div className="lp-hero-inner">
          <div>
            <div className="lp-hero-badge">
              <Bot size={14} />
              {t.hero.badge}
            </div>
            <h1>{t.hero.title}</h1>
            <p className="lp-hero-subtitle">{t.hero.subtitle}</p>
            <div className="lp-hero-channels" aria-label="ClinicBridge AI solutions">
              <span className="lp-hero-channel">
                <Globe size={14} />
                {t.hero.channelWeb}
              </span>
              <span className="lp-hero-channel">
                <Phone size={14} />
                {t.hero.channelPhone}
              </span>
            </div>
            <div className="lp-hero-actions">
              <Link className="lp-btn lp-btn-primary" href="/onizleme/demo">
                {t.hero.sampleCta} <ArrowRight size={18} />
              </Link>
              {submitted ? (
                <p className="lp-scan-progress" role="status">{t.hero.requestSuccess}</p>
              ) : (
                <form className="lp-request-form" onSubmit={onRequest}>
                  <p className="lp-scan-label">{t.hero.requestTitle}</p>
                  <input className="lp-scan-input" name="clinicName" required autoComplete="organization" placeholder={t.hero.requestClinic} aria-label={t.hero.requestClinic} value={clinicName} onChange={(event) => setClinicName(event.target.value)} />
                  <input className="lp-scan-input" name="website" type="text" inputMode="url" autoComplete="url" autoCapitalize="none" spellCheck={false} required placeholder={t.hero.requestWebsite} aria-label={t.hero.requestWebsite} value={website} onChange={(event) => setWebsite(event.target.value)} />
                  <input className="lp-scan-input" name="email" type="email" autoComplete="email" required placeholder={t.hero.requestEmail} aria-label={t.hero.requestEmail} value={email} onChange={(event) => setEmail(event.target.value)} />
                  <input className="lp-scan-input" name="phone" type="tel" autoComplete="tel" placeholder={t.hero.requestPhone} aria-label={t.hero.requestPhone} value={phone} onChange={(event) => setPhone(event.target.value)} />
                  <label className="lp-request-consent">
                    <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                    <span>{t.hero.requestConsent}</span>
                  </label>
                  {error ? <p className="lp-scan-error">{error}</p> : null}
                  <button type="submit" className="lp-btn lp-btn-secondary">{t.hero.requestSubmit}</button>
                </form>
              )}
            </div>
            <div className="lp-hero-ctas">
              <button
                type="button"
                className="lp-btn lp-btn-secondary"
                onClick={() => document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" })}
              >
                {t.hero.ctaPrimary}
              </button>
              <button
                type="button"
                className="lp-btn lp-btn-secondary"
                onClick={() => document.getElementById("products")?.scrollIntoView({ behavior: "smooth" })}
              >
                {t.hero.ctaSecondary} <ChevronDown size={18} />
              </button>
            </div>
          </div>

          <div className="lp-hero-previews">
            <div className="lp-chat-mockup">
              <div className="lp-chat-header">
                <div className="lp-chat-avatar">
                  <Globe size={18} />
                </div>
                <div className="lp-chat-info">
                  <h4>{t.hero.channelWeb}</h4>
                  <span>Online</span>
                </div>
              </div>
              <div className="lp-chat-body" key={`web-${msgIdx}`}>
                <div className="lp-chat-msg user" style={{ animationDelay: "0.1s" }}>
                  {t.hero.chatMessages[msgIdx]}
                </div>
                <div className="lp-chat-msg bot" style={{ animationDelay: "0.6s" }}>
                  {t.hero.chatResponses[msgIdx]}
                </div>
              </div>
            </div>

            <div className="lp-phone-mockup">
              <div className="lp-chat-header">
                <div className="lp-chat-avatar">
                  <Phone size={18} />
                </div>
                <div className="lp-chat-info">
                  <h4>{t.hero.channelPhone}</h4>
                  <span>{t.hero.phoneStatus}</span>
                </div>
              </div>
              <div className="lp-phone-body" key={`phone-${msgIdx}`}>
                <p className="lp-phone-caller">{t.hero.phoneCaller}</p>
                <p className="lp-phone-line" style={{ animationDelay: "0.2s" }}>
                  {t.hero.phoneLines[msgIdx]}
                </p>
                <div className="lp-phone-wave" aria-hidden>
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
