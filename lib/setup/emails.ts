import { buildWidgetEmbedCode } from "@/lib/widget/embedCode";

export function buildLiveBotEmail(input: { language: "tr" | "en"; clinicName: string; domain: string }): { subject: string; html: string } {
  const clinic = escapeHtml(input.clinicName);
  const domain = escapeHtml(input.domain);
  if (input.language === "en") {
    return {
      subject: "Your bot is live",
      html: `<p>The ClinicBridge assistant for <strong>${clinic}</strong> is live on <strong>${domain}</strong>.</p>`,
    };
  }
  return {
    subject: "Botunuz yayında",
    html: `<p><strong>${clinic}</strong> için ClinicBridge asistanı <strong>${domain}</strong> adresinde yayında.</p>`,
  };
}

export function buildAgencyInstallEmail(input: {
  language: "tr" | "en";
  clinicName: string;
  clinicId: string;
}): { subject: string; html: string } {
  const clinic = escapeHtml(input.clinicName);
  const code = escapeHtml(buildWidgetEmbedCode(input.clinicId));
  if (input.language === "en") {
    return {
      subject: `Add the ClinicBridge assistant to ${input.clinicName}`,
      html: [
        `<p>Please add this snippet before the closing body tag on the <strong>${clinic}</strong> website.</p>`,
        `<pre>${code}</pre>`,
        "<p>After it is published, the clinic can confirm the assistant is live.</p>",
      ].join(""),
    };
  }
  return {
    subject: `${input.clinicName} sitesine ClinicBridge asistanını ekleyin`,
    html: [
      `<p><strong>${clinic}</strong> sitesinde kapanış body etiketinden önce şu kodu eklemenizi rica ederiz.</p>`,
      `<pre>${code}</pre>`,
      "<p>Yayınlandıktan sonra klinik, asistanın yayında olduğunu görebilir.</p>",
    ].join(""),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
