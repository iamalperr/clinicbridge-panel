export function buildWelcomeEmail(input: {
  language: "tr" | "en";
  name: string;
  clinicName: string;
  verificationLink: string | null;
}): { subject: string; html: string } {
  const safeName = escapeHtml(input.name);
  const safeClinic = escapeHtml(input.clinicName);
  const link = input.verificationLink ? escapeHtml(input.verificationLink) : "";
  if (input.language === "en") {
    return {
      subject: "Welcome to ClinicBridge AI",
      html: [
        `<p>Hello ${safeName},</p>`,
        `<p>Your clinic account for <strong>${safeClinic}</strong> is ready. The 14-day trial has started. No payment has been taken.</p>`,
        link ? `<p><a href="${link}">Verify your email</a></p>` : "",
        `<p>You can sign in at <a href="https://app.clinicbridge-ai.com/login">app.clinicbridge-ai.com</a>.</p>`,
      ].join(""),
    };
  }
  return {
    subject: "ClinicBridge AI'a hoş geldiniz",
    html: [
      `<p>Merhaba ${safeName},</p>`,
      `<p><strong>${safeClinic}</strong> için klinik hesabınız hazır. 14 günlük deneme başladı. Ödeme alınmadı.</p>`,
      link ? `<p><a href="${link}">E-posta adresinizi doğrulayın</a></p>` : "",
      `<p><a href="https://app.clinicbridge-ai.com/login">app.clinicbridge-ai.com</a> adresinden giriş yapabilirsiniz.</p>`,
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
