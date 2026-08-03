/**
 * manualLabelPayload.ts
 *
 * Builds the Firestore payload for the manual conversation label.
 *
 * The manual label is an informational marker owned by clinic staff. It is
 * deliberately independent of the automatic appointment conversion workflow:
 * marking a conversation here never requires patient contact details, an
 * appointment id or a completed intake, and never writes the system status.
 */

/** Canonical value stored for a manually marked conversion. */
export const MANUAL_CONVERSION_VALUE = "converted_to_appointment";

/** Pre-canonical id still present on older conversation documents. */
const LEGACY_CONVERSION_ID = "appointment_converted";

/** True when the selected label id means "converted to appointment". */
export function isConvertedLabelId(labelId: unknown): boolean {
  return labelId === MANUAL_CONVERSION_VALUE || labelId === LEGACY_CONVERSION_ID;
}

/**
 * Reads the previous manual marking off a conversation document, tolerating
 * every field shape written by earlier versions of this feature.
 */
export function wasManuallyConverted(convData: Record<string, any> | null | undefined): boolean {
  if (!convData) return false;
  return (
    convData.manualConversionStatus === MANUAL_CONVERSION_VALUE ||
    convData.customLabel === MANUAL_CONVERSION_VALUE ||
    isConvertedLabelId(convData.customLabelId)
  );
}

export interface ManualLabelPayloadInput {
  /** Resolved label id, or null to clear the label. */
  labelId: string | null;
  /** Resolved display name, or null to clear the label. */
  labelName: string | null;
  /** Uid of the acting user, used only for audit fields. */
  actorUid: string | null;
  /** ISO timestamp applied to every audit field in this write. */
  now: string;
  /** Whether the document already carried a manual conversion marker. */
  previouslyConverted: boolean;
}

/**
 * Returns the complete set of fields for a single merge write.
 *
 * Only label and audit fields are produced. `status`, `conversationStatus`,
 * `systemStatus`, `convertedToAppointment` and `appointmentId` are never
 * included, so the automatic conversion state survives untouched.
 */
export function buildManualLabelPayload(
  input: ManualLabelPayloadInput
): Record<string, any> {
  const { labelId, labelName, actorUid, now, previouslyConverted } = input;
  const marking = isConvertedLabelId(labelId);

  const payload: Record<string, any> = {
    customLabelId: labelId ?? null,
    customLabelName: labelName ?? null,
    customLabel: marking ? MANUAL_CONVERSION_VALUE : labelId || null,
    manualConversionStatus: marking ? MANUAL_CONVERSION_VALUE : null,
    customLabelUpdatedBy: actorUid ?? null,
    customLabelUpdatedAt: now,
    updatedAt: now,
  };

  if (marking) {
    payload.manualConversionMarkedAt = now;
    payload.manualConversionMarkedBy = actorUid ?? null;
  } else if (previouslyConverted) {
    // Clearing an existing marker: record who removed it and drop the marker
    // timestamps so no stale signal can keep the conversation in the KPI.
    payload.manualConversionRemovedAt = now;
    payload.manualConversionRemovedBy = actorUid ?? null;
    payload.manualConversionMarkedAt = null;
    payload.manualConversionMarkedBy = null;
  }

  // Firestore rejects `undefined`; normalise before the write.
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) payload[key] = null;
  }

  return payload;
}
