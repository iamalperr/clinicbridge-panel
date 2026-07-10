import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FeelinHealthy Admin Demo — ClinicBridge AI",
  description: "Agency workspace demo for FeelinHealthy health tourism platform.",
};

export default function FeelinHealthyAdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
