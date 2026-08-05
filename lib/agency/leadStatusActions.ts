import type { LeadStatus } from "../types/agency";
import { LEAD_STATUSES } from "../types/agency";

/** UI action keys on the agency lead detail page. */
export type LeadStatusActionKey = "contacted" | "converted" | "lost";

/**
 * Canonical mapping from portal action buttons → backend LeadStatus.
 * Machine status values live in LEAD_STATUSES; labels are display-only.
 */
export const LEAD_STATUS_ACTIONS: Record<
  LeadStatusActionKey,
  {
    status: LeadStatus;
    historyNote: { tr: string; en: string };
    buttonLabel: { tr: string; en: string };
  }
> = {
  contacted: {
    status: "clinic_contacted",
    historyNote: { tr: "İletişime geçildi", en: "Contact made" },
    buttonLabel: { tr: "İletişime Geçildi", en: "Contacted" },
  },
  converted: {
    status: "converted",
    historyNote: { tr: "Onaylandı / Dönüştürüldü", en: "Approved / converted" },
    buttonLabel: { tr: "Onaylandı / Dönüştürüldü", en: "Approved / Converted" },
  },
  lost: {
    status: "lost",
    historyNote: { tr: "Kayıp / İptal", en: "Lost / cancelled" },
    buttonLabel: { tr: "Kayıp / İptal", en: "Lost / Cancelled" },
  },
};

export const MANUAL_LEAD_STATUS_UPDATES: LeadStatus[] = Object.values(LEAD_STATUS_ACTIONS).map(
  (action) => action.status
);

export function isCanonicalLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === "string" && value in LEAD_STATUSES;
}

export function isManualLeadStatusUpdate(value: unknown): value is LeadStatus {
  return typeof value === "string" && MANUAL_LEAD_STATUS_UPDATES.includes(value as LeadStatus);
}

export function resolveLeadStatusAction(actionKey: LeadStatusActionKey) {
  return LEAD_STATUS_ACTIONS[actionKey];
}

export function normalizeLeadStatusHistory(raw: unknown): LeadStatusHistoryEntryLike[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry) => entry && typeof entry === "object");
}

export interface LeadStatusHistoryEntryLike {
  status: LeadStatus | string;
  changedAt: string | { toDate?: () => Date };
  changedBy?: string;
  note?: string;
}

export function appendLeadStatusHistory(
  previous: unknown,
  entry: LeadStatusHistoryEntryLike,
  options?: { currentStatus?: LeadStatus; skipIfSameStatus?: boolean }
): LeadStatusHistoryEntryLike[] | null {
  if (options?.skipIfSameStatus && options.currentStatus === entry.status) {
    return null;
  }
  return [...normalizeLeadStatusHistory(previous), entry];
}
