/**
 * ClinicBridge AI — Canonical Specialization & Treatment Registry
 * 
 * Single source of truth for dental specialization codes, treatment codes,
 * and their multilingual synonym mappings.
 * 
 * Used by:
 * - Chat route (intent detection, doctor filtering, treatment-doctor mapping)
 * - Admin panel (dropdowns for specialization and treatment selection)
 * - Embedding/indexing (entity metadata)
 */

// ─── Specialization Registry ────────────────────────────────────────────────

export interface SpecializationEntry {
  code: string;
  labelTR: string;
  labelEN: string;
  synonymsTR: string[];
  synonymsEN: string[];
}

export const SPECIALIZATION_REGISTRY: SpecializationEntry[] = [
  {
    code: "periodontology",
    labelTR: "Periodontoloji",
    labelEN: "Periodontology",
    synonymsTR: ["diş eti uzmanı", "diş eti doktoru", "diş eti hastalıkları uzmanı", "periodontolog", "periodontoloji doktoru", "periodontoloji uzmanı", "diş eti", "dis eti"],
    synonymsEN: ["gum specialist", "gum disease specialist", "periodontist", "periodontology specialist", "gum disease"],
  },
  {
    code: "orthodontics",
    labelTR: "Ortodonti",
    labelEN: "Orthodontics",
    synonymsTR: ["ortodonti uzmanı", "ortodontist", "diş teli doktoru", "şeffaf plak doktoru", "çarpık diş", "tel tedavisi", "ortodonti doktoru"],
    synonymsEN: ["orthodontist", "braces doctor", "clear aligner doctor", "orthodontics specialist"],
  },
  {
    code: "endodontics",
    labelTR: "Endodonti",
    labelEN: "Endodontics",
    synonymsTR: ["endodonti uzmanı", "endodontist", "kanal tedavisi uzmanı", "kök kanal uzmanı", "kanal tedavisi", "endodonti doktoru"],
    synonymsEN: ["endodontist", "root canal specialist", "endodontics specialist"],
  },
  {
    code: "pediatric_dentistry",
    labelTR: "Pedodonti (Çocuk Diş Hekimliği)",
    labelEN: "Pediatric Dentistry",
    synonymsTR: ["pedodontist", "çocuk diş hekimi", "çocuk diş doktoru", "süt dişi doktoru", "çocuk diş", "pedodonti", "çocuk diş hekimliği"],
    synonymsEN: ["pediatric dentist", "children's dentist", "pedodontist"],
  },
  {
    code: "oral_maxillofacial_surgery",
    labelTR: "Ağız, Diş ve Çene Cerrahisi",
    labelEN: "Oral and Maxillofacial Surgery",
    synonymsTR: ["çene cerrahı", "çene cerrahisi uzmanı", "oral cerrah", "gömülü diş cerrahı", "ağız ve çene", "çene cerrah"],
    synonymsEN: ["oral surgeon", "maxillofacial surgeon", "oral and maxillofacial surgery specialist"],
  },
  {
    code: "prosthodontics",
    labelTR: "Protetik Diş Tedavisi",
    labelEN: "Prosthodontics",
    synonymsTR: ["protez uzmanı", "protetik diş", "protez doktoru", "protez", "protetik"],
    synonymsEN: ["prosthodontist", "denture specialist", "prosthodontics specialist"],
  },
  {
    code: "restorative_dentistry",
    labelTR: "Restoratif Diş Tedavisi",
    labelEN: "Restorative Dentistry",
    synonymsTR: ["restoratif", "dolgu uzmanı", "restoratif diş"],
    synonymsEN: ["restorative dentist", "restorative dentistry specialist"],
  },
  {
    code: "oral_diagnosis_radiology",
    labelTR: "Ağız, Diş ve Çene Radyolojisi",
    labelEN: "Oral Diagnosis and Radiology",
    synonymsTR: ["oral diagnoz", "ağız radyoloji", "diş radyoloji"],
    synonymsEN: ["oral radiology", "dental radiology"],
  },
];

// Flatten all synonyms into a lookup map: synonym → specialization code
export function findSpecializationCode(text: string): string | null {
  const lower = text.toLowerCase();
  for (const entry of SPECIALIZATION_REGISTRY) {
    const allSynonyms = [...entry.synonymsTR, ...entry.synonymsEN, entry.labelTR.toLowerCase(), entry.labelEN.toLowerCase(), entry.code];
    if (allSynonyms.some(syn => lower.includes(syn.toLowerCase()))) {
      return entry.code;
    }
  }
  return null;
}

export function getSpecializationLabel(code: string, lang: "tr" | "en" = "tr"): string {
  const entry = SPECIALIZATION_REGISTRY.find(e => e.code === code);
  if (!entry) return code;
  return lang === "tr" ? entry.labelTR : entry.labelEN;
}

// ─── Treatment Registry ─────────────────────────────────────────────────────

export interface TreatmentEntry {
  code: string;
  labelTR: string;
  labelEN: string;
  synonymsTR: string[];
  synonymsEN: string[];
}

export const TREATMENT_REGISTRY: TreatmentEntry[] = [
  {
    code: "dental_implant",
    labelTR: "Dental İmplant",
    labelEN: "Dental Implant",
    synonymsTR: ["implant", "implant tedavisi", "implant cerrahisi", "diş implantı", "dental implant"],
    synonymsEN: ["dental implant", "implant surgery", "implant treatment"],
  },
  {
    code: "root_canal_treatment",
    labelTR: "Kanal Tedavisi",
    labelEN: "Root Canal Treatment",
    synonymsTR: ["kanal tedavisi", "kök kanal", "kanal", "endodontik tedavi"],
    synonymsEN: ["root canal", "root canal treatment", "endodontic treatment"],
  },
  {
    code: "zirconium_crown",
    labelTR: "Zirkonyum Diş Kaplama",
    labelEN: "Zirconium Crown",
    synonymsTR: ["zirkonyum", "zirkonyum kaplama", "zirkonyum diş", "zirkonyum kron"],
    synonymsEN: ["zirconium", "zirconium crown", "zirconia crown"],
  },
  {
    code: "composite_bonding",
    labelTR: "Bonding (Kompozit Kaplama)",
    labelEN: "Composite Bonding",
    synonymsTR: ["bonding", "kompozit bonding", "bonding kaplama", "diş bonding"],
    synonymsEN: ["bonding", "composite bonding", "dental bonding"],
  },
  {
    code: "smile_design",
    labelTR: "Gülüş Tasarımı",
    labelEN: "Smile Design",
    synonymsTR: ["gülüş tasarımı", "hollywood smile", "dijital gülüş tasarımı", "gülüş estetiği"],
    synonymsEN: ["smile design", "hollywood smile", "digital smile design"],
  },
  {
    code: "teeth_whitening",
    labelTR: "Diş Beyazlatma",
    labelEN: "Teeth Whitening",
    synonymsTR: ["diş beyazlatma", "beyazlatma", "bleaching"],
    synonymsEN: ["teeth whitening", "bleaching", "whitening"],
  },
  {
    code: "orthodontic_treatment",
    labelTR: "Ortodonti Tedavisi",
    labelEN: "Orthodontic Treatment",
    synonymsTR: ["ortodonti tedavisi", "tel tedavisi", "şeffaf plak", "invisalign", "diş teli"],
    synonymsEN: ["orthodontic treatment", "braces", "clear aligners", "invisalign"],
  },
  {
    code: "laminate_veneer",
    labelTR: "Laminate Veneer",
    labelEN: "Laminate Veneer",
    synonymsTR: ["laminate", "lamina", "porselen laminate", "veneer"],
    synonymsEN: ["laminate veneer", "porcelain veneer", "veneer"],
  },
  {
    code: "pediatric_treatment",
    labelTR: "Çocuk Diş Tedavisi",
    labelEN: "Pediatric Dental Treatment",
    synonymsTR: ["çocuk diş tedavisi", "pedodonti tedavisi", "süt dişi tedavisi", "çocuk diş bakımı"],
    synonymsEN: ["pediatric dental treatment", "children's dental care"],
  },
  {
    code: "gum_treatment",
    labelTR: "Diş Eti Tedavisi",
    labelEN: "Gum Treatment",
    synonymsTR: ["diş eti tedavisi", "periodontoloji tedavisi", "diş eti hastalığı tedavisi"],
    synonymsEN: ["gum treatment", "periodontal treatment", "gum disease treatment"],
  },
  {
    code: "tooth_extraction",
    labelTR: "Diş Çekimi",
    labelEN: "Tooth Extraction",
    synonymsTR: ["diş çekimi", "gömülü diş çekimi", "yirmi yaş dişi", "20'lik diş"],
    synonymsEN: ["tooth extraction", "wisdom tooth extraction", "wisdom tooth removal"],
  },
  {
    code: "all_on_four",
    labelTR: "All-on-4",
    labelEN: "All-on-4",
    synonymsTR: ["all on 4", "all-on-4", "all on four", "sabit protez implant"],
    synonymsEN: ["all on 4", "all-on-4", "all on four"],
  },
  {
    code: "all_on_six",
    labelTR: "All-on-6",
    labelEN: "All-on-6",
    synonymsTR: ["all on 6", "all-on-6", "all on six"],
    synonymsEN: ["all on 6", "all-on-6", "all on six"],
  },
  {
    code: "dental_filling",
    labelTR: "Dolgu",
    labelEN: "Dental Filling",
    synonymsTR: ["dolgu", "diş dolgusu", "kompozit dolgu", "amalgam dolgu"],
    synonymsEN: ["filling", "dental filling", "composite filling"],
  },
  {
    code: "panoramic_xray",
    labelTR: "Panoramik Röntgen",
    labelEN: "Panoramic X-Ray",
    synonymsTR: ["panoramik röntgen", "panaromik", "röntgen", "dental tomografi"],
    synonymsEN: ["panoramic x-ray", "dental x-ray", "dental tomography"],
  },
];

export function findTreatmentCode(text: string): string | null {
  const lower = text.toLowerCase();
  for (const entry of TREATMENT_REGISTRY) {
    const allSynonyms = [...entry.synonymsTR, ...entry.synonymsEN, entry.labelTR.toLowerCase(), entry.labelEN.toLowerCase()];
    if (allSynonyms.some(syn => lower.includes(syn.toLowerCase()))) {
      return entry.code;
    }
  }
  return null;
}

export function getTreatmentLabel(code: string, lang: "tr" | "en" = "tr"): string {
  const entry = TREATMENT_REGISTRY.find(e => e.code === code);
  if (!entry) return code;
  return lang === "tr" ? entry.labelTR : entry.labelEN;
}

// ─── Specialty Code Lists (for dropdowns) ────────────────────────────────────

export const SPECIALIZATION_CODES = SPECIALIZATION_REGISTRY.map(e => e.code);
export const TREATMENT_CODES = TREATMENT_REGISTRY.map(e => e.code);

// ─── Entity Types ────────────────────────────────────────────────────────────

export const KNOWLEDGE_ENTITY_TYPES = [
  "doctor_profile",
  "treatment_profile",
  "clinic_general_information",
  "pricing_information",
  "appointment_information",
  "policy_information",
  "general",
] as const;

export type KnowledgeEntityType = typeof KNOWLEDGE_ENTITY_TYPES[number];
