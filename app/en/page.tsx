import type { Metadata } from "next";
import Link from "next/link";
import LandingHomePage from "@/components/landing/LandingHomePage";
import JsonLd from "@/components/landing/JsonLd";
import { homeMetadata } from "@/lib/seo/homeMetadata";
import { faqPageJsonLd, organizationJsonLd, softwareApplicationJsonLd } from "@/lib/seo/jsonLd";

export const metadata: Metadata = {
  ...homeMetadata("en"),
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png", sizes: "96x96" }],
  },
};

export default function EnglishHome() {
  return (
    <>
      <JsonLd data={[organizationJsonLd(), softwareApplicationJsonLd("en"), faqPageJsonLd("en")]} />
      <LandingHomePage
        initialLang="en"
        faqSeeAllHref="/en/sss"
        assistantLink={<Link href="/klinikler-icin-yapay-zeka-asistani">AI assistant for clinics</Link>}
      />
    </>
  );
}
