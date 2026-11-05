"use client";

import { useEffect, useState } from "react";
import { useLandingLang } from "@/lib/landing-translations";
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

export default function SitePreviewPage({ previewId }: { previewId: string }) {
  const { t } = useLandingLang();
  const [preview, setPreview] = useState<PreviewView | null>(null);
  const [missing, setMissing] = useState(false);

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
    script.dataset.language = document.documentElement.lang === "en" ? "en" : "tr";
    document.body.appendChild(script);
    return () => {
      script.remove();
      document.getElementById("cbw-host")?.remove();
      const widgetWindow = window as Window & { __cbwLoaded?: boolean };
      delete widgetWindow.__cbwLoaded;
    };
  }, [preview]);

  const summary = t.preview.summary
    .replace("{treatments}", String(preview?.treatmentCount ?? 0))
    .replace("{languages}", String(preview?.languageCount ?? 0))
    .replace("{questions}", String(preview?.questionCount ?? 0));
  const signupHref = `https://app.clinicbridge-ai.com/kayit?preview=${encodeURIComponent(previewId)}`;
  let hostname = preview?.sourceUrl || "";
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
              <p className="lp-preview-summary">{summary}</p>
              <div className="lp-preview-browser">
                <div className="lp-preview-chrome">
                  <span />
                  <span />
                  <span />
                  <div className="lp-preview-url">{hostname}</div>
                </div>
                {preview.embeddable && preview.sourceUrl ? (
                  <iframe
                    className="lp-preview-frame"
                    src={preview.sourceUrl}
                    title={preview.clinicName || hostname}
                  />
                ) : (
                  <div
                    className="lp-preview-fallback"
                    style={{ background: preview.primaryColor || "#0F172A" }}
                  >
                    {preview.logoUrl ? (
                      // External clinic logos are not in the image allowlist.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={preview.logoUrl} alt="" />
                    ) : null}
                    <h2>{preview.clinicName || hostname}</h2>
                  </div>
                )}
              </div>
              <aside className="lp-preview-pilot">
                <p>{t.preview.pilot}</p>
                <a className="lp-btn lp-btn-primary lp-preview-cta" href={signupHref}>
                  {t.preview.cta}
                </a>
              </aside>
            </>
          ) : null}
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
