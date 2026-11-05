import { Resend } from "resend";
import { getPasswordResetFromAddress } from "@/lib/auth/passwordReset";

export async function sendClinicEmail(input: { to: string; subject: string; html: string }): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.to)) return false;
  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: getPasswordResetFromAddress(),
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    return !error;
  } catch {
    return false;
  }
}
