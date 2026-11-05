import type { TrialLanguage, TrialReminder, UsageNotice } from "@/lib/trial/policy";

export function buildTrialReminderEmail(input: {
  language: TrialLanguage;
  clinicName: string;
  reminder: TrialReminder;
}): { subject: string; html: string } {
  const clinic = escapeHtml(input.clinicName);
  if (input.language === "en") {
    const when = input.reminder === "3" ? "in 3 days" : "tomorrow";
    return {
      subject: input.reminder === "3" ? "Your trial ends in 3 days" : "Your trial ends tomorrow",
      html: `<p>The trial for <strong>${clinic}</strong> ends ${when}. No payment is taken now. Contact us to choose a package.</p>`,
    };
  }
  const when = input.reminder === "3" ? "3 gün sonra" : "yarın";
  return {
    subject: input.reminder === "3" ? "Deneme süreniz 3 gün sonra bitiyor" : "Deneme süreniz yarın bitiyor",
    html: `<p><strong>${clinic}</strong> için deneme süresi ${when} bitiyor. Ödeme şu an alınmaz. Paket seçmek için bizimle iletişime geçin.</p>`,
  };
}

export function buildUsageWarningEmail(input: {
  language: TrialLanguage;
  clinicName: string;
  notice: UsageNotice;
  count: number;
  limit: number;
}): { subject: string; html: string } {
  const clinic = escapeHtml(input.clinicName);
  const usage = `${input.count}/${input.limit}`;
  if (input.language === "en") {
    if (input.notice === "100") {
      return {
        subject: "Your monthly conversations are full",
        html: `<p><strong>${clinic}</strong> has used ${usage} conversations this month. Contact us to upgrade your plan. The assistant stays open for patients.</p>`,
      };
    }
    return {
      subject: "80% of your monthly conversations are used",
      html: `<p><strong>${clinic}</strong> has used ${usage} conversations this month. Contact us to choose a package. The assistant stays open for patients.</p>`,
    };
  }
  if (input.notice === "100") {
    return {
      subject: "Aylık sohbet hakkınız doldu",
      html: `<p><strong>${clinic}</strong> bu ay ${usage} sohbet kullandı. Paketinizi yükseltmek için bizimle iletişime geçin. Asistan hastalar için açık kalır.</p>`,
    };
  }
  return {
    subject: "Aylık sohbet hakkınızın %80'i kullanıldı",
    html: `<p><strong>${clinic}</strong> bu ay ${usage} sohbet kullandı. Paket seçmek için bizimle iletişime geçin. Asistan hastalar için açık kalır.</p>`,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
