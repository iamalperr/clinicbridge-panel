import type { Metadata } from "next";
import PricingSection from "@/components/landing/PricingSection";
import PricingFaq from "@/components/landing/PricingFaq";
import JsonLd from "@/components/landing/JsonLd";
import { PUBLIC_SITE_ORIGIN } from "@/lib/seo/publicSitemap";
import { breadcrumbJsonLd, softwareApplicationJsonLd } from "@/lib/seo/jsonLd";

const PATH = "/fiyatlandirma";
const CANONICAL = `${PUBLIC_SITE_ORIGIN}${PATH}`;

export const metadata: Metadata = {
  title: { absolute: "Fiyatlandırma | ClinicBridge AI" },
  description:
    "ClinicBridge AI paketleri: Başlangıç €49, Klinik €149, Klinik + Telefon €299. 14 gün ücretsiz deneme, kredi kartı gerekmez.",
  alternates: { canonical: CANONICAL },
};

export default function PricingPage() {
  return (
    <>
      <JsonLd
        data={[
          softwareApplicationJsonLd("tr"),
          breadcrumbJsonLd([
            { name: "Ana sayfa", path: "/" },
            { name: "Fiyatlandırma", path: PATH },
          ]),
        ]}
      />
      <PricingSection />
      <PricingFaq />
    </>
  );
}
