/**
 * Canonical FeelinHealthy clinic-card action contracts.
 *
 * select_clinic / view_clinic_details / request_quote are separate operations.
 * Quote persistence must never run for select_clinic or view_clinic_details.
 */

import { enterClinicCoordinator } from "./assistantModes";
import { FEELINHEALTHY_CONFIG } from "./feelinhealthyConfig";

export const CLINIC_CARD_ACTIONS = [
  "select_clinic",
  "view_clinic_details",
  "request_quote",
] as const;

export type ClinicCardActionType = (typeof CLINIC_CARD_ACTIONS)[number];

export interface ClinicCardActionPayload {
  action: ClinicCardActionType;
  clinicId: string;
  actionId: string;
  clinicName?: string;
  clinicSlug?: string;
  locale?: string;
  profilePath?: string;
}

export interface ClinicCardActionResult {
  kind: "handled" | "noop" | "error";
  httpStatus?: number;
  reply?: string;
  type?: string;
  sessionContext: Record<string, any>;
  showClinicCards?: boolean;
  shouldCreateNewLead?: boolean;
  shouldUpdateLead?: boolean;
  profileUrl?: string | null;
  openProfileInNewTab?: boolean;
  leadId?: string;
  quoteId?: string;
  quotePersistError?: string;
  /** When true, route must call persistAgencyQuoteRequest before responding. */
  shouldPersistQuote?: boolean;
  clinicIdsForQuote?: string[];
}

const PROCESSED_KEY = "processedClinicCardActionIds";
const MAX_PROCESSED = 40;

export function isClinicCardActionType(value: unknown): value is ClinicCardActionType {
  return CLINIC_CARD_ACTIONS.includes(value as ClinicCardActionType);
}

/**
 * Normalize action payload from either:
 * - { action: "select_clinic", clinicId, actionId }
 * - legacy { type: "clinic_selected" | "clinic_info" | "lead_capture", clinicId }
 */
export function parseClinicCardAction(raw: any): ClinicCardActionPayload | null {
  if (!raw || typeof raw !== "object") return null;

  let action: ClinicCardActionType | null = null;
  if (isClinicCardActionType(raw.action)) {
    action = raw.action;
  } else if (raw.type === "clinic_selected") {
    action = "select_clinic";
  } else if (raw.type === "clinic_info") {
    action = "view_clinic_details";
  } else if (raw.type === "lead_capture") {
    action = "request_quote";
  }

  if (!action) return null;

  const clinicId = String(raw.clinicId || "").trim();
  if (!clinicId) return null;

  const actionId = String(
    raw.actionId || raw.idempotencyKey || `${action}:${clinicId}:${Date.now()}`
  ).trim();

  return {
    action,
    clinicId,
    actionId,
    clinicName: raw.clinicName ? String(raw.clinicName) : undefined,
    clinicSlug: raw.clinicSlug ? String(raw.clinicSlug) : undefined,
    locale: raw.locale ? String(raw.locale) : undefined,
    profilePath: raw.profilePath ? String(raw.profilePath) : undefined,
  };
}

export function buildClinicCardActionKey(
  conversationId: string,
  clinicId: string,
  action: ClinicCardActionType,
  actionId: string
): string {
  return `${conversationId}|${clinicId}|${action}|${actionId}`;
}

export function hasProcessedClinicCardAction(
  sessionContext: Record<string, any>,
  key: string
): boolean {
  const list = Array.isArray(sessionContext[PROCESSED_KEY])
    ? (sessionContext[PROCESSED_KEY] as string[])
    : [];
  return list.includes(key);
}

export function markClinicCardActionProcessed(
  sessionContext: Record<string, any>,
  key: string
): Record<string, any> {
  const prev = Array.isArray(sessionContext[PROCESSED_KEY])
    ? (sessionContext[PROCESSED_KEY] as string[])
    : [];
  const next = [...prev.filter((k) => k !== key), key].slice(-MAX_PROCESSED);
  return { ...sessionContext, [PROCESSED_KEY]: next, lastStructuredActionId: key };
}

export function resolveGuestQuoteClinicLimit(): number {
  return (
    FEELINHEALTHY_CONFIG.guestQuoteClinicSelectionLimit ||
    FEELINHEALTHY_CONFIG.maxGuestClinics ||
    2
  );
}

export function buildCanonicalClinicProfileUrl(params: {
  clinicSlug?: string | null;
  clinicId: string;
  profilePath?: string | null;
}): string {
  if (params.profilePath && String(params.profilePath).startsWith("http")) {
    return String(params.profilePath);
  }
  if (params.profilePath && String(params.profilePath).startsWith("/")) {
    return String(params.profilePath);
  }
  const slug = String(params.clinicSlug || params.clinicId || "").trim();
  return `/agency-demo/medicalcenter/${encodeURIComponent(slug || params.clinicId)}`;
}

function clinicBelongsToRecommendationSet(
  clinicId: string,
  sessionContext: Record<string, any>
): boolean {
  const recommended = Array.isArray(sessionContext.lastRecommendedClinicIds)
    ? sessionContext.lastRecommendedClinicIds.map(String)
    : [];
  if (recommended.length === 0) return true; // soft allow when set unknown
  return recommended.includes(clinicId);
}

/**
 * Pure select_clinic handler — never creates a quote.
 */
export function handleSelectClinic(params: {
  sessionContext: Record<string, any>;
  clinicId: string;
  clinicName?: string;
  locale?: string;
}): ClinicCardActionResult {
  const locale = (params.locale || "tr").toLowerCase().startsWith("en") ? "en" : "tr";
  const name = params.clinicName || params.sessionContext.selectedClinicName || "Selected clinic";
  const next = enterClinicCoordinator(params.sessionContext, {
    id: params.clinicId,
    name,
  });
  next.conversationStage = "selected_clinic";

  return {
    kind: "handled",
    reply:
      locale === "en"
        ? "Great — we're continuing with this clinic. You can ask about the clinic, doctors, treatment process, pricing, or appointments."
        : "Harika, bu klinikle devam ediyoruz. Klinik, doktorlar, tedavi süreci, fiyatlandırma veya randevu hakkında merak ettiklerinizi sorabilirsiniz.",
    type: "clinic_selected",
    sessionContext: next,
    showClinicCards: false,
    shouldCreateNewLead: false,
    shouldUpdateLead: false,
    shouldPersistQuote: false,
  };
}

/**
 * Pure view_clinic_details handler — no selection, no quote.
 */
export function handleViewClinicDetails(params: {
  sessionContext: Record<string, any>;
  clinicId: string;
  clinicName?: string;
  clinicSlug?: string;
  profilePath?: string;
  locale?: string;
}): ClinicCardActionResult {
  const next = { ...params.sessionContext };
  // Soft focus only — do not enter coordinator / do not change leadStage.
  next.lastFocusedClinicId = params.clinicId;
  next.lastFocusedClinicName =
    params.clinicName || next.lastFocusedClinicName || next.selectedClinicName;

  const profileUrl = buildCanonicalClinicProfileUrl({
    clinicId: params.clinicId,
    clinicSlug: params.clinicSlug,
    profilePath: params.profilePath,
  });

  return {
    kind: "handled",
    // No chat failure / quote copy — optional quiet confirmation for a11y.
    reply: undefined,
    type: "clinic_details",
    sessionContext: next,
    showClinicCards: true,
    shouldCreateNewLead: false,
    shouldUpdateLead: false,
    shouldPersistQuote: false,
    profileUrl,
    openProfileInNewTab: true,
  };
}

/**
 * request_quote — prepares clinic IDs for persistence; does not enter coordinator.
 * Caller persists quote and fills success/error reply.
 */
export function prepareRequestQuote(params: {
  sessionContext: Record<string, any>;
  clinicId: string;
  clinicName?: string;
  locale?: string;
}): ClinicCardActionResult {
  const locale = (params.locale || "tr").toLowerCase().startsWith("en") ? "en" : "tr";
  const limit = resolveGuestQuoteClinicLimit();
  const next = { ...params.sessionContext };

  if (!clinicBelongsToRecommendationSet(params.clinicId, next)) {
    return {
      kind: "error",
      httpStatus: 400,
      reply:
        locale === "en"
          ? "This clinic is not part of your current recommendations."
          : "Bu klinik mevcut öneri listenizde yer almıyor.",
      type: "text",
      sessionContext: next,
      showClinicCards: true,
      shouldCreateNewLead: false,
      shouldPersistQuote: false,
    };
  }

  const existing = Array.isArray(next.selectedClinicIds)
    ? next.selectedClinicIds.map(String).filter(Boolean)
    : [];
  const merged = Array.from(new Set([...existing, params.clinicId]));

  if (merged.length > limit) {
    // Preserve first N; reject third with controlled message.
    return {
      kind: "error",
      httpStatus: 400,
      reply:
        locale === "en"
          ? `You can select up to ${limit} clinics for quote comparison.`
          : `Teklif karşılaştırması için en fazla ${limit} klinik seçebilirsiniz.`,
      type: "text",
      sessionContext: {
        ...next,
        // Keep prior selections — do not silently replace.
        selectedClinicIds: existing.slice(0, limit),
      },
      showClinicCards: true,
      shouldCreateNewLead: false,
      shouldPersistQuote: false,
    };
  }

  next.selectedClinicIds = merged;
  // Track quote target without switching into selected_clinic consultation mode.
  next.lastFocusedClinicId = params.clinicId;
  next.lastFocusedClinicName = params.clinicName || next.lastFocusedClinicName;
  next.__fhQuoteRequestedByCardAction = true;

  const emailOk =
    next.patientEmailStatus === "verified_format" ||
    String(next.patientEmail || "").includes("@");

  if (!emailOk) {
    next.leadStage = "collecting_email";
    return {
      kind: "handled",
      reply:
        locale === "en"
          ? "To complete your quote request we need a valid email address."
          : "Teklif talebinizi tamamlamak için geçerli bir e-posta adresine ihtiyacımız var.",
      type: "email_request",
      sessionContext: next,
      showClinicCards: false,
      shouldCreateNewLead: false,
      shouldPersistQuote: false,
      clinicIdsForQuote: merged,
    };
  }

  return {
    kind: "handled",
    sessionContext: next,
    showClinicCards: false,
    shouldCreateNewLead: false,
    shouldPersistQuote: true,
    clinicIdsForQuote: merged,
    type: "text",
  };
}

export function requestQuoteSuccessCopy(locale: string, clinicName?: string): string {
  const isEn = locale.toLowerCase().startsWith("en");
  if (isEn) {
    return clinicName
      ? `Your quote request for ${clinicName} has been created successfully. The FeelinHealthy team will review it and contact you shortly.`
      : "Your quote request has been created successfully. The FeelinHealthy team will review it and contact you shortly.";
  }
  return clinicName
    ? `Teklif talebiniz başarıyla oluşturuldu (${clinicName}). FeelinHealthy ekibi talebinizi inceleyerek sizinle iletişime geçecektir.`
    : "Teklif talebiniz başarıyla oluşturuldu. FeelinHealthy ekibi talebinizi inceleyerek sizinle iletişime geçecektir.";
}

export function requestQuoteFailureCopy(locale: string): string {
  return locale.toLowerCase().startsWith("en")
    ? "We could not save your quote request right now. Please try again shortly."
    : "Teklif talebinizi şu anda kaydedemedik. Lütfen kısa süre sonra yeniden deneyin.";
}

/**
 * Top-level pure router for clinic card actions (before DB persist).
 */
export function routeClinicCardAction(params: {
  payload: ClinicCardActionPayload;
  sessionContext: Record<string, any>;
}): ClinicCardActionResult {
  const conversationId = String(
    params.sessionContext.sessionId || params.sessionContext.conversationId || "unknown"
  );
  const key = buildClinicCardActionKey(
    conversationId,
    params.payload.clinicId,
    params.payload.action,
    params.payload.actionId
  );

  if (hasProcessedClinicCardAction(params.sessionContext, key)) {
    return {
      kind: "noop",
      type: "noop",
      sessionContext: params.sessionContext,
      shouldCreateNewLead: false,
      shouldPersistQuote: false,
    };
  }

  let result: ClinicCardActionResult;
  switch (params.payload.action) {
    case "select_clinic":
      result = handleSelectClinic({
        sessionContext: params.sessionContext,
        clinicId: params.payload.clinicId,
        clinicName: params.payload.clinicName,
        locale: params.payload.locale,
      });
      break;
    case "view_clinic_details":
      result = handleViewClinicDetails({
        sessionContext: params.sessionContext,
        clinicId: params.payload.clinicId,
        clinicName: params.payload.clinicName,
        clinicSlug: params.payload.clinicSlug,
        profilePath: params.payload.profilePath,
        locale: params.payload.locale,
      });
      break;
    case "request_quote":
      result = prepareRequestQuote({
        sessionContext: params.sessionContext,
        clinicId: params.payload.clinicId,
        clinicName: params.payload.clinicName,
        locale: params.payload.locale,
      });
      break;
    default:
      return {
        kind: "error",
        httpStatus: 400,
        reply: "Unsupported clinic card action",
        type: "text",
        sessionContext: params.sessionContext,
      };
  }

  // Mark processed for successful mutations and controlled errors that already mutated nothing harmful.
  if (result.kind === "handled" || result.kind === "error") {
    result = {
      ...result,
      sessionContext: markClinicCardActionProcessed(result.sessionContext, key),
    };
  }

  return result;
}
