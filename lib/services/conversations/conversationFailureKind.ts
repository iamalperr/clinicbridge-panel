/**
 * Why a conversation turn was not answered:
 * - technical_failure: an error/timeout/empty model output (training cannot fix it)
 * - knowledge_gap: no verified clinic information (belongs in "topic needing training")
 *
 * Shared by persistence (write) and the admin UI (read, incl. legacy logs).
 */

export type ConversationFailureKind = "technical_failure" | "knowledge_gap";

export const TECHNICAL_FAILURE_REASONS: ReadonlySet<string> = new Set([
  "llm_failure",
  "rag_failure",
  "timeout",
  "empty_reply_guard",
  "unconfigured_ai",
  "route_unhandled_exception",
  "llm_or_rag_failure",
  "technical_fallback_dual_write",
  "empty_model_reply",
]);

export const KNOWLEDGE_GAP_REASONS: ReadonlySet<string> = new Set([
  "groundedness_failure",
  "no_verified_info",
  "price_not_verified",
]);

export function failureKindForReason(reason?: string | null): ConversationFailureKind | null {
  const r = String(reason || "").trim();
  if (!r) return null;
  if (TECHNICAL_FAILURE_REASONS.has(r)) return "technical_failure";
  if (KNOWLEDGE_GAP_REASONS.has(r)) return "knowledge_gap";
  return null;
}

type FailureKindLog = {
  failureKind?: string | null;
  fallbackReason?: string | null;
  needsTraining?: boolean | null;
} | null | undefined;

function hasOwnFailureKind(log: NonNullable<FailureKindLog>): boolean {
  return Object.prototype.hasOwnProperty.call(log, "failureKind");
}

/**
 * Latest-turn failure kind. Logs written before `failureKind` existed fall back to
 * `fallbackReason`.
 */
export function resolveConversationFailureKind(log: FailureKindLog): ConversationFailureKind | null {
  if (!log) return null;
  if (log.failureKind === "technical_failure" || log.failureKind === "knowledge_gap") {
    return log.failureKind;
  }
  if (hasOwnFailureKind(log)) return null;
  return failureKindForReason(log.fallbackReason);
}

/**
 * Whether the "topic needing training" box applies. Logs carrying `failureKind`
 * only set needsTraining for knowledge gaps; legacy logs also set it for technical
 * fallbacks, which are excluded here.
 */
export function shouldShowTrainingTopic(log: FailureKindLog): boolean {
  if (!log?.needsTraining) return false;
  if (hasOwnFailureKind(log)) return true;
  return failureKindForReason(log.fallbackReason) !== "technical_failure";
}
