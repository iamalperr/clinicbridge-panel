import { NotificationProvider, NotificationPayload, NotificationProviderResult } from './NotificationProvider';
import { NotificationChannel } from '../../../types/notification';

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
      console.warn('[ResendEmailProvider] RESEND_API_KEY is missing. Simulating success.');
      return {
        success: true,
        messageId: `simulated_${Date.now()}`,
        rawResponse: 'simulated',
      };
    }

    try {
      // Build the email HTML. We'll improve this with a robust template engine later.
      // For now, we use a basic fallback template.
      let html = payload.variables.htmlContent;
      if (!html) {
          html = this.buildFallbackHtml(payload);
      }

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: payload.variables.from || this.defaultFrom,
          reply_to: payload.variables.replyTo,
          to: [payload.to],
          subject: payload.subject || 'Notification from ClinicBridge',
          html: html,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        return {
          success: false,
          error: data.message || JSON.stringify(data),
          rawResponse: data
        };
      }

      return {
        success: true,
        messageId: data.id,
        rawResponse: data
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Unknown network error',
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
