"use client";

import { useState, useRef, useEffect, Fragment } from "react";
import {
  Search, MapPin, Stethoscope, Star, Globe2, Hotel, Car, MessageSquare,
  ChevronRight, Send, Bot, User, Heart, Eye, Baby, Scissors, Sparkles,
  Phone, Mail, Shield, CheckCircle2, ArrowRight, Menu, X,
  Building2, Clock, Award, TrendingUp, Loader2, FileText, ExternalLink,
  Plane, CreditCard, Languages,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════════
// LANGUAGE
// ═══════════════════════════════════════════════════════════════════════════════

type Lang = "tr" | "en";

const TX: Record<Lang, Record<string, string>> = {
  tr: {
    "nav.home": "Ana Sayfa", "nav.treatments": "Tedaviler", "nav.clinics": "Klinikler",
    "nav.how": "Nasıl Çalışır?", "nav.contact": "İletişim",
    "demo.banner": "🎯 Bu sayfa ClinicBridge AI demo deneyimidir",
    "hero.badge": "AI Destekli Klinik Eşleştirme",
    "hero.title": "Sağlık Turizminizde Doğru Kliniği",
    "hero.titleHighlight": "Yapay Zekâ ile Bulun",
    "hero.sub": "Tedavi ihtiyacınızı anlatın — ClinicBridge AI size Türkiye'nin en iyi kliniklerini, fiyat karşılaştırmalarını ve kişiselleştirilmiş önerileri saniyeler içinde sunsun.",
    "hero.cta": "AI ile Klinik Bul",
    "hero.cta2": "Tedavilere Göz At",
    "stat.clinics": "Partnör Klinik", "stat.patients": "Hasta Memnuniyeti",
    "stat.countries": "Ülkeden Hasta", "stat.savings": "Tasarruf",

    "ai.badge": "ClinicBridge AI Asistan",
    "ai.title": "Tedavi ihtiyacınızı yapay zekâya anlatın",
    "ai.sub": "Doğal dilde yazın, AI size en uygun klinikleri bulsun.",
    "ai.placeholder": "Örn: İstanbul'da implant yaptırmak istiyorum. Bütçem 3.000€ civarı. İngilizce konuşan ve konaklama desteği olan klinikler önceliğim.",
    "ai.send": "Klinik Bul",
    "ai.powered": "ClinicBridge AI tarafından desteklenmektedir",
    "ai.greeting": "Merhaba! 👋 Ben FeelinHealthy AI asistanınızım. Hangi tedaviyi arıyorsunuz? Bütçe, lokasyon ve tercihlerinizi yazın — size en uygun klinikleri bulayım.",
    "ai.typing": "AI analiz ediyor...",
    "ai.r1": "Anladım! İstanbul'da diş implantı tedavisi arıyorsunuz. Bütçeniz ~3.000€ ve İngilizce konuşan, konaklama destekli klinikler tercih ediyorsunuz. Hemen eşleştirme yapıyorum...",
    "ai.r2": "3 klinik önerisi hazırladım! Her birinin AI eşleşme oranı, tahmini fiyat aralığı ve detaylarını aşağıda görebilirsiniz. 👇",

    "rec.title": "AI Klinik Önerileri",
    "rec.sub": "Kriterlerinize göre eşleştirilen klinikler",
    "rec.match": "AI Eşleşme", "rec.price": "Tahmini Fiyat", "rec.rating": "Puan",
    "rec.langs": "Diller", "rec.accom": "Konaklama", "rec.transfer": "Transfer",
    "rec.included": "Dahil", "rec.quote": "Teklif İste", "rec.details": "Detaylar",
    "rec.profile": "Profili Gör", "rec.moreInfo": "Daha Fazla Bilgi",

    "steps.title": "Nasıl Çalışır?", "steps.sub": "3 adımda doğru kliniği bulun",
    "steps.1.title": "İhtiyacınızı AI'ya Anlatın",
    "steps.1.desc": "Tedavi ihtiyacınızı, bütçenizi ve tercihlerinizi doğal dilde yazın.",
    "steps.2.title": "Klinik ve Teklifleri Karşılaştırın",
    "steps.2.desc": "AI önerilen kliniklerin fiyat, hizmet ve hasta yorumlarını karşılaştırın.",
    "steps.3.title": "Tedavinizi Başlatın",
    "steps.3.desc": "Kliniğinizi seçin, teklif alın ve tedavi sürecini başlatın.",

    "treat.title": "Tedavi Kategorileri",
    "treat.sub": "Geniş tedavi yelpazesinde AI destekli eşleştirme",
    "treat.dental": "Diş Tedavisi", "treat.hair": "Saç Ekimi", "treat.aesthetic": "Estetik Cerrahi",
    "treat.eye": "Göz Tedavisi", "treat.ivf": "Tüp Bebek", "treat.bariatric": "Obezite Cerrahisi",
    "treat.dental.d": "İmplant · Zirkonyum · Hollywood Smile", "treat.hair.d": "FUE · DHI · Sakal Ekimi",
    "treat.aesthetic.d": "Burun · Meme · Liposuction", "treat.eye.d": "Lazer · Katarakt · Göz İçi Lens",
    "treat.ivf.d": "IVF · Yumurta Dondurma · PGT", "treat.bariatric.d": "Mide Küçültme · Tüp Mide",

    "clinics.title": "Partnör Kliniklerimiz", "clinics.sub": "Türkiye'nin en iyi sağlık turizmi klinikleri",

    "lead.title": "Teklif Talebi", "lead.sub": "Bilgilerinizi bırakın, kliniklerden teklif alalım.",
    "lead.name": "Ad Soyad", "lead.email": "E-posta", "lead.phone": "Telefon",
    "lead.country": "Ülke", "lead.message": "Mesajınız",
    "lead.consent": "KVKK/GDPR kapsamında kişisel verilerimin işlenmesini kabul ediyorum.",
    "lead.submit": "Teklif İste", "lead.sending": "Gönderiliyor...",
    "lead.ok.title": "Talebiniz Alındı! ✅", "lead.ok.desc": "Seçtiğiniz kliniklerden en kısa sürede teklifler iletilecektir.",
    "lead.close": "Kapat",

    "footer.desc": "FeelinHealthy — ClinicBridge AI destekli sağlık turizmi platformu.",
    "footer.links": "Hızlı Linkler", "footer.legal": "Yasal",
    "footer.privacy": "Gizlilik Politikası", "footer.terms": "Kullanım Koşulları", "footer.kvkk": "KVKK",
    "footer.rights": "Tüm hakları saklıdır.",
    "footer.poweredBy": "ClinicBridge AI altyapısı ile desteklenmektedir",
  },
  en: {
    "nav.home": "Home", "nav.treatments": "Treatments", "nav.clinics": "Clinics",
    "nav.how": "How It Works", "nav.contact": "Contact",
    "demo.banner": "🎯 This page is a ClinicBridge AI demo experience",
    "hero.badge": "AI-Powered Clinic Matching",
    "hero.title": "Find the Right Clinic for Your",
    "hero.titleHighlight": "Health Tourism with AI",
    "hero.sub": "Tell us your treatment needs — ClinicBridge AI will recommend Turkey's best clinics, price comparisons, and personalized suggestions in seconds.",
    "hero.cta": "Find Clinics with AI",
    "hero.cta2": "Browse Treatments",
    "stat.clinics": "Partner Clinics", "stat.patients": "Patient Satisfaction",
    "stat.countries": "Patient Countries", "stat.savings": "Average Savings",

    "ai.badge": "ClinicBridge AI Assistant",
    "ai.title": "Tell AI about your treatment needs",
    "ai.sub": "Write in natural language — AI will find the best clinics for you.",
    "ai.placeholder": "E.g.: I want to get dental implants in Istanbul. My budget is around €3,000. I prefer English-speaking clinics with accommodation support.",
    "ai.send": "Find Clinics",
    "ai.powered": "Powered by ClinicBridge AI",
    "ai.greeting": "Hello! 👋 I'm your FeelinHealthy AI assistant. What treatment are you looking for? Tell me your budget, location, and preferences — I'll find the best clinics for you.",
    "ai.typing": "AI is analyzing...",
    "ai.r1": "Got it! You're looking for dental implant treatment in Istanbul. Your budget is ~€3,000 and you prefer English-speaking clinics with accommodation support. Let me match you now...",
    "ai.r2": "I've prepared 3 clinic recommendations! You can see each clinic's AI match score, estimated price range, and details below. 👇",

    "rec.title": "AI Clinic Recommendations",
    "rec.sub": "Clinics matched based on your criteria",
    "rec.match": "AI Match", "rec.price": "Est. Price", "rec.rating": "Rating",
    "rec.langs": "Languages", "rec.accom": "Accommodation", "rec.transfer": "Transfer",
    "rec.included": "Included", "rec.quote": "Request Quote", "rec.details": "Details",
    "rec.profile": "View Profile", "rec.moreInfo": "More Information",

    "steps.title": "How It Works", "steps.sub": "Find the right clinic in 3 steps",
    "steps.1.title": "Tell AI Your Needs",
    "steps.1.desc": "Describe your treatment needs, budget, and preferences in natural language.",
    "steps.2.title": "Compare Clinics & Offers",
    "steps.2.desc": "Compare prices, services, and patient reviews of AI-recommended clinics.",
    "steps.3.title": "Start Your Treatment",
    "steps.3.desc": "Choose your clinic, request a quote, and start your treatment journey.",

    "treat.title": "Treatment Categories",
    "treat.sub": "AI-powered clinic matching across a wide range of treatments",
    "treat.dental": "Dental", "treat.hair": "Hair Transplant", "treat.aesthetic": "Aesthetic Surgery",
    "treat.eye": "Eye Treatments", "treat.ivf": "IVF", "treat.bariatric": "Bariatric Surgery",
    "treat.dental.d": "Implant · Zirconium · Hollywood Smile", "treat.hair.d": "FUE · DHI · Beard Transplant",
    "treat.aesthetic.d": "Rhinoplasty · Breast · Liposuction", "treat.eye.d": "Laser · Cataract · IOL",
    "treat.ivf.d": "IVF · Egg Freezing · PGT", "treat.bariatric.d": "Gastric Sleeve · Gastric Bypass",

    "clinics.title": "Our Partner Clinics", "clinics.sub": "Turkey's top-rated health tourism clinics",

    "lead.title": "Quote Request", "lead.sub": "Leave your details and we'll get quotes from selected clinics.",
    "lead.name": "Full Name", "lead.email": "Email", "lead.phone": "Phone",
    "lead.country": "Country", "lead.message": "Your Message",
    "lead.consent": "I consent to the processing of my personal data under GDPR/KVKK.",
    "lead.submit": "Request Quote", "lead.sending": "Submitting...",
    "lead.ok.title": "Request Received! ✅", "lead.ok.desc": "You will receive quotes from selected clinics shortly.",
    "lead.close": "Close",

    "footer.desc": "FeelinHealthy — AI-powered health tourism platform by ClinicBridge.",
    "footer.links": "Quick Links", "footer.legal": "Legal",
    "footer.privacy": "Privacy Policy", "footer.terms": "Terms of Service", "footer.kvkk": "KVKK Notice",
    "footer.rights": "All rights reserved.",
    "footer.poweredBy": "Powered by ClinicBridge AI infrastructure",
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// DEMO CLINICS — with real FeelinHealthy profile links
// ═══════════════════════════════════════════════════════════════════════════════

interface Clinic {
  id: string; name: string; type: { tr: string; en: string }; location: string;
  rating: number; reviews: number; price: string; matchScore?: number;
  languages: string[]; accommodation: boolean; transfer: boolean;
  gradient: string; profileUrl: string;
  specialties: { tr: string; en: string }[];
}

const CLINICS: Clinic[] = [
  {
    id: "1", name: "Hospitadent Dental Group",
    type: { tr: "Diş Kliniği", en: "Dental Clinic" },
    location: "İstanbul, Pendik", rating: 4.9, reviews: 2840, price: "€400 – €1,200", matchScore: 97,
    languages: ["EN", "TR", "DE", "AR", "RU"], accommodation: true, transfer: true,
    gradient: "linear-gradient(135deg, #0D9488 0%, #065F46 100%)",
    profileUrl: "https://www.feelinhealthy.com/medicalcenter/hospitadent-dental-group-pendik",
    specialties: [{ tr: "Dental İmplant", en: "Dental Implant" }, { tr: "Zirkonyum Kaplama", en: "Zirconium Crown" }, { tr: "Hollywood Smile", en: "Hollywood Smile" }],
  },
  {
    id: "2", name: "DentGroup Clinics",
    type: { tr: "Diş Kliniği", en: "Dental Clinic" },
    location: "İstanbul, Maslak", rating: 4.8, reviews: 1960, price: "€350 – €950", matchScore: 93,
    languages: ["EN", "TR", "DE", "FR"], accommodation: true, transfer: true,
    gradient: "linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)",
    profileUrl: "https://www.feelinhealthy.com/medicalcenter/dentgroup-maslak",
    specialties: [{ tr: "Dental İmplant", en: "Dental Implant" }, { tr: "Diş Beyazlatma", en: "Teeth Whitening" }, { tr: "Gülüş Tasarımı", en: "Smile Design" }],
  },
  {
    id: "3", name: "Vera Clinic",
    type: { tr: "Saç Ekim Merkezi", en: "Hair Transplant Center" },
    location: "İstanbul, Şişli", rating: 4.9, reviews: 3200, price: "€1,500 – €3,500", matchScore: 95,
    languages: ["EN", "TR", "AR", "FR", "ES"], accommodation: true, transfer: true,
    gradient: "linear-gradient(135deg, #1E293B 0%, #334155 100%)",
    profileUrl: "https://www.feelinhealthy.com/medicalcenter/vera-clinic",
    specialties: [{ tr: "FUE Saç Ekimi", en: "FUE Hair Transplant" }, { tr: "DHI Saç Ekimi", en: "DHI Hair Transplant" }, { tr: "Sakal Ekimi", en: "Beard Transplant" }],
  },
  {
    id: "4", name: "Estetik International",
    type: { tr: "Estetik Cerrahi Kliniği", en: "Aesthetic Surgery Clinic" },
    location: "İstanbul, Nişantaşı", rating: 4.8, reviews: 1680, price: "€2,000 – €7,000",
    languages: ["EN", "TR", "DE", "RU"], accommodation: true, transfer: true,
    gradient: "linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)",
    profileUrl: "https://www.feelinhealthy.com/medicalcenter/estetik-international",
    specialties: [{ tr: "Burun Estetiği", en: "Rhinoplasty" }, { tr: "Meme Estetiği", en: "Breast Augmentation" }, { tr: "Yüz Germe", en: "Facelift" }],
  },
  {
    id: "5", name: "Dünyagöz Hospital",
    type: { tr: "Göz Hastanesi", en: "Eye Hospital" },
    location: "İstanbul, Altunizade", rating: 4.7, reviews: 2100, price: "€800 – €2,500",
    languages: ["EN", "TR", "AR", "RU"], accommodation: false, transfer: true,
    gradient: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)",
    profileUrl: "https://www.feelinhealthy.com/medicalcenter/dunyagoz",
    specialties: [{ tr: "Lazer Göz Ameliyatı", en: "Laser Eye Surgery" }, { tr: "Katarakt", en: "Cataract" }, { tr: "ReLEx SMILE", en: "ReLEx SMILE" }],
  },
  {
    id: "6", name: "Memorial Bahçelievler IVF",
    type: { tr: "Tüp Bebek Merkezi", en: "IVF Center" },
    location: "İstanbul, Bahçelievler", rating: 4.9, reviews: 1340, price: "€2,500 – €5,500",
    languages: ["EN", "TR", "DE", "RU", "AR"], accommodation: true, transfer: true,
    gradient: "linear-gradient(135deg, #EC4899 0%, #DB2777 100%)",
    profileUrl: "https://www.feelinhealthy.com/medicalcenter/memorial-ivf",
    specialties: [{ tr: "Tüp Bebek (IVF)", en: "IVF" }, { tr: "Yumurta Dondurma", en: "Egg Freezing" }, { tr: "PGT Genetik Tanı", en: "PGT Genetic Diagnosis" }],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// COLORS
// ═══════════════════════════════════════════════════════════════════════════════

const C = {
  primary: "#0D9488", primaryDark: "#065F46", primaryLight: "#14B8A6",
  primaryBg: "rgba(13, 148, 136, 0.06)", primaryBorder: "rgba(13, 148, 136, 0.2)",
  navy: "#0F172A", navyLight: "#1E293B",
  accent: "#F97316",
  white: "#FFFFFF", bg: "#F8FAFC", bgWarm: "#FFFBF5",
  border: "#E2E8F0", text: "#0F172A", textSec: "#475569", textMuted: "#94A3B8",
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function FeelinHealthyDemo() {
  const [lang, setLang] = useState<Lang>("tr");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiMsgs, setAiMsgs] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const [aiTyping, setAiTyping] = useState(false);
  const [showRecs, setShowRecs] = useState(false);
  const [leadModal, setLeadModal] = useState(false);
  const [leadClinic, setLeadClinic] = useState("");
  const [leadDone, setLeadDone] = useState(false);
  const [leadSending, setLeadSending] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  const t = (k: string) => TX[lang][k] || k;

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [aiMsgs, aiTyping]);

  const sendAi = () => {
    if (!aiInput.trim() || aiTyping) return;
    const msg = aiInput; setAiInput("");
    setAiMsgs((p) => [...p, { role: "user", text: msg }]);
    setAiTyping(true);
    setTimeout(() => {
      setAiMsgs((p) => [...p, { role: "ai", text: t("ai.r1") }]); setAiTyping(false);
      setTimeout(() => { setAiTyping(true);
        setTimeout(() => { setAiMsgs((p) => [...p, { role: "ai", text: t("ai.r2") }]); setAiTyping(false); setShowRecs(true); }, 2000);
      }, 800);
    }, 2000);
  };

  const openLead = (clinic: string) => { setLeadClinic(clinic); setLeadDone(false); setLeadModal(true); };
  const submitLead = (e: React.FormEvent) => { e.preventDefault(); setLeadSending(true); setTimeout(() => { setLeadSending(false); setLeadDone(true); }, 1500); };
  const scrollTo = (id: string) => { document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); setMobileMenu(false); };

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", color: C.text, background: C.white, minHeight: "100vh" }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .fu{animation:fadeUp .6s ease-out forwards}
        .btn{transition:all .2s;cursor:pointer;border:none}
        .btn:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(13,148,136,.25)}
        .ch{transition:all .3s}
        .ch:hover{transform:translateY(-4px);box-shadow:0 12px 32px rgba(0,0,0,.08)}
        .nl{transition:color .2s;cursor:pointer;background:none;border:none;font-size:14px;font-weight:500;color:${C.textSec}}
        .nl:hover{color:${C.primary}}
        @media(max-width:768px){.dn{display:none!important}.mg{display:flex!important}
          .rg{grid-template-columns:1fr!important}.rg2{grid-template-columns:repeat(2,1fr)!important}
          .sp{padding-left:20px!important;padding-right:20px!important}}
      `}</style>

      {/* DEMO BANNER */}
      <div style={{ background: C.navy, padding: "8px 16px", textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.9)", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <span>{t("demo.banner")}</span>
        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "rgba(255,255,255,0.15)", fontWeight: 700 }}>DEMO</span>
      </div>

      {/* HEADER */}
      <header style={{ position: "sticky", top: 0, zIndex: 1000, background: "rgba(255,255,255,0.97)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${C.border}` }}>
        <div className="sp" style={{ maxWidth: 1280, margin: "0 auto", padding: "0 40px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Heart size={18} color="#fff" fill="#fff" />
            </div>
            <span style={{ fontSize: 18, fontWeight: 800, color: C.navy, letterSpacing: "-0.03em" }}>
              Feelin<span style={{ color: C.primary }}>Healthy</span>
            </span>
          </div>
          <nav className="dn" style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <button className="nl" onClick={() => scrollTo("hero")}>{t("nav.home")}</button>
            <button className="nl" onClick={() => scrollTo("treatments")}>{t("nav.treatments")}</button>
            <button className="nl" onClick={() => scrollTo("clinics")}>{t("nav.clinics")}</button>
            <button className="nl" onClick={() => scrollTo("steps")}>{t("nav.how")}</button>
            <button className="nl" onClick={() => scrollTo("footer")}>{t("nav.contact")}</button>
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden" }}>
              {(["TR", "EN"] as const).map((l) => (
                <button key={l} onClick={() => setLang(l.toLowerCase() as Lang)} style={{ padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none", background: lang === l.toLowerCase() ? C.primary : "transparent", color: lang === l.toLowerCase() ? "#fff" : C.textSec, transition: "all .2s" }}>{l}</button>
              ))}
            </div>
            <button className="mg" style={{ display: "none", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", cursor: "pointer" }} onClick={() => setMobileMenu(!mobileMenu)}>
              {mobileMenu ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {mobileMenu && (
          <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 10 }}>
            {["hero", "treatments", "clinics", "steps", "footer"].map((id, i) => (
              <button key={id} className="nl" onClick={() => scrollTo(id)} style={{ textAlign: "left", padding: "8px 0", fontSize: 15 }}>
                {t(`nav.${["home", "treatments", "clinics", "how", "contact"][i]}`)}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* HERO */}
      <section id="hero" className="sp" style={{ padding: "80px 40px 60px", background: `linear-gradient(180deg, ${C.bgWarm} 0%, ${C.white} 100%)` }}>
        <div className="fu" style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 16px", borderRadius: 20, background: C.primaryBg, border: `1px solid ${C.primaryBorder}`, marginBottom: 24 }}>
            <Sparkles size={14} color={C.primary} />
            <span style={{ fontSize: 13, fontWeight: 600, color: C.primary }}>{t("hero.badge")}</span>
          </div>
          <h1 style={{ fontSize: "clamp(32px,5vw,52px)", fontWeight: 900, color: C.navy, lineHeight: 1.12, letterSpacing: "-0.03em", marginBottom: 20 }}>
            {t("hero.title")}<br />
            <span style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {t("hero.titleHighlight")}
            </span>
          </h1>
          <p style={{ fontSize: "clamp(16px,2vw,18px)", color: C.textSec, lineHeight: 1.6, maxWidth: 620, margin: "0 auto 36px" }}>
            {t("hero.sub")}
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn" onClick={() => scrollTo("ai-section")} style={{ padding: "14px 32px", borderRadius: 12, background: `linear-gradient(135deg, ${C.primary}, ${C.navy})`, color: "#fff", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
              <Bot size={18} /> {t("hero.cta")}
            </button>
            <button className="btn" onClick={() => scrollTo("treatments")} style={{ padding: "14px 28px", borderRadius: 12, background: C.white, color: C.text, fontSize: 15, fontWeight: 600, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
              {t("hero.cta2")} <ChevronRight size={16} />
            </button>
          </div>
        </div>
        {/* Stats */}
        <div className="rg2 fu" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, maxWidth: 800, margin: "64px auto 0" }}>
          {[
            { val: "65+", label: t("stat.clinics"), icon: <Building2 size={20} /> },
            { val: "98%", label: t("stat.patients"), icon: <Star size={20} /> },
            { val: "40+", label: t("stat.countries"), icon: <Globe2 size={20} /> },
            { val: "70%", label: t("stat.savings"), icon: <TrendingUp size={20} /> },
          ].map((s) => (
            <div key={s.label} style={{ textAlign: "center", padding: 16, borderRadius: 14, background: C.white, border: `1px solid ${C.border}` }}>
              <div style={{ color: C.primary, marginBottom: 8, display: "flex", justifyContent: "center" }}>{s.icon}</div>
              <p style={{ fontSize: 28, fontWeight: 900, color: C.navy, letterSpacing: "-0.02em" }}>{s.val}</p>
              <p style={{ fontSize: 12, color: C.textMuted, marginTop: 4, fontWeight: 500 }}>{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* AI ASSISTANT */}
      <section id="ai-section" className="sp" style={{ padding: "80px 40px", background: C.white }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 16px", borderRadius: 20, background: C.primaryBg, border: `1px solid ${C.primaryBorder}`, marginBottom: 16 }}>
              <Bot size={14} color={C.primary} /> <span style={{ fontSize: 13, fontWeight: 600, color: C.primary }}>{t("ai.badge")}</span>
            </div>
            <h2 style={{ fontSize: "clamp(24px,4vw,36px)", fontWeight: 800, color: C.navy }}>{t("ai.title")}</h2>
            <p style={{ fontSize: 15, color: C.textSec, marginTop: 8 }}>{t("ai.sub")}</p>
          </div>
          <div style={{ background: C.bg, borderRadius: 20, border: `1px solid ${C.border}`, boxShadow: "0 8px 32px rgba(0,0,0,0.05)", overflow: "hidden" }}>
            <div style={{ padding: 24, minHeight: 200, maxHeight: 400, overflowY: "auto" }}>
              {aiMsgs.length === 0 && (
                <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg, ${C.primary}, ${C.navy})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Bot size={18} color="#fff" /></div>
                  <div style={{ background: C.white, padding: "12px 16px", borderRadius: "4px 16px 16px 16px", border: `1px solid ${C.border}`, maxWidth: "85%", fontSize: 14, lineHeight: 1.6 }}>{t("ai.greeting")}</div>
                </div>
              )}
              {aiMsgs.map((m, i) => (
                <div key={i} style={{ display: "flex", gap: 12, marginBottom: 16, flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, background: m.role === "user" ? C.navyLight : `linear-gradient(135deg, ${C.primary}, ${C.navy})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {m.role === "user" ? <User size={18} color="#fff" /> : <Bot size={18} color="#fff" />}
                  </div>
                  <div style={{ background: m.role === "user" ? C.navy : C.white, color: m.role === "user" ? "#fff" : C.text, padding: "12px 16px", borderRadius: m.role === "user" ? "16px 4px 16px 16px" : "4px 16px 16px 16px", border: m.role === "user" ? "none" : `1px solid ${C.border}`, maxWidth: "85%", fontSize: 14, lineHeight: 1.6 }}>{m.text}</div>
                </div>
              ))}
              {aiTyping && (
                <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg, ${C.primary}, ${C.navy})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Bot size={18} color="#fff" /></div>
                  <div style={{ background: C.white, padding: "12px 16px", borderRadius: "4px 16px 16px 16px", border: `1px solid ${C.border}`, fontSize: 13, color: C.primary, display: "flex", alignItems: "center", gap: 8, animation: "pulse 1.5s infinite" }}>
                    <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> {t("ai.typing")}
                  </div>
                </div>
              )}
              <div ref={chatEnd} />
            </div>
            <div style={{ padding: "16px 24px", borderTop: `1px solid ${C.border}`, background: C.white }}>
              <div style={{ display: "flex", gap: 10 }}>
                <textarea value={aiInput} onChange={(e) => setAiInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAi(); } }} placeholder={t("ai.placeholder")} rows={2}
                  style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: `1px solid ${C.border}`, fontSize: 14, resize: "none", outline: "none", fontFamily: "inherit", color: C.text, background: C.bg, lineHeight: 1.5 }} />
                <button className="btn" onClick={sendAi} disabled={aiTyping} style={{ padding: "0 24px", borderRadius: 12, background: `linear-gradient(135deg, ${C.primary}, ${C.navy})`, color: "#fff", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8, opacity: aiTyping ? 0.6 : 1, alignSelf: "flex-end", height: 48 }}>
                  <Send size={16} /> {t("ai.send")}
                </button>
              </div>
              <p style={{ fontSize: 11, color: C.textMuted, marginTop: 8, textAlign: "center" }}><Sparkles size={10} style={{ display: "inline", verticalAlign: "middle" }} /> {t("ai.powered")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* AI RECOMMENDATIONS */}
      {showRecs && (
        <section className="sp fu" style={{ padding: "60px 40px 80px", background: C.bg }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <h2 style={{ fontSize: "clamp(24px,4vw,32px)", fontWeight: 800, color: C.navy }}>{t("rec.title")}</h2>
              <p style={{ fontSize: 15, color: C.textSec, marginTop: 8 }}>{t("rec.sub")}</p>
            </div>
            <div className="rg" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
              {CLINICS.slice(0, 3).map((cl) => (
                <div key={cl.id} className="ch" style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                  <div style={{ height: 100, background: cl.gradient, position: "relative", display: "flex", alignItems: "flex-end", padding: 16 }}>
                    <div style={{ position: "absolute", top: 12, right: 12, padding: "4px 10px", borderRadius: 8, background: "rgba(255,255,255,.95)", fontSize: 12, fontWeight: 800, color: C.primary }}>{t("rec.match")}: {cl.matchScore}%</div>
                    <h3 style={{ fontSize: 16, fontWeight: 800, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,.3)" }}>{cl.name}</h3>
                  </div>
                  <div style={{ padding: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                      <MapPin size={14} color={C.primary} /><span style={{ fontSize: 13, color: C.textSec }}>{cl.location}</span>
                      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 700, color: "#f59e0b" }}><Star size={14} fill="#f59e0b" color="#f59e0b" /> {cl.rating}</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14, fontSize: 13 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textMuted }}>{t("rec.price")}</span><span style={{ fontWeight: 700, color: C.primary }}>{cl.price}</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textMuted }}>{t("rec.langs")}</span><span style={{ fontWeight: 600 }}>{cl.languages.join(", ")}</span></div>
                      {cl.accommodation && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textMuted }}>{t("rec.accom")}</span><span style={{ fontWeight: 600, color: "#22c55e" }}>✓ {t("rec.included")}</span></div>}
                      {cl.transfer && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textMuted }}>{t("rec.transfer")}</span><span style={{ fontWeight: 600, color: "#22c55e" }}>✓ {t("rec.included")}</span></div>}
                    </div>
                    {/* Profile link */}
                    <a href={cl.profileUrl} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.primary, fontWeight: 600, textDecoration: "none", marginBottom: 14, padding: "6px 0" }}>
                      <ExternalLink size={13} /> {t("rec.moreInfo")} — feelinhealthy.com
                    </a>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn" onClick={() => openLead(cl.name)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, background: C.primary, color: "#fff", fontSize: 13, fontWeight: 700 }}>{t("rec.quote")}</button>
                      <a href={cl.profileUrl} target="_blank" rel="noopener noreferrer" className="btn" style={{ padding: "10px 14px", borderRadius: 10, background: C.bg, color: C.textSec, fontSize: 13, fontWeight: 600, border: `1px solid ${C.border}`, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>{t("rec.profile")} <ExternalLink size={12} /></a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* HOW IT WORKS */}
      <section id="steps" className="sp" style={{ padding: "80px 40px", background: C.white }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(24px,4vw,36px)", fontWeight: 800, color: C.navy, marginBottom: 8 }}>{t("steps.title")}</h2>
          <p style={{ fontSize: 16, color: C.textSec, marginBottom: 48 }}>{t("steps.sub")}</p>
          <div className="rg" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32 }}>
            {[1, 2, 3].map((s) => {
              const icons = [<MessageSquare key="1" size={28} />, <TrendingUp key="2" size={28} />, <CheckCircle2 key="3" size={28} />];
              return (
                <div key={s} className="ch" style={{ padding: 32, borderRadius: 20, background: C.bg, border: `1px solid ${C.border}`, textAlign: "center" }}>
                  <div style={{ width: 64, height: 64, borderRadius: 16, margin: "0 auto 20px", background: C.primaryBg, display: "flex", alignItems: "center", justifyContent: "center", color: C.primary }}>{icons[s - 1]}</div>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", margin: "0 auto 16px", background: C.primary, color: "#fff", fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{s}</div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 10 }}>{t(`steps.${s}.title`)}</h3>
                  <p style={{ fontSize: 14, color: C.textSec, lineHeight: 1.6 }}>{t(`steps.${s}.desc`)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* TREATMENTS */}
      <section id="treatments" className="sp" style={{ padding: "80px 40px", background: C.bg }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <h2 style={{ fontSize: "clamp(24px,4vw,36px)", fontWeight: 800, color: C.navy }}>{t("treat.title")}</h2>
            <p style={{ fontSize: 16, color: C.textSec, marginTop: 8 }}>{t("treat.sub")}</p>
          </div>
          <div className="rg2" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {["dental", "hair", "aesthetic", "eye", "ivf", "bariatric"].map((k, i) => {
              const icons = [Stethoscope, Scissors, Sparkles, Eye, Baby, Heart];
              const colors = [C.primary, C.navy, "#7C3AED", "#2563EB", "#EC4899", C.accent];
              const Icon = icons[i];
              return (
                <div key={k} className="ch" style={{ padding: 24, borderRadius: 16, background: C.white, border: `1px solid ${C.border}`, cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 14, background: `${colors[i]}14`, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={24} color={colors[i]} /></div>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>{t(`treat.${k}`)}</h4>
                      <p style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{t(`treat.${k}.d`)}</p>
                    </div>
                    <ChevronRight size={18} color={C.textMuted} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CLINICS */}
      <section id="clinics" className="sp" style={{ padding: "80px 40px", background: C.white }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <h2 style={{ fontSize: "clamp(24px,4vw,36px)", fontWeight: 800, color: C.navy }}>{t("clinics.title")}</h2>
            <p style={{ fontSize: 16, color: C.textSec, marginTop: 8 }}>{t("clinics.sub")}</p>
          </div>
          <div className="rg" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {CLINICS.map((cl) => (
              <div key={cl.id} className="ch" style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                <div style={{ height: 72, background: cl.gradient, display: "flex", alignItems: "flex-end", padding: "0 16px 10px" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.85)", background: "rgba(0,0,0,.2)", padding: "3px 8px", borderRadius: 6 }}>{cl.type[lang]}</span>
                </div>
                <div style={{ padding: "14px 20px" }}>
                  <h4 style={{ fontSize: 15, fontWeight: 700, color: C.navy, marginBottom: 6 }}>{cl.name}</h4>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <MapPin size={13} color={C.primary} /><span style={{ fontSize: 12.5, color: C.textSec }}>{cl.location}</span>
                    <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 700, color: "#f59e0b", display: "flex", alignItems: "center", gap: 3 }}><Star size={12} fill="#f59e0b" color="#f59e0b" /> {cl.rating} <span style={{ fontWeight: 400, color: C.textMuted }}>({cl.reviews})</span></span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                    {cl.specialties.map((s, i) => (
                      <span key={i} style={{ fontSize: 10.5, padding: "2px 7px", borderRadius: 5, background: C.primaryBg, color: C.primary, fontWeight: 600 }}>{s[lang]}</span>
                    ))}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.primary }}>{cl.price}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      {cl.accommodation && <Hotel size={14} color={C.primary} />}
                      {cl.transfer && <Car size={14} color={C.primary} />}
                      <Globe2 size={14} color={C.primary} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn" onClick={() => openLead(cl.name)} style={{ flex: 1, padding: "9px 0", borderRadius: 8, background: C.primary, color: "#fff", fontSize: 12.5, fontWeight: 700 }}>{t("rec.quote")}</button>
                    <a href={cl.profileUrl} target="_blank" rel="noopener noreferrer" className="btn" style={{ padding: "9px 12px", borderRadius: 8, background: C.bg, color: C.textSec, fontSize: 12, fontWeight: 600, border: `1px solid ${C.border}`, textDecoration: "none", display: "flex", alignItems: "center", gap: 3 }}>
                      <ExternalLink size={12} /> {t("rec.profile")}
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer id="footer" style={{ background: C.navy, color: "rgba(255,255,255,.7)", padding: "60px 40px 30px" }}>
        <div className="sp" style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div className="rg" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 40, marginBottom: 40 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, display: "flex", alignItems: "center", justifyContent: "center" }}><Heart size={16} color="#fff" fill="#fff" /></div>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>Feelin<span style={{ color: C.primaryLight }}>Healthy</span></span>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.7, maxWidth: 300 }}>{t("footer.desc")}</p>
            </div>
            <div>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 16 }}>{t("footer.links")}</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
                {["nav.treatments", "nav.clinics", "nav.how"].map((k) => <span key={k} style={{ cursor: "pointer" }}>{t(k)}</span>)}
              </div>
            </div>
            <div>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 16 }}>{t("footer.legal")}</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
                {["footer.privacy", "footer.terms", "footer.kvkk"].map((k) => <span key={k} style={{ cursor: "pointer" }}>{t(k)}</span>)}
              </div>
            </div>
            <div>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 16 }}>{t("footer.contact")}</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Mail size={14} color={C.primaryLight} /> info@feelinhealthy.com</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Phone size={14} color={C.primaryLight} /> +90 212 555 0000</div>
              </div>
            </div>
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,.1)", paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <p style={{ fontSize: 12 }}>© 2026 FeelinHealthy. {t("footer.rights")}</p>
            <p style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}><Sparkles size={10} color={C.primaryLight} /> {t("footer.poweredBy")}</p>
          </div>
        </div>
      </footer>

      {/* LEAD MODAL */}
      {leadModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)", padding: 20 }} onClick={() => setLeadModal(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 20, width: "100%", maxWidth: 500, boxShadow: "0 24px 48px rgba(0,0,0,.15)", overflow: "hidden", animation: "fadeUp .3s ease" }}>
            {leadDone ? (
              <div style={{ padding: 48, textAlign: "center" }}>
                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(34,197,94,.1)", margin: "0 auto 20px", display: "flex", alignItems: "center", justifyContent: "center" }}><CheckCircle2 size={32} color="#22c55e" /></div>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: C.navy, marginBottom: 8 }}>{t("lead.ok.title")}</h3>
                <p style={{ fontSize: 14, color: C.textSec, marginBottom: 24 }}>{t("lead.ok.desc")}</p>
                <button className="btn" onClick={() => setLeadModal(false)} style={{ padding: "10px 28px", borderRadius: 10, background: C.primary, color: "#fff", fontSize: 14, fontWeight: 700 }}>{t("lead.close")}</button>
              </div>
            ) : (
              <>
                <div style={{ padding: "24px 28px", borderBottom: `1px solid ${C.border}` }}>
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: C.navy }}>{t("lead.title")}</h3>
                  <p style={{ fontSize: 13, color: C.textSec, marginTop: 4 }}>{t("lead.sub")}</p>
                  {leadClinic && <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, background: C.primaryBg }}><Building2 size={14} color={C.primary} /><span style={{ fontSize: 13, fontWeight: 600, color: C.primary }}>{leadClinic}</span></div>}
                </div>
                <form onSubmit={submitLead} style={{ padding: "24px 28px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {["name", "email", "phone", "country"].map((k) => (
                      <div key={k}>
                        <label style={{ fontSize: 12.5, fontWeight: 600, color: C.textSec, marginBottom: 4, display: "block" }}>{t(`lead.${k}`)}</label>
                        <input type={k === "email" ? "email" : k === "phone" ? "tel" : "text"} required style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, outline: "none", color: C.text, background: C.bg }} />
                      </div>
                    ))}
                    <div>
                      <label style={{ fontSize: 12.5, fontWeight: 600, color: C.textSec, marginBottom: 4, display: "block" }}>{t("lead.message")}</label>
                      <textarea rows={3} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, outline: "none", resize: "none", fontFamily: "inherit", color: C.text, background: C.bg }} />
                    </div>
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", fontSize: 12.5, color: C.textSec }}>
                      <input type="checkbox" required style={{ width: 16, height: 16, marginTop: 2, accentColor: C.primary }} /> {t("lead.consent")}
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                    <button type="button" onClick={() => setLeadModal(false)} style={{ flex: 1, padding: "12px 0", borderRadius: 10, background: C.bg, border: `1px solid ${C.border}`, color: C.textSec, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{t("lead.close")}</button>
                    <button type="submit" className="btn" disabled={leadSending} style={{ flex: 2, padding: "12px 0", borderRadius: 10, background: `linear-gradient(135deg, ${C.primary}, ${C.navy})`, color: "#fff", fontSize: 14, fontWeight: 700, opacity: leadSending ? .7 : 1 }}>
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
