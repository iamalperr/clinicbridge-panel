/**
 * Server-side agency lead status updates (Admin SDK).
 * Used by authenticated Portal API routes — not client Firestore writes.
 */

import { getAdminDb } from "@/lib/firebase-admin";
import {
  isManualLeadStatusUpdate,
  normalizeLeadStatusHistory,
} from "@/lib/agency/leadStatusActions";
import type { LeadStatus } from "@/lib/types/agency";

export interface UpdateAgencyLeadStatusInput {
  agencyId: string;
  leadId: string;
  status: LeadStatus;
  changedBy?: string;
  note?: string;
}

export interface UpdateAgencyLeadStatusResult {
  ok: true;
  status: LeadStatus;
  skipped: boolean;
}

export class LeadStatusUpdateError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "LeadStatusUpdateError";
    this.code = code;
    this.status = status;
  }
}

export async function updateAgencyLeadStatus(
  input: UpdateAgencyLeadStatusInput
): Promise<UpdateAgencyLeadStatusResult> {
  const { agencyId, leadId, status, changedBy, note } = input;

  if (!agencyId || !leadId) {
    throw new LeadStatusUpdateError("INVALID_PAYLOAD", "agencyId and leadId are required", 400);
  }

  if (!isManualLeadStatusUpdate(status)) {
    throw new LeadStatusUpdateError(
      "INVALID_STATUS",
      `Status must be one of: clinic_contacted, converted, lost`,
      400
    );
  }

  const adminDb = getAdminDb();
  if (!adminDb) {
    throw new LeadStatusUpdateError("DB_UNAVAILABLE", "Database unavailable", 503);
  }

  const leadRef = adminDb.collection("agencies").doc(agencyId).collection("leads").doc(leadId);
  const snap = await leadRef.get();
  if (!snap.exists) {
    throw new LeadStatusUpdateError("LEAD_NOT_FOUND", "Lead not found", 404);
  }

  const current = snap.data()!;
  const currentStatus = current.status as LeadStatus | undefined;

  if (currentStatus === status) {
    return { ok: true, status, skipped: true };
  }

  const historyEntry = {
    status,
    changedAt: new Date().toISOString(),
    ...(changedBy ? { changedBy } : {}),
    ...(note ? { note } : {}),
  };

  const nextHistory = [...normalizeLeadStatusHistory(current.statusHistory), historyEntry];

  await leadRef.set(
    {
      status,
      statusHistory: nextHistory,
      updatedAt: new Date().toISOString(),
      ...(changedBy ? { updatedBy: changedBy } : {}),
    },
    { merge: true }
  );

  return { ok: true, status, skipped: false };
}
