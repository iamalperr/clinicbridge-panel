import type { TrialLanguage } from "@/lib/trial/policy";
import type { AdminDigestBuckets, LifecycleClinicSnapshot } from "@/lib/lifecycle/cronSelection";
import type { LifecycleEmailKey } from "@/lib/lifecycle/types";

const SETUP_GUIDE = "https://clinicbridge-ai.com/kurulum-rehberi";
const APP_ORIGIN = "https://app.clinicbridge-ai.com";
const SUPPORT_MAIL = "info@clinicbridge-ai.com";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function footer(language: TrialLanguage, optOutUrl: string): string {
  if (language === "en") {
    return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" /><p style="font-size:12px;color:#64748b">ClinicBridge AI · product emails about your trial setup.<br/><a href="${escapeHtml(optOutUrl)}">Stop non-essential reminders</a></p>`;
  }
  return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" /><p style="font-size:12px;color:#64748b">ClinicBridge AI · deneme kurulumuyla ilgili ürün e-postaları.<br/><a href="${escapeHtml(optOutUrl)}">Zorunlu olmayan hatırlatmaları durdur</a></p>`;
}

export function buildSignupAdminAlert(input: {
  clinicId: string;
  clinicName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  source: string;
}): { subject: string; html: string } {
  return {
    subject: `[Trial] New signup: ${input.clinicName}`,
    html: [
      `<p><strong>${escapeHtml(input.clinicName)}</strong> signed up.</p>`,
      `<ul>`,
      `<li>Clinic ID: ${escapeHtml(input.clinicId)}</li>`,
      `<li>Contact: ${escapeHtml(input.contactName)} · ${escapeHtml(input.contactEmail)} · ${escapeHtml(input.contactPhone)}</li>`,
      `<li>Source: ${escapeHtml(input.source)}</li>`,
      `<li><a href="${APP_ORIGIN}/admin/trials">Open trials board</a></li>`,
      `</ul>`,
    ].join(""),
  };
}

export function buildAdminDigestEmail(input: {
  buckets: AdminDigestBuckets;
  labels?: Record<string, string>;
}): { subject: string; html: string } {
  const label = (id: string) => input.labels?.[id] || id;
  const list = (title: string, ids: string[]) =>
    `<h3>${escapeHtml(title)} (${ids.length})</h3>${
      ids.length
        ? `<ul>${ids.map((id) => `<li>${escapeHtml(label(id))}</li>`).join("")}</ul>`
        : "<p>None</p>"
    }`;
  return {
    subject: `[Trial digest] ${input.buckets.newSignups.length} new · ${input.buckets.stuckNoWidget.length} stuck · ${input.buckets.newlyActivated.length} activated`,
    html: [
      `<p>Daily trial digest (Europe/Istanbul).</p>`,
      list("New signups", input.buckets.newSignups),
      list("Stuck (>24h, no widget)", input.buckets.stuckNoWidget),
      list("Newly activated", input.buckets.newlyActivated),
      list("Trials ending ≤3 days", input.buckets.endingSoon),
      list("Expired yesterday", input.buckets.expiredYesterday),
      `<p><a href="${APP_ORIGIN}/admin/trials">Open /admin/trials</a></p>`,
    ].join(""),
  };
}

export function buildLifecycleClinicEmail(input: {
  key: LifecycleEmailKey;
  language: TrialLanguage;
  clinicName: string;
  contactName: string;
  optOutUrl: string;
  conversationCount?: number;
  appointmentRequestCount?: number;
}): { subject: string; html: string } {
  const clinic = escapeHtml(input.clinicName);
  const name = escapeHtml(input.contactName || "");
  const hello = input.language === "en" ? `Hello${name ? ` ${name}` : ""},` : `Merhaba${name ? ` ${name}` : ""},`;
  const foot = footer(input.language, input.optOutUrl);
  const conv = input.conversationCount ?? 0;
  const appts = input.appointmentRequestCount ?? 0;

  if (input.language === "en") {
    switch (input.key) {
      case "day0_welcome":
        return {
          subject: "Welcome — start your ClinicBridge setup",
          html: `<p>${hello}</p><p>Your 14-day trial for <strong>${clinic}</strong> is active. No payment was taken.</p><p>Follow the setup guide: <a href="${SETUP_GUIDE}">${SETUP_GUIDE}</a></p><p>Or open the wizard: <a href="${APP_ORIGIN}/kurulum">${APP_ORIGIN}/kurulum</a></p>${foot}`,
        };
      case "day1_wizard":
        return {
          subject: "Finish your clinic setup wizard",
          html: `<p>${hello}</p><p>Your wizard for <strong>${clinic}</strong> is still open. Completing treatments, hours, and contact details helps the assistant answer patients.</p><p><a href="${APP_ORIGIN}/kurulum">Continue setup</a> · <a href="${SETUP_GUIDE}">Setup guide</a></p>${foot}`,
        };
      case "day3_widget":
        return {
          subject: "Install the widget on your website",
          html: `<p>${hello}</p><p>Install the ClinicBridge widget on <strong>${clinic}</strong>’s site so patients can chat.</p><ol><li>Open <a href="${APP_ORIGIN}/kurulum">Setup</a> → Install step</li><li>Copy the one-line embed code</li><li>Paste it before <code>&lt;/body&gt;</code> on your site (or send it to your agency)</li></ol><p>Need a short call? Email <a href="mailto:${SUPPORT_MAIL}">${SUPPORT_MAIL}</a>.</p><p><a href="${SETUP_GUIDE}">Platform steps</a></p>${foot}`,
        };
      case "day7_summary":
        return {
          subject: "Your first week with ClinicBridge",
          html: `<p>${hello}</p><p>Week-1 summary for <strong>${clinic}</strong>:</p><ul><li>Conversations: ${conv}</li><li>Appointment requests: ${appts}</li></ul><p>Reply to this email if you want help improving answers or the widget.</p>${foot}`,
        };
      case "day11_ending":
        return {
          subject: "Your trial ends in 3 days",
          html: `<p>${hello}</p><p>The trial for <strong>${clinic}</strong> ends in about 3 days. No payment is taken automatically. Email <a href="mailto:${SUPPORT_MAIL}">${SUPPORT_MAIL}</a> to continue on a package.</p>${foot}`,
        };
      case "day14_ended":
        return {
          subject: "Your trial has ended",
          html: `<p>${hello}</p><p>The trial for <strong>${clinic}</strong> has ended. To keep the assistant online, contact <a href="mailto:${SUPPORT_MAIL}">${SUPPORT_MAIL}</a> and we’ll help you continue.</p>${foot}`,
        };
    }
  }

  switch (input.key) {
    case "day0_welcome":
      return {
        subject: "Hoş geldiniz — kuruluma başlayın",
        html: `<p>${hello}</p><p><strong>${clinic}</strong> için 14 günlük denemeniz aktif. Ödeme alınmadı.</p><p>Kurulum rehberi: <a href="${SETUP_GUIDE}">${SETUP_GUIDE}</a></p><p>Sihirbaz: <a href="${APP_ORIGIN}/kurulum">${APP_ORIGIN}/kurulum</a></p>${foot}`,
      };
    case "day1_wizard":
      return {
        subject: "Kurulum sihirbazını tamamlayın",
        html: `<p>${hello}</p><p><strong>${clinic}</strong> için kurulum henüz bitmedi. Tedavi, saat ve iletişim bilgileri asistanın doğru yanıt vermesini sağlar.</p><p><a href="${APP_ORIGIN}/kurulum">Kuruluma devam</a> · <a href="${SETUP_GUIDE}">Rehber</a></p>${foot}`,
      };
    case "day3_widget":
      return {
        subject: "Widget’ı web sitenize ekleyin",
        html: `<p>${hello}</p><p><strong>${clinic}</strong> sitesine ClinicBridge widget’ını ekleyerek hastaların sohbet etmesini sağlayın.</p><ol><li><a href="${APP_ORIGIN}/kurulum">Kurulum</a> → Kurulum adımı</li><li>Tek satırlık kodu kopyalayın</li><li><code>&lt;/body&gt;</code> öncesine yapıştırın (veya ajansınıza iletin)</li></ol><p>Kısa bir görüşme için <a href="mailto:${SUPPORT_MAIL}">${SUPPORT_MAIL}</a>.</p><p><a href="${SETUP_GUIDE}">Platform adımları</a></p>${foot}`,
      };
    case "day7_summary":
      return {
        subject: "ClinicBridge ile ilk haftanız",
        html: `<p>${hello}</p><p><strong>${clinic}</strong> için 1. hafta özeti:</p><ul><li>Sohbet: ${conv}</li><li>Randevu talebi: ${appts}</li></ul><p>Yanıtları veya widget’ı iyileştirmek için bu e-postaya yanıt verebilirsiniz.</p>${foot}`,
      };
    case "day11_ending":
      return {
        subject: "Deneme süreniz 3 gün sonra bitiyor",
        html: `<p>${hello}</p><p><strong>${clinic}</strong> için deneme yaklaşık 3 gün sonra bitiyor. Otomatik ödeme alınmaz. Devam etmek için <a href="mailto:${SUPPORT_MAIL}">${SUPPORT_MAIL}</a>.</p>${foot}`,
      };
    case "day14_ended":
      return {
        subject: "Deneme süreniz sona erdi",
        html: `<p>${hello}</p><p><strong>${clinic}</strong> için deneme sona erdi. Asistanı açık tutmak için <a href="mailto:${SUPPORT_MAIL}">${SUPPORT_MAIL}</a> adresine yazın.</p>${foot}`,
      };
  }
}

export function digestClinicLabel(clinic: Pick<LifecycleClinicSnapshot, "clinicId"> & { clinicName?: string }): string {
  return clinic.clinicName ? `${clinic.clinicName} (${clinic.clinicId})` : clinic.clinicId;
}
