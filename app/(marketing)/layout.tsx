"use client";

import "@/app/(landing)/landing.css";
import { LandingLangProvider } from "@/lib/landing-translations";
import LandingHeader from "@/components/landing/LandingHeader";
import LandingFooter from "@/components/landing/LandingFooter";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <LandingLangProvider>
      <div className="lp-page">
        <LandingHeader />
        <main className="lp-marketing-main">{children}</main>
        <LandingFooter />
      </div>
    </LandingLangProvider>
  );
}
