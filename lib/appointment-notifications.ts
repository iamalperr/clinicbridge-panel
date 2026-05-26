/**
 * Appointment Notification Services
 * - sendClinicAppointmentEmail: Resend ile klinik kullanıcılarına email
 * - sendPatientSms: SMS (şimdilik mock/log mode, production'da Twilio/Netgsm bağlanır)
 */

/* ── Email via Resend ────────────────────────────────────────────────────── */

export interface AppointmentEmailPayload {
  clinicName: string;
  clinicEmail: string; // recipient
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
  const RESEND_KEY = process.env.RESEND_API_KEY;
  const FROM       = process.env.EMAIL_FROM ?? "no-reply@clinicbridge-one.com";

  if (!RESEND_KEY) {
    console.warn("[appointment-email] RESEND_API_KEY not set — logging to console only");
    console.log("[appointment-email] MOCK EMAIL:", JSON.stringify(payload, null, 2));
    return { success: true };
  }

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;line-height:1.6;">
      <h2 style="color:#6366f1">Yeni Randevu Talebi - ClinicBridge One</h2>
      <p>Merhaba,</p>
      <p>ClinicBridge One üzerinden yeni bir randevu talebi oluşturuldu.</p>
      <table style="width:100%;border-collapse:collapse;margin:24px 0">
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600;width:170px">Klinik</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${payload.clinicName}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">Hasta</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${payload.patientName}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">Telefon</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${payload.patientPhone}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">E-posta</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">-</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">Hizmet / İşlem</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${payload.requestedService}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">Tercih Edilen Tarih</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${payload.requestedDate}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">Tercih Edilen Saat</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${payload.requestedTime}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">Kaynak</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">AI Chatbot</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;font-weight:600">Durum</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">Bekliyor</td></tr>
      </table>
      <p style="color:#64748b;font-size:14px">
        Lütfen <a href="https://app.clinicbridge-one.com" style="color:#6366f1">ClinicBridge panelinizden</a> randevu talebini kontrol ediniz.
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
      <p style="color:#94a3b8;font-size:12px">ClinicBridge One</p>
    </div>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to:   [payload.clinicEmail],
        subject: `Yeni Randevu Talebi – ${payload.clinicName}`,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[appointment-email] Resend error:", err);
      return { success: false, error: err };
    }

    console.log(`[appointment-email] Sent to ${payload.clinicEmail}`);
    return { success: true };
  } catch (err: any) {
    console.error("[appointment-email] Network error:", err.message);
    return { success: false, error: err.message };
  }
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
