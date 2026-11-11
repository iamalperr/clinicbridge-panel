import type { Metadata } from "next";
import Link from "next/link";
import LandingHomePage from "@/components/landing/LandingHomePage";
import JsonLd from "@/components/landing/JsonLd";
import { homeMetadata } from "@/lib/seo/homeMetadata";
import { faqPageJsonLd, organizationJsonLd, softwareApplicationJsonLd } from "@/lib/seo/jsonLd";

export const metadata: Metadata = {
  ...homeMetadata("tr"),
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png", sizes: "96x96" }],
  },
};

export default function Home() {
  return (
    <>
      <JsonLd data={[organizationJsonLd(), softwareApplicationJsonLd("tr"), faqPageJsonLd("tr")]} />
      <LandingHomePage
        faqSeeAllHref="/sss"
        assistantLink={
          <Link href="/klinikler-icin-yapay-zeka-asistani">Klinikler için yapay zekâ asistanı</Link>
        }
      />
    </>
  );
}
