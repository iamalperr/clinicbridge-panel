"use client";

import { useLandingLang } from "@/lib/landing-translations";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LandingFooter() {
  const { t } = useLandingLang();
  const router = useRouter();
  const year = new Date().getFullYear();

  const goTo = (id: string) => {
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: "smooth" });
      return;
    }
    router.push(`/#${id}`);
  };

  return (
    <footer className="lp-footer">
      <div className="lp-container">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <h3>{t.footer.brand}</h3>
            <p>{t.footer.tagline}</p>
          </div>
          <div className="lp-footer-rows">
            <div className="lp-footer-links">
              <Link href="/#pricing">{t.footer.pricing}</Link>
              <Link href="/hakkimizda">{t.footer.about}</Link>
              <Link href="/klinikler-icin-yapay-zeka-asistani">{t.footer.assistant}</Link>
              <Link href="/kurulum-rehberi">{t.footer.setupGuide}</Link>
              <a href="#contact" onClick={(e) => { e.preventDefault(); goTo("contact"); }}>{t.footer.requestDemo}</a>
              <a href="#contact" onClick={(e) => { e.preventDefault(); goTo("contact"); }}>{t.footer.contact}</a>
            </div>
            <div className="lp-footer-links lp-footer-links-legal">
              <Link href="/privacy">{t.footer.privacy}</Link>
              <Link href="/terms">{t.footer.terms}</Link>
              <Link href="/kvkk">{t.footer.kvkk}</Link>
              <Link href="/teslimat-ve-iade">{t.footer.delivery}</Link>
              <Link href="/mesafeli-satis-sozlesmesi">{t.footer.distanceSales}</Link>
            </div>
          </div>
        </div>
        <div className="lp-footer-logo">
          {/* Brand SVG is served as-is from /public; Next image optimization does not apply. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/payment/iyzico-logo-band.svg" alt="iyzico ile Öde, Visa, Mastercard" />
        </div>
        <div className="lp-footer-copy">
          © {year} ClinicBridge AI. {t.footer.rights}
        </div>
      </div>
    </footer>
  );
}
