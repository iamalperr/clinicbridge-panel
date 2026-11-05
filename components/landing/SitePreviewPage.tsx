"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useLandingLang } from "@/lib/landing-translations";
import { DEMO_PREVIEW_ID } from "@/lib/preview/demoClinic";
import { NOVA_ADDRESS, NOVA_DOCTORS, NOVA_HOURS_TEXT, NOVA_TREATMENTS, NOVA_WHATSAPP } from "@/lib/demo/novaDental";
import { previewLanguageLabel, type PreviewUiLanguage } from "@/lib/preview/previewLanguage";
import type { PreviewLead } from "@/lib/preview/previewIntake";
import LandingHeader from "@/components/landing/LandingHeader";
import LandingFooter from "@/components/landing/LandingFooter";
import "@/app/(landing)/landing.css";

interface PreviewView {
  previewId: string;
  sourceUrl: string;
  clinicName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  embeddable: boolean;
  treatmentCount: number;
  languageCount: number;
  questionCount: number;
}

function clock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" }).format(date);
}

export default function SitePreviewPage({ previewId }: { previewId: string }) {
  const { t, lang } = useLandingLang();
  const [preview, setPreview] = useState<PreviewView | null>(null);
  const [missing, setMissing] = useState(false);
  const [leads, setLeads] = useState<PreviewLead[]>([]);
  const [mobilePanel, setMobilePanel] = useState<"patient" | "clinic">("patient");
  const isDemo = previewId === DEMO_PREVIEW_ID;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/preview/${encodeURIComponent(previewId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("missing");
        return response.json() as Promise<PreviewView>;
      })
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [previewId]);

  useEffect(() => {
    if (!preview) return;
    const script = document.createElement("script");
    const local = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    script.src = local ? "/widget.js" : "https://widget.clinicbridge-ai.com/widget.js";
    script.async = true;
    script.dataset.previewId = preview.previewId;
    if (preview.clinicName) script.dataset.previewTitle = preview.clinicName;
    if (preview.primaryColor) script.dataset.previewColor = preview.primaryColor;
    script.dataset.language = lang === "en" ? "en" : "tr";
    document.body.appendChild(script);
    const place = () => {
      const host = document.getElementById("cbw-host");
      const frame = document.getElementById("lp-patient-frame");
      if (host && frame && host.parentElement !== frame) frame.appendChild(host);
    };
    const observer = new MutationObserver(place);
    observer.observe(document.body, { childList: true });
    place();
    return () => {
      observer.disconnect();
      script.remove();
      document.getElementById("cbw-host")?.remove();
      const widgetWindow = window as Window & { __cbwLoaded?: boolean };
      delete widgetWindow.__cbwLoaded;
    };
  }, [preview, lang]);

  useEffect(() => {
    const onLead = (event: Event) => {
      const detail = (event as CustomEvent<PreviewLead>).detail;
      if (!detail?.name || !detail.contact) return;
      setLeads((current) => [detail, ...current]);
      setMobilePanel("clinic");
    };
    window.addEventListener("cbw-preview-lead", onLead);
    return () => window.removeEventListener("cbw-preview-lead", onLead);
  }, []);

  const color = preview?.primaryColor || "#0f766e";
  let hostname = "";
  try {
    hostname = preview?.sourceUrl ? new URL(preview.sourceUrl).hostname : "";
  } catch {
    hostname = "";
  }

  return (
    <div className="lp-page">
      <LandingHeader />
      <main className="lp-preview-page">
        <div className="lp-container">
          {missing ? <p className="lp-scan-error">{t.preview.missing}</p> : null}
          {!preview && !missing ? <p className="lp-scan-progress">{t.preview.loading}</p> : null}
          {preview ? (
            <>
              <p className="lp-preview-banner">{isDemo ? t.preview.demoBanner : t.preview.liveBanner}</p>
              <div className="lp-stage-tabs">
                <button type="button" className={mobilePanel === "patient" ? "is-active" : ""} onClick={() => setMobilePanel("patient")}>{t.preview.patientTab}</button>
                <button type="button" className={mobilePanel === "clinic" ? "is-active" : ""} onClick={() => setMobilePanel("clinic")}>{t.preview.clinicTab}</button>
              </div>
              <div className="lp-stage">
                <section className={`lp-stage-panel ${mobilePanel === "patient" ? "is-active" : ""}`} aria-label={t.preview.patientTab}>
                  <div id="lp-patient-frame" className="lp-patient-frame" style={{ "--lp-clinic": color } as CSSProperties}>
                    {preview.embeddable && preview.sourceUrl && !isDemo ? (
                      <iframe className="lp-preview-frame" src={preview.sourceUrl} title={preview.clinicName || hostname} />
                    ) : (
                      <article className="lp-mock">
                        <header className="lp-mock-hero">
                          {preview.logoUrl ? (
                            // External clinic logos are not in the image allowlist.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={preview.logoUrl} alt="" />
                          ) : <span className="lp-mock-mark" aria-hidden="true" />}
                          <div>
                            <p>{isDemo ? "Nişantaşı · İstanbul" : hostname}</p>
                            <h2>{preview.clinicName || hostname}</h2>
                          </div>
                        </header>
                        {isDemo ? (
                          <>
                            <div className="lp-mock-cards">
                              {NOVA_TREATMENTS.map((item) => (
                                <div key={item.id}>
                                  <strong>{item.name.tr}</strong>
                                  <span>{item.price}</span>
                                </div>
                              ))}
                            </div>
                            <div className="lp-mock-doctors">
                              {NOVA_DOCTORS.map((doctor) => (
                                <div key={doctor.name}>
                                  <span className="lp-mock-avatar" aria-hidden="true" />
                                  <strong>{doctor.name}</strong>
                                  <span>{doctor.specialty.tr} · {doctor.years} yıl</span>
                                </div>
                              ))}
                            </div>
                            <p className="lp-mock-contact">{NOVA_ADDRESS}<br />{NOVA_HOURS_TEXT}<br />WhatsApp {NOVA_WHATSAPP}</p>
                          </>
                        ) : null}
                      </article>
                    )}
                  </div>
                </section>
                <section className={`lp-stage-panel ${mobilePanel === "clinic" ? "is-active" : ""}`} aria-label={t.preview.clinicTab}>
                  <div className="lp-inbox">
                    <h2>{t.preview.inboxTitle}</h2>
                    {leads.length === 0 ? <p>{t.preview.inboxEmpty}</p> : null}
                    {leads.map((lead) => (
                      <article key={`${lead.receivedAt}-${lead.contact}`} className="lp-lead">
                        <header>
                          <strong>{lead.name}</strong>
                          <time dateTime={lead.receivedAt}>{clock(lead.receivedAt)}</time>
                        </header>
                        {lead.outsideHours ? <span className="lp-lead-after">{t.preview.outsideHours}</span> : null}
                        <p>{previewLanguageLabel(lead.language as PreviewUiLanguage)}{lead.country ? ` · ${lead.country}` : ""}</p>
                        <p>{lead.treatment}</p>
                        <p>{lead.datePreference}</p>
                        <p>{lead.contact}</p>
                        <p>{lead.summary}</p>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
              <aside className="lp-preview-pilot">
                <p>{t.preview.pilot}</p>
                <div className="lp-preview-actions">
                  <Link className="lp-btn lp-btn-primary lp-preview-cta" href="/#onizleme-istegi">{t.preview.requestPreview}</Link>
                  <Link className="lp-btn lp-btn-secondary lp-preview-cta" href="/#contact">{t.preview.requestDemo}</Link>
                  {!isDemo ? (
                    <Link className="lp-btn lp-btn-secondary lp-preview-cta" href={`https://app.clinicbridge-ai.com/kayit?preview=${encodeURIComponent(previewId)}`}>
                      {t.preview.cta}
                    </Link>
                  ) : null}
                </div>
              </aside>
            </>
          ) : null}
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
