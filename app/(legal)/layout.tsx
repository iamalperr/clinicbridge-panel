import type { Metadata } from "next";
import LegalChrome from "@/components/legal/LegalChrome";

/** Legal pages must be CDN-static (no serverless per request). */
export const dynamic = "force-static";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
  },
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <LegalChrome>{children}</LegalChrome>;
}
