/**
 * Treatment-scoped quote cycle helpers for FeelinHealthy (and compatible agency guests).
 *
 * Quote lock is keyed by canonical treatment branch (normalizeTreatmentBranch),
 * not by the whole conversation. Historical quotes remain intact; a genuinely
 * different treatment opens a new quote cycle under the same lead/conversation.
 */

import {
  normalizeTreatmentBranch,
  UNKNOWN_TREATMENT_BRANCH,
} from "./feelinhealthyConfig";
import {
  type AgencySessionState,
  type AgencySessionStateInput,
  getAgencyTreatmentContext,
  normalizeAgencySessionState,
} from "./agencySessionState";

export type TreatmentQuoteRecord = {
  quoteId: string;
  leadId?: string;
};

export type QuotesByTreatmentKey = Record<string, TreatmentQuoteRecord>;

/** Canonical quote-cycle key for a treatment label, or null if unknown/unsupported. */
export function resolveTreatmentQuoteKey(
  treatment?: string | null
): string | null {
  const raw = String(treatment || "").trim();
  if (!raw) return null;
  const branch = normalizeTreatmentBranch(raw);
  if (!branch || branch === UNKNOWN_TREATMENT_BRANCH) return null;
  return branch;
}

export function getCurrentTreatmentQuoteKey(
  sessionContext?: AgencySessionStateInput | null
): string | null {
  const cat = getAgencyTreatmentContext(sessionContext || {}).category;
  return resolveTreatmentQuoteKey(cat);
}

export function getQuotesByTreatmentKey(
  sessionContext?: AgencySessionStateInput | null
): QuotesByTreatmentKey {
  const raw = (sessionContext as any)?.quotesByTreatmentKey;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: QuotesByTreatmentKey = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = resolveTreatmentQuoteKey(k) || String(k || "").trim();
    if (!key || !v || typeof v !== "object") continue;
    const quoteId = String((v as any).quoteId || "").trim();
    if (!quoteId) continue;
    const leadId = String((v as any).leadId || "").trim() || undefined;
    out[key] = leadId ? { quoteId, leadId } : { quoteId };
  }
  return out;
}

/**
 * Seed a legacy single-quote session into the treatment map using the treatment
 * that owned the quote (typically the previous branch right before a switch).
 */
export function ensureLegacyQuoteMappedToTreatment(
  sessionContext: AgencySessionStateInput,
  treatmentKey: string | null | undefined
): AgencySessionState {
  const next = { ...normalizeAgencySessionState(sessionContext) } as AgencySessionState;
  const key = resolveTreatmentQuoteKey(treatmentKey);
  if (!key) return next;

  const map = getQuotesByTreatmentKey(next);
  if (map[key]?.quoteId) {
    next.quotesByTreatmentKey = map;
    if (!next.lastQuotedTreatmentKey) next.lastQuotedTreatmentKey = key;
    return normalizeAgencySessionState(next);
  }

  const locked =
    next.quoteRequestLocked === true ||
    next.leadStage === "quote_request_created" ||
    next.leadStage === "completed";
  if (!locked) return next;

  const quoteId =
    String(next.quoteId || "").trim() || `legacy_locked:${key}`;
  map[key] = {
    quoteId,
    ...(next.leadId ? { leadId: String(next.leadId) } : {}),
  };
  next.quotesByTreatmentKey = map;
  next.lastQuotedTreatmentKey = key;
  if (!next.quoteId) next.quoteId = quoteId;
  return normalizeAgencySessionState(next);
}

export function hasCompletedQuoteForTreatment(
  sessionContext: AgencySessionStateInput | null | undefined,
  treatmentKey: string | null | undefined
): boolean {
  const key = resolveTreatmentQuoteKey(treatmentKey);
  if (!key) return false;
  const mapped = getQuotesByTreatmentKey(sessionContext);
  if (mapped[key]?.quoteId) return true;

  const ctx = sessionContext || {};
  const locked =
    ctx.quoteRequestLocked === true ||
    ctx.leadStage === "quote_request_created" ||
    ctx.leadStage === "completed";
  if (!locked) return false;

  const lastKey = resolveTreatmentQuoteKey((ctx as any).lastQuotedTreatmentKey);
  if (lastKey) return lastKey === key;

  // Pre-patch single-quote sessions: global lock applies to the active treatment
  // until a treatment switch maps it via ensureLegacyQuoteMappedToTreatment.
  if (Object.keys(mapped).length === 0) {
    const current = getCurrentTreatmentQuoteKey(ctx);
    return Boolean(current && current === key);
  }
  return false;
}

/**
 * CTA / backend lock for the *current* treatment only.
 * Unknown current treatment: do not invent a lock from a prior different cycle.
 */
export function isCurrentTreatmentQuoteLocked(
  sessionContext?: AgencySessionStateInput | null
): boolean {
  const ctx = sessionContext || {};
  const key = getCurrentTreatmentQuoteKey(ctx);
  if (key) return hasCompletedQuoteForTreatment(ctx, key);

  // No resolvable current treatment — preserve legacy global lock only when
  // there is no treatment-scoped map yet (pre-patch sessions mid-quote).
  const map = getQuotesByTreatmentKey(ctx);
  if (Object.keys(map).length > 0) return false;
  return (
    ctx.quoteRequestLocked === true ||
    ctx.leadStage === "quote_request_created" ||
    ctx.leadStage === "completed"
  );
}

/** Align quoteRequestLocked / leadStage / quoteId pointer with current treatment. */
export function syncQuoteLockForCurrentTreatment(
  sessionContext: AgencySessionStateInput
): AgencySessionState {
  const next = { ...normalizeAgencySessionState(sessionContext) } as AgencySessionState;
  const key = getCurrentTreatmentQuoteKey(next);
  let map = getQuotesByTreatmentKey(next);

  if (key && hasCompletedQuoteForTreatment(next, key)) {
    // Materialize legacy lock into the map when missing.
    if (!map[key]?.quoteId) {
      const quoteId =
        String(next.quoteId || "").trim() || `legacy_locked:${key}`;
      map = {
        ...map,
        [key]: {
          quoteId,
          ...(next.leadId ? { leadId: String(next.leadId) } : {}),
        },
      };
    }
    next.quotesByTreatmentKey = map;
    next.quoteRequestLocked = true;
    if (next.leadStage !== "completed") next.leadStage = "quote_request_created";
    next.quoteId = map[key].quoteId;
    if (map[key].leadId) next.leadId = map[key].leadId;
    next.lastQuotedTreatmentKey = key;
    return normalizeAgencySessionState(next);
  }

  next.quotesByTreatmentKey = map;
  if (key) {
    // Current treatment has no completed quote — unlock for a new cycle.
    next.quoteRequestLocked = false;
    if (next.leadStage === "quote_request_created") {
      next.leadStage = "recommendation";
    }
    // Keep leadId (same patient). Clear active quote pointer so UI does not
    // treat the prior treatment's quote as the current cycle.
    delete next.quoteId;
    return normalizeAgencySessionState(next);
  }

  return normalizeAgencySessionState(next);
}

/**
 * After a successful persist: record the treatment-scoped quote and lock CTA
 * for that treatment only.
 */
export function recordTreatmentQuoteSuccess(
  sessionContext: AgencySessionStateInput,
  params: {
    treatment?: string | null;
    quoteId: string;
    leadId?: string | null;
  }
): AgencySessionState {
  const next = { ...normalizeAgencySessionState(sessionContext) } as AgencySessionState;
  const key =
    resolveTreatmentQuoteKey(params.treatment) ||
    getCurrentTreatmentQuoteKey(next);
  const quoteId = String(params.quoteId || "").trim();
  if (!quoteId) return next;

  const map = getQuotesByTreatmentKey(next);
  if (key) {
    map[key] = {
      quoteId,
      ...(params.leadId ? { leadId: String(params.leadId) } : next.leadId ? { leadId: String(next.leadId) } : {}),
    };
    next.quotesByTreatmentKey = map;
    next.lastQuotedTreatmentKey = key;
  }
  next.quoteId = quoteId;
  if (params.leadId) next.leadId = String(params.leadId);
  next.quoteRequestLocked = true;
  next.leadStage = "quote_request_created";
  return normalizeAgencySessionState(next);
}

/**
 * When the treatment branch changes: clear matching/selection ephemerals and
 * re-sync quote lock for the new treatment. Preserves identity, consent, lead.
 */
export function applyTreatmentQuoteCycleOnBranchChange(
  sessionContext: AgencySessionStateInput,
  params: {
    previousBranch?: string | null;
    nextBranch?: string | null;
  }
): AgencySessionState {
  let next = { ...normalizeAgencySessionState(sessionContext) } as AgencySessionState;

  // Attribute any legacy single quote to the treatment we are leaving.
  if (params.previousBranch) {
    next = ensureLegacyQuoteMappedToTreatment(next, params.previousBranch);
  }

  // Ephemeral matching / selection for the previous treatment only.
  delete next.lastRecommendedClinicIds;
  delete next.selectedClinicIds;
  delete next.selectedClinicId;
  delete next.selectedClinicName;
  delete next.lastFocusedClinicId;
  delete next.lastFocusedClinicName;
  delete next.clinicSelectionMode;
  delete next.clinicSelectionStatus;
  delete next.__fhQuoteRequestedByCardAction;
  next.postQuoteRematchRequested = true;
  next.__forceClinicMatching = true;

  return syncQuoteLockForCurrentTreatment(next);
}

/** True when two treatment labels share the same quote-cycle key. */
export function isSameTreatmentQuoteCycle(
  a?: string | null,
  b?: string | null
): boolean {
  const ka = resolveTreatmentQuoteKey(a);
  const kb = resolveTreatmentQuoteKey(b);
  return Boolean(ka && kb && ka === kb);
}
