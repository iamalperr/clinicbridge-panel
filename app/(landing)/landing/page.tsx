"use client";

import "../landing.css";
import { LandingLangProvider } from "@/lib/landing-translations";
import LandingHeader from "@/components/landing/LandingHeader";
import HeroSection from "@/components/landing/HeroSection";
import ProblemSection from "@/components/landing/ProblemSection";
import SolutionSection from "@/components/landing/SolutionSection";
import PatientJourneySection from "@/components/landing/PatientJourneySection";
import UseCasesSection from "@/components/landing/UseCasesSection";
import BenefitsSection from "@/components/landing/BenefitsSection";
import DemoCTASection from "@/components/landing/DemoCTASection";
import LandingFooter from "@/components/landing/LandingFooter";

export default function LandingPage() {
  return (
    <LandingLangProvider>
      <div className="lp-page">
        <LandingHeader />
        <HeroSection />
        <ProblemSection />
        <SolutionSection />
        <PatientJourneySection />
        <UseCasesSection />
        <BenefitsSection />
        <DemoCTASection />
        <LandingFooter />
      </div>
    </LandingLangProvider>
  );
}
