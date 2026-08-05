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

function scorePricingRow(row: PricingRowLike, input: DraftOfferMatchInput): number {
  const cat = norm(input.treatmentCategory);
  const sub = norm(input.treatmentSubcategory);
  const name = norm(input.treatmentName);
  const rowCat = norm(row.treatmentCategoryName);
  const rowSub = norm(row.subTreatmentName);
  const rowName = norm(row.treatmentName);
  const rowGroup = norm(row.priceGroup);

  let score = 0;
  if (cat && (rowCat === cat || rowGroup === cat || rowName.includes(cat))) score += 5;
  if (sub && (rowSub === sub || rowName.includes(sub) || rowGroup.includes(sub))) score += 8;
  if (name && (rowName === name || rowName.includes(name) || name.includes(rowName))) score += 6;
  if (cat && sub && rowCat === cat && rowSub === sub) score += 4;
  return score;
}

/**
 * Pick the best active pricing row for a clinic + treatment context.
 * Returns null when nothing usable matches.
 */
export function pickBestPricingForClinic(input: DraftOfferMatchInput): DraftClinicOffer | null {
  const active = (input.pricingRows || []).filter((row) => {
    const status = String(row.status || "active").toLowerCase();
    if (status === "inactive" || status === "archived" || status === "disabled") return false;
    if (row.allowQuoteRequest === false) return false;
    const min = Number(row.priceMin);
    const max = Number(row.priceMax ?? row.priceMin);
    return Number.isFinite(min) && min >= 0 && Number.isFinite(max);
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

  const priceMin = Number(best.priceMin);
  const priceMax = Number(best.priceMax ?? best.priceMin);
  return {
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
    packageDetails: best.packageDetails || undefined,
    notes: best.notes || undefined,
    sourcePricingId: best.id,
    draftedAt: new Date().toISOString(),
  };
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
