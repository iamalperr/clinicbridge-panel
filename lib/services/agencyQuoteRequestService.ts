/**
 * Server-side quote request persistence for agency chat flows.
 * Creates lead (email notification) + quotes collection doc (Portal Teklif Talepleri).
 */

import { getAdminDb } from "@/lib/firebase-admin";
import {
  buildLeadQuoteLinkPatch,
  buildLeadQuoteStatusHistoryEntry,
  LEAD_STATUS_AFTER_QUOTE,
  QUOTE_STATUS_AFTER_CREATE,
} from "@/lib/agency/leadQuoteArchitecture";
import { submitAgencyLead } from "@/lib/services/leadSubmissionService";
import { pickOfficialClinicName } from "@/lib/services/agencyQuoteNotificationContent";
import { scheduleAndProcessAgencyLeadNotification } from "@/lib/services/agencyNotificationService";
import { scheduleAndProcessPatientLeadNotification } from "@/lib/services/patientNotificationService";
import {
  FEELINHEALTHY_CONFIG,
  normalizeTreatmentBranch,
  UNKNOWN_TREATMENT_BRANCH,
} from "@/lib/agency/feelinhealthyConfig";
import { resolveTreatmentQuoteKey } from "@/lib/agency/treatmentQuoteCycle";
import {
  consentVerificationErrorCode,
  resolveAgencyConsentVersion,
  verifyAcceptedAgencyConsent,
} from "@/lib/services/agencyConsentService";

export interface PersistAgencyQuoteRequestInput {
  agencyId: string;
  conversationId: string;
  clinicIds: string[];
  patientEmail: string;
  patientName?: string | null;
  patientPhone?: string | null;
  patientAge?: number | null;
  patientGender?: string | null;
  country?: string | null;
  language?: string | null;
  treatmentCategory?: string | null;
  treatmentSubcategory?: string | null;
  treatmentName?: string | null;
  selectedCity?: string | null;
  istanbulSide?: string | null;
  travelDate?: string | null;
  conversationSummary?: string | null;
  source?: string;
  sourceUrl?: string | null;
}

export interface PersistAgencyQuoteRequestResult {
  ok: boolean;
  leadId?: string;
  quoteId?: string;
  agencyId?: string;
  status?: string;
  /** True when a new quote document was created (not an idempotent hit). */
  quoteCreated?: boolean;
  treatmentCycleKey?: string | null;
  errorCode?: string;
  errorMessage?: string;
}

async function resolveClinicNames(agencyId: string, clinicIds: string[]): Promise<string[]> {
  const adminDb = getAdminDb();
  if (!adminDb) return clinicIds;
  const names: string[] = [];
  for (const clinicId of clinicIds) {
    const snap = await adminDb
      .collection("agencies")
      .doc(agencyId)
      .collection("clinics")
      .doc(clinicId)
      .get();
    if (snap.exists) {
      names.push(pickOfficialClinicName(snap.data(), clinicId));
      continue;
    }
    const top = await adminDb.collection("clinics").doc(clinicId).get();
    names.push(pickOfficialClinicName(top.exists ? top.data() : null, clinicId));
  }
  return names;
}

export async function persistAgencyQuoteRequest(
  input: PersistAgencyQuoteRequestInput
): Promise<PersistAgencyQuoteRequestResult> {
  const adminDb = getAdminDb();
  if (!adminDb) {
    return { ok: false, errorCode: "DB_UNAVAILABLE", errorMessage: "Database unavailable" };
  }

  const clinicIds = Array.from(new Set((input.clinicIds || []).filter(Boolean)));
  if (!input.conversationId) {
    return { ok: false, errorCode: "CONVERSATION_ID_REQUIRED", errorMessage: "Missing conversation id" };
  }
  if (!input.patientEmail) {
    return { ok: false, errorCode: "PATIENT_EMAIL_REQUIRED", errorMessage: "Missing patient email" };
  }
  if (clinicIds.length === 0) {
    return { ok: false, errorCode: "CLINIC_SELECTION_REQUIRED", errorMessage: "Missing clinic selection" };
  }
  // Guest FeelinHealthy quote comparison hard-cap (backend enforcement).
  const guestLimit = FEELINHEALTHY_CONFIG.guestQuoteClinicSelectionLimit || 2;
  if (clinicIds.length > guestLimit) {
    return {
      ok: false,
      errorCode: "CLINIC_SELECTION_LIMIT_EXCEEDED",
      errorMessage: `Teklif karşılaştırması için en fazla ${guestLimit} klinik seçebilirsiniz.`,
    };
  }

  try {
    // Consent gate: read-only verification only. Never manufacture acceptance here.
    const agencySnapForConsent = await adminDb.collection("agencies").doc(input.agencyId).get();
    const privacyVersion = resolveAgencyConsentVersion(agencySnapForConsent.data()?.privacySettings);
    const consentCheck = await verifyAcceptedAgencyConsent(
      input.agencyId,
      input.conversationId,
      privacyVersion
    );
    if (!consentCheck.ok) {
      const errorCode = consentVerificationErrorCode(consentCheck) || "CONSENT_REQUIRED";
      return {
        ok: false,
        errorCode,
        errorMessage: "Accepted privacy consent is required before creating a quote request",
      };
    }

    const leadResult = await submitAgencyLead({
      agencyId: input.agencyId,
      conversationId: input.conversationId,
      clinicIds,
      patientEmail: input.patientEmail,
      patientName: input.patientName || undefined,
      patientPhone: input.patientPhone || undefined,
      patientAge: input.patientAge ?? undefined,
      patientGender: input.patientGender || undefined,
      country: input.country || undefined,
      language: input.language || undefined,
      treatmentCategory: input.treatmentCategory || undefined,
      treatmentSubcategory: input.treatmentSubcategory || undefined,
      conversationSummary: input.conversationSummary || undefined,
      source: input.source || "widget",
      sourceUrl: input.sourceUrl || undefined,
      selectedCity: input.selectedCity || undefined,
      istanbulSide: input.istanbulSide || undefined,
      travelDate: input.travelDate || undefined,
      deferNotifications: true,
    });
    const leadId = leadResult.leadId;
    const clinicNames = await resolveClinicNames(input.agencyId, clinicIds);
    const now = new Date().toISOString();

    // Treatment-scoped idempotency: one quote per (conversation + treatment cycle).
    // Same lead may hold multiple treatment-specific quote docs.
    const treatmentCycleKey =
      resolveTreatmentQuoteKey(input.treatmentCategory) ||
      resolveTreatmentQuoteKey(input.treatmentName) ||
      (input.treatmentCategory
        ? normalizeTreatmentBranch(input.treatmentCategory)
        : null);
    const cycleKey =
      treatmentCycleKey && treatmentCycleKey !== UNKNOWN_TREATMENT_BRANCH
        ? treatmentCycleKey
        : null;

    const quotesCol = adminDb
      .collection("agencies")
      .doc(input.agencyId)
      .collection("quotes");

    const conversationQuotes = await quotesCol
      .where("conversationId", "==", input.conversationId)
      .get();

    const matchingExisting = conversationQuotes.docs.find((doc) => {
      const d = doc.data() || {};
      const docKey =
        resolveTreatmentQuoteKey(d.treatmentCycleKey) ||
        resolveTreatmentQuoteKey(d.treatmentCategory) ||
        resolveTreatmentQuoteKey(d.treatmentName);
      if (cycleKey && docKey) return docKey === cycleKey;
      // Legacy fallback: if no cycle key can be resolved, keep prior one-per-lead
      // behavior only when this lead has exactly one quote and no cycle keys.
      return false;
    });

    // Legacy one-quote-per-lead sessions without treatmentCycleKey: if this
    // conversation already has a quote for the same lead and we cannot resolve
    // a cycle key difference, reuse that quote for idempotent same-treatment retries.
    const legacySameLeadQuote =
      !matchingExisting && !cycleKey
        ? conversationQuotes.docs.find((doc) => String(doc.data()?.leadId || "") === leadId) ||
          null
        : null;

    const existingDoc = matchingExisting || legacySameLeadQuote;

    let quoteId: string;
    let quoteCreated = false;
    if (existingDoc) {
      quoteId = existingDoc.id;
      // Idempotent retry — refresh contact/clinic metadata only; never rewrite
      // historical treatment identity to a different cycle.
      await existingDoc.ref.set(
        {
          patientName: input.patientName || null,
          patientEmail: input.patientEmail || null,
          patientPhone: input.patientPhone || null,
          patientCountry: input.country || null,
          selectedClinicIds: clinicIds,
          selectedClinicNames: clinicNames,
          selectedCity: input.selectedCity || null,
          istanbul_side: input.istanbulSide || null,
          travelDate: input.travelDate || null,
          conversationId: input.conversationId,
          consentStatus: "accepted",
          status: QUOTE_STATUS_AFTER_CREATE,
          ...(cycleKey ? { treatmentCycleKey: cycleKey } : {}),
          updatedAt: now,
        },
        { merge: true }
      );
    } else {
      const quoteRef = quotesCol.doc();
      quoteId = quoteRef.id;
      quoteCreated = true;
      await quoteRef.set({
        agencyId: input.agencyId,
        leadId,
        patientName: input.patientName || null,
        patientEmail: input.patientEmail || null,
        patientPhone: input.patientPhone || null,
        patientCountry: input.country || null,
        treatmentCategory: input.treatmentCategory || "other",
        treatmentName: input.treatmentName || input.treatmentCategory || "",
        treatmentCycleKey: cycleKey,
        subTreatment: input.treatmentSubcategory || null,
        selectedClinicIds: clinicIds,
        selectedClinicNames: clinicNames,
        selectedCity: input.selectedCity || null,
        istanbul_side: input.istanbulSide || null,
        travelDate: input.travelDate || null,
        conversationId: input.conversationId,
        intakeAnswers: {
          travelDate: input.travelDate || null,
          selectedCity: input.selectedCity || null,
          istanbul_side: input.istanbulSide || null,
        },
        consentStatus: "accepted",
        status: QUOTE_STATUS_AFTER_CREATE,
        clinicOffers: [],
        internalNotes: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    console.log("[persistAgencyQuoteRequest] ok", {
      agencyId: input.agencyId,
      leadId,
      quoteId,
      quoteCreated,
      treatmentCycleKey: cycleKey,
      status: leadResult.status,
      clinicCount: clinicIds.length,
    });

    // Bi-directional link: Lead → Quote + status progression to quote_requested
    const leadRef = adminDb.collection("agencies").doc(input.agencyId).collection("leads").doc(leadId);
    const leadSnap = await leadRef.get();
    const previousHistory = Array.isArray(leadSnap.data()?.statusHistory)
      ? leadSnap.data()!.statusHistory
      : [];
    await leadRef.set(
      {
        ...buildLeadQuoteLinkPatch({
          quoteId,
          clinicIds,
          clinicNames,
          travelDate: input.travelDate,
          selectedCity: input.selectedCity,
          istanbulSide: input.istanbulSide,
          nowIso: now,
        }),
        // Keep an array of quote ids when multiple treatment cycles exist.
        quoteIds: Array.from(
          new Set([
            ...(Array.isArray(leadSnap.data()?.quoteIds) ? leadSnap.data()!.quoteIds : []),
            ...(leadSnap.data()?.quoteId ? [leadSnap.data()!.quoteId] : []),
            quoteId,
          ])
        ),
        statusHistory: [...previousHistory, buildLeadQuoteStatusHistoryEntry(now)],
      },
      { merge: true }
    );

    // Notify on first lead create OR on a newly created treatment quote under
    // an existing lead. Idempotent same-treatment retries must not re-email.
    // Job keys are quote-scoped so a second treatment under the same lead can notify.
    if (leadResult.status === "created" || quoteCreated) {
      const settled = await Promise.allSettled([
        scheduleAndProcessAgencyLeadNotification(input.agencyId, leadId, { quoteId }),
        scheduleAndProcessPatientLeadNotification(input.agencyId, leadId, { quoteId }),
      ]);
      for (const result of settled) {
        if (result.status === "rejected") {
          console.error(
            "[persistAgencyQuoteRequest] Notification error:",
            result.reason instanceof Error ? result.reason.message : result.reason
          );
        }
      }
    }

    return {
      ok: true,
      leadId,
      quoteId,
      agencyId: input.agencyId,
      status: LEAD_STATUS_AFTER_QUOTE,
      quoteCreated,
      treatmentCycleKey: cycleKey,
    };
  } catch (err: any) {
    const errorCode = err?.message || "PERSIST_FAILED";
    console.error("[persistAgencyQuoteRequest] failed", {
      agencyId: input.agencyId,
      errorCode,
    });
    return {
      ok: false,
      errorCode,
      errorMessage: "Failed to persist quote request",
    };
  }
}
