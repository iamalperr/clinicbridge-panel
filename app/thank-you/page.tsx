"use client";

import "@/app/(landing)/landing.css";
import { LandingLangProvider } from "@/lib/landing-translations";
import LandingHeader from "@/components/landing/LandingHeader";
import LandingFooter from "@/components/landing/LandingFooter";
import { CheckCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function ThankYouPage() {
  return (
    <LandingLangProvider>
      <div className="lp-page">
        <LandingHeader />
        
        <main className="lp-section" style={{ 
          minHeight: "70vh", 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center",
          paddingTop: "120px"
        }}>
          <div className="lp-container" style={{ textAlign: "center", maxWidth: "600px", margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.5rem" }}>
              <div className="lp-form-success-icon" style={{ 
                width: "80px", 
                height: "80px", 
                borderRadius: "50%", 
                backgroundColor: "rgba(16, 185, 129, 0.1)", 
                color: "#10B981", 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center",
                margin: "0 auto"
              }}>
                <CheckCircle size={40} />
              </div>
            </div>
            
            <h1 className="lp-section-title" style={{ marginBottom: "1rem" }}>
              Demo talebiniz alındı
            </h1>
            
            <p className="lp-section-subtitle" style={{ marginBottom: "2.5rem" }}>
              ClinicBridge AI Tech ekibi en kısa sürede sizinle iletişime geçecektir.
            </p>
            
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Link href="/" className="lp-btn lp-btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                <ArrowLeft size={18} /> Ana Sayfaya Dön
              </Link>
            </div>
          </div>
        </main>
        
        <LandingFooter />
      </div>
    </LandingLangProvider>
  );
}
