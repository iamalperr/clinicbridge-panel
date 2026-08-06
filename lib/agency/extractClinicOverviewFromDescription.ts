/**
 * Extract clinic overview specialties + highlighted treatments from prose
 * (primarily longDescription) and related clinic text signals.
 *
 * Labels are human-readable for the Agency Portal "Klinik Özeti" inputs.
 */

export interface OverviewExtractionInput {
  longDescription?: string | null;
  shortDescription?: string | null;
  subTreatments?: string[] | null;
  treatmentCategories?: string[] | null;
  pricingTreatmentNames?: string[] | null;
  clinicName?: string | null;
  clinicType?: string | null;
}

export interface OverviewExtractionResult {
  specialties: string[];
  highlightedTreatments: string[];
  sources: {
    fromDescription: string[];
    fromStructured: string[];
  };
}

type CatalogEntry = {
  /** Canonical display label written to Firestore */
  label: string;
  kind: "specialty" | "treatment" | "both";
  /** When matched as specialty, optionally map to a broader specialty label */
  specialtyLabel?: string;
  patterns: RegExp[];
};

/**
 * Order matters for display stability; first matches are preferred.
 * Patterns are case-insensitive against normalized text.
 */
const CATALOG: CatalogEntry[] = [
  // ── Dental specialties ──
  {
    label: "Implantology",
    kind: "specialty",
    patterns: [/implantolog/i, /diş implant/i, /dis implant/i, /dental implant/i, /\bimplants?\b/i],
  },
  {
    label: "Aesthetic Dentistry",
    kind: "specialty",
    patterns: [/aesthetic dentistry/i, /esthetic dentistry/i, /kozmetik diş/i, /estetik diş/i, /cosmetic dentistry/i, /smile design/i, /gülüş tasarım/i],
  },
  {
    label: "Prosthodontics",
    kind: "specialty",
    patterns: [/prosthodont/i, /protez/i, /denture/i, /full denture/i, /diş protez/i],
  },
  {
    label: "Orthodontics",
    kind: "specialty",
    patterns: [/orthodont/i, /ortodonti/i, /\binvisalign\b/i, /diş teli/i, /clear aligner/i],
  },
  {
    label: "Periodontology",
    kind: "specialty",
    patterns: [/periodont/i, /diş eti/i, /gum (disease|treatment)/i],
  },
  {
    label: "Endodontics",
    kind: "specialty",
    patterns: [/endodont/i, /root canal/i, /kanal tedavi/i],
  },
  {
    label: "Oral Surgery",
    kind: "specialty",
    patterns: [/oral surgery/i, /ağız (ve )?çene/i, /maxillofacial/i, /diş çekimi/i, /wisdom tooth/i, /20'?lik diş/i],
  },
  {
    label: "Pediatric Dentistry",
    kind: "specialty",
    patterns: [/pediatric dentistr/i, /paediatric dentistr/i, /pedodont/i, /çocuk diş/i],
  },

  // ── Dental treatments ──
  {
    label: "Dental Implant",
    kind: "both",
    specialtyLabel: "Implantology",
    patterns: [/dental implants?/i, /diş implant/i, /dis implant/i, /\bimplants?\b/i],
  },
  {
    label: "All-on-4",
    kind: "treatment",
    specialtyLabel: "Implantology",
    patterns: [/all[\s-]?on[\s-]?4/i, /all on four/i],
  },
  {
    label: "All-on-6",
    kind: "treatment",
    specialtyLabel: "Implantology",
    patterns: [/all[\s-]?on[\s-]?6/i, /all on six/i],
  },
  {
    label: "Hollywood Smile",
    kind: "treatment",
    specialtyLabel: "Aesthetic Dentistry",
    patterns: [/hollywood\s*smile/i, /hollywood smile/i],
  },
  {
    label: "Zirconium Crown",
    kind: "treatment",
    specialtyLabel: "Prosthodontics",
    patterns: [/zirconi(?:um|a)/i, /zirkonyum/i],
  },
  {
    label: "E-Max Crown",
    kind: "treatment",
    specialtyLabel: "Prosthodontics",
    patterns: [/e[\s-]?max/i, /emax/i],
  },
  {
    label: "Laminate Veneer",
    kind: "treatment",
    specialtyLabel: "Aesthetic Dentistry",
    patterns: [/laminate/i, /veneers?/i, /laminat/i, /yaprak porselen/i],
  },
  {
    label: "Teeth Whitening",
    kind: "treatment",
    specialtyLabel: "Aesthetic Dentistry",
    patterns: [/teeth whitening/i, /tooth whitening/i, /diş beyazlat/i, /bleaching/i],
  },
  {
    label: "Bonding",
    kind: "treatment",
    specialtyLabel: "Aesthetic Dentistry",
    patterns: [/\bbonding\b/i],
  },
  {
    label: "Digital Smile Design",
    kind: "treatment",
    specialtyLabel: "Aesthetic Dentistry",
    patterns: [/digital smile design/i, /\bdsd\b/i],
  },
  {
    label: "Full Denture",
    kind: "treatment",
    specialtyLabel: "Prosthodontics",
    patterns: [/full dentures?/i, /tam protez/i],
  },
  {
    label: "Panoramic X-Ray",
    kind: "treatment",
    patterns: [/panoramic/i, /dental tomograph/i, /diş tomograf/i],
  },

  // ── Hair ──
  {
    label: "Hair Transplant",
    kind: "both",
    specialtyLabel: "Hair Transplant",
    patterns: [/hair transplant/i, /saç ekim/i, /sac ekim/i],
  },
  {
    label: "FUE Hair Transplant",
    kind: "treatment",
    specialtyLabel: "Hair Transplant",
    patterns: [/\bfue\b/i],
  },
  {
    label: "DHI Hair Transplant",
    kind: "treatment",
    specialtyLabel: "Hair Transplant",
    patterns: [/\bdhi\b/i],
  },
  {
    label: "Beard Transplant",
    kind: "treatment",
    specialtyLabel: "Hair Transplant",
    patterns: [/beard transplant/i, /sakal ekim/i],
  },
  {
    label: "PRP Treatment",
    kind: "treatment",
    patterns: [/\bprp\b/i],
  },

  // ── Eye ──
  {
    label: "Ophthalmology",
    kind: "specialty",
    patterns: [/ophthalmolog/i, /göz (hastane|klinik|tedavi|sağlık)/i, /eye (hospital|clinic|care|surgery)/i],
  },
  {
    label: "LASIK",
    kind: "treatment",
    specialtyLabel: "Ophthalmology",
    patterns: [/\blasik\b/i, /lazer göz/i, /laser eye/i],
  },
  {
    label: "Cataract Surgery",
    kind: "treatment",
    specialtyLabel: "Ophthalmology",
    patterns: [/cataract/i, /katarakt/i],
  },
  {
    label: "Intraocular Lens",
    kind: "treatment",
    specialtyLabel: "Ophthalmology",
    patterns: [/intraocular/i, /göz içi lens/i, /\biol\b/i],
  },

  // ── IVF / fertility ──
  {
    label: "IVF / Fertility",
    kind: "specialty",
    patterns: [/\bivf\b/i, /tü[pü] bebek/i, /in vitro/i, /fertility/i, /üreme/i],
  },
  {
    label: "Egg Freezing",
    kind: "treatment",
    specialtyLabel: "IVF / Fertility",
    patterns: [/egg freezing/i, /yumurta dondur/i],
  },
  {
    label: "ICSI",
    kind: "treatment",
    specialtyLabel: "IVF / Fertility",
    patterns: [/\bicsi\b/i],
  },

  // ── Aesthetic surgery ──
  {
    label: "Aesthetic Surgery",
    kind: "specialty",
    patterns: [/aesthetic surgery/i, /plastic surgery/i, /estetik cerrahi/i, /plastik cerrahi/i],
  },
  {
    label: "Rhinoplasty",
    kind: "treatment",
    specialtyLabel: "Aesthetic Surgery",
    patterns: [/rhinoplast/i, /burun estet/i, /rinoplasti/i],
  },
  {
    label: "Breast Augmentation",
    kind: "treatment",
    specialtyLabel: "Aesthetic Surgery",
    patterns: [/breast (augmentation|enlargement|implant)/i, /meme (büyüt|estet|implant)/i],
  },
  {
    label: "Liposuction",
    kind: "treatment",
    specialtyLabel: "Aesthetic Surgery",
    patterns: [/liposuction/i, /liposuction/i, /yağ ald[ıi]r/i],
  },
  {
    label: "BBL",
    kind: "treatment",
    specialtyLabel: "Aesthetic Surgery",
    patterns: [/\bbbl\b/i, /brazilian butt/i, /popo büyüt/i],
  },
  {
    label: "Botox",
    kind: "treatment",
    specialtyLabel: "Aesthetic Surgery",
    patterns: [/\bbotox\b/i, /botoks/i],
  },
  {
    label: "Dermal Filler",
    kind: "treatment",
    specialtyLabel: "Aesthetic Surgery",
    patterns: [/dermal filler/i, /\bfiller\b/i, /\bdolgu\b/i],
  },

  // ── Cardiology / general ──
  {
    label: "Cardiology",
    kind: "specialty",
    patterns: [/cardiolog/i, /kardiyoloj/i, /kalp/i, /heart (center|hospital|surgery)/i],
  },
  {
    label: "Check-up",
    kind: "treatment",
    patterns: [/check[\s-]?up/i, /checkup/i, /genel check/i],
  },
  {
    label: "Bariatric Surgery",
    kind: "both",
    specialtyLabel: "Bariatric Surgery",
    patterns: [/bariatric/i, /obezite cerrah/i, /gastric (sleeve|bypass)/i, /mide küçült/i],
  },
];

/** Map common structured/slug values → canonical labels */
const STRUCTURED_ALIASES: Array<{ patterns: RegExp[]; specialty?: string; treatment?: string }> = [
  { patterns: [/^implant/i, /dental.?implant/i], specialty: "Implantology", treatment: "Dental Implant" },
  { patterns: [/all.?on.?4/i], specialty: "Implantology", treatment: "All-on-4" },
  { patterns: [/all.?on.?6/i], specialty: "Implantology", treatment: "All-on-6" },
  { patterns: [/hollywood/i], specialty: "Aesthetic Dentistry", treatment: "Hollywood Smile" },
  { patterns: [/zircon/i, /zirkonyum/i], specialty: "Prosthodontics", treatment: "Zirconium Crown" },
  { patterns: [/e.?max/i], specialty: "Prosthodontics", treatment: "E-Max Crown" },
  { patterns: [/veneer/i, /laminat/i], specialty: "Aesthetic Dentistry", treatment: "Laminate Veneer" },
  { patterns: [/whiten/i, /beyazlat/i, /bleach/i], specialty: "Aesthetic Dentistry", treatment: "Teeth Whitening" },
  { patterns: [/bonding/i], specialty: "Aesthetic Dentistry", treatment: "Bonding" },
  { patterns: [/smile.?design/i], specialty: "Aesthetic Dentistry", treatment: "Digital Smile Design" },
  { patterns: [/^hair/i, /sa[cç].*ekim/i, /fue/i, /dhi/i], specialty: "Hair Transplant", treatment: "Hair Transplant" },
  { patterns: [/lasik/i, /göz|eye/i], specialty: "Ophthalmology" },
  { patterns: [/ivf|fertility|tüp|tup bebek/i], specialty: "IVF / Fertility" },
  { patterns: [/rhino|burun/i], specialty: "Aesthetic Surgery", treatment: "Rhinoplasty" },
];

function uniqPreserve(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const label = String(raw || "").trim();
    if (!label) continue;
    const key = label.toLocaleLowerCase("en-US");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

function normalizeCorpus(parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => String(p || "").trim())
    .filter(Boolean)
    .join("\n")
    .normalize("NFC");
}

function matchCatalog(text: string): { specialties: string[]; treatments: string[]; hits: string[] } {
  const specialties: string[] = [];
  const treatments: string[] = [];
  const hits: string[] = [];

  for (const entry of CATALOG) {
    if (!entry.patterns.some((p) => p.test(text))) continue;
    hits.push(entry.label);
    if (entry.kind === "specialty") {
      specialties.push(entry.label);
    } else if (entry.kind === "both") {
      specialties.push(entry.specialtyLabel || entry.label);
      treatments.push(entry.label);
    } else {
      treatments.push(entry.label);
      if (entry.specialtyLabel) specialties.push(entry.specialtyLabel);
    }
  }

  return {
    specialties: uniqPreserve(specialties),
    treatments: uniqPreserve(treatments),
    hits: uniqPreserve(hits),
  };
}

function matchStructuredTokens(tokens: string[]): { specialties: string[]; treatments: string[]; hits: string[] } {
  const specialties: string[] = [];
  const treatments: string[] = [];
  const hits: string[] = [];

  for (const token of tokens) {
    const t = String(token || "").trim();
    if (!t) continue;
    // Try catalog on the token itself first
    const direct = matchCatalog(t);
    specialties.push(...direct.specialties);
    treatments.push(...direct.treatments);
    hits.push(...direct.hits);

    for (const alias of STRUCTURED_ALIASES) {
      if (!alias.patterns.some((p) => p.test(t))) continue;
      if (alias.specialty) specialties.push(alias.specialty);
      if (alias.treatment) treatments.push(alias.treatment);
      hits.push(alias.treatment || alias.specialty || t);
    }
  }

  return {
    specialties: uniqPreserve(specialties),
    treatments: uniqPreserve(treatments),
    hits: uniqPreserve(hits),
  };
}

/**
 * Infer overview specialties + highlighted treatments.
 * Primary signal: longDescription. Fallbacks: shortDescription, subTreatments, pricing names.
 */
export function extractClinicOverviewFromDescription(
  input: OverviewExtractionInput
): OverviewExtractionResult {
  const descriptionText = normalizeCorpus([
    input.longDescription,
    input.shortDescription,
    input.clinicName,
    input.clinicType,
  ]);

  const fromDesc = matchCatalog(descriptionText);

  const structuredTokens = [
    ...(Array.isArray(input.subTreatments) ? input.subTreatments : []),
    ...(Array.isArray(input.treatmentCategories) ? input.treatmentCategories : []),
    ...(Array.isArray(input.pricingTreatmentNames) ? input.pricingTreatmentNames : []),
  ];
  const fromStructured = matchStructuredTokens(structuredTokens);

  // Prefer description-derived treatments; fill gaps from structured clinic data.
  let specialties = uniqPreserve([...fromDesc.specialties, ...fromStructured.specialties]);
  let highlightedTreatments = uniqPreserve([
    ...fromDesc.treatments,
    ...fromStructured.treatments,
  ]);

  // Dental clinics with thin prose still get a sensible default specialty set
  // when structured/dental signals exist but catalog specialty list is empty.
  const dentalHint =
    /dental|diş|dis |oral|implant|hospitadent|beyazışık|beyazisik|diş akademi/i.test(
      descriptionText
    ) ||
    structuredTokens.some((t) => /dental|implant|diş|zircon|hollywood|veneer/i.test(t));

  if (dentalHint && specialties.length === 0) {
    specialties = ["Implantology", "Aesthetic Dentistry"];
  }
  if (dentalHint && highlightedTreatments.length === 0 && structuredTokens.length > 0) {
    const GENERIC = new Set([
      "dental",
      "medical",
      "clinic",
      "hospital",
      "treatment",
      "treatments",
      "service",
      "services",
      "care",
      "health",
      "multi specialty medical center",
      "specialty",
    ]);
    // Keep humanized structured labels as treatments when catalog missed them
    highlightedTreatments = uniqPreserve(
      structuredTokens
        .map((t) =>
          String(t)
            .replace(/[-_]+/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase())
            .trim()
        )
        .filter((t) => {
          if (t.length < 4 || t.length > 48) return false;
          return !GENERIC.has(t.toLowerCase());
        })
        .slice(0, 6)
    );
  }

  // Cap to keep portal fields readable
  return {
    specialties: specialties.slice(0, 8),
    highlightedTreatments: highlightedTreatments.slice(0, 10),
    sources: {
      fromDescription: fromDesc.hits,
      fromStructured: fromStructured.hits,
    },
  };
}

/** Merge label lists (unique). First argument keeps priority order. */
export function mergeOverviewLabels(
  primary: string[],
  secondary?: string[] | null,
  opts: { replace?: boolean; max?: number } = {}
): string[] {
  const max = opts.max ?? 10;
  if (opts.replace) return uniqPreserve(primary).slice(0, max);
  return uniqPreserve([...(primary || []), ...(secondary || [])]).slice(0, max);
}
