import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  getAgencyIstanbulSide,
  getAgencyPatientName,
  getAgencySelectedCity,
  getAgencySelectedClinicIds,
  getAgencySessionId,
  getAgencyTravelDate,
  getAgencyTreatmentContext,
} from "@/lib/agency/agencySessionState";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/**
 * POST /api/public/agency/[slug]/quote
 * Creates a quote request in the agency's quotes sub-collection.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await req.json();
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: "db unavailable" }, { status: 503, headers: CORS });
    }

    // Find agency
    const agencySnap = await adminDb
      .collection("agencies")
      .where("slug", "==", slug)
      .where("status", "==", "active")
      .limit(1)
      .get();

    if (agencySnap.empty) {
      return NextResponse.json({ error: "Agency not found" }, { status: 404, headers: CORS });
    }

    const agencyId = agencySnap.docs[0].id;
    const now = new Date().toISOString();

    if (!body.leadId) {
      return NextResponse.json({ error: "leadId required" }, { status: 400, headers: CORS });
    }

    const selectedClinicIds: string[] = getAgencySelectedClinicIds({
      selectedClinicIds: Array.isArray(body.selectedClinicIds) ? body.selectedClinicIds : undefined,
      selectedClinicId: body.selectedClinicId,
    });

    // Official clinic names from backend — do not trust frontend names alone.
    let selectedClinicNames: string[] = Array.isArray(body.selectedClinicNames)
      ? body.selectedClinicNames.filter(Boolean)
      : [];
    if (selectedClinicIds.length > 0) {
      const { pickOfficialClinicName } = await import("@/lib/services/agencyQuoteNotificationContent");
      const names: string[] = [];
      for (const clinicId of selectedClinicIds) {
        const agencyClinic = await adminDb
          .collection("agencies")
          .doc(agencyId)
          .collection("clinics")
          .doc(clinicId)
          .get();
        if (agencyClinic.exists) {
          names.push(pickOfficialClinicName(agencyClinic.data(), clinicId));
          continue;
        }
        const top = await adminDb.collection("clinics").doc(clinicId).get();
        names.push(pickOfficialClinicName(top.exists ? top.data() : null, clinicId));
      }
      selectedClinicNames = names;
    }

    const quote = {
      agencyId,
      leadId: body.leadId,
      patientName: getAgencyPatientName(body) || null,
      patientEmail: body.patientEmail || null,
      patientPhone: body.patientPhone || null,
      patientCountry: body.patientCountry || null,
      treatmentCategory:
        body.treatmentCategory || getAgencyTreatmentContext(body).category || "other",
      treatmentName:
        body.treatmentName || getAgencyTreatmentContext(body).category || "",
      subTreatment:
        body.subTreatment || getAgencyTreatmentContext(body).subcategory || null,
      selectedClinicIds,
      selectedClinicNames,
      selectedCity: getAgencySelectedCity(body) || null,
      istanbul_side: getAgencyIstanbulSide(body) || null,
      travelDate: getAgencyTravelDate(body) || null,
      conversationId: body.conversationId || null,
      intakeAnswers: body.intakeAnswers || {},
      consentStatus: "pending" as string,
      status: "requested",
      clinicOffers: [],
      internalNotes: null,
      createdAt: now,
      updatedAt: now,
    };

    // Canonical session identity for consent scope — not itself proof of consent.
    const conversationId = String(getAgencySessionId(body) || "").trim();
    if (!conversationId) {
      return NextResponse.json(
        { ok: false, error: "CONVERSATION_ID_REQUIRED" },
        { status: 400, headers: CORS }
      );
    }

    const {
      resolveAgencyConsentVersion,
      ensureAcceptedConsentForPersistence,
    } = await import("@/lib/services/agencyConsentService");
    const privacyVersion = resolveAgencyConsentVersion(agencySnap.docs[0].data()?.privacySettings);
    const consentGate = await ensureAcceptedConsentForPersistence({
      agencyId,
      sessionId: conversationId,
      requiredVersion: privacyVersion,
      consentAction: body.consentAction,
      localeFallback: String(body.language || "tr"),
    });
    if (!consentGate.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: consentGate.errorCode || "CONSENT_REQUIRED",
          consentStatus: consentGate.status,
        },
        { status: 403, headers: CORS }
      );
    }
    quote.consentStatus = "accepted";
    quote.conversationId = conversationId;

    const docRef = await adminDb
      .collection("agencies")
      .doc(agencyId)
      .collection("quotes")
      .add(quote);

    return NextResponse.json({ ok: true, quoteId: docRef.id, agencyId }, { headers: CORS });
  } catch (err) {
    console.error("[public/agency/quote] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: CORS });
  }
}
