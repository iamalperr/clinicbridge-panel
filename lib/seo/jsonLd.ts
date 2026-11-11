import { PRICING_PLANS } from "@/lib/pricing";
import { PUBLIC_SITE_ORIGIN } from "@/lib/seo/publicSitemap";
import { productFaq, type MarketingLang } from "@/lib/seo/productFaq";

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "ClinicBridge AI",
    url: PUBLIC_SITE_ORIGIN,
    logo: `${PUBLIC_SITE_ORIGIN}/logo.svg`,
    email: "info@clinicbridge-ai.com",
    sameAs: [
      "https://www.linkedin.com/company/clinicbridge-ai",
      "https://www.instagram.com/clinicbridge.ai",
    ],
  };
}

export function softwareApplicationJsonLd(lang: MarketingLang = "tr") {
  const paid = PRICING_PLANS.filter((plan) => plan.monthlyEur != null);
  const description =
    lang === "en"
      ? "Multilingual AI website chat and phone assistant for medical tourism clinics. 14-day free trial. No credit card required."
      : "Sağlık turizmi klinikleri için çok dilli AI web sohbet ve telefon asistanı. 14 gün ücretsiz deneme. Kredi kartı gerekmez.";
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "ClinicBridge AI",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: PUBLIC_SITE_ORIGIN,
    description,
    offers: paid.map((plan) => ({
      "@type": "Offer",
      name:
        plan.id === "starter"
          ? lang === "en"
            ? "Starter"
            : "Başlangıç"
          : plan.id === "clinic"
            ? lang === "en"
              ? "Clinic"
              : "Klinik"
            : lang === "en"
              ? "Clinic + Phone"
              : "Klinik + Telefon",
      price: String(plan.monthlyEur),
      priceCurrency: "EUR",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: String(plan.monthlyEur),
        priceCurrency: "EUR",
        billingDuration: "P1M",
      },
    })),
  };
}

export function faqPageJsonLd(lang: MarketingLang) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: productFaq(lang).map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.path.startsWith("http") ? item.path : `${PUBLIC_SITE_ORIGIN}${item.path === "/" ? "/" : item.path}`,
    })),
  };
}

export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
