import { CanonicalAppointmentStatus } from "../../types/appointment";

export interface EmailTemplateParams {
  tenantId: string;
  clinicId: string;
  status: CanonicalAppointmentStatus;
  locale: "tr" | "en";
  patientName: string;
  clinicName: string;
  treatment: string;
  requestedDate: string;
  requestedTime: string;
}

export interface ResolvedEmailTemplate {
  subject: string;
  htmlContent: string;
}

export function getAppointmentStatusEmailTemplate(params: EmailTemplateParams): ResolvedEmailTemplate | null {
  const { status, locale } = params;
  
  const safePatientName = params.patientName || (locale === "en" ? "Dear Patient" : "Değerli Hastamız");
  const safeClinicName = params.clinicName || (locale === "en" ? "Clinic" : "Klinik");
  const safeTreatment = params.treatment || (locale === "en" ? "Requested Service" : "Talep edilen hizmet");
  const safeRequestedDate = params.requestedDate || (locale === "en" ? "TBD" : "Bildirilecek");
  const safeRequestedTime = params.requestedTime || (locale === "en" ? "TBD" : "Bildirilecek");

  let subject = "";
  let bodyContent = "";

  if (status === "approved") {
    subject = locale === "en" 
      ? `Your Appointment Request at ${safeClinicName} is Approved` 
      : `${safeClinicName} Ön Randevu Talebiniz Onaylandı`;
      
    bodyContent = locale === "en" ? `
      <p>Hello ${safePatientName},</p>
      <p>Your preliminary appointment request for <strong>${safeClinicName}</strong> has been approved by the clinic team.</p>
      <p>Service: ${safeTreatment}<br/>
      Date: ${safeRequestedDate}<br/>
      Time: ${safeRequestedTime}</p>
      <p>The clinic may contact you if further details are needed.</p>
    ` : `
      <p>Merhaba ${safePatientName},</p>
      <p><strong>${safeClinicName}</strong> için oluşturduğunuz ön randevu talebi klinik ekibi tarafından değerlendirilmiş ve uygun bulunmuştur.</p>
      <p>Talep edilen hizmet: ${safeTreatment}<br/>
      Talep edilen tarih: ${safeRequestedDate}<br/>
      Talep edilen saat: ${safeRequestedTime}</p>
      <p>Bu bildirim, randevunuzun klinik tarafından değerlendirildiğini gösterir. Klinik ekibi gerekmesi halinde son detaylar için sizinle iletişime geçebilir.</p>
    `;
  } 
  else if (status === "confirmed") {
    subject = locale === "en" 
      ? `Your Appointment is Confirmed` 
      : `Randevunuz Kesinleştirildi`;
      
    bodyContent = locale === "en" ? `
      <p>Hello ${safePatientName},</p>
      <p>Your appointment at <strong>${safeClinicName}</strong> is fully confirmed.</p>
      <p>Service: ${safeTreatment}<br/>
      Date: ${safeRequestedDate}<br/>
      Time: ${safeRequestedTime}</p>
      <p>Please aim to arrive slightly before your scheduled time.</p>
    ` : `
      <p>Merhaba ${safePatientName},</p>
      <p><strong>${safeClinicName}</strong> randevunuz kesinleştirilmiştir.</p>
      <p>Hizmet: ${safeTreatment}<br/>
      Randevu tarihi: ${safeRequestedDate}<br/>
      Randevu saati: ${safeRequestedTime}</p>
      <p>Randevu saatinden kısa bir süre önce klinikte olmanızı rica ederiz.</p>
    `;
  } 
  else if (status === "rejected") {
    subject = locale === "en" 
      ? `Regarding Your Appointment Request` 
      : `Ön Randevu Talebiniz Hakkında`;
      
    bodyContent = locale === "en" ? `
      <p>Hello ${safePatientName},</p>
      <p>Your preliminary appointment request for <strong>${safeClinicName}</strong> has been reviewed.</p>
      <p>Unfortunately, we cannot accommodate the requested date/time right now.</p>
      <p>The clinic may contact you to arrange an alternative time.</p>
    ` : `
      <p>Merhaba ${safePatientName},</p>
      <p><strong>${safeClinicName}</strong> için oluşturduğunuz ön randevu talebi klinik ekibi tarafından değerlendirilmiştir.</p>
      <p>Talep ettiğiniz tarih veya saat için şu aşamada randevu oluşturulamamıştır.</p>
      <p>Klinik ekibi alternatif bir tarih ve saat belirlemek amacıyla sizinle iletişime geçebilir.</p>
    `;
  } 
  else if (status === "cancelled") {
    subject = locale === "en" 
      ? `Appointment Cancellation Notice` 
      : `Randevu İptal Bilgilendirmesi`;
      
    bodyContent = locale === "en" ? `
      <p>Hello ${safePatientName},</p>
      <p>Your appointment at <strong>${safeClinicName}</strong> has been cancelled.</p>
      <p>Service: ${safeTreatment}<br/>
      Date: ${safeRequestedDate}<br/>
      Time: ${safeRequestedTime}</p>
      <p>If you wish to reschedule, please contact the clinic.</p>
    ` : `
      <p>Merhaba ${safePatientName},</p>
      <p><strong>${safeClinicName}</strong> randevunuz iptal edilmiştir.</p>
      <p>Hizmet: ${safeTreatment}<br/>
      Tarih: ${safeRequestedDate}<br/>
      Saat: ${safeRequestedTime}</p>
      <p>Yeni bir randevu planlamak için klinikle iletişime geçebilirsiniz.</p>
    `;
  }
  else if (status === "reschedule_requested") {
    subject = locale === "en" 
      ? `Alternative Time Proposed for Your Appointment` 
      : `Randevunuz İçin Yeni Tarih Önerisi`;
      
    bodyContent = locale === "en" ? `
      <p>Hello ${safePatientName},</p>
      <p>The clinic <strong>${safeClinicName}</strong> has requested to reschedule your appointment.</p>
      <p>Original Request:<br/>
      Service: ${safeTreatment}<br/>
      Date: ${safeRequestedDate}<br/>
      Time: ${safeRequestedTime}</p>
      <p>The clinic will reach out to you with alternative times.</p>
    ` : `
      <p>Merhaba ${safePatientName},</p>
      <p><strong>${safeClinicName}</strong> kliniği randevunuz için yeni bir tarih belirlemeyi talep etmiştir.</p>
      <p>Önceki Talep:<br/>
      Hizmet: ${safeTreatment}<br/>
      Tarih: ${safeRequestedDate}<br/>
      Saat: ${safeRequestedTime}</p>
      <p>Klinik ekibi yeni uygun saatler için sizinle iletişime geçecektir.</p>
    `;
  }
  else {
    // Unsupported statuses for patient email notification (e.g. pending, completed)
    return null;
  }

  const htmlContent = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;line-height:1.6;color:#334155">
      <h2 style="color:#6366f1">${subject}</h2>
      ${bodyContent}
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
      <p style="color:#94a3b8;font-size:12px">ClinicBridge AI</p>
    </div>
  `;

  return { subject, htmlContent };
}
