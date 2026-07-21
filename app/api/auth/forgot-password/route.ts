import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getAdminDb } from "@/lib/firebase-admin";
import crypto from "crypto";

// Resend istemcisini yalnızca API key varsa oluştur
const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  const masked = local.length <= 3
    ? local[0] + "***"
    : local.slice(0, 2) + "***" + local.slice(-1);
  return `${masked}@${domain}`;
}

export async function POST(req: Request) {
  const timestamp = new Date().toISOString();
  const env = process.env.NODE_ENV || "unknown";

  try {
    const body = await req.json();
    const { email } = body;

    console.log(`[PASSWORD_RESET_REQUESTED] timestamp=${timestamp} env=${env} email=${email ? maskEmail(email) : "empty"}`);

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Geçerli bir e-posta adresi giriniz." },
        { status: 400 }
      );
    }

    // ── 1. Firebase Admin DB kontrolü ────────────────────────────────────────
    const adminDb = getAdminDb();
    if (!adminDb) {
      console.error(`[PASSWORD_RESET_EMAIL_FAILED] timestamp=${timestamp} env=${env} reason=adminDb_null`);
      return NextResponse.json(
        { error: "Sunucu yapılandırma hatası. Lütfen daha sonra tekrar deneyin." },
        { status: 500 }
      );
    }

    // ── 2. Resend API Key kontrolü ───────────────────────────────────────────
    if (!resend || !resendApiKey) {
      console.error(`[PASSWORD_RESET_EMAIL_FAILED] timestamp=${timestamp} env=${env} reason=RESEND_API_KEY_missing provider=resend`);
      return NextResponse.json(
        { error: "E-posta şu anda gönderilemedi. Lütfen birkaç dakika sonra tekrar deneyin." },
        { status: 503 }
      );
    }

    // ── 3. Kullanıcıyı veritabanında ara (güvenlik: bulunamasa da aynı mesaj) ─
    const normalizedEmail = email.trim().toLowerCase();
    const usersSnap = await adminDb
      .collection("users")
      .where("email", "==", normalizedEmail)
      .limit(1)
      .get();

    if (usersSnap.empty) {
      console.warn(`[PASSWORD_RESET_USER_RESOLVED] timestamp=${timestamp} env=${env} email=${maskEmail(normalizedEmail)} found=false`);
      // Güvenlik: Kullanıcıya "bulunamadı" deme, genel başarı mesajı göster
      return NextResponse.json({ success: true, message: "İşlem tamamlandı." });
    }

    const userDoc = usersSnap.docs[0];
    console.log(`[PASSWORD_RESET_USER_RESOLVED] timestamp=${timestamp} env=${env} email=${maskEmail(normalizedEmail)} found=true uid=${userDoc.id}`);

    // ── 4. Token oluştur ve Firestore'a kaydet ───────────────────────────────
    const token = crypto.randomUUID();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 dakika

    await adminDb.collection("password_reset_tokens").add({
      email: normalizedEmail,
      token,
      expiresAt,
      used: false,
      createdAt: Date.now(),
    });

    console.log(`[PASSWORD_RESET_TOKEN_CREATED] timestamp=${timestamp} env=${env} email=${maskEmail(normalizedEmail)} ttl=15m`);

    // ── 5. E-posta gönderimi ─────────────────────────────────────────────────
    const origin =
      req.headers.get("origin") ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://app.clinicbridge-ai.com";
    const resetLink = `${origin}/reset-password?token=${token}`;

    const fromAddress =
      process.env.EMAIL_FROM || "ClinicBridge <noreply@clinicbridge-ai.com>";

    console.log(`[PASSWORD_RESET_EMAIL_PROVIDER_CALLED] timestamp=${timestamp} env=${env} provider=resend to=${maskEmail(normalizedEmail)} from=${fromAddress}`);

    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: [normalizedEmail],
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
      `,
    });

    // ── 6. Resend hata kontrolü ──────────────────────────────────────────────
    if (error) {
      console.error(
        `[PASSWORD_RESET_EMAIL_FAILED] timestamp=${timestamp} env=${env} provider=resend ` +
        `email=${maskEmail(normalizedEmail)} error_name=${error.name} error_message=${error.message}`
      );
      return NextResponse.json(
        { error: "E-posta şu anda gönderilemedi. Lütfen birkaç dakika sonra tekrar deneyin." },
        { status: 502 }
      );
    }

    // ── 7. Başarılı gönderim ─────────────────────────────────────────────────
    const messageId = (data as any)?.id || "unknown";
    console.log(
      `[PASSWORD_RESET_EMAIL_ACCEPTED] timestamp=${timestamp} env=${env} provider=resend ` +
      `email=${maskEmail(normalizedEmail)} messageId=${messageId}`
    );

    return NextResponse.json({ success: true, message: "Şifre sıfırlama bağlantısı gönderildi." });
  } catch (error: any) {
    console.error(
      `[PASSWORD_RESET_EMAIL_FAILED] timestamp=${timestamp} env=${env} provider=resend ` +
      `error=${error?.message} stack=${error?.stack?.slice(0, 200)}`
    );
    return NextResponse.json(
      { error: "E-posta şu anda gönderilemedi. Lütfen birkaç dakika sonra tekrar deneyin." },
      { status: 500 }
    );
  }
}
