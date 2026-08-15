import { getAdminDb } from "@/lib/firebase-admin";
import { Resend } from "resend";
import { isLeadSubmittedForPatientNotification } from "@/lib/services/leadNotificationEligibility";
import { pickOfficialClinicName } from "@/lib/services/agencyQuoteNotificationContent";
import {
  buildPatientRequestReceivedCopy,
  buildPatientRequestReceivedSubject,
} from "@/lib/services/patientRequestReceivedContent";

const resend = new Resend(process.env.RESEND_API_KEY || "fallback_key");

export { isLeadSubmittedForPatientNotification };

export async function scheduleAndProcessPatientLeadNotification(agencyId: string, leadId: string) {
  const adminDb = getAdminDb();
  if (!adminDb) return;

  const eventType = "patient_request_received";
  const channel = "email";
  // Enforce unique constraint: job_{leadId}_{eventType}
  const jobId = `job_${leadId}_${eventType}`;
  const jobRef = adminDb.collection("agencies").doc(agencyId).collection("notification_jobs").doc(jobId);

  try {
    const jobResult = await adminDb.runTransaction(async (t: any) => {
      const doc = await t.get(jobRef);
      if (doc.exists) {
        const data = doc.data()!;
        if (data.status === "sent" || data.status === "processing") {
          return { skip: true, reason: data.status };
        }
        // Allow one reclaim when we previously skipped due to the legacy
        // status==="submitted" gate (now fixed for quote_requested leads).
        if (
          data.status === "skipped" &&
          data.lastErrorCode === "LEAD_NOT_SUBMITTED" &&
          Number(data.attemptCount || 0) < Number(data.maxAttempts || 3)
        ) {
          t.update(jobRef, {
            status: "pending",
            lastErrorCode: null,
            updatedAt: new Date().toISOString(),
          });
          return { skip: false, jobData: { ...data, status: "pending", lastErrorCode: null } };
        }
        if (data.status === "skipped") {
          return { skip: true, reason: data.status };
        }
        if (data.status === "failed" && data.attemptCount < data.maxAttempts) {
          return { skip: false, jobData: data };
        }
        return { skip: true, reason: "max_attempts_reached" };
      }

      const jobData = {
        id: jobId,
        agencyId,
        leadId,
        eventType,
        channel,
        templateKey: "patient_request_received",
        status: "pending",
        attemptCount: 0,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      t.set(jobRef, jobData);
      return { skip: false, jobData };
    });

    if (jobResult.skip) {
      console.log(`[patientNotificationService] Skipping job ${jobId}, reason: ${jobResult.reason}`);
      return;
    }

    // Process immediately
    await processPatientNotificationJob(agencyId, jobId);
  } catch (error) {
    console.error(`[patientNotificationService] Error scheduling job ${jobId}:`, error);
  }
}

export async function processPatientNotificationJob(agencyId: string, jobId: string) {
  const adminDb = getAdminDb();
  if (!adminDb) return;

  const jobRef = adminDb.collection("agencies").doc(agencyId).collection("notification_jobs").doc(jobId);
  const now = new Date().toISOString();

  // Mark processing
  await jobRef.update({
    status: "processing",
    updatedAt: now,
    lastAttemptAt: now
  });

  try {
    const jobSnap = await jobRef.get();
    const jobData = jobSnap.data()!;

    // Read Lead
    const leadSnap = await adminDb.collection("agencies").doc(agencyId).collection("leads").doc(jobData.leadId).get();
    if (!leadSnap.exists) {
      throw new Error("LEAD_NOT_FOUND");
    }
    const lead = leadSnap.data()!;

    // Validate email
    if (!lead.patientEmail) {
      await jobRef.update({
        status: "skipped",
        lastErrorCode: "MISSING_PATIENT_EMAIL",
        failedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      return; // Do not retry
    }

    // Validate consent
    if (lead.consentStatus !== "accepted") {
      await jobRef.update({
        status: "skipped",
        lastErrorCode: "MISSING_OR_INVALID_CONSENT",
        failedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      return; // Do not retry
    }

    // Ensure lead is submitted. Canonical agency statuses are waiting_for_assignment /
    // quote_requested / etc. — never the legacy literal "submitted".
    if (!isLeadSubmittedForPatientNotification(lead)) {
      await jobRef.update({
        status: "skipped",
        lastErrorCode: "LEAD_NOT_SUBMITTED",
        failedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      return; // Do not retry
    }

    // Read Clinic Requests (must be read from DB as snapshot of submission)
    const crSnap = await adminDb.collection("agencies").doc(agencyId).collection("clinic_requests")
      .where("leadId", "==", jobData.leadId).get();
    
    const clinicRequests = crSnap.docs
      .map((d) => d.data())
      .filter((d) => {
        const st = String(d.status || "").toLowerCase();
        return st !== "cancelled" && st !== "rejected";
      });

    // Prefer clinic_requests; fall back to lead.clinicIds / selectedClinicNames so a
    // missing CR snapshot does not block the patient acknowledgement email.
    let clinicIds: string[] = clinicRequests
      .map((cr) => String(cr.clinicId || "").trim())
      .filter(Boolean);
    if (clinicIds.length === 0 && Array.isArray(lead.clinicIds)) {
      clinicIds = lead.clinicIds.map((id: any) => String(id || "").trim()).filter(Boolean);
    }

    if (
      clinicIds.length === 0 &&
      !(Array.isArray(lead.selectedClinicNames) && lead.selectedClinicNames.length > 0)
    ) {
      console.warn(`[patientNotificationService] No clinic requests found for lead ${jobData.leadId}`);
      await jobRef.update({
        status: "skipped",
        lastErrorCode: "CLINIC_REQUESTS_MISSING",
        failedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      return; // Do not retry
    }

    // Resolve Clinic Names — agency clinics first (canonical), then lead names.
    const clinicNames: string[] = [];
    if (Array.isArray(lead.selectedClinicNames) && lead.selectedClinicNames.length > 0 && clinicIds.length === 0) {
      clinicNames.push(...lead.selectedClinicNames.map(String));
    } else {
      for (const clinicId of clinicIds) {
        const agencyClinic = await adminDb
          .collection("agencies")
          .doc(agencyId)
          .collection("clinics")
          .doc(clinicId)
          .get();
        if (agencyClinic.exists) {
          clinicNames.push(pickOfficialClinicName(agencyClinic.data(), clinicId));
          continue;
        }
        const topClinic = await adminDb.collection("clinics").doc(clinicId).get();
        clinicNames.push(pickOfficialClinicName(topClinic.exists ? topClinic.data() : null, clinicId));
      }
      if (clinicNames.length === 0 && Array.isArray(lead.selectedClinicNames)) {
        clinicNames.push(...lead.selectedClinicNames.map(String));
      }
    }

    // Determine Language (fallback chain)
    const agencySnap = await adminDb.collection("agencies").doc(agencyId).get();
    const agencyData = agencySnap.data() || {};
    // Language priority: lead locale -> conversation locale -> agency default locale -> "en"
    const lang: "tr" | "en" =
      String(lead.language || agencyData.settings?.defaultLocale || agencyData.defaultLanguage || "tr")
        .toLowerCase()
        .startsWith("en")
        ? "en"
        : "tr";
    
    // Resolve Agency Branding (canonical white-label)
    const { resolveAgencyBrand } = await import("@/lib/agency/resolveAgencyBrand");
    const brand = resolveAgencyBrand(agencyData);
    const agencyName = brand.displayName;
    const replyTo = brand.replyTo;

    const createdRaw = lead.createdAt?.toDate?.() || lead.createdAt || new Date().toISOString();
    const createdDate = new Date(createdRaw);
    const datePart = Number.isNaN(createdDate.getTime())
      ? new Date().toISOString().slice(0, 10).replace(/-/g, "")
      : createdDate.toISOString().slice(0, 10).replace(/-/g, "");
    const leadReference = `CB-${datePart}-${String(jobData.leadId).substring(0, 5).toUpperCase()}`;

    const subject = buildPatientRequestReceivedSubject({
      lang,
      leadReference,
      agencyName,
    });

    const patientFirstName = lead.patientName ? lead.patientName.split(" ")[0] : (lang === "tr" ? "Değerli Hastamız" : "Dear Patient");
    const treatmentName = lead.treatmentCategory || (lang === "tr" ? "Tedavi talebi" : "Treatment request");

    // Patient portal CTA temporarily disabled — skip token minting for now.
    const { html: htmlContent, text: textContent } = buildPatientRequestReceivedCopy({
      lang,
      agencyName,
      patientFirstName,
      treatmentName,
      clinicNames,
      leadReference,
      includeViewRequestCta: false,
      travelDate: lead.travelDate || null,
      selectedCity: lead.selectedCity || null,
    });

    if (!process.env.RESEND_API_KEY) {
       console.warn("[patientNotificationService] RESEND_API_KEY missing. Mocking success.");
       await jobRef.update({
         status: "sent",
         sentAt: new Date().toISOString(),
         attemptCount: jobData.attemptCount + 1,
         recipientSnapshot: [lead.patientEmail],
         providerMessageId: "mock_patient_id",
         updatedAt: new Date().toISOString()
       });
       await adminDb
         .collection("agencies")
         .doc(agencyId)
         .collection("leads")
         .doc(jobData.leadId)
         .set({ patientEmailSent: true, updatedAt: new Date().toISOString() }, { merge: true });
       return;
    }

    const emailPayload: any = {
      from: brand.fromHeader,
      to: lead.patientEmail,
      subject: subject,
      html: htmlContent,
      text: textContent
    };

    if (replyTo) {
      emailPayload.reply_to = replyTo;
    }

    const result = await resend.emails.send(emailPayload);

    if (result.error) {
       throw new Error(result.error.message);
    }

    await jobRef.update({
      status: "sent",
      sentAt: new Date().toISOString(),
      attemptCount: jobData.attemptCount + 1,
      recipientSnapshot: [lead.patientEmail],
      providerMessageId: result.data?.id || null,
      updatedAt: new Date().toISOString()
    });
    // Legacy UI field on lead detail "E-posta Geçmişi".
    await adminDb
      .collection("agencies")
      .doc(agencyId)
      .collection("leads")
      .doc(jobData.leadId)
      .set(
        {
          patientEmailSent: true,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    console.log(`[patientNotificationService] Successfully sent job ${jobId} to patient`);

  } catch (err: any) {
    console.error(`[patientNotificationService] Error processing job ${jobId}:`, err);
    
    const jobSnap = await jobRef.get();
    const data = jobSnap.data()!;
    const newAttemptCount = data.attemptCount + 1;
    
    if (newAttemptCount >= data.maxAttempts) {
       await jobRef.update({
         status: "failed",
         lastErrorCode: err.message || "UNKNOWN_ERROR",
         failedAt: new Date().toISOString(),
         attemptCount: newAttemptCount,
         updatedAt: new Date().toISOString()
       });
    } else {
       // Exponential backoff logic
       const nextAttemptMinutes = Math.pow(5, newAttemptCount); // 5, 25, 125...
       const nextAttemptDate = new Date(Date.now() + nextAttemptMinutes * 60000);
       
       await jobRef.update({
         status: "failed",
         lastErrorCode: err.message || "UNKNOWN_ERROR",
         failedAt: new Date().toISOString(),
         attemptCount: newAttemptCount,
         nextAttemptAt: nextAttemptDate.toISOString(),
         updatedAt: new Date().toISOString()
       });
    }
  }
}
