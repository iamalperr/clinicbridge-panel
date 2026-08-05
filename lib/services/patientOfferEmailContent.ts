/**
 * Pure patient offer email content (after agency approval of drafted prices).
 */

import { formatOfferPriceRange } from "../agency/clinicOfferDraft";

export interface PatientOfferEmailOffer {
  clinicName: string;
  treatmentName: string;
  priceMin: number;
  priceMax: number;
  currency: string;
  notes?: string;
}

export function buildPatientOfferEmailContent(params: {
  lang: "tr" | "en";
  agencyName: string;
  patientName: string;
  treatmentLabel: string;
  offers: PatientOfferEmailOffer[];
  customMessage?: string;
}): { subject: string; html: string; text: string } {
  const { lang, agencyName, patientName, treatmentLabel, offers, customMessage } = params;
  const firstName = patientName?.split(" ")[0] || (lang === "tr" ? "Değerli Hastamız" : "Dear Patient");

  const offerRowsHtml = offers
    .map((o) => {
      const range = formatOfferPriceRange(o);
      return `<tr>
        <td style="padding:10px;border:1px solid #e2e8f0;">${escapeHtml(o.clinicName)}</td>
        <td style="padding:10px;border:1px solid #e2e8f0;">${escapeHtml(o.treatmentName || treatmentLabel)}</td>
        <td style="padding:10px;border:1px solid #e2e8f0;font-weight:700;">${escapeHtml(range)}</td>
      </tr>`;
    })
    .join("");

  const offerLinesText = offers
    .map((o) => `- ${o.clinicName}: ${formatOfferPriceRange(o)} (${o.treatmentName || treatmentLabel})`)
    .join("\n");

  if (lang === "tr") {
    const subject = `Tedavi teklifiniz hazır — ${agencyName}`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b;line-height:1.6;">
        <h2 style="color:#0d9488;">Tedavi teklifiniz hazır</h2>
        <p>Merhaba ${escapeHtml(firstName)},</p>
        <p><strong>${escapeHtml(agencyName)}</strong> ekibi talebinizi inceledi ve size özel tahmini teklif bilgisini paylaştı.</p>
        ${customMessage ? `<div style="padding:14px;background:#f8fafc;border-left:4px solid #0d9488;margin:18px 0;">${escapeHtml(customMessage).replace(/\n/g, "<br>")}</div>` : ""}
        <h3 style="border-bottom:1px solid #e2e8f0;padding-bottom:8px;">Teklif özeti — ${escapeHtml(treatmentLabel)}</h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="text-align:left;padding:10px;border:1px solid #e2e8f0;">Klinik</th>
              <th style="text-align:left;padding:10px;border:1px solid #e2e8f0;">Tedavi</th>
              <th style="text-align:left;padding:10px;border:1px solid #e2e8f0;">Tahmini fiyat</th>
            </tr>
          </thead>
          <tbody>${offerRowsHtml}</tbody>
        </table>
        <p style="color:#64748b;font-size:13px;">Fiyatlar tahmini olup klinik değerlendirmesine göre değişebilir. Bu bir randevu onayı değildir.</p>
        <p>Sorularınız için bu e-postaya yanıt verebilirsiniz.</p>
        <p style="margin-top:28px;color:#64748b;font-size:14px;">${escapeHtml(agencyName)} · ClinicBridge AI</p>
      </div>
    `;
    const text = [
      `Tedavi teklifiniz hazır`,
      ``,
      `Merhaba ${firstName},`,
      `${agencyName} ekibi talebinizi inceledi ve size özel tahmini teklif bilgisini paylaştı.`,
      customMessage || "",
      ``,
      `Teklif özeti — ${treatmentLabel}`,
      offerLinesText,
      ``,
      `Fiyatlar tahmini olup klinik değerlendirmesine göre değişebilir.`,
      `${agencyName} · ClinicBridge AI`,
    ]
      .filter((l) => l !== "")
      .join("\n");
    return { subject, html, text };
  }

  const subject = `Your treatment offer is ready — ${agencyName}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b;line-height:1.6;">
      <h2 style="color:#0d9488;">Your treatment offer is ready</h2>
      <p>Hello ${escapeHtml(firstName)},</p>
      <p>The <strong>${escapeHtml(agencyName)}</strong> team reviewed your request and prepared an estimated offer for you.</p>
      ${customMessage ? `<div style="padding:14px;background:#f8fafc;border-left:4px solid #0d9488;margin:18px 0;">${escapeHtml(customMessage).replace(/\n/g, "<br>")}</div>` : ""}
      <h3 style="border-bottom:1px solid #e2e8f0;padding-bottom:8px;">Offer summary — ${escapeHtml(treatmentLabel)}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="text-align:left;padding:10px;border:1px solid #e2e8f0;">Clinic</th>
            <th style="text-align:left;padding:10px;border:1px solid #e2e8f0;">Treatment</th>
            <th style="text-align:left;padding:10px;border:1px solid #e2e8f0;">Estimated price</th>
          </tr>
        </thead>
        <tbody>${offerRowsHtml}</tbody>
      </table>
      <p style="color:#64748b;font-size:13px;">Prices are estimates and may change after clinical evaluation. This is not an appointment confirmation.</p>
      <p>You can reply to this email with any questions.</p>
      <p style="margin-top:28px;color:#64748b;font-size:14px;">${escapeHtml(agencyName)} · ClinicBridge AI</p>
    </div>
  `;
  const text = [
    `Your treatment offer is ready`,
    ``,
    `Hello ${firstName},`,
    `The ${agencyName} team reviewed your request and prepared an estimated offer for you.`,
    customMessage || "",
    ``,
    `Offer summary — ${treatmentLabel}`,
    offerLinesText,
    ``,
    `Prices are estimates and may change after clinical evaluation.`,
    `${agencyName} · ClinicBridge AI`,
  ]
    .filter((l) => l !== "")
    .join("\n");
  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
