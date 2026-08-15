/**
 * Minimal patient-facing failure taxonomy for agency surfaces.
 *
 * INFORMATIONAL — knowledge/LLM could not answer; state must stay intact.
 * TRANSACTIONAL — consent/lead/quote/selection mutation failed; no fake success.
 * MATCHING_NO_RESULT — empty eligible set (not a technical outage).
 * UNKNOWN — catch-all system failure.
 *
 * Prefer structured categories over parsing error message strings.
 */

import type { ResolvedAgencyBrand } from "./resolveAgencyBrand";

export type PatientFacingFailureKind =
  | "informational"
  | "transactional"
  | "matching_no_result"
  | "unknown";

export interface PatientFacingFailureCopy {
  kind: PatientFacingFailureKind;
  reply: string;
  /** Optional CTA URL when informational + agency website configured. */
  websiteUrl?: string;
}

export function buildInformationalFailureCopy(params: {
  locale?: string;
  brand?: Pick<ResolvedAgencyBrand, "displayName" | "websiteUrl"> | null;
}): PatientFacingFailureCopy {
  const isEn = String(params.locale || "tr").toLowerCase().startsWith("en");
  const brandName = params.brand?.displayName;
  const websiteUrl = params.brand?.websiteUrl;

  if (websiteUrl && brandName) {
    return {
      kind: "informational",
      websiteUrl,
      reply: isEn
        ? `I can't give a detailed answer on this right now. You can find more information on the ${brandName} website.`
        : `Bu konuda şu anda detaylı yanıt veremiyorum. Daha fazla bilgi için ${brandName} web sitesini inceleyebilirsiniz.`,
    };
  }

  return {
    kind: "informational",
    reply: isEn
      ? "I can't give a reliable answer on this right now. Please ask again in a moment, or rephrase your question."
      : "Bu konuda şu anda güvenilir bir yanıt veremiyorum. Lütfen biraz sonra yeniden sorun veya sorunuzu farklı şekilde ifade edin.",
  };
}

export function buildTransactionalFailureCopy(params: {
  locale?: string;
  /** Optional domain hint for clearer copy (quote / lead / consent). */
  operation?: "quote" | "lead" | "consent" | "selection" | "general";
}): PatientFacingFailureCopy {
  const isEn = String(params.locale || "tr").toLowerCase().startsWith("en");
  const op = params.operation || "general";

  if (op === "quote") {
    return {
      kind: "transactional",
      reply: isEn
        ? "We could not save your quote request right now. Please try again shortly — your previous request was not completed."
        : "Teklif talebinizi şu anda kaydedemedik. Lütfen kısa süre sonra yeniden deneyin — talebiniz tamamlanmadı.",
    };
  }
  if (op === "lead") {
    return {
      kind: "transactional",
      reply: isEn
        ? "We could not save your request right now. Please try again shortly — nothing was submitted."
        : "Talebinizi şu anda kaydedemedik. Lütfen kısa süre sonra yeniden deneyin — işlem tamamlanmadı.",
    };
  }
  if (op === "consent") {
    return {
      kind: "transactional",
      reply: isEn
        ? "We could not record your consent right now. Please try again before continuing."
        : "Onayınızı şu anda kaydedemedik. Devam etmeden önce lütfen yeniden deneyin.",
    };
  }
  if (op === "selection") {
    return {
      kind: "transactional",
      reply: isEn
        ? "We could not update your clinic selection right now. Please try again."
        : "Klinik seçiminizi şu anda güncelleyemedik. Lütfen yeniden deneyin.",
    };
  }

  return {
    kind: "transactional",
    reply: isEn
      ? "That action could not be completed. Please try again shortly."
      : "Bu işlem tamamlanamadı. Lütfen kısa süre sonra yeniden deneyin.",
  };
}

export function buildUnknownFailureCopy(params: {
  locale?: string;
}): PatientFacingFailureCopy {
  const isEn = String(params.locale || "tr").toLowerCase().startsWith("en");
  return {
    kind: "unknown",
    reply: isEn
      ? "Something went wrong on our side. Please try again in a moment."
      : "Bir sorun oluştu. Lütfen kısa bir süre sonra yeniden deneyin.",
  };
}

/**
 * Client catch helper: classify by which operation the UI was attempting.
 * Never treat a failed quote/lead as a soft informational website CTA.
 */
export function resolveClientCatchFailure(params: {
  locale?: string;
  operation?: "chat" | "quote" | "lead" | "consent" | "selection" | "unknown";
  brand?: Pick<ResolvedAgencyBrand, "displayName" | "websiteUrl"> | null;
}): PatientFacingFailureCopy {
  const op = params.operation || "unknown";
  if (op === "chat") {
    return buildInformationalFailureCopy({
      locale: params.locale,
      brand: params.brand,
    });
  }
  if (op === "quote" || op === "lead" || op === "consent" || op === "selection") {
    return buildTransactionalFailureCopy({
      locale: params.locale,
      operation: op,
    });
  }
  return buildUnknownFailureCopy({ locale: params.locale });
}
