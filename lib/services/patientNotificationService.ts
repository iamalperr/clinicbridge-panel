import { getAdminDb } from "@/lib/firebase-admin";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY || "fallback_key");

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
        if (data.status === "sent" || data.status === "processing" || data.status === "skipped") {
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

    // Ensure lead is submitted
    if (lead.status !== "submitted") {
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
    
    const clinicRequests = crSnap.docs.map(d => d.data());

    if (clinicRequests.length === 0) {
      console.warn(`[patientNotificationService] No clinic requests found for lead ${jobData.leadId}`);
      await jobRef.update({
        status: "skipped",
        lastErrorCode: "CLINIC_REQUESTS_MISSING",
        failedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      return; // Do not retry
    }

    // Resolve Clinic Names
    const clinicNames = [];
    for (const cr of clinicRequests) {
      const cSnap = await adminDb.collection("clinics").doc(cr.clinicId).get();
      clinicNames.push(cSnap.exists ? cSnap.data()?.name || cr.clinicId : cr.clinicId);
    }

    // Determine Language (fallback chain)
    const agencySnap = await adminDb.collection("agencies").doc(agencyId).get();
    const agencyData = agencySnap.data() || {};
    // Language priority: lead locale -> conversation locale -> agency default locale -> "en"
    const lang = (lead.language || agencyData.settings?.defaultLocale || "en") === "tr" ? "tr" : "en";
    
    // Resolve Agency Branding
    const agencyName = agencyData.name || "ClinicBridge AI";
    const replyTo = agencyData.settings?.supportEmail || agencyData.email;

    const leadReference = `CB-${new Date(lead.createdAt).toISOString().slice(0,10).replace(/-/g, "")}-${jobData.leadId.substring(0, 5).toUpperCase()}`;

    const subject = lang === "tr" 
      ? `Talebiniz Alındı — ${leadReference}`
      : `Your Request Has Been Received — ${leadReference}`;

    const patientFirstName = lead.patientName ? lead.patientName.split(" ")[0] : (lang === "tr" ? "Değerli Hastamız" : "Dear Patient");
    const treatmentName = lead.treatmentCategory || (lang === "tr" ? "Tedavi talebi" : "Treatment request");

    // Preferred Date/Time is not directly in Lead schema yet, but we can look for it or hide it
    const preferredDate = lead.preferredDate; 
    const preferredTime = lead.preferredTime;

    const htmlContent = lang === "tr" ? `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
        <h2 style="color: #0d9488;">Talebiniz başarıyla alındı</h2>
        <p>Merhaba ${patientFirstName},</p>
        <p><strong>${agencyName}</strong> üzerinden oluşturduğunuz tedavi talebiniz başarıyla alınmıştır.</p>
        
        <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 24px 0;">
          <p style="margin: 0 0 8px 0; color: #64748b; font-size: 13px;">Talep Referansı</p>
          <p style="margin: 0; font-weight: bold; font-size: 16px;">${leadReference}</p>
        </div>
        
        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Talep Özeti</h3>
        <p><strong>Tedavi:</strong> ${treatmentName}</p>
        
        <p><strong>Seçilen Klinikler:</strong></p>
        <ol style="margin-top: 4px;">
          ${clinicNames.slice(0, 3).map(cn => `<li>${cn}</li>`).join("")}
        </ol>
        
        ${preferredDate ? `<p><strong>Tercih Edilen Tarih:</strong> ${preferredDate}</p>` : ""}
        ${preferredTime ? `<p><strong>Tercih Edilen Saat:</strong> ${preferredTime}</p>` : ""}
        
        <p style="margin-top: 24px;">Talebiniz seçtiğiniz klinikler bazında değerlendirilecektir.</p>
        
        <p style="margin-top: 16px; font-weight: bold; color: #b91c1c;">
          Bu kayıt kesinleşmiş bir randevu değildir. Klinik veya ilgili ekip değerlendirmesi tamamlandıktan sonra süreçle ilgili ayrıca bilgilendirileceksiniz.
        </p>
        
        <p>Aynı talep için yeniden başvuru yapmanıza gerek yoktur.</p>
        
        <p style="margin-top: 32px; color: #64748b; font-size: 14px;">ClinicBridge AI</p>
      </div>
    ` : `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
        <h2 style="color: #0d9488;">Your request has been received</h2>
        <p>Hello ${patientFirstName},</p>
        <p>Your treatment request submitted through <strong>${agencyName}</strong> has been received successfully.</p>
        
        <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 24px 0;">
          <p style="margin: 0 0 8px 0; color: #64748b; font-size: 13px;">Request Reference</p>
          <p style="margin: 0; font-weight: bold; font-size: 16px;">${leadReference}</p>
        </div>
        
        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Request Summary</h3>
        <p><strong>Treatment:</strong> ${treatmentName}</p>
        
        <p><strong>Selected Clinics:</strong></p>
        <ol style="margin-top: 4px;">
          ${clinicNames.slice(0, 3).map(cn => `<li>${cn}</li>`).join("")}
        </ol>
        
        ${preferredDate ? `<p><strong>Preferred Date:</strong> ${preferredDate}</p>` : ""}
        ${preferredTime ? `<p><strong>Preferred Time:</strong> ${preferredTime}</p>` : ""}
        
        <p style="margin-top: 24px;">Your request will be reviewed separately for each selected clinic.</p>
        
        <p style="margin-top: 16px; font-weight: bold; color: #b91c1c;">
          This is not a confirmed appointment. You will be informed separately after the clinic or relevant team completes its review.
        </p>
        
        <p>You do not need to submit the same request again.</p>
        
        <p style="margin-top: 32px; color: #64748b; font-size: 14px;">ClinicBridge AI</p>
      </div>
    `;

    const textContent = lang === "tr" ? `Talebiniz başarıyla alındı\nMerhaba ${patientFirstName},\n${agencyName} üzerinden oluşturduğunuz tedavi talebiniz başarıyla alınmıştır.\nTalep Referansı: ${leadReference}\nTalep Özeti:\nTedavi: ${treatmentName}\nSeçilen Klinikler:\n${clinicNames.slice(0, 3).map((cn, i) => `${i+1}. ${cn}`).join("\n")}\nTalebiniz seçtiğiniz klinikler bazında değerlendirilecektir.\nBu kayıt kesinleşmiş bir randevu değildir. Klinik veya ilgili ekip değerlendirmesi tamamlandıktan sonra süreçle ilgili ayrıca bilgilendirileceksiniz.\nAynı talep için yeniden başvuru yapmanıza gerek yoktur.\nClinicBridge AI` : `Your request has been received\nHello ${patientFirstName},\nYour treatment request submitted through ${agencyName} has been received successfully.\nRequest Reference: ${leadReference}\nRequest Summary:\nTreatment: ${treatmentName}\nSelected Clinics:\n${clinicNames.slice(0, 3).map((cn, i) => `${i+1}. ${cn}`).join("\n")}\nYour request will be reviewed separately for each selected clinic.\nThis is not a confirmed appointment. You will be informed separately after the clinic or relevant team completes its review.\nYou do not need to submit the same request again.\nClinicBridge AI`;

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
       return;
    }

    const emailPayload: any = {
      from: "ClinicBridge AI <noreply@clinicbridge-ai.com>",
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
