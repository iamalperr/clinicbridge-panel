import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import {
  PASSWORD_RESET_COLLECTION,
  PASSWORD_RESET_GENERIC_SUCCESS_MESSAGE,
  PASSWORD_RESET_TTL_MS,
  buildPasswordResetLink,
  generateRawResetToken,
  getPasswordResetFromAddress,
  hashResetToken,
  logPasswordReset,
  maskEmail,
  normalizeResetEmail,
  type PasswordResetTokenRecord,
} from "@/lib/auth/passwordReset";
import {
  buildForgotPasswordRateLimitKey,
  consumePasswordResetRateLimit,
  extractClientIp,
} from "@/lib/auth/passwordResetRateLimit";

function genericSuccess() {
  return NextResponse.json({
    success: true,
    message: PASSWORD_RESET_GENERIC_SUCCESS_MESSAGE,
  });
}

export async function POST(req: Request) {
  const timestamp = new Date().toISOString();
  const env = process.env.NODE_ENV || "unknown";

  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Geçerli bir e-posta adresi giriniz." },
        { status: 400 }
      );
    }

    const normalizedEmail = normalizeResetEmail(body?.email);
    if (!normalizedEmail) {
      return NextResponse.json(
        { error: "Geçerli bir e-posta adresi giriniz." },
        { status: 400 }
      );
    }

    const ip = extractClientIp(req);
    const rateKey = buildForgotPasswordRateLimitKey(ip, normalizedEmail);
    const rate = consumePasswordResetRateLimit(rateKey);
    if (!rate.allowed) {
      logPasswordReset("PASSWORD_RESET_RATE_LIMITED", {
        timestamp,
        env,
        email: maskEmail(normalizedEmail),
        retryAfterSec: rate.retryAfterSec,
      });
      return NextResponse.json(
        {
          error: "Çok fazla deneme yapıldı. Lütfen bir süre sonra tekrar deneyin.",
        },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSec) },
        }
      );
    }

    logPasswordReset("PASSWORD_RESET_REQUESTED", {
      timestamp,
      env,
      email: maskEmail(normalizedEmail),
    });

    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();

    // Missing infra → generic success (no enumeration / no config leak)
    if (!adminAuth || !adminDb) {
      logPasswordReset("PASSWORD_RESET_USER_LOOKUP_FAILED", {
        timestamp,
        env,
        reason: !adminAuth ? "adminAuth_null" : "adminDb_null",
        email: maskEmail(normalizedEmail),
      });
      return genericSuccess();
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      logPasswordReset("PASSWORD_RESET_EMAIL_PROVIDER_FAILED", {
        timestamp,
        env,
        reason: "RESEND_API_KEY_missing",
        provider: "resend",
        email: maskEmail(normalizedEmail),
      });
      return genericSuccess();
    }

    // ── User lookup via Admin Auth (no Firestore users query) ───────────────
    let userId: string | null = null;
    try {
      const userRecord = await adminAuth.getUserByEmail(normalizedEmail);
      userId = userRecord.uid;
      logPasswordReset("PASSWORD_RESET_USER_RESOLVED", {
        timestamp,
        env,
        email: maskEmail(normalizedEmail),
        found: true,
      });
    } catch (err: any) {
      const code = err?.code || "";
      if (code === "auth/user-not-found") {
        logPasswordReset("PASSWORD_RESET_USER_RESOLVED", {
          timestamp,
          env,
          email: maskEmail(normalizedEmail),
          found: false,
        });
        return genericSuccess();
      }
      logPasswordReset("PASSWORD_RESET_USER_LOOKUP_FAILED", {
        timestamp,
        env,
        email: maskEmail(normalizedEmail),
        reason: code || err?.message || "unknown",
      });
      return genericSuccess();
    }

    if (!userId) {
      return genericSuccess();
    }

    // ── Create hashed token document ────────────────────────────────────────
    const rawToken = generateRawResetToken();
    const tokenHash = hashResetToken(rawToken);
    const now = Date.now();
    const record: PasswordResetTokenRecord = {
      userId,
      email: normalizedEmail,
      expiresAt: now + PASSWORD_RESET_TTL_MS,
      createdAt: now,
      used: false,
      status: "active",
    };

    try {
      await adminDb.collection(PASSWORD_RESET_COLLECTION).doc(tokenHash).set(record);
      logPasswordReset("PASSWORD_RESET_TOKEN_CREATED", {
        timestamp,
        env,
        email: maskEmail(normalizedEmail),
        ttlMinutes: PASSWORD_RESET_TTL_MS / 60000,
      });
    } catch (err: any) {
      logPasswordReset("PASSWORD_RESET_TOKEN_CREATE_FAILED", {
        timestamp,
        env,
        email: maskEmail(normalizedEmail),
        reason: err?.message || "unknown",
      });
      return genericSuccess();
    }

    // ── Send email (failures still return generic success) ──────────────────
    const resetLink = buildPasswordResetLink(rawToken);
    const fromAddress = getPasswordResetFromAddress();
    const resend = new Resend(resendApiKey);

    try {
      logPasswordReset("PASSWORD_RESET_EMAIL_PROVIDER_CALLED", {
        timestamp,
        env,
        provider: "resend",
        email: maskEmail(normalizedEmail),
      });

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

      if (error) {
        logPasswordReset("PASSWORD_RESET_EMAIL_PROVIDER_FAILED", {
          timestamp,
          env,
          provider: "resend",
          email: maskEmail(normalizedEmail),
          reason: error.name || "resend_error",
          detail: error.message,
        });
        return genericSuccess();
      }

      logPasswordReset("PASSWORD_RESET_EMAIL_ACCEPTED", {
        timestamp,
        env,
        provider: "resend",
        email: maskEmail(normalizedEmail),
        messageId: (data as any)?.id || "unknown",
      });
    } catch (err: any) {
      logPasswordReset("PASSWORD_RESET_EMAIL_PROVIDER_FAILED", {
        timestamp,
        env,
        provider: "resend",
        email: maskEmail(normalizedEmail),
        reason: err?.message || "exception",
      });
      return genericSuccess();
    }

    return genericSuccess();
  } catch (error: any) {
    logPasswordReset("PASSWORD_RESET_EMAIL_PROVIDER_FAILED", {
      timestamp,
      env,
      reason: error?.message || "unexpected",
    });
    // Still generic — never leak infra failures as distinguishable client errors
    return genericSuccess();
  }
}
