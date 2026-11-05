"use client";

import Link from "next/link";
import { useLandingLang } from "@/lib/landing-translations";
import { SELLER } from "@/components/legal/LegalPage";

export default function AboutPage() {
  const { t } = useLandingLang();

  return (
    <section className="lp-section">
      <div className="lp-container lp-prose">
        <h1 className="lp-section-title">{t.about.title}</h1>
        <h2>{t.about.whatTitle}</h2>
        {t.about.what.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <h2>{t.about.whyTitle}</h2>
        <p>{t.about.why}</p>
        <h2>{t.about.contactTitle}</h2>
        <p>
          {t.about.emailLabel}: <a href={`mailto:${SELLER.email}`}>{SELLER.email}</a>
        </p>
        <p>
          {t.about.phoneLabel}: {SELLER.phone}
        </p>
        <p>
          {t.about.sellerNote} <Link href="/mesafeli-satis-sozlesmesi">{t.about.contract}</Link>
          {t.about.contractSuffix.startsWith("nde") ? "'" : ""}
          {t.about.contractSuffix}
        </p>
      </div>
    </section>
  );
}
