import { Resend } from "resend";
import { getAdminDb } from "@/lib/firebase-admin";

const resend = new Resend(process.env.RESEND_API_KEY || "fallback_key_if_not_provided");

export async function sendAgencyLeadNotification({ agencyId, leadId }: { agencyId: string, leadId: string }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("sendAgencyLeadNotification: RESEND_API_KEY is missing. Skipping email.");
    return false;
  }

  try {
    const adminDb = getAdminDb();
    
    // Fetch Agency data to get notification email
    const agencySnap = await adminDb!.collection("agencies").doc(agencyId).get();
    if (!agencySnap.exists) throw new Error("Agency not found");
    const agency = agencySnap.data();
    
    const settingsSnap = await adminDb!.collection("agencies").doc(agencyId).collection("config").doc("settings").get();
    const settings = settingsSnap.exists ? settingsSnap.data() : {};
    
    const recipientEmail = settings?.notificationEmail || agency?.ownerEmail || agency?.email || "admin@clinicbridge.com";

    // Fetch Lead data
    const leadSnap = await adminDb!.collection("agencies").doc(agencyId).collection("leads").doc(leadId).get();
    if (!leadSnap.exists) throw new Error("Lead not found");
    const lead = leadSnap.data();

    const patientName = lead?.patientName || "Bilinmiyor";
    const treatment = lead?.treatmentCategory || "Belirtilmedi";

    const { resolveAgencyBrand } = await import("@/lib/agency/resolveAgencyBrand");
    const brand = resolveAgencyBrand(agency);

    const htmlContent = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
        <h2 style="color: #0d9488;">Yeni Hasta Talebi (${patientName})</h2>
        <p>Merhaba,</p>
        <p><strong>${brand.displayName} AI Asistanı</strong> üzerinden yeni bir hasta talebi oluşturuldu. Aşağıda hastanın toplanan ön bilgilerini bulabilirsiniz:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px;">
          <tr>
            <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; width: 35%;">Ad Soyad</td>
            <td style="padding: 10px; border: 1px solid #e2e8f0;">${lead?.patientName || "-"}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Telefon</td>
            <td style="padding: 10px; border: 1px solid #e2e8f0;">${lead?.patientPhone || "-"}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Ülke / Şehir</td>
            <td style="padding: 10px; border: 1px solid #e2e8f0;">${lead?.country || "-"}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Yaş / Cinsiyet</td>
            <td style="padding: 10px; border: 1px solid #e2e8f0;">${lead?.age || "-"} / ${lead?.gender || "-"}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">İlgilenilen Tedavi</td>
            <td style="padding: 10px; border: 1px solid #e2e8f0;">${lead?.treatmentCategory || "-"} ${lead?.subTreatment ? `(${lead?.subTreatment})` : ""}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Bütçe Aralığı</td>
            <td style="padding: 10px; border: 1px solid #e2e8f0;">${lead?.budget || "-"}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Tercih Edilen Klinik</td>
            <td style="padding: 10px; border: 1px solid #e2e8f0;">${lead?.clinicName || "-"}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Planlanan Seyahat</td>
            <td style="padding: 10px; border: 1px solid #e2e8f0;">${lead?.travelDate || "-"}</td>
          </tr>
        </table>

        <div style="margin-top: 30px; text-align: center;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://app.clinicbridge-ai.com"}/agency/agencies/${agencyId}/leads/${leadId}" style="display: inline-block; padding: 12px 24px; background-color: #0d9488; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">Lead Detayını Görüntüle</a>
        </div>
      </div>
    `;

    await resend.emails.send({
      from: brand.fromHeader,
      to: recipientEmail,
      ...(brand.replyTo ? { replyTo: brand.replyTo } : {}),
      subject: `Yeni Hasta Talebi - ${patientName} - ${treatment}`,
      html: htmlContent,
    });

    // Mark lead as notified
    await adminDb!.collection("agencies").doc(agencyId).collection("leads").doc(leadId).update({
      notificationEmailSent: true,
      notificationSentAt: new Date().toISOString(),
    });

    return true;
  } catch (error) {
    console.error("sendAgencyLeadNotification failed:", error);
    return false;
  }
}

export async function sendPatientLeadApprovalEmail({ agencyId, leadId, customMessage }: { agencyId: string, leadId: string, customMessage?: string }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("sendPatientLeadApprovalEmail: RESEND_API_KEY is missing. Skipping email.");
    return false;
  }

  try {
    const adminDb = getAdminDb();
    
    // Fetch Lead data
    const leadSnap = await adminDb!.collection("agencies").doc(agencyId).collection("leads").doc(leadId).get();
    if (!leadSnap.exists) throw new Error("Lead not found");
    const lead = leadSnap.data();

    if (!lead?.patientEmail) {
      console.warn("No patient email found for lead:", leadId);
      return false;
    }

    const { resolveAgencyBrand } = await import("@/lib/agency/resolveAgencyBrand");
    const agencySnapForBrand = await adminDb!.collection("agencies").doc(agencyId).get();
    const brand = resolveAgencyBrand(agencySnapForBrand.data() || {});

    const htmlContent = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
        <h2 style="color: #0d9488;">Tedavi Talebiniz Hakkında</h2>
        <p>Sayın ${lead.patientName},</p>
        <p>${brand.displayName} platformu üzerinden <strong>${lead.clinicName || "kliniğimiz"}</strong> için oluşturduğunuz tedavi talebi başarıyla tarafımıza ulaşmıştır.</p>
        
        ${customMessage ? `<div style="padding: 16px; background-color: #f8fafc; border-left: 4px solid #0d9488; margin: 20px 0;">${customMessage.replace(/\n/g, "<br>")}</div>` : ""}
        
        <p>Sağlık turizmi danışmanlarımız kısa süre içinde sizinle iletişime geçecektir.</p>
        <p>Sağlıklı günler dileriz,<br>${brand.displayName} Ekibi</p>
      </div>
    `;

    await resend.emails.send({
      from: brand.fromHeader,
      to: lead.patientEmail,
      ...(brand.replyTo ? { replyTo: brand.replyTo } : {}),
      subject: `Tedavi Talebiniz Alındı - ${brand.displayName}`,
      html: htmlContent,
    });

    // Mark lead as patient notified
    await adminDb!.collection("agencies").doc(agencyId).collection("leads").doc(leadId).update({
      patientEmailSent: true,
      patientNotifiedAt: new Date().toISOString(),
      status: "patient_notified",
      statusHistory: [
        ...(lead.statusHistory || []),
        { status: "patient_notified", changedAt: new Date().toISOString(), note: "Patient approval email sent." }
      ]
    });

    return true;
  } catch (error) {
    console.error("sendPatientLeadApprovalEmail failed:", error);
    return false;
  }
}
