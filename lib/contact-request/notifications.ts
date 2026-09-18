/**
 * Clinic email notification for Contact Request creation.
 * Distinct from appointment.request.created — never masquerades as an appointment.
 */

import { notificationService } from "@/lib/services/notifications/NotificationService";
import type { ContactRequest, PreferredContactMethod } from "./types";

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function methodDisplay(method: PreferredContactMethod): string {
  switch (method) {
    case "sms":
      return "Text / SMS";
    case "whatsapp":
      return "WhatsApp";
    case "phone":
      return "Phone call";
    case "email":
      return "Email";
    default:
      return "Unspecified";
  }
}

export function buildClinicContactRequestEmailHtml(params: {
  clinicName: string;
  request: ContactRequest;
}): string {
  const r = params.request;
  const rows: Array<[string, string]> = [
    ["Patient", r.patientName || "Not provided"],
    ["Phone", r.patientPhone || "Not provided"],
    ["Email", r.patientEmail || "Not provided"],
    ["Preferred contact method", methodDisplay(r.preferredContactMethod)],
    ["Patient request", r.patientNote || "—"],
    ["Language", (r.language || "—").toUpperCase()],
    ["Source", r.source || "AI Assistant"],
    ["Channel", r.channel || "—"],
    ["Conversation", r.conversationId || "—"],
    ["Request ID", r.id],
    ["Status", r.status],
  ];

  const tableRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:10px;background:#f8fafc;font-weight:600;width:190px">${escapeHtml(
          label
        )}</td><td style="padding:10px;border-bottom:1px solid #e2e8f0">${escapeHtml(
          value
        )}</td></tr>`
    )
    .join("");

  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;line-height:1.6;">
      <h2 style="color:#0f766e">New Patient Contact Request</h2>
      <p><strong>${escapeHtml(params.clinicName)}</strong> — a patient asked the AI assistant to forward a contact / human handoff request.</p>
      <table style="width:100%;border-collapse:collapse;margin:24px 0">
        ${tableRows}
      </table>
      <p style="color:#64748b;font-size:14px">
        Please review this request in your <a href="https://app.clinicbridge-ai.com" style="color:#0f766e">ClinicBridge panel</a> (Conversation Records).
      </p>
      <p style="color:#94a3b8;font-size:12px">
        Preferred method is the patient's stated preference — it does not guarantee that channel is available from the clinic.
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
      <p style="color:#94a3b8;font-size:12px">ClinicBridge AI</p>
    </div>
  `;
}

export async function sendClinicContactRequestEmail(params: {
  clinicId: string;
  clinicName: string;
  clinicEmails: string[];
  request: ContactRequest;
}): Promise<{ success: boolean; error?: string }> {
  const html = buildClinicContactRequestEmailHtml({
    clinicName: params.clinicName,
    request: params.request,
  });

  let allSuccess = true;
  let lastError: string | undefined;

  for (const email of params.clinicEmails) {
    if (!email) continue;
    const result = await notificationService.sendNotification(
      {
        tenant_id: "legacy",
        clinic_id: params.clinicId,
        event_type: 'contact_request.created',
        channel: 'email',
        recipient: email,
        idempotency_key: `contact_request_email:${params.request.id}:${email}`,
      },
      {
        language: 'en',
        subject: `New Patient Contact Request – ${params.clinicName}`,
        variables: {
          htmlContent: html,
        },
      }
    );
    if (!result.success) {
      allSuccess = false;
      lastError = result.error;
    }
  }

  return { success: allSuccess, error: lastError };
}
