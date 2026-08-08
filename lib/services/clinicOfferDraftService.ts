/**
 * Draft clinicOffers on a quote from agency clinic pricing rows.
 * Idempotent: does not overwrite non-empty clinicOffers (agency edits preserved).
 */

import { getAdminDb } from "@/lib/firebase-admin";
import {
  normalizePricingRow,
  pickBestPricingForClinic,
  sanitizeDraftClinicOffer,
  type DraftClinicOffer,
  type PricingRowLike,
} from "@/lib/agency/clinicOfferDraft";
import { pickOfficialClinicName } from "@/lib/services/agencyQuoteNotificationContent";

/** Collect clinic ids from lead/quote shapes used across agency flows. */
function resolveSelectedClinicIds(lead: Record<string, unknown>, quote: Record<string, unknown>): string[] {
  const fromQuote = [
    ...(Array.isArray(quote.selectedClinicIds) ? quote.selectedClinicIds : []),
    quote.selectedClinicId,
  ];
  const fromLead = [
    ...(Array.isArray(lead.clinicIds) ? lead.clinicIds : []),
    lead.selectedClinicId,
  ];
  return Array.from(
    new Set(
      [...fromQuote, ...fromLead]
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );
}

export class ClinicOfferDraftError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ClinicOfferDraftError";
    this.code = code;
    this.status = status;
  }
}

export interface DraftOffersForLeadResult {
  ok: true;
  skipped: boolean;
  quoteId: string;
  clinicOffers: DraftClinicOffer[];
  missingClinicIds: string[];
}

export async function draftClinicOffersForLead(params: {
  agencyId: string;
  leadId: string;
  force?: boolean;
}): Promise<DraftOffersForLeadResult> {
  const { agencyId, leadId, force = false } = params;
  const adminDb = getAdminDb();
  if (!adminDb) throw new ClinicOfferDraftError("DB_UNAVAILABLE", "Database unavailable", 503);

  const leadRef = adminDb.collection("agencies").doc(agencyId).collection("leads").doc(leadId);
  const leadSnap = await leadRef.get();
  if (!leadSnap.exists) throw new ClinicOfferDraftError("LEAD_NOT_FOUND", "Lead not found", 404);
  const lead = leadSnap.data()!;

  let quoteId = lead.quoteId ? String(lead.quoteId) : "";
  let quoteRef = quoteId
    ? adminDb.collection("agencies").doc(agencyId).collection("quotes").doc(quoteId)
    : null;

  if (!quoteRef) {
    const qSnap = await adminDb
      .collection("agencies")
      .doc(agencyId)
      .collection("quotes")
      .where("leadId", "==", leadId)
      .limit(1)
      .get();
    if (qSnap.empty) {
      throw new ClinicOfferDraftError(
        "QUOTE_NOT_FOUND",
        "No quote linked to this lead yet",
        404
      );
    }
    quoteRef = qSnap.docs[0].ref;
    quoteId = qSnap.docs[0].id;
  }

  const quoteSnap = await quoteRef.get();
  if (!quoteSnap.exists) {
    throw new ClinicOfferDraftError("QUOTE_NOT_FOUND", "Quote not found", 404);
  }
  const quote = quoteSnap.data()!;
  const existingOffers = Array.isArray(quote.clinicOffers) ? quote.clinicOffers : [];
  if (existingOffers.length > 0 && !force) {
    return {
      ok: true,
      skipped: true,
      quoteId,
      clinicOffers: existingOffers as DraftClinicOffer[],
      missingClinicIds: [],
    };
  }

  let clinicIds = resolveSelectedClinicIds(lead as Record<string, unknown>, quote as Record<string, unknown>);

  // Fallback: open clinic_requests for this lead (selection may live only there).
  if (clinicIds.length === 0) {
    const crSnap = await adminDb
      .collection("agencies")
      .doc(agencyId)
      .collection("clinic_requests")
      .where("leadId", "==", leadId)
      .limit(20)
      .get();
    clinicIds = Array.from(
      new Set(
        crSnap.docs
          .map((d) => String(d.data()?.clinicId || "").trim())
          .filter(Boolean)
      )
    );
  }

  if (clinicIds.length === 0) {
    throw new ClinicOfferDraftError(
      "NO_CLINICS",
      "Lead/quote has no selected clinics",
      400
    );
  }

  const treatmentCategory =
    quote.treatmentCategory || lead.treatmentCategory || null;
  const treatmentSubcategory =
    quote.subTreatment || lead.treatmentSubcategory || null;
  const treatmentName = quote.treatmentName || treatmentCategory;

  const clinicOffers: DraftClinicOffer[] = [];
  const missingClinicIds: string[] = [];

  for (const clinicId of clinicIds) {
    const clinicSnap = await adminDb
      .collection("agencies")
      .doc(agencyId)
      .collection("clinics")
      .doc(clinicId)
      .get();
    const clinicName = pickOfficialClinicName(
      clinicSnap.exists ? clinicSnap.data() : null,
      clinicId
    );

    const pricingSnap = await adminDb
      .collection("agencies")
      .doc(agencyId)
      .collection("clinics")
      .doc(clinicId)
      .collection("pricing")
      .get();

    const pricingRows: PricingRowLike[] = pricingSnap.docs.map((d) =>
      normalizePricingRow({ id: d.id, ...d.data() })
    );

    const offer = pickBestPricingForClinic({
      clinicId,
      clinicName,
      treatmentCategory,
      treatmentSubcategory,
      treatmentName,
      pricingRows,
    });

    if (!offer) {
      missingClinicIds.push(clinicId);
      continue;
    }
    clinicOffers.push(sanitizeDraftClinicOffer(offer));
  }

  if (clinicOffers.length === 0) {
    throw new ClinicOfferDraftError(
      "NO_PRICING_MATCH",
      "No uploaded clinic pricing matched this treatment",
      422
    );
  }

  const now = new Date().toISOString();
  const nextStatus =
    quote.status === "requested" || quote.status === "draft"
      ? "offer_received"
      : typeof quote.status === "string" && quote.status
        ? quote.status
        : "offer_received";

  // Never write `undefined` — Firestore Admin rejects it (surfaced as INTERNAL_ERROR in UI).
  await quoteRef.set(
    {
      clinicOffers,
      status: nextStatus,
      offerDraftedAt: now,
      offerDraftSource: "clinic_pricing",
      updatedAt: now,
    },
    { merge: true }
  );

  // Mirror summary on lead for quick UI (non-breaking additive fields).
  await leadRef.set(
    {
      quoteId,
      draftOfferCount: clinicOffers.length,
      draftOfferSummary: clinicOffers.map((o) => ({
        clinicId: o.clinicId,
        clinicName: o.clinicName,
        priceMin: o.priceMin,
        priceMax: o.priceMax,
        currency: o.currency,
        treatmentName: o.treatmentName,
      })),
      updatedAt: now,
    },
    { merge: true }
  );

  return {
    ok: true,
    skipped: false,
    quoteId,
    clinicOffers,
    missingClinicIds,
  };
}
