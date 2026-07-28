import { getAdminDb } from "@/lib/firebase-admin";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY || "fallback_key");

export async function scheduleAndProcessAgencyLeadNotification(agencyId: string, leadId: string) {
  const adminDb = getAdminDb();
  if (!adminDb) return;

  const eventType = "agency_lead_submitted";
  const channel = "email";
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
        templateKey: "agency_new_lead",
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
      console.log(`[agencyNotificationService] Skipping job ${jobId}, reason: ${jobResult.reason}`);
      return;
    }

    // Process immediately
    await processAgencyNotificationJob(agencyId, jobId);
  } catch (error) {
    console.error(`[agencyNotificationService] Error scheduling job ${jobId}:`, error);
  }
}

export async function resolveAgencyLeadNotificationRecipients(agencyId: string): Promise<string[]> {
  const adminDb = getAdminDb();
  if (!adminDb) return [];

  const agencySnap = await adminDb.collection("agencies").doc(agencyId).get();
  if (!agencySnap.exists) return [];
  const agencyData = agencySnap.data()!;

  // 1. Check existing agency notification email
  if (agencyData.settings?.notificationEmail) {
    return [agencyData.settings.notificationEmail];
  }

  // 2. Fallback to owner email
  if (agencyData.ownerEmail) {
    return [agencyData.ownerEmail];
  }
  
  if (agencyData.email) {
    return [agencyData.email];
  }

  // 3. Admin users of the agency
  const usersSnap = await adminDb.collection("users")
    .where("agencyId", "==", agencyId)
    .where("role", "==", "admin")
    .where("status", "==", "active")
    .get();
    
  const emails = usersSnap.docs.map(d => d.data().email).filter(Boolean);
  if (emails.length > 0) {
    return Array.from(new Set(emails));
  }

  return [];
}

export async function processAgencyNotificationJob(agencyId: string, jobId: string) {
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

    // Resolve recipients
    const recipients = await resolveAgencyLeadNotificationRecipients(agencyId);
    if (recipients.length === 0) {
      console.warn(`[agencyNotificationService] No recipients found for agency ${agencyId}`);
      await jobRef.update({
        status: "failed",
        lastErrorCode: "NO_RECIPIENTS_FOUND",
        failedAt: new Date().toISOString(),
        attemptCount: jobData.attemptCount + 1,
        updatedAt: new Date().toISOString()
      });
      return;
    }

    // Read Lead
    const leadSnap = await adminDb.collection("agencies").doc(agencyId).collection("leads").doc(jobData.leadId).get();
    if (!leadSnap.exists) throw new Error("LEAD_NOT_FOUND");
    const lead = leadSnap.data()!;

    // Read Clinic Requests
    const crSnap = await adminDb.collection("agencies").doc(agencyId).collection("clinic_requests")
      .where("leadId", "==", jobData.leadId).get();
    const clinicRequests = crSnap.docs.map(d => d.data());

    // Resolve Clinic Names
    const clinicNames = [];
    for (const cr of clinicRequests) {
      const cSnap = await adminDb.collection("clinics").doc(cr.clinicId).get();
      clinicNames.push(cSnap.exists ? cSnap.data()?.name || cr.clinicId : cr.clinicId);
    }

    // Determine Language
    const agencySnap = await adminDb.collection("agencies").doc(agencyId).get();
    const agencyLocale = agencySnap.data()?.settings?.defaultLocale || lead.language || "en";
    const lang = agencyLocale === "tr" ? "tr" : "en";

    const leadReference = `CB-${new Date(lead.createdAt).toISOString().slice(0,10).replace(/-/g, "")}-${jobData.leadId.substring(0, 5).toUpperCase()}`;

    const subject = lang === "tr" 
      ? `Yeni Hasta Talebi — ${leadReference}`
      : `New Patient Request — ${leadReference}`;

    const htmlContent = lang === "tr" ? `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
        <h2 style="color: #0d9488;">Yeni Bir Hasta Talebi Oluşturuldu</h2>
        <p>Talep Referansı: <strong>${leadReference}</strong></p>
        
        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Hasta Bilgileri</h3>
        <p><strong>Ad Soyad:</strong> ${lead.patientName || "Bilinmiyor"}</p>
        <p><strong>E-posta:</strong> ${lead.patientEmail}</p>
        ${lead.patientPhone ? `<p><strong>Telefon:</strong> ${lead.patientPhone}</p>` : ""}
        
        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Talep Bilgileri</h3>
        <p><strong>Tedavi:</strong> ${lead.treatmentCategory || "Belirtilmedi"}</p>
        <p><strong>Dil:</strong> ${lead.language || "Belirtilmedi"}</p>
        <p><strong>Kaynak:</strong> ${lead.source || "ClinicBridge AI"}</p>
        
        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Seçilen Klinikler (${clinicNames.length})</h3>
        <ol>
          ${clinicNames.map(cn => `<li>${cn}</li>`).join("")}
        </ol>
        
        <p style="margin-top: 24px; font-size: 12px; color: #64748b; font-style: italic;">
          Bu kayıt bir ön talep niteliğindedir. Kesinleşmiş bir randevu değildir.
        </p>
      </div>
    ` : `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
        <h2 style="color: #0d9488;">A New Patient Request Created</h2>
        <p>Request Reference: <strong>${leadReference}</strong></p>
        
        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Patient Information</h3>
        <p><strong>Full Name:</strong> ${lead.patientName || "Unknown"}</p>
        <p><strong>Email:</strong> ${lead.patientEmail}</p>
        ${lead.patientPhone ? `<p><strong>Phone:</strong> ${lead.patientPhone}</p>` : ""}
        
        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Request Information</h3>
        <p><strong>Treatment:</strong> ${lead.treatmentCategory || "Not specified"}</p>
        <p><strong>Language:</strong> ${lead.language || "Not specified"}</p>
        <p><strong>Source:</strong> ${lead.source || "ClinicBridge AI"}</p>
        
        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Selected Clinics (${clinicNames.length})</h3>
        <ol>
          ${clinicNames.map(cn => `<li>${cn}</li>`).join("")}
        </ol>
        
        <p style="margin-top: 24px; font-size: 12px; color: #64748b; font-style: italic;">
          This record is a preliminary request. It is not a confirmed appointment.
        </p>
      </div>
    `;

    const textContent = lang === "tr" ? `Yeni Bir Hasta Talebi Oluşturuldu\nTalep Referansı: ${leadReference}\nAd Soyad: ${lead.patientName || "Bilinmiyor"}\nE-posta: ${lead.patientEmail}\nSeçilen Klinikler: ${clinicNames.join(", ")}\nBu kayıt bir ön talep niteliğindedir. Kesinleşmiş bir randevu değildir.` : `A New Patient Request Created\nRequest Reference: ${leadReference}\nFull Name: ${lead.patientName || "Unknown"}\nEmail: ${lead.patientEmail}\nSelected Clinics: ${clinicNames.join(", ")}\nThis record is a preliminary request. It is not a confirmed appointment.`;

    if (!process.env.RESEND_API_KEY) {
       console.warn("[agencyNotificationService] RESEND_API_KEY missing. Mocking success.");
       await jobRef.update({
         status: "sent",
         sentAt: new Date().toISOString(),
         attemptCount: jobData.attemptCount + 1,
         recipientSnapshot: recipients,
         providerMessageId: "mock_id",
         updatedAt: new Date().toISOString()
       });
       return;
    }

    const result = await resend.emails.send({
      from: "ClinicBridge AI <noreply@clinicbridge-ai.com>",
      to: recipients,
      subject: subject,
      html: htmlContent,
      text: textContent
    });

    if (result.error) {
       throw new Error(result.error.message);
    }

    await jobRef.update({
      status: "sent",
      sentAt: new Date().toISOString(),
      attemptCount: jobData.attemptCount + 1,
      recipientSnapshot: recipients,
      providerMessageId: result.data?.id || null,
      updatedAt: new Date().toISOString()
    });
    console.log(`[agencyNotificationService] Successfully sent job ${jobId}`);

  } catch (err: any) {
    console.error(`[agencyNotificationService] Error processing job ${jobId}:`, err);
    
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
         status: "failed", // We keep it failed, a cron would look for failed with nextAttemptAt < now
         lastErrorCode: err.message || "UNKNOWN_ERROR",
         failedAt: new Date().toISOString(),
         attemptCount: newAttemptCount,
         nextAttemptAt: nextAttemptDate.toISOString(),
         updatedAt: new Date().toISOString()
       });
    }
  }
}
