/**
 * feelinhealthyConfig.ts
 *
 * Central configuration and business rules for FeelinHealthy agency portal:
 * 1. 3-Group Lead Intake Flow (Personal, Contact & Country, Travel Plan) - No Budget.
 * 2. Curated Clinic Matrix by Branch and Location/Side.
 * 3. Guest Clinic Limit (max 2 clinics) and Additional Count Calculator.
 * 4. Location Expansion Negotiation for Unsupported Branch/Location Combinations.
 * 5. Registration Conversion CTA and KVKK Privacy Notice Config.
 */

export interface CuratedLocationRule {
  city: string; // e.g. "istanbul", "izmir", "antalya", "ankara"
  side?: "anatolian" | "european" | "any";
  displayNameTr: string;
  displayNameEn: string;
  curatedClinics: Array<{
    name: string;
    slugOrId: string;
    aliasPatterns?: string[];
  }>;
}

export interface CuratedBranchRule {
  branchKey: string;
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
          { name: "İstanbul Diş Akademisi", slugOrId: "istanbul-dis-akademisi", aliasPatterns: ["istanbul diş akademisi", "istanbul dis akademisi", "istanbul dental academy"] },
          { name: "Hospitadent Çamlıca", slugOrId: "hospitadent-camlica", aliasPatterns: ["hospitadent çamlıca", "hospitadent camlica", "çamlıca hospitadent"] },
          { name: "Hospitadent Şerifali", slugOrId: "hospitadent-serifali", aliasPatterns: ["hospitadent şerifali", "hospitadent serifali"] },
          { name: "Hospitadent Pendik", slugOrId: "hospitadent-pendik", aliasPatterns: ["hospitadent pendik", "pendik hospitadent"] },
          { name: "Beyaz Işık Sancaktepe", slugOrId: "beyazisik-sancaktepe", aliasPatterns: ["beyaz ışık sancaktepe", "beyazisik sancaktepe"] },
        ],
      },
      {
        city: "istanbul",
        side: "european",
        displayNameTr: "İstanbul Avrupa Yakası",
        displayNameEn: "Istanbul European Side",
        curatedClinics: [
          { name: "Hospitadent Mecidiyeköy", slugOrId: "hospitadent-mecidiyekoy", aliasPatterns: ["hospitadent mecidiyeköy", "hospitadent mecidiyekoy", "mecidiyeköy hospitadent"] },
          { name: "Hospitadent Cevizlibağ", slugOrId: "hospitadent-cevizlibag", aliasPatterns: ["hospitadent cevizlibağ", "hospitadent cevizlibag", "cevizlibağ hospitadent", "cevizlibag hospitadent"] },
          { name: "Hospitadent Bakırköy", slugOrId: "hospitadent-bakirkoy", aliasPatterns: ["hospitadent bakırköy", "hospitadent bakirkoy"] },
          { name: "Hospitadent Göktürk", slugOrId: "hospitadent-gokturk", aliasPatterns: ["hospitadent göktürk", "hospitadent gokturk", "göktürk hospitadent"] },
          { name: "BHT Clinic İstanbul TEMA Hospital", slugOrId: "bht-clinic-istanbul-tema", aliasPatterns: ["bht clinic", "bht tema", "bht clinic istanbul tema hospital", "bht"] },
          { name: "Hospitadent Bağcılar", slugOrId: "hospitadent-bagcilar", aliasPatterns: ["hospitadent bağcılar", "hospitadent bagcilar"] },
          { name: "Hospitadent Fatih", slugOrId: "hospitadent-fatih", aliasPatterns: ["hospitadent fatih", "hospitadent dental group fatih"] },
        ],
      },
      {
        city: "izmir",
        side: "any",
        displayNameTr: "İzmir",
        displayNameEn: "Izmir",
        curatedClinics: [
          { name: "Westdent Clinic", slugOrId: "westdent-clinic", aliasPatterns: ["westdent", "westdent clinic", "westdent izmir"] },
          { name: "Beyaz Işık İzmir Dental Group", slugOrId: "beyazisik-izmir-dental-group", aliasPatterns: ["beyaz ışık izmir", "beyazisik izmir", "beyaz ışık izmir dental group", "beyazisik-izmir"] },
        ],
      },
      {
        city: "antalya",
        side: "any",
        displayNameTr: "Antalya",
        displayNameEn: "Antalya",
        curatedClinics: [
          { name: "Hospitadent Antalya", slugOrId: "hospitadent-antalya", aliasPatterns: ["hospitadent antalya", "antalya hospitadent"] },
          { name: "Memorial Antalya", slugOrId: "memorial-hospital", aliasPatterns: ["memorial antalya", "memorial hospital antalya", "memorial"] },
          { name: "Hospitadent Alanya", slugOrId: "hospitadent-alanya", aliasPatterns: ["hospitadent alanya", "alanya hospitadent"] },
        ],
      },
      {
        city: "ankara",
        side: "any",
        displayNameTr: "Ankara",
        displayNameEn: "Ankara",
        curatedClinics: [
          { name: "Hospitadent Ankara", slugOrId: "hospitadent-ankara", aliasPatterns: ["hospitadent ankara", "ankara hospitadent"] },
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
        side: "european",
        displayNameTr: "İstanbul Avrupa Yakası",
        displayNameEn: "Istanbul European Side",
        curatedClinics: [
          { name: "Intermed Nişantaşı", slugOrId: "intermed-nisantasi", aliasPatterns: ["intermed", "intermed nişantaşı", "intermed nisantasi"] },
          { name: "Memorial Bahçelievler Hastanesi", slugOrId: "memorial-hospital", aliasPatterns: ["memorial", "memorial bahçelievler", "memorial bahcelievler"] },
          { name: "BHT Clinic İstanbul TEMA Hospital", slugOrId: "bht-clinic-istanbul-tema", aliasPatterns: ["bht clinic", "bht tema"] },
        ],
      },
      {
        city: "istanbul",
        side: "anatolian",
        displayNameTr: "İstanbul Anadolu Yakası",
        displayNameEn: "Istanbul Anatolian Side",
        curatedClinics: [
          { name: "Anadolu Medical Center", slugOrId: "anadolu-medical-center", aliasPatterns: ["anadolu medical center", "anadolu sağlık merkezi", "anadolu saglik merkezi", "anadolu"] },
          { name: "Memorial Ataşehir Hastanesi", slugOrId: "memorial-hospital", aliasPatterns: ["memorial ataşehir", "memorial atasehir"] },
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
        city: "kocaeli",
        side: "any",
        displayNameTr: "Kocaeli / Gebze",
        displayNameEn: "Kocaeli / Gebze",
        curatedClinics: [
          { name: "Anadolu Medical Center", slugOrId: "anadolu-medical-center", aliasPatterns: ["anadolu medical center", "anadolu sağlık merkezi", "anadolu saglik merkezi", "anadolu"] },
        ],
      },
      {
        city: "istanbul",
        side: "european",
        displayNameTr: "İstanbul Avrupa Yakası",
        displayNameEn: "Istanbul European Side",
        curatedClinics: [
          { name: "Memorial Bahçelievler Hastanesi", slugOrId: "memorial-hospital", aliasPatterns: ["memorial", "memorial bahçelievler", "memorial bahcelievler"] },
          { name: "BHT Clinic İstanbul TEMA Hospital", slugOrId: "bht-clinic-istanbul-tema", aliasPatterns: ["bht clinic", "bht tema"] },
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
        side: "european",
        displayNameTr: "İstanbul Avrupa Yakası",
        displayNameEn: "Istanbul European Side",
        curatedClinics: [
          { name: "Intermed Nişantaşı", slugOrId: "intermed-nisantasi", aliasPatterns: ["intermed", "intermed nişantaşı", "intermed nisantasi"] },
          { name: "Memorial Bahçelievler Hastanesi", slugOrId: "memorial-hospital", aliasPatterns: ["memorial"] },
          { name: "BHT Clinic İstanbul TEMA Hospital", slugOrId: "bht-clinic-istanbul-tema", aliasPatterns: ["bht clinic", "bht tema"] },
        ],
      },
      {
        city: "kocaeli",
        side: "any",
        displayNameTr: "Kocaeli / Gebze",
        displayNameEn: "Kocaeli / Gebze",
        curatedClinics: [
          { name: "Anadolu Medical Center", slugOrId: "anadolu-medical-center", aliasPatterns: ["anadolu medical center", "anadolu sağlık merkezi", "anadolu saglik merkezi"] },
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
          { name: "Dünyagöz Etiler", slugOrId: "dunyagoz-etiler", aliasPatterns: ["dunyagoz etiler", "dünyagöz etiler", "dunyagoz"] },
          { name: "Dünyagöz Ataköy", slugOrId: "dunyagoz-atakoy", aliasPatterns: ["dunyagoz ataköy", "dünyagöz atakoy", "dunyagoz atakoy"] },
        ],
      },
      {
        city: "antalya",
        side: "any",
        displayNameTr: "Antalya",
        displayNameEn: "Antalya",
        curatedClinics: [
          { name: "Dünyagöz Antalya", slugOrId: "dunyagoz-antalya", aliasPatterns: ["dunyagoz antalya", "dünyagöz antalya"] },
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

const ANATOLIAN_KEYWORDS = [
  "anadolu", "anatolian", "asya", "asian",
  "kadikoy", "uskudar", "camlica", "pendik", "atasehir", "umraniye",
  "maltepe", "kartal", "serifali", "sancaktepe", "tuzla", "kocaeli", "gebze",
  "kurtkoy", "bostanci"
];

const EUROPEAN_KEYWORDS = [
  "avrupa", "european",
  "mecidiyekoy", "sisli", "bakirkoy", "atakoy", "kucukcekmece", "fatih",
  "bagcilar", "besiktas", "beylikduzu", "tema", "halkali", "etiler", "levent",
  "nisantasi", "bahcelievler", "gokturk", "cevizlibag", "zeytinburnu"
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

export function resolveCityAndSide(rawLocation?: string | null): {
  city: string | null;
  side: "anatolian" | "european" | "any" | null;
} {
  if (!rawLocation) return { city: null, side: null };
  const normalized = normalizeLocString(rawLocation);

  let city: string | null = null;
  if (normalized.includes("istanbul")) city = "istanbul";
  else if (normalized.includes("izmir")) city = "izmir";
  else if (normalized.includes("antalya")) city = "antalya";
  else if (normalized.includes("ankara")) city = "ankara";
  else if (normalized.includes("alanya")) city = "antalya";
  else if (normalized.includes("bodrum")) city = "bodrum";
  else if (normalized.includes("bursa")) city = "bursa";
  else if (normalized.includes("kocaeli") || normalized.includes("gebze")) city = "kocaeli";

  let side: "anatolian" | "european" | "any" | null = null;
  if (city === "istanbul" || !city) {
    if (ANATOLIAN_KEYWORDS.some(k => normalized.includes(k))) {
      side = "anatolian";
      if (!city) city = "istanbul";
    } else if (EUROPEAN_KEYWORDS.some(k => normalized.includes(k))) {
      side = "european";
      if (!city) city = "istanbul";
    }
  }

  return { city, side: side || (city ? "any" : null) };
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
  side?: "anatolian" | "european" | "any" | null,
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
      if (side && side !== "any" && l.side && l.side !== "any") {
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
