/**
 * customLabelClient.ts
 *
 * Client-side decision and messaging helpers for manual custom-label updates.
 *
 * Kept pure so the "exactly one request per deliberate selection" and
 * "no raw infrastructure text in the UI" guarantees are directly testable.
 */

/** Roles permitted to change a manual conversion label. */
export const LABEL_EDIT_ROLES: readonly string[] = ["superadmin", "admin", "clinicadmin"];

/** Collapses casing and underscore variants, e.g. "clinic_admin" -> "clinicadmin". */
export function normalizeRoleKey(role: string | null | undefined): string {
  return (role || "").toLowerCase().replace(/_/g, "");
}

/**
 * Role gate for manual label edits. Tenant scoping is enforced separately by
 * requireClinicAccess; this only covers the role dimension.
 */
export function canEditConversationLabel(role: string | null | undefined): boolean {
  return LABEL_EDIT_ROLES.includes(normalizeRoleKey(role));
}

export type LabelErrorCode =
  | "QUOTA_EXCEEDED"
  | "SERVICE_UNAVAILABLE"
  | "TIMEOUT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_REQUEST"
  | "INTERNAL_ERROR";

const TRANSIENT_CODES: ReadonlySet<string> = new Set([
  "QUOTA_EXCEEDED",
  "SERVICE_UNAVAILABLE",
  "TIMEOUT",
]);

/** Signatures of provider/infrastructure text that must never reach a user. */
const RAW_INFRASTRUCTURE_PATTERNS = [
  /RESOURCE_EXHAUSTED/i,
  /UNAVAILABLE/,
  /DEADLINE_EXCEEDED/i,
  /quota exceeded/i,
  /^\d+\s+[A-Z_]+:/,
  /firestore/i,
  /grpc/i,
];

export function isRawInfrastructureMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  return RAW_INFRASTRUCTURE_PATTERNS.some((p) => p.test(text));
}

export function isTransientLabelError(code: string | null | undefined): boolean {
  return !!code && TRANSIENT_CODES.has(code);
}

/**
 * Localized, user-safe message for a structured error code.
 * Non-English locales fall back to Turkish, matching the logs UI convention.
 */
export function resolveLabelErrorMessage(
  code: string | null | undefined,
  language: string
): string {
  const isEn = language === "en";

  if (isTransientLabelError(code)) {
    return isEn
      ? "The label could not be saved right now. Please try again shortly."
      : "Etiket şu anda kaydedilemedi. Lütfen kısa süre sonra tekrar deneyin.";
  }

  if (code === "FORBIDDEN" || code === "UNAUTHORIZED") {
    return isEn
      ? "You do not have permission to change this label."
      : "Bu etiketi değiştirme yetkiniz bulunmuyor.";
  }

  if (code === "NOT_FOUND") {
    return isEn ? "This conversation no longer exists." : "Bu görüşme artık mevcut değil.";
  }

  return isEn ? "Failed to update label" : "Etiket güncellenemedi";
}

export interface LabelSelectionState {
  /** Label the user just picked; null means "No Label". */
  selectedLabelId: string | null;
  /** Whether the conversation is already manually marked as converted. */
  currentlyManuallyConverted: boolean;
  /** Any custom label currently persisted on the conversation. */
  currentCustomLabelId: string | null | undefined;
  /** A PATCH for this conversation is already outstanding. */
  inFlight: boolean;
}

/**
 * True only for a deliberate state change with no request already running,
 * so one selection produces exactly one PATCH and double-clicks are dropped.
 */
export function shouldSendLabelUpdate(state: LabelSelectionState): boolean {
  const { selectedLabelId, currentlyManuallyConverted, currentCustomLabelId, inFlight } = state;

  if (inFlight) return false;

  const isSelectingConverted =
    selectedLabelId === "converted_to_appointment" || selectedLabelId === "appointment_converted";

  if (isSelectingConverted && currentlyManuallyConverted) return false;
  if (!selectedLabelId && !currentlyManuallyConverted && !currentCustomLabelId) return false;

  return true;
}
