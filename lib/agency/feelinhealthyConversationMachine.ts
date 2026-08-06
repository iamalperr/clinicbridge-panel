/**
 * Authoritative FeelinHealthy conversation state machine.
 *
 * Every text message and structured widget action must resolve its next
 * response through `resolveNextConversationAction`. No UI / LLM branch may
 * invent a competing stage order.
 *
 * Canonical journey:
 *   greeting → treatment intent → consent → G1 → G2 → G3
 *   → city (if unknown) → Istanbul side (if required) → matching
 *   → clinic selection → selected_clinic → quote
 */

import {
  decideFeelinHealthyLocationNextStep,
  evaluateFeelinHealthyIntake,
  getCitySelectionCard,
  getGroupIntakePrompt,
  getIstanbulSideClarificationCard,
  getTreatmentClarificationPrompt,
  getUnsupportedLocationPrompt,
  getCuratedClinicsForFeelinHealthy,
  normalizeTreatmentBranch,
  isLocationExpansionAffirmative,
  type LocationDecision,
} from "./feelinhealthyConfig";
import { resolveAssistantRole, type AssistantRole } from "./assistantModes";
import type { AgencySessionState, AgencySessionStateInput } from "./agencySessionState";
import {
  clearAgencyFieldProvenance,
  getAgencyIstanbulSide,
  getAgencySelectedCity,
  getAgencyTreatmentContext,
  normalizeAgencySessionState,
  updateAgencyFieldWithProvenanceNow,
} from "./agencySessionState";

// ─── Stages ──────────────────────────────────────────────────────────────────

export type FeelinHealthyStage =
  | "greeting"
  | "consent"
  | "intake_group_1"
  | "intake_group_2"
  | "intake_group_3"
  | "ask_treatment"
  | "city_selection"
  | "istanbul_side_selection"
  | "location_negotiation"
  | "matching"
  | "clinic_selection"
  | "selected_clinic"
  | "quote"
  | "appointment"
  | "idle";

export type ConsentStatus = "not_requested" | "pending" | "accepted" | "rejected";

export interface FeelinHealthyConversationState {
  stage: FeelinHealthyStage;
  consentStatus: ConsentStatus;
  treatment: {
    branch: string | null;
    confirmed: boolean;
  };
  intake: {
    group1Complete: boolean;
    group2Complete: boolean;
    group3Complete: boolean;
    allComplete: boolean;
    currentGroup: 1 | 2 | 3 | "completed";
    missingFields: string[];
  };
  location: {
    city: string | null;
    cityConfirmed: boolean;
    istanbulSide: "european" | "anatolian" | "any" | "unsure" | null;
    sideConfirmed: boolean;
  };
  selectedClinicId: string | null;
  selectedClinicName: string | null;
  hasRecommendations: boolean;
  leadStage: string | null;
  assistantRole: AssistantRole;
  pendingHealthRequest: string | null;
  quoteCreated: boolean;
}

// ─── Next action ─────────────────────────────────────────────────────────────

export type NextConversationAction =
  | { kind: "greeting" }
  | { kind: "consent" }
  | {
      kind: "intake";
      group: 1 | 2 | 3;
      missingFields: string[];
      prompt: string;
    }
  | { kind: "ask_treatment"; prompt: string }
  | {
      kind: "ask_city";
      card: ReturnType<typeof getCitySelectionCard>;
      availableCities: string[];
    }
  | {
      kind: "ask_side";
      card: ReturnType<typeof getIstanbulSideClarificationCard>;
    }
  | {
      kind: "location_negotiation";
      prompt: string;
      targetDisplayName: string;
      treatmentBranch: string;
    }
  | { kind: "match_clinics" }
  | { kind: "clinic_selection" }
  | { kind: "selected_clinic" }
  | { kind: "quote" }
  | { kind: "idle" };

export interface ResolveNextOptions {
  availableClinics?: any[];
  locale?: string;
  /** Pure greeting with no health intent — never advances into consent/intake. */
  isPureGreeting?: boolean;
  /** When true, skip greeting short-circuit (e.g. structured action turn). */
  isStructuredAction?: boolean;
  /** Raw session context for intake prompt personalization (name greeting only). */
  promptContext?: Record<string, any>;
}

// ─── Derive state from session context ───────────────────────────────────────

export function deriveFeelinHealthyState(
  ctx: AgencySessionStateInput | null | undefined
): FeelinHealthyConversationState {
  const c = normalizeAgencySessionState(ctx);
  const intake = evaluateFeelinHealthyIntake(c);
  const assistantRole = resolveAssistantRole(c);

  let consentStatus: ConsentStatus = "not_requested";
  if (c.quoteConsent === true || c.consentStatus === "accepted" || c.consentStatus === "accept") {
    consentStatus = "accepted";
  } else if (c.quoteConsent === false || c.consentStatus === "declined" || c.consentStatus === "rejected") {
    consentStatus = "rejected";
  } else if (c.pendingUserMessage || c.pendingHealthRequest) {
    consentStatus = "pending";
  }

  const treatmentCtx = getAgencyTreatmentContext(c);
  const treatmentBranch = treatmentCtx.category || null;
  const city = getAgencySelectedCity(c) || null;
  const sideRaw = getAgencyIstanbulSide(c);
  const side =
    sideRaw === "european" ||
    sideRaw === "anatolian" ||
    sideRaw === "any" ||
    sideRaw === "unsure"
      ? sideRaw
      : null;

  const quoteCreated =
    c.leadStage === "quote_request_created" || c.leadStage === "completed";

  const hasRecommendations = Array.isArray(c.lastRecommendedClinicIds) && c.lastRecommendedClinicIds.length > 0;

  const stage = deriveStage({
    consentStatus,
    intake,
    treatmentBranch,
    city,
    side,
    assistantRole,
    hasRecommendations,
    quoteCreated,
    leadStage: c.leadStage || null,
  });

  return {
    stage,
    consentStatus,
    treatment: {
      branch: treatmentBranch ? String(treatmentBranch) : null,
      confirmed: Boolean(treatmentBranch),
    },
    intake: {
      group1Complete: intake.group1Complete,
      group2Complete: intake.group2Complete,
      group3Complete: intake.group3Complete,
      allComplete: intake.allGroupsComplete,
      currentGroup: intake.currentGroup,
      missingFields: intake.missingFieldsInCurrentGroup,
    },
    location: {
      city: city ? String(city).toLowerCase() : null,
      cityConfirmed: Boolean(c.locationSelectionConfirmed || city),
      istanbulSide: side,
      sideConfirmed: Boolean(
        c.sideSelectionConfirmed || side === "european" || side === "anatolian" || side === "any"
      ),
    },
    selectedClinicId: c.selectedClinicId || c.lastFocusedClinicId || null,
    selectedClinicName: c.selectedClinicName || c.lastFocusedClinicName || null,
    hasRecommendations,
    leadStage: c.leadStage || null,
    assistantRole,
    pendingHealthRequest: c.pendingHealthRequest || c.pendingUserMessage || null,
    quoteCreated,
  };
}

function deriveStage(input: {
  consentStatus: ConsentStatus;
  intake: ReturnType<typeof evaluateFeelinHealthyIntake>;
  treatmentBranch: string | null;
  city: string | null;
  side: string | null;
  assistantRole: AssistantRole;
  hasRecommendations: boolean;
  quoteCreated: boolean;
  leadStage: string | null;
}): FeelinHealthyStage {
  if (input.quoteCreated) return "quote";
  if (input.assistantRole === "clinic_coordinator") return "selected_clinic";
  if (input.consentStatus === "rejected") return "idle";
  if (input.consentStatus !== "accepted") {
    return input.treatmentBranch || input.consentStatus === "pending" ? "consent" : "greeting";
  }
  if (!input.intake.group1Complete) return "intake_group_1";
  if (!input.intake.group2Complete) return "intake_group_2";
  if (!input.intake.group3Complete) return "intake_group_3";
  if (!input.treatmentBranch) return "ask_treatment";
  if (!input.city) return "city_selection";
  if (
    input.city === "istanbul" &&
    input.side !== "european" &&
    input.side !== "anatolian" &&
    input.side !== "any"
  ) {
    return "istanbul_side_selection";
  }
  if (input.hasRecommendations) return "clinic_selection";
  return "matching";
}

// ─── Authoritative next-action resolver ──────────────────────────────────────

/**
 * Single source of truth for "what comes next".
 * Priority (release contract):
 * 1. consent  2. G1  3. G2  4. G3  5. treatment
 * 6. city  7. Istanbul side  8. matching  9. clinic selected  10. selected-clinic
 */
export function resolveNextConversationAction(
  stateOrCtx: FeelinHealthyConversationState | Record<string, any>,
  options: ResolveNextOptions = {}
): NextConversationAction {
  const state =
    isConversationState(stateOrCtx) ? stateOrCtx : deriveFeelinHealthyState(stateOrCtx);
  const locale = options.locale || "tr";
  const clinics = options.availableClinics || [];

  // Pure greeting never advances into the funnel.
  if (options.isPureGreeting && state.consentStatus !== "accepted") {
    return { kind: "greeting" };
  }

  // 1. Consent
  if (state.consentStatus !== "accepted") {
    if (state.consentStatus === "rejected") return { kind: "idle" };
    // Greeting-only sessions stay on greeting until a health/treatment turn.
    if (
      !options.isStructuredAction &&
      state.consentStatus === "not_requested" &&
      !state.treatment.confirmed &&
      !state.pendingHealthRequest
    ) {
      return { kind: "greeting" };
    }
    return { kind: "consent" };
  }

  const promptCtx = options.promptContext || {};

  // Selected-clinic / quote terminal modes short-circuit discovery.
  if (state.quoteCreated) return { kind: "quote" };
  if (state.assistantRole === "clinic_coordinator") {
    if (!state.intake.allComplete) {
      return buildIntakeAction(
        !state.intake.group1Complete ? 1 : !state.intake.group2Complete ? 2 : 3,
        state,
        locale,
        promptCtx
      );
    }
    return { kind: "selected_clinic" };
  }

  // 2–4. Intake groups (never restarted once complete)
  if (!state.intake.group1Complete) {
    return buildIntakeAction(1, state, locale, promptCtx);
  }
  if (!state.intake.group2Complete) {
    return buildIntakeAction(2, state, locale, promptCtx);
  }
  if (!state.intake.group3Complete) {
    return buildIntakeAction(3, state, locale, promptCtx);
  }

  // 5. Treatment
  if (!state.treatment.confirmed) {
    return { kind: "ask_treatment", prompt: getTreatmentClarificationPrompt(locale) };
  }

  // Location decision (city → side → ready)
  const location: LocationDecision = decideFeelinHealthyLocationNextStep(
    {
      lastTreatmentCategory: state.treatment.branch,
      selectedCity: state.location.city,
      istanbul_side: state.location.istanbulSide,
      locationSelectionConfirmed: state.location.cityConfirmed,
    },
    clinics,
    locale
  );

  // 6. City
  if (location.step === "ask_city") {
    const card = getCitySelectionCard(
      location.treatmentBranch,
      location.availableCities,
      locale
    );
    return {
      kind: "ask_city",
      card,
      availableCities: location.availableCities.map((c) => c.city),
    };
  }

  // 7. Istanbul side — only when city is Istanbul and side unknown
  if (location.step === "ask_side" && location.city === "istanbul") {
    return {
      kind: "ask_side",
      card: getIstanbulSideClarificationCard(location.treatmentBranch, locale),
    };
  }

  // Unsupported city negotiation (non-Istanbul with no curated clinics)
  if (
    location.step === "ready" &&
    location.city &&
    location.city !== "istanbul"
  ) {
    const curated = getCuratedClinicsForFeelinHealthy(
      location.treatmentBranch || "",
      location.city,
      location.side,
      clinics
    );
    if (
      curated.isUnsupportedLocation &&
      curated.supportedLocationsForBranch &&
      curated.supportedLocationsForBranch.length > 0
    ) {
      return {
        kind: "location_negotiation",
        prompt: getUnsupportedLocationPrompt(
          location.treatmentBranch || "",
          location.city,
          curated.supportedLocationsForBranch,
          locale
        ),
        targetDisplayName: curated.supportedLocationsForBranch[0].displayNameTr,
        treatmentBranch: location.treatmentBranch || "",
      };
    }
  }

  // 8–9. Matching / clinic selection
  if (state.hasRecommendations) {
    return { kind: "clinic_selection" };
  }

  if (location.step === "ask_treatment") {
    return { kind: "ask_treatment", prompt: getTreatmentClarificationPrompt(locale) };
  }

  if (location.step === "ready") {
    return { kind: "match_clinics" };
  }

  return { kind: "match_clinics" };
}

function buildIntakeAction(
  group: 1 | 2 | 3,
  state: FeelinHealthyConversationState,
  locale: string,
  promptContext: Record<string, any>
): NextConversationAction {
  const intakeStatus = {
    currentGroup: group as 1 | 2 | 3,
    group1Complete: state.intake.group1Complete,
    group2Complete: state.intake.group2Complete,
    group3Complete: state.intake.group3Complete,
    missingFieldsInCurrentGroup: state.intake.missingFields,
    allGroupsComplete: false,
  };
  return {
    kind: "intake",
    group,
    missingFields: state.intake.missingFields,
    prompt: getGroupIntakePrompt(intakeStatus, promptContext, locale),
  };
}

function isConversationState(value: unknown): value is FeelinHealthyConversationState {
  return Boolean(
    value &&
      typeof value === "object" &&
      "consentStatus" in value &&
      "intake" in value &&
      "treatment" in value &&
      "location" in value &&
      "stage" in value
  );
}

// ─── Gating helpers ──────────────────────────────────────────────────────────

export function canShowCityWidget(state: FeelinHealthyConversationState): boolean {
  return (
    state.consentStatus === "accepted" &&
    state.intake.allComplete &&
    state.treatment.confirmed &&
    !state.location.city &&
    state.assistantRole !== "clinic_coordinator" &&
    !state.quoteCreated
  );
}

export function canShowIstanbulSideWidget(state: FeelinHealthyConversationState): boolean {
  return (
    state.consentStatus === "accepted" &&
    state.intake.allComplete &&
    state.treatment.confirmed &&
    state.location.city === "istanbul" &&
    state.location.istanbulSide !== "european" &&
    state.location.istanbulSide !== "anatolian" &&
    state.location.istanbulSide !== "any" &&
    state.assistantRole !== "clinic_coordinator" &&
    !state.quoteCreated
  );
}

// ─── Structured action application (idempotent, field-scoped) ────────────────

export type StructuredActionType =
  | "privacy_consent_response"
  | "select_treatment_city"
  | "side_selection"
  | "branch_side_confirm"
  | "select_clinic"
  | "clinic_selected"
  | "clinic_selection_update"
  | "request_quote"
  | "change_clinic";

export interface ApplyStructuredActionResult {
  ctx: AgencySessionState;
  /** True when the action was a no-op because state already matched. */
  idempotentSkip: boolean;
  clearedFields: string[];
}

/**
 * Apply a structured widget action. Updates ONLY the action's own fields.
 * Never clears consent, intake, or treatment unless the action explicitly exits
 * Istanbul side confirmation toward another city.
 */
export function applyStructuredLocationAction(
  ctx: AgencySessionStateInput,
  action: {
    type: string;
    city?: string;
    value?: string;
    side?: string;
    action?: string;
    clinicId?: string;
    clinicName?: string;
    locale?: string;
    actionId?: string;
  }
): ApplyStructuredActionResult {
  let next = normalizeAgencySessionState(ctx);
  const clearedFields: string[] = [];

  // Idempotency: same actionId already processed.
  if (action.actionId && next.lastStructuredActionId === action.actionId) {
    return { ctx: next, idempotentSkip: true, clearedFields };
  }

  if (action.type === "select_treatment_city") {
    const cityValue = String(action.city || action.value || "").toLowerCase();
    if (
      cityValue &&
      cityValue !== "undecided" &&
      cityValue !== "travel_help" &&
      next.selectedCity === cityValue &&
      next.locationSelectionConfirmed === true
    ) {
      return { ctx: next, idempotentSkip: true, clearedFields };
    }

    if (cityValue === "undecided" || cityValue === "travel_help") {
      delete next.selectedCity;
      delete next.locationSelectionConfirmed;
      next = clearAgencyFieldProvenance(next, "selectedCity");
      next.pendingCitySelection = true;
    } else if (cityValue) {
      const cityUpdate = updateAgencyFieldWithProvenanceNow(
        next,
        "selectedCity",
        cityValue,
        { source: "structured_action", confidence: "high", note: "city_card" }
      );
      next = cityUpdate.state;
      next.locationSelectionConfirmed = true;
      next.pendingCitySelection = false;
      delete next.lastEmptyMatchKey;
      delete next.pendingLocationExpansion;
      delete next.pendingLocationExpansionTarget;
      delete next.pendingLocationBranch;
      if (cityValue !== "istanbul") {
        if (next.istanbul_side !== undefined) clearedFields.push("istanbul_side");
        delete next.istanbul_side;
        delete next.istanbul_side_source;
        delete next.pendingSideClarification;
        delete next.sideSelectionConfirmed;
        next = clearAgencyFieldProvenance(next, "istanbul_side");
      }
    }
  } else if (action.type === "side_selection" || action.type === "select_istanbul_side") {
    if (
      (action.side === "european" || action.side === "anatolian") &&
      next.istanbul_side === action.side &&
      next.sideSelectionConfirmed === true
    ) {
      return { ctx: next, idempotentSkip: true, clearedFields };
    }
    if (action.side === "european" || action.side === "anatolian") {
      const sideUpdate = updateAgencyFieldWithProvenanceNow(
        next,
        "istanbul_side",
        action.side,
        { source: "structured_action", confidence: "high", note: "side_card" }
      );
      next = sideUpdate.state;
      next.istanbul_side_source = "structured_card";
      const cityUpdate = updateAgencyFieldWithProvenanceNow(
        next,
        "selectedCity",
        "istanbul",
        { source: "structured_action", confidence: "high", note: "side_card_city" }
      );
      next = cityUpdate.state;
      next.locationSelectionConfirmed = true;
      next.sideSelectionConfirmed = true;
      delete next.pendingSideClarification;
      delete next.pendingSideGuidance;
      delete next.lastEmptyMatchKey;
      delete next.pendingLocationExpansion;
      delete next.pendingLocationExpansionTarget;
      delete next.pendingLocationBranch;
    } else if (action.side === "unsure") {
      const sideUpdate = updateAgencyFieldWithProvenanceNow(
        next,
        "istanbul_side",
        "unsure",
        { source: "structured_action", confidence: "medium", note: "side_unsure" }
      );
      next = sideUpdate.state;
      next.istanbul_side_source = "structured_card";
      const cityUpdate = updateAgencyFieldWithProvenanceNow(
        next,
        "selectedCity",
        "istanbul",
        { source: "structured_action", confidence: "high", note: "side_unsure_city" }
      );
      next = cityUpdate.state;
      next.locationSelectionConfirmed = true;
      next.sideSelectionConfirmed = false;
      next.pendingSideGuidance = true;
    }
  } else if (action.type === "branch_side_confirm") {
    if (action.action === "confirm" && (action.side === "anatolian" || action.side === "european")) {
      if (next.istanbul_side === action.side && next.sideSelectionConfirmed === true) {
        return { ctx: next, idempotentSkip: true, clearedFields };
      }
      const sideUpdate = updateAgencyFieldWithProvenanceNow(
        next,
        "istanbul_side",
        action.side,
        { source: "structured_action", confidence: "high", note: "branch_side_confirm" }
      );
      next = sideUpdate.state;
      next.istanbul_side_source = "structured_card";
      const cityUpdate = updateAgencyFieldWithProvenanceNow(
        next,
        "selectedCity",
        "istanbul",
        { source: "structured_action", confidence: "high", note: "branch_side_city" }
      );
      next = cityUpdate.state;
      next.locationSelectionConfirmed = true;
      next.sideSelectionConfirmed = true;
      delete next.pendingSideClarification;
      delete next.pendingSideGuidance;
    } else {
      // Explicit reject of Istanbul-only branch → re-ask city, keep intake/consent/treatment.
      delete next.istanbul_side;
      delete next.sideSelectionConfirmed;
      delete next.selectedCity;
      next = clearAgencyFieldProvenance(next, "istanbul_side");
      next = clearAgencyFieldProvenance(next, "selectedCity");
      delete next.locationSelectionConfirmed;
      delete next.pendingSideClarification;
      next.pendingCitySelection = true;
      clearedFields.push("selectedCity", "istanbul_side");
    }
  }

  if (action.actionId) {
    next.lastStructuredActionId = action.actionId;
  }

  return { ctx: next, idempotentSkip: false, clearedFields };
}

/**
 * Build a route-ready gate payload from the next action.
 * Returns null when the route should continue into matching / LLM paths.
 */
export function buildGateResponseFromAction(
  action: NextConversationAction,
  sessionContext: AgencySessionState
): {
  reply: string;
  type: string;
  sessionContext: AgencySessionState;
  showClinicCards: boolean;
  citySelectionCard?: any;
  sideClarificationCard?: any;
  stage: FeelinHealthyStage;
} | null {
  const ctx = { ...sessionContext };

  switch (action.kind) {
    case "greeting":
      return null; // greeting copy is owned by Prompt Studio / route
    case "consent":
      return null; // consent payload built by route (privacy settings)
    case "intake":
      ctx.intakeStage = action.group;
      return {
        reply: action.prompt,
        type: "text",
        sessionContext: ctx,
        showClinicCards: false,
        stage: action.group === 1 ? "intake_group_1" : action.group === 2 ? "intake_group_2" : "intake_group_3",
      };
    case "ask_treatment":
      return {
        reply: action.prompt,
        type: "text",
        sessionContext: ctx,
        showClinicCards: false,
        stage: "ask_treatment",
      };
    case "ask_city":
      ctx.pendingCitySelection = true;
      ctx.availableCities = action.availableCities;
      return {
        reply: action.card.message,
        type: "city_selection",
        citySelectionCard: action.card,
        sessionContext: ctx,
        showClinicCards: false,
        stage: "city_selection",
      };
    case "ask_side":
      ctx.pendingSideClarification = true;
      if (ctx.selectedCity !== "istanbul") ctx.selectedCity = "istanbul";
      return {
        reply: action.card.message,
        type: action.card.type,
        sideClarificationCard: action.card,
        sessionContext: ctx,
        showClinicCards: false,
        stage: "istanbul_side_selection",
      };
    case "location_negotiation":
      ctx.pendingLocationExpansion = true;
      ctx.pendingLocationExpansionTarget = action.targetDisplayName;
      ctx.pendingLocationBranch = action.treatmentBranch;
      return {
        reply: action.prompt,
        type: "location_negotiation",
        sessionContext: ctx,
        showClinicCards: false,
        stage: "location_negotiation",
      };
    case "match_clinics":
    case "clinic_selection":
    case "selected_clinic":
    case "quote":
    case "idle":
      return null;
    default:
      return null;
  }
}

/** True when the next action is a hard UI gate that must not be overridden by the LLM. */
export function isHardGateAction(action: NextConversationAction): boolean {
  return (
    action.kind === "consent" ||
    action.kind === "intake" ||
    action.kind === "ask_treatment" ||
    action.kind === "ask_city" ||
    action.kind === "ask_side" ||
    action.kind === "location_negotiation"
  );
}

/**
 * Intake / treatment / location-negotiation hard-gates may yield to the LLM when
 * the patient already answered in natural language. Consent and city/side cards
 * stay hard (structured UI).
 */
export function shouldAllowLlmAssistForIntakeGate(
  action: NextConversationAction,
  userMessage?: string | null
): boolean {
  if (
    action.kind !== "intake" &&
    action.kind !== "ask_treatment" &&
    action.kind !== "location_negotiation"
  ) {
    return false;
  }
  const text = String(userMessage || "").trim();
  if (text.length < 2) return false;
  // Affirmative / "değerlendirelim" after empty-match must stay on the structured
  // city card path — never let the model echo the same empty-match paragraph.
  if (action.kind === "location_negotiation" && isLocationExpansionAffirmative(text)) {
    return false;
  }
  return true;
}

/**
 * Infer treatment branch from free text without relying on SlotExtractor locale quirks.
 * Handles Turkish capital İ ("İmplant") which breaks ASCII toLowerCase matching.
 */
export function inferTreatmentFromText(text?: string | null): string | null {
  if (!text) return null;
  const normalized = String(text)
    .toLocaleLowerCase("tr-TR")
    .replace(/\u0307/g, "")
    .normalize("NFC");

  const rules: Array<{ id: string; patterns: RegExp[] }> = [
    { id: "implant", patterns: [/\bimplant\b/, /diş implant/, /dis implant/, /dental implant/] },
    { id: "hair_transplant", patterns: [/sa[cç]\s*ekim/, /hair\s*transplant/, /\bfue\b/, /\bdhi\b/] },
    {
      id: "aesthetic_surgery",
      patterns: [
        /estetik/,
        /rinoplasti/,
        /rhinoplasty/,
        /botoks/,
        /botox/,
        /dolgu/,
        /liposuction/,
        /lipo/,
        /meme\s*b[uü]y[uü]t/,
        /g[oö]ğ[uü]s\s*b[uü]y[uü]t/,
        /breast\s*(aug|enlarg)/,
        /popo\s*b[uü]y[uü]t/,
        /kal[cç]a\s*b[uü]y[uü]t/,
        /\bbbl\b/,
        /butt\s*(lift|aug)/,
      ],
    },
    { id: "dental", patterns: [/\b(zirkonyum|kaplama|veneers?|crowns?|diş|dis tedavi|dental)\b/] },
    { id: "ivf", patterns: [/\b(tüp bebek|tup bebek|\bivf\b|fertility)\b/] },
    { id: "eye_treatments", patterns: [/\b(göz|goz|lasik|katarakt|\beye\b)\b/] },
    { id: "obesity", patterns: [/\b(obezite|bariatrik|tüp mide|tup mide)\b/] },
  ];

  for (const rule of rules) {
    if (rule.patterns.some((re) => re.test(normalized))) return rule.id;
  }
  return null;
}

/**
 * Ensure treatment known on session from pending/original health request.
 * Never clears an already-set treatment.
 */
export function ensureTreatmentFromPending(
  ctx: AgencySessionStateInput,
  fallbackText?: string | null
): AgencySessionState {
  const current = normalizeAgencySessionState(ctx);
  if (getAgencyTreatmentContext(current).category) return current;
  const source =
    fallbackText ||
    current.pendingHealthRequest ||
    current.pendingUserMessage ||
    "";
  const inferred = inferTreatmentFromText(source);
  if (!inferred) return current;
  return { ...current, lastTreatmentCategory: inferred };
}

/**
 * Apply an explicit mid-chat treatment change (or first detection).
 * Patients often switch after an empty-match prompt ("diş → saç ekimi").
 * Stale empty-match locks must clear so matching can restart.
 */
export function applyDetectedTreatmentUpdate(
  ctx: AgencySessionStateInput,
  opts: {
    message?: string | null;
    extractedTreatment?: string | null;
    modelTreatment?: string | null;
  } = {}
): {
  ctx: AgencySessionState;
  changed: boolean;
  previous: string | null;
  next: string | null;
} {
  const candidateRaw =
    (opts.extractedTreatment && String(opts.extractedTreatment).trim()) ||
    (opts.modelTreatment && String(opts.modelTreatment).trim()) ||
    inferTreatmentFromText(opts.message) ||
    null;

  if (!candidateRaw) {
    return {
      ctx,
      changed: false,
      previous: getAgencyTreatmentContext(ctx).category || null,
      next: null,
    };
  }

  const previous = getAgencyTreatmentContext(ctx).category || null;
  const prevBranch = previous ? normalizeTreatmentBranch(previous) : null;
  const nextBranch = normalizeTreatmentBranch(candidateRaw);

  if (prevBranch && prevBranch === nextBranch) {
    // Same branch — keep existing label unless missing.
    if (!ctx.lastTreatmentCategory) {
      return {
        ctx: { ...ctx, lastTreatmentCategory: candidateRaw },
        changed: false,
        previous,
        next: candidateRaw,
      };
    }
    return { ctx, changed: false, previous, next: candidateRaw };
  }

  const next = { ...ctx };
  next.lastTreatmentCategory = candidateRaw;
  next.treatmentId = candidateRaw;
  if (opts.message) next.pendingHealthRequest = String(opts.message);
  delete next.pendingLocationExpansion;
  delete next.pendingLocationExpansionTarget;
  delete next.pendingLocationBranch;
  delete next.lastEmptyMatchKey;
  delete next.lastRecommendedClinicIds;
  next.__forceClinicMatching = true;
  if (next.leadStage !== "quote_request_created" && next.leadStage !== "completed") {
    next.leadStage = "recommendation";
  }

  return {
    ctx: next,
    changed: true,
    previous,
    next: candidateRaw,
  };
}

/**
 * Merge session updates without wiping completed intake / consent / treatment / location.
 */
export function mergeFeelinHealthySession(
  previous: AgencySessionStateInput,
  incoming: AgencySessionState | Record<string, unknown>
): AgencySessionState {
  const merged: AgencySessionState = { ...previous, ...incoming };

  const preserveKeys = [
    "quoteConsent",
    "patientName",
    "firstName",
    "lastName",
    "patientAge",
    "age",
    "patientGender",
    "gender",
    "patientEmail",
    "patientEmailStatus",
    "patientPhone",
    "patientCountry",
    "travelDate",
    "travelDateStart",
    "travelDateText",
    "lastTreatmentCategory",
    "selectedCity",
    "istanbul_side",
    "locationSelectionConfirmed",
    "sideSelectionConfirmed",
    "sessionId",
  ] as const;

  for (const key of preserveKeys) {
    const prevVal = previous[key];
    const nextVal = merged[key];
    const nextEmpty =
      nextVal === undefined ||
      nextVal === null ||
      nextVal === "" ||
      nextVal === false;
    if (prevVal !== undefined && prevVal !== null && prevVal !== "" && nextEmpty) {
      (merged as Record<string, unknown>)[key] = prevVal;
    }
  }

  if (previous.quoteConsent === true) merged.quoteConsent = true;
  return merged;
}
