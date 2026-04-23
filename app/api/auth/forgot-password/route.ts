import { NextResponse } from "next/server";
import { Resend } from "resend";

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

    // Mock reset link (since firebase-admin is not installed to generate a real one)
    const resetLink = `https://clinicbridge-ai.com/reset-password?token=mock_token_${Date.now()}`;

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
              Hesabınızın şifresini sıfırlamak için bir talep aldık. Şifrenizi güvenli bir şekilde yenilemek için aşağıdaki butona tıklayabilirsiniz.
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
      console.error("Resend error:", error);
      return NextResponse.json({ error: "E-posta gönderilirken bir hata oluştu." }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "Sunucu tarafında bir hata oluştu." },
      { status: 500 }
    );
  }
}
