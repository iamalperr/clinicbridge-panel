/**
 * Appointment cancellation semantics for Agent Core (product-global).
 *
 * A draft that has not been submitted can be discarded locally. A submitted appointment
 * has no patient-side cancel operation, so the request is forwarded to the clinic as a
 * confirmed Contact Request and nothing ever claims the appointment itself was cancelled.
 */

import { IntentRouter } from "@/lib/conversation/intentRouter";
import { PendingActionManager } from "@/lib/conversation/PendingActionManager";
import { isQuestionClause, splitUtteranceClauses } from "@/lib/conversation/slotParsing";
import type { PendingAction } from "@/lib/conversation/types";
import { APPOINTMENT_CANCELLATION_PURPOSE } from "@/lib/contact-request/types";

export type AppointmentCancellationTurnKind = "request" | "question" | "negation" | "none";

export interface AppointmentCancellationTurn {
  kind: AppointmentCancellationTurnKind;
  /** Question clauses asked alongside a cancellation request, answered separately. */
  knowledgeQuestion: string | null;
}

const MENTIONS_APPOINTMENT_CANCEL = /(?<!\p{L})(?:randevu\p{L}*\s+(?:\p{L}+\s+)?iptal|iptal\s+\p{L}*\s*randevu|cancel\s+(?:the\s+|my\s+)?appointment)/iu;
const CANCELLATION_QUESTION =
  /(?<!\p{L})(?:nas[ıi]l\s+iptal\s+ed|iptal\s+(?:etmek\s+)?i[çc]in\s+ne\s+yap|iptal\s+edebilir\s+miyim|iptal\s+ettirebilir\s+miyim|how\s+(?:can|do)\s+i\s+cancel)/iu;
const CANCELLATION_NEGATION =
  /(?<!\p{L})(?:iptal\s+(?:etmek\s+|ettirmek\s+)?istemiyorum|iptal\s+etmeyin|iptal\s+etmeyelim|vazge[çc]medim|(?:do\s+not|don'?t)\s+(?:want\s+to\s+)?cancel)/iu;

/**
 * Classifies a turn taken while no appointment draft is being collected.
 * `submittedOnRecord` is true when this conversation already submitted an appointment.
 */
export function classifyAppointmentCancellationTurn(
  message: string,
  context: { submittedOnRecord: boolean }
): AppointmentCancellationTurn {
  const none: AppointmentCancellationTurn = { kind: "none", knowledgeQuestion: null };
  const text = String(message || "").normalize("NFC");
  if (!text.trim()) return none;
  const aboutAppointment = context.submittedOnRecord || /(?<!\p{L})(?:randevu|appointment)/iu.test(text);
  if (!aboutAppointment) return none;

  if (CANCELLATION_NEGATION.test(text)) return { kind: "negation", knowledgeQuestion: null };

  const clauses = splitUtteranceClauses(text);
  const cancelClauses = clauses.filter((clause) => IntentRouter.hasExplicitCancelClause(clause));
  if (
    cancelClauses.length > 0 &&
    (context.submittedOnRecord || cancelClauses.some((clause) => MENTIONS_APPOINTMENT_CANCEL.test(clause)))
  ) {
    const questions = clauses.filter((clause) => !cancelClauses.includes(clause) && isQuestionClause(clause));
    return { kind: "request", knowledgeQuestion: questions.length > 0 ? questions.join(" ") : null };
  }

  if (CANCELLATION_QUESTION.test(text)) return { kind: "question", knowledgeQuestion: null };
  return none;
}

export function createAppointmentCancellationOfferAction(payload: {
  appointmentId?: string | null;
  patientName?: string;
  patientPhone?: string;
  patientEmail?: string;
  language: string;
  clinicId: string;
  conversationId: string;
}): PendingAction {
  return PendingActionManager.createPendingAction(
    "create_contact_request",
    {
      purpose: APPOINTMENT_CANCELLATION_PURPOSE,
      preferredContactMethod: "unspecified",
      appointmentId: payload.appointmentId ?? null,
      patientName: payload.patientName,
      patientPhone: payload.patientPhone,
      patientEmail: payload.patientEmail,
      language: payload.language,
      clinicId: payload.clinicId,
      conversationId: payload.conversationId,
    },
    undefined,
    "Confirm appointment cancellation request forwarding"
  );
}

const AFFIRMATIVE_LEAD = /^(?:evet|tamam|olur|tabii|tabi|lütfen|yes|ok|okay|sure)(?!\p{L})/iu;
const REFUSAL_WORD = /(?<!\p{L})(?:hayır|hayir|istemiyorum|vazgeçtim|vazgectim|no)(?!\p{L})/iu;

/** "Evet", "Evet, iptal edin." or a repeated cancel request accepts a pending offer. */
export function isCancellationOfferAcceptance(message: string, turn: AppointmentCancellationTurn): boolean {
  if (turn.kind === "request") return true;
  if (turn.kind === "negation") return false;
  const text = String(message || "").trim().normalize("NFC");
  if (PendingActionManager.isConfirmation(text)) return true;
  return AFFIRMATIVE_LEAD.test(text) && !REFUSAL_WORD.test(text);
}

/** A cancellation-request offer (or its contact-detail follow-up) is waiting for the patient. */
export function isAppointmentCancellationPending(pending: PendingAction | null | undefined): boolean {
  if (!pending || pending.status !== "pending") return false;
  const purpose = (pending.payload as { purpose?: unknown } | undefined)?.purpose;
  return (
    purpose === APPOINTMENT_CANCELLATION_PURPOSE &&
    (pending.type === "create_contact_request" ||
      pending.type === "collect_contact_phone" ||
      pending.type === "collect_contact_email")
  );
}

const CANCELLATION_CLAIM =
  /(?<!\p{L})(?:(?:iptal\s+(?:ettim|ettik|edildi|edilmiştir|edilmistir|edilmiş|edilmis|olmuştur|oldu)|sildim|kaldırdım|kaldirdim)(?!\p{L})|(?:i|we)\s*(?:'ve|\s+have)\s+cancel(?:l)?ed|(?:has|have)\s+been\s+cancel(?:l)?ed|is\s+(?:now\s+)?cancel(?:l)?ed)/iu;

/** Model text that says something was cancelled/removed — never true without a verified action. */
export function containsUnverifiedCancellationClaim(reply: string): boolean {
  return CANCELLATION_CLAIM.test(String(reply || "").normalize("NFC"));
}
