import type { Metadata } from "next";
import { PUBLIC_SITE_ORIGIN } from "@/lib/seo/publicSitemap";
import type { MarketingLang } from "@/lib/seo/productFaq";

const HOME = {
  tr: {
    title: "Sağlık Turizmi Klinikleri İçin Çok Dilli AI Asistan | ClinicBridge",
    description:
      "Yabancı hastalarınıza 7/24 kendi dillerinde cevap veren AI sohbet ve telefon asistanı. Kendiniz kurun, 14 gün ücretsiz deneyin. Kredi kartı gerekmez.",
    path: "/",
  },
  en: {
    title: "Multilingual AI Assistant for Medical Tourism Clinics | ClinicBridge",
    description:
      "AI chat and phone assistant that answers international patients 24/7 in their language. Set it up yourself. 14-day free trial. No credit card required.",
    path: "/en",
  },
} as const;

export function homeMetadata(lang: MarketingLang): Metadata {
  const copy = HOME[lang];
  const canonical = `${PUBLIC_SITE_ORIGIN}${copy.path === "/" ? "" : copy.path}` || PUBLIC_SITE_ORIGIN;
  const canonicalUrl = copy.path === "/" ? `${PUBLIC_SITE_ORIGIN}/` : `${PUBLIC_SITE_ORIGIN}${copy.path}`;
  return {
    title: { absolute: copy.title },
    description: copy.description,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        tr: `${PUBLIC_SITE_ORIGIN}/`,
        en: `${PUBLIC_SITE_ORIGIN}/en`,
        "x-default": `${PUBLIC_SITE_ORIGIN}/`,
      },
    },
    openGraph: {
      title: copy.title,
      description: copy.description,
      url: canonicalUrl,
      siteName: "ClinicBridge AI",
      type: "website",
      locale: lang === "en" ? "en_US" : "tr_TR",
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.description,
    },
    keywords: [
      "sağlık turizmi",
      "diş kliniği chatbot",
      "AI asistan",
      "clinic AI",
      "medical tourism chatbot",
      "AI phone assistant",
    ],
  };
}

export function hreflangAlternates(trPath: string, enPath: string): Metadata["alternates"] {
  const trUrl = trPath === "/" ? `${PUBLIC_SITE_ORIGIN}/` : `${PUBLIC_SITE_ORIGIN}${trPath}`;
  const enUrl = `${PUBLIC_SITE_ORIGIN}${enPath}`;
  return {
    canonical: trUrl,
    languages: {
      tr: trUrl,
      en: enUrl,
      "x-default": trUrl,
    },
  };
}
