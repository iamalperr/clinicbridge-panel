import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ClinicBridge One — Yapay Zekâ Destekli Klinik Asistanı",
  description: "Klinik web sitenizi 7/24 hasta karşılayan akıllı bir asistana dönüştürün. ClinicBridge One ile hasta sorularını anında yanıtlayın, randevu taleplerini otomatik toplayın.",
  keywords: ["klinik asistan", "yapay zeka", "diş kliniği", "randevu", "chatbot", "sağlık turizmi", "clinic AI", "patient assistant"],
  openGraph: {
    title: "ClinicBridge One — AI-Powered Clinic Assistant",
    description: "Turn your clinic website into a 24/7 AI patient assistant. Answer questions, explain treatments, and collect appointments automatically.",
    url: "https://clinicbridge-one.com",
    siteName: "ClinicBridge One",
    type: "website",
  },
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
