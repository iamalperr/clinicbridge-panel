import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ClinicBridge AI — Health Tourism Agency Demo",
  description: "AI-powered clinic matching and health tourism platform. Find the right clinic with artificial intelligence.",
};

export default function AgencyDemoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
