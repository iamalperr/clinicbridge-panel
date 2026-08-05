/**
 * Canonical agency chat session state (Phase 1).
 *
 * Flat serialized shape — field names match current `sessionContext` JSON.
 * Nested v2 redesign is deferred until adapters exist.
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
 * Serialization remains a flat object (no nested v2 shape in Phase 1).
 *
 * Categories:
 * - identity/session metadata
 * - patient intake
 * - treatment
 * - location
 * - matching
 * - clinic selection
 * - consent (client-mirrored; not verified)
 * - lead/quote
 * - conversation control
 * - empty-match recovery
 * - UI/action state
 * - legacy/extension
 */
export interface AgencySessionStateKnown {
  // ── identity / session metadata ──────────────────────────────────────────
  /** Canonical session version. Legacy payloads without it normalize to current. */
  stateVersion?: number;
  sessionId?: string;
  /** Alias used by some clients / quote-request bodies; not renamed in Phase 1. */
  conversationId?: string;
  language?: string;
  isGuestUser?: boolean;
  processingMode?: AgencyProcessingMode;
  /** Legacy persistence helper may read this; keep as unknown for Date/string. */
  createdAt?: string | unknown;

  // ── patient intake ───────────────────────────────────────────────────────
  patientName?: string;
  patientEmail?: string;
  patientEmailStatus?: AgencyPatientEmailStatus | string;
  patientPhone?: string;
  patientCountry?: string;
  patientAge?: number;
  patientGender?: string;
  firstName?: string;
  lastName?: string;
  /** Legacy duplicate of patientAge. */
  age?: number;
  /** Legacy duplicate of patientGender. */
  gender?: string;
  travelDate?: string;
  /** Legacy travel window start (weakly typed). */
  travelDateStart?: string;
  /** Legacy free-text travel answer. */
  travelDateText?: string;
  missingLeadField?: string;
  emailValidationFails?: number;

  // ── treatment ────────────────────────────────────────────────────────────
  lastTreatmentCategory?: string;
  lastSubTreatment?: string;
  /** Weakly typed / legacy treatment id alias. */
  treatmentId?: string;

  // ── location ─────────────────────────────────────────────────────────────
  lastLocation?: string;
  selectedCity?: string | null;
  locationSelectionConfirmed?: boolean;
  sideSelectionConfirmed?: boolean;
  availableCities?: string[];
  pendingCitySelection?: boolean;
  /** Serialized snake_case — clients depend on this name. */
  istanbul_side?: AgencyIstanbulSide;
  /** CamelCase alias seen in some clients; preserved, not renamed. */
  istanbulSide?: string | null;
  istanbul_side_source?: AgencyIstanbulSideSource;
  pendingSideClarification?: boolean;
  pendingSideGuidance?: boolean;

  // ── matching ─────────────────────────────────────────────────────────────
  lastRecommendedClinicIds?: string[];
  lastFocusedClinicId?: string;
  lastFocusedClinicName?: string;

  // ── clinic selection ─────────────────────────────────────────────────────
  selectedClinicId?: string;
  selectedClinicName?: string;
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
  leadId?: string;
  quoteId?: string;
  /** Soft display reference occasionally set by demos. */
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
 * and break existing call sites. A nested extensions bag can land in a later
 * phase if needed.
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
 * Structural normalize only — not policy enforcement.
 *
 * - Accepts unknown / partial input
 * - Preserves existing valid values (including explicit false, 0, [])
 * - Does not invent consent acceptance
 * - Does not reset clinic selection, quote locks, city, side, treatment, or intake
 * - Preserves unknown legacy keys
 * - Adds `stateVersion` when missing
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

  return out;
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
      // Class instances / Maps / etc. — omit rather than risk non-JSON output.
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

/**
 * @deprecated Prefer `AgencySessionState`. Alias kept for gradual migration.
 */
export type SessionContext = AgencySessionState;
