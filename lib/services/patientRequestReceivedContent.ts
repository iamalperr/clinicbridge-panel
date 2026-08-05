/**
 * Pure content for the patient "request received / agency evaluating" email.
 * Kept free of Firebase/Resend for unit tests.
 *
 * NOTE: Patient portal CTA ("Talebimi Görüntüle") is temporarily disabled.
 * Re-enable via includeViewRequestCta + secureUrl when ready.
 */

export function buildPatientRequestReceivedSubject(params: {
  lang: "tr" | "en";
  leadReference: string;
  agencyName?: string;
}): string {
  const agency = params.agencyName || "FeelinHealthy";
  return params.lang === "tr"
    ? `Talebiniz alındı — ${agency} ekibi inceliyor (${params.leadReference})`
    : `Request received — ${agency} is reviewing it (${params.leadReference})`;
}

export function buildPatientRequestReceivedCopy(params: {
  lang: "tr" | "en";
  agencyName: string;
  patientFirstName: string;
  treatmentName: string;
  clinicNames: string[];
  leadReference: string;
  /** Optional patient-portal URL; only rendered when includeViewRequestCta is true. */
  secureUrl?: string;
  /** Temporarily false — hides "Talebimi Görüntüle" / "View My Request". */
  includeViewRequestCta?: boolean;
  travelDate?: string | null;
  selectedCity?: string | null;
}): { html: string; text: string } {
  const {
    lang,
    agencyName,
    patientFirstName,
    treatmentName,
    clinicNames,
    leadReference,
    secureUrl,
    includeViewRequestCta = false,
    travelDate,
    selectedCity,
  } = params;

  const showCta = includeViewRequestCta === true && Boolean(secureUrl);

  const clinicsListHtml =
    clinicNames.length > 0
      ? `<ol style="margin-top: 4px;">${clinicNames.map((cn) => `<li>${escapeHtml(cn)}</li>`).join("")}</ol>`
      : `<p style="color:#64748b;">${lang === "tr" ? "Klinik bilgisi talebinizde kayıtlıdır." : "Clinic details are recorded on your request."}</p>`;

  const clinicsListText =
    clinicNames.length > 0
      ? clinicNames.map((cn, i) => `${i + 1}. ${cn}`).join("\n")
      : lang === "tr"
        ? "(klinik bilgisi kayıtlı)"
        : "(clinic details on file)";

  const ctaHtmlTr = showCta
    ? `<div style="margin: 32px 0;">
          <a href="${secureUrl}" style="display: inline-block; padding: 12px 24px; background-color: #0d9488; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">Talebimi Görüntüle</a>
        </div>`
    : "";
  const ctaHtmlEn = showCta
    ? `<div style="margin: 32px 0;">
        <a href="${secureUrl}" style="display: inline-block; padding: 12px 24px; background-color: #0d9488; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">View My Request</a>
      </div>`
    : "";

  if (lang === "tr") {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
        <h2 style="color: #0d9488;">Talebiniz alındı — ekibimiz inceliyor</h2>
        <p>Merhaba ${escapeHtml(patientFirstName)},</p>
        <p><strong>${escapeHtml(agencyName)}</strong> üzerinden oluşturduğunuz teklif talebi sistemimize kaydedildi. Ekibimiz talebinizi değerlendiriyor.</p>

        <div style="background-color: #f0fdfa; padding: 16px; border-radius: 8px; margin: 24px 0; border: 1px solid #99f6e4;">
          <p style="margin: 0 0 8px 0; color: #0f766e; font-size: 13px; font-weight: 700;">Şimdi ne olacak?</p>
          <ol style="margin: 0; padding-left: 18px; color: #134e4a;">
            <li>FeelinHealthy ekibi talebinizi ve tercihlerinizi inceler.</li>
            <li>Gerekirse klinik tarafında uygunluk / teklif hazırlığı başlar.</li>
            <li>Ekip sizinle e-posta veya telefon üzerinden iletişime geçer ve sonraki adımları paylaşır.</li>
          </ol>
        </div>

        <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 24px 0;">
          <p style="margin: 0 0 8px 0; color: #64748b; font-size: 13px;">Talep Referansı</p>
          <p style="margin: 0; font-weight: bold; font-size: 16px;">${escapeHtml(leadReference)}</p>
        </div>

        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Talep Özeti</h3>
        <p><strong>Tedavi:</strong> ${escapeHtml(treatmentName)}</p>
        ${selectedCity ? `<p><strong>Şehir:</strong> ${escapeHtml(selectedCity)}</p>` : ""}
        ${travelDate ? `<p><strong>Seyahat:</strong> ${escapeHtml(travelDate)}</p>` : ""}
        <p><strong>Seçilen Klinikler:</strong></p>
        ${clinicsListHtml}

        <p style="margin-top: 24px;">Bu kayıt kesinleşmiş bir randevu değildir. Değerlendirme tamamlandığında sizinle ayrıca iletişime geçilecektir.</p>
        <p>Aynı talep için yeniden başvuru yapmanıza gerek yoktur.</p>

        ${ctaHtmlTr}

        <p style="margin-top: 32px; color: #64748b; font-size: 14px;">${escapeHtml(agencyName)} · ClinicBridge AI</p>
      </div>
    `;
    const text = [
      `Talebiniz alındı — ekibimiz inceliyor`,
      ``,
      `Merhaba ${patientFirstName},`,
      `${agencyName} üzerinden oluşturduğunuz teklif talebi kaydedildi. Ekibimiz talebinizi değerlendiriyor.`,
      ``,
      `Şimdi ne olacak?`,
      `1. FeelinHealthy ekibi talebinizi inceler.`,
      `2. Gerekirse klinik tarafında teklif hazırlığı başlar.`,
      `3. Ekip sizinle iletişime geçerek sonraki adımları paylaşır.`,
      ``,
      `Talep Referansı: ${leadReference}`,
      `Tedavi: ${treatmentName}`,
      selectedCity ? `Şehir: ${selectedCity}` : "",
      travelDate ? `Seyahat: ${travelDate}` : "",
      `Seçilen Klinikler:`,
      clinicsListText,
      ``,
      `Bu bir randevu onayı değildir. Aynı talep için yeniden başvurmanıza gerek yoktur.`,
      showCta ? `Talebinizi görüntüleyin: ${secureUrl}` : "",
      ``,
      `${agencyName} · ClinicBridge AI`,
    ]
      .filter(Boolean)
      .join("\n");
    return { html, text };
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
      <h2 style="color: #0d9488;">Request received — our team is reviewing it</h2>
      <p>Hello ${escapeHtml(patientFirstName)},</p>
      <p>Your quote request through <strong>${escapeHtml(agencyName)}</strong> has been saved. Our team is now reviewing it.</p>

      <div style="background-color: #f0fdfa; padding: 16px; border-radius: 8px; margin: 24px 0; border: 1px solid #99f6e4;">
        <p style="margin: 0 0 8px 0; color: #0f766e; font-size: 13px; font-weight: 700;">What happens next?</p>
        <ol style="margin: 0; padding-left: 18px; color: #134e4a;">
          <li>The FeelinHealthy team reviews your request and preferences.</li>
          <li>Where needed, clinics prepare suitability / quote details.</li>
          <li>We contact you by email or phone with the next steps.</li>
        </ol>
      </div>

      <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 24px 0;">
        <p style="margin: 0 0 8px 0; color: #64748b; font-size: 13px;">Request Reference</p>
        <p style="margin: 0; font-weight: bold; font-size: 16px;">${escapeHtml(leadReference)}</p>
      </div>

      <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Request Summary</h3>
      <p><strong>Treatment:</strong> ${escapeHtml(treatmentName)}</p>
      ${selectedCity ? `<p><strong>City:</strong> ${escapeHtml(selectedCity)}</p>` : ""}
      ${travelDate ? `<p><strong>Travel:</strong> ${escapeHtml(travelDate)}</p>` : ""}
      <p><strong>Selected Clinics:</strong></p>
      ${clinicsListHtml}

      <p style="margin-top: 24px;">This is not a confirmed appointment. You will hear from us again after the review.</p>
      <p>You do not need to submit the same request again.</p>

      ${ctaHtmlEn}

      <p style="margin-top: 32px; color: #64748b; font-size: 14px;">${escapeHtml(agencyName)} · ClinicBridge AI</p>
    </div>
  `;
  const text = [
    `Request received — our team is reviewing it`,
    ``,
    `Hello ${patientFirstName},`,
    `Your quote request through ${agencyName} has been saved. Our team is reviewing it.`,
    ``,
    `What happens next?`,
    `1. The FeelinHealthy team reviews your request.`,
    `2. Where needed, clinics prepare quote details.`,
    `3. We contact you with the next steps.`,
    ``,
    `Request Reference: ${leadReference}`,
    `Treatment: ${treatmentName}`,
    selectedCity ? `City: ${selectedCity}` : "",
    travelDate ? `Travel: ${travelDate}` : "",
    `Selected Clinics:`,
    clinicsListText,
    ``,
    `This is not an appointment confirmation. You do not need to re-apply.`,
    showCta ? `View your request: ${secureUrl}` : "",
    ``,
    `${agencyName} · ClinicBridge AI`,
  ]
    .filter(Boolean)
    .join("\n");
  return { html, text };
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
