"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLandingLang } from "@/lib/landing-translations";
import { ArrowRight, ChevronDown, Bot, Globe, Phone } from "lucide-react";

export default function HeroSection() {
  const { t } = useLandingLang();
  const router = useRouter();
  const [msgIdx, setMsgIdx] = useState(0);
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState<"idle" | "reading" | "extracting">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setMsgIdx((i) => (i + 1) % 3), 5000);
    return () => clearInterval(timer);
  }, []);

  async function onScan(event: FormEvent) {
    event.preventDefault();
    setError("");
    setStage("reading");
    try {
      const response = await fetch("/api/public/preview/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("ndjson")) {
        const payload = await response.json().catch(() => ({}));
        setStage("idle");
        setError(payload.error === "rate_limited" ? t.hero.scanLimited : t.hero.scanInvalid);
        return;
      }
      const reader = response.body?.getReader();
      if (!reader) {
        setStage("idle");
        setError(t.hero.scanInvalid);
        return;
      }
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const scanEvent = JSON.parse(line) as { stage?: string; previewId?: string; error?: string };
          if (scanEvent.stage === "reading") setStage("reading");
          if (scanEvent.stage === "extracting") setStage("extracting");
          if (scanEvent.stage === "done" && scanEvent.previewId) {
            router.push(`/onizleme/${scanEvent.previewId}`);
            return;
          }
          if (scanEvent.stage === "error") {
            setStage("idle");
            setError(
              scanEvent.error === "empty"
                ? t.hero.scanEmpty
                : scanEvent.error === "unavailable"
                  ? t.hero.scanUnavailable
                  : t.hero.scanInvalid
            );
            return;
          }
        }
      }
      setStage("idle");
      setError(t.hero.scanInvalid);
    } catch {
      setStage("idle");
      setError(t.hero.scanInvalid);
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
            <form className="lp-scan-form" onSubmit={onScan}>
              <label className="lp-scan-label" htmlFor="clinic-site-url">{t.hero.scanLabel}</label>
              {stage === "idle" ? (
                <div className="lp-scan-row">
                  <input
                    id="clinic-site-url"
                    className="lp-scan-input"
                    type="url"
                    inputMode="url"
                    required
                    placeholder={t.hero.scanPlaceholder}
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                  />
                  <button type="submit" className="lp-btn lp-btn-primary">
                    {t.hero.scanSubmit} <ArrowRight size={18} />
                  </button>
                </div>
              ) : (
                <p className="lp-scan-progress" role="status">
                  {stage === "extracting" ? t.hero.scanExtracting : t.hero.scanReading}
                </p>
              )}
              {error ? <p className="lp-scan-error">{error}</p> : null}
            </form>
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
