/**
 * Server-side quote request persistence for agency chat flows.
 * Creates lead (email notification) + quotes collection doc (Portal Teklif Talepleri).
 */

import { getAdminDb } from "@/lib/firebase-admin";
import { submitAgencyLead } from "@/lib/services/leadSubmissionService";
import { pickOfficialClinicName } from "@/lib/services/agencyQuoteNotificationContent";

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

  try {
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
    });

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
          status: "requested",
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
        status: "requested",
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

    return {
      ok: true,
      leadId,
      quoteId,
      agencyId: input.agencyId,
      status: leadResult.status,
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
