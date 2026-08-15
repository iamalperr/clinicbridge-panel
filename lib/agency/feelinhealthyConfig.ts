/**
 * FeelinHealthy Curated Matching, Rules, and Intake Configuration
 * 
 * Rules:
 * 1. Guest users get max 2 curated clinics.
 * 2. Curated lists per branch & location (Section 6 matrix).
 * 3. Never ask for budget anywhere.
 * 4. Deterministic 3-group intake progression (Group 1 -> Group 2 -> Group 3).
 * 5. Location decision order (never skip city for Istanbul side):
 *    - Derive available cities from curated branch rules / connected clinics.
 *    - Ask city when unknown; never assume Istanbul.
 *    - Istanbul side clarification only when city is Istanbul and side is unknown.
 *    - Branch-specific side availability:
 *      * Dental: Both European & Anatolian
 *      * IVF, Cardiology, Check-up: Anatolian Side only
 *      * Eye Treatments: European Side only
 *    - Structured state: selectedCity + istanbul_side ("european" | "anatolian").
 *    - Clinic cards display exact side ("İstanbul, Avrupa Yakası" / "İstanbul, Anadolu Yakası").
 */

import {
  getAgencySelectedCity,
  getAgencyTravelDate,
  getAgencyTreatmentContext,
} from "./agencySessionState";

const CITY_DISPLAY_NAMES: Record<string, { tr: string; en: string }> = {
  istanbul: { tr: "İstanbul", en: "Istanbul" },
  izmir: { tr: "İzmir", en: "Izmir" },
  antalya: { tr: "Antalya", en: "Antalya" },
  ankara: { tr: "Ankara", en: "Ankara" },
  kocaeli: { tr: "Kocaeli / Gebze", en: "Kocaeli / Gebze" },
};

export function getCityDisplayName(city: string | null | undefined, locale: string = "tr"): string {
  if (!city) return "";
  const key = city.toLowerCase();
  const names = CITY_DISPLAY_NAMES[key];
  if (!names) return city.charAt(0).toUpperCase() + city.slice(1);
  return locale.toLowerCase().startsWith("en") ? names.en : names.tr;
}

/**
 * Canonical FeelinHealthy agency clinic document IDs from production Firestore
 * (`agencies/{agencyDocId}/clinics/{id}`). Prefer these over marketing slugs —
 * production document IDs are opaque Firestore IDs, not kebab-case slug strings.
 */
export const FEELINHEALTHY_PRODUCTION_CLINIC_IDS = {
  hospitadentMecidiyekoy: "HXMlMPZ74AXkXoR4sEnH",
  bhtClinicIstanbulTema: "Ab1OHdC020XOG4TWpR2r",
  istanbulDisAkademisi: "9lYESxsLYFM1w4oebubu",
  hospitadentCamlica: "SUEtM1vwxLkidYvH0cLR",
  westdentClinic: "7MUCIEtOjjpq3dfcQG3W",
  beyazisikIzmir: "2LOt5XJVC6R5u7MhZdG7",
  hospitadentAntalya: "jOfAk5EVmhPHzpfT0HX1",
  memorialAntalya: "VOu7zswvfDlZtj6dDd6I",
  hospitadentAnkara: "insjxdoE2Rpss5EFzP3h",
  lokmanHekimAnkara: "iSrE4eQsTIbmRzjBMChK",
  lokmanHekimIstanbul: "tAPXLkbjTRTE0PX96ZNs",
  anadoluMedicalCenter: "CnjF1vlliz4vM7IRRWKr",
  dunyagozAtakoy: "KY7x141fXMg5oIWHjBnQ",
  dunyagozAntalya: "l5zwxhtDlxSqqCu8AArk",
  orionSurgeryCenter: "qFk6AAp46VM1ZUfyhpZg",
  intermedNisantasi: "ptXjvS5XdF6lBKIamIKp",
} as const;

export interface CuratedClinicTarget {
  name: string;
  /** Prefer production Firestore document ID. Legacy slugs remain in aliasPatterns. */
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
  branchKey:
    | "dental"
    | "ivf"
    | "cardiology"
    | "check_up"
    | "eye_treatments"
    | "hair_transplant"
    | "aesthetic_surgery"
    | string;
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
            slugOrId: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.istanbulDisAkademisi,
            aliasPatterns: [
              "istanbul-dis-akademisi",
              "istanbul diş akademisi",
              "istanbul dis akademisi",
              "istanbul dental academy",
              "dis akademisi",
              "diş akademisi",
            ],
            district: "Kadıköy / Ataşehir",
          },
          {
            name: "Hospitadent Çamlıca",
            slugOrId: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.hospitadentCamlica,
            aliasPatterns: [
              "hospitadent-dental-group-camlica",
              "hospitadent-camlica",
              "hospitadent çamlıca",
              "hospitadent camlica",
              "hospitadent dental group çamlıca",
              "hospitadent dental group camlica",
              "çamlıca hospitadent",
              "camlica hospitadent",
            ],
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
            slugOrId: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.hospitadentMecidiyekoy,
            aliasPatterns: [
              "hospitadent-dental-group-mecidiyekoy",
              "hospitadent-mecidiyekoy",
              "hospitadent mecidiyeköy",
              "hospitadent mecidiyekoy",
              "hospitadent dental group mecidiyeköy",
              "hospitadent dental group mecidiyekoy",
              "mecidiyeköy hospitadent",
              "mecidiyekoy hospitadent",
            ],
            district: "Mecidiyeköy, Şişli",
          },
          {
            name: "BHT Clinic İstanbul TEMA Hospital",
            slugOrId: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.bhtClinicIstanbulTema,
            aliasPatterns: [
              "bht-clinic-istanbul-tema-hastanesi",
              "bht-clinic-istanbul-tema",
              "bht clinic",
              "bht tema",
              "bht clinic istanbul tema hospital",
              "bht clinic istanbul tema hastanesi",
              "bht clinic istanbul tema",
              "bht",
            ],
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
            slugOrId: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.westdentClinic,
            aliasPatterns: ["westdent-clinic", "westdent", "westdent clinic", "westdent izmir"],
            district: "Bayraklı, İzmir",
          },
          {
            name: "Beyaz Işık İzmir Dental Group",
            slugOrId: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.beyazisikIzmir,
            aliasPatterns: [
              "beyazisik-izmir-dental-group",
              "beyaz ışık izmir",
              "beyazışık izmir",
              "beyazisik izmir",
              "beyaz ışık izmir dental group",
              "beyazışık izmir dental group",
              "beyazisik-izmir",
              "beyaz isik izmir",
            ],
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
            slugOrId: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.hospitadentAntalya,
            aliasPatterns: [
              "hospitadent-dental-group-antalya",
              "hospitadent-antalya",
              "hospitadent antalya",
              "hospitadent dental group antalya",
              "antalya hospitadent",
            ],
            district: "Muratpaşa, Antalya",
          },
          {
            name: "Memorial Antalya",
            slugOrId: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.memorialAntalya,
            aliasPatterns: [
              "memorial-hospital",
              "memorial antalya",
              "memorial hospital antalya",
              "memorial hospital",
              "memorial",
            ],
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
            slugOrId: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.hospitadentAnkara,
            aliasPatterns: [
              "hospitadent-dental-group-ankara",
              "hospitadent-ankara",
              "hospitadent ankara",
              "hospitadent dental group ankara",
              "ankara hospitadent",
              "hospitadent",
            ],
            district: "Çankaya, Ankara",
          },
          {
            name: "Lokman Hekim Ankara",
            slugOrId: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.lokmanHekimAnkara,
            aliasPatterns: [
              "lokman-hekim-university-ankara-hospital",
              "lokman hekim ankara",
              "lokman hekim university ankara hospital",
              "lokman hekim akay",
              "lokman hekim akay hospital",
              "lokman hekim üniversite hastanesi ankara",
              "lokman hekim",
            ],
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
            slugOrId: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.lokmanHekimIstanbul,
            aliasPatterns: ["lokman-hekim-istanbul-hospital", "lokman hekim", "lokman hekim istanbul", "lokman hekim istanbul hospital", "lokman hekim kurtköy", "lokman hekim pendik", "lokman hekim sağlık grubu"],
            district: "Kurtköy, Pendik",
          },
          {
            name: "Anadolu Medical Center",
            slugOrId: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.anadoluMedicalCenter,
            aliasPatterns: ["anadolu-medical-center", "anadolu medical center", "anadolu sağlık merkezi", "anadolu saglik merkezi", "anadolu"],
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
            slugOrId: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.lokmanHekimIstanbul,
            aliasPatterns: ["lokman-hekim-istanbul-hospital", "lokman hekim", "lokman hekim istanbul", "lokman hekim istanbul hospital", "lokman hekim kurtköy", "lokman hekim pendik", "lokman hekim sağlık grubu"],
            district: "Kurtköy, Pendik",
          },
          {
            name: "Anadolu Medical Center",
            slugOrId: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.anadoluMedicalCenter,
            aliasPatterns: ["anadolu-medical-center", "anadolu medical center", "anadolu sağlık merkezi", "anadolu saglik merkezi", "anadolu"],
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
            slugOrId: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.anadoluMedicalCenter,
            aliasPatterns: ["anadolu-medical-center", "anadolu medical center", "anadolu sağlık merkezi", "anadolu saglik merkezi", "anadolu"],
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
            slugOrId: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.lokmanHekimIstanbul,
            aliasPatterns: ["lokman-hekim-istanbul-hospital", "lokman hekim", "lokman hekim istanbul", "lokman hekim istanbul hospital", "lokman hekim kurtköy", "lokman hekim pendik", "lokman hekim sağlık grubu"],
            district: "Kurtköy, Pendik",
          },
          {
            name: "Anadolu Medical Center",
            slugOrId: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.anadoluMedicalCenter,
            aliasPatterns: ["anadolu-medical-center", "anadolu medical center", "anadolu sağlık merkezi", "anadolu saglik merkezi", "anadolu"],
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
            slugOrId: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.anadoluMedicalCenter,
            aliasPatterns: ["anadolu-medical-center", "anadolu medical center", "anadolu sağlık merkezi", "anadolu saglik merkezi"],
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
            slugOrId: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.lokmanHekimIstanbul,
            aliasPatterns: ["lokman-hekim-istanbul-hospital", "lokman-istanbul", "lokman hekim", "lokman hekim istanbul"],
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
            slugOrId: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.bhtClinicIstanbulTema,
            aliasPatterns: ["bht-clinic-istanbul-tema-hastanesi", "bht-tema", "bht clinic", "bht tema"],
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
            slugOrId: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.dunyagozAtakoy,
            aliasPatterns: ["dunyagoz-atakoy", "dunyagoz ataköy", "dünyagöz atakoy", "dunyagoz atakoy", "dünyagöz ataköy", "dunyagoz"],
            district: "Ataköy, Bakırköy",
          },
          {
            name: "BHT Clinic İstanbul TEMA Hospital",
            slugOrId: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.bhtClinicIstanbulTema,
            aliasPatterns: [
              "bht-clinic-istanbul-tema-hastanesi",
              "bht-clinic-istanbul-tema",
              "bht clinic",
              "bht tema",
              "bht clinic istanbul tema hospital",
              "bht clinic istanbul tema",
              "bht",
            ],
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
            slugOrId: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.dunyagozAntalya,
            aliasPatterns: ["dunyagoz-antalya", "dunyagoz antalya", "dünyagöz antalya"],
            district: "Muratpaşa, Antalya",
          },
        ],
      },
    ],
  },
  {
    branchKey: "aesthetic_surgery",
    categoryNameTr: "Estetik & Plastik Cerrahi",
    categoryNameEn: "Aesthetic & Plastic Surgery",
    locations: [
      {
        city: "istanbul",
        side: "anatolian",
        displayNameTr: "İstanbul Anadolu Yakası",
        displayNameEn: "Istanbul Anatolian Side",
        curatedClinics: [
          {
            name: "Orion Surgery Center",
            slugOrId: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.orionSurgeryCenter,
            aliasPatterns: [
              "orion-surgery-center",
              "orion surgery center",
              "orion surgical center",
              "orion cerrahi",
              "orion",
            ],
            district: "İstanbul",
          },
          {
            name: "Lokman Hekim İstanbul Hospital",
            slugOrId: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.lokmanHekimIstanbul,
            aliasPatterns: [
              "lokman-hekim-istanbul-hospital",
              "lokman-istanbul",
              "lokman hekim istanbul",
              "lokman hekim",
            ],
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
            slugOrId: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.bhtClinicIstanbulTema,
            aliasPatterns: [
              "bht-clinic-istanbul-tema-hastanesi",
              "bht-clinic-istanbul-tema",
              "bht clinic",
              "bht tema",
              "bht",
            ],
            district: "Halkalı / Küçükçekmece",
          },
          // Intermed Health Group Nişantaşı intentionally omitted from FH curated
          // recommendations (agency request). Clinic record / ID may still exist
          // for other agencies or non-recommendation references.
        ],
      },
      {
        city: "antalya",
        side: "any",
        displayNameTr: "Antalya",
        displayNameEn: "Antalya",
        curatedClinics: [
          {
            name: "Memorial Hospital",
            slugOrId: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.memorialAntalya,
            aliasPatterns: [
              "memorial-hospital",
              "memorial antalya",
              "memorial hospital antalya",
              "memorial",
            ],
            district: "Antalya",
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
            name: "Lokman Hekim University Ankara Hospital",
            slugOrId: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.lokmanHekimAnkara,
            aliasPatterns: [
              "lokman-hekim-university-ankara-hospital",
              "lokman hekim ankara",
              "lokman-hekim-ankara",
              "lokman hekim university ankara",
            ],
            district: "Ankara",
          },
        ],
      },
    ],
  },
];

export const FEELINHEALTHY_CONFIG = {
  agencySlug: "feelinhealthy",
  agencyName: "FeelinHealthy",
  /** Max clinics shown to public guest users in recommendation cards. */
  maxGuestClinics: 2,
  /** Alias: guestVisibleClinicLimit === maxGuestClinics */
  guestVisibleClinicLimit: 2,
  /** Max clinics allowed in a single guest quote-comparison selection. */
  guestQuoteClinicSelectionLimit: 2,
  privacyNoticeUrl: "https://feelinhealthy.com/kvkk",
  privacyNoticeLabelTr: "Aydınlatma metnini",
  privacyNoticeLabelEn: "privacy notice",
  placeholderTr: "İstanbul’da implant tedavisi yaptırmak istiyorum. Avrupa Yakası ve İngilizce destek benim için önemli.",
  placeholderEn: "I want dental implants in Istanbul. European Side and English support are important to me.",
  registrationUrl: "https://www.feelinhealthy.com/register",
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

// ─── Available Cities (derived from curated / connected clinic data) ─────────

export interface AvailableCityOption {
  city: string;
  displayName: string;
  displayNameTr: string;
  displayNameEn: string;
  eligibleClinicCount: number;
  requiresSideSelection: boolean;
}

/**
 * Unique cities that currently have curated FeelinHealthy providers for a branch.
 * When `availableClinics` is supplied, only cities with at least one matching
 * connected clinic remain. Duplicates such as "Istanbul" / "İstanbul" collapse
 * into one canonical option.
 */
export function getAvailableCitiesForTreatment(
  rawBranch?: string | null,
  availableClinics: any[] = [],
  locale: string = "tr"
): AvailableCityOption[] {
  const branchKey = normalizeTreatmentBranch(rawBranch);
  const branchRule = FEELINHEALTHY_CURATED_RULES.find((b) => b.branchKey === branchKey);
  if (!branchRule) return [];

  const sideAvail = getBranchIstanbulSideAvailability(branchKey);
  const byCity = new Map<string, AvailableCityOption>();

  for (const loc of branchRule.locations) {
    const cityKey = loc.city.toLowerCase();
    const existing = byCity.get(cityKey);
    const curatedCount = loc.curatedClinics.length;

    let matchedCount = curatedCount;
    if (availableClinics.length > 0) {
      matchedCount = loc.curatedClinics.filter((target) =>
        availableClinics.some((c) => {
          const cName = (c.clinicName || "").toLowerCase();
          const cSlug = (c.clinicSlug || c.id || "").toLowerCase();
          if (cSlug === target.slugOrId.toLowerCase()) return true;
          if (target.aliasPatterns?.some((p) => cName.includes(p.toLowerCase()) || cSlug.includes(p.toLowerCase()))) {
            return true;
          }
          return cName.includes(target.name.toLowerCase());
        })
      ).length;
      if (matchedCount === 0) continue;
    }

    if (existing) {
      existing.eligibleClinicCount += matchedCount;
      continue;
    }

    byCity.set(cityKey, {
      city: cityKey,
      displayName: getCityDisplayName(cityKey, locale),
      displayNameTr: getCityDisplayName(cityKey, "tr"),
      displayNameEn: getCityDisplayName(cityKey, "en"),
      eligibleClinicCount: matchedCount,
      requiresSideSelection:
        cityKey === "istanbul" && sideAvail.sideAvailability === "both",
    });
  }

  // Prefer a stable marketplace order: Istanbul first, then other TR hubs.
  const preferredOrder = ["istanbul", "izmir", "antalya", "ankara", "kocaeli"];
  return Array.from(byCity.values()).sort((a, b) => {
    const ai = preferredOrder.indexOf(a.city);
    const bi = preferredOrder.indexOf(b.city);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

export function getCitySelectionPrompt(
  rawBranch: string | null | undefined,
  cities: AvailableCityOption[],
  locale: string = "tr"
): string {
  const isEn = locale.toLowerCase().startsWith("en");
  const branchKey = normalizeTreatmentBranch(rawBranch);
  const branchRule = FEELINHEALTHY_CURATED_RULES.find((b) => b.branchKey === branchKey);
  const treatmentLabel = isEn
    ? branchRule?.categoryNameEn || "this treatment"
    : branchRule?.categoryNameTr || "bu tedavi";

  const cityNames = cities
    .map((c) => (isEn ? c.displayNameEn : c.displayNameTr))
    .join(isEn ? ", " : ", ")
    .replace(/, ([^,]*)$/, isEn ? " and $1" : " ve $1");

  if (cities.length === 0) {
    return isEn
      ? `I could not find an active FeelinHealthy partner city for ${treatmentLabel} right now. Could you share which city you had in mind?`
      : `${treatmentLabel} için şu anda FeelinHealthy ağına bağlı aktif bir şehir seçeneği bulamadım. Hangi şehri düşündüğünüzü paylaşır mısınız?`;
  }

  const hasIstanbul = cities.some((c) => c.city === "istanbul");
  if (isEn) {
    return (
      `City choice decides which partner clinics I can show for ${treatmentLabel.toLowerCase()}. ` +
      `Pick the city closest to your flight or stay — current options: ${cityNames}.` +
      (hasIstanbul
        ? ` If you choose Istanbul, the next step is European vs Anatolian side so transfers stay practical.`
        : ` After you choose, I’ll prepare matching providers in that city.`)
    );
  }
  return (
    `Şehir seçimi, ${treatmentLabel} için göstereceğim partner klinikleri doğrudan belirler. ` +
    `Uçuş veya konaklama planınıza en yakın şehri seçmeniz en pratik yol — güncel seçenekler: ${cityNames}.` +
    (hasIstanbul
      ? ` İstanbul’u seçerseniz bir sonraki adımda Avrupa / Anadolu yakasını netleştiririz; böylece transfer daha kolay olur.`
      : ` Şehri seçtikten sonra o bölgedeki uygun kuruluşları hazırlayacağım.`)
  );
}

/** Short travel-aware subtitle under each city option. */
export function getCityGuidanceSubtitle(
  city: string,
  locale: string = "tr",
  requiresSideSelection = false
): string {
  const isEn = locale.toLowerCase().startsWith("en");
  const key = String(city || "").toLowerCase();
  const mapTr: Record<string, string> = {
    istanbul: requiresSideSelection
      ? "En geniş partner ağı · Sonraki adım: Avrupa / Anadolu yakası"
      : "En geniş partner ağı, iki havalimanı erişimi",
    izmir: "Ege rotası · Rahat ulaşım ve iyileşme için pratik",
    antalya: "Turizm + tedavi kombinesi · Havalimanı erişimi güçlü",
    ankara: "Başkent · İç hat uçuş / karayolu ile kolay erişim",
    kocaeli: "İstanbul Anadolu’ya yakın alternatif · Gebze hattı",
  };
  const mapEn: Record<string, string> = {
    istanbul: requiresSideSelection
      ? "Widest partner network · Next: European / Anatolian side"
      : "Widest partner network, two-airport access",
    izmir: "Aegean route · Practical for travel and recovery",
    antalya: "Travel + treatment combo · Strong airport access",
    ankara: "Capital city · Easy domestic flight / road access",
    kocaeli: "Near Istanbul Anatolian side · Gebze corridor",
  };
  const fallback = isEn
    ? "FeelinHealthy partner providers available"
    : "FeelinHealthy anlaşmalı kuruluşlar mevcut";
  return (isEn ? mapEn[key] : mapTr[key]) || fallback;
}

export function getCitySelectionCard(
  rawBranch: string | null | undefined,
  cities: AvailableCityOption[],
  locale: string = "tr"
) {
  const isEn = locale.toLowerCase().startsWith("en");
  const message = getCitySelectionPrompt(rawBranch, cities, locale);

  return {
    type: "city_selection",
    title: isEn ? "Preferred City" : "Tercih Edilen Şehir",
    message,
    options: cities.map((c) => ({
      id: c.city,
      city: c.city,
      title: isEn ? c.displayNameEn : c.displayNameTr,
      subtitle: getCityGuidanceSubtitle(c.city, locale, c.requiresSideSelection),
      badge: c.requiresSideSelection
        ? isEn
          ? "Side selection next"
          : "Ardından yaka tercihi"
        : undefined,
    })),
  };
}

export type LocationDecisionStep =
  | "ask_treatment"
  | "ask_city"
  | "ask_side"
  | "ready";

export interface LocationDecision {
  step: LocationDecisionStep;
  treatmentBranch: string | null;
  city: string | null;
  side: "anatolian" | "european" | "any" | "unsure" | null;
  availableCities: AvailableCityOption[];
}

/**
 * Deterministic location gate for FeelinHealthy.
 * Never assumes Istanbul when the city is unknown.
 */
export function decideFeelinHealthyLocationNextStep(
  context: {
    lastTreatmentCategory?: string | null;
    selectedCity?: string | null;
    lastLocation?: string | null;
    istanbul_side?: string | null;
    locationSelectionConfirmed?: boolean;
  },
  availableClinics: any[] = [],
  locale: string = "tr"
): LocationDecision {
  const treatmentCtx = getAgencyTreatmentContext(context);
  const treatmentBranch = treatmentCtx.category
    ? normalizeTreatmentBranch(treatmentCtx.category)
    : null;

  if (!treatmentBranch) {
    return {
      step: "ask_treatment",
      treatmentBranch: null,
      city: null,
      side: null,
      availableCities: [],
    };
  }

  const availableCities = getAvailableCitiesForTreatment(
    treatmentBranch,
    availableClinics,
    locale
  );

  // Canonical selectedCity only — lastLocation remains a separate negotiation cue.
  const selectedCity = getAgencySelectedCity(context);
  const fromSelected = selectedCity
    ? resolveCityAndSide(selectedCity)
    : { city: null, side: null };
  const fromLast = context.lastLocation
    ? resolveCityAndSide(context.lastLocation)
    : { city: null, side: null };

  let city = fromSelected.city || fromLast.city;
  const side =
    (context.istanbul_side as LocationDecision["side"]) ||
    fromSelected.side ||
    fromLast.side ||
    null;

  // A single eligible city can be adopted without a choice screen.
  if (!city && availableCities.length === 1) {
    city = availableCities[0].city;
  }

  if (!city) {
    return {
      step: "ask_city",
      treatmentBranch,
      city: null,
      side: null,
      availableCities,
    };
  }

  if (city === "istanbul") {
    const avail = getBranchIstanbulSideAvailability(treatmentBranch);
    const sideKnown = side === "european" || side === "anatolian";
    if (!sideKnown) {
      // Single-side branches still need an affirmative confirmation card.
      return {
        step: "ask_side",
        treatmentBranch,
        city,
        side: avail.sideAvailability === "anatolian_only"
          ? "anatolian"
          : avail.sideAvailability === "european_only"
            ? "european"
            : null,
        availableCities,
      };
    }
  }

  return {
    step: "ready",
    treatmentBranch,
    city,
    side: side || "any",
    availableCities,
  };
}

export function getTreatmentClarificationPrompt(locale: string = "tr"): string {
  const isEn = locale.toLowerCase().startsWith("en");
  return isEn
    ? "I've noted your details so far. Which treatment are you looking for? Natural wording is fine — e.g. dental implant, hair transplant, breast augmentation, IVF, or eye treatment. Once I know the treatment I'll match partner clinics for you."
    : "Şu ana kadar verdiğiniz bilgileri kaydettim. Hangi tedavi için bakıyorsunuz? Nasıl yazarsanız yazın yeterli — örneğin diş implantı, saç ekimi, meme büyütme, tüp bebek veya göz tedavisi. Tedaviyi netleştirince size uygun partner klinikleri getireceğim.";
}

/** Short acknowledgement when treatment was already captured (e.g. before KVKK). */
export function getKnownTreatmentAcknowledgement(
  rawCategory?: string | null,
  locale: string = "tr"
): string | null {
  const category = String(rawCategory || "").trim();
  if (!category) return null;
  const isEn = locale.toLowerCase().startsWith("en");
  const branchKey = normalizeTreatmentBranch(category);
  const rule = FEELINHEALTHY_CURATED_RULES.find((b) => b.branchKey === branchKey);
  const fallbackTr: Record<string, string> = {
    aesthetic_surgery: "Estetik",
    hair_transplant: "Saç ekimi",
    dental: "Diş tedavisi",
    implant: "İmplant",
    ivf: "Tüp bebek",
    eye_treatments: "Göz tedavisi",
    obesity: "Obezite cerrahisi",
    cardiology: "Kardiyoloji",
    check_up: "Check-up",
  };
  const fallbackEn: Record<string, string> = {
    aesthetic_surgery: "aesthetic",
    hair_transplant: "hair transplant",
    dental: "dental",
    implant: "implant",
    ivf: "IVF",
    eye_treatments: "eye treatment",
    obesity: "bariatric",
    cardiology: "cardiology",
    check_up: "check-up",
  };
  const label = isEn
    ? rule?.categoryNameEn || fallbackEn[branchKey] || category.replace(/_/g, " ")
    : rule?.categoryNameTr || fallbackTr[branchKey] || category.replace(/_/g, " ");
  return isEn
    ? `I've noted your ${label} request.`
    : `${label} talebinizi not ettim.`;
}

/**
 * Empty match reply that advances the conversation instead of looping the same line.
 * Prefer {@link buildEmptyMatchCityEscalation} so the UI shows clickable city options.
 */
export function getEmptyMatchProcessReply(params: {
  locale?: string;
  branchKey?: string | null;
  city?: string | null;
  side?: string | null;
  supportedLocationLabels?: string[];
}): string {
  const isEn = (params.locale || "tr").toLowerCase().startsWith("en");
  const alts = (params.supportedLocationLabels || []).filter(Boolean).slice(0, 3);
  const altText = alts.length
    ? isEn
      ? ` Available partner areas for this treatment: ${alts.join(", ")}.`
      : ` Bu tedavi için anlaşmalı bölgeler: ${alts.join(", ")}.`
    : "";

  if (isEn) {
    if (!alts.length) {
      return (
        `I've noted your treatment preference, but I can't show a partner clinic for this exact combination yet. ` +
        `Our live partner network currently highlights dental, aesthetic & plastic surgery, hair transplant, IVF, cardiology and eye care. ` +
        `Tell me which of these you'd like to explore, or say "record my request" and I'll keep your details for the team.`
      );
    }
    return (
      `I couldn't show a partner clinic for this exact combination yet.${altText} ` +
      `Please pick a partner city from the options below so I can continue matching.`
    );
  }
  if (!alts.length) {
    return (
      `Tedavi tercihinizi not ettim; bu kombinasyon için henüz doğrudan gösterebileceğim bir partner klinik yok. ` +
      `Canlı ağımızda öne çıkan alanlar: diş, estetik & plastik cerrahi, saç ekimi, tüp bebek, kardiyoloji ve göz. ` +
      `Bunlardan birini yazabilir veya "talebimi kaydet" diyerek ekibe iletmemi isteyebilirsiniz.`
    );
  }
  return (
    `Bu kombinasyon için henüz doğrudan gösterebileceğim bir partner klinik bulamadım.${altText} ` +
    `Devam edebilmem için aşağıdaki anlaşmalı bölgelerden birini seçmeniz yeterli.`
  );
}

/**
 * Detects "let's evaluate" / "değerlendirelim" / short affirmatives after an empty-match offer.
 * Must match conjugated Turkish forms — word-boundary after "değerlendir" fails on "değerlendirelim".
 * Avoid matching treatment asks like "implant istiyorum".
 */
export function isLocationExpansionAffirmative(message?: string | null): boolean {
  const raw = String(message || "").trim();
  if (!raw) return false;
  const msg = raw.toLocaleLowerCase("tr-TR").normalize("NFC");
  if (/de[ğg]erlendir/.test(msg)) return true;
  if (/let['’]?s\s+evaluate|\bevaluate\b/.test(msg)) return true;
  // Pure short confirmations only (not free-text treatment / location sentences).
  if (raw.length > 40) return false;
  return /^(evet|olur|olsun|uygun|fark\s*etmez|tamam|yes|sure|okay|ok|why\s+not|neden\s+olmas[ıi]n|tabii?|kabul)([!.?\s]*)$/i.test(
    msg
  );
}

/**
 * Escalate empty-match / "değerlendirelim" into a clickable city selection card.
 *
 * An empty match is a matching outcome, not an invalidation of the patient's
 * preference: confirmed city/side survive so the flow cannot loop back to
 * "which city?" on its own. Only an explicit patient action to look elsewhere
 * (`allowLocationReset`) unlocks the previous choice.
 */
export function buildEmptyMatchCityEscalation(params: {
  locale?: string;
  branchKey?: string | null;
  availableClinics?: any[];
  sessionContext: Record<string, any>;
  supportedLocationLabels?: string[];
  /** Patient explicitly asked to consider other locations. */
  allowLocationReset?: boolean;
}): {
  reply: string;
  type: "city_selection";
  citySelectionCard: ReturnType<typeof getCitySelectionCard>;
  sessionContext: Record<string, any>;
} | null {
  const locale = (params.locale || "tr").toLowerCase().startsWith("en") ? "en" : "tr";
  const branchKey = String(normalizeTreatmentBranch(params.branchKey) || params.branchKey || "");
  const cities = getAvailableCitiesForTreatment(
    branchKey || params.branchKey,
    params.availableClinics || [],
    locale
  );
  if (!cities.length) return null;

  const next = { ...params.sessionContext };
  next.pendingCitySelection = true;
  delete next.pendingLocationExpansion;
  delete next.pendingLocationExpansionTarget;
  delete next.pendingLocationBranch;
  delete next.lastEmptyMatchKey;
  if (params.allowLocationReset) {
    // Explicit "let's look elsewhere": unlock the city so Istanbul can be re-picked
    // with another side.
    delete next.selectedCity;
    delete next.locationSelectionConfirmed;
    delete next.istanbul_side;
    delete next.istanbul_side_source;
    delete next.sideSelectionConfirmed;
    delete next.pendingSideClarification;
    delete next.pendingSideGuidance;
  }

  const cityCard = getCitySelectionCard(branchKey || params.branchKey, cities, locale);
  const reply = getEmptyMatchProcessReply({
    locale,
    branchKey,
    supportedLocationLabels: params.supportedLocationLabels?.length
      ? params.supportedLocationLabels
      : cities.map((c) => (locale === "en" ? c.displayNameEn : c.displayNameTr)),
  });
  cityCard.message = reply;

  return {
    reply,
    type: "city_selection",
    citySelectionCard: cityCard,
    sessionContext: next,
  };
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

/** Canonical branch when treatment cannot be mapped — never invent dental. */
export const UNKNOWN_TREATMENT_BRANCH = "unknown";

export function normalizeTreatmentBranch(rawCategory?: string | null): string {
  if (!rawCategory || !String(rawCategory).trim()) return UNKNOWN_TREATMENT_BRANCH;
  const lower = String(rawCategory)
    .toLocaleLowerCase("tr-TR")
    .replace(/\u0307/g, "")
    .normalize("NFC")
    .trim();

  if (
    lower.includes("diş") ||
    /\bdis\b/.test(lower) ||
    lower.includes("dental") ||
    lower.includes("implant") ||
    lower.includes("zirkon") ||
    lower.includes("smile") ||
    lower.includes("all-on-4") ||
    lower.includes("all on 4") ||
    lower.includes("allon4") ||
    lower === "crown" ||
    lower === "veneers" ||
    lower.includes("veneer") ||
    lower === "tooth_extraction" ||
    lower === "denture"
  ) {
    return "dental";
  }
  if (lower.includes("ivf") || lower.includes("tüp") || lower.includes("tup") || lower.includes("fertility")) {
    return "ivf";
  }
  if (lower.includes("kardiyo") || lower.includes("cardio") || lower.includes("kalp") || lower.includes("heart")) {
    return "cardiology";
  }
  if (lower.includes("check") || lower.includes("sağlık tarama") || lower.includes("saglik tarama") || lower.includes("kontrol")) {
    return "check_up";
  }
  if (
    lower.includes("göz") ||
    lower.includes("goz") ||
    lower.includes("eye") ||
    lower.includes("lasik") ||
    lower.includes("lazer") ||
    lower.includes("katarakt") ||
    lower.includes("blepharo")
  ) {
    return "eye_treatments";
  }
  if (
    lower.includes("saç") ||
    lower.includes("sac") ||
    lower.includes("hair") ||
    lower.includes("fue") ||
    lower.includes("dhi")
  ) {
    return "hair_transplant";
  }
  if (
    lower.includes("estetik") ||
    lower.includes("estetigi") ||
    lower.includes("aesthetic") ||
    lower.includes("plastic_surgery") ||
    lower.includes("plastik") ||
    lower.includes("rino") ||
    lower.includes("burun") ||
    lower.includes("botoks") ||
    lower.includes("botox") ||
    lower.includes("dolgu") ||
    lower.includes("lipo") ||
    lower.includes("meme") ||
    lower.includes("popo") ||
    lower.includes("kalça") ||
    lower.includes("kalca") ||
    lower.includes("bbl") ||
    lower.includes("breast") ||
    lower.includes("butt") ||
    lower.includes("augmentation") ||
    lower.includes("göğüs") ||
    lower.includes("gogus") ||
    lower.includes("rhinoplast") ||
    lower.includes("reconstructive")
  ) {
    return "aesthetic_surgery";
  }
  if (lower.includes("obez") || lower.includes("bariatrik") || lower.includes("tüp mide") || lower.includes("tup mide")) {
    return "obesity";
  }
  // Known branch keys pass through; anything else is unsupported — never dental.
  const knownBranches = new Set([
    "dental",
    "ivf",
    "cardiology",
    "check_up",
    "eye_treatments",
    "hair_transplant",
    "aesthetic_surgery",
    "obesity",
  ]);
  if (knownBranches.has(lower)) return lower;
  return UNKNOWN_TREATMENT_BRANCH;
}

// ─── Curated Clinics Filter & Rank ──────────────────────────────────────────

function clinicIdentityKeys(clinic: any): string[] {
  return [
    clinic?.id,
    clinic?.clinicId,
    clinic?.clinicSlug,
    clinic?.slug,
    clinic?.stableKey,
  ]
    .map((v) => String(v || "").toLowerCase().trim())
    .filter(Boolean);
}

function matchClinicByCuratedTarget(availableClinics: any[], target: CuratedClinicTarget): any | null {
  const wantedId = target.slugOrId.toLowerCase();
  const aliasSet = new Set((target.aliasPatterns || []).map((p) => p.toLowerCase().trim()));

  // Prefer canonical id / slug — never loose name similarity when an ID exists.
  const byId = availableClinics.find((c) => clinicIdentityKeys(c).includes(wantedId));
  if (byId) return byId;

  const byAlias = availableClinics.find((c) =>
    clinicIdentityKeys(c).some((key) => aliasSet.has(key))
  );
  if (byAlias) return byAlias;

  // Last resort: exact clinic name only (not substring), for legacy records.
  const wantedName = target.name.toLowerCase();
  const wantedAliases = new Set([wantedName, ...aliasSet]);
  return (
    availableClinics.find((c) => {
      const name = String(c.clinicName || c.displayNameTr || c.displayNameEn || "").toLowerCase().trim();
      return name && wantedAliases.has(name);
    }) || null
  );
}

function buildSyntheticCuratedClinic(
  target: CuratedClinicTarget,
  locationRule: CuratedLocationRule
): any {
  return {
    id: target.slugOrId,
    clinicSlug: target.slugOrId,
    clinicName: target.name,
    status: "active",
    location: {
      city: locationRule.displayNameTr,
      district: target.district || "",
      address: target.address || target.district || "",
    },
    supportedLanguages: ["tr", "en"],
    _syntheticFromCuratedAllowlist: true,
  };
}

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
    return {
      matchingCuratedClinics: [],
      allEligibleClinics: [],
      locationRule: null,
      isUnsupportedLocation: false,
      supportedLocationsForBranch: [],
    };
  }

  // Find location rule matching city and side. Never invent a city — callers must
  // ask for a city selection when none is known.
  if (!city) {
    return {
      matchingCuratedClinics: [],
      allEligibleClinics: [],
      locationRule: null,
      isUnsupportedLocation: false,
      supportedLocationsForBranch: branchRule.locations,
    };
  }

  const cityLower = city.toLowerCase();
  const matchedLocRule: CuratedLocationRule | null =
    branchRule.locations.find((l) => {
      if (l.city !== cityLower) return false;
      if (side && side !== "any" && side !== "unsure" && l.side && l.side !== "any") {
        return l.side === side;
      }
      return true;
    }) || null;

  if (!matchedLocRule) {
    // User specified a city where this branch has no curated clinics
    return {
      matchingCuratedClinics: [],
      allEligibleClinics: [],
      locationRule: null,
      isUnsupportedLocation: true,
      supportedLocationsForBranch: branchRule.locations,
    };
  }

  // Visible recommendations = curated allowlist only, in configured order, max 2.
  const curatedTargets = matchedLocRule.curatedClinics;
  const matchingCuratedClinics: any[] = [];

  for (const target of curatedTargets) {
    if (matchingCuratedClinics.length >= FEELINHEALTHY_CONFIG.maxGuestClinics) break;

    const found = matchClinicByCuratedTarget(availableClinics, target);
    if (found) {
      if (!matchingCuratedClinics.some((e) => e.id === found.id)) {
        matchingCuratedClinics.push(found);
      }
      continue;
    }

    // When the agency clinic collection is unavailable/empty, still surface the
    // canonical curated allowlist so the demo can complete the matching step.
    if (availableClinics.length === 0) {
      matchingCuratedClinics.push(buildSyntheticCuratedClinic(target, matchedLocRule));
    }
  }

  // Additional eligible clinics (for "more quotes" count only — never rendered for guests).
  const allEligibleClinics = [...matchingCuratedClinics];
  for (const c of availableClinics) {
    if (allEligibleClinics.some((e) => e.id === c.id)) continue;
    const cCity = (c.location?.city || "").toLowerCase();
    const cCats = (c.treatmentCategories || []).map((t: string) => t.toLowerCase());
    if (cCats.includes(branchKey) && (!matchedLocRule.city || cCity.includes(matchedLocRule.city))) {
      allEligibleClinics.push(c);
    }
  }

  return {
    matchingCuratedClinics,
    allEligibleClinics,
    locationRule: matchedLocRule,
    isUnsupportedLocation: false,
    supportedLocationsForBranch: branchRule.locations,
  };
}

/**
 * Single readiness gate for FeelinHealthy clinic matching.
 * Matching must not run until consent, intake, treatment and location are complete.
 */
export function isReadyForClinicMatching(context: {
  quoteConsent?: boolean | null;
  consentStatus?: string | null;
  lastTreatmentCategory?: string | null;
  treatmentId?: string | null;
  patientName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  patientGender?: string | null;
  gender?: string | null;
  patientAge?: number | string | null;
  age?: number | string | null;
  patientEmail?: string | null;
  patientPhone?: string | null;
  patientCountry?: string | null;
  travelDate?: string | null;
  travelDateStart?: string | null;
  travelDateText?: string | null;
  selectedCity?: string | null;
  lastLocation?: string | null;
  istanbul_side?: string | null;
  sideSelectionConfirmed?: boolean;
  locationSelectionConfirmed?: boolean;
}): { ready: boolean; missing: string[] } {
  const missing: string[] = [];

  const consentOk =
    context.quoteConsent === true ||
    context.consentStatus === "accepted" ||
    context.consentStatus === "accept";
  if (!consentOk) missing.push("consent");

  const treatment = getAgencyTreatmentContext(context).category;
  if (!treatment) missing.push("treatment");

  const intake = evaluateFeelinHealthyIntake(context);
  if (!intake.group1Complete) missing.push("intake_group1");
  if (!intake.group2Complete) missing.push("intake_group2");
  if (!intake.group3Complete) missing.push("intake_group3");

  const location = decideFeelinHealthyLocationNextStep(context, [], "tr");
  if (location.step === "ask_treatment") missing.push("treatment");
  if (location.step === "ask_city") missing.push("city");
  if (location.step === "ask_side") missing.push("istanbul_side");

  // Deduplicate while preserving order.
  const uniqueMissing = Array.from(new Set(missing));
  return { ready: uniqueMissing.length === 0, missing: uniqueMissing };
}

export function getClinicMatchingReadyReply(locale: string = "tr", clinicCount: number = 2): string {
  const isEn = locale.toLowerCase().startsWith("en");
  if (clinicCount <= 0) {
    return isEn
      ? "There is no healthcare provider we can show directly for these criteria. If you like, we can review a nearby area together."
      : "Bu kriterlerde doğrudan gösterebileceğimiz bir sağlık kuruluşu bulunmuyor. Dilerseniz yakın bir bölgeyi birlikte değerlendirebiliriz.";
  }
  if (clinicCount === 1) {
    return isEn
      ? "Thank you. I’ve prepared one healthcare provider that matches your preferences."
      : "Teşekkürler. Tercihlerinize uygun bir sağlık kuruluşunu hazırladım.";
  }
  return isEn
    ? "Thank you. I’ve prepared two healthcare providers that match your preferences."
    : "Teşekkürler. Tercihlerinize uygun iki sağlık kuruluşunu hazırladım.";
}

/**
 * Production-safe matching diagnostics — IDs and counts only, never patient PII.
 */
export function buildFeelinHealthyMatchingDiagnostics(input: {
  agencyId?: string;
  treatmentBranch?: string | null;
  treatmentId?: string | null;
  city?: string | null;
  istanbulSide?: string | null;
  linkedClinicIds?: string[];
  activeClinicIds?: string[];
  treatmentMatchedIds?: string[];
  cityMatchedIds?: string[];
  sideMatchedIds?: string[];
  curatedMatchedIds?: string[];
  finalIds?: string[];
}): Record<string, unknown> {
  const ids = (arr?: string[]) => (arr || []).filter(Boolean);
  return {
    agencyId: input.agencyId || "feelinhealthy",
    treatmentBranch: input.treatmentBranch || null,
    treatmentId: input.treatmentId || null,
    city: input.city || null,
    istanbulSide: input.istanbulSide || null,
    linkedCount: ids(input.linkedClinicIds).length,
    activeCount: ids(input.activeClinicIds).length,
    treatmentCount: ids(input.treatmentMatchedIds).length,
    cityCount: ids(input.cityMatchedIds).length,
    sideCount: ids(input.sideMatchedIds).length,
    curatedCount: ids(input.curatedMatchedIds).length,
    linkedClinicIds: ids(input.linkedClinicIds),
    activeClinicIds: ids(input.activeClinicIds),
    treatmentMatchedIds: ids(input.treatmentMatchedIds),
    cityMatchedIds: ids(input.cityMatchedIds),
    sideMatchedIds: ids(input.sideMatchedIds),
    curatedMatchedIds: ids(input.curatedMatchedIds),
    finalClinicIds: ids(input.finalIds),
  };
}

export function logFeelinHealthyMatchingDiagnostics(payload: Record<string, unknown>): void {
  try {
    console.info("[feelinhealthy-matching]", JSON.stringify(payload));
  } catch {
    // never throw from diagnostics
  }
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
  // Group 1 (Personal): first name AND surname, age, gender.
  // A single token is not enough — the surname must never be skipped.
  const nameParts = String(context.patientName || context.fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const hasName =
    nameParts.length >= 2 || Boolean(context.firstName && context.lastName);
  const hasAge = (context.patientAge !== undefined && context.patientAge !== null && Number(context.patientAge) > 0) ||
                 (context.age !== undefined && context.age !== null && Number(context.age) > 0);
  const hasGender = Boolean(context.patientGender || context.gender);
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

  // Group 3 (Travel Plan): canonical travel date (incl. legacy aliases).
  const hasTravelDate = Boolean(getAgencyTravelDate(context));
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

/**
 * Static, international placeholder examples for intake helper text.
 * These MUST never be derived from conversation state, slots, or patient data.
 */
const GROUP1_EXAMPLE_POOL = [
  { tr: "John Smith, Erkek, 42", en: "John Smith, Male, 42" },
  { tr: "Emma Johnson, Kadın, 35", en: "Emma Johnson, Female, 35" },
] as const;

const GROUP2_EXAMPLE = {
  tr: "john.smith@email.com, +44 7700 900123, United Kingdom",
  en: "john.smith@email.com, +44 7700 900123, United Kingdom",
} as const;

const GROUP3_EXAMPLE = {
  tr: "Ekim 2026 veya 15 Ekim 2026",
  en: "October 2026 or 15 October 2026",
} as const;

/** Picks a predefined Group 1 example. Never uses patient or session data. */
export function pickStaticGroup1Example(locale: string = "tr"): string {
  const isEn = locale.toLowerCase().startsWith("en");
  const pick = GROUP1_EXAMPLE_POOL[Math.floor(Math.random() * GROUP1_EXAMPLE_POOL.length)];
  return isEn ? pick.en : pick.tr;
}

export function getGroupIntakePrompt(
  status: IntakeGroupStatus,
  context: any,
  locale: string = "tr"
): string {
  const isEn = locale.toLowerCase().startsWith("en");
  const missing = status.missingFieldsInCurrentGroup;

  if (status.currentGroup === 1) {
    const example = pickStaticGroup1Example(locale);
    const name = context.patientName ? String(context.patientName).split(" ")[0] : "";
    const greetingTr = name ? `Teşekkür ederim ${name}. ` : "";
    const greetingEn = name ? `Thank you, ${name}. ` : "";

    // Ask only for what is still missing — patients need not restate everything.
    if (missing.length > 0 && missing.length < 3) {
      const partsTr: string[] = [];
      const partsEn: string[] = [];
      if (missing.includes("patientName")) {
        partsTr.push("adınızı ve soyadınızı");
        partsEn.push("your first and last name");
      }
      if (missing.includes("patientGender")) {
        partsTr.push("cinsiyetinizi");
        partsEn.push("your gender");
      }
      if (missing.includes("patientAge")) {
        partsTr.push("yaşınızı");
        partsEn.push("your age");
      }
      return isEn
        ? `${greetingEn}Could you share ${partsEn.join(" and ")}? Any natural wording is fine.`
        : `${greetingTr}${partsTr.join(" ve ")} paylaşabilir misiniz? Nasıl yazarsanız yazın, yeterli.`;
    }

    return isEn
      ? `Could you share your first name, surname, gender and age? Any natural wording is fine — for example: "${example}".`
      : `Adınızı, soyadınızı, cinsiyetinizi ve yaşınızı paylaşabilir misiniz? Nasıl yazarsanız yazın yeterli — isterseniz örnek: "${example}".`;
  }

  if (status.currentGroup === 2) {
    const name = context.patientName ? context.patientName.split(" ")[0] : "";
    const greetingTr = name ? `Teşekkürler ${name}. ` : "";
    const greetingEn = name ? `Thank you, ${name}. ` : "";
    const example = isEn ? GROUP2_EXAMPLE.en : GROUP2_EXAMPLE.tr;

    if (missing.length === 3) {
      return isEn
        ? `${greetingEn}Could you share your email, phone number and the country (or city) you live in? Natural wording is fine — e.g. ${example}.`
        : `${greetingTr}E-posta, telefon ve yaşadığınız ülke (veya şehir) bilgisini paylaşabilir misiniz? Nasıl yazarsanız yazın yeterli — isterseniz: ${example}.`;
    }

    const partsTr: string[] = [];
    const partsEn: string[] = [];
    if (missing.includes("patientEmail")) {
      partsTr.push("e-posta adresinizi");
      partsEn.push("your email address");
    }
    if (missing.includes("patientPhone")) {
      partsTr.push("telefon numaranızı");
      partsEn.push("your phone number");
    }
    if (missing.includes("patientCountry")) {
      partsTr.push("yaşadığınız ülkeyi veya şehri");
      partsEn.push("the country or city you live in");
    }

    return isEn
      ? `${greetingEn}Could you share ${partsEn.join(" and ")}? A short natural answer is enough.`
      : `${greetingTr}${partsTr.join(" ve ")} paylaşabilir misiniz? Kısa ve doğal bir cevap yeterli.`;
  }

  if (status.currentGroup === 3) {
    return isEn
      ? `When are you thinking of travelling for treatment? An approximate period is fine — e.g. next month, this summer, or ${GROUP3_EXAMPLE.en}.`
      : `Tedavi için ne zaman gelmeyi düşünüyorsunuz? Yaklaşık bir dönem yeterli — örneğin önümüzdeki ay, bu yaz veya ${GROUP3_EXAMPLE.tr}.`;
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
  const shown = Math.max(1, displayedCount || FEELINHEALTHY_CONFIG.maxGuestClinics || 2);

  return {
    additionalCount,
    hasConversionOffer: additionalCount > 0,
    conversionMessage: isEn
      ? `The FeelinHealthy AI assistant is currently showing ${shown} clinic suggestions from our partner network for your treatment. Create a free account to request quotes from all matching providers and compare your options.`
      : `FeelinHealthy yapay zeka asistanı, tedavinize uygun anlaşmalı kliniklerden şu an ${shown} öneri sunuyor. Tüm uygun sağlık kuruluşlarından teklif alıp seçenekleri karşılaştırmak için ücretsiz üye olabilirsiniz.`,
    ctaText: isEn ? "Get More Quotes" : "Daha Fazla Teklif Al",
    registrationUrl: FEELINHEALTHY_CONFIG.registrationUrl,
  };
}
