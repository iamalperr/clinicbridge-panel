import { getAdminDb } from "@/lib/firebase-admin";
import {
  requireAcceptedAgencyConsent,
  resolveAgencyConsentVersion,
} from "@/lib/services/agencyConsentService";
import { normalizeEmail, isValidEmail } from "@/lib/utils/emailValidation";
import { scheduleAndProcessAgencyLeadNotification } from "@/lib/services/agencyNotificationService";
import { scheduleAndProcessPatientLeadNotification } from "@/lib/services/patientNotificationService";

export interface SubmitLeadInput {
  agencyId: string;
  conversationId: string;
  clinicIds: string[];
  patientEmail: string;
  patientName?: string;
  patientPhone?: string;
  patientAge?: number;
  patientGender?: string;
  country?: string;
  language?: string;
  treatmentCategory?: string;
  treatmentSubcategory?: string;
  urgency?: string;
  conversationSummary?: string;
  aiExtractedNotes?: string;
  source?: string;
  sourceUrl?: string;
  selectedCity?: string;
  istanbulSide?: string;
  travelDate?: string;
  /** When true, caller schedules notifications after quote persistence. */
  deferNotifications?: boolean;
}

export async function submitAgencyLead(input: SubmitLeadInput) {
  const adminDb = getAdminDb();
  if (!adminDb) {
    throw new Error("DB_UNAVAILABLE");
  }

  const {
    agencyId,
    conversationId,
    clinicIds,
    patientEmail,
    patientName,
    patientPhone,
    patientAge,
    patientGender,
    country,
    language,
    treatmentCategory,
    treatmentSubcategory,
    urgency,
    conversationSummary,
    aiExtractedNotes,
    source,
    sourceUrl,
    selectedCity,
    istanbulSide,
    travelDate,
  } = input;

  if (!conversationId) throw new Error("CONVERSATION_ID_REQUIRED");
  if (!agencyId) throw new Error("AGENCY_ID_REQUIRED");

  // Validate Agency
  const agencySnap = await adminDb.collection("agencies").doc(agencyId).get();
  if (!agencySnap.exists || agencySnap.data()?.status !== "active") {
    throw new Error("AGENCY_NOT_FOUND");
  }
  const agencyData = agencySnap.data()!;
  
  // Load Agency Matching Config
  const matchingSnap = await adminDb.collection("agencies").doc(agencyId).collection("config").doc("matching").get();
  const matchingConfig = matchingSnap.exists ? matchingSnap.data() : null;
  const isFeelinHealthyAgency =
    agencyData.slug === "feelinhealthy" ||
    String(agencyData.name || "").toLowerCase() === "feelinhealthy";
  // Public guest FeelinHealthy: hard-cap at 2 clinics for quote comparison.
  const maxClinics = isFeelinHealthyAgency
    ? 2
    : matchingConfig?.maxClinicsToShow || agencyData.settings?.maxClinicsPerTreatmentRequest || 3;
  const routingMode = matchingConfig?.routingMode || "manual";

  // Validate Consent — version must match matching-chat / saveConsentRecord default.
  const version = resolveAgencyConsentVersion(agencyData.privacySettings);
  const hasConsent = await requireAcceptedAgencyConsent(agencyId, conversationId, version);
  if (!hasConsent) {
    throw new Error("CONSENT_REQUIRED");
  }

  // Validate Email
  const normalizedEmail = normalizeEmail(patientEmail);
  if (!normalizedEmail) throw new Error("PATIENT_EMAIL_REQUIRED");
  if (!isValidEmail(normalizedEmail)) throw new Error("PATIENT_EMAIL_INVALID");

  // Validate Clinics
  const uniqueClinicIds = Array.from(new Set(clinicIds || []));
  if (uniqueClinicIds.length === 0) throw new Error("CLINIC_SELECTION_REQUIRED");
  if (uniqueClinicIds.length > maxClinics) throw new Error("CLINIC_SELECTION_LIMIT_EXCEEDED");

  // Create Transaction
  // Firestore requires ALL reads before ANY writes inside a transaction.
  // Reading clinics after set(lead) was aborting every first-time quote persist.
  const result = await adminDb.runTransaction(async (transaction: any) => {
    // Idempotency: Check if a lead with this conversationId already exists
    const leadsQuery = adminDb
      .collection("agencies")
      .doc(agencyId)
      .collection("leads")
      .where("conversationId", "==", conversationId)
      .limit(1);
    const existingLeadsSnap = await transaction.get(leadsQuery);
    if (!existingLeadsSnap.empty) {
      // Idempotent return
      return { leadId: existingLeadsSnap.docs[0].id, agencyId, status: "already_exists" };
    }

    // Validate clinics (reads) before any writes.
    const clinicSnaps: Array<{ clinicId: string; snap: any }> = [];
    for (const clinicId of uniqueClinicIds) {
      const clinicSnap = await transaction.get(
        adminDb.collection("agencies").doc(agencyId).collection("clinics").doc(clinicId)
      );
      if (!clinicSnap.exists) {
        throw new Error("INVALID_CLINIC_SELECTION");
      }
      const clinicStatus = String(clinicSnap.data()?.status || "active").toLowerCase();
      if (clinicStatus === "inactive" || clinicStatus === "archived" || clinicStatus === "disabled") {
        throw new Error("INVALID_CLINIC_SELECTION");
      }
      clinicSnaps.push({ clinicId, snap: clinicSnap });
    }

    // Prepare Lead document
    const leadRef = adminDb.collection("agencies").doc(agencyId).collection("leads").doc();
    const now = new Date().toISOString();

    const leadData = {
      agencyId,
      clinicId: null, // Legacy support
      clinicIds: uniqueClinicIds,
      clinicRequestCount: uniqueClinicIds.length,
      patientName: patientName || null,
      patientEmail: normalizedEmail,
      patientPhone: patientPhone || null,
      patientAge: patientAge || null,
      patientGender: patientGender || null,
      country: country || "Unknown",
      language: language || "en",
      treatmentCategory: treatmentCategory || "other",
      treatmentSubcategory: treatmentSubcategory || null,
      urgency: urgency || "medium",
      conversationSummary: conversationSummary || "",
      conversationId: conversationId,
      aiExtractedNotes: aiExtractedNotes || null,
      consentStatus: "accepted", // we just verified hasConsent
      consentTimestamp: now,
      consentVersion: version,
      routingMode,
      status: routingMode === "manual" ? "waiting_for_assignment" : "new",
      statusHistory: [
        { status: routingMode === "manual" ? "waiting_for_assignment" : "new", changedAt: now, note: "Lead created and submitted" },
      ],
      source: source || "widget",
      sourceUrl: sourceUrl || null,
      selectedCity: selectedCity || null,
      istanbul_side: istanbulSide || null,
      istanbulSide: istanbulSide || null,
      travelDate: travelDate || null,
      notificationStatus: "pending",
      notificationAttempts: 0,
      createdAt: now,
      updatedAt: now,
      submittedAt: now,
    };

    transaction.set(leadRef, leadData);

    for (const { clinicId } of clinicSnaps) {
      const crRef = adminDb.collection("agencies").doc(agencyId).collection("clinic_requests").doc();
      transaction.set(crRef, {
        leadId: leadRef.id,
        agencyId,
        clinicId,
        status: "pending",
        source: source || "widget",
        createdAt: now,
        updatedAt: now,
        submittedAt: now,
      });
    }

    return { leadId: leadRef.id, agencyId, status: "created" };
  });

  // Post-commit: trigger notifications async (unless deferred until quote persist)
  if (result.status === "created" && !input.deferNotifications) {
    // Fire and forget (don't await) so it doesn't block the frontend response
    scheduleAndProcessAgencyLeadNotification(result.agencyId, result.leadId).catch(err => {
      console.error("[submitAgencyLead] Agency notification error:", err);
    });
    scheduleAndProcessPatientLeadNotification(result.agencyId, result.leadId).catch(err => {
      console.error("[submitAgencyLead] Patient notification error:", err);
    });
  }

  return result;
}
