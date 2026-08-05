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
import { FEELINHEALTHY_CONFIG } from "@/lib/agency/feelinhealthyConfig";
import { resolveAgencyConsentVersion } from "@/lib/services/agencyConsentService";

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
    // Ensure consent exists before lead create (covers missing index / race / version drift).
    try {
      const agencySnapForConsent = await adminDb.collection("agencies").doc(input.agencyId).get();
      const privacyVersion = resolveAgencyConsentVersion(agencySnapForConsent.data()?.privacySettings);
      const { saveConsentRecord, requireAcceptedAgencyConsent } = await import(
        "@/lib/services/agencyConsentService"
      );
      const hasConsent = await requireAcceptedAgencyConsent(
        input.agencyId,
        input.conversationId,
        privacyVersion
      );
      if (!hasConsent) {
        await saveConsentRecord(
          input.agencyId,
          input.conversationId,
          "accepted",
          privacyVersion,
          String(input.language || "tr"),
          "agency_widget"
        );
      }
    } catch (consentEnsureErr) {
      console.warn(
        "[persistAgencyQuoteRequest] consent ensure warning",
        consentEnsureErr instanceof Error ? consentEnsureErr.message : consentEnsureErr
      );
    }

    let leadResult;
    try {
      leadResult = await submitAgencyLead({
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
    } catch (leadErr: any) {
      // One retry after forcing consent write when consent gate still fails.
      if (leadErr?.message === "CONSENT_REQUIRED") {
        const agencySnapForConsent = await adminDb.collection("agencies").doc(input.agencyId).get();
        const privacyVersion = resolveAgencyConsentVersion(agencySnapForConsent.data()?.privacySettings);
        const { saveConsentRecord } = await import("@/lib/services/agencyConsentService");
        await saveConsentRecord(
          input.agencyId,
          input.conversationId,
          "accepted",
          privacyVersion,
          String(input.language || "tr"),
          "agency_widget"
        );
        leadResult = await submitAgencyLead({
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
      } else {
        throw leadErr;
      }
    }
    const leadId = leadResult.leadId;
    const clinicNames = await resolveClinicNames(input.agencyId, clinicIds);
    const now = new Date().toISOString();

    // Idempotent quote: one quote doc per lead
    const existingQuote = await adminDb
      .collection("agencies")
      .doc(input.agencyId)
      .collection("quotes")
      .where("leadId", "==", leadId)
      .limit(1)
      .get();

    let quoteId: string;
    if (!existingQuote.empty) {
      quoteId = existingQuote.docs[0].id;
      await existingQuote.docs[0].ref.set(
        {
          patientName: input.patientName || null,
          patientEmail: input.patientEmail || null,
          patientPhone: input.patientPhone || null,
          patientCountry: input.country || null,
          treatmentCategory: input.treatmentCategory || "other",
          treatmentName: input.treatmentName || input.treatmentCategory || "",
          subTreatment: input.treatmentSubcategory || null,
          selectedClinicIds: clinicIds,
          selectedClinicNames: clinicNames,
          selectedCity: input.selectedCity || null,
          istanbul_side: input.istanbulSide || null,
          travelDate: input.travelDate || null,
          conversationId: input.conversationId,
          consentStatus: "accepted",
          status: QUOTE_STATUS_AFTER_CREATE,
          updatedAt: now,
        },
        { merge: true }
      );
    } else {
      const quoteRef = adminDb
        .collection("agencies")
        .doc(input.agencyId)
        .collection("quotes")
        .doc();
      quoteId = quoteRef.id;
      await quoteRef.set({
        agencyId: input.agencyId,
        leadId,
        patientName: input.patientName || null,
        patientEmail: input.patientEmail || null,
        patientPhone: input.patientPhone || null,
        patientCountry: input.country || null,
        treatmentCategory: input.treatmentCategory || "other",
        treatmentName: input.treatmentName || input.treatmentCategory || "",
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
        statusHistory: [...previousHistory, buildLeadQuoteStatusHistoryEntry(now)],
      },
      { merge: true }
    );

    // Notifications only after lead + quote are persisted. Email failure must not
    // roll back the quote; retry jobs handle delivery later.
    if (leadResult.status === "created") {
      scheduleAndProcessAgencyLeadNotification(input.agencyId, leadId).catch((err) => {
        console.error("[persistAgencyQuoteRequest] Agency notification error:", err);
      });
      scheduleAndProcessPatientLeadNotification(input.agencyId, leadId).catch((err) => {
        console.error("[persistAgencyQuoteRequest] Patient notification error:", err);
      });
    }

    return {
      ok: true,
      leadId,
      quoteId,
      agencyId: input.agencyId,
      status: LEAD_STATUS_AFTER_QUOTE,
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
