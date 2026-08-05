/**
 * Canonical FeelinHealthy clinic-card action contracts.
 *
 * select_clinic / view_clinic_details / request_quote are separate operations.
 * Quote persistence must never run for select_clinic or view_clinic_details.
 */

import { enterClinicCoordinator } from "./assistantModes";
import { FEELINHEALTHY_CONFIG } from "./feelinhealthyConfig";
import type { AgencySessionState, AgencySessionStateInput } from "./agencySessionState";
import {
  getAgencySelectedClinicIds,
  getAgencySessionId,
  normalizeAgencySessionState,
} from "./agencySessionState";

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
  sessionContext: AgencySessionState;
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
 * - flattened body { action: "select_clinic", clinicId } when action is a string field
 */
export function parseClinicCardAction(raw: any): ClinicCardActionPayload | null {
  if (!raw || typeof raw !== "object") return null;

  let action: ClinicCardActionType | null = null;
  if (isClinicCardActionType(raw.action)) {
    action = raw.action;
  } else if (raw.type === "clinic_selected" || raw.type === "select_clinic") {
    action = "select_clinic";
  } else if (raw.type === "clinic_info" || raw.type === "view_clinic_details") {
    action = "view_clinic_details";
  } else if (raw.type === "lead_capture" || raw.type === "request_quote") {
    action = "request_quote";
  }

  if (!action) return null;

  const clinicId = String(raw.clinicId || raw.id || "").trim();
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

/** Resolve a clinic from the full agency pool by id first, then name. */
export function resolveClinicFromPool(
  clinics: any[],
  opts: { clinicId?: string | null; clinicName?: string | null }
): any | null {
  const pool = Array.isArray(clinics) ? clinics : [];
  const id = String(opts.clinicId || "").trim();
  if (id) {
    const byId = pool.find(
      (c) =>
        String(c?.id || "") === id ||
        String(c?.clinicId || "") === id ||
        String(c?.clinicSlug || "") === id ||
        String(c?.slug || "") === id
    );
    if (byId) return byId;
  }

  const name = String(opts.clinicName || "").trim().toLowerCase();
  if (!name) return null;
  return (
    pool.find((c) => {
      const clinicName = String(c?.clinicName || c?.name || "").toLowerCase();
      if (!clinicName) return false;
      return clinicName.includes(name) || name.includes(clinicName.split(" ")[0] || "___");
    }) || null
  );
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
  sessionContext: AgencySessionStateInput,
  key: string
): boolean {
  const list = Array.isArray(sessionContext[PROCESSED_KEY])
    ? (sessionContext[PROCESSED_KEY] as string[])
    : [];
  return list.includes(key);
}

export function markClinicCardActionProcessed(
  sessionContext: AgencySessionStateInput,
  key: string
): AgencySessionState {
  const prev = Array.isArray(sessionContext[PROCESSED_KEY])
    ? (sessionContext[PROCESSED_KEY] as string[])
    : [];
  const next = [...prev.filter((k) => k !== key), key].slice(-MAX_PROCESSED);
  return normalizeAgencySessionState({
    ...sessionContext,
    [PROCESSED_KEY]: next,
    lastStructuredActionId: key,
  });
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
  sessionContext: AgencySessionStateInput
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
  sessionContext: AgencySessionStateInput;
  clinicId: string;
  clinicName?: string;
  locale?: string;
}): ClinicCardActionResult {
  const locale = (params.locale || "tr").toLowerCase().startsWith("en") ? "en" : "tr";
  const ctx = normalizeAgencySessionState(params.sessionContext);
  const name = params.clinicName || ctx.selectedClinicName || "Selected clinic";
  const next = enterClinicCoordinator(ctx, {
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
  sessionContext: AgencySessionStateInput;
  clinicId: string;
  clinicName?: string;
  clinicSlug?: string;
  profilePath?: string;
  locale?: string;
}): ClinicCardActionResult {
  const next = normalizeAgencySessionState(params.sessionContext);
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
  sessionContext: AgencySessionStateInput;
  clinicId: string;
  clinicName?: string;
  locale?: string;
}): ClinicCardActionResult {
  const locale = (params.locale || "tr").toLowerCase().startsWith("en") ? "en" : "tr";
  const limit = resolveGuestQuoteClinicLimit();
  const next = normalizeAgencySessionState(params.sessionContext);

  const stage = String(next.leadStage || "");
  if (
    next.quoteRequestLocked === true ||
    stage === "quote_request_created" ||
    stage === "completed"
  ) {
    return {
      kind: "error",
      httpStatus: 409,
      reply:
        locale === "en"
          ? "Your quote request is already registered. You don’t need to submit another one — ask here if you have questions about next steps."
          : "Teklif talebiniz zaten kaydedildi. Yeniden göndermenize gerek yok — süreç hakkında sorularınız varsa buradan sorabilirsiniz.",
      type: "text",
      sessionContext: {
        ...next,
        quoteRequestLocked: true,
        leadStage: stage === "completed" ? "completed" : "quote_request_created",
      },
      showClinicCards: true,
      shouldCreateNewLead: false,
      shouldPersistQuote: false,
    };
  }

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

  const existing = getAgencySelectedClinicIds(next);
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

/**
 * Deterministic handlers for the guest "Nasıl ilerlemek istersiniz?" panel.
 * These must early-return (no LLM) — otherwise hard-gates / mode overwrite make
 * the buttons appear broken.
 */
export function handleClinicSelectionPanelAction(params: {
  type: "clinic_selection_mode" | "clinic_selection_update" | "clinic_selection_complete";
  mode?: "automatic" | "manual" | string | null;
  action?: "select" | "deselect" | string | null;
  clinicId?: string | null;
  clinicName?: string | null;
  recommendedClinicIds?: string[] | null;
  sessionContext: AgencySessionStateInput;
  locale?: string;
}): ClinicCardActionResult {
  const locale = (params.locale || "tr").toLowerCase().startsWith("en") ? "en" : "tr";
  const limit = resolveGuestQuoteClinicLimit();
  const next = normalizeAgencySessionState(params.sessionContext);
  const recommended = Array.from(
    new Set(
      [
        ...(Array.isArray(params.recommendedClinicIds) ? params.recommendedClinicIds : []),
        ...(Array.isArray(next.lastRecommendedClinicIds) ? next.lastRecommendedClinicIds : []),
      ]
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );
  if (recommended.length > 0) {
    next.lastRecommendedClinicIds = recommended;
  }

  if (params.type === "clinic_selection_mode") {
    if (params.mode === "automatic") {
      const picked = recommended.slice(0, limit);
      next.clinicSelectionMode = "automatic";
      next.clinicSelectionStatus = "in_progress";
      next.selectedClinicIds = picked;
      if (picked[0]) {
        next.lastFocusedClinicId = picked[0];
      }
      return {
        kind: "handled",
        reply:
          locale === "en"
            ? `I've selected ${picked.length} matching clinic${picked.length === 1 ? "" : "s"} for you. Tap “Confirm selection and continue” to submit your quote request, or switch to manual selection to change clinics.`
            : `Sizin için uygun ${picked.length} kliniği seçtim. Teklif talebini göndermek için “Seçimi Onayla ve Devam Et”e basın; değiştirmek isterseniz “Klinikleri tek tek seç”e geçebilirsiniz.`,
        type: "text",
        sessionContext: next,
        showClinicCards: true,
        shouldCreateNewLead: false,
        shouldPersistQuote: false,
      };
    }

    next.clinicSelectionMode = "manual";
    next.clinicSelectionStatus = "in_progress";
    // Keep any existing picks when switching to manual.
    return {
      kind: "handled",
      reply:
        locale === "en"
          ? `Select up to ${limit} clinics from the cards above, then tap “Complete selection and continue”.`
          : `Yukarıdaki kartlardan en fazla ${limit} klinik seçin, ardından “Seçimi Tamamla ve Devam Et”e basın.`,
      type: "text",
      sessionContext: next,
      showClinicCards: true,
      shouldCreateNewLead: false,
      shouldPersistQuote: false,
    };
  }

  if (params.type === "clinic_selection_update") {
    next.clinicSelectionMode = "manual";
    next.clinicSelectionStatus = "in_progress";
    const current = new Set<string>(getAgencySelectedClinicIds(next));
    const clinicId = String(params.clinicId || "").trim();
    const clinicName = String(params.clinicName || "Klinik");

    if (!clinicId) {
      return {
        kind: "error",
        httpStatus: 400,
        reply: locale === "en" ? "Clinic id is missing." : "Klinik bilgisi eksik.",
        type: "text",
        sessionContext: next,
        showClinicCards: true,
        shouldCreateNewLead: false,
        shouldPersistQuote: false,
      };
    }

    if (params.action === "select") {
      if (!current.has(clinicId) && current.size >= limit) {
        return {
          kind: "error",
          httpStatus: 400,
          reply:
            locale === "en"
              ? `You can select up to ${limit} clinics. Remove one to add another.`
              : `En fazla ${limit} klinik seçebilirsiniz. Yeni eklemek için bir seçimi kaldırın.`,
          type: "text",
          sessionContext: next,
          showClinicCards: true,
          shouldCreateNewLead: false,
          shouldPersistQuote: false,
        };
      }
      current.add(clinicId);
      next.lastFocusedClinicId = clinicId;
      next.lastFocusedClinicName = clinicName;
    } else if (params.action === "deselect") {
      current.delete(clinicId);
    }

    next.selectedClinicIds = Array.from(current);
    return {
      kind: "handled",
      reply:
        locale === "en"
          ? `Selection updated (${next.selectedClinicIds.length}/${limit}).`
          : `Seçiminiz güncellendi (${next.selectedClinicIds.length}/${limit}).`,
      type: "text",
      sessionContext: next,
      showClinicCards: true,
      shouldCreateNewLead: false,
      shouldPersistQuote: false,
    };
  }

  // clinic_selection_complete — array is authoritative (incl. empty).
  const selected = getAgencySelectedClinicIds(next).slice(0, limit);

  if (selected.length === 0) {
    const fallback = recommended.slice(0, limit);
    if (fallback.length === 0) {
      return {
        kind: "error",
        httpStatus: 400,
        reply:
          locale === "en"
            ? "Please select at least one clinic before continuing."
            : "Devam etmek için lütfen en az bir klinik seçin.",
        type: "text",
        sessionContext: next,
        showClinicCards: true,
        shouldCreateNewLead: false,
        shouldPersistQuote: false,
      };
    }
    next.selectedClinicIds = fallback;
  } else {
    next.selectedClinicIds = selected;
  }

  next.clinicSelectionStatus = "completed";
  next.clinicSelectionMode = next.clinicSelectionMode || "manual";
  next.lastFocusedClinicId = next.selectedClinicIds[0];
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
          ? "Your clinic selection is saved. To complete the quote request we need a valid email address."
          : "Klinik seçiminiz kaydedildi. Teklif talebini tamamlamak için geçerli bir e-posta adresine ihtiyacımız var.",
      type: "email_request",
      sessionContext: next,
      showClinicCards: false,
      shouldCreateNewLead: false,
      shouldPersistQuote: false,
      clinicIdsForQuote: next.selectedClinicIds,
    };
  }

  return {
    kind: "handled",
    reply:
      locale === "en"
        ? `Great — I'll submit your quote request for ${next.selectedClinicIds.length} clinic(s) now.`
        : `Harika — ${next.selectedClinicIds.length} klinik için teklif talebinizi şimdi oluşturuyorum.`,
    type: "text",
    sessionContext: next,
    showClinicCards: false,
    shouldCreateNewLead: false,
    shouldPersistQuote: true,
    clinicIdsForQuote: next.selectedClinicIds,
  };
}

export function isClinicSelectionPanelAction(raw: any): boolean {
  const type = raw?.type || raw?.action;
  return (
    type === "clinic_selection_mode" ||
    type === "clinic_selection_update" ||
    type === "clinic_selection_complete"
  );
}

export function requestQuoteSuccessCopy(locale: string, clinicName?: string): string {
  const isEn = locale.toLowerCase().startsWith("en");
  const clinicBit = clinicName
    ? isEn
      ? ` for ${clinicName}`
      : ` (${clinicName})`
    : "";

  if (isEn) {
    return [
      `Your quote request${clinicBit} has been created successfully.`,
      ``,
      `What happens next:`,
      `1. The FeelinHealthy team is reviewing your request and preferences.`,
      `2. A confirmation with a short process summary will be sent to your registered email.`,
      `3. The team will contact you with clinic options and the next steps.`,
      ``,
      `You do not need to submit the same request again. Meanwhile, feel free to ask here about the clinic, treatment process, pricing, or travel.`,
    ].join("\n");
  }

  return [
    `Teklif talebiniz başarıyla oluşturuldu${clinicBit}.`,
    ``,
    `Şimdi ne olacak:`,
    `1. FeelinHealthy ekibi talebinizi ve tercihlerinizi inceliyor.`,
    `2. Kayıtlı e-posta adresinize onay ve kısa süreç özeti iletilecek.`,
    `3. Ekip sizinle iletişime geçerek klinik seçenekleri ve sonraki adımları paylaşacak.`,
    ``,
    `Aynı talep için yeniden yazmanıza gerek yok. Bu arada klinik, tedavi süreci, fiyatlandırma veya seyahat hakkında sorularınız varsa buradan sorabilirsiniz.`,
  ].join("\n");
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
  sessionContext: AgencySessionStateInput;
}): ClinicCardActionResult {
  // Canonical session id for idempotency only — not tenant/consent authorization.
  const conversationId = String(getAgencySessionId(params.sessionContext) || "unknown");
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
      sessionContext: normalizeAgencySessionState(params.sessionContext),
      shouldCreateNewLead: false,
      shouldPersistQuote: false,
    };
  }

  let result: ClinicCardActionResult;
  switch (params.payload.action) {
    case "select_clinic":
      result = handleSelectClinic({
        sessionContext: normalizeAgencySessionState(params.sessionContext),
        clinicId: params.payload.clinicId,
        clinicName: params.payload.clinicName,
        locale: params.payload.locale,
      });
      break;
    case "view_clinic_details":
      result = handleViewClinicDetails({
        sessionContext: normalizeAgencySessionState(params.sessionContext),
        clinicId: params.payload.clinicId,
        clinicName: params.payload.clinicName,
        clinicSlug: params.payload.clinicSlug,
        profilePath: params.payload.profilePath,
        locale: params.payload.locale,
      });
      break;
    case "request_quote":
      result = prepareRequestQuote({
        sessionContext: normalizeAgencySessionState(params.sessionContext),
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
        sessionContext: normalizeAgencySessionState(params.sessionContext),
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
