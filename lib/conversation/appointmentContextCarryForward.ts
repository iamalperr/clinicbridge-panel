/**
 * Deterministic appointment treatment context carry-forward.
 *
 * When a patient discusses one unambiguous clinic treatment and later starts
 * booking (e.g. only supplies date/time), promote that treatment into the
 * appointment draft instead of re-asking "which treatment?".
 *
 * Conservative: multi-treatment mentions are ambiguous and do NOT carry forward.
 * Current-message explicit treatment always wins via SlotExtractor / IntentRouter.
 * Product-global — no clinic-specific logic.
 */

import { SlotExtractor, CANONICAL_TREATMENTS } from "./slotExtractor";

export type TreatmentCarryForwardSource = "draft" | "history" | "none";

export interface TreatmentCarryForwardResult {
  /** Canonical treatment id when unambiguous; null when missing or ambiguous. */
  treatmentId: string | null;
  ambiguous: boolean;
  source: TreatmentCarryForwardSource;
  reason: string;
}

function normalizeServiceKey(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Map a draft requestedService (id or localized display label) to a canonical id.
 */
export function matchCanonicalTreatmentId(
  requestedService: string | null | undefined
): string | null {
  if (!requestedService || !String(requestedService).trim()) return null;
  const raw = String(requestedService).trim();
  const lower = raw.toLowerCase();
  const byId = CANONICAL_TREATMENTS.find((t) => t.id === lower || t.id === raw);
  if (byId) return byId.id;

  const norm = normalizeServiceKey(raw);
  for (const t of CANONICAL_TREATMENTS) {
    if (normalizeServiceKey(t.displayName.tr) === norm) return t.id;
    if (normalizeServiceKey(t.displayName.en) === norm) return t.id;
    for (const kw of t.keywords) {
      if (normalizeServiceKey(kw) === norm) return t.id;
    }
  }

  // Fallback: parse as free text (single match only)
  const parsed = SlotExtractor.parseAllCanonicalTreatments(lower);
  if (parsed.length === 1) return parsed[0].id;
  return null;
}

/**
 * Resolve the last unambiguous treatment context for appointment booking.
 *
 * Priority:
 * 1. Existing appointmentDraft.requestedService (already canonical booking state)
 * 2. Latest user history turn that mentions treatment(s)
 *    - exactly one → carry that id
 *    - more than one → ambiguous (do not guess)
 */
export function resolveAppointmentTreatmentCarryForward(params: {
  draftRequestedService?: string | null;
  history?: Array<{ role?: string; content?: string }> | null;
  locale?: string;
}): TreatmentCarryForwardResult {
  const draftId = matchCanonicalTreatmentId(params.draftRequestedService);
  if (draftId) {
    return {
      treatmentId: draftId,
      ambiguous: false,
      source: "draft",
      reason: "draft_requested_service",
    };
  }

  // Non-canonical but non-empty draft service: treat as already established free-text
  // treatment so we do not re-ask or overwrite with history.
  if (params.draftRequestedService && String(params.draftRequestedService).trim()) {
    return {
      treatmentId: String(params.draftRequestedService).trim(),
      ambiguous: false,
      source: "draft",
      reason: "draft_free_text_service",
    };
  }

  const history = Array.isArray(params.history) ? params.history : [];
  const locale = params.locale || "tr";

  let lastTreatmentId: string | null = null;
  let lastAmbiguous = false;

  for (const turn of history) {
    if (!turn || turn.role !== "user" || typeof turn.content !== "string") continue;
    const content = turn.content.trim();
    if (!content) continue;

    const { extracted } = SlotExtractor.extractSlots(content, {}, locale);
    const extras = ((extracted as any).additionalTreatments as string[] | undefined) || [];
    if (!extracted.treatment) continue;

    if (extras.length > 0) {
      lastTreatmentId = null;
      lastAmbiguous = true;
      continue;
    }

    lastTreatmentId = extracted.treatment;
    lastAmbiguous = false;
  }

  if (lastAmbiguous) {
    return {
      treatmentId: null,
      ambiguous: true,
      source: "history",
      reason: "ambiguous_multi_treatment_in_history",
    };
  }

  if (lastTreatmentId) {
    return {
      treatmentId: lastTreatmentId,
      ambiguous: false,
      source: "history",
      reason: "last_unambiguous_user_treatment",
    };
  }

  return {
    treatmentId: null,
    ambiguous: false,
    source: "none",
    reason: "no_treatment_context",
  };
}
