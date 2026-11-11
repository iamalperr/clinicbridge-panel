"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLandingLang, LandingLanguage } from "@/lib/landing-translations";
import { Menu, X } from "lucide-react";
import Image from "next/image";

export default function LandingHeader() {
  const { lang, setLang, t } = useLandingLang();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const scrollTo = (id: string) => {
    setMobileOpen(false);
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: "smooth" });
      return;
    }
    router.push(`/#${id}`);
  };

  const langs: LandingLanguage[] = ["tr", "en"];

  return (
    <>
      <header className="lp-header" id="lp-header">
        <div className="lp-header-inner">
          <Link
            href={lang === "en" ? "/en" : "/"}
            className="lp-logo"
            onClick={(e) => {
              setMobileOpen(false);
              if (pathname === "/" || pathname === "/en") {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }
            }}
          >
            <Image src="/icon.svg" alt="ClinicBridge" width={36} height={36} className="lp-logo-icon-img" priority />
            <span className="lp-logo-text">
              <span className="lp-logo-clinic">Clinic</span>
              <span className="lp-logo-bridge">Bridge</span>
              <span className="lp-logo-ai">AI</span>
            </span>
          </Link>

          <nav className="lp-nav">
            <a href="#products" onClick={(e) => { e.preventDefault(); scrollTo("products"); }}>{t.nav.solutions}</a>
            <Link href="/fiyatlandirma" onClick={() => setMobileOpen(false)}>{t.nav.pricing}</Link>
            <Link href="/hakkimizda" onClick={() => setMobileOpen(false)}>{t.nav.about}</Link>
            <Link href="/kurulum-rehberi" onClick={() => setMobileOpen(false)}>{t.nav.setupGuide}</Link>
            <a href="#how-it-works" onClick={(e) => { e.preventDefault(); scrollTo("how-it-works"); }}>{t.nav.howItWorks}</a>
            <a href="#benefits" onClick={(e) => { e.preventDefault(); scrollTo("benefits"); }}>{t.nav.benefits}</a>
            <a href="#contact" onClick={(e) => { e.preventDefault(); scrollTo("contact"); }}>{t.nav.contact}</a>
          </nav>

          <div className="lp-header-actions">
            <div className="lp-lang-switch">
              {langs.map((l) => (
                <button
                  key={l}
                  type="button"
                  className={`lp-lang-btn${lang === l ? " active" : ""}`}
                  onClick={() => {
                    setLang(l);
                    if (l === "en" && (pathname === "/" || pathname === "/sss")) {
                      router.push(pathname === "/sss" ? "/en/sss" : "/en");
                    } else if (l === "tr" && (pathname === "/en" || pathname === "/en/sss")) {
                      router.push(pathname === "/en/sss" ? "/sss" : "/");
                    }
                  }}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <a className="lp-btn lp-btn-primary" style={{ padding: "10px 24px", fontSize: 14 }} href="https://app.clinicbridge-ai.com/kayit">
              {t.hero.ctaPrimary}
            </a>
            <button type="button" className="lp-mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu">
              {mobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </header>

      <div className={`lp-mobile-menu${mobileOpen ? " open" : ""}`}>
        <a href="#products" onClick={(e) => { e.preventDefault(); scrollTo("products"); }}>{t.nav.solutions}</a>
        <Link href="/fiyatlandirma" onClick={() => setMobileOpen(false)}>{t.nav.pricing}</Link>
        <Link href="/hakkimizda" onClick={() => setMobileOpen(false)}>{t.nav.about}</Link>
        <Link href="/kurulum-rehberi" onClick={() => setMobileOpen(false)}>{t.nav.setupGuide}</Link>
        <Link href={lang === "en" ? "/en/sss" : "/sss"} onClick={() => setMobileOpen(false)}>{lang === "en" ? "FAQ" : "SSS"}</Link>
        <a href="#how-it-works" onClick={(e) => { e.preventDefault(); scrollTo("how-it-works"); }}>{t.nav.howItWorks}</a>
        <a href="#benefits" onClick={(e) => { e.preventDefault(); scrollTo("benefits"); }}>{t.nav.benefits}</a>
        <a href="#contact" onClick={(e) => { e.preventDefault(); scrollTo("contact"); }}>{t.nav.contact}</a>
        <a className="lp-btn lp-btn-primary" href="https://app.clinicbridge-ai.com/kayit">{t.hero.ctaPrimary}</a>
      </div>
    </>
  );
}
