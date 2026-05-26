"use client";

import { useEffect, useState } from "react";
import { useLandingLang } from "@/lib/landing-translations";
import { ArrowRight, ChevronDown, Bot } from "lucide-react";

export default function HeroSection() {
  const { t } = useLandingLang();
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setMsgIdx((i) => (i + 1) % 3), 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="lp-hero" id="hero">
      <div className="lp-container">
        <div className="lp-hero-inner">
          <div>
            <div className="lp-hero-badge">
              <Bot size={14} />
              AI-Powered Clinic Assistant
            </div>
            <h1>{t.hero.title}</h1>
            <p className="lp-hero-subtitle">{t.hero.subtitle}</p>
            <div className="lp-hero-ctas">
              <button className="lp-btn lp-btn-primary" onClick={() => document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" })}>
                {t.hero.ctaPrimary} <ArrowRight size={18} />
              </button>
              <button className="lp-btn lp-btn-secondary" onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}>
                {t.hero.ctaSecondary} <ChevronDown size={18} />
              </button>
            </div>
          </div>

          <div className="lp-chat-mockup">
            <div className="lp-chat-header">
              <div className="lp-chat-avatar"><Bot size={18} /></div>
              <div className="lp-chat-info">
                <h4>ClinicBridge AI</h4>
                <span>Online</span>
              </div>
            </div>
            <div className="lp-chat-body" key={msgIdx}>
              <div className="lp-chat-msg user" style={{ animationDelay: "0.1s" }}>
                {t.hero.chatMessages[msgIdx]}
              </div>
              <div className="lp-chat-msg bot" style={{ animationDelay: "0.6s" }}>
                {t.hero.chatResponses[msgIdx]}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
