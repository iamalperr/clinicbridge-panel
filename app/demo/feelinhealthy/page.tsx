"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Search, MapPin, Stethoscope, Star, Globe2, Hotel, Car,
  ChevronRight, Send, Bot, User, Heart, Eye, Baby, Scissors, Sparkles,
  Phone, Mail, CheckCircle2, ArrowRight, Menu, X,
  Building2, TrendingUp, Loader2, ExternalLink, MessageSquare,
} from "lucide-react";
import { PrivacyConsentCard } from "@/components/chat/PrivacyConsentCard";
import { IstanbulSideClarificationCard } from "@/components/chat/IstanbulSideClarificationCard";
import { CitySelectionCard } from "@/components/chat/CitySelectionCard";
import { FEELINHEALTHY_CONFIG } from "@/lib/agency/feelinhealthyConfig";
import type { ClinicCardActionType } from "@/lib/agency/feelinhealthyClinicCardActions";
import {
  appendAgentPrefillQuery,
  buildQuotePrefillFromSession,
  saveQuotePrefill,
} from "@/lib/agency/feelinhealthyQuotePrefill";

const GUEST_CLINIC_LIMIT =
  FEELINHEALTHY_CONFIG.guestQuoteClinicSelectionLimit ||
  FEELINHEALTHY_CONFIG.maxGuestClinics ||
  2;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type Lang = "tr" | "en";

interface AgencyData {
  id: string; name: string; slug: string; domain: string;
  logo?: string; branding: { primaryColor: string; accentColor?: string };
  supportedLanguages: string[]; privacyUrl?: string;
  treatmentCategories: string[]; contactEmail?: string;
  settings?: {
    maxClinicsPerTreatmentRequest?: number;
  };
}

interface Treatment {
  id: string; category: string; name: string; slug: string;
  description?: string; avgPriceMin?: number; avgPriceMax?: number;
  currency: string; status: string;
}

interface ClinicData {
  id: string; clinicName: string; clinicType?: string;
  location: { city: string; country: string; address?: string };
  profileUrl?: string; website?: string;
  supportedLanguages: string[]; treatmentCategories: string[];
  subTreatments?: string[];
  rating?: number; reviewCount?: number;
  status: string; priority: number;
  showInRecommendations?: boolean;
  showPriceRange?: boolean; showProfileLink?: boolean;
  shortDescription?: string;
}

interface PricingItem {
  id: string; clinicId: string; clinicName: string;
  treatmentName: string; priceMin: number; priceMax: number;
  currency: string; priceType: string;
}

interface MatchingConfig {
  maxClinicsToShow: number; showPriceRange: boolean;
  showProfileLinks: boolean; requireConsentBeforeQuote: boolean;
}

interface WidgetConfig {
  assistantName: string; welcomeMessage?: string;
  toneOfVoice?: string; defaultLanguage?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LANGUAGE
// ═══════════════════════════════════════════════════════════════════════════════

const TX: Record<Lang, Record<string, string>> = {
  tr: {
    "demo.banner": "🎯 Bu sayfa ClinicBridge AI demo deneyimidir",
    "nav.home": "Ana Sayfa", "nav.treatments": "Tedaviler", "nav.clinics": "Klinikler",
    "nav.how": "Nasıl Çalışır?", "nav.contact": "İletişim",
    "hero.badge": "AI Destekli Klinik Eşleştirme",
    "hero.title": "Sağlık Turizminizde Doğru Kliniği",
    "hero.titleHL": "Yapay Zekâ ile Bulun",
    "hero.sub": "Tedavi ihtiyacınızı anlatın — ClinicBridge AI size en uygun klinikleri ve tedavi seçeneklerini saniyeler içinde önersin.",
    "hero.cta": "AI ile Klinik Bul", "hero.cta2": "Tedavilere Göz At",
    "stat.clinics": "Partnör Klinik", "stat.satisfaction": "Hasta Memnuniyeti",
    "stat.countries": "Ülkeden Hasta", "stat.savings": "Tasarruf",
    "ai.title": "Tedavi ihtiyacınızı yapay zekâya anlatın",
    "ai.sub": "Doğal dilde yazın, AI size en uygun klinikleri bulsun.",
    "ai.placeholder": "İstanbul’da implant tedavisi yaptırmak istiyorum. Avrupa Yakası ve İngilizce destek benim için önemli.",
    "ai.send": "Klinik Bul", "ai.powered": "ClinicBridge AI tarafından desteklenmektedir",
    "ai.typing": "AI analiz ediyor...",
    "ai.noMatch": "Üzgünüm, aramanızla eşleşen klinik bulunamadı. Lütfen farklı bir tedavi türü deneyin.",
    "ai.found": "Kriterlere uygun klinik(ler) bulundu! Aşağıda sonuçları görebilirsiniz. 👇",
    "rec.title": "AI Klinik Önerileri", "rec.sub": "Kriterlerinize göre eşleştirilen klinikler",
    "rec.price": "Tahmini Fiyat", "rec.langs": "Diller",
    "rec.quote": "Teklif İste", "rec.profile": "Daha Fazla Bilgi",
    "rec.noPrice": "Teklif alarak öğrenin",
    "steps.title": "Nasıl Çalışır?", "steps.sub": "3 adımda doğru kliniği bulun",
    "steps.1.t": "İhtiyacınızı AI'ya Anlatın", "steps.1.d": "Tedavi ihtiyacınızı ve tercihlerinizi doğal dilde yazın.",
    "steps.2.t": "Klinik ve Teklifleri Karşılaştırın", "steps.2.d": "AI önerilen kliniklerin fiyat ve hizmetlerini karşılaştırın.",
    "steps.3.t": "Tedavinizi Başlatın", "steps.3.d": "Kliniğinizi seçin, teklif alın ve tedavi sürecini başlatın.",
    "treat.title": "Tedavi Kategorileri", "treat.sub": "AI destekli klinik eşleştirme",
    "clinics.title": "Partnör Kliniklerimiz", "clinics.sub": "Ağımızdaki klinikler",
    "lead.title": "Teklif Talebi", "lead.sub": "Bilgilerinizi bırakın, kliniklerden teklif alalım.",
    "lead.name": "Ad Soyad", "lead.email": "E-posta", "lead.phone": "Telefon",
    "lead.country": "Ülke", "lead.message": "Mesajınız",
    "lead.consent": "KVKK/GDPR kapsamında kişisel verilerimin işlenmesini kabul ediyorum.",
    "lead.submit": "Teklif İste", "lead.sending": "Gönderiliyor...",
    "lead.ok.title": "Talebiniz Alındı! ✅", "lead.ok.desc": "Seçtiğiniz kliniklerden en kısa sürede teklifler iletilecektir.",
    "lead.close": "Kapat",
    "loading": "Yükleniyor...", "error": "Veri yüklenemedi. Lütfen daha sonra tekrar deneyin.",
    "footer.desc": "ClinicBridge AI destekli sağlık turizmi platformu.",
    "footer.rights": "Tüm hakları saklıdır.", "footer.poweredBy": "ClinicBridge AI altyapısı ile desteklenmektedir",
    "footer.links": "Hızlı Linkler", "footer.legal": "Yasal",
    "footer.privacy": "Gizlilik Politikası", "footer.terms": "Kullanım Koşulları", "footer.kvkk": "KVKK",
    "cat.dental": "Diş Tedavisi", "cat.hair_transplant": "Saç Ekimi", "cat.aesthetic_surgery": "Estetik Cerrahi",
    "cat.ivf": "Tüp Bebek", "cat.check_up": "Check-Up", "cat.eye_treatments": "Göz Tedavisi",
    "cat.oncology": "Onkoloji", "cat.cardiology": "Kardiyoloji", "cat.other": "Diğer",
  },
  en: {
    "demo.banner": "🎯 This page is a ClinicBridge AI demo experience",
    "nav.home": "Home", "nav.treatments": "Treatments", "nav.clinics": "Clinics",
    "nav.how": "How It Works", "nav.contact": "Contact",
    "hero.badge": "AI-Powered Clinic Matching",
    "hero.title": "Find the Right Clinic for Your",
    "hero.titleHL": "Health Tourism with AI",
    "hero.sub": "Tell us your treatment needs — ClinicBridge AI will recommend the best clinics and treatment options in seconds.",
    "hero.cta": "Find Clinics with AI", "hero.cta2": "Browse Treatments",
    "stat.clinics": "Partner Clinics", "stat.satisfaction": "Patient Satisfaction",
    "stat.countries": "Patient Countries", "stat.savings": "Average Savings",
    "ai.title": "Tell AI about your treatment needs",
    "ai.sub": "Write in natural language — AI will find the best clinics for you.",
    "ai.placeholder": "Example: I want dental implants in Istanbul. European Side and English support are important to me.",
    "ai.send": "Find Clinics", "ai.powered": "Powered by ClinicBridge AI",
    "ai.typing": "AI is analyzing...",
    "ai.noMatch": "Sorry, no clinics match your search. Please try a different treatment type.",
    "ai.found": "Matching clinic(s) found! See the results below. 👇",
    "rec.title": "AI Clinic Recommendations", "rec.sub": "Clinics matched based on your criteria",
    "rec.price": "Est. Price", "rec.langs": "Languages",
    "rec.quote": "Request Quote", "rec.profile": "More Info",
    "rec.noPrice": "Request a quote to learn",
    "steps.title": "How It Works", "steps.sub": "Find the right clinic in 3 steps",
    "steps.1.t": "Tell AI Your Needs", "steps.1.d": "Describe your treatment needs and preferences.",
    "steps.2.t": "Compare Clinics & Offers", "steps.2.d": "Compare prices and services of AI-recommended clinics.",
    "steps.3.t": "Start Your Treatment", "steps.3.d": "Choose your clinic, request a quote, and start your journey.",
    "treat.title": "Treatment Categories", "treat.sub": "AI-powered clinic matching",
    "clinics.title": "Our Partner Clinics", "clinics.sub": "Clinics in our network",
    "lead.title": "Quote Request", "lead.sub": "Leave your details and we'll get quotes from selected clinics.",
    "lead.name": "Full Name", "lead.email": "Email", "lead.phone": "Phone",
    "lead.country": "Country", "lead.message": "Your Message",
    "lead.consent": "I consent to the processing of my personal data under GDPR/KVKK.",
    "lead.submit": "Request Quote", "lead.sending": "Submitting...",
    "lead.ok.title": "Request Received! ✅", "lead.ok.desc": "You will receive quotes from selected clinics shortly.",
    "lead.close": "Close",
    "loading": "Loading...", "error": "Failed to load data. Please try again later.",
    "footer.desc": "AI-powered health tourism platform by ClinicBridge.",
    "footer.rights": "All rights reserved.", "footer.poweredBy": "Powered by ClinicBridge AI",
    "footer.links": "Quick Links", "footer.legal": "Legal",
    "footer.privacy": "Privacy Policy", "footer.terms": "Terms of Service", "footer.kvkk": "KVKK Notice",
    "cat.dental": "Dental", "cat.hair_transplant": "Hair Transplant", "cat.aesthetic_surgery": "Aesthetic Surgery",
    "cat.ivf": "IVF", "cat.check_up": "Check-Up", "cat.eye_treatments": "Eye Treatments",
    "cat.oncology": "Oncology", "cat.cardiology": "Cardiology", "cat.other": "Other",
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// KEYWORD MATCHING
// ═══════════════════════════════════════════════════════════════════════════════

const KW: Record<string, string> = {
  implant: "dental", diş: "dental", dental: "dental", crown: "dental", veneer: "dental",
  hollywood: "dental", zirkonyum: "dental", zirconium: "dental", "smile design": "dental",
  whitening: "dental", beyazlatma: "dental", kanal: "dental",
  hair: "hair_transplant", saç: "hair_transplant", fue: "hair_transplant", dhi: "hair_transplant",
  sakal: "hair_transplant", beard: "hair_transplant", transplant: "hair_transplant",
  rhinoplasty: "aesthetic_surgery", burun: "aesthetic_surgery", nose: "aesthetic_surgery",
  liposuction: "aesthetic_surgery", meme: "aesthetic_surgery", breast: "aesthetic_surgery",
  facelift: "aesthetic_surgery", estetik: "aesthetic_surgery", aesthetic: "aesthetic_surgery",
  tummy: "aesthetic_surgery", bbl: "aesthetic_surgery",
  eye: "eye_treatments", göz: "eye_treatments", laser: "eye_treatments", lasik: "eye_treatments",
  katarakt: "eye_treatments", cataract: "eye_treatments",
  ivf: "ivf", "tüp bebek": "ivf", fertility: "ivf", tüp: "ivf",
  check: "check_up", checkup: "check_up", "check-up": "check_up",
};

function extractCategory(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [kw, cat] of Object.entries(KW)) {
    if (lower.includes(kw)) return cat;
  }
  return null;
}

function extractCity(text: string): string | null {
  const lower = text.toLowerCase();
  const cities = ["istanbul", "antalya", "izmir", "ankara", "bursa", "bodrum"];
  for (const c of cities) {
    if (lower.includes(c)) return c;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COLORS
// ═══════════════════════════════════════════════════════════════════════════════

const C = {
  primary: "#0D9488", primaryDark: "#065F46", primaryLight: "#14B8A6",
  primaryBg: "rgba(13,148,136,0.06)", primaryBorder: "rgba(13,148,136,0.2)",
  navy: "#0F172A", navyLight: "#1E293B", accent: "#F97316",
  white: "#FFFFFF", bg: "#F8FAFC", border: "#E2E8F0",
  text: "#0F172A", textSec: "#475569", textMuted: "#94A3B8",
};

const CATEGORY_COLORS: Record<string, string> = {
  dental: "#0D9488", hair_transplant: "#1E293B", aesthetic_surgery: "#7C3AED",
  eye_treatments: "#2563EB", ivf: "#EC4899", check_up: "#F59E0B",
  oncology: "#EF4444", cardiology: "#06B6D4", other: "#94A3B8",
};

const CATEGORY_ICONS: Record<string, any> = {
  dental: Stethoscope, hair_transplant: Scissors, aesthetic_surgery: Sparkles,
  eye_treatments: Eye, ivf: Baby, check_up: Heart,
  oncology: Heart, cardiology: Heart, other: Stethoscope,
};

const SLUG = "feelinhealthy";

// ═══════════════════════════════════════════════════════════════════════════════
// CLINIC CARD SAFETY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Clinic recommendations arrive from several endpoints and older sessions can
 * replay a payload from a previous deployment. These helpers keep a single
 * malformed record from taking the whole page down: the list is always an
 * array, a record with no identity is skipped, and optional fields fall back to
 * nothing rather than being invented.
 */
function normalizeClinicRecommendations(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

/** A card needs an id to act on and a name to show. Anything else is optional. */
function isRenderableClinic(rec: any): boolean {
  if (!rec || typeof rec !== "object") return false;
  const id = rec.clinicId ?? rec.id;
  const name = rec.clinicName ?? rec.name;
  return Boolean(id) && typeof name === "string" && name.trim().length > 0;
}

/** Doctors that cannot be labelled are dropped rather than rendered blank. */
function getRenderableDoctors(rec: any): any[] {
  const match = rec?.doctorMatch;
  if (!match?.hasRelevantDoctors || !Array.isArray(match.doctors)) return [];

  const named = match.doctors.filter(
    (doc: any) => typeof doc?.fullName === "string" && doc.fullName.trim().length > 0
  );
  const limit =
    typeof match.displayedDoctorCount === "number" && match.displayedDoctorCount > 0
      ? match.displayedDoctorCount
      : named.length;

  return named.slice(0, limit);
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function FeelinHealthyLive() {
  const [lang, setLang] = useState<Lang>("tr");
  const [mobileMenu, setMobileMenu] = useState(false);

  // Data
  const [agency, setAgency] = useState<AgencyData | null>(null);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [clinics, setClinics] = useState<ClinicData[]>([]);
  const [pricing, setPricing] = useState<PricingItem[]>([]);
  const [matchingCfg, setMatchingCfg] = useState<MatchingConfig | null>(null);
  const [widgetCfg, setWidgetCfg] = useState<WidgetConfig | null>(null);
  const [aiCfg, setAiCfg] = useState<any>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState(false);

  // AI Chat
  const [aiInput, setAiInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [aiMsgs, setAiMsgs] = useState<{
    role: "user" | "ai";
    text: string;
    type?: string;
    clinics?: any[];
    showClinicCards?: boolean;
    privacyNoticeUrl?: string;
    privacyNoticeLabel?: string;
    consentStructured?: any;
    sideClarificationCard?: any;
    citySelectionCard?: any;
    selectedSideOptionId?: string;
    selectedCityOptionId?: string;
    additionalEligibleClinicCount?: number;
    conversionData?: any;
  }[]>([]);
  const [aiTyping, setAiTyping] = useState(false);

  // Extended Request UX
  const [showMaxClinicsModal, setShowMaxClinicsModal] = useState(false);
  const [pendingClinicActionKeys, setPendingClinicActionKeys] = useState<Record<string, boolean>>({});
  const processedClinicActionIdsRef = useRef<Set<string>>(new Set());
  const [requestMoreLoading, setRequestMoreLoading] = useState(false);

  const [matchedClinics, setMatchedClinics] = useState<ClinicData[]>([]);
  const [matchedCategory, setMatchedCategory] = useState<string | null>(null);
  
  // Initialize with a unique session ID for consent tracking
  const [sessionCtx, setSessionCtx] = useState<any>(() => {
    return {
      sessionId: typeof window !== 'undefined' ? crypto.randomUUID() : "",
      leadStage: "discovery"
    };
  });
  // Always send the latest backend session — avoids stale React closures on rapid widget clicks.
  const sessionCtxRef = useRef(sessionCtx);
  useEffect(() => {
    sessionCtxRef.current = sessionCtx;
  }, [sessionCtx]);
  const commitSessionCtx = useCallback((next: any) => {
    if (!next || typeof next !== "object") return;
    sessionCtxRef.current = next;
    setSessionCtx(next);
  }, []);

  /** Persist quote request (lead + quotes) after matching-chat signals readiness. */
  const persistQuoteRequestLead = useCallback(async (opts: {
    ctx: any;
    clinicIds?: string[];
    history?: Array<{ role: string; content: string }>;
  }): Promise<{ ok: boolean; leadId?: string; quoteId?: string; error?: string }> => {
    const ctx = opts.ctx || {};
    const clinicIds = Array.from(
      new Set(
        (opts.clinicIds && opts.clinicIds.length > 0
          ? opts.clinicIds
          : ctx.selectedClinicIds || (ctx.selectedClinicId ? [ctx.selectedClinicId] : [])
        ).filter(Boolean)
      )
    );
    if (!ctx.patientEmail || !ctx.sessionId || clinicIds.length === 0) {
      console.warn("[CB-DEMO] skip lead persist — missing email, sessionId, or clinicIds");
      return { ok: false, error: "MISSING_FIELDS" };
    }
    try {
      const leadRes = await fetch(`/api/public/agency/${SLUG}/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: ctx.patientName,
          patientEmail: ctx.patientEmail,
          patientPhone: ctx.patientPhone,
          patientAge: ctx.patientAge,
          patientGender: ctx.patientGender,
          country: ctx.patientCountry,
          language: lang,
          treatmentCategory: ctx.lastTreatmentCategory || matchedCategory || "other",
          treatmentSubcategory: ctx.lastSubTreatment || "",
          clinicIds,
          conversationId: ctx.sessionId,
          conversationSummary: (opts.history || [])
            .map((m) => `${m.role}: ${m.content}`)
            .join("\n"),
          selectedCity: ctx.selectedCity,
          istanbulSide: ctx.istanbul_side || ctx.istanbulSide,
          travelDate: ctx.travelDate,
          source: "widget",
          sourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
        }),
      });
      const leadData = await leadRes.json().catch(() => ({}));
      if (!leadRes.ok || !leadData.leadId) {
        console.error("[CB-DEMO] lead persist failed", leadData);
        return { ok: false, error: leadData.error || "LEAD_FAILED" };
      }

      const quoteRes = await fetch(`/api/public/agency/${SLUG}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: leadData.leadId,
          patientName: ctx.patientName,
          patientEmail: ctx.patientEmail,
          patientCountry: ctx.patientCountry,
          treatmentCategory: ctx.lastTreatmentCategory || matchedCategory || "other",
          treatmentName: ctx.lastTreatmentCategory || matchedCategory || "",
          subTreatment: ctx.lastSubTreatment || "",
          selectedClinicIds: clinicIds,
          selectedClinicNames: [],
          consentStatus: "accepted",
        }),
      });
      const quoteData = await quoteRes.json().catch(() => ({}));
      if (!quoteRes.ok || !quoteData.quoteId) {
        console.error("[CB-DEMO] quote persist failed", quoteData);
        // Lead+email may still exist; report partial success for observability
        return { ok: true, leadId: leadData.leadId, error: "QUOTE_DOC_FAILED" };
      }
      return { ok: true, leadId: leadData.leadId, quoteId: quoteData.quoteId };
    } catch (e) {
      console.error("[CB-DEMO] lead/quote persist failed:", e);
      return { ok: false, error: "NETWORK_ERROR" };
    }
  }, [lang, matchedCategory]);

  // Lead Modal
  const [leadModal, setLeadModal] = useState(false);
  const [leadClinic, setLeadClinic] = useState<ClinicData | null>(null);
  const [leadDone, setLeadDone] = useState(false);
  const [leadSending, setLeadSending] = useState(false);

  const chatEnd = useRef<HTMLDivElement>(null);
  const t = (k: string) => TX[lang][k] || k;

  // Ids already reported, so a dropped card is logged once instead of on every render.
  const reportedInvalidClinics = useRef<Set<string>>(new Set());

  const renderableClinicsFor = (msg: { clinics?: unknown }) => {
    const all = normalizeClinicRecommendations(msg.clinics);
    const renderable = all.filter(isRenderableClinic);

    if (renderable.length !== all.length) {
      const dropped = all.filter((rec) => !isRenderableClinic(rec));
      for (const rec of dropped) {
        const key = String(rec?.clinicId ?? rec?.id ?? rec?.clinicName ?? "unknown");
        if (reportedInvalidClinics.current.has(key)) continue;
        reportedInvalidClinics.current.add(key);
        console.warn(
          "[feelinhealthy] skipped malformed clinic recommendation",
          JSON.stringify({
            route: "/demo/feelinhealthy",
            clinicId: rec?.clinicId ?? rec?.id ?? null,
            hasName: Boolean(rec?.clinicName ?? rec?.name),
            received: all.length,
            rendered: renderable.length,
          })
        );
      }
    }

    return renderable;
  };

  const renderMessageContent = (text: string, isUser: boolean) => {
    if (!text) return null;
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    const parts: (string | React.ReactNode)[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }
      const label = match[1];
      const url = match[2];
      parts.push(
        <a
          key={match.index}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: isUser ? "#93C5FD" : C.primary,
            textDecoration: "underline",
            fontWeight: 700,
          }}
        >
          {label}
        </a>
      );
      lastIndex = linkRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts;
  };

  // ── FETCH LIVE DATA ──

  useEffect(() => {
    async function load() {
      try {
        const base = `/api/public/agency/${SLUG}`;
        const fetchOpts = { cache: "no-store" as RequestCache };
        const [agRes, trRes, clRes, prRes, cfRes] = await Promise.all([
          fetch(base, fetchOpts), fetch(`${base}/treatments`, fetchOpts), fetch(`${base}/clinics`, fetchOpts),
          fetch(`${base}/pricing`, fetchOpts), fetch(`${base}/config`, fetchOpts),
        ]);

        if (!agRes.ok) { setDataError(true); setDataLoading(false); return; }

        const agData = await agRes.json();
        const trData = await trRes.json();
        const clData = await clRes.json();
        const prData = await prRes.json();
        const cfData = await cfRes.json();

        setAgency(agData);
        setTreatments(trData.treatments || []);
        setClinics(clData.clinics || []);
        setPricing(prData.pricing || []);
        setMatchingCfg(cfData.matching || null);
        setWidgetCfg(cfData.widget || null);
        setAiCfg(cfData.aiConfig || null);

        if (cfData.aiConfig) {
          console.log("[CB-DEMO] aiConfig loaded", { assistantName: cfData.aiConfig.assistantName, greetingMessageSource: "agency-aiConfig" });
        } else {
          console.log("[CB-DEMO] aiConfig not found, fallback greeting used");
        }

      } catch {
        setDataError(true);
      }
      setDataLoading(false);
    }
    load();
  }, []);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Scroll only within chat container, never page-level
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [aiMsgs, aiTyping]);

  // ── AI MATCHING ──

  const doMatch = useCallback((text: string) => {
    const cat = extractCategory(text);
    const city = extractCity(text);
    let results = clinics.filter((c) => c.showInRecommendations !== false);

    if (cat) {
      results = results.filter((c) => c.treatmentCategories?.includes(cat));
    }
    if (city) {
      results = results.filter((c) => c.location?.city?.toLowerCase().includes(city));
    }
    // Limit by config
    const max = matchingCfg?.maxClinicsToShow ?? 5;
    results = results.slice(0, max);

    setMatchedCategory(cat);
    setMatchedClinics(results);
    return results;
  }, [clinics, matchingCfg]);

  const sendSystemAction = async (payload: any) => {
    if (aiTyping) return;

    const actionId =
      payload?.actionId ||
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    const isClinicCardAction =
      payload?.action === "select_clinic" ||
      payload?.action === "view_clinic_details" ||
      payload?.action === "request_quote";

    if (isClinicCardAction) {
      if (processedClinicActionIdsRef.current.has(actionId)) return;
      if (pendingClinicActionKeys[actionId]) return;
      setPendingClinicActionKeys((p) => ({ ...p, [actionId]: true }));
    }

    setAiTyping(true);

    try {
      const bodyAction = isClinicCardAction
        ? {
            action: payload.action as ClinicCardActionType,
            clinicId: payload.clinicId,
            actionId,
            clinicName: payload.clinicName,
            clinicSlug: payload.clinicSlug,
            profilePath: payload.profilePath,
            locale: payload.locale || lang,
          }
        : { ...payload, actionId: payload.actionId || actionId };

      const res = await fetch(`/api/public/agency/${SLUG}/matching-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: bodyAction,
          history: aiMsgs.slice(-10).map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text })),
          sessionContext: sessionCtxRef.current,
        }),
      });

      if (!res.ok && res.status !== 400) throw new Error(`API error ${res.status}`);
      const data = await res.json();

      // Idempotent noop — do not append duplicate assistant messages.
      if (data.type === "noop") {
        if (data.sessionContext) commitSessionCtx(data.sessionContext);
        if (isClinicCardAction) {
          processedClinicActionIdsRef.current.add(actionId);
        }
        return;
      }

      if (data.openProfileInNewTab && data.profileUrl && typeof window !== "undefined") {
        const ctx = data.sessionContext || sessionCtxRef.current || {};
        const clinicId = String(payload?.clinicId || ctx.lastFocusedClinicId || "").trim();
        saveQuotePrefill(
          buildQuotePrefillFromSession(
            ctx,
            {
              clinicId,
              clinicName: payload?.clinicName || ctx.lastFocusedClinicName,
              clinicSlug: payload?.clinicSlug,
            },
            lang
          )
        );
        const url = appendAgentPrefillQuery(data.profileUrl);
        window.open(url, "_blank", "noopener,noreferrer");
      }

      // view_clinic_details may intentionally omit chat reply.
      if (data.reply || data.type === "email_request" || data.type === "clinic_selected") {
        const replyMsg: any = {
          role: "ai",
          text: data.reply || "",
          type: data.type || "text",
          clinics: data.clinics || undefined,
          showClinicCards: data.showClinicCards,
          privacyNoticeUrl: data.privacyNoticeUrl,
          privacyNoticeLabel: data.privacyNoticeLabel,
          consentStructured: data.consentStructured,
          additionalEligibleClinicCount: data.additionalEligibleClinicCount,
          conversionData: data.conversionData,
        };
        if (replyMsg.text || replyMsg.type === "email_request") {
          setAiMsgs((p) => [...p, replyMsg]);
        }
      }

      if (data.sessionContext) commitSessionCtx(data.sessionContext);

      if (isClinicCardAction) {
        processedClinicActionIdsRef.current.add(actionId);
      }

      // Client-side persist only for non-FH legacy paths. FeelinHealthy request_quote
      // is persisted server-side in matching-chat before success copy.
      if (data.shouldCreateNewLead && !isClinicCardAction) {
        const nextCtx = data.sessionContext || sessionCtxRef.current;
        const hist = aiMsgs.slice(-10).map((m) => ({
          role: m.role === "ai" ? "assistant" : "user",
          content: m.text,
        }));
        void persistQuoteRequestLead({
          ctx: nextCtx,
          clinicIds: nextCtx.selectedClinicIds || [],
          history: hist,
        });
      }
    } catch (err) {
      console.error("[CB-DEMO] ERROR:", err);
      setAiMsgs((p) => [...p, {
        role: "ai",
        text: lang === "tr" ? "Şu an teknik bir sorun yaşıyoruz. Lütfen tekrar deneyin." : "We're experiencing a technical issue. Please try again."
      }]);
    } finally {
      if (isClinicCardAction) {
        setPendingClinicActionKeys((p) => {
          const next = { ...p };
          delete next[actionId];
          return next;
        });
      }
      setAiTyping(false);
    }
  };

  const sendCitySelectionAction = async (city: string, optionId: string) => {
    if (aiTyping) return;
    setAiTyping(true);

    const userDisplay =
      city === "undecided"
        ? (lang === "tr" ? "Henüz karar vermedim" : "I’m not sure yet")
        : (lang === "tr"
          ? `${city === "istanbul" ? "İstanbul" : city === "izmir" ? "İzmir" : city.charAt(0).toUpperCase() + city.slice(1)} tercih ediyorum`
          : `I prefer ${city.charAt(0).toUpperCase() + city.slice(1)}`);

    setAiMsgs((p) => [
      ...p.map((m) =>
        m.type === "city_selection"
          ? { ...m, type: "city_selection_resolved", selectedCityOptionId: optionId }
          : m
      ),
      { role: "user", text: userDisplay },
    ]);

    try {
      const res = await fetch(`/api/public/agency/${SLUG}/matching-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: { type: "select_treatment_city", city, value: city, optionId, locale: lang },
          history: aiMsgs.slice(-10).map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text })),
          sessionContext: sessionCtxRef.current,
        }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();

      const replyMsg: any = {
        role: "ai",
        text: data.reply || "Yanıt alınamadı.",
        type: data.type || "text",
        sideClarificationCard: data.sideClarificationCard,
        citySelectionCard: data.citySelectionCard,
        clinics: data.clinics || undefined,
        showClinicCards: data.showClinicCards,
        privacyNoticeUrl: data.privacyNoticeUrl,
        privacyNoticeLabel: data.privacyNoticeLabel,
        consentStructured: data.consentStructured,
        additionalEligibleClinicCount: data.additionalEligibleClinicCount,
        conversionData: data.conversionData,
      };
      setAiMsgs((p) => [...p, replyMsg]);
      if (data.sessionContext) commitSessionCtx(data.sessionContext);
    } catch (err) {
      console.error("[CB-DEMO] ERROR:", err);
      setAiMsgs((p) => [...p, {
        role: "ai",
        text: lang === "tr" ? "Şu an teknik bir sorun yaşıyoruz. Lütfen tekrar deneyin." : "We're experiencing a technical issue. Please try again."
      }]);
    } finally {
      setAiTyping(false);
    }
  };

  const sendSideSelectionAction = async (side: string, optionId: string, actionType?: "confirm" | "reject") => {
    if (aiTyping) return;
    setAiTyping(true);

    let userDisplay = "";
    if (side === "european") userDisplay = lang === "tr" ? "İstanbul Avrupa Yakası" : "Istanbul European Side";
    else if (side === "anatolian") userDisplay = lang === "tr" ? "İstanbul Anadolu Yakası" : "Istanbul Anatolian Side";
    else if (side === "unsure") userDisplay = lang === "tr" ? "Emin Değilim, Bana Yardımcı Olun" : "Not Sure, Help Me Choose";
    else if (actionType === "confirm") userDisplay = lang === "tr" ? "Evet, bu bölgedeki seçenekleri görmek istiyorum" : "Yes, show options in this location";
    else userDisplay = lang === "tr" ? "Farklı şehir seçeneklerini değerlendirmek istiyorum" : "I want to explore other cities";

    setAiMsgs((p) => [
      ...p.map((m) => (m.type === "side_clarification" || m.type === "side_clarification_single" || m.type === "branch_side_confirm")
        ? { ...m, type: "side_clarification_resolved", selectedSideOptionId: optionId }
        : m),
      { role: "user", text: userDisplay }
    ]);

    try {
      const actionPayload = actionType
        ? { type: "branch_side_confirm", side, action: actionType, optionId, locale: lang }
        : { type: "side_selection", side, optionId, locale: lang };

      const res = await fetch(`/api/public/agency/${SLUG}/matching-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: actionPayload,
          history: aiMsgs.slice(-10).map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text })),
          sessionContext: sessionCtxRef.current,
        }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();

      const replyMsg: any = {
        role: "ai",
        text: data.reply || "Yanıt alınamadı.",
        type: data.type || "text",
        sideClarificationCard: data.sideClarificationCard,
        citySelectionCard: data.citySelectionCard,
        clinics: data.clinics || undefined,
        showClinicCards: data.showClinicCards,
        privacyNoticeUrl: data.privacyNoticeUrl,
        privacyNoticeLabel: data.privacyNoticeLabel,
        consentStructured: data.consentStructured,
        additionalEligibleClinicCount: data.additionalEligibleClinicCount,
        conversionData: data.conversionData,
      };
      setAiMsgs((p) => [...p, replyMsg]);
      if (data.sessionContext) commitSessionCtx(data.sessionContext);
    } catch (err) {
      console.error("[CB-DEMO] ERROR:", err);
      setAiMsgs((p) => [...p, {
        role: "ai",
        text: lang === "tr" ? "Şu an teknik bir sorun yaşıyoruz. Lütfen tekrar deneyin." : "We're experiencing a technical issue. Please try again."
      }]);
    } finally {
      setAiTyping(false);
    }
  };

  const sendConsentAction = async (status: "accept" | "decline") => {
    if (aiTyping) return;
    setAiTyping(true);

    // Add user's choice to the chat visually and mark previous consent cards as resolved
    const userChoice = status === "accept" 
      ? (lang === "tr" ? "Kabul Ediyorum" : "I Accept")
      : (lang === "tr" ? "Reddediyorum" : "I Decline");
    setAiMsgs((p) => [
      ...p.map((m) => m.type === "consent_request" ? { ...m, type: "consent_request_resolved" } : m),
      { role: "user", text: userChoice }
    ]);

    try {
      const res = await fetch(`/api/public/agency/${SLUG}/matching-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: { type: "privacy_consent_response", action: status, locale: lang },
          history: aiMsgs.slice(-10).map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text })),
          sessionContext: sessionCtxRef.current,
        }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();

      const replyMsg: any = {
        role: "ai",
        text: data.reply || "Yanıt alınamadı.",
        type: data.type || "text",
        sideClarificationCard: data.sideClarificationCard,
        citySelectionCard: data.citySelectionCard,
        clinics: data.clinics || undefined,
        showClinicCards: data.showClinicCards,
        privacyNoticeUrl: data.privacyNoticeUrl,
        privacyNoticeLabel: data.privacyNoticeLabel,
        consentStructured: data.consentStructured,
        additionalEligibleClinicCount: data.additionalEligibleClinicCount,
        conversionData: data.conversionData,
      };
      setAiMsgs((p) => [...p, replyMsg]);
      if (data.sessionContext) commitSessionCtx(data.sessionContext);
    } catch (err) {
      console.error("[CB-DEMO] ERROR:", err);
      setAiMsgs((p) => [...p, {
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
    setAiMsgs((p) => [...p, { role: "user", text: email }]);

    try {
      const res = await fetch(`/api/public/agency/${SLUG}/matching-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: { type: "patient_email_submission", email, locale: lang },
          history: aiMsgs.slice(-10).map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text })),
          sessionContext: sessionCtxRef.current,
        }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();

      const replyMsg: any = {
        role: "ai",
        text: data.reply || "Yanıt alınamadı.",
        type: data.type || "text",
        sideClarificationCard: data.sideClarificationCard,
        citySelectionCard: data.citySelectionCard,
        clinics: data.clinics || undefined,
        showClinicCards: data.showClinicCards,
        privacyNoticeUrl: data.privacyNoticeUrl,
        privacyNoticeLabel: data.privacyNoticeLabel,
        consentStructured: data.consentStructured,
        additionalEligibleClinicCount: data.additionalEligibleClinicCount,
        conversionData: data.conversionData,
      };
      setAiMsgs((p) => [...p, replyMsg]);
      if (data.sessionContext) commitSessionCtx(data.sessionContext);
    } catch (err) {
      console.error("[CB-DEMO] ERROR:", err);
      setAiMsgs((p) => [...p, {
        role: "ai",
        text: lang === "tr" ? "Şu an teknik bir sorun yaşıyoruz. Lütfen tekrar deneyin." : "We're experiencing a technical issue. Please try again."
      }]);
    } finally {
      setAiTyping(false);
      setEmailInput("");
    }
  };

  const sendAi = async () => {
    if (!aiInput.trim() || aiTyping) return;
    const msg = aiInput;
    setAiInput("");
    setAiMsgs((p) => [...p, { role: "user", text: msg }]);
    setAiTyping(true);

    console.log("[CB-DEMO] ===== NEW REQUEST =====");
    console.log("[CB-DEMO] Version: v3-openai-demo");
    console.log("[CB-DEMO] Message:", msg);

    try {
      const res = await fetch(`/api/public/agency/${SLUG}/matching-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          history: aiMsgs.slice(-10).map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text })),
          sessionContext: sessionCtxRef.current,
        }),
      });

      console.log("[CB-DEMO] Response status:", res.status);

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();

      console.log("[CB-DEMO] Response type:", data.type);
      console.log("[CB-DEMO] Clinics:", data.clinics?.length || 0);

      // Show AI reply text
      const replyMsg: any = {
        role: "ai",
        text: data.reply || "Yanıt alınamadı.",
        type: data.type || "text",
        sideClarificationCard: data.sideClarificationCard,
        citySelectionCard: data.citySelectionCard,
        clinics: data.clinics || undefined,
        showClinicCards: data.showClinicCards,
        privacyNoticeUrl: data.privacyNoticeUrl,
        privacyNoticeLabel: data.privacyNoticeLabel,
        consentStructured: data.consentStructured,
        additionalEligibleClinicCount: data.additionalEligibleClinicCount,
        conversionData: data.conversionData,
      };
      setAiMsgs((p) => [...p, replyMsg]);
      if (data.sessionContext) commitSessionCtx(data.sessionContext);
      if (data.shouldCreateNewLead) {
        const nextCtx = data.sessionContext || sessionCtxRef.current;
        const hist = aiMsgs.slice(-10).map((m) => ({
          role: m.role === "ai" ? "assistant" : "user",
          content: m.text,
        }));
        void persistQuoteRequestLead({ ctx: nextCtx, history: hist });
      }
    } catch (err) {
      console.error("[CB-DEMO] ERROR:", err);
      setAiMsgs((p) => [...p, {
        role: "ai",
        text: lang === "tr"
          ? "Şu an teknik bir sorun yaşıyoruz. Lütfen tekrar deneyin."
          : "We're experiencing a technical issue. Please try again."
      }]);
    } finally {
      setAiTyping(false);
    }
  };

  // ── PRICING HELPERS ──

  const getClinicPrice = (clinicId: string, cat?: string | null) => {
    const items = pricing.filter((p) => p.clinicId === clinicId);
    if (items.length === 0) return null;
    const min = Math.min(...items.map((p) => p.priceMin));
    const max = Math.max(...items.map((p) => p.priceMax));
    const cur = items[0]?.currency || "EUR";
    return { min, max, currency: cur };
  };

  // ── LEAD + QUOTE SUBMIT ──

  const handleLeadSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLeadSending(true);
    const form = new FormData(e.currentTarget);
    const base = `/api/public/agency/${SLUG}`;
    const clinicId = leadClinic?.id;

    try {
      const leadRes = await fetch(`${base}/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: form.get("name"),
          patientEmail: form.get("email"),
          patientPhone: form.get("phone"),
          country: form.get("country"),
          language: lang,
          patientAge: sessionCtx.patientAge,
          patientGender: sessionCtx.patientGender,
          treatmentCategory: matchedCategory || sessionCtx.lastTreatmentCategory || "other",
          clinicIds: clinicId ? [clinicId] : sessionCtx.selectedClinicIds || [],
          conversationId: sessionCtx.sessionId,
          conversationSummary: aiMsgs.map((m) => `${m.role}: ${m.text}`).join("\n"),
          selectedCity: sessionCtx.selectedCity,
          istanbulSide: sessionCtx.istanbul_side || sessionCtx.istanbulSide,
          travelDate: sessionCtx.travelDate,
          consentStatus: "accepted",
          source: "widget",
          sourceUrl: window.location.href,
        }),
      });

      const leadData = await leadRes.json();

      if (leadData.leadId && clinicId) {
        await fetch(`${base}/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId: leadData.leadId,
            patientName: form.get("name"),
            patientEmail: form.get("email"),
            patientCountry: form.get("country"),
            treatmentCategory: matchedCategory || "other",
            treatmentName: matchedCategory ? t(`cat.${matchedCategory}`) : "",
            selectedClinicIds: [clinicId],
            selectedClinicNames: [leadClinic?.clinicName].filter(Boolean),
            consentStatus: "accepted",
          }),
        });
      }

      setLeadDone(true);
    } catch {
      setLeadDone(true); // Still show success in demo — quote persist failure must not block UX
    }
    setLeadSending(false);
  };

  const openLead = (cl: ClinicData | null) => { setLeadClinic(cl); setLeadDone(false); setLeadModal(true); };
  const scrollTo = (id: string) => { document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); setMobileMenu(false); };

  // ── LOADING / ERROR ──

  if (dataLoading) {
    return (
      <div style={{ height: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: "'Inter', sans-serif", background: C.bg }}>
        <Loader2 size={32} color={C.primary} style={{ animation: "spin 1s linear infinite" }} />
        <p style={{ fontSize: 14, color: C.textMuted }}>{t("loading")}</p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (dataError || !agency) {
    return (
      <div style={{ height: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: "'Inter', sans-serif", background: C.bg }}>
        <p style={{ fontSize: 16, color: C.text, fontWeight: 600 }}>{t("error")}</p>
        <p style={{ fontSize: 13, color: C.textMuted }}>Agency: {SLUG}</p>
      </div>
    );
  }

  const welcomeMsg = (lang === "tr" ? aiCfg?.greetingMessageTR : aiCfg?.greetingMessageEN) || widgetCfg?.welcomeMessage || (lang === "tr"
    ? `Merhaba! 👋 Ben ${agency.name} AI asistanınızım. Hangi tedaviyi arıyorsunuz?`
    : `Hello! 👋 I'm your ${agency.name} AI assistant. What treatment are you looking for?`);

  const showPrice = matchingCfg?.showPriceRange ?? true;
  const showProfile = matchingCfg?.showProfileLinks ?? true;

  // Unique categories from live clinics
  const liveCategories = [...new Set(clinics.flatMap((c) => c.treatmentCategories || []))];

  // ── RENDER ──

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
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${agency.branding?.primaryColor || C.primary}, ${agency.branding?.accentColor || C.accent})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Heart size={18} color="#fff" fill="#fff" />
            </div>
            <span style={{ fontSize: 18, fontWeight: 800, color: C.navy, letterSpacing: "-0.03em" }}>{agency.name}</span>
          </div>
          <nav className="dn" style={{ display: "flex", alignItems: "center", gap: 24 }}>
            {["hero", "treatments", "clinics", "steps", "footer"].map((id, i) => (
              <button key={id} className="nl" onClick={() => scrollTo(id)}>
                {t(`nav.${["home", "treatments", "clinics", "how", "contact"][i]}`)}
              </button>
            ))}
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
      <section id="hero" className="sp" style={{ padding: "80px 40px 60px", background: `linear-gradient(180deg, #FFFBF5 0%, ${C.white} 100%)` }}>
        <div className="fu" style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 16px", borderRadius: 20, background: C.primaryBg, border: `1px solid ${C.primaryBorder}`, marginBottom: 24 }}>
            <Sparkles size={14} color={C.primary} /><span style={{ fontSize: 13, fontWeight: 600, color: C.primary }}>{t("hero.badge")}</span>
          </div>
          <h1 style={{ fontSize: "clamp(32px,5vw,52px)", fontWeight: 900, color: C.navy, lineHeight: 1.12, letterSpacing: "-0.03em", marginBottom: 20 }}>
            {t("hero.title")}<br />
            <span style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{t("hero.titleHL")}</span>
          </h1>
          <p style={{ fontSize: "clamp(16px,2vw,18px)", color: C.textSec, lineHeight: 1.6, maxWidth: 620, margin: "0 auto 36px" }}>{t("hero.sub")}</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn" onClick={() => scrollTo("ai-section")} style={{ padding: "14px 32px", borderRadius: 12, background: `linear-gradient(135deg, ${C.primary}, ${C.navy})`, color: "#fff", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><Bot size={18} /> {t("hero.cta")}</button>
            <button className="btn" onClick={() => scrollTo("treatments")} style={{ padding: "14px 28px", borderRadius: 12, background: C.white, color: C.text, fontSize: 15, fontWeight: 600, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>{t("hero.cta2")} <ChevronRight size={16} /></button>
          </div>
        </div>
        <div className="rg2 fu" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, maxWidth: 800, margin: "64px auto 0" }}>
          {[
            { val: `${clinics.length}+`, label: t("stat.clinics"), icon: <Building2 size={20} /> },
            { val: "98%", label: t("stat.satisfaction"), icon: <Star size={20} /> },
            { val: "40+", label: t("stat.countries"), icon: <Globe2 size={20} /> },
            { val: "70%", label: t("stat.savings"), icon: <TrendingUp size={20} /> },
          ].map((s) => (
            <div key={s.label} style={{ textAlign: "center", padding: 16, borderRadius: 14, background: C.white, border: `1px solid ${C.border}` }}>
              <div style={{ color: C.primary, marginBottom: 8, display: "flex", justifyContent: "center" }}>{s.icon}</div>
              <p style={{ fontSize: 28, fontWeight: 900, color: C.navy }}>{s.val}</p>
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
              <Bot size={14} color={C.primary} /><span style={{ fontSize: 13, fontWeight: 600, color: C.primary }}>{widgetCfg?.assistantName || "ClinicBridge AI"}</span>
            </div>
            <h2 style={{ fontSize: "clamp(24px,4vw,36px)", fontWeight: 800, color: C.navy }}>{t("ai.title")}</h2>
            <p style={{ fontSize: 15, color: C.textSec, marginTop: 8 }}>{t("ai.sub")}</p>
          </div>
          <div style={{ background: C.bg, borderRadius: 20, border: `1px solid ${C.border}`, boxShadow: "0 8px 32px rgba(0,0,0,0.05)", overflow: "hidden" }}>
            <div ref={chatContainerRef} style={{ padding: 24, minHeight: 200, maxHeight: 600, overflowY: "auto" }}>
              {aiMsgs.length === 0 && (
                <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg, ${C.primary}, ${C.navy})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Bot size={18} color="#fff" /></div>
                  <div style={{ background: C.white, padding: "12px 16px", borderRadius: "4px 16px 16px 16px", border: `1px solid ${C.border}`, maxWidth: "85%", fontSize: 14, lineHeight: 1.6 }}>{renderMessageContent(welcomeMsg, false)}</div>
                </div>
              )}
              {aiMsgs.map((m, i) => (
                <div key={i} style={{ display: "flex", gap: 12, marginBottom: 16, flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, background: m.role === "user" ? C.navyLight : `linear-gradient(135deg, ${C.primary}, ${C.navy})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {m.role === "user" ? <User size={18} color="#fff" /> : <Bot size={18} color="#fff" />}
                  </div>
                  <div style={{ maxWidth: "85%", display: "flex", flexDirection: "column", gap: 8 }}>
                    {m.type === "consent_request" || m.type === "consent_request_resolved" ? (
                      <div style={{
                        background: C.white,
                        color: C.text,
                        padding: "14px 18px",
                        borderRadius: "4px 16px 16px 16px",
                        border: `1px solid ${C.border}`,
                        fontSize: 14,
                        lineHeight: 1.6,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.03)"
                      }}>
                        <PrivacyConsentCard
                          lang={lang}
                          agencyConfig={agency}
                          structuredConsent={m.consentStructured}
                          privacyNoticeUrl={m.privacyNoticeUrl}
                          privacyNoticeLabel={m.privacyNoticeLabel}
                          isResolved={m.type === "consent_request_resolved"}
                          disabled={aiTyping}
                          onAccept={() => sendConsentAction("accept")}
                          onDecline={() => sendConsentAction("decline")}
                          primaryColor={C.primary}
                          navyColor={C.navy}
                          borderColor={C.border}
                        />
                      </div>
                    ) : m.type === "city_selection" || m.type === "city_selection_resolved" ? (
                      <div style={{
                        background: C.white,
                        color: C.text,
                        padding: "14px 18px",
                        borderRadius: "4px 16px 16px 16px",
                        border: `1px solid ${C.border}`,
                        fontSize: 14,
                        lineHeight: 1.6,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.03)"
                      }}>
                        <CitySelectionCard
                          title={m.citySelectionCard?.title}
                          message={m.text || m.citySelectionCard?.message}
                          options={m.citySelectionCard?.options || []}
                          lang={lang}
                          isResolved={m.type === "city_selection_resolved"}
                          selectedOptionId={m.selectedCityOptionId}
                          disabled={aiTyping}
                          onSelectCity={(city, optionId) => sendCitySelectionAction(city, optionId)}
                          primaryColor={C.primary}
                          navyColor={C.navy}
                          borderColor={C.border}
                        />
                      </div>
                    ) : m.type === "side_clarification" || m.type === "side_clarification_single" || m.type === "side_clarification_resolved" || m.type === "branch_side_confirm" ? (
                      <div style={{
                        background: C.white,
                        color: C.text,
                        padding: "14px 18px",
                        borderRadius: "4px 16px 16px 16px",
                        border: `1px solid ${C.border}`,
                        fontSize: 14,
                        lineHeight: 1.6,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.03)"
                      }}>
                        <IstanbulSideClarificationCard
                          type={m.sideClarificationCard?.type || m.type}
                          title={m.sideClarificationCard?.title}
                          message={m.text || m.sideClarificationCard?.message}
                          options={m.sideClarificationCard?.options || []}
                          lang={lang}
                          isResolved={m.type === "side_clarification_resolved"}
                          selectedOptionId={m.selectedSideOptionId}
                          disabled={aiTyping}
                          onSelectSide={(side, optionId, act) => sendSideSelectionAction(side, optionId, act)}
                          primaryColor={C.primary}
                          navyColor={C.navy}
                          borderColor={C.border}
                        />
                      </div>
                    ) : (
                      <div style={{ background: m.role === "user" ? C.navy : C.white, color: m.role === "user" ? "#fff" : C.text, padding: "12px 16px", borderRadius: m.role === "user" ? "16px 4px 16px 16px" : "4px 16px 16px 16px", border: m.role === "user" ? "none" : `1px solid ${C.border}`, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                        {renderMessageContent(m.text, m.role === "user")}
                      </div>
                    )}
                    {/* Inline clinic cards */}
                    {renderableClinicsFor(m).length > 0 && m.showClinicCards !== false && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {renderableClinicsFor(m).map((rec: any) => (
                          <div key={rec.clinicId ?? rec.id} style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                            {/* Card header */}
                            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div>
                                <p style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{rec.clinicName ?? rec.name}</p>
                                {rec.location ? (
                                  <span style={{ fontSize: 11, color: C.textSec, display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}><MapPin size={10} /> {rec.location}</span>
                                ) : null}
                              </div>
                              {rec.matchScore > 0 && (
                                <div style={{ background: C.primaryBg, border: `1px solid ${C.primaryBorder}`, borderRadius: 8, padding: "3px 8px", textAlign: "center" }}>
                                  <span style={{ fontSize: 14, fontWeight: 800, color: C.primary }}>{rec.matchScore}%</span>
                                  <p style={{ fontSize: 8, color: C.primary, fontWeight: 600 }}>AI {lang === "tr" ? "Eşleşme" : "Match"}</p>
                                </div>
                              )}
                            </div>
                            {/* Prices */}
                            {Array.isArray(rec.matchedPrices) && rec.matchedPrices.length > 0 && (
                              <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}` }}>
                                <p style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", marginBottom: 4, letterSpacing: 0.5 }}>{lang === "tr" ? "Tahmini Fiyatlar" : "Estimated Prices"}</p>
                                {rec.matchedPrices.map((p: any, pi: number) => (
                                  <div key={pi} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0", fontSize: 12 }}>
                                    <span style={{ color: C.text }}>{p.subTreatmentName}</span>
                                    <span style={{ fontWeight: 700, color: C.primary }}>
                                      {p.priceMin === p.priceMax ? `${p.priceMin} ${p.currency}` : `${p.priceMin}–${p.priceMax} ${p.currency}`}
                                      {p.duration && <span style={{ fontWeight: 400, color: C.textMuted, fontSize: 10 }}> · {p.duration}</span>}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {/* Languages + Reason */}
                            {rec.reason && (
                              <div style={{ padding: "6px 14px", borderBottom: `1px solid ${C.border}` }}>
                                <p style={{ fontSize: 11, color: C.textSec, fontStyle: "italic" }}>💡 {rec.reason}</p>
                              </div>
                            )}
                            
                            {/* Doctors Preview */}
                            {(() => {
                              const doctors = getRenderableDoctors(rec);
                              if (doctors.length === 0) return null;

                              const shown = doctors.length;
                              const total = Number(rec.doctorMatch?.relevantDoctorCount) || shown;
                              const remaining = total - shown;

                              return (
                                <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, background: C.bg }}>
                                  <p style={{ fontSize: 11, fontWeight: 700, color: C.navy, marginBottom: 6 }}>
                                    {lang === "tr" ? "İlgili Hekimler" : "Relevant Doctors"}
                                  </p>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    {doctors.map((doc: any, di: number) => (
                                      <div key={doc.id ?? di} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                        {doc.photoUrl ? (
                                          <img src={doc.photoUrl} alt={doc.fullName} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: `1px solid ${C.border}` }} />
                                        ) : (
                                          <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.primaryBg, color: C.primary, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 12, fontWeight: 700 }}>
                                            {doc.fullName.trim().charAt(0)}
                                          </div>
                                        )}
                                        <div>
                                          <p style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{doc.title ? `${doc.title} ` : ""}{doc.fullName}</p>
                                          <p style={{ fontSize: 10, color: C.textSec }}>
                                            {doc.specialty}
                                            {doc.experienceYears ? (lang === "tr" ? ` • ${doc.experienceYears} yıl deneyim` : ` • ${doc.experienceYears} yrs exp`) : ""}
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  {remaining > 0 && (
                                    <p style={{ fontSize: 10, color: C.primary, marginTop: 6, fontWeight: 600, cursor: "pointer" }}>
                                      {lang === "tr" ? `+${remaining} hekim daha...` : `+${remaining} more doctors...`}
                                    </p>
                                  )}
                                </div>
                              );
                            })()}
                            {/* Actions */}
                            <div style={{ padding: "8px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                              {sessionCtx.clinicSelectionMode === "manual" && sessionCtx.clinicSelectionStatus !== "completed" ? (
                                <div style={{ display: "flex", gap: 6 }}>
                                  {sessionCtx.selectedClinicIds?.includes(rec.clinicId || rec.id) ? (
                                    <button onClick={() => sendSystemAction({ type: "clinic_selection_update", action: "deselect", clinicId: rec.clinicId || rec.id, clinicName: rec.clinicName, locale: lang })} style={{ flex: 1, padding: "8px 0", borderRadius: 6, fontSize: 12, fontWeight: 700, background: C.white, color: C.textSec, border: `1px solid ${C.border}`, cursor: "pointer" }}>
                                      {lang === "tr" ? "Seçimi Kaldır" : "Remove Selection"}
                                    </button>
                                  ) : (
                                    <button onClick={() => {
                                      const max = GUEST_CLINIC_LIMIT;
                                      if (sessionCtx.selectedClinicIds && sessionCtx.selectedClinicIds.length >= max) {
                                        setShowMaxClinicsModal(true);
                                      } else {
                                        sendSystemAction({ type: "clinic_selection_update", action: "select", clinicId: rec.clinicId || rec.id, clinicName: rec.clinicName, locale: lang });
                                      }
                                    }} disabled={aiTyping} style={{ flex: 1, padding: "8px 0", borderRadius: 6, fontSize: 12, fontWeight: 700, background: `linear-gradient(135deg, ${C.primary}, ${C.navy})`, color: "#fff", border: "none", cursor: aiTyping ? "not-allowed" : "pointer", opacity: aiTyping ? 0.6 : 1 }}>
                                      {lang === "tr" ? "Seç" : "Select"}
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <button
                                  disabled={aiTyping}
                                  onClick={() => {
                                    const clinicId = String(rec.clinicId || rec.id || "").trim();
                                    if (!clinicId) {
                                      console.error("[CB-DEMO] select_clinic missing clinicId", rec);
                                      return;
                                    }
                                    sendSystemAction({
                                      action: "select_clinic",
                                      clinicId,
                                      clinicName: rec.clinicName || rec.name,
                                      clinicSlug: rec.clinicSlug || rec.slug,
                                      locale: lang,
                                    });
                                  }}
                                  style={{ width: "100%", padding: "8px 0", borderRadius: 6, fontSize: 12, fontWeight: 700, background: `linear-gradient(135deg, ${C.primary}, ${C.navy})`, color: "#fff", border: "none", cursor: aiTyping ? "not-allowed" : "pointer", opacity: aiTyping ? 0.6 : 1 }}
                                >
                                  {lang === "tr" ? "Bu Klinikle Devam Et" : "Proceed with this Clinic"}
                                </button>
                              )}
                              <div style={{ display: "flex", gap: 6 }}>
                                <button
                                  disabled={aiTyping}
                                  onClick={() => {
                                    const clinicId = String(rec.clinicId || rec.id || "").trim();
                                    if (!clinicId) return;
                                    sendSystemAction({
                                      action: "view_clinic_details",
                                      clinicId,
                                      clinicName: rec.clinicName || rec.name,
                                      clinicSlug: rec.clinicSlug || rec.slug,
                                      profilePath: rec.profilePath,
                                      locale: lang,
                                    });
                                  }}
                                  style={{ flex: 1, padding: "6px 0", borderRadius: 6, fontSize: 11, fontWeight: 700, textAlign: "center", background: C.primaryBg, color: C.primary, border: `1px solid ${C.primaryBorder}`, cursor: aiTyping ? "not-allowed" : "pointer", opacity: aiTyping ? 0.6 : 1 }}
                                >
                                  {lang === "tr" ? "Daha Fazla Bilgi" : "More Info"}
                                </button>
                                <button
                                  disabled={aiTyping}
                                  onClick={() => {
                                    const clinicId = String(rec.clinicId || rec.id || "").trim();
                                    if (!clinicId) return;
                                    sendSystemAction({
                                      action: "request_quote",
                                      clinicId,
                                      clinicName: rec.clinicName || rec.name,
                                      clinicSlug: rec.clinicSlug || rec.slug,
                                      locale: lang,
                                    });
                                  }}
                                  style={{ flex: 1, padding: "6px 0", borderRadius: 6, fontSize: 11, fontWeight: 700, background: C.white, color: C.navy, border: `1px solid ${C.border}`, cursor: aiTyping ? "not-allowed" : "pointer", opacity: aiTyping ? 0.6 : 1 }}
                                >
                                  {lang === "tr" ? "Teklif İste" : "Request Quote"}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                        {(m.type === "clinic_recommendations" || m.type === "clinic_answer") && (
                          <p style={{ fontSize: 10, color: C.textMuted, textAlign: "center", fontStyle: "italic" }}>
                            {lang === "tr" ? "Fiyatlar tahminidir; kesin fiyat klinik değerlendirmesine göre değişebilir." : "Prices are estimates; final pricing depends on clinical evaluation."}
                          </p>
                        )}

                        {m.type === "clinic_recommendations" && sessionCtx.clinicSelectionStatus !== "completed" && (
                          <div style={{ marginTop: 12, padding: "12px", background: C.primaryBg, borderRadius: 12, border: `1px solid ${C.primaryBorder}` }}>
                            <p style={{ fontSize: 12, color: C.navy, fontWeight: 600, marginBottom: 8, textAlign: "center" }}>
                              {lang === "tr" 
                                ? `Nasıl ilerlemek istersiniz? (En fazla ${GUEST_CLINIC_LIMIT} klinik seçebilirsiniz)` 
                                : `How would you like to proceed? (Max ${GUEST_CLINIC_LIMIT} clinics allowed)`}
                            </p>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              <button onClick={() => sendSystemAction({ type: "clinic_selection_mode", mode: "automatic" })} style={{ width: "100%", padding: "10px", borderRadius: 8, fontSize: 13, fontWeight: 700, background: sessionCtx.clinicSelectionMode === "automatic" ? `linear-gradient(135deg, ${C.primary}, ${C.navy})` : C.white, color: sessionCtx.clinicSelectionMode === "automatic" ? "#fff" : C.primary, border: `1px solid ${sessionCtx.clinicSelectionMode === "automatic" ? "transparent" : C.primary}`, cursor: "pointer" }}>
                                {lang === "tr" ? "Tüm uygun kliniklerden teklif al" : "Get offers from all suitable clinics"}
                              </button>
                              <button onClick={() => sendSystemAction({ type: "clinic_selection_mode", mode: "manual" })} style={{ width: "100%", padding: "10px", borderRadius: 8, fontSize: 13, fontWeight: 700, background: sessionCtx.clinicSelectionMode === "manual" ? `linear-gradient(135deg, ${C.primary}, ${C.navy})` : C.white, color: sessionCtx.clinicSelectionMode === "manual" ? "#fff" : C.primary, border: `1px solid ${sessionCtx.clinicSelectionMode === "manual" ? "transparent" : C.primary}`, cursor: "pointer" }}>
                                {lang === "tr" ? "Klinikleri tek tek seç" : "Select clinics individually"}
                              </button>
                            </div>
                            
                            {sessionCtx.clinicSelectionMode === "manual" && (
                              <div style={{ marginTop: 12, textAlign: "center" }}>
                                <p style={{ fontSize: 13, color: C.text, fontWeight: 600, marginBottom: 8 }}>
                                  {lang === "tr" ? "Seçilen Klinikler: " : "Selected Clinics: "}
                                  <span style={{ color: C.primary }}>{sessionCtx.selectedClinicIds?.length || 0} / {GUEST_CLINIC_LIMIT}</span>
                                </p>
                                {sessionCtx.selectedClinicIds && sessionCtx.selectedClinicIds.length > 0 && (
                                  <button onClick={() => sendSystemAction({ type: "clinic_selection_complete" })} style={{ width: "100%", padding: "10px", borderRadius: 8, fontSize: 13, fontWeight: 700, background: `linear-gradient(135deg, ${C.primary}, ${C.navy})`, color: "#fff", border: "none", cursor: "pointer" }}>
                                    {lang === "tr" ? "Seçimi Tamamla ve Devam Et" : "Complete Selection and Continue"}
                                  </button>
                                )}
                              </div>
                            )}

                            {sessionCtx.clinicSelectionMode === "automatic" && (
                              <div style={{ marginTop: 12, textAlign: "center" }}>
                                <button onClick={() => sendSystemAction({ type: "clinic_selection_complete" })} style={{ width: "100%", padding: "10px", borderRadius: 8, fontSize: 13, fontWeight: 700, background: `linear-gradient(135deg, ${C.primary}, ${C.navy})`, color: "#fff", border: "none", cursor: "pointer" }}>
                                  {lang === "tr" ? "Seçimi Onayla ve Devam Et" : "Confirm Selection and Continue"}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        {/* Guest Conversion / Additional Clinics Banner */}
                        {((m.additionalEligibleClinicCount && m.additionalEligibleClinicCount > 0) || (m.conversionData?.additionalCount > 0)) && (
                          <div style={{ marginTop: 12, padding: "14px 16px", background: "linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)", borderRadius: 12, border: "1px solid #86EFAC", display: "flex", flexDirection: "column", gap: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <Sparkles size={16} color="#16A34A" />
                              <span style={{ fontSize: 13, fontWeight: 700, color: "#166534" }}>
                                {m.conversionData?.conversionMessage || (lang === "tr"
                                  ? `Tercihlerinize uygun ${m.additionalEligibleClinicCount || 1} sağlık kuruluşu daha bulunuyor.`
                                  : `There are ${m.additionalEligibleClinicCount || 1} more healthcare providers matching your preferences.`)}
                              </span>
                            </div>
                            <a
                              href={m.conversionData?.registrationUrl || "https://www.feelinhealthy.com/register"}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 6,
                                padding: "8px 16px",
                                borderRadius: 8,
                                background: "#16A34A",
                                color: "#fff",
                                fontSize: 12,
                                fontWeight: 700,
                                textDecoration: "none",
                                alignSelf: "flex-start",
                                marginTop: 2
                              }}
                            >
                              {m.conversionData?.ctaText || (lang === "tr" ? "Daha Fazla Teklif Al" : "Get More Quotes")} <ChevronRight size={14} />
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Email Request UI */}
                    {m.type === "email_request" && (
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
                          <button onClick={() => sendEmailAction(emailInput)} disabled={aiTyping || !emailInput.trim()} style={{ padding: "0 16px", borderRadius: 8, fontSize: 13, fontWeight: 700, background: `linear-gradient(135deg, ${C.primary}, ${C.navy})`, color: "#fff", border: "none", cursor: "pointer", opacity: aiTyping || !emailInput.trim() ? 0.6 : 1 }}>
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
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg, ${C.primary}, ${C.navy})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Bot size={18} color="#fff" /></div>
                  <div style={{ background: C.white, padding: "12px 16px", borderRadius: "4px 16px 16px 16px", border: `1px solid ${C.border}`, fontSize: 13, color: C.primary, display: "flex", alignItems: "center", gap: 8, animation: "pulse 1.5s infinite" }}>
                    <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> {t("ai.typing")}
                  </div>
                </div>
              )}
              {/* scroll handled by chatContainerRef */}
            </div>
            <div style={{ padding: "16px 24px", borderTop: `1px solid ${C.border}`, background: C.white }}>
              <div style={{ display: "flex", gap: 10 }}>
                <textarea value={aiInput} onChange={(e) => setAiInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAi(); } }} placeholder={t("ai.placeholder")} rows={2}
                  style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: `1px solid ${C.border}`, fontSize: 14, resize: "none", outline: "none", fontFamily: "inherit", color: C.text, background: C.bg, lineHeight: 1.5 }} />
                <button className="btn" onClick={sendAi} disabled={aiTyping} style={{ padding: "0 24px", borderRadius: 12, background: `linear-gradient(135deg, ${C.primary}, ${C.navy})`, color: "#fff", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8, opacity: aiTyping ? 0.6 : 1, alignSelf: "flex-end", height: 48 }}>
                  <Send size={16} />{" "}
                  {sessionCtx.leadStage && sessionCtx.leadStage !== "discovery"
                    ? (lang === "tr" ? "Gönder" : "Send")
                    : t("ai.send")}
                </button>
              </div>
              <p style={{ fontSize: 11, color: C.textMuted, marginTop: 8, textAlign: "center" }}><Sparkles size={10} style={{ display: "inline", verticalAlign: "middle" }} /> {t("ai.powered")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* AI Results section removed — clinic cards now render inline in chat */}

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
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 10 }}>{t(`steps.${s}.t`)}</h3>
                  <p style={{ fontSize: 14, color: C.textSec, lineHeight: 1.6 }}>{t(`steps.${s}.d`)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* TREATMENTS — LIVE */}
      <section id="treatments" className="sp" style={{ padding: "80px 40px", background: C.bg }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <h2 style={{ fontSize: "clamp(24px,4vw,36px)", fontWeight: 800, color: C.navy }}>{t("treat.title")}</h2>
            <p style={{ fontSize: 16, color: C.textSec, marginTop: 8 }}>{t("treat.sub")}</p>
          </div>
          {treatments.length > 0 ? (
            <div className="rg2" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
              {treatments.map((tr) => {
                const Icon = CATEGORY_ICONS[tr.category] || Stethoscope;
                const color = CATEGORY_COLORS[tr.category] || C.primary;
                return (
                  <div key={tr.id} className="ch" style={{ padding: 24, borderRadius: 16, background: C.white, border: `1px solid ${C.border}`, cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 52, height: 52, borderRadius: 14, background: `${color}14`, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={24} color={color} /></div>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>{tr.name}</h4>
                        {tr.avgPriceMin && tr.avgPriceMax && (
                          <p style={{ fontSize: 12, color: C.primary, marginTop: 2, fontWeight: 600 }}>€{tr.avgPriceMin.toLocaleString()} – €{tr.avgPriceMax.toLocaleString()}</p>
                        )}
                      </div>
                      <ChevronRight size={18} color={C.textMuted} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rg2" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
              {liveCategories.map((cat) => {
                const Icon = CATEGORY_ICONS[cat] || Stethoscope;
                const color = CATEGORY_COLORS[cat] || C.primary;
                return (
                  <div key={cat} className="ch" style={{ padding: 24, borderRadius: 16, background: C.white, border: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 52, height: 52, borderRadius: 14, background: `${color}14`, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={24} color={color} /></div>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>{t(`cat.${cat}`)}</h4>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* CLINICS — LIVE */}
      <section id="clinics" className="sp" style={{ padding: "80px 40px", background: C.white }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <h2 style={{ fontSize: "clamp(24px,4vw,36px)", fontWeight: 800, color: C.navy }}>{t("clinics.title")}</h2>
            <p style={{ fontSize: 16, color: C.textSec, marginTop: 8 }}>{t("clinics.sub")}</p>
          </div>
          <div className="rg" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {clinics.map((cl) => {
              const price = getClinicPrice(cl.id);
              const catColor = CATEGORY_COLORS[cl.treatmentCategories?.[0] || "other"] || C.primary;
              return (
                <div key={cl.id} className="ch" style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                  <div style={{ height: 64, background: `linear-gradient(135deg, ${catColor}, ${catColor}cc)`, display: "flex", alignItems: "flex-end", padding: "0 16px 10px" }}>
                    {cl.treatmentCategories?.[0] && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.85)", background: "rgba(0,0,0,.2)", padding: "3px 8px", borderRadius: 6 }}>{t(`cat.${cl.treatmentCategories[0]}`)}</span>
                    )}
                  </div>
                  <div style={{ padding: "14px 20px" }}>
                    <h4 style={{ fontSize: 15, fontWeight: 700, color: C.navy, marginBottom: 6 }}>{cl.clinicName}</h4>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <MapPin size={13} color={C.primary} /><span style={{ fontSize: 12.5, color: C.textSec }}>{cl.location?.city}, {cl.location?.country}</span>
                      {cl.rating && <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 700, color: "#f59e0b", display: "flex", alignItems: "center", gap: 3 }}><Star size={12} fill="#f59e0b" color="#f59e0b" /> {cl.rating}</span>}
                    </div>
                    {cl.subTreatments && cl.subTreatments.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                        {cl.subTreatments.slice(0, 3).map((s, i) => (
                          <span key={i} style={{ fontSize: 10.5, padding: "2px 7px", borderRadius: 5, background: C.primaryBg, color: C.primary, fontWeight: 600 }}>{s}</span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      {showPrice && price ? (
                        <span style={{ fontSize: 14, fontWeight: 700, color: C.primary }}>€{price.min.toLocaleString()} – €{price.max.toLocaleString()}</span>
                      ) : (
                        <span style={{ fontSize: 12, color: C.textMuted }}>{showPrice ? t("rec.noPrice") : ""}</span>
                      )}
                      <div style={{ display: "flex", gap: 6 }}>
                        <Globe2 size={14} color={C.primary} />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn" onClick={() => openLead(cl)} style={{ flex: 1, padding: "9px 0", borderRadius: 8, background: C.primary, color: "#fff", fontSize: 12.5, fontWeight: 700 }}>{t("rec.quote")}</button>
                      {showProfile && cl.profileUrl && (
                        <a href={cl.profileUrl} target="_blank" rel="noopener noreferrer" className="btn" style={{ padding: "9px 12px", borderRadius: 8, background: C.bg, color: C.textSec, fontSize: 12, fontWeight: 600, border: `1px solid ${C.border}`, textDecoration: "none", display: "flex", alignItems: "center", gap: 3 }}>
                          <ExternalLink size={12} /> {t("rec.profile")}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* MAX CLINICS MODAL */}
      {showMaxClinicsModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 99999, padding: 20 }}>
          <div style={{ background: "#fff", padding: "24px", borderRadius: 16, maxWidth: 400, width: "100%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)" }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: C.navy, marginBottom: 12, textAlign: "center" }}>
              {lang === "tr" ? "Limitine Ulaştınız" : "Limit Reached"}
            </h3>
            <p style={{ fontSize: 14, color: C.textSec, lineHeight: 1.5, textAlign: "center", marginBottom: 24 }}>
              {lang === "tr" 
                ? `Standart talep akışında aynı anda en fazla ${GUEST_CLINIC_LIMIT} klinik seçebilirsiniz. Daha fazla klinik seçeneğinin değerlendirilmesini isterseniz agency kayıt sayfası üzerinden genişletilmiş talep oluşturabilirsiniz.` 
                : `You can select up to ${GUEST_CLINIC_LIMIT} clinics in the standard request flow. To be considered by more clinics, you can create an extended request through the agency registration page.`}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button 
                onClick={async () => {
                  setRequestMoreLoading(true);
                  try {
                    if (sessionCtx.clinicSelectionStatus !== "completed") {
                      await sendSystemAction({ type: "clinic_selection_complete" });
                    }
                    const leadId = sessionCtx.leadId || sessionCtx.leadReference;
                    if (!leadId) throw new Error("Lead not created yet");

                    const res = await fetch("/api/public/extended-request/generate", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        agencyId: agency?.id,
                        leadId: leadId,
                        conversationId: sessionCtx.conversationId,
                        locale: lang
                      })
                    });
                    if (!res.ok) throw new Error("Failed to generate extended request");
                    const data = await res.json();
                    
                    setShowMaxClinicsModal(false);
                    window.open(`/public/extended-request?token=${data.token}`, "_blank");

                  } catch (err) {
                    console.error("Error generating extended request", err);
                    alert(lang === "tr" ? "Şu an işleminizi gerçekleştiremiyoruz. Lütfen mevcut kliniklerinizle devam edin." : "We cannot process your request right now. Please continue with your current clinics.");
                  } finally {
                    setRequestMoreLoading(false);
                  }
                }}
                disabled={requestMoreLoading}
                style={{ width: "100%", padding: "12px", borderRadius: 8, fontSize: 14, fontWeight: 700, background: `linear-gradient(135deg, ${C.primary}, ${C.navy})`, color: "#fff", border: "none", cursor: requestMoreLoading ? "not-allowed" : "pointer", opacity: requestMoreLoading ? 0.7 : 1 }}
              >
                {requestMoreLoading ? (lang === "tr" ? "Yükleniyor..." : "Loading...") : (lang === "tr" ? "Daha Fazla Klinik Seçeneği İste" : "Request More Clinic Options")}
              </button>
              <button 
                onClick={() => setShowMaxClinicsModal(false)}
                disabled={requestMoreLoading}
                style={{ width: "100%", padding: "12px", borderRadius: 8, fontSize: 14, fontWeight: 700, background: C.white, color: C.textSec, border: `1px solid ${C.border}`, cursor: requestMoreLoading ? "not-allowed" : "pointer" }}
              >
                {lang === "tr" ? "Mevcut 3 Klinikle Devam Et" : "Continue with the Current 3 Clinics"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer id="footer" style={{ background: C.navy, color: "rgba(255,255,255,.7)", padding: "60px 40px 30px" }}>
        <div className="sp" style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div className="rg" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 40, marginBottom: 40 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, display: "flex", alignItems: "center", justifyContent: "center" }}><Heart size={16} color="#fff" fill="#fff" /></div>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{agency.name}</span>
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
              <h4 style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 16 }}>{t("nav.contact")}</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
                {agency.contactEmail && <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Mail size={14} color={C.primaryLight} /> {agency.contactEmail}</div>}
              </div>
            </div>
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,.1)", paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <p style={{ fontSize: 12 }}>© 2026 {agency.name}. {t("footer.rights")}</p>
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
                  {leadClinic && <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, background: C.primaryBg }}><Building2 size={14} color={C.primary} /><span style={{ fontSize: 13, fontWeight: 600, color: C.primary }}>{leadClinic.clinicName}</span></div>}
                </div>
                <form onSubmit={handleLeadSubmit} style={{ padding: "24px 28px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {["name", "email", "phone", "country"].map((k) => (
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
