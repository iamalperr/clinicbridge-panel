/**
 * Pure helpers for agency lead clinic-selection updates.
 * Does not change lead funnel status — only selected clinics + audit note.
 */

export function normalizeClinicIdList(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return Array.from(
    new Set(
      ids
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );
}

export function clinicSelectionEquals(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}

export function resolveAgencyClinicSelectionLimit(params: {
  agencySlug?: string | null;
  matchingMaxClinics?: number | null;
  settingsMaxClinics?: number | null;
  guestQuoteLimit?: number;
}): number {
  const isFeelinHealthy =
    String(params.agencySlug || "").toLowerCase() === "feelinhealthy";
  if (isFeelinHealthy) {
    return Math.max(1, Number(params.guestQuoteLimit || 2));
  }
  const fromMatching = Number(params.matchingMaxClinics || 0);
  if (fromMatching > 0) return fromMatching;
  const fromSettings = Number(params.settingsMaxClinics || 0);
  if (fromSettings > 0) return fromSettings;
  return 3;
}

export function buildClinicSelectionHistoryNote(params: {
  previousNames: string[];
  nextNames: string[];
  locale?: string;
}): string {
  const isEn = String(params.locale || "tr").toLowerCase().startsWith("en");
  const prev =
    params.previousNames.length > 0 ? params.previousNames.join(", ") : isEn ? "(none)" : "(yok)";
  const next =
    params.nextNames.length > 0 ? params.nextNames.join(", ") : isEn ? "(none)" : "(yok)";
  return isEn
    ? `Selected clinics updated: ${prev} → ${next}`
    : `Seçilen klinikler güncellendi: ${prev} → ${next}`;
}

/** Diff for clinic_requests sync. */
export function diffClinicSelection(
  previousIds: string[],
  nextIds: string[]
): { added: string[]; removed: string[]; kept: string[] } {
  const prev = new Set(previousIds);
  const next = new Set(nextIds);
  return {
    added: nextIds.filter((id) => !prev.has(id)),
    removed: previousIds.filter((id) => !next.has(id)),
    kept: nextIds.filter((id) => prev.has(id)),
  };
}
