"use client";

import { useState, useRef, useEffect } from "react";

/* ── Chat Message Types (inline — no external dependency) ── */
interface MatchedPrice {
  subTreatmentName: string;
  priceMin: number;
  priceMax: number;
  currency: string;
  priceType: string;
  duration: string;
}

interface ClinicRec {
  clinicId: string;
  clinicName: string;
  clinicSlug: string;
  clinicType: string;
  location: string;
  rating: number;
  reviews: number;
  matchScore: number;
  matchedPrices: MatchedPrice[];
  supportedLanguages: string[];
  reason: string;
  profilePath: string;
  accommodation: boolean;
  transfer: boolean;
  shortDescription: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  type?: string;
  clinics?: ClinicRec[];
  showClinicCards?: boolean;
  privacyNoticeUrl?: string;
}

interface SessionContext {
  lastTreatmentCategory?: string;
  lastSubTreatment?: string;
  lastLocation?: string;
  lastRecommendedClinicIds?: string[];
  lastFocusedClinicId?: string;
  lastFocusedClinicName?: string;
  patientAge?: number;
  patientGender?: string;
}

let _msgId = 0;
function nextMsgId() { return `msg_${Date.now()}_${++_msgId}`; }
import Link from "next/link";
import {
  Search, MapPin, Stethoscope, Star, Globe2, Hotel, Car, MessageSquare,
  ChevronRight, Send, Bot, User, Heart, Eye, Baby, Scissors, Sparkles,
  Phone, Mail, Shield, CheckCircle2, ArrowRight, Menu, X, Languages,
  Building2, Clock, Award, TrendingUp, Loader2, FileText, ExternalLink,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════════
// LANGUAGE SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

type Lang = "tr" | "en";

const TEXTS: Record<Lang, Record<string, string>> = {
  tr: {
    // Header
    "nav.home": "Ana Sayfa",
    "nav.treatments": "Tedaviler",
    "nav.clinics": "Klinikler",
    "nav.destinations": "Destinasyonlar",
    "nav.howItWorks": "Nasıl Çalışır?",
    "nav.contact": "İletişim",
    "nav.login": "Giriş Yap",
    "nav.signup": "Kayıt Ol",

    // Hero
    "hero.title": "Doğru Kliniği Yapay Zekâ ile Bulun",
    "hero.subtitle": "Tedavi ihtiyacınızı anlatın, ClinicBridge AI size en uygun klinikleri ve tedavi seçeneklerini saniyeler içinde önersin.",
    "hero.treatmentPlaceholder": "Tedavi seçin",
    "hero.locationPlaceholder": "Lokasyon seçin",
    "hero.searchBtn": "Klinik Ara",
    "hero.stats.clinics": "Klinik",
    "hero.stats.patients": "Hasta Memnuniyeti",
    "hero.stats.treatments": "Tedavi Kategorisi",
    "hero.stats.countries": "Ülkeden Hasta",

    // AI Section
    "ai.title": "Ne tür bir tedavi aradığınızı bize anlatın",
    "ai.placeholder": "Örn: Antalya'da implant yaptırmak istiyorum. 3000 EUR bütçem var. İngilizce destek ve transfer önemli.",
    "ai.searchBtn": "AI ile Klinik Bul",
    "ai.poweredBy": "ClinicBridge AI tarafından desteklenmektedir",
    "ai.greeting": "Merhaba! 👋 Tedavi ihtiyacınızı bana anlatın; lokasyon, bütçe ve tercihlerinize göre size en uygun klinikleri fiyat aralıklarıyla birlikte önereyim.",
    "ai.analyzing": "Talebinizi analiz ediyorum...",
    "ai.typing": "ClinicBridge AI yazıyor...",

    // Results
    "results.title": "AI Klinik Önerileri",
    "results.subtitle": "ClinicBridge AI tarafından sizin için eşleştirilen klinikler",
    "results.matchScore": "AI Eşleşme",
    "results.priceRange": "Tahmini Fiyat",
    "results.rating": "Puan",
    "results.languages": "Diller",
    "results.accommodation": "Konaklama",
    "results.transfer": "Transfer",
    "results.included": "Dahil",
    "results.requestQuote": "Teklif İste",
    "results.talkToClinic": "Klinikle Görüş",
    "results.viewDetails": "Detayları Gör",
    "results.viewProfile": "Daha Fazla Bilgi",

    // Clinics
    "clinics.title": "Ağımızdaki Klinikler",
    "clinics.subtitle": "Türkiye'nin en iyi sağlık turizmi klinikleri ile çalışıyoruz",
    "clinics.viewAll": "Tüm Klinikleri Gör",

    // Steps
    "steps.title": "Nasıl Çalışır?",
    "steps.subtitle": "3 basit adımda doğru kliniği bulun",
    "steps.step1.title": "İhtiyacınızı Yapay Zekâya Anlatın",
    "steps.step1.desc": "Tedavi ihtiyacınızı, bütçenizi ve tercihlerinizi doğal dilde yazın. AI sizin için en uygun eşleşmeleri bulsun.",
    "steps.step2.title": "Klinik ve Teklifleri Karşılaştırın",
    "steps.step2.desc": "AI tarafından önerilen kliniklerin fiyatlarını, hizmetlerini ve hasta yorumlarını karşılaştırın.",
    "steps.step3.title": "Kliniğinizi Seçin ve Başlatın",
    "steps.step3.desc": "Beğendiğiniz kliniği seçin, teklif isteyin ve tedavi sürecini başlatın. Tüm süreç boyunca yanınızdayız.",

    // Treatments
    "treatments.title": "Tedavi Kategorileri",
    "treatments.subtitle": "Geniş tedavi yelpazesinde AI destekli klinik eşleştirme",
    "treatments.dental": "Diş Tedavisi",
    "treatments.hair": "Saç Ekimi",
    "treatments.aesthetic": "Estetik Cerrahi",
    "treatments.eye": "Göz Tedavisi",
    "treatments.ivf": "Tüp Bebek (IVF)",
    "treatments.checkup": "Check-Up",

    // Destinations
    "dest.title": "Destinasyonlar",
    "dest.subtitle": "Türkiye'nin en popüler sağlık turizmi şehirleri",
    "dest.istanbul": "İstanbul",
    "dest.istanbul.desc": "120+ klinik · Avrupa ve Asya'nın buluşma noktası",
    "dest.antalya": "Antalya",
    "dest.antalya.desc": "45+ klinik · Tatil ve tedavi bir arada",
    "dest.izmir": "İzmir",
    "dest.izmir.desc": "30+ klinik · Ege'nin sağlık merkezi",
    "dest.explore": "Keşfet",

    // Lead Modal
    "lead.title": "Teklif Talebi",
    "lead.subtitle": "Bilgilerinizi bırakın, seçtiğiniz kliniklerden teklif alalım.",
    "lead.name": "Ad Soyad",
    "lead.email": "E-posta",
    "lead.phone": "Telefon",
    "lead.country": "Ülke",
    "lead.treatment": "Tedavi",
    "lead.message": "Mesajınız (opsiyonel)",
    "lead.consent": "Kişisel verilerimin KVKK/GDPR kapsamında işlenmesini kabul ediyorum.",
    "lead.submit": "Teklif İste",
    "lead.submitting": "Gönderiliyor...",
    "lead.success.title": "Talebiniz Alındı!",
    "lead.success.desc": "En kısa sürede seçtiğiniz kliniklerden teklifler iletilecektir.",
    "lead.close": "Kapat",

    // Footer
    "footer.desc": "ClinicBridge AI destekli sağlık turizmi platformu. Yapay zekâ ile doğru kliniği bulun.",
    "footer.links": "Hızlı Linkler",
    "footer.legal": "Yasal",
    "footer.privacy": "Gizlilik Politikası",
    "footer.terms": "Kullanım Koşulları",
    "footer.kvkk": "KVKK Aydınlatma",
    "footer.contact": "İletişim",
    "footer.rights": "Tüm hakları saklıdır.",
    "footer.poweredBy": "ClinicBridge AI tarafından desteklenmektedir",
  },
  en: {
    // Header
    "nav.home": "Home",
    "nav.treatments": "Treatments",
    "nav.clinics": "Clinics",
    "nav.destinations": "Destinations",
    "nav.howItWorks": "How It Works",
    "nav.contact": "Contact",
    "nav.login": "Login",
    "nav.signup": "Sign Up",

    // Hero
    "hero.title": "Find the Right Clinic with AI",
    "hero.subtitle": "Tell us your treatment needs, and ClinicBridge AI will recommend the best clinics and treatment options in seconds.",
    "hero.treatmentPlaceholder": "Select treatment",
    "hero.locationPlaceholder": "Select location",
    "hero.searchBtn": "Search Clinics",
    "hero.stats.clinics": "Clinics",
    "hero.stats.patients": "Patient Satisfaction",
    "hero.stats.treatments": "Treatment Categories",
    "hero.stats.countries": "Patient Countries",

    // AI Section
    "ai.title": "Tell us what treatment you're looking for",
    "ai.placeholder": "Example: I want dental implants in Antalya. My budget is 3000 EUR. English support and transfer are important.",
    "ai.searchBtn": "Find Clinic with AI",
    "ai.poweredBy": "Powered by ClinicBridge AI",
    "ai.greeting": "Hello! 👋 Tell me your treatment need, preferred location, and budget. I'll match you with suitable clinics and show estimated prices, clinic details, and quote options.",
    "ai.analyzing": "Analyzing your request...",
    "ai.typing": "ClinicBridge AI is typing...",

    // Results
    "results.title": "AI Clinic Recommendations",
    "results.subtitle": "Clinics matched for you by ClinicBridge AI",
    "results.matchScore": "AI Match",
    "results.priceRange": "Estimated Price",
    "results.rating": "Rating",
    "results.languages": "Languages",
    "results.accommodation": "Accommodation",
    "results.transfer": "Transfer",
    "results.included": "Included",
    "results.requestQuote": "Request Quote",
    "results.talkToClinic": "Talk to Clinic",
    "results.viewDetails": "View Details",
    "results.viewProfile": "More Info",

    // Clinics
    "clinics.title": "Clinics in Our Network",
    "clinics.subtitle": "We partner with Turkey's best health tourism clinics",
    "clinics.viewAll": "View All Clinics",

    // Steps
    "steps.title": "How It Works",
    "steps.subtitle": "Find the right clinic in 3 simple steps",
    "steps.step1.title": "Tell AI Your Needs",
    "steps.step1.desc": "Describe your treatment needs, budget, and preferences in natural language. AI will find the best matches for you.",
    "steps.step2.title": "Compare Clinics & Offers",
    "steps.step2.desc": "Compare prices, services, and patient reviews of AI-recommended clinics side by side.",
    "steps.step3.title": "Choose & Start Your Treatment",
    "steps.step3.desc": "Select your preferred clinic, request a quote, and start the treatment process. We're with you every step of the way.",

    // Treatments
    "treatments.title": "Treatment Categories",
    "treatments.subtitle": "AI-powered clinic matching across a wide range of treatments",
    "treatments.dental": "Dental",
    "treatments.hair": "Hair Transplant",
    "treatments.aesthetic": "Aesthetic Surgery",
    "treatments.eye": "Eye Treatments",
    "treatments.ivf": "IVF",
    "treatments.checkup": "Check-Up",

    // Destinations
    "dest.title": "Destinations",
    "dest.subtitle": "Turkey's most popular health tourism cities",
    "dest.istanbul": "Istanbul",
    "dest.istanbul.desc": "120+ clinics · Where Europe meets Asia",
    "dest.antalya": "Antalya",
    "dest.antalya.desc": "45+ clinics · Vacation and treatment combined",
    "dest.izmir": "Izmir",
    "dest.izmir.desc": "30+ clinics · Aegean health hub",
    "dest.explore": "Explore",

    // Lead Modal
    "lead.title": "Quote Request",
    "lead.subtitle": "Leave your details and we'll get quotes from your selected clinics.",
    "lead.name": "Full Name",
    "lead.email": "Email",
    "lead.phone": "Phone",
    "lead.country": "Country",
    "lead.treatment": "Treatment",
    "lead.message": "Message (optional)",
    "lead.consent": "I consent to the processing of my personal data under GDPR/KVKK.",
    "lead.submit": "Request Quote",
    "lead.submitting": "Submitting...",
    "lead.success.title": "Request Received!",
    "lead.success.desc": "You will receive quotes from your selected clinics shortly.",
    "lead.close": "Close",

    // Footer
    "footer.desc": "AI-powered health tourism platform. Find the right clinic with artificial intelligence.",
    "footer.links": "Quick Links",
    "footer.legal": "Legal",
    "footer.privacy": "Privacy Policy",
    "footer.terms": "Terms of Service",
    "footer.kvkk": "KVKK Notice",
    "footer.contact": "Contact",
    "footer.rights": "All rights reserved.",
    "footer.poweredBy": "Powered by ClinicBridge AI",
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// DEMO DATA
// ═══════════════════════════════════════════════════════════════════════════════

interface DemoClinic {
  id: string;
  name: string;
  clinicSlug: string;
  type: { tr: string; en: string };
  location: string;
  rating: number;
  reviews: number;
  priceRange: string;
  matchScore?: number;
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

const FALLBACK_CLINICS: DemoClinic[] = [
  {
    id: "1", name: "Dentaflow Clinic Istanbul", clinicSlug: "dentaflow-clinic-istanbul",
    type: { tr: "Diş Kliniği", en: "Dental Clinic" },
    location: "İstanbul, Şişli",
    rating: 4.9, reviews: 1240, priceRange: "€400 – €1,200",
    matchScore: 96, languages: ["EN", "TR", "DE", "AR"],
    accommodation: true, transfer: true,
    image: "linear-gradient(135deg, #0D9488 0%, #0F766E 100%)",
    specialties: [
      { tr: "Dental İmplant", en: "Dental Implant" },
      { tr: "Zirkonyum Kaplama", en: "Zirconium Crown" },
      { tr: "Hollywood Smile", en: "Hollywood Smile" },
    ],
    shortDescription: { tr: "İstanbul'un kalbinde uzman diş hekimliği hizmetleri.", en: "Expert dental services in the heart of Istanbul." },
    longDescription: { tr: "Dentaflow Clinic, 15 yılı aşkın deneyimiyle İstanbul Şişli'de uluslararası hastalara dental implant, zirkonyum kaplama ve Hollywood Smile tedavileri sunmaktadır. JCI akredite kliniğimizde son teknoloji ekipman ve uzman hekim kadromuzla güvenilir tedavi deneyimi yaşayın.", en: "Dentaflow Clinic offers dental implant, zirconium crown, and Hollywood Smile treatments to international patients in Istanbul Şişli with over 15 years of experience. Experience reliable treatment with state-of-the-art equipment and expert physicians at our JCI-accredited clinic." },
    accreditations: ["JCI", "ISO 9001", "Health Tourism Certificate"],
    services: ["Airport Transfer", "Hotel Accommodation", "24/7 Support", "Panoramic X-Ray", "3D CT Scan"],
  },
  {
    id: "2", name: "MedSmile Dental Center", clinicSlug: "medsmile-dental-center",
    type: { tr: "Diş Kliniği", en: "Dental Clinic" },
    location: "Antalya, Lara",
    rating: 4.8, reviews: 890, priceRange: "€350 – €900",
    matchScore: 91, languages: ["EN", "TR", "RU"],
    accommodation: true, transfer: true,
    image: "linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)",
    specialties: [
      { tr: "Dental İmplant", en: "Dental Implant" },
      { tr: "Diş Beyazlatma", en: "Teeth Whitening" },
      { tr: "Kanal Tedavisi", en: "Root Canal" },
    ],
    shortDescription: { tr: "Antalya'da tatil ve tedavi bir arada.", en: "Vacation and dental treatment combined in Antalya." },
    accreditations: ["ISO 9001", "Health Tourism Certificate"],
    services: ["Airport Transfer", "Hotel Booking Assistance", "Multilingual Staff"],
  },
  {
    id: "3", name: "HairLine Turkey", clinicSlug: "hairline-turkey",
    type: { tr: "Saç Ekim Merkezi", en: "Hair Transplant Center" },
    location: "İstanbul, Levent",
    rating: 4.9, reviews: 2100, priceRange: "€1,500 – €3,500",
    languages: ["EN", "TR", "AR", "FR"],
    accommodation: true, transfer: true,
    image: "linear-gradient(135deg, #1E293B 0%, #334155 100%)",
    specialties: [
      { tr: "FUE Saç Ekimi", en: "FUE Hair Transplant" },
      { tr: "DHI Saç Ekimi", en: "DHI Hair Transplant" },
      { tr: "Sakal Ekimi", en: "Beard Transplant" },
    ],
    shortDescription: { tr: "Türkiye'nin lider saç ekim merkezi.", en: "Turkey's leading hair transplant center." },
    accreditations: ["JCI", "ISHRS Member"],
    services: ["VIP Transfer", "5-Star Hotel", "PRP Treatment", "Post-Op Kit"],
  },
  {
    id: "4", name: "AesthetiCare Clinic", clinicSlug: "aestheticare-clinic",
    type: { tr: "Estetik Cerrahi Kliniği", en: "Aesthetic Surgery Clinic" },
    location: "İstanbul, Nişantaşı",
    rating: 4.7, reviews: 680, priceRange: "€2,000 – €6,000",
    languages: ["EN", "TR", "DE"],
    accommodation: true, transfer: true,
    image: "linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)",
    specialties: [
      { tr: "Burun Estetiği", en: "Rhinoplasty" },
      { tr: "Meme Estetiği", en: "Breast Augmentation" },
      { tr: "Liposuction", en: "Liposuction" },
    ],
    shortDescription: { tr: "Nişantaşı'nda premium estetik cerrahi.", en: "Premium aesthetic surgery in Nişantaşı." },
    accreditations: ["ISAPS Member", "ISO 9001"],
    services: ["VIP Transfer", "Recovery Suite", "Post-Op Follow-up"],
  },
  {
    id: "5", name: "Visionary Eye Center", clinicSlug: "visionary-eye-center",
    type: { tr: "Göz Kliniği", en: "Eye Clinic" },
    location: "İzmir, Alsancak",
    rating: 4.8, reviews: 540, priceRange: "€800 – €2,500",
    languages: ["EN", "TR"],
    accommodation: false, transfer: true,
    image: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)",
    specialties: [
      { tr: "Lazer Göz Ameliyatı", en: "Laser Eye Surgery" },
      { tr: "Katarakt", en: "Cataract Surgery" },
      { tr: "Göz İçi Lens", en: "Intraocular Lens" },
    ],
    shortDescription: { tr: "Ege'nin önde gelen göz sağlığı merkezi.", en: "Aegean's leading eye health center." },
    accreditations: ["ISO 9001"],
    services: ["Transfer", "Multilingual Staff"],
  },
  {
    id: "6", name: "Fertility Plus IVF", clinicSlug: "fertility-plus-ivf",
    type: { tr: "Tüp Bebek Merkezi", en: "IVF Center" },
    location: "Antalya, Konyaaltı",
    rating: 4.9, reviews: 760, priceRange: "€2,500 – €5,000",
    languages: ["EN", "TR", "DE", "RU"],
    accommodation: true, transfer: true,
    image: "linear-gradient(135deg, #EC4899 0%, #DB2777 100%)",
    specialties: [
      { tr: "Tüp Bebek (IVF)", en: "IVF" },
      { tr: "Yumurta Dondurma", en: "Egg Freezing" },
      { tr: "Genetik Tanı", en: "Genetic Diagnosis" },
    ],
    shortDescription: { tr: "Antalya'da ileri teknoloji tüp bebek tedavisi.", en: "Advanced IVF treatment in Antalya." },
    accreditations: ["ESHRE Member", "Health Tourism Certificate"],
    services: ["Airport Transfer", "Hotel Accommodation", "Genetic Counseling"],
  },
  {
    id: "7", name: "Hospitadent Dental Group Alanya", clinicSlug: "hospitadent-dental-group-alanya",
    type: { tr: "Diş Kliniği", en: "Dental Clinic" },
    location: "Alanya, Antalya",
    rating: 4.9, reviews: 2840, priceRange: "€400 – €900",
    matchScore: 97, languages: ["EN", "TR", "DE", "RU", "AR"],
    accommodation: true, transfer: true,
    image: "linear-gradient(135deg, #059669 0%, #047857 100%)",
    externalProfileUrl: "https://feelinhealthy.com/medicalcenter/hospitadent-dental-group-alanya",
    specialties: [
      { tr: "Dental İmplant", en: "Dental Implant" },
      { tr: "All-on-4 / All-on-6", en: "All-on-4 / All-on-6" },
      { tr: "Zirkonyum Kaplama", en: "Zirconium Crowns" },
      { tr: "Hollywood Smile", en: "Hollywood Smile" },
      { tr: "Diş Beyazlatma", en: "Teeth Whitening" },
    ],
    shortDescription: { tr: "Alanya'nın en büyük diş kliniği zinciri. 10+ yıllık deneyim, JCI akredite.", en: "Alanya's largest dental clinic chain. 10+ years of experience, JCI accredited." },
    longDescription: { tr: "Hospitadent Dental Group, Türkiye genelinde 12 şubesiyle hizmet veren köklü bir diş kliniği zinciridir. Alanya şubemiz, uluslararası hastalara dental implant, All-on-4, All-on-6, zirkonyum kaplama, Hollywood Smile, diş beyazlatma, kanal tedavisi, ortodonti ve ağız-çene-yüz cerrahisi alanlarında kapsamlı tedavi hizmeti sunmaktadır. JCI akredite kliniğimizde son teknoloji 3D tomografi, dijital gülüş tasarımı ve bilgisayar destekli implant planlama sistemleri kullanılmaktadır.", en: "Hospitadent Dental Group is an established dental clinic chain serving across Turkey with 12 branches. Our Alanya branch provides comprehensive treatment services to international patients in dental implant, All-on-4, All-on-6, zirconium crowns, Hollywood Smile, teeth whitening, root canal treatment, orthodontics, and oral-maxillofacial surgery. Our JCI-accredited clinic uses state-of-the-art 3D tomography, digital smile design, and computer-aided implant planning systems." },
    accreditations: ["JCI", "ISO 9001", "Health Tourism Authorization", "TDB Member"],
    services: ["Airport Transfer", "Hotel Accommodation", "City Tour", "24/7 WhatsApp Support", "Panoramic X-Ray", "3D CT Scan", "Digital Smile Design"],
  },
];

const TREATMENT_ICONS: Record<string, any> = {
  dental: Stethoscope,
  hair: Scissors,
  aesthetic: Sparkles,
  eye: Eye,
  ivf: Baby,
  checkup: Heart,
};

const TREATMENTS = ["dental", "hair", "aesthetic", "eye", "ivf", "checkup"];

// ═══════════════════════════════════════════════════════════════════════════════
// COLORS
// ═══════════════════════════════════════════════════════════════════════════════

const C = {
  navy: "#0F172A",
  navyLight: "#1E293B",
  teal: "#0D9488",
  tealLight: "#14B8A6",
  tealBg: "rgba(13, 148, 136, 0.06)",
  tealBorder: "rgba(13, 148, 136, 0.2)",
  white: "#FFFFFF",
  bg: "#F8FAFC",
  border: "#E2E8F0",
  text: "#0F172A",
  textSec: "#475569",
  textMuted: "#94A3B8",
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function AgencyDemoPage() {
  const [lang, setLang] = useState<Lang>("tr");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([]);
  const [aiTyping, setAiTyping] = useState(false);
  const [aiCfg, setAiCfg] = useState<any>(null);
  const [matchedCategory, setMatchedCategory] = useState<string | null>(null);
  
  // Initialize with a unique session ID for consent tracking
  const [sessionCtx, setSessionCtx] = useState<any>(() => {
    return {
      sessionId: typeof window !== 'undefined' ? crypto.randomUUID() : "",
      leadStage: "discovery"
    };
  });

  const [leadModal, setLeadModal] = useState(false);
  const [leadClinic, setLeadClinic] = useState("");
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [clinics, setClinics] = useState<DemoClinic[]>(FALLBACK_CLINICS);
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([]);


  const t = (key: string) => TEXTS[lang][key] || key;

  // Fetch live clinic data for results section
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/public/agency/feelinhealthy/clinics", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.clinics && data.clinics.length > 0) {
          const mapped: DemoClinic[] = data.clinics.map((c: any) => ({
            id: c.id,
            name: c.clinicName,
            clinicSlug: c.clinicSlug || c.clinicName?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/g, "") || c.id,
            type: { tr: c.category || c.clinicType || "", en: c.category || c.clinicType || "" },
            location: c.location ? `${c.location.city}, ${c.location.country}` : "",
            rating: c.rating || 4.8,
            reviews: c.reviewCount || 0,
            priceRange: "",
            languages: (c.supportedLanguages || []).map((l: string) => l.toUpperCase()),
            accommodation: true,
            transfer: true,
            image: "linear-gradient(135deg, #0D9488 0%, #065F46 100%)",
            specialties: (c.subTreatments || []).map((s: string) => ({ tr: s, en: s })),
            shortDescription: c.shortDescription ? { tr: c.shortDescription, en: c.shortDescription } : undefined,
            longDescription: c.longDescription ? { tr: c.longDescription, en: c.longDescription } : undefined,
            externalProfileUrl: c.profileUrl || undefined,
            accreditations: c.accreditation || [],
            services: [],
          }));
          setClinics(mapped);
        }
      } catch { /* fallback to FALLBACK_CLINICS */ }
    })();

    // Fetch AI config
    (async () => {
      try {
        const res = await fetch("/api/public/agency/feelinhealthy/config", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setAiCfg(data.aiConfig || null);
          if (data.aiConfig) {
            console.log("[CB-DEMO] aiConfig loaded", { assistantName: data.aiConfig.assistantName, greetingMessageSource: "agency-aiConfig" });
          } else {
            console.log("[CB-DEMO] aiConfig not found, fallback greeting used");
          }
        }
      } catch (err) {
        console.error("[CB-DEMO] Error loading aiConfig:", err);
      }
    })();
  }, []);


  
  const welcomeMsg = (lang === "tr" ? aiCfg?.greetingMessageTR : aiCfg?.greetingMessageEN) || t("ai.greeting");

  const chatContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Scroll only within chat container, never page-level
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [aiMessages, aiTyping]);

  const sendSystemAction = async (payload: any) => {
    if (aiTyping) return;
    setAiTyping(true);

    try {
      const res = await fetch(`/api/public/agency/feelinhealthy/matching-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: payload,
          history: aiMessages.slice(-10).map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text })),
          sessionContext: sessionCtx,
        }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();

      const replyMsg: ChatMessage = {
        id: Math.random().toString(36).substring(7),
        role: "ai",
        text: data.reply || "Yanıt alınamadı.",
        type: data.type || "text",
        clinics: data.clinics || undefined,
        showClinicCards: data.showClinicCards,
        privacyNoticeUrl: data.privacyNoticeUrl,
      };
      setAiMessages((prev) => [...prev, replyMsg]);
      if (data.sessionContext) setSessionCtx(data.sessionContext);
    } catch (err) {
      console.error("[CB-DEMO] ERROR:", err);
      setAiMessages((prev) => [...prev, {
        id: Math.random().toString(36).substring(7),
        role: "ai",
        type: "text",
        text: lang === "tr" ? "Şu an teknik bir sorun yaşıyoruz. Lütfen tekrar deneyin." : "We're experiencing a technical issue. Please try again."
      }]);
    } finally {
      setAiTyping(false);
    }
  };

  const sendConsentAction = async (status: "accept" | "decline") => {
    if (aiTyping) return;
    setAiTyping(true);

    const userChoice = status === "accept" 
      ? (lang === "tr" ? "Kabul Ediyorum" : "I Accept")
      : (lang === "tr" ? "Reddediyorum" : "I Decline");
    setAiMessages((prev) => [...prev, { id: Math.random().toString(36).substring(7), role: "user", type: "text", text: userChoice }]);

    try {
      const res = await fetch(`/api/public/agency/feelinhealthy/matching-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: { type: "privacy_consent_response", action: status, locale: lang },
          history: aiMessages.slice(-10).map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text })),
          sessionContext: sessionCtx,
        }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();

      const replyMsg: ChatMessage = {
        id: Math.random().toString(36).substring(7),
        role: "ai",
        text: data.reply || "Yanıt alınamadı.",
        type: data.type || "text",
        clinics: data.clinics || undefined,
        showClinicCards: data.showClinicCards,
        privacyNoticeUrl: data.privacyNoticeUrl,
      };
      setAiMessages((prev) => [...prev, replyMsg]);
      if (data.sessionContext) setSessionCtx(data.sessionContext);
    } catch (err) {
      console.error("[CB-DEMO] ERROR:", err);
      setAiMessages((prev) => [...prev, {
        id: Math.random().toString(36).substring(7),
        role: "ai",
        text: lang === "tr" ? "Şu an teknik bir sorun yaşıyoruz. Lütfen tekrar deneyin." : "We're experiencing a technical issue. Please try again."
      }]);
    } finally {
      setAiTyping(false);
    }
  };

  const sendEmailAction = async (email: string) => {
    if (!email.trim() || aiTyping) return;
    setAiTyping(true);
    setAiMessages((prev) => [...prev, { id: nextMsgId(), role: "user", type: "text", text: email }]);

    try {
      const res = await fetch(`/api/public/agency/feelinhealthy/matching-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: { type: "patient_email_submission", email, locale: lang },
          history: aiMessages.slice(-10).map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text })),
          sessionContext: sessionCtx,
        }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();

      const replyMsg: ChatMessage = {
        id: nextMsgId(),
        role: "ai",
        text: data.reply || "Yanıt alınamadı.",
        type: data.type || "text",
        clinics: data.clinics || undefined,
        showClinicCards: data.showClinicCards,
        privacyNoticeUrl: data.privacyNoticeUrl,
      };
      setAiMessages((prev) => [...prev, replyMsg]);
      if (data.sessionContext) setSessionCtx(data.sessionContext);
    } catch (err) {
      console.error("[CB-DEMO] ERROR:", err);
      setAiMessages((prev) => [...prev, {
        id: nextMsgId(),
        role: "ai",
        type: "text",
        text: lang === "tr" ? "Şu an teknik bir sorun yaşıyoruz. Lütfen tekrar deneyin." : "We're experiencing a technical issue. Please try again."
      }]);
    } finally {
      setAiTyping(false);
      setEmailInput("");
    }
  };

  const sendAi = async () => {
    if (!aiInput.trim()) return;
    const userMsg = aiInput;
    setAiInput("");

    // Add user message to chat
    const userChatMsg: ChatMessage = { id: nextMsgId(), role: "user", type: "text", text: userMsg };
    setAiMessages((prev) => [...prev, userChatMsg]);
    setAiTyping(true);

    // Track history for context
    const newHistory = [...chatHistory, { role: "user", content: userMsg }];

    const apiEndpoint = "/api/public/agency/feelinhealthy/matching-chat";
    const requestPayload = {
      message: userMsg,
      history: newHistory.slice(-10),
      sessionContext: sessionCtx,
    };

    try {
      const res = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();

      const aiMsg: ChatMessage = {
        id: nextMsgId(),
        role: "ai",
        type: data.type || "text",
        text: data.reply || "Bir sorun oluştu.",
        clinics: data.clinics || undefined,
      };

      setAiMessages((prev) => [...prev, aiMsg]);
      setChatHistory([...newHistory, { role: "assistant", content: data.reply }]);

      if (data.sessionContext) setSessionCtx(data.sessionContext);

    } catch (err) {
      setAiMessages((prev) => [...prev, {
        id: nextMsgId(), role: "ai", type: "text",
        text: lang === "tr"
          ? "Şu an teknik bir sorun yaşıyoruz. Lütfen tekrar deneyin."
          : "We're experiencing a technical issue. Please try again.",
      }]);
    } finally {
      setAiTyping(false);
    }
  };

  const openLeadModal = (clinicName: string) => {
    setLeadClinic(clinicName);
    setLeadSubmitted(false);
    setLeadModal(true);
  };

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLeadSubmitting(true);
    
    const form = new FormData(e.target as HTMLFormElement);
    try {
      await fetch("/api/public/agency/feelinhealthy/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: form.get("name"),
          patientEmail: form.get("email"),
          patientPhone: form.get("phone"),
          patientAge: sessionCtx.patientAge,
          patientGender: sessionCtx.patientGender,
          country: form.get("country"),
          language: lang,
          treatmentCategory: sessionCtx.lastTreatmentCategory || "other",
          conversationSummary: chatHistory.map((m) => `${m.role}: ${m.content}`).join("\n"),
          consentStatus: "accepted",
          source: "widget",
          sourceUrl: window.location.href,
        }),
      });
      setLeadSubmitted(true);
    } catch (err) {
      console.error("[CB-DEMO] ERROR submitting lead:", err);
      // Fallback UI
      setLeadSubmitted(true);
    } finally {
      setLeadSubmitting(false);
    }
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMobileMenu(false);
  };

  // ── RENDER ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", color: C.text, background: C.white, minHeight: "100vh", overflowX: "hidden" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
        .fade-up { animation: fadeUp 0.6s ease-out forwards; }
        .demo-btn { transition: all 0.2s ease; cursor: pointer; border: none; }
        .demo-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(13, 148, 136, 0.3); }
        .card-hover { transition: all 0.3s ease; }
        .card-hover:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(0, 0, 0, 0.1); }
        .nav-link { transition: color 0.2s; cursor: pointer; background: none; border: none; font-size: 14px; font-weight: 500; color: ${C.textSec}; }
        .nav-link:hover { color: ${C.teal}; }
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: flex !important; }
          .hero-grid { flex-direction: column !important; }
          .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .clinics-grid { grid-template-columns: 1fr !important; }
          .steps-grid { grid-template-columns: 1fr !important; }
          .treatments-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .dest-grid { grid-template-columns: 1fr !important; }
          .footer-grid { grid-template-columns: 1fr !important; }
          .results-grid { grid-template-columns: 1fr !important; }
          .section-padding { padding-left: 20px !important; padding-right: 20px !important; }
        }
      `}</style>

      {/* ═══════ HEADER ═══════ */}
      <header style={{
        position: "sticky", top: 0, zIndex: 1000,
        background: "rgba(255,255,255,0.95)", backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div className="section-padding" style={{ maxWidth: 1280, margin: "0 auto", padding: "0 40px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${C.teal}, ${C.navy})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Sparkles size={18} color="#fff" />
            </div>
            <span style={{ fontSize: 18, fontWeight: 800, color: C.navy, letterSpacing: "-0.03em" }}>
              Clinic<span style={{ color: C.teal }}>Bridge</span> <span style={{ fontSize: 12, fontWeight: 600, color: C.tealLight, verticalAlign: "super" }}>AI</span>
            </span>
          </div>

          {/* Nav */}
          <nav className="desktop-nav" style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <button className="nav-link" onClick={() => scrollTo("hero")}>{t("nav.home")}</button>
            <button className="nav-link" onClick={() => scrollTo("treatments")}>{t("nav.treatments")}</button>
            <button className="nav-link" onClick={() => scrollTo("clinics")}>{t("nav.clinics")}</button>
            <button className="nav-link" onClick={() => scrollTo("destinations")}>{t("nav.destinations")}</button>
            <button className="nav-link" onClick={() => scrollTo("steps")}>{t("nav.howItWorks")}</button>
            <button className="nav-link" onClick={() => scrollTo("footer")}>{t("nav.contact")}</button>
          </nav>

          {/* Right */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Lang Switcher */}
            <div style={{ display: "flex", borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden" }}>
              {(["TR", "EN"] as const).map((l) => (
                <button key={l} onClick={() => setLang(l.toLowerCase() as Lang)}
                  style={{
                    padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none",
                    background: lang === l.toLowerCase() ? C.teal : "transparent",
                    color: lang === l.toLowerCase() ? "#fff" : C.textSec,
                    transition: "all 0.2s",
                  }}>{l}</button>
              ))}
            </div>

            <button className="desktop-nav nav-link" style={{ display: "inline", padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.border}`, fontWeight: 600, fontSize: 13 }}>
              {t("nav.login")}
            </button>
            <button className="desktop-nav demo-btn" style={{
              display: "inline", padding: "8px 18px", borderRadius: 8, background: C.teal, color: "#fff", fontSize: 13, fontWeight: 700,
            }}>{t("nav.signup")}</button>

            <button className="mobile-menu-btn" style={{ display: "none", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", cursor: "pointer" }}
              onClick={() => setMobileMenu(!mobileMenu)}>
              {mobileMenu ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenu && (
          <div style={{ padding: "16px 20px", borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 12 }}>
            {["hero", "treatments", "clinics", "destinations", "steps", "footer"].map((id, i) => (
              <button key={id} className="nav-link" onClick={() => scrollTo(id)} style={{ textAlign: "left", padding: "8px 0", fontSize: 15 }}>
                {t(`nav.${["home", "treatments", "clinics", "destinations", "howItWorks", "contact"][i]}`)}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* ═══════ HERO ═══════ */}
      <section id="hero" className="section-padding" style={{
        background: `linear-gradient(180deg, ${C.bg} 0%, ${C.white} 100%)`,
        padding: "80px 40px 60px",
      }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", textAlign: "center" }}>
          <div className="fade-up" style={{ maxWidth: 800, margin: "0 auto" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 16px", borderRadius: 20, background: C.tealBg, border: `1px solid ${C.tealBorder}`, marginBottom: 24 }}>
              <Sparkles size={14} color={C.teal} />
              <span style={{ fontSize: 13, fontWeight: 600, color: C.teal }}>ClinicBridge AI</span>
            </div>
            <h1 style={{ fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 900, color: C.navy, lineHeight: 1.15, letterSpacing: "-0.03em", marginBottom: 20 }}>
              {t("hero.title")}
            </h1>
            <p style={{ fontSize: "clamp(16px, 2vw, 19px)", color: C.textSec, lineHeight: 1.6, maxWidth: 640, margin: "0 auto" }}>
              {t("hero.subtitle")}
            </p>
          </div>

          {/* Search Bar */}
          <div className="fade-up" style={{
            display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", marginTop: 40,
            background: C.white, padding: 16, borderRadius: 16, border: `1px solid ${C.border}`,
            boxShadow: "0 4px 24px rgba(0,0,0,0.06)", maxWidth: 700, margin: "40px auto 0",
          }}>
            <div style={{ flex: 1, minWidth: 180, display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg }}>
              <Stethoscope size={18} color={C.teal} />
              <span style={{ fontSize: 14, color: C.textMuted }}>{t("hero.treatmentPlaceholder")}</span>
            </div>
            <div style={{ flex: 1, minWidth: 180, display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg }}>
              <MapPin size={18} color={C.teal} />
              <span style={{ fontSize: 14, color: C.textMuted }}>{t("hero.locationPlaceholder")}</span>
            </div>
            <button className="demo-btn" style={{
              padding: "12px 28px", borderRadius: 10, background: `linear-gradient(135deg, ${C.teal}, ${C.navy})`,
              color: "#fff", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 6,
            }} onClick={() => scrollTo("ai-section")}>
              <Search size={16} /> {t("hero.searchBtn")}
            </button>
          </div>

          {/* Stats */}
          <div className="stats-grid fade-up" style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, marginTop: 60, maxWidth: 800, margin: "60px auto 0",
          }}>
            {[
              { value: "200+", label: t("hero.stats.clinics") },
              { value: "98%", label: t("hero.stats.patients") },
              { value: "10+", label: t("hero.stats.treatments") },
              { value: "40+", label: t("hero.stats.countries") },
            ].map((s) => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <p style={{ fontSize: 28, fontWeight: 900, color: C.teal, letterSpacing: "-0.02em" }}>{s.value}</p>
                <p style={{ fontSize: 13, color: C.textMuted, marginTop: 4, fontWeight: 500 }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ AI ASSISTANT SECTION ═══════ */}
      <section id="ai-section" className="section-padding" style={{ padding: "80px 40px", background: C.white }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 16px", borderRadius: 20, background: C.tealBg, border: `1px solid ${C.tealBorder}`, marginBottom: 16 }}>
              <Bot size={14} color={C.teal} />
              <span style={{ fontSize: 13, fontWeight: 600, color: C.teal }}>ClinicBridge AI</span>
            </div>
            <h2 style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 800, color: C.navy, letterSpacing: "-0.02em" }}>
              {t("ai.title")}
            </h2>
          </div>

          {/* Chat Container */}
          <div style={{
            background: C.bg, borderRadius: 20, border: `1px solid ${C.border}`,
            boxShadow: "0 8px 32px rgba(0,0,0,0.06)", overflow: "hidden",
          }}>
            {/* Chat Messages */}
            <div ref={chatContainerRef} style={{ padding: 24, minHeight: 200, maxHeight: 600, overflowY: "auto" }}>
              {/* AI Greeting */}
              {aiMessages.length === 0 && (
                <div style={{ display: "flex", gap: 12, marginBottom: 16, animation: "slideIn 0.4s ease" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg, ${C.teal}, ${C.navy})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Bot size={18} color="#fff" />
                  </div>
                  <div style={{ background: C.white, padding: "12px 16px", borderRadius: "4px 16px 16px 16px", border: `1px solid ${C.border}`, maxWidth: "85%", fontSize: 14, lineHeight: 1.6, color: C.text }}>
                    {welcomeMsg}
                  </div>
                </div>
              )}

              {aiMessages.map((msg) => (
                <div key={msg.id} style={{
                  display: "flex", gap: 12, marginBottom: 16,
                  flexDirection: msg.role === "user" ? "row-reverse" : "row",
                  animation: "slideIn 0.4s ease",
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                    background: msg.role === "user" ? C.navyLight : `linear-gradient(135deg, ${C.teal}, ${C.navy})`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {msg.role === "user" ? <User size={18} color="#fff" /> : <Bot size={18} color="#fff" />}
                  </div>
                  <div style={{ maxWidth: "88%", minWidth: 0 }}>
                    {/* Text bubble */}
                    <div style={{
                      background: msg.role === "user" ? C.navy : C.white,
                      color: msg.role === "user" ? "#fff" : C.text,
                      padding: "12px 16px",
                      borderRadius: msg.role === "user" ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
                      border: msg.role === "user" ? "none" : `1px solid ${C.border}`,
                      fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap",
                    }}>
                      {msg.text}
                    </div>
                    {/* Clinic recommendation cards */}
                    {msg.clinics && msg.clinics.length > 0 && msg.showClinicCards !== false && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
                        {msg.clinics.map((rec) => (
                          <div key={rec.clinicId} style={{
                            background: C.white, borderRadius: 14, border: `1px solid ${C.border}`,
                            overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                          }}>
                            {/* Card header */}
                            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div>
                                <p style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>{rec.clinicName}</p>
                                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 3 }}>
                                  <span style={{ fontSize: 12, color: C.textSec, display: "flex", alignItems: "center", gap: 3 }}><MapPin size={11} /> {rec.location}</span>
                                  {rec.clinicType && <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: C.tealBg, color: C.teal, fontWeight: 600 }}>{rec.clinicType}</span>}
                                </div>
                              </div>
                              {rec.matchScore > 0 && (
                                <div style={{ background: C.tealBg, border: `1px solid ${C.tealBorder}`, borderRadius: 8, padding: "4px 10px", textAlign: "center" }}>
                                  <span style={{ fontSize: 16, fontWeight: 800, color: C.teal }}>{rec.matchScore}%</span>
                                  <p style={{ fontSize: 9, color: C.teal, fontWeight: 600 }}>AI {lang === "tr" ? "Eşleşme" : "Match"}</p>
                                </div>
                              )}
                            </div>
                            {/* Prices */}
                            {rec.matchedPrices.length > 0 && (
                              <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}` }}>
                                <p style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", marginBottom: 6, letterSpacing: 0.5 }}>{lang === "tr" ? "Tahmini Fiyatlar" : "Estimated Prices"}</p>
                                {rec.matchedPrices.map((p, pi) => (
                                  <div key={pi} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", fontSize: 13 }}>
                                    <span style={{ color: C.text }}>{p.subTreatmentName}</span>
                                    <span style={{ fontWeight: 700, color: C.teal }}>
                                      {p.priceMin === p.priceMax ? `${p.priceMin} ${p.currency}` : `${p.priceMin}–${p.priceMax} ${p.currency}`}
                                      {p.duration && <span style={{ fontWeight: 400, color: C.textMuted, fontSize: 11 }}> · {p.duration}</span>}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {/* Languages + Reason */}
                            <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}` }}>
                              {rec.supportedLanguages.length > 0 && (
                                <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
                                  {rec.supportedLanguages.map((l) => (
                                    <span key={l} style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: "rgba(99,102,241,0.08)", color: "#6366f1", fontWeight: 600 }}>{l}</span>
                                  ))}
                                </div>
                              )}
                              {rec.reason && <p style={{ fontSize: 12, color: C.textSec, fontStyle: "italic" }}>💡 {rec.reason}</p>}
                            </div>
                            {/* Actions */}
                            <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                              {sessionCtx.clinicSelectionMode === "manual" && sessionCtx.clinicSelectionStatus !== "completed" ? (
                                <div style={{ display: "flex", gap: 6 }}>
                                  {sessionCtx.selectedClinicIds?.includes(rec.clinicId) ? (
                                    <button onClick={() => sendSystemAction({ type: "clinic_selection_update", action: "deselect", clinicId: rec.clinicId, clinicName: rec.clinicName, locale: lang })} style={{ flex: 1, padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 700, background: C.white, color: C.textSec, border: `1px solid ${C.border}`, cursor: "pointer" }}>
                                      {lang === "tr" ? "Seçimi Kaldır" : "Remove Selection"}
                                    </button>
                                  ) : (
                                    <button disabled={sessionCtx.selectedClinicIds && sessionCtx.selectedClinicIds.length >= 3} onClick={() => sendSystemAction({ type: "clinic_selection_update", action: "select", clinicId: rec.clinicId, clinicName: rec.clinicName, locale: lang })} style={{ flex: 1, padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 700, background: `linear-gradient(135deg, ${C.teal}, ${C.navy})`, color: "#fff", border: "none", cursor: "pointer", opacity: sessionCtx.selectedClinicIds && sessionCtx.selectedClinicIds.length >= 3 ? 0.5 : 1 }}>
                                      {lang === "tr" ? "Seç" : "Select"}
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <button onClick={() => sendSystemAction({ type: "clinic_selection_update", action: "select", clinicId: rec.clinicId, clinicName: rec.clinicName, locale: lang })} style={{ width: "100%", padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 700, background: `linear-gradient(135deg, ${C.teal}, ${C.navy})`, color: "#fff", border: "none", cursor: "pointer" }}>
                                  {lang === "tr" ? "Bu Klinikle Devam Et" : "Proceed with this Clinic"}
                                </button>
                              )}
                              <div style={{ display: "flex", gap: 8 }}>
                                <button onClick={() => sendSystemAction({ type: "clinic_info", clinicName: rec.clinicName, clinicId: rec.clinicId })} style={{
                                  flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 700, textAlign: "center",
                                  background: C.tealBg, color: C.teal, border: `1px solid ${C.tealBorder}`, cursor: "pointer",
                                }}>
                                  {lang === "tr" ? "Daha Fazla Bilgi" : "More Info"}
                                </button>
                                <button onClick={() => sendSystemAction({ type: "lead_capture", clinicName: rec.clinicName, clinicId: rec.clinicId })} style={{
                                  flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 700,
                                  background: C.white, color: C.navy, border: `1px solid ${C.border}`, cursor: "pointer",
                                }}>
                                  {lang === "tr" ? "Teklif İste" : "Request Quote"}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                        {(msg.type === "clinic_recommendations" || msg.type === "clinic_answer") && (
                          <p style={{ fontSize: 11, color: C.textMuted, textAlign: "center", fontStyle: "italic", marginTop: 8 }}>
                            {lang === "tr" ? "Fiyatlar tahminidir; kesin fiyat değerlendirmeye göre değişebilir." : "Prices are estimates; final pricing depends on clinical evaluation."}
                          </p>
                        )}
                        
                        {msg.type === "clinic_recommendations" && sessionCtx.clinicSelectionStatus !== "completed" && (
                          <div style={{ marginTop: 16, padding: "16px", background: C.tealBg, borderRadius: 16, border: `1px solid ${C.tealBorder}` }}>
                            <p style={{ fontSize: 13, color: C.navy, fontWeight: 600, marginBottom: 12, textAlign: "center" }}>
                              {lang === "tr" 
                                ? `Nasıl ilerlemek istersiniz? (En fazla 3 klinik seçebilirsiniz)` 
                                : `How would you like to proceed? (Max 3 clinics allowed)`}
                            </p>
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                              <button onClick={() => sendSystemAction({ type: "clinic_selection_mode", mode: "automatic" })} style={{ width: "100%", padding: "12px", borderRadius: 12, fontSize: 14, fontWeight: 700, background: sessionCtx.clinicSelectionMode === "automatic" ? `linear-gradient(135deg, ${C.teal}, ${C.navy})` : C.white, color: sessionCtx.clinicSelectionMode === "automatic" ? "#fff" : C.teal, border: `1px solid ${sessionCtx.clinicSelectionMode === "automatic" ? "transparent" : C.teal}`, cursor: "pointer", transition: "all 0.2s" }}>
                                {lang === "tr" ? "Tüm uygun kliniklerden teklif al" : "Get offers from all suitable clinics"}
                              </button>
                              <button onClick={() => sendSystemAction({ type: "clinic_selection_mode", mode: "manual" })} style={{ width: "100%", padding: "12px", borderRadius: 12, fontSize: 14, fontWeight: 700, background: sessionCtx.clinicSelectionMode === "manual" ? `linear-gradient(135deg, ${C.teal}, ${C.navy})` : C.white, color: sessionCtx.clinicSelectionMode === "manual" ? "#fff" : C.teal, border: `1px solid ${sessionCtx.clinicSelectionMode === "manual" ? "transparent" : C.teal}`, cursor: "pointer", transition: "all 0.2s" }}>
                                {lang === "tr" ? "Klinikleri tek tek seç" : "Select clinics individually"}
                              </button>
                            </div>
                            
                            {sessionCtx.clinicSelectionMode === "manual" && (
                              <div style={{ marginTop: 16, textAlign: "center", borderTop: `1px solid ${C.tealBorder}`, paddingTop: 16 }}>
                                <p style={{ fontSize: 14, color: C.text, fontWeight: 600, marginBottom: 12 }}>
                                  {lang === "tr" ? "Seçilen Klinikler: " : "Selected Clinics: "}
                                  <span style={{ color: C.teal, fontSize: 16 }}>{sessionCtx.selectedClinicIds?.length || 0} / 3</span>
                                </p>
                                {sessionCtx.selectedClinicIds && sessionCtx.selectedClinicIds.length > 0 && (
                                  <button onClick={() => sendSystemAction({ type: "clinic_selection_complete" })} style={{ width: "100%", padding: "12px", borderRadius: 12, fontSize: 14, fontWeight: 700, background: `linear-gradient(135deg, ${C.teal}, ${C.navy})`, color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 4px 12px rgba(13,148,136,0.2)" }}>
                                    {lang === "tr" ? "Seçimi Tamamla ve Devam Et" : "Complete Selection and Continue"}
                                  </button>
                                )}
                              </div>
                            )}

                            {sessionCtx.clinicSelectionMode === "automatic" && (
                              <div style={{ marginTop: 16, textAlign: "center", borderTop: `1px solid ${C.tealBorder}`, paddingTop: 16 }}>
                                <button onClick={() => sendSystemAction({ type: "clinic_selection_complete" })} style={{ width: "100%", padding: "12px", borderRadius: 12, fontSize: 14, fontWeight: 700, background: `linear-gradient(135deg, ${C.teal}, ${C.navy})`, color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 4px 12px rgba(13,148,136,0.2)" }}>
                                  {lang === "tr" ? "Seçimi Onayla ve Devam Et" : "Confirm Selection and Continue"}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Consent Request UI */}
                    {msg.type === "consent_request" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                        {msg.privacyNoticeUrl && (
                          <a href={msg.privacyNoticeUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.teal, textDecoration: "underline", display: "inline-block", marginBottom: 4 }}>
                            {lang === "tr" ? "Aydınlatma Metnini Okuyun" : "Read Privacy Notice"}
                          </a>
                        )}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => sendConsentAction("accept")} disabled={aiTyping} style={{ flex: 1, padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 700, background: `linear-gradient(135deg, ${C.teal}, ${C.navy})`, color: "#fff", border: "none", cursor: "pointer", opacity: aiTyping ? 0.6 : 1 }}>
                            {lang === "tr" ? "Kabul Ediyorum" : "I Accept"}
                          </button>
                          <button onClick={() => sendConsentAction("decline")} disabled={aiTyping} style={{ flex: 1, padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 700, background: C.white, color: C.navy, border: `1px solid ${C.border}`, cursor: "pointer", opacity: aiTyping ? 0.6 : 1 }}>
                            {lang === "tr" ? "Reddediyorum" : "I Decline"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Email Request UI */}
                    {msg.type === "email_request" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input 
                            type="email" 
                            placeholder={lang === "tr" ? "E-posta adresiniz..." : "Your email address..."} 
                            value={emailInput} 
                            onChange={(e) => setEmailInput(e.target.value)} 
                            style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, outline: "none" }}
                            onKeyDown={(e) => { if (e.key === "Enter") sendEmailAction(emailInput); }}
                          />
                          <button onClick={() => sendEmailAction(emailInput)} disabled={aiTyping || !emailInput.trim()} style={{ padding: "0 16px", borderRadius: 8, fontSize: 13, fontWeight: 700, background: `linear-gradient(135deg, ${C.teal}, ${C.navy})`, color: "#fff", border: "none", cursor: "pointer", opacity: aiTyping || !emailInput.trim() ? 0.6 : 1 }}>
                            <Send size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {aiTyping && (
                <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg, ${C.teal}, ${C.navy})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Bot size={18} color="#fff" />
                  </div>
                  <div style={{ background: C.white, padding: "12px 16px", borderRadius: "4px 16px 16px 16px", border: `1px solid ${C.border}`, fontSize: 13, color: C.teal, display: "flex", alignItems: "center", gap: 8, animation: "pulse 1.5s infinite" }}>
                    <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                    {t("ai.typing")}
                  </div>
                </div>
              )}
              {/* scroll handled by chatContainerRef */}
            </div>

            {/* Input */}
            <div style={{ padding: "16px 24px", borderTop: `1px solid ${C.border}`, background: C.white }}>
              <div style={{ display: "flex", gap: 10 }}>
                <textarea
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAi(); } }}
                  placeholder={t("ai.placeholder")}
                  rows={2}
                  style={{
                    flex: 1, padding: "12px 16px", borderRadius: 12, border: `1px solid ${C.border}`,
                    fontSize: 14, resize: "none", outline: "none", fontFamily: "inherit", color: C.text,
                    background: C.bg, lineHeight: 1.5,
                  }}
                />
                <button 
                  id="agency-ai-send-btn"
                  className="demo-btn" onClick={sendAi} disabled={aiTyping}
                  style={{
                    padding: "0 24px", borderRadius: 12, background: `linear-gradient(135deg, ${C.teal}, ${C.navy})`,
                    color: "#fff", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8,
                    opacity: aiTyping ? 0.6 : 1, alignSelf: "flex-end", height: 48,
                  }}>
                  <Send size={16} /> {t("ai.searchBtn")}
                </button>
              </div>
              <p style={{ fontSize: 11, color: C.textMuted, marginTop: 8, textAlign: "center" }}>
                <Sparkles size={10} style={{ display: "inline", verticalAlign: "middle" }} /> {t("ai.poweredBy")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* AI Results section removed — clinic cards now render inline in chat */}

      {/* ═══════ HOW IT WORKS ═══════ */}
      <section id="steps" className="section-padding" style={{ padding: "80px 40px", background: C.white }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <h2 style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 800, color: C.navy, letterSpacing: "-0.02em" }}>{t("steps.title")}</h2>
            <p style={{ fontSize: 16, color: C.textSec, marginTop: 8 }}>{t("steps.subtitle")}</p>
          </div>
          <div className="steps-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32 }}>
            {[1, 2, 3].map((step) => {
              const icons = [<MessageSquare key="1" size={28} />, <TrendingUp key="2" size={28} />, <CheckCircle2 key="3" size={28} />];
              return (
                <div key={step} className="card-hover" style={{
                  padding: 32, borderRadius: 20, background: C.bg,
                  border: `1px solid ${C.border}`, textAlign: "center",
                }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: 16, margin: "0 auto 20px",
                    background: `linear-gradient(135deg, ${C.tealBg}, rgba(13,148,136,0.12))`,
                    display: "flex", alignItems: "center", justifyContent: "center", color: C.teal,
                  }}>
                    {icons[step - 1]}
                  </div>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", margin: "0 auto 16px",
                    background: C.teal, color: "#fff", fontSize: 14, fontWeight: 800,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{step}</div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 10 }}>
                    {t(`steps.step${step}.title`)}
                  </h3>
                  <p style={{ fontSize: 14, color: C.textSec, lineHeight: 1.6 }}>
                    {t(`steps.step${step}.desc`)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════ TREATMENTS ═══════ */}
      <section id="treatments" className="section-padding" style={{ padding: "80px 40px", background: C.bg }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <h2 style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 800, color: C.navy }}>{t("treatments.title")}</h2>
            <p style={{ fontSize: 16, color: C.textSec, marginTop: 8 }}>{t("treatments.subtitle")}</p>
          </div>
          <div className="treatments-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {TREATMENTS.map((key) => {
              const Icon = TREATMENT_ICONS[key];
              const colors = ["#0D9488", "#1E293B", "#7C3AED", "#2563EB", "#EC4899", "#F59E0B"];
              const color = colors[TREATMENTS.indexOf(key)];
              return (
                <div key={key} className="card-hover" style={{
                  padding: 24, borderRadius: 16, background: C.white, border: `1px solid ${C.border}`,
                  display: "flex", alignItems: "center", gap: 16, cursor: "pointer",
                }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 14,
                    background: `${color}14`, display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon size={24} color={color} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>{t(`treatments.${key}`)}</h4>
                  </div>
                  <ChevronRight size={18} color={C.textMuted} />
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════ CLINICS ═══════ */}
      <section id="clinics" className="section-padding" style={{ padding: "80px 40px", background: C.white }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <h2 style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 800, color: C.navy }}>{t("clinics.title")}</h2>
            <p style={{ fontSize: 16, color: C.textSec, marginTop: 8 }}>{t("clinics.subtitle")}</p>
          </div>
          <div className="clinics-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {clinics.map((clinic) => (
              <div key={clinic.id} className="card-hover" style={{
                background: C.white, borderRadius: 16, border: `1px solid ${C.border}`,
                overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
              }}>
                <div style={{ height: 80, background: clinic.image, display: "flex", alignItems: "flex-end", padding: "0 16px 12px" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)", background: "rgba(0,0,0,0.2)", padding: "3px 8px", borderRadius: 6 }}>
                    {clinic.type[lang]}
                  </span>
                </div>
                <div style={{ padding: "16px 20px" }}>
                  <h4 style={{ fontSize: 15, fontWeight: 700, color: C.navy, marginBottom: 6 }}>{clinic.name}</h4>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                    <MapPin size={13} color={C.teal} />
                    <span style={{ fontSize: 12.5, color: C.textSec }}>{clinic.location}</span>
                    <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 700, color: "#f59e0b", display: "flex", alignItems: "center", gap: 3 }}>
                      <Star size={12} fill="#f59e0b" color="#f59e0b" /> {clinic.rating} <span style={{ fontWeight: 400, color: C.textMuted }}>({clinic.reviews})</span>
                    </span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
                    {clinic.specialties.map((s, i) => (
                      <span key={i} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: C.tealBg, color: C.teal, fontWeight: 600 }}>
                        {s[lang]}
                      </span>
                    ))}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.teal }}>{clinic.priceRange}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      {clinic.accommodation && <Hotel size={15} color={C.teal} />}
                      {clinic.transfer && <Car size={15} color={C.teal} />}
                      <Globe2 size={15} color={C.teal} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <button className="demo-btn" onClick={() => openLeadModal(clinic.name)}
                      style={{
                        flex: 1, padding: "10px 0", borderRadius: 10,
                        background: C.teal, border: "none",
                        color: "#fff", fontSize: 13, fontWeight: 700,
                      }}>
                      {t("results.requestQuote")}
                    </button>
                    <Link href={`/agency-demo/medicalcenter/${clinic.clinicSlug}`}
                      style={{
                        display: "flex", alignItems: "center", gap: 4,
                        padding: "10px 14px", borderRadius: 10,
                        background: C.bg, border: `1px solid ${C.border}`,
                        color: C.textSec, fontSize: 12, fontWeight: 600,
                        textDecoration: "none", transition: "all 0.2s",
                      }}>
                      <ExternalLink size={12} /> {t("results.viewProfile")}
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ DESTINATIONS ═══════ */}
      <section id="destinations" className="section-padding" style={{ padding: "80px 40px", background: C.bg }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <h2 style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 800, color: C.navy }}>{t("dest.title")}</h2>
            <p style={{ fontSize: 16, color: C.textSec, marginTop: 8 }}>{t("dest.subtitle")}</p>
          </div>
          <div className="dest-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {[
              { key: "istanbul", gradient: "linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0D9488 100%)", emoji: "🕌" },
              { key: "antalya", gradient: "linear-gradient(135deg, #0D9488 0%, #14B8A6 50%, #2DD4BF 100%)", emoji: "🏖️" },
              { key: "izmir", gradient: "linear-gradient(135deg, #2563EB 0%, #3B82F6 50%, #60A5FA 100%)", emoji: "⚓" },
            ].map((dest) => (
              <div key={dest.key} className="card-hover" style={{
                borderRadius: 20, overflow: "hidden", position: "relative", height: 240,
                background: dest.gradient, cursor: "pointer",
              }}>
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 28 }}>
                  <span style={{ fontSize: 40, marginBottom: 8 }}>{dest.emoji}</span>
                  <h3 style={{ fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 4 }}>{t(`dest.${dest.key}`)}</h3>
                  <p style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", marginBottom: 16 }}>{t(`dest.${dest.key}.desc`)}</p>
                  <button className="demo-btn" style={{
                    alignSelf: "flex-start", padding: "8px 20px", borderRadius: 8,
                    background: "rgba(255,255,255,0.2)", backdropFilter: "blur(4px)",
                    color: "#fff", fontSize: 13, fontWeight: 700,
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    {t("dest.explore")} <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ FOOTER ═══════ */}
      <footer id="footer" style={{ background: C.navy, color: "rgba(255,255,255,0.7)", padding: "60px 40px 30px" }}>
        <div className="section-padding" style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div className="footer-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 40, marginBottom: 40 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${C.teal}, ${C.tealLight})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Sparkles size={16} color="#fff" />
                </div>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>ClinicBridge <span style={{ color: C.tealLight }}>AI</span></span>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.7, maxWidth: 300 }}>{t("footer.desc")}</p>
            </div>
            <div>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 16 }}>{t("footer.links")}</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {["nav.treatments", "nav.clinics", "nav.destinations", "nav.howItWorks"].map((k) => (
                  <span key={k} style={{ fontSize: 13, cursor: "pointer" }}>{t(k)}</span>
                ))}
              </div>
            </div>
            <div>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 16 }}>{t("footer.legal")}</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {["footer.privacy", "footer.terms", "footer.kvkk"].map((k) => (
                  <span key={k} style={{ fontSize: 13, cursor: "pointer" }}>{t(k)}</span>
                ))}
              </div>
            </div>
            <div>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 16 }}>{t("footer.contact")}</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Mail size={14} color={C.tealLight} /> info@clinicbridge.ai</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Phone size={14} color={C.tealLight} /> +90 212 555 0000</div>
              </div>
            </div>
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <p style={{ fontSize: 12 }}>© 2026 ClinicBridge. {t("footer.rights")}</p>
            <p style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
              <Sparkles size={10} color={C.tealLight} /> {t("footer.poweredBy")}
            </p>
          </div>
        </div>
      </footer>

      {/* ═══════ LEAD MODAL ═══════ */}
      {leadModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", padding: 20,
        }} onClick={() => setLeadModal(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: C.white, borderRadius: 20, width: "100%", maxWidth: 500,
            boxShadow: "0 24px 48px rgba(0,0,0,0.15)", overflow: "hidden",
            animation: "fadeUp 0.3s ease",
          }}>
            {leadSubmitted ? (
              <div style={{ padding: 48, textAlign: "center" }}>
                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(34, 197, 94, 0.1)", margin: "0 auto 20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <CheckCircle2 size={32} color="#22c55e" />
                </div>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: C.navy, marginBottom: 8 }}>{t("lead.success.title")}</h3>
                <p style={{ fontSize: 14, color: C.textSec, marginBottom: 24 }}>{t("lead.success.desc")}</p>
                <button className="demo-btn" onClick={() => setLeadModal(false)}
                  style={{ padding: "10px 28px", borderRadius: 10, background: C.teal, color: "#fff", fontSize: 14, fontWeight: 700 }}>
                  {t("lead.close")}
                </button>
              </div>
            ) : (
              <>
                <div style={{ padding: "24px 28px", borderBottom: `1px solid ${C.border}` }}>
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: C.navy }}>{t("lead.title")}</h3>
                  <p style={{ fontSize: 13, color: C.textSec, marginTop: 4 }}>{t("lead.subtitle")}</p>
                  {leadClinic && (
                    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, background: C.tealBg }}>
                      <Building2 size={14} color={C.teal} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.teal }}>{leadClinic}</span>
                    </div>
                  )}
                </div>
                <form onSubmit={handleLeadSubmit} style={{ padding: "24px 28px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {[
                      { key: "name", type: "text" },
                      { key: "email", type: "email" },
                      { key: "phone", type: "tel" },
                      { key: "country", type: "text" },
                    ].map(({ key, type }) => (
                      <div key={key}>
                        <label style={{ fontSize: 12.5, fontWeight: 600, color: C.textSec, marginBottom: 4, display: "block" }}>{t(`lead.${key}`)}</label>
                        <input type={type} required style={{
                          width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.border}`,
                          fontSize: 14, outline: "none", color: C.text, background: C.bg,
                        }} />
                      </div>
                    ))}
                    <div>
                      <label style={{ fontSize: 12.5, fontWeight: 600, color: C.textSec, marginBottom: 4, display: "block" }}>{t("lead.message")}</label>
                      <textarea rows={3} style={{
                        width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.border}`,
                        fontSize: 14, outline: "none", resize: "none", fontFamily: "inherit", color: C.text, background: C.bg,
                      }} />
                    </div>
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", fontSize: 12.5, color: C.textSec }}>
                      <input type="checkbox" required style={{ width: 16, height: 16, marginTop: 2, accentColor: C.teal }} />
                      {t("lead.consent")}
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                    <button type="button" onClick={() => setLeadModal(false)}
                      style={{ flex: 1, padding: "12px 0", borderRadius: 10, background: C.bg, border: `1px solid ${C.border}`, color: C.textSec, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                      {t("lead.close")}
                    </button>
                    <button type="submit" className="demo-btn" disabled={leadSubmitting}
                      style={{
                        flex: 2, padding: "12px 0", borderRadius: 10,
                        background: `linear-gradient(135deg, ${C.teal}, ${C.navy})`,
                        color: "#fff", fontSize: 14, fontWeight: 700,
                        opacity: leadSubmitting ? 0.7 : 1,
                      }}>
                      {leadSubmitting ? t("lead.submitting") : t("lead.submit")}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
