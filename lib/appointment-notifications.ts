import { notificationService } from './services/notifications/NotificationService';

export const getPatientNotificationMessages = (channel: string) => {
  const messages: Record<string, { submitted: string; approved: string; cancelled: string; alternative: string }> = {
    email: {
      submitted: "Ön randevu talebiniz kliniğimize iletildi. Sonuç, paylaştığınız e-posta adresi üzerinden bildirilecektir.",
      approved: "Ön randevu talebiniz onaylandı. Detaylar e-posta adresinize gönderildi.",
      cancelled: "Randevu talebiniz şu an için onaylanamadı. İptal detayı e-posta adresinize gönderildi.",
      alternative: "Randevu talebiniz için yeni bir saat önerisi e-posta adresinize gönderildi.",
    },
    sms: {
      submitted: "Ön randevu talebiniz kliniğimize iletildi. Sonuç SMS üzerinden bildirilecektir.",
      approved: "Ön randevu talebiniz onaylandı. Detaylar SMS ile gönderildi.",
      cancelled: "Randevu talebiniz şu an için onaylanamadı. Uygun alternatif saatler için klinik iletişime geçebilir.",
      alternative: "Randevu talebiniz için yeni bir saat önerisi SMS ile iletildi.",
    },
    whatsapp: {
      submitted: "Ön randevu talebiniz kliniğimize iletildi. Sonuç WhatsApp üzerinden bildirilecektir.",
      approved: "Ön randevu talebiniz onaylandı. Detaylar WhatsApp üzerinden gönderildi.",
      cancelled: "Randevu talebiniz şu an için onaylanamadı. Uygun alternatif saatler için klinik iletişime geçebilir.",
      alternative: "Randevu talebiniz için yeni bir saat önerisi WhatsApp üzerinden iletildi.",
    }
  };
  return messages[channel] || messages.email;
};

/**
 * Appointment Notification Services
 * - sendClinicAppointmentEmail: Resend ile klinik kullanıcılarına email
 * - sendPatientSms: SMS (şimdilik mock/log mode, production'da Twilio/Netgsm bağlanır)
 */

/* ── Email via Resend ────────────────────────────────────────────────────── */

export interface AppointmentEmailPayload {
  clinicName: string;
  clinicEmails: string[]; // recipients
  patientName: string;
  patientPhone: string;
  requestedService: string;
  requestedDate: string;
  requestedTime: string;
  appointmentId: string;
}

export async function sendClinicAppointmentEmail(
  payload: AppointmentEmailPayload
): Promise<{ success: boolean; error?: string }> {
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;line-height:1.6;">
      <h2 style="color:#6366f1">Yeni Randevu Talebi - ClinicBridge AI</h2>
      <p>Merhaba,</p>
      <p>ClinicBridge AI üzerinden yeni bir randevu talebi oluşturuldu.</p>
      <table style="width:100%;border-collapse:collapse;margin:24px 0">
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600;width:170px">Klinik</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${payload.clinicName}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">Hasta</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${payload.patientName}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">Telefon</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${payload.patientPhone}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">Hizmet / İşlem</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${payload.requestedService}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">Tercih Edilen Tarih</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${payload.requestedDate}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">Tercih Edilen Saat</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${payload.requestedTime}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">Kaynak</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">AI Chatbot</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">Durum</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">Bekliyor</td></tr>
      </table>
      <p style="color:#64748b;font-size:14px">
        Lütfen <a href="https://app.clinicbridge-ai.com" style="color:#6366f1">ClinicBridge panelinizden</a> randevu talebini kontrol ediniz.
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
      <p style="color:#94a3b8;font-size:12px">ClinicBridge AI</p>
    </div>
  `;

  let allSuccess = true;
  let lastError: string | undefined;

  for (const email of payload.clinicEmails) {
    if (!email) continue;
    const result = await notificationService.sendNotification(
      {
        tenant_id: 'legacy', // To be updated if tenant logic is applied
        clinic_id: 'unknown',
        appointment_id: payload.appointmentId,
        event_type: 'appointment.request.created',
        channel: 'email',
        recipient: email,
      },
      {
        language: 'tr',
        subject: `Yeni Randevu Talebi – ${payload.clinicName}`,
        variables: {
          htmlContent: html,
        }
      }
    );
    if (!result.success) {
      allSuccess = false;
      lastError = result.error;
    }
  }

  return { success: allSuccess, error: lastError };
}

export async function sendPatientAppointmentEmail(
  payload: AppointmentEmailPayload
): Promise<{ success: boolean; error?: string }> {
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;line-height:1.6;">
      <h2 style="color:#6366f1">Randevu Talebiniz Alındı</h2>
      <p>Merhaba ${payload.patientName},</p>
      <p><strong>${payload.clinicName}</strong> kliniğine iletilen randevu talebiniz başarıyla alındı. Klinik ekibi tercih ettiğiniz tarihi değerlendirdikten sonra size yine bu e-posta adresi üzerinden dönüş yapacaktır.</p>
      <table style="width:100%;border-collapse:collapse;margin:24px 0">
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600;width:170px">Klinik</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${payload.clinicName}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">Hizmet / İşlem</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${payload.requestedService}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">Tercih Edilen Tarih</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${payload.requestedDate}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">Tercih Edilen Saat</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${payload.requestedTime}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">Durum</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">Değerlendirme Aşamasında</td></tr>
      </table>
      <p style="color:#64748b;font-size:14px">
        Sağlıklı günler dileriz.
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
      <p style="color:#94a3b8;font-size:12px">ClinicBridge AI</p>
    </div>
  `;

  const result = await notificationService.sendNotification(
    {
      tenant_id: 'legacy',
      clinic_id: 'unknown',
      appointment_id: payload.appointmentId,
      event_type: 'appointment.request.created',
      channel: 'email',
      recipient: payload.clinicEmails[0], // Note: clinicEmails in the payload is actually the recipient. For patient, pass patientEmail here.
    },
    {
      language: 'tr',
      subject: `${payload.clinicName} Randevu Talebiniz Alındı`,
      variables: {
        htmlContent: html,
      }
    }
  );

  return { success: result.success, error: result.error };
}

export interface AppointmentStatusEmailPayload {
  patientEmail: string;
  patientName: string;
  clinicName: string;
  treatment: string;
  requestedDate: string;
  requestedTime: string;
  status: string;
  appointmentId: string;
}

export async function sendPatientAppointmentStatusEmail(
  payload: AppointmentStatusEmailPayload
): Promise<{ success: boolean; error?: string }> {
  let subject = "";
  let bodyContent = "";

  if (payload.status === "confirmed" || payload.status === "approved") {
    subject = "Ön Randevu Talebiniz Onaylandı";
    bodyContent = `
      <p>Merhaba ${payload.patientName},</p>
      <p><strong>${payload.clinicName}</strong> için oluşturduğunuz <strong>${payload.treatment}</strong> ön randevu talebiniz onaylanmıştır.</p>
      <p><strong>Tarih:</strong> ${payload.requestedDate}<br/>
      <strong>Saat:</strong> ${payload.requestedTime}</p>
      <p>Herhangi bir değişiklik olması durumunda kliniğimiz sizinle yeniden iletişime geçecektir.</p>
    `;
  } else if (payload.status === "alternative_time_proposed") {
    subject = "Ön Randevu Talebiniz İçin Yeni Saat Önerisi";
    bodyContent = `
      <p>Merhaba ${payload.patientName},</p>
      <p><strong>${payload.clinicName}</strong> için oluşturduğunuz <strong>${payload.treatment}</strong> ön randevu talebiniz değerlendirilmiştir.</p>
      <p>Klinik ekibimiz aşağıdaki tarih ve saati önermektedir:</p>
      <p><strong>Tarih:</strong> ${payload.requestedDate}<br/>
      <strong>Saat:</strong> ${payload.requestedTime}</p>
      <p>Önerilen tarih ve saat sizin için uygunsa kliniğimizle iletişime geçerek onaylayabilirsiniz.</p>
    `;
  } else if (payload.status === "rejected" || payload.status === "cancelled") {
    subject = "Ön Randevu Talebiniz Hakkında";
    bodyContent = `
      <p>Merhaba ${payload.patientName},</p>
      <p><strong>${payload.clinicName}</strong> için oluşturduğunuz <strong>${payload.treatment}</strong> ön randevu talebiniz, seçtiğiniz tarih ve saat için onaylanamamıştır.</p>
      <p>Yeni bir tarih ve saat tercihi oluşturmak için kliniğimizle iletişime geçebilirsiniz.</p>
    `;
  } else {
    // If it's another status, don't send an email
    return { success: false, error: "Unsupported status for email notification" };
  }

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;line-height:1.6;color:#334155">
      <h2 style="color:#6366f1">${subject}</h2>
      ${bodyContent}
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
      <p style="color:#94a3b8;font-size:12px">ClinicBridge AI</p>
    </div>
  `;

  let eventType: any = "appointment.request.created";
  if (payload.status === "approved") eventType = "appointment.clinic.approved";
  else if (payload.status === "alternative_time_proposed") eventType = "appointment.alternative.proposed";
  else if (payload.status === "rejected") eventType = "appointment.rejected";
  else if (payload.status === "confirmed") eventType = "appointment.confirmed";
  else if (payload.status === "cancelled") eventType = "appointment.cancelled";

  const result = await notificationService.sendNotification(
    {
      tenant_id: 'legacy',
      clinic_id: 'unknown',
      appointment_id: payload.appointmentId,
      event_type: eventType,
      channel: 'email',
      recipient: payload.patientEmail,
    },
    {
      language: 'tr',
      subject: subject,
      variables: {
        htmlContent: html,
      }
    }
  );

  return { success: result.success, error: result.error };
}

/* ── SMS (mock / provider-ready) ───────────────────────────────────────── */

export interface SmsPayload {
  phone: string;
  clinicName: string;
  requestedDate: string;
  requestedTime: string;
  requestedService: string;
}

export async function sendPatientSms(
  payload: SmsPayload
): Promise<{ success: boolean; error?: string }> {
  const message =
    `${payload.clinicName} randevu talebiniz alınmıştır. ` +
    `Talep: ${payload.requestedDate} saat ${payload.requestedTime} (${payload.requestedService}). ` +
    `Klinik ekibimiz uygunluğu kontrol ederek size dönüş yapacaktır.`;

  // ── Twilio (uncomment when credentials available) ──────────────────────
  // const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID;
  // const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  // const TWILIO_FROM  = process.env.TWILIO_FROM_NUMBER;
  // if (TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) { ... }

  // ── Netgsm (uncomment when credentials available) ──────────────────────
  // const NETGSM_USER = process.env.NETGSM_USER;
  // const NETGSM_PASS = process.env.NETGSM_PASS;
  // if (NETGSM_USER && NETGSM_PASS) { ... }

  // ── Mock mode ──────────────────────────────────────────────────────────
  console.info(`[appointment-sms] SMS provider not configured, skipping patient SMS.`);
  return { success: false, error: "SMS provider not configured" };
}
