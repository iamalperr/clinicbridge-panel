/**
 * Agency-managed clinic recommendation rules (AI Eşleştirme).
 *
 * Precedence:
 *  1. Enabled agency dynamic matching rule for treatment+city+side
 *  2. FeelinHealthy legacy curated matrix (FEELINHEALTHY_CURATED_RULES)
 *  3. No-match (empty recommendations)
 *
 * Patient-facing max remains PLATFORM_MAX_RECOMMENDED_CLINICS (2).
 * Agencies cannot raise this ceiling.
 *
 * Inactive / unlinked configured clinics are skipped — never silently
 * substituted with an unrelated clinic.
 */

import {
  FEELINHEALTHY_CONFIG,
  FEELINHEALTHY_CURATED_RULES,
  FEELINHEALTHY_PRODUCTION_CLINIC_IDS,
  getCuratedClinicsForFeelinHealthy,
  normalizeTreatmentBranch,
  type CuratedLocationRule,
} from "./feelinhealthyConfig";

/** Hard platform ceiling for patient-facing recommendation cards. */
export const PLATFORM_MAX_RECOMMENDED_CLINICS = 2;

export const AGENCY_MATCHING_RULES_SCHEMA_VERSION = 1;

/** Migration marker version for FeelinHealthy curated → dynamic seed. */
export const MATCHING_RULES_MIGRATION_VERSION = "fh-curated-v1";

export const MATCHING_RULE_SOURCE_LEGACY = "legacy_curated_migration";
export const MATCHING_RULE_SOURCE_UI = "agency_ui";

/** FeelinHealthy: never recommend Intermed even if misconfigured in Firestore. */
export const FEELINHEALTHY_NEVER_RECOMMEND_CLINIC_IDS: ReadonlySet<string> = new Set([
  FEELINHEALTHY_PRODUCTION_CLINIC_IDS.intermedNisantasi,
]);

export type AgencyMatchingRuleSide = "anatolian" | "european" | "any";

export interface AgencyMatchingRule {
  id: string;
  agencyId: string;
  treatmentBranch: string;
  city: string;
  side: AgencyMatchingRuleSide;
  /** Ordered clinic document IDs (authoritative). Names are display-only elsewhere. */
  clinicIds: string[];
  enabled: boolean;
  schemaVersion: number;
  source: string;
  updatedAt?: unknown;
  updatedBy?: string | null;
  createdAt?: unknown;
}

export interface LiveCuratedMatrixRow {
  treatmentBranch: string;
  categoryNameTr: string;
  categoryNameEn: string;
  city: string;
  side: AgencyMatchingRuleSide;
  displayNameTr: string;
  displayNameEn: string;
  clinic1Id: string | null;
  clinic1Name: string | null;
  clinic2Id: string | null;
  clinic2Name: string | null;
  clinicIds: string[];
  clinicNames: string[];
}

export type MatchingResolveSource = "agency_dynamic" | "legacy_curated" | "none";

export interface AgencyClinicRecommendationResult {
  matchingCuratedClinics: any[];
  allEligibleClinics: any[];
  locationRule: CuratedLocationRule | null;
  isUnsupportedLocation: boolean;
  supportedLocationsForBranch: CuratedLocationRule[];
  source: MatchingResolveSource;
  matchedRuleId: string | null;
}

export function buildMatchingRuleId(
  treatmentBranch: string,
  city: string,
  side: string
): string {
  const b = String(treatmentBranch || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]+/g, "_");
  const c = String(city || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]+/g, "_");
  const s = String(side || "any")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]+/g, "_");
  return `${b}__${c}__${s}`;
}

/**
 * Forensic extract of the live curated matrix (source of truth for migration seed).
 * Does not invent clinics — reads FEELINHEALTHY_CURATED_RULES only.
 */
export function extractLiveCuratedMatrix(): LiveCuratedMatrixRow[] {
  const rows: LiveCuratedMatrixRow[] = [];
  for (const branch of FEELINHEALTHY_CURATED_RULES) {
    for (const loc of branch.locations) {
      const side = (loc.side || "any") as AgencyMatchingRuleSide;
      const clinics = loc.curatedClinics || [];
      const clinicIds = clinics.map((c) => c.slugOrId);
      const clinicNames = clinics.map((c) => c.name);
      rows.push({
        treatmentBranch: branch.branchKey,
        categoryNameTr: branch.categoryNameTr,
        categoryNameEn: branch.categoryNameEn,
        city: loc.city,
        side,
        displayNameTr: loc.displayNameTr,
        displayNameEn: loc.displayNameEn,
        clinic1Id: clinicIds[0] || null,
        clinic1Name: clinicNames[0] || null,
        clinic2Id: clinicIds[1] || null,
        clinic2Name: clinicNames[1] || null,
        clinicIds,
        clinicNames,
      });
    }
  }
  return rows;
}

/** Build idempotent seed documents from the live curated matrix. */
export function buildFeelinHealthyMigrationRules(
  agencyId: string = "feelinhealthy"
): AgencyMatchingRule[] {
  return extractLiveCuratedMatrix().map((row) => {
    const id = buildMatchingRuleId(row.treatmentBranch, row.city, row.side);
    return {
      id,
      agencyId,
      treatmentBranch: row.treatmentBranch,
      city: row.city,
      side: row.side,
      clinicIds: [...row.clinicIds],
      enabled: true,
      schemaVersion: AGENCY_MATCHING_RULES_SCHEMA_VERSION,
      source: MATCHING_RULE_SOURCE_LEGACY,
      updatedBy: null,
    };
  });
}

export function assertNoIntermedInRules(rules: AgencyMatchingRule[]): void {
  const intermed = FEELINHEALTHY_PRODUCTION_CLINIC_IDS.intermedNisantasi;
  for (const rule of rules) {
    if (rule.clinicIds.includes(intermed)) {
      throw new Error(
        `Intermed must not appear in matching rules (rule=${rule.id})`
      );
    }
  }
}

export function isFeelinHealthyAgency(opts: {
  agencySlug?: string | null;
  agencyId?: string | null;
}): boolean {
  const slug = String(opts.agencySlug || "").toLowerCase();
  const id = String(opts.agencyId || "").toLowerCase();
  return slug === "feelinhealthy" || id === "feelinhealthy";
}

function normalizeSideForLookup(
  side?: string | null
): AgencyMatchingRuleSide | null {
  if (!side || side === "unsure") return null;
  if (side === "anatolian" || side === "european" || side === "any") return side;
  return null;
}

/**
 * Find the best matching enabled/disabled rule for branch+city+side.
 * Prefer exact side match; then side=any; then first city match when side unknown.
 */
export function findMatchingRule(
  rules: AgencyMatchingRule[],
  treatmentBranch: string,
  city?: string | null,
  side?: string | null
): AgencyMatchingRule | null {
  if (!rules?.length || !city) return null;
  const branch = normalizeTreatmentBranch(treatmentBranch);
  if (!branch || branch === "unknown") return null;
  const cityLower = city.toLowerCase();
  const wantSide = normalizeSideForLookup(side);

  const candidates = rules.filter(
    (r) =>
      r.treatmentBranch === branch &&
      String(r.city || "").toLowerCase() === cityLower
  );
  if (candidates.length === 0) return null;

  if (wantSide && wantSide !== "any") {
    const exact = candidates.find((r) => r.side === wantSide);
    if (exact) return exact;
    const anySide = candidates.find((r) => r.side === "any");
    if (anySide) return anySide;
    return null;
  }

  const anySide = candidates.find((r) => r.side === "any");
  if (anySide) return anySide;
  return candidates[0] || null;
}

function isClinicActiveLinked(clinic: any): boolean {
  if (!clinic) return false;
  const status = String(clinic.status || "active").toLowerCase();
  return status === "active";
}

function findClinicById(availableClinics: any[], clinicId: string): any | null {
  const want = String(clinicId || "").toLowerCase();
  if (!want) return null;
  return (
    availableClinics.find((c) => {
      const keys = [
        c.id,
        c.clinicId,
        c.clinicSlug,
        c.slug,
      ]
        .map((v) => String(v || "").toLowerCase().trim())
        .filter(Boolean);
      return keys.includes(want);
    }) || null
  );
}

function clampMax(requested?: number): number {
  const n = typeof requested === "number" && requested > 0 ? requested : PLATFORM_MAX_RECOMMENDED_CLINICS;
  return Math.min(n, PLATFORM_MAX_RECOMMENDED_CLINICS);
}

function buildEligibleExtras(
  branchKey: string,
  city: string,
  matched: any[],
  availableClinics: any[]
): any[] {
  const all = [...matched];
  for (const c of availableClinics) {
    if (!isClinicActiveLinked(c)) continue;
    if (all.some((e) => e.id === c.id)) continue;
    const cCity = String(c.location?.city || "").toLowerCase();
    const cCats = (c.treatmentCategories || []).map((t: string) => String(t).toLowerCase());
    const cityOk =
      !city ||
      cCity.includes(city.toLowerCase()) ||
      (city.toLowerCase() === "istanbul" &&
        (cCity.includes("istanbul") || cCity.includes("i̇stanbul")));
    if (cCats.includes(branchKey) && cityOk) {
      all.push(c);
    }
  }
  return all;
}

function applyDynamicRule(input: {
  rule: AgencyMatchingRule;
  branchKey: string;
  city: string;
  side?: string | null;
  availableClinics: any[];
  maxClinics: number;
  isFeelinHealthy: boolean;
  supportedLocations: CuratedLocationRule[];
}): AgencyClinicRecommendationResult {
  const {
    rule,
    branchKey,
    city,
    availableClinics,
    maxClinics,
    isFeelinHealthy,
    supportedLocations,
  } = input;

  const matching: any[] = [];
  for (const clinicId of rule.clinicIds || []) {
    if (matching.length >= maxClinics) break;
    if (isFeelinHealthy && FEELINHEALTHY_NEVER_RECOMMEND_CLINIC_IDS.has(clinicId)) {
      continue;
    }
    const found = findClinicById(availableClinics, clinicId);
    if (!found) continue;
    if (!isClinicActiveLinked(found)) continue;
    if (matching.some((e) => e.id === found.id)) continue;
    matching.push(found);
  }

  const locationRule: CuratedLocationRule | null = {
    city: rule.city,
    side: rule.side,
    displayNameTr: rule.city === "istanbul"
      ? rule.side === "anatolian"
        ? "İstanbul Anadolu Yakası"
        : rule.side === "european"
          ? "İstanbul Avrupa Yakası"
          : "İstanbul"
      : rule.city.charAt(0).toUpperCase() + rule.city.slice(1),
    displayNameEn: rule.city === "istanbul"
      ? rule.side === "anatolian"
        ? "Istanbul Anatolian Side"
        : rule.side === "european"
          ? "Istanbul European Side"
          : "Istanbul"
      : rule.city.charAt(0).toUpperCase() + rule.city.slice(1),
    curatedClinics: (rule.clinicIds || []).map((id) => ({
      name: id,
      slugOrId: id,
    })),
  };

  return {
    matchingCuratedClinics: matching,
    allEligibleClinics: buildEligibleExtras(branchKey, city, matching, availableClinics),
    locationRule,
    isUnsupportedLocation: false,
    supportedLocationsForBranch: supportedLocations,
    source: "agency_dynamic",
    matchedRuleId: rule.id,
  };
}

/**
 * Resolve patient-facing clinic recommendations with dynamic → curated → empty precedence.
 */
export function resolveAgencyClinicRecommendations(input: {
  category: string;
  city?: string | null;
  side?: "anatolian" | "european" | "any" | "unsure" | null;
  availableClinics?: any[];
  agencyRules?: AgencyMatchingRule[] | null;
  agencySlug?: string | null;
  agencyId?: string | null;
  /** Requested max; always clamped to PLATFORM_MAX_RECOMMENDED_CLINICS. */
  maxClinics?: number;
}): AgencyClinicRecommendationResult {
  const availableClinics = input.availableClinics || [];
  const maxClinics = clampMax(input.maxClinics ?? FEELINHEALTHY_CONFIG.maxGuestClinics);
  const branchKey = normalizeTreatmentBranch(input.category);
  const isFH = isFeelinHealthyAgency({
    agencySlug: input.agencySlug,
    agencyId: input.agencyId,
  });

  const curatedBranch = FEELINHEALTHY_CURATED_RULES.find((b) => b.branchKey === branchKey);
  const supportedLocations = curatedBranch?.locations || [];

  const rule = findMatchingRule(
    input.agencyRules || [],
    input.category,
    input.city,
    input.side
  );

  if (rule && rule.enabled) {
    return applyDynamicRule({
      rule,
      branchKey,
      city: String(input.city || ""),
      side: input.side,
      availableClinics,
      maxClinics,
      isFeelinHealthy: isFH,
      supportedLocations,
    });
  }

  if (isFH) {
    const curated = getCuratedClinicsForFeelinHealthy(
      input.category,
      input.city,
      input.side,
      availableClinics
    );
    // Extra Intermed belt on legacy path for FH aesthetic Europe etc.
    const filtered = curated.matchingCuratedClinics.filter(
      (c: any) => !FEELINHEALTHY_NEVER_RECOMMEND_CLINIC_IDS.has(String(c.id))
    );
    return {
      ...curated,
      matchingCuratedClinics: filtered.slice(0, maxClinics),
      source: "legacy_curated",
      matchedRuleId: null,
    };
  }

  return {
    matchingCuratedClinics: [],
    allEligibleClinics: [],
    locationRule: null,
    isUnsupportedLocation: Boolean(input.city),
    supportedLocationsForBranch: supportedLocations,
    source: "none",
    matchedRuleId: null,
  };
}

/**
 * Pure parity helper: compare legacy curated IDs vs dynamic resolve from migrated rules.
 */
export function compareLegacyVsDynamicParity(input: {
  category: string;
  city: string;
  side?: "anatolian" | "european" | "any" | "unsure" | null;
  availableClinics: any[];
  migratedRules: AgencyMatchingRule[];
}): {
  legacyIds: string[];
  dynamicIds: string[];
  match: boolean;
} {
  const legacy = getCuratedClinicsForFeelinHealthy(
    input.category,
    input.city,
    input.side,
    input.availableClinics
  );
  const dynamic = resolveAgencyClinicRecommendations({
    category: input.category,
    city: input.city,
    side: input.side,
    availableClinics: input.availableClinics,
    agencyRules: input.migratedRules,
    agencySlug: "feelinhealthy",
    agencyId: "feelinhealthy",
  });
  const legacyIds = legacy.matchingCuratedClinics.map((c: any) => String(c.id));
  const dynamicIds = dynamic.matchingCuratedClinics.map((c: any) => String(c.id));
  return {
    legacyIds,
    dynamicIds,
    match:
      legacyIds.length === dynamicIds.length &&
      legacyIds.every((id, i) => id === dynamicIds[i]),
  };
}

/** Sanitize clinicIds for UI/API writes: unique, max platform ceiling, no empties. */
export function sanitizeMatchingClinicIds(
  clinicIds: string[],
  opts?: { max?: number; excludeIds?: ReadonlySet<string> }
): string[] {
  const max = clampMax(opts?.max);
  const exclude = opts?.excludeIds;
  const out: string[] = [];
  for (const raw of clinicIds || []) {
    const id = String(raw || "").trim();
    if (!id) continue;
    if (exclude?.has(id)) continue;
    if (out.includes(id)) continue;
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}
