import type { Metadata } from "next";
import Link from "next/link";
import LandingChrome from "@/components/landing/LandingChrome";
import ProductFaqSection from "@/components/landing/ProductFaqSection";
import JsonLd from "@/components/landing/JsonLd";
import { PUBLIC_SITE_ORIGIN } from "@/lib/seo/publicSitemap";
import { breadcrumbJsonLd, faqPageJsonLd } from "@/lib/seo/jsonLd";

const PATH = "/en/sss";
const CANONICAL = `${PUBLIC_SITE_ORIGIN}${PATH}`;

export const metadata: Metadata = {
  title: { absolute: "Frequently Asked Questions | ClinicBridge AI" },
  description:
    "What ClinicBridge AI is, which languages it supports, setup, and the 14-day free trial — factual FAQ answers.",
  alternates: {
    canonical: CANONICAL,
    languages: {
      tr: `${PUBLIC_SITE_ORIGIN}/sss`,
      en: CANONICAL,
      "x-default": `${PUBLIC_SITE_ORIGIN}/sss`,
    },
  },
};

export default function FaqPageEn() {
  return (
    <LandingChrome initialLang="en">
      <JsonLd
        data={[
          faqPageJsonLd("en"),
          breadcrumbJsonLd([
            { name: "Home", path: "/en" },
            { name: "FAQ", path: PATH },
          ]),
        ]}
      />
      <section className="lp-hero">
        <div className="lp-container">
          <h1>Frequently asked questions</h1>
          <p className="lp-hero-subtitle">
            Factual answers about ClinicBridge AI.{" "}
            <Link href="/en">Home</Link>
            {" · "}
            <Link href="/sss">Türkçe</Link>
          </p>
        </div>
      </section>
      <ProductFaqSection />
    </LandingChrome>
  );
}
