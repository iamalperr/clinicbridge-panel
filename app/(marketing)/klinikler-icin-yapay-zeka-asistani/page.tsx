import type { Metadata } from "next";
import Link from "next/link";
import { Globe, Phone } from "lucide-react";
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

export default function ClinicAssistantPage() {
  return (
    <>
      <section className="lp-hero">
        <div className="lp-container">
          <h1>Klinikler İçin Yapay Zekâ Asistanı</h1>
          <p className="lp-hero-subtitle">
            Telefon asistanı, kliniğinize gelen aramaları karşılar ve hastanın sorusunu yanıtlar.
            Web asistanı, sitenizdeki hasta sorularını yanıtlar. İkisi de randevu talebini ekibinize iletir.
          </p>
          <div className="lp-hero-ctas">
            <Link className="lp-btn lp-btn-primary" href="#contact">
              Kliniğiniz için demo isteyin
            </Link>
          </div>
        </div>
      </section>

      <section className="lp-section lp-section-alt">
        <div className="lp-container">
          <h2 className="lp-section-title">Bir arama ve bir site sorusu</h2>
          <div className="lp-cards-grid lp-cards-grid-2">
            <article className="lp-card">
              <p className="lp-product-label">
                <Phone size={16} aria-hidden /> Telefon asistanı
              </p>
              <h3>Mesai dışında gelen arama</h3>
              <p>Saat 21.00. Klinik kapalı.</p>
              <p><strong>Hasta:</strong> Yarın diş kontrolü için randevu alabilir miyim?</p>
              <p>
                <strong>Asistan:</strong> Kliniğimiz şu an kapalı. Adınızı ve uygun olduğunuz günü alıyorum.
                Talebinizi klinik ekibine iletiyorum.
              </p>
            </article>
            <article className="lp-card">
              <p className="lp-product-label">
                <Globe size={16} aria-hidden /> Web asistanı
              </p>
              <h3>Siteden gelen hasta sorusu</h3>
              <p><strong>Hasta:</strong> İmplant tedavisi kaç ziyaret sürer?</p>
              <p>
                <strong>Asistan:</strong> İmplant genellikle iki ziyaret ister. Uygun gününüzü yazarsanız
                randevu talebinizi klinik ekibine iletirim.
              </p>
            </article>
          </div>
          <p className="lp-section-subtitle">
            Randevu talebi klinik ekibine iletilir. Son onay klinik ekibine aittir.
          </p>
        </div>
      </section>

      <DemoCTASection />
    </>
  );
}
