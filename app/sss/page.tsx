import type { Metadata } from "next";
import Link from "next/link";
import LandingChrome from "@/components/landing/LandingChrome";
import ProductFaqSection from "@/components/landing/ProductFaqSection";
import JsonLd from "@/components/landing/JsonLd";
import { PUBLIC_SITE_ORIGIN } from "@/lib/seo/publicSitemap";
import { breadcrumbJsonLd, faqPageJsonLd } from "@/lib/seo/jsonLd";
import { hreflangAlternates } from "@/lib/seo/homeMetadata";

const PATH = "/sss";
const CANONICAL = `${PUBLIC_SITE_ORIGIN}${PATH}`;

export const metadata: Metadata = {
  title: { absolute: "Sık Sorulan Sorular | ClinicBridge AI" },
  description:
    "ClinicBridge AI nedir, hangi dilleri destekler, kurulum ve 14 gün ücretsiz deneme hakkında sık sorulan sorular.",
  alternates: {
    ...hreflangAlternates("/sss", "/en/sss"),
    canonical: CANONICAL,
  },
};

export default function FaqPageTr() {
  return (
    <LandingChrome>
      <JsonLd
        data={[
          faqPageJsonLd("tr"),
          breadcrumbJsonLd([
            { name: "Ana sayfa", path: "/" },
            { name: "Sık sorulan sorular", path: PATH },
          ]),
        ]}
      />
      <section className="lp-hero">
        <div className="lp-container">
          <h1>Sık sorulan sorular</h1>
          <p className="lp-hero-subtitle">
            ClinicBridge AI hakkında net, olgusal cevaplar.{" "}
            <Link href="/">Ana sayfa</Link>
            {" · "}
            <Link href="/en/sss">English</Link>
          </p>
        </div>
      </section>
      <ProductFaqSection />
    </LandingChrome>
  );
}
