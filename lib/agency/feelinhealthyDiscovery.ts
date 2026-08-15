/**
 * FeelinHealthy information discovery vs transactional intake.
 *
 * INFORMATION DISCOVERY ≠ TRANSACTIONAL REQUEST
 * - Discovery answers inventory questions from connected/curated network data.
 * - Does not create lead/quote, does not require consent, does not ask PII.
 * - Explicit quote / appointment / personalized-matching intent starts transactional flow.
 *
 * Never authorizes persistence, consent, matching eligibility, or clinic selection writes.
 */

import type { AgencySessionState, AgencySessionStateInput } from "./agencySessionState";
import {
  getAgencyIstanbulSide,
  getAgencySelectedCity,
  getAgencyTreatmentContext,
  normalizeAgencySessionState,
} from "./agencySessionState";
import {
  FEELINHEALTHY_CONFIG,
  FEELINHEALTHY_CURATED_RULES,
  getAvailableCitiesForTreatment,
  getCityDisplayName,
  getCuratedClinicsForFeelinHealthy,
  normalizeTreatmentBranch,
  resolveCityAndSide,
} from "./feelinhealthyConfig";
import { inferTreatmentFromText } from "./feelinhealthyConversationMachine";

export type FeelinHealthyConversationIntent =
  | "information"
  | "network_discovery"
  | "personalized_matching"
  | "quote_request"
  | "appointment_request"
  | "workflow_resume"
  | "structured_action"
  | "ambiguous";

export type DiscoveryClinicHit = {
  id: string;
  name: string;
  slug?: string;
  city: string;
  side?: string | null;
  district?: string | null;
};

export type DiscoveryCityGroup = {
  city: string;
  displayName: string;
  clinics: DiscoveryClinicHit[];
};

export type FeelinHealthyDiscoveryResult = {
  treatmentBranch: string | null;
  treatmentLabel: string;
  cityFilter: string | null;
  sideFilter: "anatolian" | "european" | "any" | "unsure" | null;
  cities: DiscoveryCityGroup[];
  totalClinics: number;
  /** True when only city inventory was requested (no clinic dump needed). */
  citySummaryOnly: boolean;
};

export type FeelinHealthyIntentClassification = {
  intent: FeelinHealthyConversationIntent;
  isDiscovery: boolean;
  isTransactional: boolean;
  treatmentBranch: string | null;
  city: string | null;
  side: "anatolian" | "european" | "any" | "unsure" | null;
  citySummaryOnly: boolean;
};

const QUOTE_RE =
  /\b(teklif|fiyat\s*teklif|quote|get\s+a\s+quote|pricing\s+request|teklif\s*almak|teklif\s*isterim|fiyat\s*almak|ücret\s*almak|ucret\s*almak|price\s*quote|request\s+a\s+quote)\b/i;

const APPOINTMENT_RE =
  /\b(randevu|appointment|book\s+(an?\s+)?appointment|randevu\s*almak|randevu\s*isterim)\b/i;

const PERSONALIZED_RE =
  /\b(bana\s+uygun|klinikleri\s+se[cç]|se[cç]im\s+yap|öner(?:ir\s*misin)?|recommend|match\s+me|kişiselleştir|kisisellestir|uygun\s+klinik(?:leri)?\s+(?:se[cç]|öner|g[oö]ster))\b/i;

const DISCOVERY_RE =
  /(var\s*m[ıi]|mevcut\s*mu|bulunuyor\s*mu|hangi\s*şehir|hangi\s*sehir|hangi\s*klinik|neler\s*var|listeler?\s*misin|g[oö]ster(?:ir\s*misin)?|bilgi\s*ver|anla[sş]mal[ıi]|a[gğ][ıi]n[ıi]zda|do\s*you\s*have|are\s*there|which\s*cities|what\s*clinics|available\s+clinics|\bnetwork\b)/i;

const CITY_SUMMARY_RE =
  /(hangi\s*şehir|hangi\s*sehir|which\s*cities|şehirlerde\s*var|sehirlerde\s*var|nerelerde\s*var)/i;

const CONTINUE_RE =
  /(devam\s*edelim|devam\s*et|kald[ıi][gğ][ıi]m[ıi]z\s*yerden|let'?s\s+continue|\bcontinue\b|\bresume\b)/i;

const EXISTENCE_CLINIC_RE =
  /(klinik|hastane|merkez|yerler|clinic|hospital|center|centres?)/i;

function normalizeMsg(message?: string | null): string {
  return String(message || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/\u0307/g, "")
    .normalize("NFC");
}

function treatmentLabel(branch: string | null, locale: string): string {
  if (!branch) {
    return locale.startsWith("en") ? "this treatment" : "bu tedavi";
  }
  const rule = FEELINHEALTHY_CURATED_RULES.find((b) => b.branchKey === branch);
  if (locale.startsWith("en")) return rule?.categoryNameEn || branch.replace(/_/g, " ");
  return rule?.categoryNameTr || branch.replace(/_/g, " ");
}

function clinicMatchesBranch(clinic: any, branchKey: string): boolean {
  const blob = [
    ...(clinic.treatmentCategories || []),
    ...(clinic.treatments || []),
    ...(clinic.subTreatments || []),
    clinic.category,
    clinic.clinicType,
    clinic.overview,
    clinic.shortDescription,
    clinic.description,
  ]
    .map((x) => String(x || "").toLocaleLowerCase("tr-TR"))
    .join(" ");
  if (!blob.trim()) return false;
  const normalized = normalizeTreatmentBranch(blob);
  if (normalized === branchKey) return true;
  // Also accept raw branch token presence for multi-specialty hospitals.
  return blob.includes(branchKey.replace(/_/g, " ")) || blob.includes(branchKey);
}

function clinicCityKey(clinic: any): string {
  const raw = String(clinic?.location?.city || clinic?.city || "").trim();
  if (!raw) return "unknown";
  const resolved = resolveCityAndSide(raw);
  return (resolved.city || raw).toLowerCase();
}

function clinicSide(clinic: any): string | null {
  const side = clinic?.location?.side || clinic?.istanbul_side || null;
  if (side === "european" || side === "anatolian" || side === "any" || side === "unsure") {
    return side;
  }
  return null;
}

/**
 * Classify FeelinHealthy turn into discovery vs transactional intents.
 * Deterministic first; OpenAI may only be used later for true ambiguity.
 */
export function classifyFeelinHealthyConversationIntent(params: {
  message?: string | null;
  sessionContext?: AgencySessionStateInput | null;
  isStructuredAction?: boolean;
}): FeelinHealthyIntentClassification {
  const ctx = normalizeAgencySessionState(params.sessionContext || {});
  const text = String(params.message || "").trim();
  const lower = normalizeMsg(text);

  if (params.isStructuredAction) {
    return {
      intent: "structured_action",
      isDiscovery: false,
      isTransactional: false,
      treatmentBranch: getAgencyTreatmentContext(ctx).category || null,
      city: getAgencySelectedCity(ctx) || null,
      side: (getAgencyIstanbulSide(ctx) as any) || null,
      citySummaryOnly: false,
    };
  }

  if (CONTINUE_RE.test(lower) && ctx.workflowPaused === true) {
    return {
      intent: "workflow_resume",
      isDiscovery: false,
      isTransactional: true,
      treatmentBranch: getAgencyTreatmentContext(ctx).category || null,
      city: getAgencySelectedCity(ctx) || null,
      side: (getAgencyIstanbulSide(ctx) as any) || null,
      citySummaryOnly: false,
    };
  }

  const inferredTreatment =
    inferTreatmentFromText(text) ||
    getAgencyTreatmentContext(ctx).category ||
    null;
  const branch = inferredTreatment
    ? normalizeTreatmentBranch(inferredTreatment)
    : null;

  const fromText = resolveCityAndSide(text);
  const city =
    fromText.city ||
    getAgencySelectedCity(ctx) ||
    null;
  let side =
    (fromText.side as FeelinHealthyIntentClassification["side"]) ||
    (getAgencyIstanbulSide(ctx) as FeelinHealthyIntentClassification["side"]) ||
    null;

  // Side-only follow-ups: "Avrupa yakasında olanlar?"
  if (!fromText.city && /\b(avrupa|anatolian|anadolu|european)\b/i.test(lower)) {
    if (/avrupa|european/i.test(lower)) side = "european";
    if (/anadolu|anatolian/i.test(lower)) side = "anatolian";
  }

  if (QUOTE_RE.test(lower)) {
    return {
      intent: "quote_request",
      isDiscovery: false,
      isTransactional: true,
      treatmentBranch: branch,
      city,
      side,
      citySummaryOnly: false,
    };
  }
  if (APPOINTMENT_RE.test(lower)) {
    return {
      intent: "appointment_request",
      isDiscovery: false,
      isTransactional: true,
      treatmentBranch: branch,
      city,
      side,
      citySummaryOnly: false,
    };
  }
  if (PERSONALIZED_RE.test(lower)) {
    return {
      intent: "personalized_matching",
      isDiscovery: false,
      isTransactional: true,
      treatmentBranch: branch,
      city,
      side,
      citySummaryOnly: false,
    };
  }

  const discoveryActive =
    ctx.conversationMode === "information" ||
    ctx.discoveryActive === true ||
    ctx.intakeInformationOnly === true;

  const looksLikeInventory =
    DISCOVERY_RE.test(lower) ||
    (EXISTENCE_CLINIC_RE.test(lower) &&
      /(var\s*m[ıi]|mevcut|bulunuyor|hangi|g[oö]ster|list)/i.test(lower));

  // Narrowing follow-ups while already in discovery (city/side only).
  const narrowingFollowUp =
    discoveryActive &&
    Boolean(branch || getAgencyTreatmentContext(ctx).category) &&
    (Boolean(fromText.city) ||
      /\b(avrupa|anadolu|european|anatolian|istanbul|izmir|antalya|ankara|goster|göster|olanlar)\b/i.test(
        lower
      ));

  if (looksLikeInventory || narrowingFollowUp) {
    const citySummaryOnly = CITY_SUMMARY_RE.test(lower);
    return {
      intent: citySummaryOnly ? "information" : "network_discovery",
      isDiscovery: true,
      isTransactional: false,
      treatmentBranch: branch || getAgencyTreatmentContext(ctx).category || null,
      city: city || (narrowingFollowUp ? getAgencySelectedCity(ctx) || null : null),
      side,
      citySummaryOnly,
    };
  }

  // Explicit treatment desire → personalized matching (consent/intake), not inventory.
  if (branch && /\b(istiyorum|olmak|yaptırmak|yaptirmak|looking\s+for|want\s+to\s+(get|have)|need)\b/i.test(lower)) {
    return {
      intent: "personalized_matching",
      isDiscovery: false,
      isTransactional: true,
      treatmentBranch: branch,
      city,
      side,
      citySummaryOnly: false,
    };
  }

  return {
    intent: "ambiguous",
    isDiscovery: false,
    isTransactional: false,
    treatmentBranch: branch,
    city,
    side,
    citySummaryOnly: false,
  };
}

/**
 * Retrieve FeelinHealthy-connected network inventory for a treatment branch.
 * Uses curated allowlist as product source of truth, intersected with connected
 * active clinics when provided. Guest max-2 does NOT apply here.
 */
export function discoverFeelinHealthyNetwork(params: {
  treatmentBranch?: string | null;
  city?: string | null;
  side?: "anatolian" | "european" | "any" | "unsure" | null;
  availableClinics?: any[];
  locale?: string;
  maxClinicsPerCity?: number;
  citySummaryOnly?: boolean;
}): FeelinHealthyDiscoveryResult {
  const locale = (params.locale || "tr").toLowerCase().startsWith("en") ? "en" : "tr";
  const branch = params.treatmentBranch
    ? normalizeTreatmentBranch(params.treatmentBranch)
    : null;
  const available = (params.availableClinics || []).filter((c) => {
    const status = String(c.status || "active").toLowerCase();
    return status === "active" || status === "";
  });
  const maxPerCity = Math.max(1, Number(params.maxClinicsPerCity || 6));
  const cityFilter = params.city ? String(params.city).toLowerCase() : null;
  const sideFilter = params.side || null;

  const cityGroups = new Map<string, DiscoveryCityGroup>();

  const pushClinic = (hit: DiscoveryClinicHit) => {
    if (cityFilter && hit.city !== cityFilter) return;
    if (
      cityFilter === "istanbul" &&
      sideFilter &&
      sideFilter !== "any" &&
      sideFilter !== "unsure" &&
      hit.side &&
      hit.side !== "any" &&
      hit.side !== sideFilter
    ) {
      return;
    }
    const group =
      cityGroups.get(hit.city) ||
      ({
        city: hit.city,
        displayName: getCityDisplayName(hit.city, locale),
        clinics: [],
      } as DiscoveryCityGroup);
    if (group.clinics.some((c) => c.id === hit.id || c.name === hit.name)) {
      cityGroups.set(hit.city, group);
      return;
    }
    if (group.clinics.length < maxPerCity) {
      group.clinics.push(hit);
    }
    cityGroups.set(hit.city, group);
  };

  if (branch) {
    const cities = getAvailableCitiesForTreatment(branch, available, locale);
    for (const cityOpt of cities) {
      if (cityFilter && cityOpt.city !== cityFilter) continue;
      const sides: Array<"anatolian" | "european" | "any"> =
        cityOpt.city === "istanbul" && cityOpt.requiresSideSelection
          ? sideFilter === "european" || sideFilter === "anatolian"
            ? [sideFilter]
            : ["anatolian", "european"]
          : ["any"];

      for (const side of sides) {
        const curated = getCuratedClinicsForFeelinHealthy(
          branch,
          cityOpt.city,
          side,
          available
        );
        for (const clinic of curated.matchingCuratedClinics) {
          pushClinic({
            id: String(clinic.id || clinic.clinicSlug || clinic.clinicName),
            name: String(clinic.clinicName || clinic.name || "Clinic"),
            slug: clinic.clinicSlug,
            city: cityOpt.city,
            side: side === "any" ? clinicSide(clinic) : side,
            district: clinic.location?.address || clinic.district || null,
          });
        }
        // Also include connected clinics that match branch+city even if not in
        // the guest curated top-2 (discovery inventory may be broader).
        for (const clinic of available) {
          if (!clinicMatchesBranch(clinic, branch)) continue;
          const cCity = clinicCityKey(clinic);
          if (cCity !== cityOpt.city && cCity !== "unknown") continue;
          if (cCity === "unknown" && cityOpt.city !== "istanbul") continue;
          pushClinic({
            id: String(clinic.id || clinic.clinicSlug || clinic.clinicName),
            name: String(clinic.clinicName || clinic.name || "Clinic"),
            slug: clinic.clinicSlug,
            city: cityOpt.city,
            side: clinicSide(clinic),
          });
        }
      }
    }
  }

  const preferred = ["istanbul", "izmir", "antalya", "ankara", "kocaeli"];
  const cities = Array.from(cityGroups.values()).sort((a, b) => {
    const ai = preferred.indexOf(a.city);
    const bi = preferred.indexOf(b.city);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return {
    treatmentBranch: branch,
    treatmentLabel: treatmentLabel(branch, locale),
    cityFilter,
    sideFilter,
    cities,
    totalClinics: cities.reduce((n, g) => n + g.clinics.length, 0),
    citySummaryOnly: Boolean(params.citySummaryOnly),
  };
}

/** Format a concise discovery reply. No consent/intake language. */
export function formatFeelinHealthyDiscoveryReply(
  result: FeelinHealthyDiscoveryResult,
  locale: string = "tr"
): string {
  const isEn = locale.toLowerCase().startsWith("en");
  const label = result.treatmentLabel;

  if (result.cities.length === 0 || result.totalClinics === 0) {
    return isEn
      ? `I checked our connected FeelinHealthy network for ${label}, but I can't show an active partner option for that combination right now. If you share another city or treatment area, I can look again — or we can start a quote request when you're ready.`
      : `${label} için FeelinHealthy ağına bağlı aktif bir seçenek şu an bulamadım. Başka bir şehir veya tedavi alanı paylaşırsanız yeniden bakabilirim; hazırsanız fiyat/teklif sürecine de geçebiliriz.`;
  }

  if (result.citySummaryOnly || (!result.cityFilter && result.totalClinics > 6)) {
    const cityNames = result.cities.map((c) => c.displayName).join(isEn ? ", " : ", ");
    return isEn
      ? `Yes — FeelinHealthy has connected clinics for ${label}. Current partner cities include ${cityNames}. Tell me a city (or treatment detail) and I’ll narrow the list.`
      : `Evet. FeelinHealthy ağına bağlı ${label} hizmeti sunan kliniklerimiz bulunuyor. Uygun seçenekler ${cityNames} gibi şehirlerde yer alabiliyor. İsterseniz ilgilendiğiniz işlemi veya şehri belirtin, seçenekleri daraltayım.`;
  }

  if (result.cityFilter && result.cities.length === 1) {
    const group = result.cities[0];
    const names = group.clinics.map((c) => c.name).join(isEn ? ", " : ", ");
    const sideBit =
      result.sideFilter === "european"
        ? isEn
          ? " (European Side)"
          : " (Avrupa Yakası)"
        : result.sideFilter === "anatolian"
          ? isEn
            ? " (Anatolian Side)"
            : " (Anadolu Yakası)"
          : "";
    return isEn
      ? `In ${group.displayName}${sideBit}, connected options for ${label} include: ${names}. If you’d like pricing or a personalized shortlist, say so and we’ll continue with a short intake.`
      : `${group.displayName}${sideBit} için ${label} alanında bağlı seçenekler: ${names}. Fiyat almak veya size özel kısa bir liste isterseniz söylemeniz yeterli; kısa bir intake ile devam ederiz.`;
  }

  const blocks = result.cities.map((g) => {
    const lines = g.clinics.map((c) => `- ${c.name}`).join("\n");
    return `${g.displayName}\n${lines}`;
  });

  return isEn
    ? `FeelinHealthy connected options for ${label} are available in these cities:\n\n${blocks.join("\n\n")}\n\nTell me a city or procedure to narrow this further — or ask for a quote when you’re ready.`
    : `FeelinHealthy ağına bağlı ${label} seçenekleri şu şehirlerde bulunuyor:\n\n${blocks.join("\n\n")}\n\nİsterseniz ilgilendiğiniz şehir veya işlemi seçerek daraltabiliriz. Fiyat/teklif istediğinizde de devam ederiz.`;
}

/**
 * Process explanation shown only when entering transactional intake.
 * Mentions guest max-2 and registration path for more comparisons.
 */
export function getTransactionalIntakePreamble(locale: string = "tr"): string {
  const isEn = locale.toLowerCase().startsWith("en");
  const max = FEELINHEALTHY_CONFIG.maxGuestClinics;
  if (isEn) {
    return (
      `To identify suitable clinics and pass your quote or appointment request correctly, we’ll collect a few short details in steps. ` +
      `At this stage I can recommend up to ${max} matching clinics. To request quotes from more providers and compare options, you can continue with a free account. ` +
      `We’ll start with basic profile details, then contact information, and finally your travel plan.`
    );
  }
  return (
    `Size uygun klinikleri belirleyebilmemiz ve fiyat/randevu talebinizi doğru şekilde iletebilmemiz için birkaç kısa adımda temel bilgilerinizi alacağız. ` +
    `İlk aşamada size en fazla ${max} uygun klinik önerebiliyoruz. Daha fazla klinikten teklif almak ve karşılaştırma yapabilmek için üyelik üzerinden devam edebilirsiniz. ` +
    `Önce temel profil bilgilerinizi, ardından iletişim bilgilerinizi ve son olarak seyahat planınızı alacağız.`
  );
}

/** Persist discovery context without starting consent/intake. */
export function applyDiscoveryContextToSession(
  sessionContext: AgencySessionStateInput,
  classification: FeelinHealthyIntentClassification
): AgencySessionState {
  const next = normalizeAgencySessionState(sessionContext);
  next.conversationMode = "information";
  next.discoveryActive = true;
  next.intakeInformationOnly = true;
  if (classification.treatmentBranch) {
    next.lastTreatmentCategory = classification.treatmentBranch;
  }
  if (classification.city) {
    next.selectedCity = classification.city;
    next.lastLocation = getCityDisplayName(classification.city, "tr");
    next.locationSelectionConfirmed = true;
  }
  if (
    classification.side === "european" ||
    classification.side === "anatolian" ||
    classification.side === "any" ||
    classification.side === "unsure"
  ) {
    next.istanbul_side = classification.side;
    if (classification.side === "european" || classification.side === "anatolian") {
      next.sideSelectionConfirmed = true;
    }
  }
  return normalizeAgencySessionState(next);
}

/** Enter transactional mode while preserving discovery treatment/city/side. */
export function beginTransactionalFromDiscovery(
  sessionContext: AgencySessionStateInput
): AgencySessionState {
  const next = normalizeAgencySessionState(sessionContext);
  next.conversationMode = "quote";
  delete next.discoveryActive;
  delete next.intakeInformationOnly;
  delete next.workflowPaused;
  return normalizeAgencySessionState(next);
}

export function isFeelinHealthyDiscoveryIntent(
  classification: FeelinHealthyIntentClassification
): boolean {
  return classification.isDiscovery === true && classification.isTransactional !== true;
}
