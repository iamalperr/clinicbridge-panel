/**
 * Pure helpers: match clinic pricing rows → ClinicOffer drafts for a quote/lead.
 */

export interface PricingRowLike {
  id?: string;
  treatmentName?: string;
  treatmentCategoryName?: string;
  subTreatmentName?: string;
  priceGroup?: string;
  priceMin?: number;
  priceMax?: number;
  currency?: string;
  priceType?: string;
  notes?: string;
  packageDetails?: string;
  status?: string;
  allowQuoteRequest?: boolean;
  /** Alternate field names seen in older / synced docs */
  category?: string;
  minPrice?: number | string;
  maxPrice?: number | string;
  price?: number | string;
}

export interface DraftOfferMatchInput {
  treatmentCategory?: string | null;
  treatmentSubcategory?: string | null;
  treatmentName?: string | null;
  clinicId: string;
  clinicName: string;
  pricingRows: PricingRowLike[];
}

export interface DraftClinicOffer {
  clinicId: string;
  clinicName: string;
  treatmentName: string;
  priceMin: number;
  priceMax: number;
  currency: string;
  packageDetails?: string;
  notes?: string;
  sourcePricingId?: string;
  draftedAt: string;
}

function norm(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Coerce price fields that may arrive as strings ("1.200", "1200 EUR"). */
export function parsePricingAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  if (!raw) return null;
  // Keep digits / separators; drop currency letters and spaces.
  const cleaned = raw
    .replace(/[^\d.,-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "") // thousand sep with dot
    .replace(/,(?=\d{3}(?:\D|$))/g, "") // thousand sep with comma
    .replace(",", "."); // decimal comma
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalize a raw pricing document into the matcher shape.
 * Safe for Firestore / sync / portal schema drift.
 */
export function normalizePricingRow(raw: Record<string, unknown> | PricingRowLike): PricingRowLike {
  const row = raw as Record<string, unknown>;
  const priceMin =
    parsePricingAmount(row.priceMin) ??
    parsePricingAmount(row.minPrice) ??
    parsePricingAmount(row.price);
  const priceMax =
    parsePricingAmount(row.priceMax) ??
    parsePricingAmount(row.maxPrice) ??
    priceMin;
  const treatmentName = String(row.treatmentName || row.subTreatmentName || "").trim();
  const treatmentCategoryName = String(
    row.treatmentCategoryName || row.priceGroup || row.category || ""
  ).trim();
  return {
    id: row.id != null ? String(row.id) : undefined,
    treatmentName: treatmentName || undefined,
    treatmentCategoryName: treatmentCategoryName || undefined,
    subTreatmentName: row.subTreatmentName != null ? String(row.subTreatmentName) : undefined,
    priceGroup: row.priceGroup != null ? String(row.priceGroup) : undefined,
    priceMin: priceMin ?? undefined,
    priceMax: priceMax ?? undefined,
    currency: row.currency != null ? String(row.currency) : undefined,
    priceType: row.priceType != null ? String(row.priceType) : undefined,
    notes: row.notes != null ? String(row.notes) : undefined,
    packageDetails: row.packageDetails != null ? String(row.packageDetails) : undefined,
    status: row.status != null ? String(row.status) : undefined,
    allowQuoteRequest: row.allowQuoteRequest === false ? false : undefined,
  };
}

/** Category aliases so intake keys match uploaded price groups (TR/EN). */
function categoryAliases(cat: string): string[] {
  const c = norm(cat);
  if (!c) return [];
  const aliases = new Set<string>([c]);
  if (
    c.includes("aesthetic") ||
    c.includes("estetik") ||
    c === "plastic surgery" ||
    c.includes("aesthetic surgery")
  ) {
    ["aesthetic", "estetik", "aesthetic surgery", "plastik", "plastic"]
      .map(norm)
      .forEach((a) => aliases.add(a));
  }
  if (c.includes("implant") || c === "dental" || c.includes("dis")) {
    ["implant", "dental", "dis", "diş"].map(norm).forEach((a) => aliases.add(a));
  }
  if (c.includes("hair") || c.includes("sac")) {
    ["hair", "sac", "saç", "hair transplant"].map(norm).forEach((a) => aliases.add(a));
  }
  return Array.from(aliases).filter(Boolean);
}

function scorePricingRow(row: PricingRowLike, input: DraftOfferMatchInput): number {
  const catAliases = categoryAliases(String(input.treatmentCategory || ""));
  const sub = norm(input.treatmentSubcategory);
  const name = norm(input.treatmentName);
  const rowCat = norm(row.treatmentCategoryName);
  const rowSub = norm(row.subTreatmentName);
  const rowName = norm(row.treatmentName);
  const rowGroup = norm(row.priceGroup);
  const hay = `${rowCat} ${rowGroup} ${rowName} ${rowSub}`;

  let score = 0;
  for (const cat of catAliases) {
    if (cat && (rowCat === cat || rowGroup === cat || rowName.includes(cat) || hay.includes(cat))) {
      score += 5;
      break;
    }
  }
  if (sub && (rowSub === sub || rowName.includes(sub) || rowGroup.includes(sub))) score += 8;
  if (name && (rowName === name || rowName.includes(name) || name.includes(rowName))) score += 6;
  if (catAliases[0] && sub && rowCat === catAliases[0] && rowSub === sub) score += 4;
  return score;
}

/**
 * Firestore rejects `undefined` nested values. Build a write-safe offer object.
 */
export function sanitizeDraftClinicOffer(offer: DraftClinicOffer): DraftClinicOffer {
  const out: DraftClinicOffer = {
    clinicId: offer.clinicId,
    clinicName: offer.clinicName,
    treatmentName: offer.treatmentName,
    priceMin: offer.priceMin,
    priceMax: offer.priceMax,
    currency: offer.currency,
    draftedAt: offer.draftedAt,
  };
  if (offer.packageDetails) out.packageDetails = offer.packageDetails;
  if (offer.notes) out.notes = offer.notes;
  if (offer.sourcePricingId) out.sourcePricingId = offer.sourcePricingId;
  return out;
}

/**
 * Pick the best active pricing row for a clinic + treatment context.
 * Returns null when nothing usable matches.
 */
export function pickBestPricingForClinic(input: DraftOfferMatchInput): DraftClinicOffer | null {
  const normalized = (input.pricingRows || []).map((row) =>
    normalizePricingRow(row as PricingRowLike)
  );
  const active = normalized.filter((row) => {
    const status = String(row.status || "active").toLowerCase();
    if (status === "inactive" || status === "archived" || status === "disabled") return false;
    if (row.allowQuoteRequest === false) return false;
    const min = parsePricingAmount(row.priceMin);
    const max = parsePricingAmount(row.priceMax ?? row.priceMin);
    return min != null && min >= 0 && max != null && Number.isFinite(max);
  });

  if (active.length === 0) return null;

  let best = active[0];
  let bestScore = scorePricingRow(best, input);
  for (let i = 1; i < active.length; i++) {
    const s = scorePricingRow(active[i], input);
    if (s > bestScore) {
      best = active[i];
      bestScore = s;
    }
  }

  // Require at least a weak category/name signal when treatment context exists.
  const hasContext = Boolean(
    norm(input.treatmentCategory) || norm(input.treatmentSubcategory) || norm(input.treatmentName)
  );
  if (hasContext && bestScore < 5) {
    // Fall back to first active row so agency still gets a draft to review.
    best = active[0];
  }

  const priceMin = parsePricingAmount(best.priceMin)!;
  const priceMax = parsePricingAmount(best.priceMax ?? best.priceMin)!;
  const draft: DraftClinicOffer = {
    clinicId: input.clinicId,
    clinicName: input.clinicName,
    treatmentName:
      best.treatmentName ||
      input.treatmentSubcategory ||
      input.treatmentCategory ||
      input.treatmentName ||
      "Treatment",
    priceMin,
    priceMax: priceMax >= priceMin ? priceMax : priceMin,
    currency: String(best.currency || "EUR").toUpperCase(),
    draftedAt: new Date().toISOString(),
  };
  if (best.packageDetails) draft.packageDetails = best.packageDetails;
  if (best.notes) draft.notes = best.notes;
  if (best.id) draft.sourcePricingId = best.id;
  return sanitizeDraftClinicOffer(draft);
}

export function formatOfferPriceRange(offer: {
  priceMin: number;
  priceMax: number;
  currency: string;
}): string {
  const cur = offer.currency || "EUR";
  if (offer.priceMax > offer.priceMin) {
    return `${offer.priceMin}–${offer.priceMax} ${cur}`;
  }
  return `${offer.priceMin} ${cur}`;
}

/** User-facing copy for draft-offers / send-offer API error codes. */
export function describeClinicOfferDraftError(
  code: string | null | undefined,
  lang: "tr" | "en" = "tr",
  fallbackMessage?: string | null
): string {
  const c = String(code || "").toUpperCase();
  const tr: Record<string, string> = {
    QUOTE_NOT_FOUND: "Bu lead’e bağlı teklif kaydı bulunamadı. Teklif isteği tamamlanmış mı kontrol edin.",
    NO_CLINICS: "Seçili klinik yok. Önce klinik seçimi yapın.",
    NO_PRICING_MATCH:
      "Seçili kliniklerde bu tedaviye eşleşen yüklü fiyat bulunamadı. Klinik fiyatlarını kontrol edin.",
    NO_OFFERS: "Gönderilecek klinik teklifi yok.",
    LEAD_NOT_FOUND: "Lead bulunamadı.",
    DB_UNAVAILABLE: "Veritabanına şu an ulaşılamıyor. Biraz sonra tekrar deneyin.",
    INTERNAL_ERROR: "Teklif taslağı oluşturulamadı. Klinik fiyatlarını ve teklif kaydını kontrol edin.",
  };
  const en: Record<string, string> = {
    QUOTE_NOT_FOUND: "No quote is linked to this lead yet. Check that the quote request completed.",
    NO_CLINICS: "No clinics selected. Select clinics first.",
    NO_PRICING_MATCH:
      "No uploaded clinic pricing matched this treatment. Check clinic price lists.",
    NO_OFFERS: "No clinic offers available to send.",
    LEAD_NOT_FOUND: "Lead not found.",
    DB_UNAVAILABLE: "Database is temporarily unavailable. Try again shortly.",
    INTERNAL_ERROR: "Could not draft the offer. Check clinic prices and the linked quote.",
  };
  const map = lang === "tr" ? tr : en;
  if (c && map[c]) return map[c];
  if (fallbackMessage && !/^[A-Z0-9_]+$/.test(fallbackMessage)) return fallbackMessage;
  return map.INTERNAL_ERROR;
}
