import type { Metadata } from "next";
import Link from "next/link";
import LandingChrome from "@/components/landing/LandingChrome";
import DemoCTASection from "@/components/landing/DemoCTASection";
import { PUBLIC_SITE_ORIGIN } from "@/lib/seo/publicSitemap";

const PATH = "/klinikler-icin-yapay-zeka-asistani";
const CANONICAL = `${PUBLIC_SITE_ORIGIN}${PATH}`;

export const metadata: Metadata = {
  title: {
    absolute: "Klinikler İçin Yapay Zekâ Asistanı | ClinicBridge AI",
  },
  description:
    "ClinicBridge AI, kliniğinizin telefon aramalarını ve web sitesi sorularını yanıtlar, randevu taleplerini ekibinize iletir. Kliniğiniz için demo isteyin.",
  alternates: { canonical: CANONICAL },
};

function ClinicAssistantContent() {
  return (
    <>
      <section className="lp-hero">
        <div className="lp-container">
          <h1>Klinikler İçin Yapay Zekâ Asistanı</h1>
          <p className="lp-hero-subtitle">
            ClinicBridge AI, klinikler için yapay zekâ ile gelen telefon aramalarını ve web sitesi
            hasta sorularını karşılar. Randevu talebini klinik ekibine iletir; randevu klinik
            tarafından onaylanır.
          </p>
          <div className="lp-hero-ctas">
            <a className="lp-btn lp-btn-primary" href="#contact">
              Kliniğiniz için demo isteyin
            </a>
            <Link className="lp-btn lp-btn-secondary" href="/">
              Ana sayfa
            </Link>
          </div>
        </div>
      </section>

      <section className="lp-section lp-section-alt">
        <div className="lp-container">
          <h2 className="lp-section-title">Üç somut hasta akışı</h2>
          <p className="lp-section-subtitle">
            Telefon, web sitesi ve randevu talebi aynı klinik ekibine bağlanır.
          </p>
          <div className="lp-cards-grid lp-cards-grid-3">
            <article className="lp-card">
              <p className="lp-product-label">Gelen telefon araması</p>
              <h3>Mesai dışında gelen arama</h3>
              <p>Saat 21.00. Klinik kapalı.</p>
              <p>
                <strong>Hasta:</strong> Yarın diş kontrolü için randevu alabilir miyim?
              </p>
              <p>
                <strong>Asistan:</strong> Kliniğimiz şu an kapalı. Adınızı ve uygun olduğunuz günü
                alıyorum. Talebinizi klinik ekibine iletiyorum.
              </p>
            </article>

            <article className="lp-card">
              <p className="lp-product-label">Web sitesindeki hasta sorusu</p>
              <h3>Siteden gelen hasta sorusu</h3>
              <p>
                <strong>Hasta:</strong> İmplant tedavisi kaç ziyaret sürer?
              </p>
              <p>
                <strong>Asistan:</strong> İmplant genellikle iki ziyaret ister. Uygun gününüzü
                yazarsanız randevu talebinizi klinik ekibine iletirim.
              </p>
            </article>

            <article className="lp-card">
              <p className="lp-product-label">Kliniğe iletilen randevu talebi</p>
              <h3>Klinik onayıyla tamamlanır</h3>
              <p>
                Asistan hastanın adını, tedavisini ve tercih ettiği günü toplar. Randevu talebi
                klinik ekibine iletilir.
              </p>
              <p>
                Randevu klinik tarafından onaylanır. Son onay klinik ekibine aittir; asistan
                randevuyu kendi başına kesinleştirmez.
              </p>
            </article>
          </div>
        </div>
      </section>
    </>
  );
}

export default function ClinicAssistantPage() {
  return (
    <LandingChrome>
      <ClinicAssistantContent />
      <DemoCTASection />
    </LandingChrome>
  );
}
