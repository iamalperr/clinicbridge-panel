"use client";

import Link from "next/link";
import { useLandingLang } from "@/lib/landing-translations";
import { productFaq } from "@/lib/seo/productFaq";

export default function ProductFaqSection({
  limit,
  seeAllHref,
}: {
  limit?: number;
  seeAllHref?: string;
}) {
  const { t, lang } = useLandingLang();
  const items = productFaq(lang);
  const visible = typeof limit === "number" ? items.slice(0, limit) : items;

  return (
    <section className="lp-section lp-section-alt" id="sss">
      <div className="lp-container lp-faq">
        <h2 className="lp-section-title">{t.productFaq.title}</h2>
        <div className="lp-faq-accordion">
          {visible.map((item) => (
            <details key={item.question} className="lp-faq-item">
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
        {seeAllHref ? (
          <p className="lp-faq-see-all">
            <Link href={seeAllHref}>{t.productFaq.seeAll}</Link>
          </p>
        ) : null}
      </div>
    </section>
  );
}
