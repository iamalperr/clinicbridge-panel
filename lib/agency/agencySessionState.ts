/**
 * Canonical agency chat session state (Phase 1 + Phase 2 alias policy).
 *
 * Flat serialized shape — field names match current `sessionContext` JSON.
 * Nested v2 redesign is deferred until adapters exist.
 *
 * VERSIONING / MIGRATION BOUNDARY
 * -------------------------------
 * - Version 1 keeps flat legacy aliases on the wire.
 * - Accessors below provide a canonical in-memory interpretation.
 * - Future version 2 may serialize nested state through adapters.
 * - Old clients remain supported; no Firestore migration in Phase 2.
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
 * Client fields such as `quoteConsent`, `selectedClinicIds`, or
 * `quoteRequestLocked` must never authorize writes by themselves.
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

/**
 * Known session fields, grouped for documentation only.
 * Serialization remains a flat object (no nested v2 shape in Phase 1/2).
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

/**
 * @deprecated Prefer `AgencySessionState`. Alias kept for gradual migration.
 */
export type SessionContext = AgencySessionState;
