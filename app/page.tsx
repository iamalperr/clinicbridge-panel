import type { Metadata } from "next";
import Link from "next/link";
import LandingHomePage from "@/components/landing/LandingHomePage";

export const metadata: Metadata = {
  title: "ClinicBridge AI — Yapay Zekâ Destekli Hasta İletişim Platformu",
  description:
    "ClinicBridge AI, web sitesi ve telefon asistanlarıyla hasta sorularını yanıtlar, randevu taleplerini toplar ve kliniğinizin iletişim süreçlerini 7/24 destekler.",
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png", sizes: "96x96" }],
  },
  keywords: [
    "klinik asistan",
    "yapay zeka",
    "telefon asistanı",
    "web sitesi asistanı",
    "diş kliniği",
    "randevu",
    "chatbot",
    "sağlık turizmi",
    "clinic AI",
    "patient assistant",
    "AI phone assistant",
  ],
  openGraph: {
    title: "ClinicBridge AI — AI Patient Communication Platform",
    description:
      "Website and phone AI assistants that answer patient questions, collect appointment requests, and support your clinic’s communication around the clock.",
    url: "https://clinicbridge-ai.com",
    siteName: "ClinicBridge AI",
    type: "website",
  },
};

export default function Home() {
  return (
    <LandingHomePage
      assistantLink={
        <Link href="/klinikler-icin-yapay-zeka-asistani">Klinikler için yapay zekâ asistanı</Link>
      }
    />
  );
}
