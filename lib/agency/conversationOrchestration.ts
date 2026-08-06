/**
 * Agency conversation orchestration (Architecture V2).
 *
 * Business rules remain deterministic (consent, city/side, matching, quote).
 * This module only classifies conversational turns and plans pause/resume
 * so the assistant can answer the latest user question first, then return
 * to the pending workflow without restarting intake.
 *
 * Never authorizes persistence, consent, matching, or clinic selection.
 */

import { IntentRouter } from "@/lib/conversation/intentRouter";
import type { AgencySessionState, AgencySessionStateInput } from "./agencySessionState";
import { normalizeAgencySessionState } from "./agencySessionState";
import type { FeelinHealthyStage } from "./feelinhealthyConversationMachine";
import type { NextConversationAction } from "./feelinhealthyConversationMachine";
import {
  composeExplainBeforeAskIntakePrompt,
  getIntakeProcessIntroduction,
  getIntakePausedForInformationCopy,
  isAgencyInformationOnlyPreference,
  markIntakeInformationOnly,
} from "./intakeExplainBeforeAsk";

/** Conversation modes — session metadata, not prompts. */
export type AgencyConversationMode =
  | "information"
  | "quote"
  | "appointment"
  | "intake"
  | "matching"
  | "consent"
  | "follow_up";

export type AgencyTurnKind =
  | "informational_interruption"
  | "continue_resume"
  | "quote_request"
  | "appointment_request"
  | "intake_answer"
  | "workflow_continue";

export interface AgencyTurnClassification {
  kind: AgencyTurnKind;
  mode: AgencyConversationMode;
  informationType?: string;
  /** True when the workflow should pause for an answer-then-resume turn. */
  shouldPauseWorkflow: boolean;
  /** True when a paused workflow should resume exactly where left. */
  shouldResumeWorkflow: boolean;
  /** Show quote/appointment explanation once before starting intake. */
  needsQuotePreamble: boolean;
  needsAppointmentPreamble: boolean;
}

export interface AgencyWorkflowPausePlan {
  workflowPaused: true;
  conversationMode: "information";
  pausedConversationMode: AgencyConversationMode;
  resumeIntakeGroup?: AgencySessionState["resumeIntakeGroup"];
  resumePromptKey?: string;
  pauseReason: string;
  lastAnsweredUserQuestion?: string;
}

export interface AgencyWorkflowResumePlan {
  workflowPaused: false;
  conversationMode: AgencyConversationMode;
  pausedConversationMode?: undefined;
  resumeIntakeGroup?: undefined;
  resumePromptKey?: undefined;
  pauseReason?: undefined;
}

const CONTINUE_RE =
  /\b(devam\s*edelim|devam\s*et|devam\s*ede(?:lim|biliriz)|kald[ıi][gğ][ıi]m[ıi]z\s*yerden|let'?s\s+continue|continue|resume|back\s+to\s+(the\s+)?(form|questions|intake))\b/i;

const QUOTE_RE =
  /\b(teklif|fiyat\s*teklif|quote|get\s+a\s+quote|pricing\s+request|teklif\s*almak|teklif\s*isterim)\b/i;

const APPOINTMENT_RE =
  /\b(randevu|appointment|book\s+(an?\s+)?appointment|randevu\s*almak|randevu\s*isterim)\b/i;

const PROCESS_RE =
  /\b(s[uü]re[cç]|nas[ıi]l\s+i[sş]ler|nasil\s+isler|how\s+(does\s+it\s+)?work|process|ad[ıi]mlar|ne\s+yap(?:aca[gğ][ıi]z|mal[ıi]y[ıi]z)|what\s+happens\s+next)\b/i;

function normalizeMsg(message?: string | null): string {
  return String(message || "")
    .trim()
    .toLocaleLowerCase("tr-TR");
}

function truncateQuestion(message: string, max = 160): string {
  const t = String(message || "").trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Map machine stage → conversation mode. */
export function mapStageToConversationMode(
  stage: FeelinHealthyStage | string | null | undefined
): AgencyConversationMode {
  switch (stage) {
    case "consent":
      return "consent";
    case "intake_group_1":
    case "intake_group_2":
    case "intake_group_3":
    case "ask_treatment":
      return "intake";
    case "matching":
    case "clinic_selection":
    case "city_selection":
    case "istanbul_side_selection":
    case "location_negotiation":
      return "matching";
    case "quote":
      return "quote";
    case "appointment":
      return "appointment";
    case "selected_clinic":
      return "follow_up";
    default:
      return "information";
  }
}

export function isAgencyContinueResumePhrase(message?: string | null): boolean {
  return CONTINUE_RE.test(normalizeMsg(message));
}

export function isAgencyQuoteRequestPhrase(message?: string | null): boolean {
  const lower = normalizeMsg(message);
  if (!lower) return false;
  // Prefer quote over generic pricing when "teklif" is explicit.
  return QUOTE_RE.test(lower);
}

export function isAgencyAppointmentRequestPhrase(message?: string | null): boolean {
  return APPOINTMENT_RE.test(normalizeMsg(message));
}

/**
 * Detect informational digressions during an active workflow.
 * Does not treat short intake answers (name, age) as interruptions.
 */
export function isAgencyInformationalInterruption(
  message?: string | null,
  opts?: { workflowActive?: boolean }
): { isInterruption: boolean; informationType?: string } {
  const lower = normalizeMsg(message);
  if (!lower || lower.length < 3) return { isInterruption: false };

  // Pure continue / quote / appointment are handled separately.
  if (isAgencyContinueResumePhrase(lower)) return { isInterruption: false };
  if (isAgencyAppointmentRequestPhrase(lower)) return { isInterruption: false };

  const info = IntentRouter.isInformationalQuestion(lower);
  if (info.isQuestion) {
    return {
      isInterruption: true,
      informationType: info.informationType || String(info.intent || "general"),
    };
  }

  if (PROCESS_RE.test(lower)) {
    return { isInterruption: true, informationType: "process" };
  }

  // Question mark + substantive text during workflow → treat as digression.
  if (opts?.workflowActive && /[?]/.test(lower) && lower.length >= 8) {
    return { isInterruption: true, informationType: "general" };
  }

  return { isInterruption: false };
}

/**
 * Classify the latest user turn for agency matching-chat.
 * Pure — no I/O, no persistence authorization.
 */
export function classifyAgencyConversationTurn(params: {
  message?: string | null;
  sessionContext?: AgencySessionStateInput | null;
  stage?: FeelinHealthyStage | string | null;
  nextAction?: NextConversationAction | null;
}): AgencyTurnClassification {
  const ctx = normalizeAgencySessionState(params.sessionContext || {});
  const stageMode = mapStageToConversationMode(
    params.stage || (ctx.conversationMode as FeelinHealthyStage) || null
  );
  const workflowActive =
    params.nextAction?.kind === "intake" ||
    params.nextAction?.kind === "ask_treatment" ||
    params.nextAction?.kind === "ask_city" ||
    params.nextAction?.kind === "ask_side" ||
    params.nextAction?.kind === "consent" ||
    params.nextAction?.kind === "location_negotiation" ||
    ctx.workflowPaused === true ||
    stageMode === "intake" ||
    stageMode === "consent" ||
    stageMode === "matching";

  if (isAgencyContinueResumePhrase(params.message)) {
    return {
      kind: "continue_resume",
      mode: (ctx.pausedConversationMode as AgencyConversationMode) || stageMode || "intake",
      shouldPauseWorkflow: false,
      shouldResumeWorkflow: true,
      needsQuotePreamble: false,
      needsAppointmentPreamble: false,
    };
  }

  if (isAgencyInformationOnlyPreference(params.message)) {
    return {
      kind: "informational_interruption",
      mode: "information",
      informationType: "information_only",
      shouldPauseWorkflow: true,
      shouldResumeWorkflow: false,
      needsQuotePreamble: false,
      needsAppointmentPreamble: false,
    };
  }

  if (isAgencyAppointmentRequestPhrase(params.message)) {
    return {
      kind: "appointment_request",
      mode: "appointment",
      shouldPauseWorkflow: false,
      shouldResumeWorkflow: false,
      needsQuotePreamble: false,
      needsAppointmentPreamble: ctx.appointmentFlowExplained !== true,
    };
  }

  if (isAgencyQuoteRequestPhrase(params.message)) {
    return {
      kind: "quote_request",
      mode: "quote",
      shouldPauseWorkflow: false,
      shouldResumeWorkflow: false,
      needsQuotePreamble: ctx.quoteFlowExplained !== true,
      needsAppointmentPreamble: false,
    };
  }

  const digression = isAgencyInformationalInterruption(params.message, {
    workflowActive,
  });
  if (digression.isInterruption && workflowActive) {
    return {
      kind: "informational_interruption",
      mode: "information",
      informationType: digression.informationType,
      shouldPauseWorkflow: true,
      shouldResumeWorkflow: false,
      needsQuotePreamble: false,
      needsAppointmentPreamble: false,
    };
  }

  if (workflowActive) {
    return {
      kind: "intake_answer",
      mode: stageMode,
      shouldPauseWorkflow: false,
      shouldResumeWorkflow: false,
      needsQuotePreamble: false,
      needsAppointmentPreamble: false,
    };
  }

  return {
    kind: "workflow_continue",
    mode: stageMode === "information" ? "information" : stageMode,
    shouldPauseWorkflow: false,
    shouldResumeWorkflow: false,
    needsQuotePreamble: false,
    needsAppointmentPreamble: false,
  };
}

/**
 * Hard gates that may yield to an informational interruption (answer then resume).
 * Consent / city / side cards stay authoritative UI widgets.
 */
export function canInterruptHardGateForInformation(
  action: NextConversationAction | null | undefined
): boolean {
  if (!action) return false;
  return (
    action.kind === "intake" ||
    action.kind === "ask_treatment" ||
    action.kind === "location_negotiation"
  );
}

export function buildAgencyWorkflowPausePlan(params: {
  currentMode: AgencyConversationMode;
  message?: string | null;
  resumeIntakeGroup?: AgencySessionState["resumeIntakeGroup"];
  resumePromptKey?: string;
  pauseReason?: string;
}): AgencyWorkflowPausePlan {
  return {
    workflowPaused: true,
    conversationMode: "information",
    pausedConversationMode: params.currentMode,
    resumeIntakeGroup: params.resumeIntakeGroup,
    resumePromptKey: params.resumePromptKey || "intake_resume",
    pauseReason: params.pauseReason || "informational_interruption",
    lastAnsweredUserQuestion: truncateQuestion(String(params.message || "")),
  };
}

export function buildAgencyWorkflowResumePlan(
  mode: AgencyConversationMode = "intake"
): AgencyWorkflowResumePlan {
  return {
    workflowPaused: false,
    conversationMode: mode,
    pausedConversationMode: undefined,
    resumeIntakeGroup: undefined,
    resumePromptKey: undefined,
    pauseReason: undefined,
  };
}

/** Apply pause plan onto session (additive; does not clear intake fields). */
export function applyAgencyWorkflowPause(
  sessionContext: AgencySessionStateInput,
  plan: AgencyWorkflowPausePlan
): AgencySessionState {
  const base = normalizeAgencySessionState(sessionContext);
  return normalizeAgencySessionState({
    ...base,
    workflowPaused: true,
    conversationMode: plan.conversationMode,
    pausedConversationMode: plan.pausedConversationMode,
    resumeIntakeGroup: plan.resumeIntakeGroup,
    resumePromptKey: plan.resumePromptKey,
    pauseReason: plan.pauseReason,
    lastAnsweredUserQuestion: plan.lastAnsweredUserQuestion,
  });
}

/** Clear pause flags and restore conversation mode. */
export function applyAgencyWorkflowResume(
  sessionContext: AgencySessionStateInput,
  mode?: AgencyConversationMode
): AgencySessionState {
  const base = normalizeAgencySessionState(sessionContext);
  const resumeMode =
    mode ||
    (base.pausedConversationMode as AgencyConversationMode) ||
    "intake";
  const next = { ...base } as AgencySessionState;
  next.workflowPaused = false;
  next.conversationMode = resumeMode;
  delete next.pausedConversationMode;
  delete next.resumeIntakeGroup;
  delete next.resumePromptKey;
  delete next.pauseReason;
  // Resuming the workflow exits information-only pause.
  delete next.intakeInformationOnly;
  return normalizeAgencySessionState(next);
}

export function getQuoteFlowPreamble(locale: string = "tr"): string {
  // Centralized process introduction (explain-before-ask).
  return getIntakeProcessIntroduction(locale);
}

export function getAppointmentFlowPreamble(locale: string = "tr"): string {
  return getIntakeProcessIntroduction(locale);
}

/**
 * Soft resume cue after answering an interruption.
 * Never sounds like a form validation error; never repeats the full Group purpose.
 */
export function buildAgencyIntakeResumeCue(params: {
  locale?: string;
  intakePrompt?: string | null;
  sessionContext?: AgencySessionStateInput | null;
  informationOnly?: boolean;
}): string {
  const locale = params.locale || "tr";
  if (params.informationOnly || params.sessionContext?.intakeInformationOnly === true) {
    return getIntakePausedForInformationCopy(locale);
  }
  const soft = composeExplainBeforeAskIntakePrompt({
    context: params.sessionContext || {},
    locale,
    variant: "soft_resume_after_interrupt",
  });
  // Prefer soft interruption return; do not append the verbatim prior ask.
  return soft.prompt;
}

/**
 * Compose informational answer + resume cue (single-clinic style).
 * If there is no answer, returns resume-only text.
 * If the LLM answer already asks the same intake fields as the gate, prefer the
 * authoritative gate only — never triple-ask in one turn.
 */
export function composeInterruptedAgencyReply(params: {
  answer?: string | null;
  resumeCue?: string | null;
}): string {
  const answer = String(params.answer || "").trim();
  const resume = String(params.resumeCue || "").trim();
  if (!answer) return resume;
  if (!resume) return answer;

  if (intakeAskOverlapsGate(answer, resume)) {
    return resume;
  }

  // Pure acknowledgement (thanks only) — gate already includes a thank-you + ask.
  if (isBareIntakeAcknowledgement(answer)) {
    return resume;
  }

  return `${answer}\n\n${resume}`;
}

/** True when LLM text is already soliciting the same intake fields as the gate. */
export function intakeAskOverlapsGate(llmAnswer: string, gateReply: string): boolean {
  const a = String(llmAnswer || "").toLowerCase();
  const g = String(gateReply || "").toLowerCase();
  if (!a.trim() || !g.trim()) return false;

  const contactSignals = (t: string) => {
    const email = /e-?posta|email|\bmail\b/.test(t);
    const phone = /telefon|phone|whatsapp|\+\d/.test(t);
    const country = /ülke|ulke|country|şehir|sehir|city you live|yaşadığınız/.test(t);
    return { email, phone, country, score: Number(email) + Number(phone) + Number(country) };
  };
  const identitySignals = (t: string) => {
    const name = /\b(ad(?:ınız|ini|ınızı)?|soyad|isim|name|surname)\b/.test(t);
    const age = /\b(yaş|yas|age)\b/.test(t);
    const gender = /\b(cinsiyet|gender|erkek|kadın|kadin|male|female)\b/.test(t);
    return { name, age, gender, score: Number(name) + Number(age) + Number(gender) };
  };
  const travelSignals = (t: string) =>
    /\b(seyahat|travel|ne zaman gel|when.*(travel|come)|planladığınız tarih)\b/.test(t);

  const ac = contactSignals(a);
  const gc = contactSignals(g);
  if (gc.score >= 2 && ac.score >= 2) return true;

  const ai = identitySignals(a);
  const gi = identitySignals(g);
  if (gi.score >= 2 && ai.score >= 2) return true;

  if (travelSignals(g) && travelSignals(a) && /\?/.test(a)) return true;

  return false;
}

function isBareIntakeAcknowledgement(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return false;
  // Short thanks / noted without a real informational answer.
  if (t.length > 160) return false;
  const thanksOnly =
    /^(teşekkür(?:ler| ederim)[^.!?]*[.!]?\s*)+$/i.test(t) ||
    /^(thank you[^.!?]*[.!]?\s*)+$/i.test(t) ||
    /^(noted|anlaşıldı|kaydettim|tamam)[.!]?$/i.test(t);
  return thanksOnly;
}

/** Mark quote preamble as shown (once). Also marks process intro explained. */
export function markQuoteFlowExplained(
  sessionContext: AgencySessionStateInput
): AgencySessionState {
  return normalizeAgencySessionState({
    ...normalizeAgencySessionState(sessionContext),
    quoteFlowExplained: true,
    intakeProcessExplained: true,
    conversationMode: "quote",
  });
}

export function markAppointmentFlowExplained(
  sessionContext: AgencySessionStateInput
): AgencySessionState {
  return normalizeAgencySessionState({
    ...normalizeAgencySessionState(sessionContext),
    appointmentFlowExplained: true,
    intakeProcessExplained: true,
    conversationMode: "appointment",
  });
}

export { isAgencyInformationOnlyPreference, markIntakeInformationOnly };
