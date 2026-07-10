"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  MapPin, Star, Globe2, Hotel, Car, Heart, Stethoscope, Eye, Baby,
  Scissors, Sparkles, ChevronRight, ArrowLeft, CheckCircle2,
  Building2, Clock, Award, Shield, Languages, ExternalLink, Send,
  Phone, Mail, Loader2, X,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type Lang = "tr" | "en";

interface ClinicProfile {
  id: string;
  name: string;
  clinicSlug: string;
  type: { tr: string; en: string };
  location: string;
  rating: number;
  reviews: number;
  priceRange: string;
  languages: string[];
  accommodation: boolean;
  transfer: boolean;
  image: string;
  specialties: { tr: string; en: string }[];
  shortDescription?: { tr: string; en: string };
  longDescription?: { tr: string; en: string };
  externalProfileUrl?: string;
  accreditations?: string[];
  services?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// LANGUAGE
// ═══════════════════════════════════════════════════════════════════════════════

const TX: Record<Lang, Record<string, string>> = {
  tr: {
    "back": "Kliniklere Dön",
    "hero.quote": "Teklif İste",
    "hero.treatments": "Uygun Tedaviler",
    "about.title": "Hakkında",
    "treatments.title": "Tedaviler & Hizmetler",
    "treatments.sub": "Bu kliniğin sunduğu tedavi seçenekleri",
    "pricing.title": "Fiyat Aralığı",
    "pricing.note": "Fiyatlar tedavi planına ve klinik değerlendirmesine göre değişebilir.",
    "pricing.ask": "Detaylı fiyat bilgisi için teklif isteyin.",
    "langs.title": "Desteklenen Diller",
    "accred.title": "Akreditasyonlar & Rozetler",
    "services.title": "Hizmetler & Olanaklar",
    "location.title": "Konum",
    "cta.title": "Bu klinikten teklif almak ister misiniz?",
    "cta.sub": "Tedavi ihtiyacınızı paylaşın, klinikten size özel teklif alsın.",
    "cta.quote": "Teklif Talebi Oluştur",
    "cta.ai": "AI ile Uygunluğu Kontrol Et",
    "related.title": "Benzer Klinikler",
    "related.sub": "Aynı tedavi kategorisindeki diğer klinikler",
    "notfound": "Klinik bulunamadı",
    "notfound.desc": "Aradığınız klinik mevcut değil veya kaldırılmış olabilir.",
    "notfound.back": "Ana Sayfaya Dön",
    "loading": "Yükleniyor...",
    "demo.banner": "🎯 Bu sayfa ClinicBridge AI demo deneyimidir",
    "nav.home": "Ana Sayfa",
    "lead.title": "Teklif Talebi",
    "lead.sub": "Bilgilerinizi bırakın, klinikten teklif alalım.",
    "lead.name": "Ad Soyad",
    "lead.email": "E-posta",
    "lead.phone": "Telefon",
    "lead.country": "Ülke",
    "lead.message": "Mesajınız (opsiyonel)",
    "lead.consent": "Kişisel verilerimin KVKK/GDPR kapsamında işlenmesini kabul ediyorum.",
    "lead.submit": "Teklif İste",
    "lead.sending": "Gönderiliyor...",
    "lead.ok.title": "Talebiniz Alındı! ✅",
    "lead.ok.desc": "En kısa sürede klinikten teklif iletilecektir.",
    "lead.close": "Kapat",
    "footer.rights": "Tüm hakları saklıdır.",
    "footer.poweredBy": "ClinicBridge AI tarafından desteklenmektedir",
    "profile.viewExternal": "FeelinHealthy Profilini Gör",
  },
  en: {
    "back": "Back to Clinics",
    "hero.quote": "Request Quote",
    "hero.treatments": "Available Treatments",
    "about.title": "About",
    "treatments.title": "Treatments & Services",
    "treatments.sub": "Treatment options offered by this clinic",
    "pricing.title": "Price Range",
    "pricing.note": "Prices may vary based on treatment plan and clinic evaluation.",
    "pricing.ask": "Request a quote for detailed pricing.",
    "langs.title": "Supported Languages",
    "accred.title": "Accreditations & Badges",
    "services.title": "Services & Facilities",
    "location.title": "Location",
    "cta.title": "Would you like to request a quote from this clinic?",
    "cta.sub": "Share your treatment needs and receive a personalized quote.",
    "cta.quote": "Create Quote Request",
    "cta.ai": "Check Eligibility with AI",
    "related.title": "Similar Clinics",
    "related.sub": "Other clinics in the same treatment category",
    "notfound": "Clinic Not Found",
    "notfound.desc": "The clinic you're looking for doesn't exist or has been removed.",
    "notfound.back": "Back to Home",
    "loading": "Loading...",
    "demo.banner": "🎯 This page is a ClinicBridge AI demo experience",
    "nav.home": "Home",
    "lead.title": "Quote Request",
    "lead.sub": "Leave your details and we'll get a quote from this clinic.",
    "lead.name": "Full Name",
    "lead.email": "Email",
    "lead.phone": "Phone",
    "lead.country": "Country",
    "lead.message": "Your Message (optional)",
    "lead.consent": "I consent to the processing of my personal data under GDPR/KVKK.",
    "lead.submit": "Request Quote",
    "lead.sending": "Submitting...",
    "lead.ok.title": "Request Received! ✅",
    "lead.ok.desc": "You will receive a quote from the clinic shortly.",
    "lead.close": "Close",
    "footer.rights": "All rights reserved.",
    "footer.poweredBy": "Powered by ClinicBridge AI",
    "profile.viewExternal": "View FeelinHealthy Profile",
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// FALLBACK DATA (same as parent page)
// ═══════════════════════════════════════════════════════════════════════════════

const FALLBACK_CLINICS: ClinicProfile[] = [
  { id: "1", name: "Dentaflow Clinic Istanbul", clinicSlug: "dentaflow-clinic-istanbul", type: { tr: "Diş Kliniği", en: "Dental Clinic" }, location: "İstanbul, Şişli", rating: 4.9, reviews: 1240, priceRange: "€400 – €1,200", languages: ["EN", "TR", "DE", "AR"], accommodation: true, transfer: true, image: "linear-gradient(135deg, #0D9488 0%, #0F766E 100%)", specialties: [{ tr: "Dental İmplant", en: "Dental Implant" }, { tr: "Zirkonyum Kaplama", en: "Zirconium Crown" }, { tr: "Hollywood Smile", en: "Hollywood Smile" }], shortDescription: { tr: "İstanbul'un kalbinde uzman diş hekimliği hizmetleri.", en: "Expert dental services in the heart of Istanbul." }, longDescription: { tr: "Dentaflow Clinic, 15 yılı aşkın deneyimiyle İstanbul Şişli'de uluslararası hastalara dental implant, zirkonyum kaplama ve Hollywood Smile tedavileri sunmaktadır. JCI akredite kliniğimizde son teknoloji ekipman ve uzman hekim kadromuzla güvenilir tedavi deneyimi yaşayın.", en: "Dentaflow Clinic offers dental implant, zirconium crown, and Hollywood Smile treatments to international patients in Istanbul Şişli with over 15 years of experience. Experience reliable treatment with state-of-the-art equipment and expert physicians at our JCI-accredited clinic." }, accreditations: ["JCI", "ISO 9001", "Health Tourism Certificate"], services: ["Airport Transfer", "Hotel Accommodation", "24/7 Support", "Panoramic X-Ray", "3D CT Scan"] },
  { id: "2", name: "MedSmile Dental Center", clinicSlug: "medsmile-dental-center", type: { tr: "Diş Kliniği", en: "Dental Clinic" }, location: "Antalya, Lara", rating: 4.8, reviews: 890, priceRange: "€350 – €900", languages: ["EN", "TR", "RU"], accommodation: true, transfer: true, image: "linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)", specialties: [{ tr: "Dental İmplant", en: "Dental Implant" }, { tr: "Diş Beyazlatma", en: "Teeth Whitening" }, { tr: "Kanal Tedavisi", en: "Root Canal" }], shortDescription: { tr: "Antalya'da tatil ve tedavi bir arada.", en: "Vacation and dental treatment combined in Antalya." }, accreditations: ["ISO 9001", "Health Tourism Certificate"], services: ["Airport Transfer", "Hotel Booking Assistance", "Multilingual Staff"] },
  { id: "3", name: "HairLine Turkey", clinicSlug: "hairline-turkey", type: { tr: "Saç Ekim Merkezi", en: "Hair Transplant Center" }, location: "İstanbul, Levent", rating: 4.9, reviews: 2100, priceRange: "€1,500 – €3,500", languages: ["EN", "TR", "AR", "FR"], accommodation: true, transfer: true, image: "linear-gradient(135deg, #1E293B 0%, #334155 100%)", specialties: [{ tr: "FUE Saç Ekimi", en: "FUE Hair Transplant" }, { tr: "DHI Saç Ekimi", en: "DHI Hair Transplant" }, { tr: "Sakal Ekimi", en: "Beard Transplant" }], shortDescription: { tr: "Türkiye'nin lider saç ekim merkezi.", en: "Turkey's leading hair transplant center." }, accreditations: ["JCI", "ISHRS Member"], services: ["VIP Transfer", "5-Star Hotel", "PRP Treatment", "Post-Op Kit"] },
  { id: "4", name: "AesthetiCare Clinic", clinicSlug: "aestheticare-clinic", type: { tr: "Estetik Cerrahi Kliniği", en: "Aesthetic Surgery Clinic" }, location: "İstanbul, Nişantaşı", rating: 4.7, reviews: 680, priceRange: "€2,000 – €6,000", languages: ["EN", "TR", "DE"], accommodation: true, transfer: true, image: "linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)", specialties: [{ tr: "Burun Estetiği", en: "Rhinoplasty" }, { tr: "Meme Estetiği", en: "Breast Augmentation" }, { tr: "Liposuction", en: "Liposuction" }], shortDescription: { tr: "Nişantaşı'nda premium estetik cerrahi.", en: "Premium aesthetic surgery in Nişantaşı." }, accreditations: ["ISAPS Member", "ISO 9001"], services: ["VIP Transfer", "Recovery Suite", "Post-Op Follow-up"] },
  { id: "5", name: "Visionary Eye Center", clinicSlug: "visionary-eye-center", type: { tr: "Göz Kliniği", en: "Eye Clinic" }, location: "İzmir, Alsancak", rating: 4.8, reviews: 540, priceRange: "€800 – €2,500", languages: ["EN", "TR"], accommodation: false, transfer: true, image: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)", specialties: [{ tr: "Lazer Göz Ameliyatı", en: "Laser Eye Surgery" }, { tr: "Katarakt", en: "Cataract Surgery" }, { tr: "Göz İçi Lens", en: "Intraocular Lens" }], shortDescription: { tr: "Ege'nin önde gelen göz sağlığı merkezi.", en: "Aegean's leading eye health center." }, accreditations: ["ISO 9001"], services: ["Transfer", "Multilingual Staff"] },
  { id: "6", name: "Fertility Plus IVF", clinicSlug: "fertility-plus-ivf", type: { tr: "Tüp Bebek Merkezi", en: "IVF Center" }, location: "Antalya, Konyaaltı", rating: 4.9, reviews: 760, priceRange: "€2,500 – €5,000", languages: ["EN", "TR", "DE", "RU"], accommodation: true, transfer: true, image: "linear-gradient(135deg, #EC4899 0%, #DB2777 100%)", specialties: [{ tr: "Tüp Bebek (IVF)", en: "IVF" }, { tr: "Yumurta Dondurma", en: "Egg Freezing" }, { tr: "Genetik Tanı", en: "Genetic Diagnosis" }], shortDescription: { tr: "Antalya'da ileri teknoloji tüp bebek tedavisi.", en: "Advanced IVF treatment in Antalya." }, accreditations: ["ESHRE Member", "Health Tourism Certificate"], services: ["Airport Transfer", "Hotel Accommodation", "Genetic Counseling"] },
  { id: "7", name: "Hospitadent Dental Group Alanya", clinicSlug: "hospitadent-dental-group-alanya", type: { tr: "Diş Kliniği", en: "Dental Clinic" }, location: "Alanya, Antalya", rating: 4.9, reviews: 2840, priceRange: "€400 – €900", languages: ["EN", "TR", "DE", "RU", "AR"], accommodation: true, transfer: true, image: "linear-gradient(135deg, #059669 0%, #047857 100%)", externalProfileUrl: "https://feelinhealthy.com/medicalcenter/hospitadent-dental-group-alanya", specialties: [{ tr: "Dental İmplant", en: "Dental Implant" }, { tr: "All-on-4 / All-on-6", en: "All-on-4 / All-on-6" }, { tr: "Zirkonyum Kaplama", en: "Zirconium Crowns" }, { tr: "Hollywood Smile", en: "Hollywood Smile" }, { tr: "Diş Beyazlatma", en: "Teeth Whitening" }], shortDescription: { tr: "Alanya'nın en büyük diş kliniği zinciri. 10+ yıllık deneyim, JCI akredite.", en: "Alanya's largest dental clinic chain. 10+ years of experience, JCI accredited." }, longDescription: { tr: "Hospitadent Dental Group, Türkiye genelinde 12 şubesiyle hizmet veren köklü bir diş kliniği zinciridir. Alanya şubemiz, uluslararası hastalara dental implant, All-on-4, All-on-6, zirkonyum kaplama, Hollywood Smile, diş beyazlatma, kanal tedavisi, ortodonti ve ağız-çene-yüz cerrahisi alanlarında kapsamlı tedavi hizmeti sunmaktadır.", en: "Hospitadent Dental Group is an established dental clinic chain serving across Turkey with 12 branches. Our Alanya branch provides comprehensive treatment services to international patients in dental implant, All-on-4, All-on-6, zirconium crowns, Hollywood Smile, teeth whitening, root canal treatment, orthodontics, and oral-maxillofacial surgery." }, accreditations: ["JCI", "ISO 9001", "Health Tourism Authorization", "TDB Member"], services: ["Airport Transfer", "Hotel Accommodation", "City Tour", "24/7 WhatsApp Support", "Panoramic X-Ray", "3D CT Scan", "Digital Smile Design"] },
];

const LANG_MAP: Record<string, string> = {
  EN: "English", TR: "Türkçe", DE: "Deutsch", AR: "العربية", RU: "Русский", FR: "Français",
};

// ═══════════════════════════════════════════════════════════════════════════════
// COLORS
// ═══════════════════════════════════════════════════════════════════════════════

const C = {
  navy: "#0F172A", navyLight: "#1E293B", teal: "#0D9488", tealLight: "#14B8A6",
  tealBg: "rgba(13,148,136,0.06)", tealBorder: "rgba(13,148,136,0.2)",
  white: "#FFFFFF", bg: "#F8FAFC", border: "#E2E8F0",
  text: "#0F172A", textSec: "#475569", textMuted: "#94A3B8",
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function ClinicProfilePage() {
  const params = useParams();
  const slug = params.clinicSlug as string;
  const [lang, setLang] = useState<Lang>("tr");
  const [clinic, setClinic] = useState<ClinicProfile | null>(null);
  const [allClinics, setAllClinics] = useState<ClinicProfile[]>(FALLBACK_CLINICS);
  const [loading, setLoading] = useState(true);
  const [leadModal, setLeadModal] = useState(false);
  const [leadDone, setLeadDone] = useState(false);
  const [leadSending, setLeadSending] = useState(false);

  const t = (k: string) => TX[lang][k] || k;

  useEffect(() => {
    // Try live data first, fallback to local
    (async () => {
      try {
        const res = await fetch("/api/public/agency/feelinhealthy/clinics");
        if (res.ok) {
          const data = await res.json();
          if (data.clinics?.length > 0) {
            const mapped: ClinicProfile[] = data.clinics.map((c: any) => ({
              id: c.id, name: c.clinicName,
              clinicSlug: c.clinicSlug || c.clinicName?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/g, "") || c.id,
              type: { tr: c.clinicType || "", en: c.clinicType || "" },
              location: c.location ? `${c.location.city}, ${c.location.country}` : "",
              rating: c.rating || 4.8, reviews: c.reviewCount || 0, priceRange: "",
              languages: (c.supportedLanguages || []).map((l: string) => l.toUpperCase()),
              accommodation: true, transfer: true,
              image: "linear-gradient(135deg, #0D9488 0%, #065F46 100%)",
              specialties: (c.subTreatments || []).map((s: string) => ({ tr: s, en: s })),
              shortDescription: c.shortDescription ? { tr: c.shortDescription, en: c.shortDescription } : undefined,
              longDescription: c.longDescription ? { tr: c.longDescription, en: c.longDescription } : undefined,
              externalProfileUrl: c.profileUrl || undefined,
              accreditations: c.accreditation || [], services: [],
            }));
            setAllClinics(mapped);
            const found = mapped.find((c: ClinicProfile) => c.clinicSlug === slug);
            if (found) { setClinic(found); setLoading(false); return; }
          }
        }
      } catch { /* use fallback */ }
      // Fallback
      const found = FALLBACK_CLINICS.find((c) => c.clinicSlug === slug);
      setClinic(found || null);
      setLoading(false);
    })();
  }, [slug]);

  const handleLeadSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLeadSending(true);
    setTimeout(() => { setLeadSending(false); setLeadDone(true); }, 1500);
  };

  const relatedClinics = allClinics.filter((c) => c.clinicSlug !== slug).slice(0, 3);

  // ── LOADING ──
  if (loading) {
    return (
      <div style={{ height: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: "'Inter', sans-serif", background: C.bg }}>
        <Loader2 size={32} color={C.teal} style={{ animation: "spin 1s linear infinite" }} />
        <p style={{ fontSize: 14, color: C.textMuted }}>{t("loading")}</p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ── NOT FOUND ──
  if (!clinic) {
    return (
      <div style={{ height: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: "'Inter', sans-serif", background: C.bg }}>
        <Building2 size={48} color={C.textMuted} />
        <h2 style={{ fontSize: 24, fontWeight: 800, color: C.navy }}>{t("notfound")}</h2>
        <p style={{ fontSize: 14, color: C.textSec }}>{t("notfound.desc")}</p>
        <Link href="/agency-demo" style={{ marginTop: 16, padding: "10px 24px", borderRadius: 10, background: C.teal, color: "#fff", fontSize: 14, fontWeight: 700, textDecoration: "none" }}>
          {t("notfound.back")}
        </Link>
      </div>
    );
  }

  // ── RENDER ──
  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", color: C.text, background: C.white, minHeight: "100vh" }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .fu{animation:fadeUp .6s ease-out forwards}
        .btn{transition:all .2s;cursor:pointer;border:none}
        .btn:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(13,148,136,.25)}
        .ch{transition:all .3s}
        .ch:hover{transform:translateY(-4px);box-shadow:0 12px 32px rgba(0,0,0,.08)}
        @media(max-width:768px){.rg{grid-template-columns:1fr!important}.sp{padding-left:20px!important;padding-right:20px!important}}
      `}</style>

      {/* DEMO BANNER */}
      <div style={{ background: C.navy, padding: "8px 16px", textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.9)", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <span>{t("demo.banner")}</span>
        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "rgba(255,255,255,0.15)", fontWeight: 700 }}>DEMO</span>
      </div>

      {/* HEADER */}
      <header style={{ position: "sticky", top: 0, zIndex: 1000, background: "rgba(255,255,255,0.97)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${C.border}` }}>
        <div className="sp" style={{ maxWidth: 1280, margin: "0 auto", padding: "0 40px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Link href="/agency-demo" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, color: C.textSec, textDecoration: "none", transition: "color .2s" }}>
              <ArrowLeft size={18} /> {t("back")}
            </Link>
          </div>
          <Link href="/agency-demo" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${C.teal}, #F97316)`, display: "flex", alignItems: "center", justifyContent: "center" }}><Heart size={16} color="#fff" fill="#fff" /></div>
            <span style={{ fontSize: 16, fontWeight: 800, color: C.navy }}>FeelinHealthy</span>
          </Link>
          <div style={{ display: "flex", borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            {(["TR", "EN"] as const).map((l) => (
              <button key={l} onClick={() => setLang(l.toLowerCase() as Lang)} style={{ padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none", background: lang === l.toLowerCase() ? C.teal : "transparent", color: lang === l.toLowerCase() ? "#fff" : C.textSec, transition: "all .2s" }}>{l}</button>
            ))}
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="fu sp" style={{ position: "relative", overflow: "hidden" }}>
        <div style={{ background: clinic.image, minHeight: 280, display: "flex", alignItems: "flex-end" }}>
          <div style={{ width: "100%", padding: "80px 40px 40px", background: "linear-gradient(0deg, rgba(0,0,0,.6) 0%, transparent 100%)" }}>
            <div style={{ maxWidth: 1280, margin: "0 auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ padding: "4px 12px", borderRadius: 6, background: "rgba(255,255,255,.2)", backdropFilter: "blur(4px)", fontSize: 12, fontWeight: 600, color: "#fff" }}>{clinic.type[lang]}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, background: "rgba(255,255,255,.2)", fontSize: 12, fontWeight: 700, color: "#fbbf24" }}>
                  <Star size={12} fill="#fbbf24" color="#fbbf24" /> {clinic.rating}
                  <span style={{ fontWeight: 400, color: "rgba(255,255,255,.8)" }}>({clinic.reviews.toLocaleString()})</span>
                </span>
              </div>
              <h1 style={{ fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 900, color: "#fff", lineHeight: 1.15, marginBottom: 12 }}>{clinic.name}</h1>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "rgba(255,255,255,.9)" }}><MapPin size={16} /> {clinic.location}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "rgba(255,255,255,.9)" }}><Globe2 size={16} /> {clinic.languages.join(", ")}</span>
                {clinic.accommodation && <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "rgba(255,255,255,.9)" }}><Hotel size={16} /> Accommodation</span>}
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button className="btn" onClick={() => { setLeadDone(false); setLeadModal(true); }} style={{ padding: "12px 28px", borderRadius: 10, background: C.teal, color: "#fff", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Send size={16} /> {t("hero.quote")}</button>
                {clinic.externalProfileUrl && (
                  <a href={clinic.externalProfileUrl} target="_blank" rel="noopener noreferrer" className="btn" style={{ padding: "12px 20px", borderRadius: 10, background: "rgba(255,255,255,.2)", backdropFilter: "blur(4px)", color: "#fff", fontSize: 13, fontWeight: 600, textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
                    <ExternalLink size={14} /> {t("profile.viewExternal")}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MAIN CONTENT */}
      <div className="sp" style={{ maxWidth: 1280, margin: "0 auto", padding: "48px 40px" }}>
        <div className="rg" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 40 }}>
          {/* LEFT COLUMN */}
          <div>
            {/* ABOUT */}
            <section className="fu" style={{ marginBottom: 48 }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: C.navy, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}><Building2 size={20} color={C.teal} /> {t("about.title")}</h2>
              {clinic.shortDescription && <p style={{ fontSize: 15, color: C.textSec, lineHeight: 1.7, marginBottom: 12 }}>{clinic.shortDescription[lang]}</p>}
              {clinic.longDescription && <p style={{ fontSize: 14, color: C.textSec, lineHeight: 1.7 }}>{clinic.longDescription[lang]}</p>}
            </section>

            {/* TREATMENTS */}
            <section className="fu" style={{ marginBottom: 48 }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: C.navy, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}><Stethoscope size={20} color={C.teal} /> {t("treatments.title")}</h2>
              <p style={{ fontSize: 14, color: C.textSec, marginBottom: 20 }}>{t("treatments.sub")}</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                {clinic.specialties.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 12, background: C.bg, border: `1px solid ${C.border}` }}>
                    <CheckCircle2 size={16} color={C.teal} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{s[lang]}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* ACCREDITATIONS */}
            {clinic.accreditations && clinic.accreditations.length > 0 && (
              <section className="fu" style={{ marginBottom: 48 }}>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: C.navy, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}><Award size={20} color={C.teal} /> {t("accred.title")}</h2>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {clinic.accreditations.map((a, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, background: C.tealBg, border: `1px solid ${C.tealBorder}` }}>
                      <Shield size={14} color={C.teal} /><span style={{ fontSize: 13, fontWeight: 600, color: C.teal }}>{a}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* SERVICES */}
            {clinic.services && clinic.services.length > 0 && (
              <section className="fu" style={{ marginBottom: 48 }}>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: C.navy, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}><Heart size={20} color={C.teal} /> {t("services.title")}</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                  {clinic.services.map((s, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: C.bg }}>
                      <CheckCircle2 size={14} color="#22c55e" /><span style={{ fontSize: 13, color: C.text }}>{s}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* RIGHT SIDEBAR */}
          <div>
            {/* SUMMARY CARD */}
            <div style={{ position: "sticky", top: 80, display: "flex", flexDirection: "column", gap: 24 }}>
              <div style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: "0 4px 16px rgba(0,0,0,.05)", overflow: "hidden" }}>
                <div style={{ background: clinic.image, padding: "20px 24px", minHeight: 60, display: "flex", alignItems: "flex-end" }}>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,.3)" }}>{clinic.name}</h3>
                </div>
                <div style={{ padding: 24 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span style={{ color: C.textMuted }}>{t("location.title")}</span>
                      <span style={{ fontWeight: 600 }}>{clinic.location}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span style={{ color: C.textMuted }}>{t("pricing.title")}</span>
                      <span style={{ fontWeight: 700, color: C.teal }}>{clinic.priceRange}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span style={{ color: C.textMuted }}>Rating</span>
                      <span style={{ fontWeight: 700, color: "#f59e0b", display: "flex", alignItems: "center", gap: 3 }}><Star size={12} fill="#f59e0b" color="#f59e0b" /> {clinic.rating} ({clinic.reviews.toLocaleString()})</span>
                    </div>
                    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 4 }}>
                      <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>{t("langs.title")}</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {clinic.languages.map((l) => (
                          <span key={l} style={{ padding: "4px 10px", borderRadius: 6, background: C.bg, fontSize: 12, fontWeight: 600, color: C.text }}>{LANG_MAP[l] || l}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <button className="btn" onClick={() => { setLeadDone(false); setLeadModal(true); }} style={{ width: "100%", marginTop: 20, padding: "12px 0", borderRadius: 10, background: `linear-gradient(135deg, ${C.teal}, ${C.navy})`, color: "#fff", fontSize: 14, fontWeight: 700 }}>{t("hero.quote")}</button>
                </div>
              </div>

              <p style={{ fontSize: 11, color: C.textMuted, textAlign: "center", lineHeight: 1.5 }}>{t("pricing.note")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA SECTION */}
      <section className="sp" style={{ padding: "60px 40px", background: `linear-gradient(135deg, ${C.navy}, ${C.teal})` }}>
        <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(22px, 3vw, 32px)", fontWeight: 800, color: "#fff", marginBottom: 12 }}>{t("cta.title")}</h2>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,.8)", marginBottom: 28 }}>{t("cta.sub")}</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn" onClick={() => { setLeadDone(false); setLeadModal(true); }} style={{ padding: "14px 32px", borderRadius: 12, background: "#fff", color: C.navy, fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Send size={16} /> {t("cta.quote")}</button>
            <Link href="/agency-demo#ai-section" className="btn" style={{ padding: "14px 28px", borderRadius: 12, background: "rgba(255,255,255,.15)", color: "#fff", fontSize: 15, fontWeight: 600, textDecoration: "none", display: "flex", alignItems: "center", gap: 8, backdropFilter: "blur(4px)" }}><Sparkles size={16} /> {t("cta.ai")}</Link>
          </div>
        </div>
      </section>

      {/* RELATED CLINICS */}
      {relatedClinics.length > 0 && (
        <section className="sp" style={{ padding: "60px 40px", background: C.bg }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 36 }}>
              <h2 style={{ fontSize: "clamp(22px, 3vw, 30px)", fontWeight: 800, color: C.navy }}>{t("related.title")}</h2>
              <p style={{ fontSize: 14, color: C.textSec, marginTop: 6 }}>{t("related.sub")}</p>
            </div>
            <div className="rg" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
              {relatedClinics.map((rc) => (
                <Link href={`/agency-demo/medicalcenter/${rc.clinicSlug}`} key={rc.id} className="ch" style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden", textDecoration: "none", color: "inherit" }}>
                  <div style={{ height: 60, background: rc.image, display: "flex", alignItems: "flex-end", padding: "0 14px 8px" }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,.85)", background: "rgba(0,0,0,.2)", padding: "2px 6px", borderRadius: 4 }}>{rc.type[lang]}</span>
                  </div>
                  <div style={{ padding: "12px 16px" }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, color: C.navy, marginBottom: 4 }}>{rc.name}</h4>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: C.textSec }}>
                      <MapPin size={11} color={C.teal} /> {rc.location}
                      <span style={{ marginLeft: "auto", fontWeight: 700, color: "#f59e0b", display: "flex", alignItems: "center", gap: 2 }}><Star size={10} fill="#f59e0b" color="#f59e0b" /> {rc.rating}</span>
                    </div>
                    <p style={{ fontSize: 12, fontWeight: 700, color: C.teal, marginTop: 6 }}>{rc.priceRange}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* FOOTER */}
      <footer style={{ background: C.navy, color: "rgba(255,255,255,.6)", padding: "24px 40px", textAlign: "center" }}>
        <p style={{ fontSize: 12 }}>© 2026 FeelinHealthy. {t("footer.rights")}</p>
        <p style={{ fontSize: 11, marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}><Sparkles size={10} color={C.tealLight} /> {t("footer.poweredBy")}</p>
      </footer>

      {/* LEAD MODAL */}
      {leadModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)", padding: 20 }} onClick={() => setLeadModal(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 20, width: "100%", maxWidth: 480, boxShadow: "0 24px 48px rgba(0,0,0,.15)", overflow: "hidden", animation: "fadeUp .3s ease" }}>
            {leadDone ? (
              <div style={{ padding: 48, textAlign: "center" }}>
                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(34,197,94,.1)", margin: "0 auto 20px", display: "flex", alignItems: "center", justifyContent: "center" }}><CheckCircle2 size={32} color="#22c55e" /></div>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: C.navy, marginBottom: 8 }}>{t("lead.ok.title")}</h3>
                <p style={{ fontSize: 14, color: C.textSec, marginBottom: 24 }}>{t("lead.ok.desc")}</p>
                <button className="btn" onClick={() => setLeadModal(false)} style={{ padding: "10px 28px", borderRadius: 10, background: C.teal, color: "#fff", fontSize: 14, fontWeight: 700 }}>{t("lead.close")}</button>
              </div>
            ) : (
              <>
                <div style={{ padding: "24px 28px", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <h3 style={{ fontSize: 18, fontWeight: 800, color: C.navy }}>{t("lead.title")}</h3>
                      <p style={{ fontSize: 13, color: C.textSec, marginTop: 4 }}>{t("lead.sub")}</p>
                    </div>
                    <button onClick={() => setLeadModal(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><X size={20} color={C.textMuted} /></button>
                  </div>
                  <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, background: C.tealBg }}>
                    <Building2 size={14} color={C.teal} /><span style={{ fontSize: 13, fontWeight: 600, color: C.teal }}>{clinic.name}</span>
                  </div>
                </div>
                <form onSubmit={handleLeadSubmit} style={{ padding: "24px 28px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {(["name", "email", "phone", "country"] as const).map((k) => (
                      <div key={k}>
                        <label style={{ fontSize: 12.5, fontWeight: 600, color: C.textSec, marginBottom: 4, display: "block" }}>{t(`lead.${k}`)}</label>
                        <input name={k} type={k === "email" ? "email" : k === "phone" ? "tel" : "text"} required={k !== "phone"} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, outline: "none", color: C.text, background: C.bg }} />
                      </div>
                    ))}
                    <div>
                      <label style={{ fontSize: 12.5, fontWeight: 600, color: C.textSec, marginBottom: 4, display: "block" }}>{t("lead.message")}</label>
                      <textarea name="message" rows={3} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, outline: "none", resize: "none", fontFamily: "inherit", color: C.text, background: C.bg }} />
                    </div>
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", fontSize: 12.5, color: C.textSec }}>
                      <input type="checkbox" required style={{ width: 16, height: 16, marginTop: 2, accentColor: C.teal }} /> {t("lead.consent")}
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                    <button type="button" onClick={() => setLeadModal(false)} style={{ flex: 1, padding: "12px 0", borderRadius: 10, background: C.bg, border: `1px solid ${C.border}`, color: C.textSec, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{t("lead.close")}</button>
                    <button type="submit" className="btn" disabled={leadSending} style={{ flex: 2, padding: "12px 0", borderRadius: 10, background: `linear-gradient(135deg, ${C.teal}, ${C.navy})`, color: "#fff", fontSize: 14, fontWeight: 700, opacity: leadSending ? .7 : 1 }}>
                      {leadSending ? t("lead.sending") : t("lead.submit")}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
