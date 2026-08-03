/**
 * FeelinHealthy Curated Matching, Rules, and Intake Configuration
 * 
 * Rules:
 * 1. Guest users get max 2 curated clinics.
 * 2. Curated lists per branch & location (Section 6 matrix).
 * 3. Never ask for budget anywhere.
 * 4. Deterministic 3-group intake progression (Group 1 -> Group 2 -> Group 3).
 * 5. Istanbul side clarification before clinic matching:
 *    - Istanbul has European and Anatolian sides.
 *    - If user only mentions "İstanbul" or says "fark etmez" / "emin değilim", clarify or guide.
 *    - Branch-specific side availability:
 *      * Dental: Both European & Anatolian
 *      * IVF, Cardiology, Check-up: Anatolian Side only
 *      * Eye Treatments: European Side only
 *    - Structured state: istanbul_side saved as "european" | "anatolian".
 *    - Clinic cards display exact side ("İstanbul, Avrupa Yakası" / "İstanbul, Anadolu Yakası").
 */

export interface CuratedClinicTarget {
  name: string;
  slugOrId: string;
  aliasPatterns?: string[];
  district?: string;
  address?: string;
}

export interface CuratedLocationRule {
  city: "istanbul" | "izmir" | "antalya" | "ankara" | "kocaeli" | string;
  side?: "anatolian" | "european" | "any";
  displayNameTr: string;
  displayNameEn: string;
  curatedClinics: CuratedClinicTarget[];
}

export interface CuratedBranchRule {
  branchKey: "dental" | "ivf" | "cardiology" | "check_up" | "eye_treatments" | string;
  categoryNameTr: string;
  categoryNameEn: string;
  locations: CuratedLocationRule[];
}

export const FEELINHEALTHY_CURATED_RULES: CuratedBranchRule[] = [
  {
    branchKey: "dental",
    categoryNameTr: "Diş Tedavisi",
    categoryNameEn: "Dental Treatment",
    locations: [
      {
        city: "istanbul",
        side: "anatolian",
        displayNameTr: "İstanbul Anadolu Yakası",
        displayNameEn: "Istanbul Anatolian Side",
        curatedClinics: [
          {
            name: "İstanbul Diş Akademisi",
            slugOrId: "istanbul-dis-akademisi",
            aliasPatterns: ["istanbul diş akademisi", "istanbul dis akademisi", "istanbul dental academy", "dis akademisi", "diş akademisi"],
            district: "Kadıköy / Ataşehir",
          },
          {
            name: "Hospitadent Çamlıca",
            slugOrId: "hospitadent-camlica",
            aliasPatterns: ["hospitadent çamlıca", "hospitadent camlica", "çamlıca hospitadent", "camlica hospitadent"],
            district: "Çamlıca, Üsküdar",
          },
        ],
      },
      {
        city: "istanbul",
        side: "european",
        displayNameTr: "İstanbul Avrupa Yakası",
        displayNameEn: "Istanbul European Side",
        curatedClinics: [
          {
            name: "Hospitadent Mecidiyeköy",
            slugOrId: "hospitadent-mecidiyekoy",
            aliasPatterns: ["hospitadent mecidiyeköy", "hospitadent mecidiyekoy", "mecidiyeköy hospitadent", "mecidiyekoy hospitadent"],
            district: "Mecidiyeköy, Şişli",
          },
          {
            name: "BHT Clinic İstanbul TEMA Hospital",
            slugOrId: "bht-clinic-istanbul-tema",
            aliasPatterns: ["bht clinic", "bht tema", "bht clinic istanbul tema hospital", "bht clinic istanbul tema", "bht"],
            district: "Halkalı / Küçükçekmece",
          },
        ],
      },
      {
        city: "izmir",
        side: "any",
        displayNameTr: "İzmir",
        displayNameEn: "Izmir",
        curatedClinics: [
          {
            name: "Westdent Clinic",
            slugOrId: "westdent-clinic",
            aliasPatterns: ["westdent", "westdent clinic", "westdent izmir"],
            district: "Bayraklı, İzmir",
          },
          {
            name: "Beyaz Işık İzmir Dental Group",
            slugOrId: "beyazisik-izmir-dental-group",
            aliasPatterns: ["beyaz ışık izmir", "beyazisik izmir", "beyaz ışık izmir dental group", "beyazisik-izmir", "beyaz isik izmir"],
            district: "Alsancak, İzmir",
          },
        ],
      },
      {
        city: "antalya",
        side: "any",
        displayNameTr: "Antalya",
        displayNameEn: "Antalya",
        curatedClinics: [
          {
            name: "Hospitadent Antalya",
            slugOrId: "hospitadent-antalya",
            aliasPatterns: ["hospitadent antalya", "antalya hospitadent"],
            district: "Muratpaşa, Antalya",
          },
          {
            name: "Memorial Antalya",
            slugOrId: "memorial-hospital",
            aliasPatterns: ["memorial antalya", "memorial hospital antalya", "memorial"],
            district: "Kepez, Antalya",
          },
        ],
      },
      {
        city: "ankara",
        side: "any",
        displayNameTr: "Ankara",
        displayNameEn: "Ankara",
        curatedClinics: [
          {
            name: "Hospitadent Ankara",
            slugOrId: "hospitadent-ankara",
            aliasPatterns: ["hospitadent ankara", "ankara hospitadent", "hospitadent"],
            district: "Çankaya, Ankara",
          },
          {
            name: "Lokman Hekim Ankara",
            slugOrId: "lokman-hekim-university-ankara-hospital",
            aliasPatterns: ["lokman hekim ankara", "lokman hekim university ankara hospital", "lokman hekim akay", "lokman hekim akay hospital", "lokman hekim üniversite hastanesi ankara", "lokman hekim"],
            district: "Söğütözü, Ankara",
          },
        ],
      },
    ],
  },
  {
    branchKey: "ivf",
    categoryNameTr: "Tüp Bebek (IVF)",
    categoryNameEn: "IVF / Fertility Treatment",
    locations: [
      {
        city: "istanbul",
        side: "anatolian",
        displayNameTr: "İstanbul Anadolu Yakası",
        displayNameEn: "Istanbul Anatolian Side",
        curatedClinics: [
          {
            name: "Lokman Hekim",
            slugOrId: "lokman-hekim-istanbul-hospital",
            aliasPatterns: ["lokman hekim", "lokman hekim istanbul", "lokman hekim istanbul hospital", "lokman hekim kurtköy", "lokman hekim pendik", "lokman hekim sağlık grubu"],
            district: "Kurtköy, Pendik",
          },
          {
            name: "Anadolu Medical Center",
            slugOrId: "anadolu-medical-center",
            aliasPatterns: ["anadolu medical center", "anadolu sağlık merkezi", "anadolu saglik merkezi", "anadolu"],
            district: "Gebze / Anadolu Yakası",
          },
        ],
      },
    ],
  },
  {
    branchKey: "cardiology",
    categoryNameTr: "Kardiyoloji",
    categoryNameEn: "Cardiology",
    locations: [
      {
        city: "istanbul",
        side: "anatolian",
        displayNameTr: "İstanbul Anadolu Yakası",
        displayNameEn: "Istanbul Anatolian Side",
        curatedClinics: [
          {
            name: "Lokman Hekim",
            slugOrId: "lokman-hekim-istanbul-hospital",
            aliasPatterns: ["lokman hekim", "lokman hekim istanbul", "lokman hekim istanbul hospital", "lokman hekim kurtköy", "lokman hekim pendik", "lokman hekim sağlık grubu"],
            district: "Kurtköy, Pendik",
          },
          {
            name: "Anadolu Medical Center",
            slugOrId: "anadolu-medical-center",
            aliasPatterns: ["anadolu medical center", "anadolu sağlık merkezi", "anadolu saglik merkezi", "anadolu"],
            district: "Gebze / Anadolu Yakası",
          },
        ],
      },
      {
        city: "kocaeli",
        side: "any",
        displayNameTr: "Kocaeli / Gebze",
        displayNameEn: "Kocaeli / Gebze",
        curatedClinics: [
          {
            name: "Anadolu Medical Center",
            slugOrId: "anadolu-medical-center",
            aliasPatterns: ["anadolu medical center", "anadolu sağlık merkezi", "anadolu saglik merkezi", "anadolu"],
            district: "Gebze, Kocaeli",
          },
        ],
      },
    ],
  },
  {
    branchKey: "check_up",
    categoryNameTr: "Check-Up & Genel Sağlık",
    categoryNameEn: "Check-Up & General Health",
    locations: [
      {
        city: "istanbul",
        side: "anatolian",
        displayNameTr: "İstanbul Anadolu Yakası",
        displayNameEn: "Istanbul Anatolian Side",
        curatedClinics: [
          {
            name: "Lokman Hekim",
            slugOrId: "lokman-hekim-istanbul-hospital",
            aliasPatterns: ["lokman hekim", "lokman hekim istanbul", "lokman hekim istanbul hospital", "lokman hekim kurtköy", "lokman hekim pendik", "lokman hekim sağlık grubu"],
            district: "Kurtköy, Pendik",
          },
          {
            name: "Anadolu Medical Center",
            slugOrId: "anadolu-medical-center",
            aliasPatterns: ["anadolu medical center", "anadolu sağlık merkezi", "anadolu saglik merkezi", "anadolu"],
            district: "Gebze / Anadolu Yakası",
          },
        ],
      },
      {
        city: "kocaeli",
        side: "any",
        displayNameTr: "Kocaeli / Gebze",
        displayNameEn: "Kocaeli / Gebze",
        curatedClinics: [
          {
            name: "Anadolu Medical Center",
            slugOrId: "anadolu-medical-center",
            aliasPatterns: ["anadolu medical center", "anadolu sağlık merkezi", "anadolu saglik merkezi"],
            district: "Gebze, Kocaeli",
          },
        ],
      },
    ],
  },
  {
    branchKey: "hair_transplant",
    categoryNameTr: "Saç Ekimi",
    categoryNameEn: "Hair Transplant",
    locations: [
      {
        city: "istanbul",
        side: "anatolian",
        displayNameTr: "İstanbul Anadolu Yakası",
        displayNameEn: "Istanbul Anatolian Side",
        curatedClinics: [
          {
            name: "Lokman Hekim",
            slugOrId: "lokman-istanbul",
            aliasPatterns: ["lokman hekim", "lokman hekim istanbul"],
            district: "Kurtköy, Pendik",
          },
        ],
      },
      {
        city: "istanbul",
        side: "european",
        displayNameTr: "İstanbul Avrupa Yakası",
        displayNameEn: "Istanbul European Side",
        curatedClinics: [
          {
            name: "BHT Clinic İstanbul TEMA Hospital",
            slugOrId: "bht-tema",
            aliasPatterns: ["bht clinic", "bht tema"],
            district: "Halkalı / Küçükçekmece",
          },
        ],
      },
    ],
  },
  {
    branchKey: "eye_treatments",
    categoryNameTr: "Göz Tedavisi & Lazer",
    categoryNameEn: "Eye Treatment & Laser",
    locations: [
      {
        city: "istanbul",
        side: "european",
        displayNameTr: "İstanbul Avrupa Yakası",
        displayNameEn: "Istanbul European Side",
        curatedClinics: [
          {
            name: "Dünyagöz Ataköy",
            slugOrId: "dunyagoz-atakoy",
            aliasPatterns: ["dunyagoz ataköy", "dünyagöz atakoy", "dunyagoz atakoy", "dünyagöz ataköy", "dunyagoz"],
            district: "Ataköy, Bakırköy",
          },
          {
            name: "BHT Clinic İstanbul TEMA Hospital",
            slugOrId: "bht-clinic-istanbul-tema",
            aliasPatterns: ["bht clinic", "bht tema", "bht clinic istanbul tema hospital", "bht clinic istanbul tema", "bht"],
            district: "Halkalı / Küçükçekmece",
          },
        ],
      },
      {
        city: "antalya",
        side: "any",
        displayNameTr: "Antalya",
        displayNameEn: "Antalya",
        curatedClinics: [
          {
            name: "Dünyagöz Antalya",
            slugOrId: "dunyagoz-antalya",
            aliasPatterns: ["dunyagoz antalya", "dünyagöz antalya"],
            district: "Muratpaşa, Antalya",
          },
        ],
      },
    ],
  },
];

export const FEELINHEALTHY_CONFIG = {
  agencySlug: "feelinhealthy",
  agencyName: "FeelinHealthy",
  maxGuestClinics: 2,
  privacyNoticeUrl: "https://feelinhealthy.com/kvkk",
  privacyNoticeLabelTr: "Aydınlatma metnini",
  privacyNoticeLabelEn: "privacy notice",
  placeholderTr: "İstanbul’da implant tedavisi yaptırmak istiyorum. Avrupa Yakası ve İngilizce destek benim için önemli.",
  placeholderEn: "I want dental implants in Istanbul. European Side and English support are important to me.",
  registrationUrl: "/demo/feelinhealthy/register",
  askBudget: false,
};

// ─── Location & Side Matching Helpers ────────────────────────────────────────

export interface SideDetectionResult {
  city: string | null;
  side: "anatolian" | "european" | "any" | null;
  source: "explicit_text" | "structured_card" | "district_cue" | "airport_cue" | "branch_implicit" | null;
  confidence: "high" | "moderate" | "low";
  cueName?: string;
}

const ANATOLIAN_EXPLICIT_KEYWORDS = [
  "anadolu yakasi", "anadolu yakası", "anadoluyakasi", "anadoluyakası",
  "anatolian side", "anatolianside", "asian side", "asianside",
  "asya yakasi", "asya yakası", "anadolu'da", "anadoluda", "anadolu yakasında", "anadolu yakasinda",
  "anatolian", "asian"
];

const EUROPEAN_EXPLICIT_KEYWORDS = [
  "avrupa yakasi", "avrupa yakası", "avrupayakasi", "avrupayakası",
  "european side", "europeanside",
  "avrupa'da", "avrupada", "avrupa yakasında", "avrupa yakasinda",
  "european"
];

const ANATOLIAN_DISTRICT_KEYWORDS = [
  "kadikoy", "kadıköy", "uskudar", "üsküdar", "camlica", "çamlıca",
  "pendik", "atasehir", "ataşehir", "umraniye", "ümraniye", "maltepe",
  "kartal", "serifali", "şerifali", "sancaktepe", "tuzla", "kurtkoy", "kurtköy",
  "bostanci", "bostancı", "cekmekoy", "çekmeköy", "beykoz"
];

const EUROPEAN_DISTRICT_KEYWORDS = [
  "taksim", "sisli", "şişli", "besiktas", "beşiktaş", "bakirkoy", "bakırköy",
  "mecidiyekoy", "mecidiyeköy", "atakoy", "ataköy", "kucukcekmece", "küçükçekmece",
  "fatih", "bagcilar", "bağcılar", "beylikduzu", "beylikdüzü", "tema", "halkali", "halkalı",
  "etiler", "levent", "nisantasi", "nişantaşı", "bahcelievler", "bahçelievler",
  "gokturk", "göktürk", "cevizlibag", "cevizlibağ", "zeytinburnu", "sariyer", "sarıyer"
];

const ANATOLIAN_AIRPORT_KEYWORDS = [
  "sabiha gokcen", "sabiha gökçen", "sabiha gokcen havalimani", "sabiha gökçen havalimanı",
  "sabiha gokcen airport", "saw airport", "saw havalimani", "saw havalimanı", "saw"
];

const EUROPEAN_AIRPORT_KEYWORDS = [
  "istanbul havalimani", "istanbul havalimanı", "istanbul airport", "ist airport",
  "ist havalimani", "ist havalimanı", "yeni havalimani", "yeni havalimanı", "ist"
];

function normalizeLocString(str: string): string {
  return str
    .replace(/İ/g, "i")
    .replace(/I/g, "i")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/Ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/Ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/Ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/Ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/Ç/g, "c")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function resolveIstanbulSideFromText(rawText?: string | null): SideDetectionResult {
  if (!rawText) {
    return { city: null, side: null, source: null, confidence: "low" };
  }
  const norm = normalizeLocString(rawText);

  let city: string | null = null;
  if (norm.includes("istanbul")) city = "istanbul";
  else if (norm.includes("izmir")) city = "izmir";
  else if (norm.includes("antalya")) city = "antalya";
  else if (norm.includes("ankara")) city = "ankara";
  else if (norm.includes("alanya")) city = "antalya";
  else if (norm.includes("bodrum")) city = "bodrum";
  else if (norm.includes("bursa")) city = "bursa";
  else if (norm.includes("kocaeli") || norm.includes("gebze")) city = "kocaeli";

  // 1. Check Explicit Side Keywords (High Confidence)
  if (EUROPEAN_EXPLICIT_KEYWORDS.some(k => norm.includes(normalizeLocString(k)))) {
    return { city: "istanbul", side: "european", source: "explicit_text", confidence: "high" };
  }
  if (ANATOLIAN_EXPLICIT_KEYWORDS.some(k => norm.includes(normalizeLocString(k)))) {
    return { city: "istanbul", side: "anatolian", source: "explicit_text", confidence: "high" };
  }

  // 2. Check District Keywords (High Confidence)
  for (const dist of EUROPEAN_DISTRICT_KEYWORDS) {
    const distNorm = normalizeLocString(dist);
    const regex = new RegExp(`\\b${distNorm}\\b`, "i");
    if (regex.test(norm) || norm.includes(distNorm)) {
      return { city: "istanbul", side: "european", source: "district_cue", confidence: "high", cueName: dist };
    }
  }
  for (const dist of ANATOLIAN_DISTRICT_KEYWORDS) {
    const distNorm = normalizeLocString(dist);
    const regex = new RegExp(`\\b${distNorm}\\b`, "i");
    if (regex.test(norm) || norm.includes(distNorm)) {
      return { city: "istanbul", side: "anatolian", source: "district_cue", confidence: "high", cueName: dist };
    }
  }

  // 3. Check Airport Keywords (Moderate Confidence - signal for confirmation)
  for (const apt of EUROPEAN_AIRPORT_KEYWORDS) {
    const aptNorm = normalizeLocString(apt);
    const regex = new RegExp(`\\b${aptNorm}\\b`, "i");
    if (regex.test(norm) || (apt.length > 3 && norm.includes(aptNorm))) {
      return { city: "istanbul", side: "european", source: "airport_cue", confidence: "moderate", cueName: "İstanbul Havalimanı (IST)" };
    }
  }
  for (const apt of ANATOLIAN_AIRPORT_KEYWORDS) {
    const aptNorm = normalizeLocString(apt);
    const regex = new RegExp(`\\b${aptNorm}\\b`, "i");
    if (regex.test(norm) || (apt.length > 3 && norm.includes(aptNorm))) {
      return { city: "istanbul", side: "anatolian", source: "airport_cue", confidence: "moderate", cueName: "Sabiha Gökçen Havalimanı (SAW)" };
    }
  }

  return {
    city,
    side: city && city !== "istanbul" ? "any" : null,
    source: null,
    confidence: "low",
  };
}

export function resolveCityAndSide(rawLocation?: string | null): {
  city: string | null;
  side: "anatolian" | "european" | "any" | null;
} {
  const res = resolveIstanbulSideFromText(rawLocation);
  return { city: res.city, side: res.side };
}

// ─── Branch Istanbul Side Availability & Clarification Helper ────────────────

export interface BranchSideAvailability {
  branchKey: string;
  sideAvailability: "both" | "anatolian_only" | "european_only" | "none";
  availableSides: ("anatolian" | "european")[];
  singleSideNameTr?: string;
  singleSideNameEn?: string;
  clarificationMessageTr: string;
  clarificationMessageEn: string;
  confirmActionTr: string;
  confirmActionEn: string;
  rejectActionTr: string;
  rejectActionEn: string;
  hasAnatolian?: boolean;
  hasEuropean?: boolean;
}

export function getBranchIstanbulSideAvailability(rawBranch?: string | null): BranchSideAvailability {
  const branchKey = normalizeTreatmentBranch(rawBranch);

  if (branchKey === "dental") {
    return {
      branchKey,
      sideAvailability: "both",
      availableSides: ["european", "anatolian"],
      clarificationMessageTr: "İstanbul, Avrupa ve Anadolu Yakası olmak üzere iki ana bölgeye ayrılıyor. Konaklama planınıza ve ulaşım tercihinize göre doğru bölgedeki klinikleri önerebilmem için hangi yakayı tercih ettiğinizi netleştirebilir miyiz?",
      clarificationMessageEn: "Istanbul is divided into two main areas: the European Side and the Anatolian Side. To recommend clinics in the most convenient location, could you tell me which side you prefer?",
      confirmActionTr: "Avrupa Yakası",
      confirmActionEn: "European Side",
      rejectActionTr: "Anadolu Yakası",
      rejectActionEn: "Anatolian Side",
      hasAnatolian: true,
      hasEuropean: true,
    };
  }

  if (branchKey === "ivf") {
    return {
      branchKey,
      sideAvailability: "anatolian_only",
      availableSides: ["anatolian"],
      singleSideNameTr: "Anadolu Yakası",
      singleSideNameEn: "Anatolian Side",
      clarificationMessageTr: "Tüp Bebek (IVF) için şu anda öne çıkan partner seçeneklerimiz İstanbul Anadolu Yakası’nda bulunuyor. Anadolu Yakası’ndaki klinikleri değerlendirmek ister misiniz?",
      clarificationMessageEn: "For IVF treatments, our featured partner clinic options are located on Istanbul's Anatolian Side. Would you like to evaluate clinics on the Anatolian Side?",
      confirmActionTr: "Evet, Anadolu Yakası seçeneklerini göster",
      confirmActionEn: "Yes, show Anatolian Side options",
      rejectActionTr: "Hayır, başka şehirleri değerlendirmek istiyorum",
      rejectActionEn: "No, I'd like to explore other cities",
      hasAnatolian: true,
      hasEuropean: false,
    };
  }

  if (branchKey === "cardiology") {
    return {
      branchKey,
      sideAvailability: "anatolian_only",
      availableSides: ["anatolian"],
      singleSideNameTr: "Anadolu Yakası",
      singleSideNameEn: "Anatolian Side",
      clarificationMessageTr: "Kardiyoloji için şu anda öne çıkan partner seçeneklerimiz İstanbul Anadolu Yakası’nda bulunuyor. Anadolu Yakası’ndaki klinikleri değerlendirmek ister misiniz?",
      clarificationMessageEn: "For Cardiology, our featured partner clinic options are located on Istanbul's Anatolian Side. Would you like to evaluate clinics on the Anatolian Side?",
      confirmActionTr: "Evet, Anadolu Yakası seçeneklerini göster",
      confirmActionEn: "Yes, show Anatolian Side options",
      rejectActionTr: "Hayır, başka şehirleri değerlendirmek istiyorum",
      rejectActionEn: "No, I'd like to explore other cities",
      hasAnatolian: true,
      hasEuropean: false,
    };
  }

  if (branchKey === "check_up") {
    return {
      branchKey,
      sideAvailability: "anatolian_only",
      availableSides: ["anatolian"],
      singleSideNameTr: "Anadolu Yakası",
      singleSideNameEn: "Anatolian Side",
      clarificationMessageTr: "Check-up için şu anda öne çıkan partner seçeneklerimiz İstanbul Anadolu Yakası’nda bulunuyor. Anadolu Yakası’ndaki klinikleri değerlendirmek ister misiniz?",
      clarificationMessageEn: "For Check-Up, our featured partner clinic options are located on Istanbul's Anatolian Side. Would you like to evaluate clinics on the Anatolian Side?",
      confirmActionTr: "Evet, Anadolu Yakası seçeneklerini göster",
      confirmActionEn: "Yes, show Anatolian Side options",
      rejectActionTr: "Hayır, başka şehirleri değerlendirmek istiyorum",
      rejectActionEn: "No, I'd like to explore other cities",
      hasAnatolian: true,
      hasEuropean: false,
    };
  }

  if (branchKey === "eye_treatments") {
    return {
      branchKey,
      sideAvailability: "european_only",
      availableSides: ["european"],
      singleSideNameTr: "Avrupa Yakası",
      singleSideNameEn: "European Side",
      clarificationMessageTr: "Göz tedavisi için şu anda öne çıkan partner seçeneklerimiz İstanbul Avrupa Yakası’nda bulunuyor. Avrupa Yakası’ndaki klinikleri değerlendirmek ister misiniz?",
      clarificationMessageEn: "For Eye Treatments, our featured partner clinic options are located on Istanbul's European Side. Would you like to evaluate clinics on the European Side?",
      confirmActionTr: "Evet, Avrupa Yakası seçeneklerini göster",
      confirmActionEn: "Yes, show European Side options",
      rejectActionTr: "Hayır, başka şehirleri değerlendirmek istiyorum",
      rejectActionEn: "No, I'd like to explore other cities",
      hasAnatolian: false,
      hasEuropean: true,
    };
  }

  return {
    branchKey,
    sideAvailability: "both",
    availableSides: ["european", "anatolian"],
    clarificationMessageTr: "İstanbul, Avrupa ve Anadolu Yakası olmak üzere iki ana bölgeye ayrılıyor. Size en uygun klinikleri önerebilmem için hangi yakayı tercih ettiğinizi netleştirebilir miyiz?",
    clarificationMessageEn: "Istanbul is divided into the European Side and the Anatolian Side. Which side do you prefer?",
    confirmActionTr: "Avrupa Yakası",
    confirmActionEn: "European Side",
    rejectActionTr: "Anadolu Yakası",
    rejectActionEn: "Anatolian Side",
    hasAnatolian: true,
    hasEuropean: true,
  };
}

export function getIstanbulSideClarificationCard(rawBranch?: string | null, locale: string = "tr") {
  const isEn = locale.toLowerCase().startsWith("en");
  const avail = getBranchIstanbulSideAvailability(rawBranch);

  if (avail.sideAvailability === "both") {
    return {
      type: "side_clarification",
      title: isEn ? "Istanbul Side Selection" : "İstanbul Yaka Tercihi",
      message: isEn ? avail.clarificationMessageEn : avail.clarificationMessageTr,
      options: [
        {
          id: "european",
          side: "european",
          title: isEn ? "European Side (Avrupa Yakası)" : "Avrupa Yakası",
          subtitle: isEn ? "Near Istanbul Airport (IST), Taksim, Şişli, Mecidiyeköy" : "İstanbul Havalimanı (IST), Taksim, Şişli, Mecidiyeköy yakınları",
          badge: isEn ? "Central & Tourist Hub" : "Turistik & Ulaşım Merkezi",
        },
        {
          id: "anatolian",
          side: "anatolian",
          title: isEn ? "Anatolian / Asian Side (Anadolu Yakası)" : "Anadolu Yakası",
          subtitle: isEn ? "Near Sabiha Gökçen Airport (SAW), Kadıköy, Çamlıca, Kurtköy" : "Sabiha Gökçen Havalimanı (SAW), Kadıköy, Çamlıca, Kurtköy yakınları",
          badge: isEn ? "Quiet & Modern Centers" : "Sakin & Modern Merkezler",
        },
        {
          id: "unsure",
          side: "unsure",
          title: isEn ? "I'm Not Sure / Help Me Choose" : "Emin Değilim / Bana Yardımcı Ol",
          subtitle: isEn ? "Select based on my airport or accommodation" : "Havaalanıma veya konaklama yerime göre öner",
          badge: isEn ? "Guided Matching" : "Rehberli Eşleştirme",
        },
      ],
    };
  }

  // Single side branches (IVF, Cardiology, Check-up, Eye)
  const singleSide = avail.availableSides[0];
  return {
    type: "branch_side_confirm",
    branchKey: avail.branchKey,
    side: singleSide,
    title: isEn ? "Branch Location Information" : "Tedavi Lokasyon Bilgisi",
    message: isEn ? avail.clarificationMessageEn : avail.clarificationMessageTr,
    options: [
      {
        id: `confirm_${singleSide}`,
        side: singleSide,
        action: "confirm",
        title: isEn ? avail.confirmActionEn : avail.confirmActionTr,
        badge: isEn ? "Recommended" : "Önerilen Seçenek",
      },
      {
        id: "explore_other_cities",
        side: "other_cities",
        action: "reject",
        title: isEn ? avail.rejectActionEn : avail.rejectActionTr,
        badge: isEn ? "Alternative" : "Alternatif Şehirler",
      },
    ],
  };
}

export function getSideGuidancePrompt(airportOrDistrictCue?: string | null, locale: string = "tr"): string {
  const isEn = locale.toLowerCase().startsWith("en");

  if (airportOrDistrictCue) {
    const norm = normalizeLocString(airportOrDistrictCue);
    if (norm.includes("ist") || norm.includes("istanbul havalimani") || norm.includes("istanbul airport")) {
      return isEn
        ? "You mentioned using Istanbul Airport (IST). For travel convenience, clinics on the European Side (such as Mecidiyeköy and Halkalı) are usually more practical. Would you like to evaluate European Side options?"
        : "İstanbul Havalimanı’nı (IST) kullanacağınızı belirttiniz. Ulaşım kolaylığı açısından Avrupa Yakası’ndaki klinikler (Mecidiyeköy ve Halkalı) genellikle daha pratiktir. Avrupa Yakası seçeneklerini değerlendirmek ister misiniz?";
    }
    if (norm.includes("saw") || norm.includes("sabiha")) {
      return isEn
        ? "You mentioned using Sabiha Gökçen Airport (SAW). For travel convenience, clinics on the Anatolian Side (such as Çamlıca and Kurtköy) are usually closer. Would you like to evaluate Anatolian Side options?"
        : "Sabiha Gökçen Havalimanı’nı (SAW) kullanacağınızı belirttiniz. Ulaşım kolaylığı açısından Anadolu Yakası’ndaki klinikler (Çamlıca ve Kurtköy) genellikle daha pratiktir. Anadolu Yakası seçeneklerini değerlendirmek ister misiniz?";
    }
  }

  return isEn
    ? "Istanbul is a large metropolis spanning two continents. Which airport will you use (Istanbul Airport (IST) or Sabiha Gökçen Airport (SAW)), or in which area will you stay?"
    : "İstanbul iki kıtaya yayılan büyük bir metropol. Hangi havalimanını kullanacaksınız (İstanbul Havalimanı veya Sabiha Gökçen) veya hangi bölgede konaklayacaksınız?";
}

export function formatClinicCardLocation(clinic: any, locale: string = "tr"): string {
  const isEn = locale.toLowerCase().startsWith("en");
  const cName = (clinic.clinicName || "").toLowerCase();
  const cSlug = (clinic.clinicSlug || clinic.id || "").toLowerCase();
  const rawCity = (clinic.location?.city || "").toLowerCase();

  // If not Istanbul, return standard city name
  // Workaround for Turkish dotless i (ı) / dotted I (İ) matching
  const normalizedCity = rawCity.replace(/i̇/g, "i").replace(/ı/g, "i").replace(/istanbul/g, "istanbul");
  const isIstanbul = normalizedCity.includes("istanbul") || cName.includes("istanbul") || cSlug.includes("istanbul") || cName.includes("camlica") || cName.includes("mecidiyekoy") || cName.includes("bht") || cName.includes("atakoy") || cSlug.includes("dis-akademisi");
  
  if (!isIstanbul) {
    const cityCap = clinic.location?.city || "Türkiye";
    const countryCap = clinic.location?.country || "Türkiye";
    return `${cityCap}, ${countryCap}`;
  }

  // Check which side this clinic belongs to
  const sideRes = resolveIstanbulSideFromText(`${cName} ${cSlug} ${clinic.location?.address || ""} ${clinic.location?.district || ""}`);
  const side = sideRes.side || (cSlug.includes("camlica") || cSlug.includes("lokman") || cSlug.includes("dis-akademisi") || cSlug.includes("anadolu-medical") ? "anatolian" : "european");

  let districtSubtitle = "";
  if (cSlug.includes("mecidiyekoy") || cName.includes("mecidiyeköy") || cName.includes("mecidiyekoy")) {
    districtSubtitle = "Mecidiyeköy, Şişli";
  } else if (cSlug.includes("camlica") || cName.includes("çamlıca") || cName.includes("camlica")) {
    districtSubtitle = "Çamlıca, Üsküdar";
  } else if (cSlug.includes("bht") || cName.includes("bht")) {
    districtSubtitle = "Halkalı / Küçükçekmece";
  } else if (cSlug.includes("atakoy") || cName.includes("ataköy") || cName.includes("atakoy")) {
    districtSubtitle = "Ataköy, Bakırköy";
  } else if (cSlug.includes("dis-akademisi") || cName.includes("akademisi")) {
    districtSubtitle = "Kadıköy / Ataşehir";
  } else if (cSlug.includes("lokman-hekim") || cName.includes("lokman")) {
    districtSubtitle = "Kurtköy, Pendik";
  } else if (cSlug.includes("anadolu-medical") || cName.includes("anadolu")) {
    districtSubtitle = "Gebze / Anadolu Yakası";
  } else if (clinic.location?.district) {
    districtSubtitle = clinic.location.district;
  }

  if (side === "anatolian") {
    const base = isEn ? "Location: Istanbul, Anatolian Side" : "Lokasyon: İstanbul, Anadolu Yakası";
    return districtSubtitle ? `${base} • ${districtSubtitle}` : base;
  } else {
    const base = isEn ? "Location: Istanbul, European Side" : "Lokasyon: İstanbul, Avrupa Yakası";
    return districtSubtitle ? `${base} • ${districtSubtitle}` : base;
  }
}

// ─── Treatment Branch Normalizer ─────────────────────────────────────────────

export function normalizeTreatmentBranch(rawCategory?: string | null): string {
  if (!rawCategory) return "dental";
  const lower = rawCategory.toLowerCase();
  if (lower.includes("diş") || lower.includes("dental") || lower.includes("implant") || lower.includes("zirkon") || lower.includes("smile")) {
    return "dental";
  }
  if (lower.includes("ivf") || lower.includes("tüp") || lower.includes("tup") || lower.includes("fertility")) {
    return "ivf";
  }
  if (lower.includes("kardiyo") || lower.includes("cardio") || lower.includes("kalp") || lower.includes("heart")) {
    return "cardiology";
  }
  if (lower.includes("check") || lower.includes("sağlık tarama") || lower.includes("kontrol")) {
    return "check_up";
  }
  if (lower.includes("göz") || lower.includes("goz") || lower.includes("eye") || lower.includes("lasik") || lower.includes("lazer") || lower.includes("katarakt")) {
    return "eye_treatments";
  }
  return lower;
}

// ─── Curated Clinics Filter & Rank ──────────────────────────────────────────

export function getCuratedClinicsForFeelinHealthy(
  category: string,
  city?: string | null,
  side?: "anatolian" | "european" | "any" | "unsure" | null,
  availableClinics: any[] = []
): {
  matchingCuratedClinics: any[];
  allEligibleClinics: any[];
  locationRule: CuratedLocationRule | null;
  isUnsupportedLocation: boolean;
  supportedLocationsForBranch: CuratedLocationRule[];
} {
  const branchKey = normalizeTreatmentBranch(category);
  const branchRule = FEELINHEALTHY_CURATED_RULES.find(b => b.branchKey === branchKey);

  if (!branchRule) {
    // Fallback to active clinics matching category
    const filtered = availableClinics.filter(c => {
      const cats = (c.treatmentCategories || []).map((t: string) => t.toLowerCase());
      return cats.includes(branchKey) || cats.includes(category.toLowerCase());
    });
    return {
      matchingCuratedClinics: filtered.slice(0, FEELINHEALTHY_CONFIG.maxGuestClinics),
      allEligibleClinics: filtered,
      locationRule: null,
      isUnsupportedLocation: false,
      supportedLocationsForBranch: [],
    };
  }

  // Find location rule matching city and side
  let matchedLocRule: CuratedLocationRule | null = null;
  if (city) {
    const cityLower = city.toLowerCase();
    matchedLocRule = branchRule.locations.find(l => {
      if (l.city !== cityLower) return false;
      if (side && side !== "any" && side !== "unsure" && l.side && l.side !== "any") {
        return l.side === side;
      }
      return true;
    }) || null;
  }

  // If no specific city or unmatched in Istanbul, pick first available location rule
  if (!matchedLocRule) {
    if (!city) {
      matchedLocRule = branchRule.locations[0];
    } else {
      // User specified a city where this branch has no curated clinics
      return {
        matchingCuratedClinics: [],
        allEligibleClinics: [],
        locationRule: null,
        isUnsupportedLocation: true,
        supportedLocationsForBranch: branchRule.locations,
      };
    }
  }

  // Match available database clinics against curated rule
  const curatedTargets = matchedLocRule.curatedClinics;
  const eligibleClinics: any[] = [];

  for (const target of curatedTargets) {
    const found = availableClinics.find(c => {
      const cName = (c.clinicName || "").toLowerCase();
      const cSlug = (c.clinicSlug || c.id || "").toLowerCase();
      if (cSlug === target.slugOrId.toLowerCase()) return true;
      if (target.aliasPatterns?.some(p => cName.includes(p.toLowerCase()) || cSlug.includes(p.toLowerCase()))) return true;
      if (cName.includes(target.name.toLowerCase())) return true;
      return false;
    });

    if (found && !eligibleClinics.some(e => e.id === found.id)) {
      eligibleClinics.push(found);
    }
  }

  // Also include other active clinics in that location that match the branch as additional eligible clinics
  for (const c of availableClinics) {
    if (eligibleClinics.some(e => e.id === c.id)) continue;
    const cCity = (c.location?.city || "").toLowerCase();
    const cCats = (c.treatmentCategories || []).map((t: string) => t.toLowerCase());
    if (cCats.includes(branchKey) && (!matchedLocRule.city || cCity.includes(matchedLocRule.city))) {
      eligibleClinics.push(c);
    }
  }

  const topCurated = eligibleClinics.slice(0, FEELINHEALTHY_CONFIG.maxGuestClinics);

  return {
    matchingCuratedClinics: topCurated,
    allEligibleClinics: eligibleClinics,
    locationRule: matchedLocRule,
    isUnsupportedLocation: false,
    supportedLocationsForBranch: branchRule.locations,
  };
}

// ─── 3-Group Lead Intake State Evaluator ─────────────────────────────────────

export type IntakeGroupNumber = 1 | 2 | 3 | "completed";

export interface IntakeGroupStatus {
  currentGroup: IntakeGroupNumber;
  group1Complete: boolean;
  group2Complete: boolean;
  group3Complete: boolean;
  missingFieldsInCurrentGroup: string[];
  allGroupsComplete: boolean;
}

export function evaluateFeelinHealthyIntake(context: any): IntakeGroupStatus {
  // Group 1 (Personal): patientName (or firstName), patientAge, patientGender
  const hasName = Boolean(context.patientName || context.firstName);
  const hasAge = context.patientAge !== undefined && context.patientAge !== null && Number(context.patientAge) > 0;
  const hasGender = Boolean(context.patientGender);
  const group1Complete = hasName && hasAge && hasGender;

  const missingGroup1: string[] = [];
  if (!hasName) missingGroup1.push("patientName");
  if (!hasAge) missingGroup1.push("patientAge");
  if (!hasGender) missingGroup1.push("patientGender");

  // Group 2 (Contact & Country): patientEmail (or verified_format), patientPhone, patientCountry
  const hasEmail = Boolean(context.patientEmail && (context.patientEmailStatus === "verified_format" || context.patientEmail.includes("@")));
  const hasPhone = Boolean(context.patientPhone);
  const hasCountry = Boolean(context.patientCountry);
  const group2Complete = hasEmail && hasPhone && hasCountry;

  const missingGroup2: string[] = [];
  if (!hasEmail) missingGroup2.push("patientEmail");
  if (!hasPhone) missingGroup2.push("patientPhone");
  if (!hasCountry) missingGroup2.push("patientCountry");

  // Group 3 (Travel Plan): travelDate
  const hasTravelDate = Boolean(context.travelDate || context.travelDateStart || context.travelDateText);
  const group3Complete = hasTravelDate;

  const missingGroup3: string[] = [];
  if (!hasTravelDate) missingGroup3.push("travelDate");

  let currentGroup: IntakeGroupNumber = 1;
  let missingFieldsInCurrentGroup: string[] = missingGroup1;

  if (!group1Complete) {
    currentGroup = 1;
    missingFieldsInCurrentGroup = missingGroup1;
  } else if (!group2Complete) {
    currentGroup = 2;
    missingFieldsInCurrentGroup = missingGroup2;
  } else if (!group3Complete) {
    currentGroup = 3;
    missingFieldsInCurrentGroup = missingGroup3;
  } else {
    currentGroup = "completed";
    missingFieldsInCurrentGroup = [];
  }

  return {
    currentGroup,
    group1Complete,
    group2Complete,
    group3Complete,
    missingFieldsInCurrentGroup,
    allGroupsComplete: group1Complete && group2Complete && group3Complete,
  };
}

// ─── Intake Prompt Generators ───────────────────────────────────────────────

export function getGroupIntakePrompt(
  status: IntakeGroupStatus,
  context: any,
  locale: string = "tr"
): string {
  const isEn = locale.toLowerCase().startsWith("en");

  if (status.currentGroup === 1) {
    const missing = status.missingFieldsInCurrentGroup;
    if (missing.length === 3) {
      return isEn
        ? "To prepare the most suitable clinic options and personalized quotes for you, could you please share your full name, age, and gender?"
        : "Size en uygun klinik seçeneklerini ve teklifleri hazırlayabilmemiz için lütfen adınızı soyadınızı, yaşınızı ve cinsiyetinizi paylaşabilir misiniz?";
    }
    // Partial missing in Group 1
    const partsTr: string[] = [];
    const partsEn: string[] = [];
    if (missing.includes("patientName")) { partsTr.push("adınızı ve soyadınızı"); partsEn.push("your full name"); }
    if (missing.includes("patientAge")) { partsTr.push("yaşınızı"); partsEn.push("your age"); }
    if (missing.includes("patientGender")) { partsTr.push("cinsiyetinizi"); partsEn.push("your gender"); }

    return isEn
      ? `Thank you. Could you also please share ${partsEn.join(", ")}?`
      : `Teşekkürler. Lütfen devam edebilmemiz için ${partsTr.join(", ")} de belirtebilir misiniz?`;
  }

  if (status.currentGroup === 2) {
    const name = context.patientName ? context.patientName.split(" ")[0] : "";
    const greetingTr = name ? `Teşekkürler ${name}. ` : "Harika. ";
    const greetingEn = name ? `Thank you ${name}. ` : "Great. ";

    const missing = status.missingFieldsInCurrentGroup;
    if (missing.length === 3) {
      return isEn
        ? `${greetingEn}To send you quote details and coordinate with our specialists, could you please provide your email address, phone/WhatsApp number, and the country you reside in?`
        : `${greetingTr}Teklif detaylarını iletebilmemiz ve uzman hekimlerimizle paylaşabilmemiz için e-posta adresinizi, telefon/WhatsApp numaranızı ve ikamet ettiğiniz ülkeyi paylaşabilir misiniz?`;
    }
    const partsTr: string[] = [];
    const partsEn: string[] = [];
    if (missing.includes("patientEmail")) { partsTr.push("e-posta adresinizi"); partsEn.push("your email address"); }
    if (missing.includes("patientPhone")) { partsTr.push("telefon veya WhatsApp numaranızı"); partsEn.push("your phone or WhatsApp number"); }
    if (missing.includes("patientCountry")) { partsTr.push("yaşadığınız ülkeyi"); partsEn.push("the country you reside in"); }

    return isEn
      ? `Could you also provide ${partsEn.join(", ")} so we can reach you with the quotes?`
      : `Teklifleri size ulaştırabilmemiz için lütfen ${partsTr.join(", ")} de paylaşabilir misiniz?`;
  }

  if (status.currentGroup === 3) {
    return isEn
      ? "Could you share your approximate travel dates or preferred timeframe for treatment (e.g. next month, early July, or specific dates)?"
      : "Tedavi için planladığınız yaklaşık seyahat tarihini veya dönemi (örn. önümüzdeki ay, Temmuz başı veya belirli bir tarih aralığı) öğrenebilir miyiz?";
  }

  return isEn
    ? "All required details have been received. Creating your quote request now."
    : "Tüm gerekli bilgiler alındı. Teklif talebiniz oluşturuluyor.";
}

// ─── Unsupported Location Negotiation Prompt ────────────────────────────────

export function getUnsupportedLocationPrompt(
  branchKey: string,
  requestedLocation: string,
  supportedLocations: CuratedLocationRule[],
  locale: string = "tr"
): string {
  const isEn = locale.toLowerCase().startsWith("en");
  const branchRule = FEELINHEALTHY_CURATED_RULES.find(b => b.branchKey === branchKey);
  const branchName = isEn
    ? (branchRule?.categoryNameEn || "this treatment")
    : (branchRule?.categoryNameTr || "bu tedavi");

  const locNames = supportedLocations.map(l => isEn ? l.displayNameEn : l.displayNameTr).join(", ");
  const clinicNames = supportedLocations.flatMap(l => l.curatedClinics.slice(0, 2).map(c => c.name)).join(" ve ");
  const targetCity = supportedLocations[0]?.city === "istanbul" ? "İstanbul" : (supportedLocations[0]?.city || "İstanbul");

  if (isEn) {
    return `For ${branchName}, our FeelinHealthy partner specialized centers (${clinicNames}) are located in ${locNames}. Would you be open to receiving your treatment in ${targetCity}?`;
  }
  return `${branchName} için FeelinHealthy anlaşmalı uzman merkezlerimiz (${clinicNames}) ${locNames} bünyesinde hizmet vermektedir. Tedavinizi ${targetCity}'de değerlendirmek ister misiniz?`;
}

// ─── Additional Clinic Count & Conversion Message ───────────────────────────

export function calculateAdditionalCountAndConversion(
  totalEligible: number,
  displayedCount: number,
  locale: string = "tr"
): {
  additionalCount: number;
  hasConversionOffer: boolean;
  conversionMessage: string;
  ctaText: string;
  registrationUrl: string;
} {
  const additionalCount = Math.max(0, totalEligible - displayedCount);
  const isEn = locale.toLowerCase().startsWith("en");

  return {
    additionalCount,
    hasConversionOffer: additionalCount > 0,
    conversionMessage: isEn
      ? `There are ${additionalCount} more clinics matching your request. Sign up to receive more quotes and compare all options.`
      : `Talebinize uygun ${additionalCount} klinik daha bulunuyor. Daha fazla teklif alıp seçenekleri karşılaştırabilmek için üye olabilirsiniz.`,
    ctaText: isEn ? "Register Free & View All Quotes" : "Ücretsiz Kayıt Ol & Tüm Teklifleri Gör",
    registrationUrl: FEELINHEALTHY_CONFIG.registrationUrl,
  };
}
