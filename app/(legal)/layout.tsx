import type { Metadata } from "next";
import LegalChrome from "@/components/legal/LegalChrome";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
  },
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <LegalChrome>{children}</LegalChrome>;
}
