import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  ensureAcceptedConsentForPersistence,
  resolveAgencyConsentVersion,
} from "@/lib/services/agencyConsentService";
import { persistAgencyQuoteRequest } from "@/lib/services/agencyQuoteRequestService";
import {
  getAgencyIstanbulSide,
  getAgencyPatientName,
  getAgencySessionId,
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
 * POST /api/public/agency/[slug]/quote-request
 * Dedicated agency quote persist endpoint.
 * Requires verified DB consent, or a validated structured consentAction.
 * A raw consentAccepted boolean alone is never enough.
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
      return NextResponse.json(
        { ok: false, error: "DB_UNAVAILABLE" },
        { status: 503, headers: CORS }
      );
    }

    const agencySnap = await adminDb
      .collection("agencies")
      .where("slug", "==", slug)
      .where("status", "==", "active")
      .limit(1)
      .get();

    if (agencySnap.empty) {
      return NextResponse.json(
        { ok: false, error: "AGENCY_NOT_FOUND" },
        { status: 404, headers: CORS }
      );
    }

    const agencyId = agencySnap.docs[0].id;
    const agencyData = agencySnap.docs[0].data();
    // Canonical session identity for consent scope — not itself proof of consent.
    const conversationId = String(getAgencySessionId(body) || "").trim();
    const patientEmail = String(body.patientEmail || "").trim();
    const clinicIds: string[] = Array.from(
      new Set(
        (Array.isArray(body.clinicIds)
          ? body.clinicIds
          : body.clinicId
            ? [body.clinicId]
            : []
        )
          .map((id: any) => String(id || "").trim())
          .filter(Boolean)
      )
    );

    if (!conversationId) {
      return NextResponse.json(
        { ok: false, error: "CONVERSATION_ID_REQUIRED" },
        { status: 400, headers: CORS }
      );
    }
    if (!patientEmail) {
      return NextResponse.json(
        { ok: false, error: "PATIENT_EMAIL_REQUIRED" },
        { status: 400, headers: CORS }
      );
    }
    if (clinicIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "CLINIC_SELECTION_REQUIRED" },
        { status: 400, headers: CORS }
      );
    }

    const locale = String(body.language || "tr");
    const privacyVersion = resolveAgencyConsentVersion(agencyData.privacySettings);
    const consentGate = await ensureAcceptedConsentForPersistence({
      agencyId,
      sessionId: conversationId,
      requiredVersion: privacyVersion,
      consentAction: body.consentAction,
      localeFallback: locale,
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

    const persistResult = await persistAgencyQuoteRequest({
      agencyId,
      conversationId,
      clinicIds,
      patientEmail,
      patientName: getAgencyPatientName(body) || undefined,
      patientPhone: body.patientPhone || undefined,
      patientAge: typeof body.patientAge === "number" ? body.patientAge : undefined,
      patientGender: body.patientGender || undefined,
      country: body.country || body.patientCountry || undefined,
      language: locale,
      treatmentCategory: body.treatmentCategory || undefined,
      treatmentSubcategory: body.treatmentSubcategory || undefined,
      treatmentName: body.treatmentName || body.treatmentCategory || "",
      selectedCity: body.selectedCity || undefined,
      istanbulSide: getAgencyIstanbulSide(body) || undefined,
      travelDate: body.travelDate || undefined,
      conversationSummary: body.conversationSummary || undefined,
      source: body.source || "widget",
      sourceUrl: body.sourceUrl || undefined,
    });

    if (!persistResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: persistResult.errorCode || "PERSIST_FAILED",
          errorMessage: persistResult.errorMessage,
        },
        { status: 400, headers: CORS }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        leadId: persistResult.leadId,
        quoteId: persistResult.quoteId,
        agencyId,
        status: persistResult.status,
      },
      { headers: CORS }
    );
  } catch (err: any) {
    console.error("[public/agency/quote-request] Error:", err?.message || err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Internal error" },
      { status: 500, headers: CORS }
    );
  }
}
