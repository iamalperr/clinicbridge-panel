import { NextResponse } from "next/server";
import { Resend } from "resend";
import { adminDb } from "@/lib/firebase-admin";
import crypto from "crypto";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = body;

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Geçerli bir e-posta adresi giriniz." },
        { status: 400 }
      );
    }

    // Generate token and expiration (15 minutes)
    const token = crypto.randomUUID();
    const expiresAt = Date.now() + 15 * 60 * 1000;

    // Store in Firestore
    await adminDb!.collection("password_reset_tokens").add({
      email,
      token,
      expiresAt
    });

    const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "https://clinicbridge-ai.com";
    const resetLink = `${origin}/reset-password?token=${token}`;

    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || "no-reply@clinicbridge-ai.com",
      to: [email],
      subject: "ClinicBridge - Şifre Sıfırlama Talebi",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h2 style="color: #6366f1; margin: 0;">ClinicBridge</h2>
          </div>
          
          <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
            <h3 style="margin-top: 0; font-size: 20px; color: #0f172a;">Şifrenizi Sıfırlayın</h3>
            <p style="font-size: 15px; line-height: 1.6; color: #475569;">
              Merhaba,<br/><br/>
              Hesabınızın şifresini sıfırlamak için bir talep aldık. Şifrenizi güvenli bir şekilde yenilemek için aşağıdaki butona tıklayabilirsiniz. Bu bağlantı 15 dakika boyunca geçerlidir.
            </p>
            
            <div style="text-align: center; margin: 32px 0;">
              <a href="${resetLink}" style="background-color: #6366f1; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
                Şifremi Sıfırla
              </a>
            </div>
            
            <p style="font-size: 14px; color: #64748b; margin-bottom: 0;">
              Eğer bu talebi siz oluşturmadıysanız, bu e-postayı görmezden gelebilirsiniz. Güvenliğiniz için şifrenizi kimseyle paylaşmayın.
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 24px; font-size: 12px; color: #94a3b8;">
            &copy; ${new Date().getFullYear()} ClinicBridge AI. Tüm hakları saklıdır.
          </div>
        </div>
      `
    });

    if (error) {
      console.error("Resend Response Error Details:", { message: error.message, name: error.name, fullError: error });
      const isDev = process.env.NODE_ENV === "development";
      return NextResponse.json({ error: isDev ? `Resend Error: ${error.message}` : "E-posta gönderilirken bir hata oluştu." }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Forgot password error:", error);
    const isDev = process.env.NODE_ENV === "development";
    return NextResponse.json({ error: isDev ? `Server Error: ${error?.message}` : "Sunucu tarafında bir hata oluştu." }, { status: 500 });
  }
}
