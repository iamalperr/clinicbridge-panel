/**
 * Send patient offer email after agency approval.
 * Drafts clinicOffers from pricing first when empty.
 */

import { Resend } from "resend";
import { getAdminDb } from "@/lib/firebase-admin";
import { normalizeLeadStatusHistory } from "@/lib/agency/leadStatusActions";
import {
  ClinicOfferDraftError,
  draftClinicOffersForLead,
} from "@/lib/services/clinicOfferDraftService";
import { buildPatientOfferEmailContent } from "@/lib/services/patientOfferEmailContent";

const resend = new Resend(process.env.RESEND_API_KEY || "fallback_key");

export class PatientOfferEmailError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "PatientOfferEmailError";
    this.code = code;
    this.status = status;
  }
}

export async function sendPatientOfferEmailForLead(params: {
  agencyId: string;
  leadId: string;
  changedBy?: string;
  customMessage?: string;
  locale?: string;
}): Promise<{
  ok: true;
  quoteId: string;
  offerCount: number;
  drafted: boolean;
}> {
  const { agencyId, leadId, changedBy, customMessage, locale } = params;
  const adminDb = getAdminDb();
  if (!adminDb) throw new PatientOfferEmailError("DB_UNAVAILABLE", "Database unavailable", 503);

  let drafted = false;
  let quoteId = "";
  let clinicOffers: any[] = [];

  try {
    const draft = await draftClinicOffersForLead({ agencyId, leadId, force: false });
    quoteId = draft.quoteId;
    clinicOffers = draft.clinicOffers;
    drafted = !draft.skipped;
  } catch (err) {
    const draftErr =
      err instanceof ClinicOfferDraftError
        ? err
        : err &&
            typeof err === "object" &&
            (err as { name?: string }).name === "ClinicOfferDraftError" &&
            typeof (err as { code?: string }).code === "string"
          ? new ClinicOfferDraftError(
              (err as { code: string }).code,
              (err as { message?: string }).message || (err as { code: string }).code,
              (err as { status?: number }).status || 400
            )
          : null;
    if (draftErr?.code === "NO_PRICING_MATCH") {
      throw new PatientOfferEmailError(
        "NO_PRICING_MATCH",
        "Hastaya teklif göndermek için seçili kliniklerde eşleşen fiyat kaydı gerekli.",
        422
      );
    }
    if (draftErr) {
      throw new PatientOfferEmailError(draftErr.code, draftErr.message, draftErr.status);
    }
    throw err;
  }

  if (!clinicOffers.length) {
    throw new PatientOfferEmailError(
      "NO_OFFERS",
      "No clinic offers available to send",
      422
    );
  }

  const leadRef = adminDb.collection("agencies").doc(agencyId).collection("leads").doc(leadId);
  const leadSnap = await leadRef.get();
  if (!leadSnap.exists) throw new PatientOfferEmailError("LEAD_NOT_FOUND", "Lead not found", 404);
  const lead = leadSnap.data()!;
  const patientEmail = String(lead.patientEmail || "").trim();
  if (!patientEmail) {
    throw new PatientOfferEmailError("PATIENT_EMAIL_REQUIRED", "Patient email missing", 400);
  }

  const agencySnap = await adminDb.collection("agencies").doc(agencyId).get();
  const agencyData = agencySnap.data() || {};
  const agencyName = agencyData.name || agencyData.branding?.displayName || "FeelinHealthy";
  const lang: "tr" | "en" = String(
    locale || lead.language || agencyData.settings?.defaultLocale || "tr"
  )
    .toLowerCase()
    .startsWith("en")
    ? "en"
    : "tr";

  const treatmentLabel =
    lead.treatmentSubcategory || lead.treatmentCategory || clinicOffers[0]?.treatmentName || "Treatment";

  const content = buildPatientOfferEmailContent({
    lang,
    agencyName,
    patientName: lead.patientName || "",
    treatmentLabel,
    offers: clinicOffers.map((o) => ({
      clinicName: o.clinicName,
      treatmentName: o.treatmentName,
      priceMin: Number(o.priceMin),
      priceMax: Number(o.priceMax),
      currency: o.currency || "EUR",
      notes: o.notes,
    })),
    customMessage,
  });

  if (!process.env.RESEND_API_KEY) {
    throw new PatientOfferEmailError("RESEND_API_KEY_MISSING", "Email provider not configured", 503);
  }

  const replyTo = agencyData.settings?.supportEmail || agencyData.email;
  const result = await resend.emails.send({
    from: "ClinicBridge AI <noreply@clinicbridge-ai.com>",
    to: patientEmail,
    ...(replyTo ? { replyTo } : {}),
    subject: content.subject,
    html: content.html,
    text: content.text,
  });
  if (result.error) {
    throw new PatientOfferEmailError(
      "RESEND_SEND_ERROR",
      result.error.message || "Failed to send offer email",
      502
    );
  }

  const now = new Date().toISOString();
  const quoteRef = adminDb.collection("agencies").doc(agencyId).collection("quotes").doc(quoteId);
  await quoteRef.set(
    {
      status: "sent_to_patient",
      clinicOffers,
      offerSentToPatientAt: now,
      offerEmailProviderId: result.data?.id || null,
      updatedAt: now,
    },
    { merge: true }
  );

  const historyEntry = {
    status: lead.status === "converted" ? "converted" : lead.status || "converted",
    changedAt: now,
    ...(changedBy ? { changedBy } : {}),
    note:
      lang === "en"
        ? "Patient offer email sent with drafted clinic prices"
        : "Hastaya teklif e-postası gönderildi (sistem fiyatlarından taslak)",
  };

  await leadRef.set(
    {
      patientOfferEmailSent: true,
      patientOfferEmailSentAt: now,
      patientEmailSent: true,
      draftOfferCount: clinicOffers.length,
      statusHistory: [...normalizeLeadStatusHistory(lead.statusHistory), historyEntry],
      updatedAt: now,
      ...(changedBy ? { updatedBy: changedBy } : {}),
    },
    { merge: true }
  );

  return { ok: true, quoteId, offerCount: clinicOffers.length, drafted };
}
