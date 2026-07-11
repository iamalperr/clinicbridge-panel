/**
 * intentParser.ts
 *
 * Client-side intent detection from user chat messages.
 * Extracts treatment, location, budget, clinic name, and question type.
 */

export type IntentType =
  | "matching"          // user wants clinic recommendations
  | "clinic_question"   // user asks about a specific clinic
  | "pricing_question"  // user asks about pricing
  | "doctor_question"   // user asks about doctors
  | "general";          // generic / greeting

export interface ParsedIntent {
  type: IntentType;
  treatmentCategory?: string;
  subTreatment?: string;
  location?: string;
  budgetAmount?: number;
  budgetCurrency?: string;
  clinicName?: string;
  language: "tr" | "en";
  raw: string;
}

export interface SessionContext {
  lastTreatmentCategory?: string;
  lastSubTreatment?: string;
  lastLocation?: string;
  lastRecommendedClinicIds?: string[];
  lastFocusedClinicId?: string;
  lastFocusedClinicName?: string;
}

// ─── Keyword Maps ───────────────────────────────────────────────────────────

const TREATMENT_KEYWORDS: Record<string, { category: string; sub?: string }> = {
  // Dental
  "implant": { category: "dental", sub: "Dental Implant" },
  "diş implant": { category: "dental", sub: "Dental Implant" },
  "dental implant": { category: "dental", sub: "Dental Implant" },
  "all-on-4": { category: "dental", sub: "All-on-4 Diş İmplantları" },
  "all on 4": { category: "dental", sub: "All-on-4 Diş İmplantları" },
  "all-on-6": { category: "dental", sub: "All-on-6 Diş İmplantları" },
  "all on 6": { category: "dental", sub: "All-on-6 Diş İmplantları" },
  "zirkonyum": { category: "dental", sub: "Zirkonyum Taç" },
  "zirconium": { category: "dental", sub: "Zirkonyum Taç" },
  "kaplama": { category: "dental", sub: "Zirkonyum Taç" },
  "crown": { category: "dental", sub: "Zirkonyum Taç" },
  "e-max": { category: "dental", sub: "E-Max Taç" },
  "emax": { category: "dental", sub: "E-Max Taç" },
  "hollywood": { category: "dental", sub: "Hollywood Gülümsemesi" },
  "hollywood smile": { category: "dental", sub: "Hollywood Gülümsemesi" },
  "beyazlatma": { category: "dental", sub: "Diş Beyazlatma" },
  "whitening": { category: "dental", sub: "Diş Beyazlatma" },
  "diş": { category: "dental" },
  "dental": { category: "dental" },
  "dişçi": { category: "dental" },
  "dentist": { category: "dental" },
  // Hair
  "saç ekimi": { category: "hair_transplant", sub: "FUE Saç Ekimi" },
  "saç": { category: "hair_transplant" },
  "hair transplant": { category: "hair_transplant" },
  "fue": { category: "hair_transplant", sub: "FUE Saç Ekimi" },
  "dhi": { category: "hair_transplant", sub: "DHI Saç Ekimi" },
  "sakal ekimi": { category: "hair_transplant", sub: "Sakal Ekimi" },
  "beard": { category: "hair_transplant", sub: "Sakal Ekimi" },
  // Aesthetic
  "burun estetiği": { category: "aesthetic_surgery", sub: "Burun Estetiği" },
  "rhinoplasty": { category: "aesthetic_surgery", sub: "Burun Estetiği" },
  "burun": { category: "aesthetic_surgery", sub: "Burun Estetiği" },
  "estetik": { category: "aesthetic_surgery" },
  "aesthetic": { category: "aesthetic_surgery" },
  "liposuction": { category: "aesthetic_surgery", sub: "Liposuction" },
  "meme": { category: "aesthetic_surgery", sub: "Meme Büyütme" },
  "breast": { category: "aesthetic_surgery", sub: "Meme Büyütme" },
  // Eye
  "göz": { category: "eye_surgery" },
  "lazer göz": { category: "eye_surgery", sub: "Lazer Göz Ameliyatı" },
  "lasik": { category: "eye_surgery", sub: "LASIK" },
  "eye surgery": { category: "eye_surgery" },
  // IVF
  "tüp bebek": { category: "ivf", sub: "Tüp Bebek (IVF)" },
  "ivf": { category: "ivf" },
};

const LOCATION_KEYWORDS = [
  "istanbul", "İstanbul", "ankara", "antalya", "alanya", "izmir",
  "bursa", "bodrum", "fethiye", "muğla", "trabzon", "adana",
  "konya", "mersin", "lara", "konyaaltı", "şişli", "levent",
  "nişantaşı", "alsancak", "kadıköy", "beşiktaş", "taksim",
];

const CLINIC_QUESTION_KEYWORDS = [
  "nasıl bir klinik", "how is the clinic", "hakkında", "about",
  "nedir", "what is", "klinik bilgi", "clinic info",
  "hangi tedavi", "what treatments", "tedavileri", "treatments",
  "hizmetleri", "services", "overview", "genel bilgi",
  "ne tür", "what kind",
];

const PRICING_KEYWORDS = [
  "fiyat", "price", "ücret", "cost", "kaç para", "how much",
  "ne kadar", "bütçe", "budget", "maliyet", "fee",
];

const DOCTOR_KEYWORDS = [
  "doktor", "doctor", "hekim", "uzman", "specialist",
  "cerrah", "surgeon", "doktorlar", "doctors", "kadro",
  "ekip", "team",
];

const CONTEXT_REFS = [
  "bu klinik", "this clinic", "orası", "that place",
  "o klinik", "that clinic", "onlar", "they",
  "burası", "here",
];

// ─── Parser ─────────────────────────────────────────────────────────────────

export function parseIntent(
  input: string,
  context: SessionContext,
  knownClinicNames: string[]
): ParsedIntent {
  const raw = input.trim();
  const lower = raw.toLowerCase();

  // Detect language
  const trSignals = /[çğıöşü]|merhaba|istiyorum|nasıl|için|bütçe|tedavi|klinik|fiyat/i.test(raw);
  const language: "tr" | "en" = trSignals ? "tr" : "en";

  // 1. Check for specific clinic name references
  let clinicName: string | undefined;
  for (const name of knownClinicNames) {
    if (lower.includes(name.toLowerCase())) {
      clinicName = name;
      break;
    }
  }

  // Check context references ("bu klinik", "this clinic")
  if (!clinicName) {
    for (const ref of CONTEXT_REFS) {
      if (lower.includes(ref) && context.lastFocusedClinicName) {
        clinicName = context.lastFocusedClinicName;
        break;
      }
    }
  }

  // 2. Detect intent type
  const isDoctor = DOCTOR_KEYWORDS.some((k) => lower.includes(k));
  const isPricing = PRICING_KEYWORDS.some((k) => lower.includes(k));
  const isClinicQ = CLINIC_QUESTION_KEYWORDS.some((k) => lower.includes(k));

  // 3. Extract treatment
  let treatmentCategory: string | undefined;
  let subTreatment: string | undefined;

  // Sort keywords by length descending to match longer phrases first
  const sortedKeys = Object.keys(TREATMENT_KEYWORDS).sort((a, b) => b.length - a.length);
  for (const keyword of sortedKeys) {
    if (lower.includes(keyword)) {
      const match = TREATMENT_KEYWORDS[keyword];
      treatmentCategory = match.category;
      if (match.sub) subTreatment = match.sub;
      break;
    }
  }

  // 4. Extract location
  let location: string | undefined;
  for (const loc of LOCATION_KEYWORDS) {
    if (lower.includes(loc.toLowerCase())) {
      location = loc.charAt(0).toUpperCase() + loc.slice(1);
      break;
    }
  }

  // 5. Extract budget
  let budgetAmount: number | undefined;
  let budgetCurrency: string | undefined;
  const budgetMatch = raw.match(/(\d[\d.,]*)\s*(eur|euro|€|usd|dolar|\$|gbp|£|tl|try)/i);
  if (budgetMatch) {
    budgetAmount = parseFloat(budgetMatch[1].replace(/[.,]/g, ""));
    const cur = budgetMatch[2].toLowerCase();
    if (["eur", "euro", "€"].includes(cur)) budgetCurrency = "EUR";
    else if (["usd", "dolar", "$"].includes(cur)) budgetCurrency = "USD";
    else if (["gbp", "£"].includes(cur)) budgetCurrency = "GBP";
    else if (["tl", "try"].includes(cur)) budgetCurrency = "TRY";
  }

  // 6. Determine intent type
  let type: IntentType = "general";

  if (clinicName && isDoctor) {
    type = "doctor_question";
  } else if (clinicName && isPricing) {
    type = "pricing_question";
  } else if (isPricing && (subTreatment || treatmentCategory)) {
    type = "pricing_question";
  } else if (clinicName && isClinicQ) {
    type = "clinic_question";
  } else if (clinicName && !treatmentCategory && !isPricing) {
    type = "clinic_question";
  } else if (treatmentCategory || location || budgetAmount) {
    type = "matching";
  } else if (isDoctor && context.lastFocusedClinicName) {
    type = "doctor_question";
    clinicName = context.lastFocusedClinicName;
  }

  // Fall back to context for treatment/location if not in current message
  if (!treatmentCategory && context.lastTreatmentCategory) treatmentCategory = context.lastTreatmentCategory;
  if (!location && context.lastLocation) location = context.lastLocation;

  return {
    type,
    treatmentCategory,
    subTreatment,
    location,
    budgetAmount,
    budgetCurrency,
    clinicName,
    language,
    raw,
  };
}
