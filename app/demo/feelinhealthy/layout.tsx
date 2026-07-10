import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FeelinHealthy — AI-Powered Health Tourism Platform",
  description: "Find the right clinic with AI. Get matched with top-rated clinics in Turkey for dental, hair transplant, aesthetic surgery and more.",
};

export default function FeelinHealthyDemoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
