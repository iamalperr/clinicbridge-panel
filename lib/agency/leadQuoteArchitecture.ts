/**
 * Canonical Lead ↔ Quote Request architecture for Agency Portal.
 *
 * Lead  = CRM / hasta adayı (funnel)
 * Quote = Operasyonel teklif talebi (iş emri)
 *
 * Quote is the operational source of truth after clinic selection.
 * Lead remains the CRM summary and always points to its quote when created.
 */

import type { LeadStatus } from "@/lib/types/agency";
import type { QuoteStatus } from "@/lib/types/matching";

export type PatientCandidateStage =
  | "discovery"
  | "qualified"
  | "clinic_selected"
  | "quote_created"
  | "closed";

export const PATIENT_CANDIDATE_LABELS: Record<
  PatientCandidateStage,
  { tr: string; en: string }
> = {
  discovery: { tr: "Keşif", en: "Discovery" },
  qualified: { tr: "Nitelikli aday", en: "Qualified candidate" },
  clinic_selected: { tr: "Klinik seçildi", en: "Clinic selected" },
  quote_created: { tr: "Teklif talebi oluştu", en: "Quote request created" },
  closed: { tr: "Kapandı", en: "Closed" },
};

/** Map internal LeadStatus → product funnel stage for UI copy. */
export function leadStatusToCandidateStage(status?: LeadStatus | string | null): PatientCandidateStage {
  switch (status) {
    case "quote_requested":
    case "appointment_requested":
    case "converted":
      return "quote_created";
    case "assigned_to_clinic":
    case "clinic_contacted":
      return "clinic_selected";
    case "lost":
      return "closed";
    case "waiting_for_assignment":
    case "pre_qualified":
      return "qualified";
    case "new":
    default:
      return "discovery";
  }
}

/** When a quote request is successfully persisted, lead must move here. */
export const LEAD_STATUS_AFTER_QUOTE: LeadStatus = "quote_requested";

/** Canonical quote status right after patient clinic selection. */
export const QUOTE_STATUS_AFTER_CREATE: QuoteStatus = "requested";

export function buildLeadQuoteLinkPatch(params: {
  quoteId: string;
  clinicIds: string[];
  clinicNames: string[];
  travelDate?: string | null;
  selectedCity?: string | null;
  istanbulSide?: string | null;
  nowIso?: string;
}): Record<string, unknown> {
  const now = params.nowIso || new Date().toISOString();
  const primaryName = params.clinicNames[0] || null;
  return {
    quoteId: params.quoteId,
    quoteRequestedAt: now,
    clinicIds: params.clinicIds,
    clinicRequestCount: params.clinicIds.length,
    selectedClinicNames: params.clinicNames,
    assignedClinicName: primaryName,
    travelDate: params.travelDate || null,
    selectedCity: params.selectedCity || null,
    istanbul_side: params.istanbulSide || null,
    status: LEAD_STATUS_AFTER_QUOTE,
    updatedAt: now,
  };
}

export function buildLeadQuoteStatusHistoryEntry(nowIso?: string) {
  return {
    status: LEAD_STATUS_AFTER_QUOTE,
    changedAt: nowIso || new Date().toISOString(),
    note: "Quote request created — lead linked to operational quote",
  };
}

/** Portal routes (authenticated). */
export function agencyLeadDetailPath(agencyId: string, leadId: string): string {
  return `/agency/agencies/${agencyId}/leads/${leadId}`;
}

export function agencyQuotesPath(agencyId: string, quoteId?: string): string {
  const base = `/agency/agencies/${agencyId}/quotes`;
  return quoteId ? `${base}?quoteId=${encodeURIComponent(quoteId)}` : base;
}
