"use client";

import { useLandingLang } from "@/lib/landing-translations";
import Link from "next/link";

export default function LandingFooter() {
  const { t } = useLandingLang();
  const year = new Date().getFullYear();

  return (
    <footer className="lp-footer">
      <div className="lp-container">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <h3>{t.footer.brand}</h3>
            <p>{t.footer.tagline}</p>
          </div>
          <div className="lp-footer-links">
            <a href="#contact" onClick={(e) => { e.preventDefault(); document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" }); }}>
              {t.footer.requestDemo}
            </a>
            <Link href="/hakkimizda">Hakkımızda</Link>
            <Link href="/fiyatlandirma">Fiyatlandırma</Link>
            <Link href="/teslimat-ve-iade">Teslimat ve İade</Link>
            <Link href="/mesafeli-satis-sozlesmesi">Mesafeli Satış Sözleşmesi</Link>
            <Link href="/privacy">{t.footer.privacy}</Link>
            <Link href="/kvkk">KVKK</Link>
            <a href="mailto:info@clinicbridge-ai.com">{t.footer.contact}</a>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
          <img src="/payment/iyzico-logo-band.svg" alt="iyzico ile Öde, Visa, Mastercard" style={{ height: 28 }} />
        </div>
        <div className="lp-footer-copy">
          © {year} ClinicBridge AI. {t.footer.rights}
        </div>
      </div>
    </footer>
  );
}
