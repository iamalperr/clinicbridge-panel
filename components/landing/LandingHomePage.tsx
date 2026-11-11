"use client";

import "@/app/(landing)/landing.css";
import { LandingLangProvider, type LandingLanguage } from "@/lib/landing-translations";
import LandingHeader from "@/components/landing/LandingHeader";
import HeroSection from "@/components/landing/HeroSection";
import ProblemSection from "@/components/landing/ProblemSection";
import ProductsSection from "@/components/landing/ProductsSection";
import SolutionSection from "@/components/landing/SolutionSection";
import PatientJourneySection from "@/components/landing/PatientJourneySection";
import UseCasesSection from "@/components/landing/UseCasesSection";
import ClinicTypesSection from "@/components/landing/ClinicTypesSection";
import BenefitsSection from "@/components/landing/BenefitsSection";
import PricingSection from "@/components/landing/PricingSection";
import ProductFaqSection from "@/components/landing/ProductFaqSection";
import DemoCTASection from "@/components/landing/DemoCTASection";
import LandingFooter from "@/components/landing/LandingFooter";

export default function LandingHomePage({
  assistantLink,
  initialLang = "tr",
  faqSeeAllHref = "/sss",
}: {
  assistantLink?: React.ReactNode;
  initialLang?: LandingLanguage;
  faqSeeAllHref?: string;
}) {
  return (
    <LandingLangProvider initialLang={initialLang}>
      <div className="lp-page">
        <LandingHeader />
        <HeroSection />
        <ProblemSection />
        <ProductsSection assistantLink={assistantLink} />
        <SolutionSection />
        <PatientJourneySection />
        <UseCasesSection />
        <ClinicTypesSection />
        <BenefitsSection />
        <PricingSection />
        <ProductFaqSection limit={6} seeAllHref={faqSeeAllHref} />
        <DemoCTASection />
        <LandingFooter />
      </div>
    </LandingLangProvider>
  );
}
