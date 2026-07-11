/**
 * clinicMatcher.ts
 *
 * Scoring-based clinic matching engine.
 * Ranks clinics by treatment, sub-treatment, location, budget, and language fit.
 */

import type { ParsedIntent } from "./intentParser";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ClinicPricingItem {
  id?: string;
  subTreatmentName?: string;
  treatmentName?: string;
  priceGroup?: string;
  priceMin: number;
  priceMax: number;
  currency: string;
  priceType?: string;
  duration?: string;
  clinicId?: string;
  clinicName?: string;
}

export interface MatchedPrice {
  subTreatmentName: string;
  priceMin: number;
  priceMax: number;
  currency: string;
  priceType: string;
  duration: string;
}

export interface ClinicRecommendation {
  clinicId: string;
  clinicName: string;
  clinicSlug: string;
  clinicType: string;
  location: string;
  rating: number;
  reviews: number;
  matchScore: number;
  matchedTreatment: string;
  matchedSubTreatment: string;
  matchedPrices: MatchedPrice[];
  supportedLanguages: string[];
  reason: string;
  profilePath: string;
  accommodation: boolean;
  transfer: boolean;
  shortDescription: string;
}

export interface DemoClinicInput {
  id: string;
  name: string;
  clinicSlug: string;
  type: { tr: string; en: string };
  location: string;
  rating: number;
  reviews: number;
  languages: string[];
  accommodation: boolean;
  transfer: boolean;
  specialties: { tr: string; en: string }[];
  shortDescription?: { tr: string; en: string };
  longDescription?: { tr: string; en: string };
  accreditations?: string[];
  services?: string[];
}

// ─── Matching Logic ─────────────────────────────────────────────────────────

const TREATMENT_CAT_MAP: Record<string, string[]> = {
  dental: ["diş", "dental", "implant", "kaplama", "crown", "beyazlatma", "whitening", "kanal", "root canal", "ortodonti"],
  hair_transplant: ["saç", "hair", "fue", "dhi", "sakal", "beard"],
  aesthetic_surgery: ["estetik", "aesthetic", "burun", "rhinoplasty", "liposuction", "meme", "breast", "karın", "tummy", "yüz", "facelift"],
  eye_surgery: ["göz", "eye", "lasik", "katarakt", "cataract", "lens"],
  ivf: ["tüp bebek", "ivf", "yumurta", "egg", "genetik"],
};

function clinicMatchesTreatment(clinic: DemoClinicInput, category?: string, subTreatment?: string): { catMatch: boolean; subMatch: boolean } {
  const typeStr = `${clinic.type.tr} ${clinic.type.en}`.toLowerCase();
  const specStr = clinic.specialties.map((s) => `${s.tr} ${s.en}`).join(" ").toLowerCase();
  const all = `${typeStr} ${specStr}`;

  let catMatch = false;
  let subMatch = false;

  if (category && TREATMENT_CAT_MAP[category]) {
    catMatch = TREATMENT_CAT_MAP[category].some((kw) => all.includes(kw));
  }

  if (subTreatment) {
    subMatch = all.includes(subTreatment.toLowerCase());
  }

  return { catMatch, subMatch };
}

function clinicMatchesLocation(clinic: DemoClinicInput, location?: string): boolean {
  if (!location) return false;
  return clinic.location.toLowerCase().includes(location.toLowerCase());
}

function findPricesForClinic(
  clinicId: string,
  clinicName: string,
  allPricing: ClinicPricingItem[],
  subTreatment?: string,
  category?: string
): MatchedPrice[] {
  // Filter prices belonging to this clinic
  const clinicPrices = allPricing.filter((p) =>
    p.clinicId === clinicId || (p.clinicName && p.clinicName.toLowerCase() === clinicName.toLowerCase())
  );

  if (clinicPrices.length === 0) return [];

  // If sub-treatment specified, try to find exact match first
  if (subTreatment) {
    const subLower = subTreatment.toLowerCase();
    const exact = clinicPrices.filter((p) =>
      (p.subTreatmentName || p.treatmentName || "").toLowerCase().includes(subLower)
    );
    if (exact.length > 0) {
      return exact.map(toMatchedPrice);
    }
  }

  // Return all prices for this clinic (up to 6)
  return clinicPrices.slice(0, 6).map(toMatchedPrice);
}

function toMatchedPrice(p: ClinicPricingItem): MatchedPrice {
  return {
    subTreatmentName: p.subTreatmentName || p.treatmentName || "—",
    priceMin: p.priceMin,
    priceMax: p.priceMax,
    currency: p.currency || "EUR",
    priceType: p.priceType || "package",
    duration: p.duration || "",
  };
}

// ─── Main Matcher ───────────────────────────────────────────────────────────

export function matchClinics(
  intent: ParsedIntent,
  clinics: DemoClinicInput[],
  allPricing: ClinicPricingItem[],
  maxResults: number = 3
): ClinicRecommendation[] {
  const scored: { clinic: DemoClinicInput; score: number; reasons: string[] }[] = [];

  for (const clinic of clinics) {
    let score = 0;
    const reasons: string[] = [];

    // Treatment match
    const { catMatch, subMatch } = clinicMatchesTreatment(clinic, intent.treatmentCategory, intent.subTreatment);
    if (subMatch) { score += 30; reasons.push(intent.language === "tr" ? `${intent.subTreatment} hizmeti sunuyor` : `Offers ${intent.subTreatment}`); }
    if (catMatch) { score += 40; }

    // No treatment match at all → skip
    if (!catMatch && !subMatch && intent.treatmentCategory) continue;

    // Location match
    if (clinicMatchesLocation(clinic, intent.location)) {
      score += 20;
      reasons.push(intent.language === "tr" ? `${intent.location} bölgesinde` : `Located in ${intent.location}`);
    }

    // Budget match
    const prices = findPricesForClinic(clinic.id, clinic.name, allPricing, intent.subTreatment, intent.treatmentCategory);
    if (intent.budgetAmount && prices.length > 0) {
      const minP = Math.min(...prices.map((p) => p.priceMin));
      if (minP <= intent.budgetAmount) {
        score += 15;
        reasons.push(intent.language === "tr" ? "Bütçenize uygun seçenekler mevcut" : "Options within your budget");
      }
    }

    // Language match
    if (intent.language === "tr" && clinic.languages.some((l) => l.toLowerCase() === "tr")) score += 5;
    if (intent.language === "en" && clinic.languages.some((l) => l.toLowerCase() === "en")) score += 5;
    if (clinic.languages.length >= 4) { score += 5; reasons.push(intent.language === "tr" ? "Çok dilli destek" : "Multilingual support"); }

    // Rating bonus
    if (clinic.rating >= 4.8) score += 5;

    if (score > 0) scored.push({ clinic, score, reasons });
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Build recommendations
  return scored.slice(0, maxResults).map(({ clinic, score, reasons }) => {
    const prices = findPricesForClinic(clinic.id, clinic.name, allPricing, intent.subTreatment, intent.treatmentCategory);
    return {
      clinicId: clinic.id,
      clinicName: clinic.name,
      clinicSlug: clinic.clinicSlug,
      clinicType: intent.language === "tr" ? clinic.type.tr : clinic.type.en,
      location: clinic.location,
      rating: clinic.rating,
      reviews: clinic.reviews,
      matchScore: Math.min(99, 70 + score),
      matchedTreatment: intent.treatmentCategory || "",
      matchedSubTreatment: intent.subTreatment || "",
      matchedPrices: prices,
      supportedLanguages: clinic.languages,
      reason: reasons.join(". ") + ".",
      profilePath: `/agency-demo/medicalcenter/${clinic.clinicSlug}`,
      accommodation: clinic.accommodation,
      transfer: clinic.transfer,
      shortDescription: (intent.language === "tr" ? clinic.shortDescription?.tr : clinic.shortDescription?.en) || "",
    };
  });
}

// ─── Find clinic by name ────────────────────────────────────────────────────

export function findClinicByName(
  name: string,
  clinics: DemoClinicInput[]
): DemoClinicInput | undefined {
  const lower = name.toLowerCase();
  return clinics.find((c) =>
    c.name.toLowerCase().includes(lower) ||
    lower.includes(c.name.toLowerCase().split(" ")[0])
  );
}
