import { NotificationProvider, NotificationPayload, NotificationProviderResult } from './NotificationProvider';
import { NotificationChannel } from '../../../types/notification';
import { Resend } from "resend";

export class ResendEmailProvider implements NotificationProvider {
  channel: NotificationChannel = 'email';
  
  private apiKey: string;
  private defaultFrom: string;

  constructor() {
    this.apiKey = process.env.RESEND_API_KEY || '';
    this.defaultFrom = process.env.EMAIL_FROM || 'no-reply@clinicbridge-ai.com';
  }

  async send(payload: NotificationPayload): Promise<NotificationProviderResult> {
    if (!this.apiKey) {
      console.warn('[ResendEmailProvider] RESEND_API_KEY is missing. Failing instead of simulating success.');
      return {
        success: false,
        attempted: false,
        accepted: false,
        status: "NOT_CONFIGURED",
        errorCode: "API_KEY_MISSING",
        errorMessage: "Missing RESEND_API_KEY",
        rawResponse: 'missing_api_key',
      };
    }

    try {
      let html = payload.variables.htmlContent;
      if (!html) {
          html = this.buildFallbackHtml(payload);
      }

      const resend = new Resend(this.apiKey);
      const emailPayload: any = {
        from: payload.variables.from || this.defaultFrom,
        to: [payload.to],
        subject: payload.subject || 'Notification from ClinicBridge',
        html: html,
      };

      if (payload.variables.replyTo) {
        emailPayload.reply_to = payload.variables.replyTo;
      }

      const { data, error } = await resend.emails.send(emailPayload);

      if (error) {
        return {
          success: false,
          attempted: true,
          accepted: false,
          status: "FAILED",
          errorCode: error.name || "RESEND_ERROR",
          errorMessage: error.message,
          rawResponse: error
        };
      }

      if (!data?.id) {
        return {
          success: false,
          attempted: true,
          accepted: false,
          status: "FAILED",
          errorCode: "PROVIDER_MESSAGE_ID_MISSING",
          errorMessage: "Resend did not return a message ID.",
          rawResponse: data
        };
      }

      return {
        success: true,
        attempted: true,
        accepted: true,
        status: "ACCEPTED",
        messageId: data.id,
        errorCode: null,
        errorMessage: null,
        rawResponse: data,
      };

    } catch (error: any) {
      return {
        success: false,
        attempted: true,
        accepted: false,
        status: "FAILED",
        errorCode: "network_or_internal_error",
        errorMessage: error.message || 'Unknown network error',
      };
    }
  }

  private buildFallbackHtml(payload: NotificationPayload): string {
    const { clinicName, patientName, content } = payload.variables;
    return `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;line-height:1.6;">
        <h2 style="color:#6366f1">Bildirim - ${clinicName || 'ClinicBridge'}</h2>
        <p>Merhaba ${patientName || ''},</p>
        <p>${content || 'Yeni bir bildiriminiz var.'}</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
        <p style="color:#94a3b8;font-size:12px">${clinicName || 'ClinicBridge AI'}</p>
      </div>
    `;
  }
}
