"use client";

import "@/app/(landing)/landing.css";
import { LandingLangProvider, type LandingLanguage } from "@/lib/landing-translations";
import LandingHeader from "@/components/landing/LandingHeader";
import LandingFooter from "@/components/landing/LandingFooter";

/** Client chrome around server-rendered marketing page content. */
export default function LandingChrome({
  children,
  initialLang = "tr",
}: {
  children: React.ReactNode;
  initialLang?: LandingLanguage;
}) {
  return (
    <LandingLangProvider initialLang={initialLang}>
      <div className="lp-page">
        <LandingHeader />
        <main className="lp-marketing-main">{children}</main>
        <LandingFooter />
      </div>
    </LandingLangProvider>
  );
}
