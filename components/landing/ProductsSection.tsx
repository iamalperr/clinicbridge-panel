"use client";

import { useLandingLang } from "@/lib/landing-translations";
import { Globe, Phone, ArrowRight } from "lucide-react";

export default function ProductsSection({
  assistantLink,
}: {
  assistantLink?: React.ReactNode;
}) {
  const { t } = useLandingLang();
  const { website, phone } = t.products;

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="lp-section" id="products">
      <div className="lp-container">
        <h2 className="lp-section-title">{t.products.title}</h2>
        <p className="lp-section-subtitle">{t.products.subtitle}</p>

        <div className="lp-cards-grid lp-cards-grid-2 lp-products-grid">
          <article className="lp-card lp-product-card" id="website-assistant">
            <div className="lp-card-icon" aria-hidden>
              <Globe size={22} />
            </div>
            <p className="lp-product-label">{website.title}</p>
            <h3>{website.headline}</h3>
            <p>{website.desc}</p>
            <button
              type="button"
              className="lp-btn lp-btn-secondary lp-product-cta"
              onClick={() => scrollTo("features")}
            >
              {website.cta} <ArrowRight size={16} />
            </button>
          </article>

          <article className="lp-card lp-product-card" id="phone-assistant">
            <div className="lp-card-icon" aria-hidden>
              <Phone size={22} />
            </div>
            <p className="lp-product-label">{phone.title}</p>
            <h3>{phone.headline}</h3>
            <p>{phone.desc}</p>
            <button
              type="button"
              className="lp-btn lp-btn-secondary lp-product-cta"
              onClick={() => scrollTo("features")}
            >
              {phone.cta} <ArrowRight size={16} />
            </button>
          </article>
        </div>

        <p className="lp-section-subtitle">
          {assistantLink ?? (
            <a href="/klinikler-icin-yapay-zeka-asistani">{t.products.assistantLink}</a>
          )}
        </p>
      </div>
    </section>
  );
}
