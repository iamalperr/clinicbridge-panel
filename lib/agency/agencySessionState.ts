/**
 * Canonical agency chat session state (Phase 1–5).
 *
 * Flat serialized shape — field names match current `sessionContext` JSON.
 * Nested v2 redesign is deferred until adapters exist.
 *
 * VERSIONING / MIGRATION BOUNDARY
 * -------------------------------
 * - Version 1 keeps flat legacy aliases on the wire.
 * - Accessors provide a canonical in-memory interpretation.
 * - Phase 5 adds optional additive `fieldProvenance` (no Firestore migration).
 * - Future version 2 may serialize nested state through adapters.
 * - Old clients remain supported.
 *
 * CLIENT TRUST BOUNDARY
 * ---------------------
 * `sessionContext` is round-tripped through the client and is therefore
 * untrusted input. `normalizeAgencySessionState` / `mergeAgencySessionState`
 * provide structure only — not authorization.
 *
 * Backend-hard checks still required for:
 * - consent (verifyAcceptedAgencyConsent / ensureAcceptedConsentForPersistence)
 * - tenant/agency access
 * - clinic eligibility
 * - lead / quote persistence
 *
 * Client fields such as `quoteConsent`, `selectedClinicIds`,
 * `quoteRequestLocked`, or client-claimed `fieldProvenance` must never
 * authorize writes by themselves. Client provenance is sanitized at the
 * API boundary (`sanitizeClientAgencyFieldProvenance`).
 *
 * ALIAS PRECEDENCE (Phase 2)
 * --------------------------
 * 1. Backend-verified values outrank client-only values (not applied here —
 *    accessors never claim verification).
 * 2. Explicit structured fields outrank free-form aliases.
 * 3. Non-empty canonical values are not replaced by empty legacy values.
 * 4. Explicit false and numeric zero are preserved.
 * 5. Valid ID arrays outrank weaker single-value aliases.
 * 6. Legacy fields remain serialized; accessors only interpret.
 * 7. Normalization may mirror a missing canonical from a non-conflicting alias
 *    (additive only). It never manufactures consent, clinic selection, or
 *    quote locks.
 *
 * FIELD PROVENANCE (Phase 5)
 * --------------------------
 * Optional `fieldProvenance` records source/confidence for a scoped set of
 * fields. Provenance is structural metadata only — never consent, eligibility,
 * or persistence authorization. Source strength (strongest → weakest):
 * backend_verified > structured_action > user_explicit > persisted_state >
 * system_derived > llm_extracted > legacy_client.
 */

/** Current canonical session state version (numeric). */
export const AGENCY_SESSION_STATE_VERSION = 1 as const;

export type AgencyLeadStage =
  | "discovery"
  | "recommendation"
  | "clinic_selected"
  | "lead_capture"
  | "collecting_email"
  | "collecting_consent"
  | "quote_request_created"
  | "completed";

export type AgencyPatientEmailStatus =
  | "missing"
  | "collected"
  | "invalid"
  | "verified_format";

export type AgencyClinicSelectionMode = "automatic" | "manual" | "assisted";

export type AgencyClinicSelectionStatus =
  | "not_started"
  | "in_progress"
  | "completed";

export type AgencyProcessingMode = "degraded" | "normal";

export type AgencyIstanbulSide =
  | "european"
  | "anatolian"
  | "unsure"
  | "any"
  | null;

export type AgencyIstanbulSideSource =
  | "explicit_text"
  | "structured_card"
  | "district_cue"
  | "airport_cue"
  | "branch_implicit"
  | null;

/** FeelinHealthy intake group number (serialized flat on session). */
export type AgencyIntakeGroupNumber = 1 | 2 | 3 | "completed";

// ─── Phase 5 field provenance ──────────────────────────────────────────────

/** Where a scoped session field value originated. */
export type AgencyFieldSource =
  | "user_explicit"
  | "llm_extracted"
  | "structured_action"
  | "backend_verified"
  | "system_derived"
  | "legacy_client"
  | "persisted_state";

/** Relative trust / certainty for a field value (structural only). */
export type AgencyFieldConfidence = "low" | "medium" | "high" | "verified";

/**
 * Additive provenance for one field. JSON-serializable; ISO timestamps only.
 * Never authorizes consent, eligibility, or persistence by itself.
 */
export type AgencyFieldProvenance = {
  source: AgencyFieldSource;
  confidence: AgencyFieldConfidence;
  updatedAt?: string;
  verifiedAt?: string;
  actor?: string;
  note?: string;
};

/**
 * First-scope provenance fields (Phase 5).
 * Likely sources (documentation only):
 * - selectedCity: user_explicit | llm_extracted | structured_action | backend_verified
 * - istanbul_side: user_explicit | structured_action | system_derived
 * - patientName/email/phone: user_explicit | structured_action | legacy_client
 * - lastTreatmentCategory / lastSubTreatment: user_explicit | llm_extracted | structured_action | backend_verified
 * - travelDate: user_explicit | llm_extracted | structured_action
 * - selectedClinicIds: structured_action | backend_verified | legacy_client
 */
export const AGENCY_PROVENANCE_SCOPED_FIELDS = [
  "selectedCity",
  "istanbul_side",
  "patientName",
  "patientEmail",
  "patientPhone",
  "lastTreatmentCategory",
  "lastSubTreatment",
  "travelDate",
  "selectedClinicIds",
] as const;

export type AgencyProvenanceFieldKey = (typeof AGENCY_PROVENANCE_SCOPED_FIELDS)[number];

/**
 * Known session fields, grouped for documentation only.
 * Serialization remains a flat object (no nested v2 shape in Phase 1–5).
 */
export interface AgencySessionStateKnown {
  // ── identity / session metadata ──────────────────────────────────────────
  /** Canonical session version. Legacy payloads without it normalize to current. */
  stateVersion?: number;
  /** Canonical session identity. */
  sessionId?: string;
  /** Legacy alias of sessionId (quote-request / some clients). */
  conversationId?: string;
  language?: string;
  isGuestUser?: boolean;
  processingMode?: AgencyProcessingMode;
  /** Legacy persistence helper may read this; keep as unknown for Date/string. */
  createdAt?: string | unknown;

  /**
   * Optional additive provenance map (Phase 5).
   * Keys are field names; unknown valid keys are preserved.
   * Client-round-tripped claims are untrusted — sanitize at API boundary.
   */
  fieldProvenance?: Record<string, AgencyFieldProvenance>;

  // ── patient intake ───────────────────────────────────────────────────────
  /** Canonical full name. */
  patientName?: string;
  patientEmail?: string;
  patientEmailStatus?: AgencyPatientEmailStatus | string;
  patientPhone?: string;
  patientCountry?: string;
  /** Canonical age (zero is valid). */
  patientAge?: number;
  /** Canonical gender. */
  patientGender?: string;
  /** Name-part aliases — used only when patientName is missing. */
  firstName?: string;
  lastName?: string;
  /** Legacy duplicate of patientAge. */
  age?: number;
  /** Legacy duplicate of patientGender. */
  gender?: string;
  /** Canonical travel date string. */
  travelDate?: string;
  /** Legacy travel window start (weakly typed). */
  travelDateStart?: string;
  /** Legacy free-text travel answer. */
  travelDateText?: string;
  missingLeadField?: string;
  emailValidationFails?: number;

  // ── treatment ────────────────────────────────────────────────────────────
  /** Canonical treatment category / branch. */
  lastTreatmentCategory?: string;
  /** Subcategory — not an alias of lastTreatmentCategory. */
  lastSubTreatment?: string;
  /** Weakly typed / legacy treatment id (often same string as category). */
  treatmentId?: string;

  // ── location ─────────────────────────────────────────────────────────────
  lastLocation?: string;
  /** Canonical city id (e.g. istanbul). */
  selectedCity?: string | null;
  locationSelectionConfirmed?: boolean;
  sideSelectionConfirmed?: boolean;
  availableCities?: string[];
  pendingCitySelection?: boolean;
  /** Canonical Istanbul side (snake_case — matching-chat writers). */
  istanbul_side?: AgencyIstanbulSide;
  /** CamelCase alias; readers should use getAgencyIstanbulSide. */
  istanbulSide?: string | null;
  istanbul_side_source?: AgencyIstanbulSideSource;
  pendingSideClarification?: boolean;
  pendingSideGuidance?: boolean;

  // ── matching ─────────────────────────────────────────────────────────────
  /** Canonical recommended clinic id list. */
  lastRecommendedClinicIds?: string[];
  /** Occasional legacy alias of lastRecommendedClinicIds. */
  recommendedClinicIds?: string[];
  lastFocusedClinicId?: string;
  lastFocusedClinicName?: string;

  // ── clinic selection ─────────────────────────────────────────────────────
  /** Singleton / coordinator primary clinic. */
  selectedClinicId?: string;
  selectedClinicName?: string;
  /** Canonical multi-select list (empty array is a valid "none selected" when set). */
  selectedClinicIds?: string[];
  clinicSelectionMode?: AgencyClinicSelectionMode | string | null;
  clinicSelectionStatus?: AgencyClinicSelectionStatus | string;
  showProfileLinks?: boolean;

  // ── consent (client-mirrored; never authorizes persistence alone) ─────────
  quoteConsent?: boolean;
  /** Client-mirrored consent version string; backend consent service is source of truth. */
  consentVersion?: string;
  /** Weakly typed machine mirror; do not treat as verified DB consent. */
  consentStatus?: string;

  // ── lead / quote ─────────────────────────────────────────────────────────
  leadStage?: AgencyLeadStage | string;
  /** Canonical lead document id. */
  leadId?: string;
  quoteId?: string;
  /** Soft display reference — weaker than leadId. */
  leadReference?: string;
  quoteRequestLocked?: boolean;
  /**
   * After a successful quote, patient explicitly asked to search again / change
   * location or clinics. Historical lead/quote ids stay intact; matching
   * ephemeral state may be refreshed. Never authorizes a second auto-quote.
   */
  postQuoteRematchRequested?: boolean;
  /**
   * Idempotency: membership/upsell assistant bubble already emitted for this
   * conversation's successful quote (keyed by quoteId when available).
   */
  postQuoteMembershipMessageSent?: boolean;
  postQuoteMembershipKey?: string;
  /** Internal card-action marker (FeelinHealthy). */
  __fhQuoteRequestedByCardAction?: boolean;
  /** Internal matching restart marker (FeelinHealthy). */
  __forceClinicMatching?: boolean;

  // ── conversation control ─────────────────────────────────────────────────
  pendingUserMessage?: string;
  pendingHealthRequest?: string;
  conversationStage?: string;
  intakeStage?: AgencyIntakeGroupNumber;
  lastStructuredActionId?: string;
  /** FeelinHealthy clinic-card idempotency bag. */
  processedClinicCardActionIds?: string[];

  /**
   * Conversation Architecture V2 — additive UX metadata only.
   * Does not authorize matching, consent, or persistence.
   */
  conversationMode?: string;
  workflowPaused?: boolean;
  pausedConversationMode?: string;
  resumeIntakeGroup?: AgencyIntakeGroupNumber;
  resumePromptKey?: string;
  pauseReason?: string;
  /** Short truncated question text for resume context — avoid storing full PII dumps. */
  lastAnsweredUserQuestion?: string;
  /** One-time quote-flow explanation already shown. */
  quoteFlowExplained?: boolean;
  /** One-time appointment-flow explanation already shown. */
  appointmentFlowExplained?: boolean;
  /** Explain-before-ask: three-step process intro already shown. */
  intakeProcessExplained?: boolean;
  /** Explain-before-ask: Group 1 purpose explanation already shown. */
  intakeGroup1Explained?: boolean;
  /** Explain-before-ask: Group 2 purpose explanation already shown. */
  intakeGroup2Explained?: boolean;
  /** Explain-before-ask: Group 3 purpose explanation already shown. */
  intakeGroup3Explained?: boolean;
  /** Last Group ask fingerprint — avoid verbatim repeats after interruptions. */
  lastIntakeAskKey?: string;
  /** User prefers information-only; pause personal-data collection. */
  intakeInformationOnly?: boolean;

  // ── empty-match recovery ─────────────────────────────────────────────────
  pendingLocationExpansion?: boolean;
  pendingLocationExpansionTarget?: string;
  pendingLocationBranch?: string;
  lastEmptyMatchKey?: string;

  // ── UI / derived (weakly typed, may be set by policy compilers) ───────────
  /** Derived assistant role; weakly typed string to avoid circular imports. */
  assistantRole?: string;
}

/**
 * Canonical agency session state (flat serialized shape).
 *
 * Unknown legacy/extension keys are preserved at runtime by normalize/merge
 * spreads. They are not modeled via an index signature here, because an index
 * signature of `unknown` would widen every known property access to `unknown`
 * and break existing call sites.
 */
export type AgencySessionState = AgencySessionStateKnown;

/** Partial / untrusted input (client body, legacy persistence, patches). */
export type AgencySessionStateInput = AgencySessionState | Record<string, unknown>;

/** Input that may also be null/undefined (normalize entrypoints). */
export type AgencySessionStateInputMaybe = AgencySessionStateInput | null | undefined;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function asRecord(input: AgencySessionStateInputMaybe): Record<string, unknown> {
  return isPlainObject(input) ? (input as Record<string, unknown>) : {};
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function isValidIstanbulSide(value: unknown): value is Exclude<AgencyIstanbulSide, null> {
  return (
    value === "european" ||
    value === "anatolian" ||
    value === "unsure" ||
    value === "any"
  );
}

function uniqueStringIds(values: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const id = nonEmptyString(v);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Structural type guard — does not validate business rules or authorize writes.
 */
export function isAgencySessionState(value: unknown): value is AgencySessionState {
  return isPlainObject(value);
}

/**
 * Create an empty canonical session with the current state version.
 */
export function createAgencySessionState(
  seed?: AgencySessionStateInputMaybe
): AgencySessionState {
  return normalizeAgencySessionState(seed ?? {});
}

/**
 * Additive alias mirroring only when the canonical field is missing and the
 * alias does not conflict. Never invents consent, clinic selection, or locks.
 */
function mirrorMissingAliases(state: AgencySessionState): AgencySessionState {
  const out = { ...(state as Record<string, unknown>) } as AgencySessionState;

  // sessionId ← conversationId
  if (!nonEmptyString(out.sessionId) && nonEmptyString(out.conversationId)) {
    out.sessionId = String(out.conversationId).trim();
  }

  // istanbul_side ← istanbulSide
  if (
    (out.istanbul_side === undefined || out.istanbul_side === null) &&
    isValidIstanbulSide(out.istanbulSide)
  ) {
    out.istanbul_side = out.istanbulSide;
  }

  // patientName ← firstName + lastName
  if (!nonEmptyString(out.patientName)) {
    const parts = [nonEmptyString(out.firstName), nonEmptyString(out.lastName)].filter(
      Boolean
    ) as string[];
    if (parts.length > 0) out.patientName = parts.join(" ");
  }

  // patientAge ← age (including 0)
  if (
    (out.patientAge === undefined || out.patientAge === null) &&
    typeof out.age === "number" &&
    Number.isFinite(out.age)
  ) {
    out.patientAge = out.age;
  }

  // patientGender ← gender
  if (!nonEmptyString(out.patientGender) && nonEmptyString(out.gender)) {
    out.patientGender = String(out.gender).trim();
  }

  // selectedClinicIds ← [selectedClinicId] only when the array field is absent
  if (out.selectedClinicIds === undefined && nonEmptyString(out.selectedClinicId)) {
    out.selectedClinicIds = [String(out.selectedClinicId).trim()];
  }

  // lastRecommendedClinicIds ← recommendedClinicIds when canonical list absent
  if (
    out.lastRecommendedClinicIds === undefined &&
    Array.isArray(out.recommendedClinicIds)
  ) {
    out.lastRecommendedClinicIds = uniqueStringIds(out.recommendedClinicIds);
  }

  // travelDate ← travelDateStart / travelDateText
  if (!nonEmptyString(out.travelDate)) {
    const travelAlias =
      nonEmptyString(out.travelDateStart) || nonEmptyString(out.travelDateText);
    if (travelAlias) out.travelDate = travelAlias;
  }

  // Do NOT mirror quoteConsent ↔ consentStatus
  // Do NOT mirror treatment certainty between treatmentId / lastTreatmentCategory
  // Do NOT invent selected clinics when selectedClinicIds is explicitly []

  return out;
}

/**
 * Structural normalize only — not policy enforcement.
 *
 * - Accepts unknown / partial input
 * - Preserves existing valid values (including explicit false, 0, [])
 * - Does not invent consent acceptance
 * - Does not reset clinic selection, quote locks, city, side, treatment, or intake
 * - Preserves unknown legacy keys
 * - Adds `stateVersion` when missing
 * - Optionally mirrors missing canonicals from non-conflicting aliases
 */
export function normalizeAgencySessionState(
  input: AgencySessionStateInputMaybe
): AgencySessionState {
  if (!isPlainObject(input)) {
    return { stateVersion: AGENCY_SESSION_STATE_VERSION };
  }

  const out = { ...(input as Record<string, unknown>) } as AgencySessionState;

  const existingVersion = out.stateVersion;
  if (typeof existingVersion !== "number" || !Number.isFinite(existingVersion)) {
    out.stateVersion = AGENCY_SESSION_STATE_VERSION;
  }

  // Structural provenance cleanup only — does not downgrade client trust claims
  // (that happens in sanitizeClientAgencyFieldProvenance at the API boundary).
  if (out.fieldProvenance !== undefined) {
    const cleaned = sanitizeAgencyFieldProvenanceMap(out.fieldProvenance);
    if (cleaned) out.fieldProvenance = cleaned;
    else delete out.fieldProvenance;
  }

  return mirrorMissingAliases(out);
}

/**
 * Conservative merge: undefined patch fields are ignored; explicit false / 0 / []
 * and intentional nulls are applied. Result is normalized.
 */
export function mergeAgencySessionState(
  current: AgencySessionStateInputMaybe,
  patch: AgencySessionStateInputMaybe
): AgencySessionState {
  const base = normalizeAgencySessionState(current);
  if (!isPlainObject(patch)) {
    return base;
  }

  const merged = {
    ...(base as Record<string, unknown>),
  } as AgencySessionState;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    (merged as Record<string, unknown>)[key] = value;
  }
  return normalizeAgencySessionState(merged);
}

function sanitizeJsonValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    if (seen.has(value)) return undefined;
    seen.add(value);
    return value
      .map((item) => sanitizeJsonValue(item, seen))
      .filter((item) => item !== undefined);
  }

  if (typeof value === "object") {
    if (seen.has(value as object)) return undefined;
    seen.add(value as object);
    if (!isPlainObject(value)) {
      return undefined;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const next = sanitizeJsonValue(v, seen);
      if (next !== undefined) out[k] = next;
    }
    return out;
  }

  return undefined;
}

/**
 * Return a plain JSON-safe object suitable for API `sessionContext` payloads.
 * Omits undefined (and non-JSON values). Does not invent business defaults.
 * Does not delete legacy alias fields.
 */
export function serializeAgencySessionState(
  input: AgencySessionStateInputMaybe
): AgencySessionState {
  const normalized = normalizeAgencySessionState(input);
  const sanitized = sanitizeJsonValue(normalized, new WeakSet()) as
    | Record<string, unknown>
    | undefined;
  if (!sanitized || !isPlainObject(sanitized)) {
    return { stateVersion: AGENCY_SESSION_STATE_VERSION };
  }
  return normalizeAgencySessionState(sanitized);
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 2 — Canonical accessors (pure; never authorize persistence)
// ═══════════════════════════════════════════════════════════════════════════

/** sessionId outranks conversationId; conversationId-only still resolves. */
export function getAgencySessionId(input: AgencySessionStateInputMaybe): string | undefined {
  const r = asRecord(input);
  return nonEmptyString(r.sessionId) || nonEmptyString(r.conversationId);
}

/**
 * istanbul_side (structured snake_case) outranks istanbulSide (camelCase).
 * Empty/invalid values do not erase a valid counterpart.
 */
export function getAgencyIstanbulSide(
  input: AgencySessionStateInputMaybe
): AgencyIstanbulSide | undefined {
  const r = asRecord(input);
  if (isValidIstanbulSide(r.istanbul_side)) return r.istanbul_side;
  if (r.istanbul_side === null) return null;
  if (isValidIstanbulSide(r.istanbulSide)) return r.istanbulSide;
  if (r.istanbulSide === null) return null;
  return undefined;
}

/** patientName outranks firstName/lastName composition. */
export function getAgencyPatientName(input: AgencySessionStateInputMaybe): string | undefined {
  const r = asRecord(input);
  const full = nonEmptyString(r.patientName);
  if (full) return full;
  const parts = [nonEmptyString(r.firstName), nonEmptyString(r.lastName)].filter(
    Boolean
  ) as string[];
  return parts.length > 0 ? parts.join(" ") : undefined;
}

/** patientAge outranks age; zero is preserved. */
export function getAgencyPatientAge(input: AgencySessionStateInputMaybe): number | undefined {
  const r = asRecord(input);
  if (typeof r.patientAge === "number" && Number.isFinite(r.patientAge)) return r.patientAge;
  if (typeof r.age === "number" && Number.isFinite(r.age)) return r.age;
  return undefined;
}

/** patientGender outranks gender. */
export function getAgencyPatientGender(input: AgencySessionStateInputMaybe): string | undefined {
  const r = asRecord(input);
  return nonEmptyString(r.patientGender) || nonEmptyString(r.gender);
}

/**
 * selectedClinicIds outranks selectedClinicId.
 * - If selectedClinicIds is an array (including []), that list is authoritative.
 * - Else fall back to [selectedClinicId] when present.
 * Does not expand selection when the singleton conflicts with the list.
 */
export function getAgencySelectedClinicIds(input: AgencySessionStateInputMaybe): string[] {
  const r = asRecord(input);
  if (Array.isArray(r.selectedClinicIds)) {
    return uniqueStringIds(r.selectedClinicIds);
  }
  const single = nonEmptyString(r.selectedClinicId);
  return single ? [single] : [];
}

/** lastRecommendedClinicIds outranks recommendedClinicIds. */
export function getAgencyRecommendedClinicIds(input: AgencySessionStateInputMaybe): string[] {
  const r = asRecord(input);
  if (Array.isArray(r.lastRecommendedClinicIds)) {
    return uniqueStringIds(r.lastRecommendedClinicIds);
  }
  if (Array.isArray(r.recommendedClinicIds)) {
    return uniqueStringIds(r.recommendedClinicIds);
  }
  return [];
}

export interface AgencyTreatmentContext {
  category?: string;
  subcategory?: string;
  treatmentId?: string;
}

/**
 * Treatment context without inventing certainty.
 * category ← lastTreatmentCategory || treatmentId (string presence only)
 * subcategory ← lastSubTreatment (separate concept)
 */
export function getAgencyTreatmentContext(
  input: AgencySessionStateInputMaybe
): AgencyTreatmentContext {
  const r = asRecord(input);
  const category =
    nonEmptyString(r.lastTreatmentCategory) || nonEmptyString(r.treatmentId);
  return {
    category,
    subcategory: nonEmptyString(r.lastSubTreatment),
    treatmentId: nonEmptyString(r.treatmentId),
  };
}

/** selectedCity only — does not invent city from lastLocation display text. */
export function getAgencySelectedCity(
  input: AgencySessionStateInputMaybe
): string | null | undefined {
  const r = asRecord(input);
  if (r.selectedCity === null) return null;
  return nonEmptyString(r.selectedCity);
}

/** travelDate outranks travelDateStart / travelDateText. */
export function getAgencyTravelDate(input: AgencySessionStateInputMaybe): string | undefined {
  const r = asRecord(input);
  return (
    nonEmptyString(r.travelDate) ||
    nonEmptyString(r.travelDateStart) ||
    nonEmptyString(r.travelDateText)
  );
}

/** leadId outranks leadReference. */
export function getAgencyLeadId(input: AgencySessionStateInputMaybe): string | undefined {
  const r = asRecord(input);
  return nonEmptyString(r.leadId) || nonEmptyString(r.leadReference);
}

export interface AgencyClientConsentHint {
  /**
   * Structural client hint only — NOT verified consent.
   * Persistence must still call verifyAcceptedAgencyConsent.
   */
  clientAcceptedHint: boolean | null;
  quoteConsent?: boolean;
  consentStatus?: string;
  conflict: boolean;
}

/**
 * Interpret client consent aliases without authorizing persistence.
 * Fail-closed on conflicts: rejected/declined status beats quoteConsent=true.
 */
export function getAgencyClientConsentHint(
  input: AgencySessionStateInputMaybe
): AgencyClientConsentHint {
  const r = asRecord(input);
  const quoteConsent = typeof r.quoteConsent === "boolean" ? r.quoteConsent : undefined;
  const consentStatus = nonEmptyString(r.consentStatus);
  const statusLower = (consentStatus || "").toLowerCase();
  const statusRejected =
    statusLower === "rejected" ||
    statusLower === "declined" ||
    statusLower === "decline" ||
    statusLower === "revoked";
  const statusAccepted =
    statusLower === "accepted" || statusLower === "accept";

  let conflict = false;
  if (quoteConsent === true && statusRejected) conflict = true;
  if (quoteConsent === false && statusAccepted) conflict = true;

  let clientAcceptedHint: boolean | null = null;
  if (statusRejected || quoteConsent === false) {
    clientAcceptedHint = false;
  } else if (quoteConsent === true || statusAccepted) {
    clientAcceptedHint = true;
  }

  return {
    clientAcceptedHint,
    quoteConsent,
    consentStatus,
    conflict,
  };
}

export type AgencySessionAliasConflictCode =
  | "session_id_mismatch"
  | "istanbul_side_mismatch"
  | "selected_clinic_mismatch"
  | "patient_name_mismatch"
  | "consent_alias_mismatch"
  | "age_mismatch"
  | "gender_mismatch";

export interface AgencySessionAliasConflict {
  code: AgencySessionAliasConflictCode;
  fields: string[];
  detail: string;
}

/**
 * Non-authoritative conflict diagnostics for duplicated aliases.
 * Pure — no logging side effects. Does not authorize or mutate state.
 */
export function detectAgencySessionAliasConflicts(
  input: AgencySessionStateInputMaybe
): AgencySessionAliasConflict[] {
  const r = asRecord(input);
  const conflicts: AgencySessionAliasConflict[] = [];

  const sessionId = nonEmptyString(r.sessionId);
  const conversationId = nonEmptyString(r.conversationId);
  if (sessionId && conversationId && sessionId !== conversationId) {
    conflicts.push({
      code: "session_id_mismatch",
      fields: ["sessionId", "conversationId"],
      detail: "sessionId and conversationId both set to different values; sessionId wins",
    });
  }

  if (
    isValidIstanbulSide(r.istanbul_side) &&
    isValidIstanbulSide(r.istanbulSide) &&
    r.istanbul_side !== r.istanbulSide
  ) {
    conflicts.push({
      code: "istanbul_side_mismatch",
      fields: ["istanbul_side", "istanbulSide"],
      detail: "snake_case istanbul_side outranks camelCase istanbulSide",
    });
  }

  if (Array.isArray(r.selectedClinicIds) && nonEmptyString(r.selectedClinicId)) {
    const ids = uniqueStringIds(r.selectedClinicIds);
    const single = String(r.selectedClinicId).trim();
    if (ids.length > 0 && !ids.includes(single)) {
      conflicts.push({
        code: "selected_clinic_mismatch",
        fields: ["selectedClinicIds", "selectedClinicId"],
        detail: "selectedClinicIds outranks selectedClinicId; selection is not expanded",
      });
    }
  }

  const full = nonEmptyString(r.patientName);
  const composed = [nonEmptyString(r.firstName), nonEmptyString(r.lastName)]
    .filter(Boolean)
    .join(" ");
  if (full && composed && full.toLowerCase() !== composed.toLowerCase()) {
    conflicts.push({
      code: "patient_name_mismatch",
      fields: ["patientName", "firstName", "lastName"],
      detail: "patientName outranks firstName/lastName composition",
    });
  }

  const consent = getAgencyClientConsentHint(input);
  if (consent.conflict) {
    conflicts.push({
      code: "consent_alias_mismatch",
      fields: ["quoteConsent", "consentStatus"],
      detail:
        "client consent aliases disagree; fail closed — never treat as verified consent",
    });
  }

  if (
    typeof r.patientAge === "number" &&
    typeof r.age === "number" &&
    Number.isFinite(r.patientAge) &&
    Number.isFinite(r.age) &&
    r.patientAge !== r.age
  ) {
    conflicts.push({
      code: "age_mismatch",
      fields: ["patientAge", "age"],
      detail: "patientAge outranks age",
    });
  }

  const g1 = nonEmptyString(r.patientGender);
  const g2 = nonEmptyString(r.gender);
  if (g1 && g2 && g1.toLowerCase() !== g2.toLowerCase()) {
    conflicts.push({
      code: "gender_mismatch",
      fields: ["patientGender", "gender"],
      detail: "patientGender outranks gender",
    });
  }

  return conflicts;
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 5 — Field provenance (pure; never authorizes persistence)
// ═══════════════════════════════════════════════════════════════════════════

const AGENCY_FIELD_SOURCE_STRENGTH: Record<AgencyFieldSource, number> = {
  backend_verified: 70,
  structured_action: 60,
  user_explicit: 50,
  persisted_state: 40,
  system_derived: 30,
  llm_extracted: 20,
  legacy_client: 10,
};

const AGENCY_FIELD_CONFIDENCE_STRENGTH: Record<AgencyFieldConfidence, number> = {
  verified: 40,
  high: 30,
  medium: 20,
  low: 10,
};

const VALID_FIELD_SOURCES = new Set<string>(Object.keys(AGENCY_FIELD_SOURCE_STRENGTH));
const VALID_FIELD_CONFIDENCES = new Set<string>(Object.keys(AGENCY_FIELD_CONFIDENCE_STRENGTH));

function isAgencyFieldSource(value: unknown): value is AgencyFieldSource {
  return typeof value === "string" && VALID_FIELD_SOURCES.has(value);
}

function isAgencyFieldConfidence(value: unknown): value is AgencyFieldConfidence {
  return typeof value === "string" && VALID_FIELD_CONFIDENCES.has(value);
}

function isIsoTimestampString(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  const t = Date.parse(value);
  return Number.isFinite(t);
}

/**
 * Structural parse of one provenance entry. Returns undefined if malformed.
 * Does not invent verified sources or elevate confidence.
 */
export function parseAgencyFieldProvenance(value: unknown): AgencyFieldProvenance | undefined {
  if (!isPlainObject(value)) return undefined;
  if (!isAgencyFieldSource(value.source)) return undefined;
  if (!isAgencyFieldConfidence(value.confidence)) return undefined;
  const out: AgencyFieldProvenance = {
    source: value.source,
    confidence: value.confidence,
  };
  if (isIsoTimestampString(value.updatedAt)) out.updatedAt = value.updatedAt.trim();
  if (isIsoTimestampString(value.verifiedAt)) out.verifiedAt = value.verifiedAt.trim();
  if (typeof value.actor === "string" && value.actor.trim()) {
    out.actor = value.actor.trim().slice(0, 64);
  }
  if (typeof value.note === "string" && value.note.trim()) {
    // Short structural note only — never store free-form patient PII here.
    out.note = value.note.trim().slice(0, 120);
  }
  return out;
}

/**
 * Sanitize a provenance map: keep structurally valid entries; drop the rest.
 * Preserves unknown field keys when their entry is valid.
 */
export function sanitizeAgencyFieldProvenanceMap(
  value: unknown
): Record<string, AgencyFieldProvenance> | undefined {
  if (!isPlainObject(value)) return undefined;
  const out: Record<string, AgencyFieldProvenance> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!key || typeof key !== "string") continue;
    const parsed = parseAgencyFieldProvenance(entry);
    if (parsed) out[key] = parsed;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Combined source+confidence strength helper for diagnostics.
 * Prefer `compareAgencyFieldProvenance` for overwrite decisions (source-first).
 */
export function agencyFieldProvenanceStrength(p: AgencyFieldProvenance): number {
  return (
    (AGENCY_FIELD_SOURCE_STRENGTH[p.source] || 0) * 100 +
    (AGENCY_FIELD_CONFIDENCE_STRENGTH[p.confidence] || 0)
  );
}

/**
 * Compare two provenance records (source first, then confidence).
 * Positive → a is stronger than b; negative → weaker; 0 → equal strength.
 * Timestamps are not used (keeps comparison deterministic).
 */
export function compareAgencyFieldProvenance(
  a: AgencyFieldProvenance,
  b: AgencyFieldProvenance
): number {
  const sourceDiff =
    (AGENCY_FIELD_SOURCE_STRENGTH[a.source] || 0) -
    (AGENCY_FIELD_SOURCE_STRENGTH[b.source] || 0);
  if (sourceDiff !== 0) return sourceDiff;
  return (
    (AGENCY_FIELD_CONFIDENCE_STRENGTH[a.confidence] || 0) -
    (AGENCY_FIELD_CONFIDENCE_STRENGTH[b.confidence] || 0)
  );
}

function isEffectivelyEmptyFieldValue(field: string, value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string" && !value.trim()) return true;
  // Explicit empty selectedClinicIds array is a valid "none selected" value —
  // not treated as an erase attempt.
  if (field === "selectedClinicIds" && Array.isArray(value)) return false;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function readCurrentFieldValue(
  state: AgencySessionStateInputMaybe,
  field: string
): unknown {
  const r = asRecord(state);
  return r[field];
}

export type ShouldReplaceAgencyFieldOptions = {
  field: string;
  currentValue: unknown;
  currentProvenance?: AgencyFieldProvenance | null;
  nextValue: unknown;
  nextProvenance: AgencyFieldProvenance;
  /** When true, bypass strength checks (still blocks empty-erase of non-empty). */
  force?: boolean;
};

/**
 * Decide whether nextValue may replace currentValue given provenance.
 * Does not authorize persistence or consent.
 */
export function shouldReplaceAgencyFieldValue(
  opts: ShouldReplaceAgencyFieldOptions
): boolean {
  const {
    field,
    currentValue,
    currentProvenance,
    nextValue,
    nextProvenance,
    force,
  } = opts;

  const nextEmpty = isEffectivelyEmptyFieldValue(field, nextValue);
  const currentEmpty = isEffectivelyEmptyFieldValue(field, currentValue);

  // Weaker/empty must not erase a stronger non-empty value.
  if (nextEmpty && !currentEmpty) {
    if (!currentProvenance) return false;
    if (force) return true;
    return compareAgencyFieldProvenance(nextProvenance, currentProvenance) > 0;
  }

  if (!currentProvenance) return true;
  if (force) return true;

  const cmp = compareAgencyFieldProvenance(nextProvenance, currentProvenance);
  // Stronger or equal may replace (equal allows explicit user correction).
  return cmp >= 0;
}

export function getAgencyFieldProvenance(
  input: AgencySessionStateInputMaybe,
  field: string
): AgencyFieldProvenance | undefined {
  const r = asRecord(input);
  const map = r.fieldProvenance;
  if (!isPlainObject(map)) return undefined;
  return parseAgencyFieldProvenance(map[field]);
}

export type SetAgencyFieldProvenanceOptions = {
  /** Injected ISO timestamp for deterministic tests. */
  now?: string;
};

/**
 * Write provenance for a field without changing the field value.
 * Pure aside from optional `now` injection (defaults via wrapper below).
 */
export function setAgencyFieldProvenance(
  state: AgencySessionStateInputMaybe,
  field: string,
  provenance: AgencyFieldProvenance,
  opts?: SetAgencyFieldProvenanceOptions
): AgencySessionState {
  const base = normalizeAgencySessionState(state);
  const parsed = parseAgencyFieldProvenance(provenance);
  if (!parsed || !field) return base;

  const updatedAt =
    (opts?.now && isIsoTimestampString(opts.now) ? opts.now.trim() : undefined) ||
    parsed.updatedAt;
  const nextProv: AgencyFieldProvenance = {
    ...parsed,
    ...(updatedAt ? { updatedAt } : {}),
  };
  if (nextProv.source === "backend_verified" && nextProv.confidence === "verified") {
    if (!nextProv.verifiedAt && updatedAt) nextProv.verifiedAt = updatedAt;
  }

  const map = {
    ...(sanitizeAgencyFieldProvenanceMap(base.fieldProvenance) || {}),
    [field]: nextProv,
  };
  return normalizeAgencySessionState({
    ...(base as Record<string, unknown>),
    fieldProvenance: map,
  } as AgencySessionState);
}

export function clearAgencyFieldProvenance(
  state: AgencySessionStateInputMaybe,
  field: string
): AgencySessionState {
  const base = normalizeAgencySessionState(state);
  const map = { ...(sanitizeAgencyFieldProvenanceMap(base.fieldProvenance) || {}) };
  delete map[field];
  const next = { ...(base as Record<string, unknown>) } as AgencySessionState;
  if (Object.keys(map).length > 0) next.fieldProvenance = map;
  else delete next.fieldProvenance;
  return normalizeAgencySessionState(next);
}

export type UpdateAgencyFieldWithProvenanceResult = {
  state: AgencySessionState;
  applied: boolean;
  reason?:
    | "applied"
    | "blocked_weaker_provenance"
    | "blocked_empty_erase"
    | "invalid_provenance";
};

/**
 * Conditionally update a field and its provenance.
 * Does not authorize persistence. Inject `now` for deterministic tests.
 */
export function updateAgencyFieldWithProvenance(
  state: AgencySessionStateInputMaybe,
  field: string,
  value: unknown,
  provenance: AgencyFieldProvenance,
  opts?: SetAgencyFieldProvenanceOptions & { force?: boolean }
): UpdateAgencyFieldWithProvenanceResult {
  const parsed = parseAgencyFieldProvenance(provenance);
  if (!parsed || !field) {
    return {
      state: normalizeAgencySessionState(state),
      applied: false,
      reason: "invalid_provenance",
    };
  }

  const currentValue = readCurrentFieldValue(state, field);
  const currentProvenance = getAgencyFieldProvenance(state, field);
  const allow = shouldReplaceAgencyFieldValue({
    field,
    currentValue,
    currentProvenance,
    nextValue: value,
    nextProvenance: parsed,
    force: opts?.force,
  });

  if (!allow) {
    const nextEmpty = isEffectivelyEmptyFieldValue(field, value);
    const currentEmpty = isEffectivelyEmptyFieldValue(field, currentValue);
    return {
      state: normalizeAgencySessionState(state),
      applied: false,
      reason:
        nextEmpty && !currentEmpty
          ? "blocked_empty_erase"
          : "blocked_weaker_provenance",
    };
  }

  const base = normalizeAgencySessionState(state);
  const withValue = {
    ...(base as Record<string, unknown>),
    [field]: value,
  } as AgencySessionState;
  const withProv = setAgencyFieldProvenance(withValue, field, parsed, {
    now: opts?.now,
  });
  return { state: withProv, applied: true, reason: "applied" };
}

/**
 * Convenience wrapper that stamps `updatedAt` with the current ISO time.
 * Prefer `updateAgencyFieldWithProvenance(..., { now })` in tests.
 */
export function updateAgencyFieldWithProvenanceNow(
  state: AgencySessionStateInputMaybe,
  field: string,
  value: unknown,
  provenance: AgencyFieldProvenance,
  opts?: { force?: boolean }
): UpdateAgencyFieldWithProvenanceResult {
  return updateAgencyFieldWithProvenance(state, field, value, provenance, {
    ...opts,
    now: new Date().toISOString(),
  });
}

/**
 * Downgrade untrusted client-round-tripped provenance at the API boundary.
 * - backend_verified → legacy_client
 * - confidence verified → high
 * - verifiedAt stripped for non-backend sources after downgrade
 * Never invents verified claims. Does not change field values.
 */
export function sanitizeClientAgencyFieldProvenance(
  input: AgencySessionStateInputMaybe
): AgencySessionState {
  const base = normalizeAgencySessionState(input);
  const map = sanitizeAgencyFieldProvenanceMap(base.fieldProvenance);
  if (!map) {
    const out = { ...(base as Record<string, unknown>) } as AgencySessionState;
    delete out.fieldProvenance;
    return normalizeAgencySessionState(out);
  }

  const sanitized: Record<string, AgencyFieldProvenance> = {};
  for (const [key, entry] of Object.entries(map)) {
    let source = entry.source;
    let confidence = entry.confidence;
    if (source === "backend_verified") source = "legacy_client";
    if (confidence === "verified") confidence = "high";
    const next: AgencyFieldProvenance = {
      source,
      confidence,
    };
    if (entry.updatedAt) next.updatedAt = entry.updatedAt;
    if (entry.actor) next.actor = entry.actor;
    if (entry.note) next.note = entry.note;
    // Client cannot retain verifiedAt after downgrade.
    sanitized[key] = next;
  }

  return normalizeAgencySessionState({
    ...(base as Record<string, unknown>),
    fieldProvenance: sanitized,
  } as AgencySessionState);
}

export type AgencyFieldProvenanceConflictCode =
  | "weaker_overwrite_attempt"
  | "client_backend_verified_claim"
  | "client_verified_confidence_claim"
  | "same_strength_value_mismatch";

export interface AgencyFieldProvenanceConflict {
  code: AgencyFieldProvenanceConflictCode;
  field: string;
  detail: string;
}

/**
 * Non-authoritative provenance diagnostics. Pure — no logging / no PII values.
 */
export function detectAgencyFieldProvenanceConflicts(
  input: AgencySessionStateInputMaybe,
  incoming?: {
    field: string;
    value?: unknown;
    provenance?: AgencyFieldProvenance;
  }
): AgencyFieldProvenanceConflict[] {
  const conflicts: AgencyFieldProvenanceConflict[] = [];
  const map = sanitizeAgencyFieldProvenanceMap(asRecord(input).fieldProvenance) || {};

  for (const [field, entry] of Object.entries(map)) {
    if (entry.source === "backend_verified") {
      conflicts.push({
        code: "client_backend_verified_claim",
        field,
        detail: "client-round-tripped provenance claims backend_verified",
      });
    }
    if (entry.confidence === "verified") {
      conflicts.push({
        code: "client_verified_confidence_claim",
        field,
        detail: "client-round-tripped provenance claims verified confidence",
      });
    }
  }

  if (incoming?.field && incoming.provenance) {
    const current = getAgencyFieldProvenance(input, incoming.field);
    const next = parseAgencyFieldProvenance(incoming.provenance);
    if (current && next) {
      const cmp = compareAgencyFieldProvenance(next, current);
      if (cmp < 0) {
        conflicts.push({
          code: "weaker_overwrite_attempt",
          field: incoming.field,
          detail: "incoming provenance is weaker than current",
        });
      } else if (cmp === 0) {
        const curVal = readCurrentFieldValue(input, incoming.field);
        if (
          incoming.value !== undefined &&
          JSON.stringify(curVal) !== JSON.stringify(incoming.value)
        ) {
          conflicts.push({
            code: "same_strength_value_mismatch",
            field: incoming.field,
            detail: "same-strength provenance with differing values",
          });
        }
      }
    }
  }

  return conflicts;
}

/**
 * @deprecated Prefer `AgencySessionState`. Alias kept for gradual migration.
 */
export type SessionContext = AgencySessionState;
