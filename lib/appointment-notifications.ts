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
  patientEmail?: string;
  requestedService: string;
  requestedDate: string;
  requestedTime?: string | null;
  preferredTimeStart?: string | null;
  preferredTimeEnd?: string | null;
  preferredTimePeriod?: string | null;
  preferredTimeText?: string | null;
  appointmentId: string;
  notes?: string;
  source?: string;
  status?: string;
}

export async function sendClinicAppointmentEmail(
  payload: AppointmentEmailPayload
): Promise<{ success: boolean; error?: string }> {
  let timeLabel = "Tercih Edilen Saat";
  let timeValue = payload.requestedTime || "Saat belirtilmedi";
  if (payload.preferredTimeText && payload.preferredTimeText.toLowerCase() !== "belirtilmedi" && payload.preferredTimeText.toLowerCase() !== "belirtilmemiş") {
    timeValue = payload.preferredTimeText;
  }
  
  if (payload.preferredTimePeriod) {
    timeLabel = "Tercih Edilen Zaman";
    const periodMap: Record<string, string> = {
      morning: "Sabah",
      afternoon: "Öğleden sonra",
      evening: "Akşam",
      earliest_available: "En erken uygun saat"
    };
    timeValue = periodMap[payload.preferredTimePeriod] || payload.preferredTimePeriod;
  } else if (payload.preferredTimeStart && payload.preferredTimeEnd) {
    timeLabel = "Tercih Edilen Saat Aralığı";
    timeValue = `${payload.preferredTimeStart} - ${payload.preferredTimeEnd}`;
  }

  const sourceMap: Record<string, string> = {
    manual: "Manuel",
    ai_chatbot: "AI Chatbot",
    admin: "Admin",
    api: "API"
  };
  const displaySource = payload.source ? (sourceMap[payload.source] || payload.source) : "AI Chatbot";
  
  const statusMap: Record<string, string> = {
    "PENDING_REVIEW": "Ön Değerlendirme Bekliyor",
    "pending": "Bekliyor",
    "confirmed": "Onaylandı"
  };
  const displayStatus = payload.status ? (statusMap[payload.status] || payload.status) : "Ön Değerlendirme Bekliyor";

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;line-height:1.6;">
      <h2 style="color:#6366f1">Yeni Randevu Talebi - ClinicBridge AI</h2>
      <p>Merhaba,</p>
      <p>ClinicBridge AI üzerinden yeni bir randevu talebi oluşturuldu.</p>
      <table style="width:100%;border-collapse:collapse;margin:24px 0">
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600;width:170px">Klinik</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${payload.clinicName}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">Hasta</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${payload.patientName}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">Telefon</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${payload.patientPhone}</td></tr>
        ${payload.patientEmail ? `<tr><td style="padding:10px;background:#f8fafc;font-weight:600">E-posta</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${payload.patientEmail}</td></tr>` : ''}
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">Hizmet / İşlem</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${payload.requestedService}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">Tercih Edilen Tarih</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${payload.requestedDate}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">${timeLabel}</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${timeValue}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">Kaynak</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${displaySource}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">Durum</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${displayStatus}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">Randevu ID</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${payload.appointmentId}</td></tr>
        ${payload.notes ? `<tr><td style="padding:10px;background:#f8fafc;font-weight:600">Notlar</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${payload.notes}</td></tr>` : ''}
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
): Promise<{ 
  success: boolean; 
  attempted: boolean;
  accepted: boolean;
  status: "ACCEPTED" | "FAILED" | "MISSING_RECIPIENT" | "NOT_CONFIGURED" | "UNKNOWN";
  messageId?: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  error?: string 
}> {
  const patientEmailToUse = (payload.patientEmail || "").trim();
  if (!patientEmailToUse || patientEmailToUse.length < 5) {
    return {
      success: false,
      attempted: false,
      accepted: false,
      status: "MISSING_RECIPIENT",
      errorCode: "missing_recipient",
      errorMessage: "Geçerli bir hasta e-posta adresi bulunamadı."
    };
  }
  let timeLabel = "Tercih Edilen Saat";
  let timeValue = payload.requestedTime || "Saat belirtilmedi";
  if (payload.preferredTimeText && payload.preferredTimeText.toLowerCase() !== "belirtilmedi" && payload.preferredTimeText.toLowerCase() !== "belirtilmemiş") {
    timeValue = payload.preferredTimeText;
  }
  
  if (payload.preferredTimePeriod) {
    timeLabel = "Tercih Edilen Zaman";
    const periodMap: Record<string, string> = {
      morning: "Sabah",
      afternoon: "Öğleden sonra",
      evening: "Akşam",
      earliest_available: "En erken uygun saat"
    };
    timeValue = periodMap[payload.preferredTimePeriod] || payload.preferredTimePeriod;
  } else if (payload.preferredTimeStart && payload.preferredTimeEnd) {
    timeLabel = "Tercih Edilen Saat Aralığı";
    timeValue = `${payload.preferredTimeStart} - ${payload.preferredTimeEnd}`;
  }

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;line-height:1.6;">
      <h2 style="color:#6366f1">Randevu Talebiniz Alındı</h2>
      <p>Merhaba ${payload.patientName},</p>
      <p><strong>${payload.clinicName}</strong> kliniğine iletilen randevu talebiniz başarıyla alındı. Klinik ekibi tercih ettiğiniz tarihi değerlendirdikten sonra size yine bu e-posta adresi üzerinden dönüş yapacaktır.</p>
      <table style="width:100%;border-collapse:collapse;margin:24px 0">
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600;width:170px">Klinik</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${payload.clinicName}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">Hizmet / İşlem</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${payload.requestedService}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">Tercih Edilen Tarih</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${payload.requestedDate}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">${timeLabel}</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${timeValue}</td></tr>
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
      recipient: patientEmailToUse,
    },
    {
      language: 'tr',
      subject: `${payload.clinicName} Randevu Talebiniz Alındı`,
      variables: {
        htmlContent: html,
      }
    }
  );

  return { 
    success: result.success, 
    attempted: result.attempted,
    accepted: result.accepted,
    status: result.status,
    messageId: result.messageId,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
    error: result.error 
  };
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

export function resolvePatientEmail(appointment: any): string | null {
  const value =
    appointment.patientEmail ??
    appointment.email ??
    appointment?.patient?.email ??
    appointment.contactEmail ??
    null;

  return typeof value === "string" ? value.trim().toLowerCase() : null;
}

export async function sendPatientAppointmentStatusEmail(
  payload: AppointmentStatusEmailPayload
): Promise<{ 
  success: boolean; 
  attempted: boolean;
  accepted: boolean;
  status: "ACCEPTED" | "FAILED" | "MISSING_RECIPIENT" | "NOT_CONFIGURED" | "UNKNOWN";
  messageId?: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  error?: string 
}> {
  const patientEmailToUse = resolvePatientEmail(payload);
  
  // Maskeli log
  console.log("[STATUS_EMAIL_FLOW_START]", JSON.stringify({
    traceId: "auto",
    appointmentId: payload.appointmentId,
    hasRecipient: !!patientEmailToUse,
    maskedRecipient: patientEmailToUse ? patientEmailToUse.replace(/(.{1})(.*)(@.*)/, "$1***$3") : null,
    provider: "resend",
    hasApiKey: !!process.env.RESEND_API_KEY,
    hasFromAddress: true
  }));

  if (!patientEmailToUse || patientEmailToUse.length < 5) {
    console.log("[STATUS_EMAIL_FLOW_FAILED]", JSON.stringify({
      traceId: "auto",
      appointmentId: payload.appointmentId,
      failureStage: "RECIPIENT_RESOLUTION",
      errorCode: "PATIENT_EMAIL_MISSING",
      safeErrorMessage: "Patient email could not be resolved from appointment data."
    }));
    return {
      success: false,
      attempted: false,
      accepted: false,
      status: "MISSING_RECIPIENT",
      errorCode: "PATIENT_EMAIL_MISSING",
      errorMessage: "Patient email could not be resolved from appointment data."
    };
  }

  // 8. TEMPLATE RENDER HATASINI AYIR
  console.log("[STATUS_EMAIL_TEMPLATE_DEBUG]", JSON.stringify({
    hasPatientName: !!payload.patientName,
    hasClinicName: !!payload.clinicName,
    hasServiceName: !!payload.treatment,
    hasAppointmentDate: !!payload.requestedDate,
    hasAppointmentTime: !!payload.requestedTime,
    hasStatus: !!payload.status
  }));

  const safePatientName = payload.patientName || "Değerli Hastamız";
  const safeClinicName = payload.clinicName || "Klinik";
  const safeTreatment = payload.treatment || "Randevu talebiniz";
  const safeRequestedDate = payload.requestedDate || "Klinik tarafından bildirilecektir";
  const safeRequestedTime = payload.requestedTime || "Klinik tarafından bildirilecektir";

  console.log("[STATUS_EMAIL_TEMPLATE_RESULT]", JSON.stringify({
    traceId: "auto",
    appointmentId: payload.appointmentId,
    templateCreated: true,
    hasSubject: true,
    hasHtml: true,
    hasText: false
  }));

  let subject = "";
  let bodyContent = "";

  if (payload.status === "APPROVED") {
    subject = "Ön Randevu Talebiniz Klinik Tarafından Onaylandı";
    bodyContent = `
      <p>Merhaba ${safePatientName},</p>
      <p><strong>${safeClinicName}</strong> için oluşturduğunuz ön randevu talebi klinik ekibi tarafından değerlendirilmiş ve uygun bulunmuştur.</p>
      <p>Talep edilen hizmet: ${safeTreatment}<br/>
      Talep edilen tarih: ${safeRequestedDate}<br/>
      Talep edilen saat: ${safeRequestedTime}</p>
      <p>Bu bildirim, randevunuzun klinik tarafından değerlendirildiğini gösterir. Klinik ekibi gerekmesi halinde son detaylar için sizinle iletişime geçebilir.</p>
    `;
  } else if (payload.status === "CONFIRMED") {
    subject = "Randevunuz Kesinleştirildi";
    bodyContent = `
      <p>Merhaba ${safePatientName},</p>
      <p><strong>${safeClinicName}</strong> randevunuz kesinleştirilmiştir.</p>
      <p>Hizmet: ${safeTreatment}<br/>
      Randevu tarihi: ${safeRequestedDate}<br/>
      Randevu saati: ${safeRequestedTime}</p>
      <p>Randevu saatinden kısa bir süre önce klinikte olmanızı rica ederiz.</p>
    `;
  } else if (payload.status === "REJECTED") {
    subject = "Ön Randevu Talebiniz Hakkında";
    bodyContent = `
      <p>Merhaba ${safePatientName},</p>
      <p><strong>${safeClinicName}</strong> için oluşturduğunuz ön randevu talebi klinik ekibi tarafından değerlendirilmiştir.</p>
      <p>Talep ettiğiniz tarih veya saat için şu aşamada randevu oluşturulamamıştır.</p>
      <p>Klinik ekibi alternatif bir tarih ve saat belirlemek amacıyla sizinle iletişime geçebilir. Dilerseniz yeni bir ön randevu talebi de oluşturabilirsiniz.</p>
    `;
  } else if (payload.status === "CANCELLED") {
    subject = "Randevu İptal Bilgilendirmesi";
    bodyContent = `
      <p>Merhaba ${safePatientName},</p>
      <p><strong>${safeClinicName}</strong> randevunuz iptal edilmiştir.</p>
      <p>Hizmet: ${safeTreatment}<br/>
      Tarih: ${safeRequestedDate}<br/>
      Saat: ${safeRequestedTime}</p>
      <p>Yeni bir randevu planlamak için klinikle iletişime geçebilir veya yeniden ön randevu talebi oluşturabilirsiniz.</p>
    `;
  } else {
    // If it's another status, don't send an email
    return { 
      success: false, 
      attempted: false,
      accepted: false,
      status: "NOT_CONFIGURED",
      errorCode: "unsupported_status",
      errorMessage: "Unsupported status for email notification",
      error: "Unsupported status for email notification" 
    };
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
  if (payload.status === "APPROVED") eventType = "appointment.clinic.approved";
  else if (payload.status === "REJECTED") eventType = "appointment.rejected";
  else if (payload.status === "CONFIRMED") eventType = "appointment.confirmed";
  else if (payload.status === "CANCELLED") eventType = "appointment.cancelled";

  const result = await notificationService.sendNotification(
    {
      tenant_id: 'legacy',
      clinic_id: 'unknown',
      appointment_id: payload.appointmentId,
      event_type: eventType,
      channel: 'email',
      recipient: patientEmailToUse,
    },
    {
      language: 'tr',
      subject: subject,
      variables: {
        htmlContent: html,
      }
    }
  );

  console.log("[STATUS_EMAIL_PROVIDER_RESULT]", JSON.stringify({
    traceId: "auto",
    appointmentId: payload.appointmentId,
    provider: "resend",
    success: result.success,
    providerMessageId: result.messageId || null,
    accepted: result.accepted,
    rejected: !result.accepted,
    errorCode: result.errorCode || null,
    safeErrorMessage: result.errorMessage || result.error || null
  }));

  if (!result.success) {
    console.log("[STATUS_EMAIL_FLOW_FAILED]", JSON.stringify({
      traceId: "auto",
      appointmentId: payload.appointmentId,
      failureStage: "PROVIDER_CALL",
      errorCode: result.errorCode || "PROVIDER_ERROR",
      safeErrorMessage: result.errorMessage || result.error || "Bilinmeyen provider hatası"
    }));
  }

  return { 
    success: result.success, 
    attempted: result.attempted,
    accepted: result.accepted,
    status: result.status,
    messageId: result.messageId,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
    error: result.error 
  };
}

/* ── SMS (mock / provider-ready) ───────────────────────────────────────── */

export interface SmsPayload {
  phone: string;
  clinicName: string;
  requestedDate: string;
  requestedTime?: string | null;
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
