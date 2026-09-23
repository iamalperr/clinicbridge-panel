import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import {
  PASSWORD_RESET_COLLECTION,
  hashResetToken,
  isTokenConsumable,
  isTokenExpired,
  logPasswordReset,
  maskEmail,
  type PasswordResetTokenRecord,
} from "@/lib/auth/passwordReset";

const INVALID_TOKEN_MESSAGE =
  "Bu bağlantı geçersiz veya süresi dolmuş. Lütfen yeni bir talep oluşturun.";

/**
 * Consume ordering (replay / concurrency safe):
 * 1) Firestore transaction: ACTIVE (+ reclaim stale PROCESSING) → PROCESSING
 * 2) Admin Auth updateUser (external — outside transaction)
 * 3) Mark USED on success
 * 4) Revert PROCESSING → ACTIVE on Auth failure so the user can retry
 */
export async function POST(req: Request) {
  const timestamp = new Date().toISOString();

  try {
    const body = await req.json();
    const rawToken = typeof body?.token === "string" ? body.token.trim() : "";
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

    if (!rawToken || rawToken.length > 200 || !newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { error: "Geçersiz istek. Token ve en az 6 karakterli yeni şifre gereklidir." },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();
    const adminAuth = getAdminAuth();
    if (!adminDb || !adminAuth) {
      logPasswordReset("PASSWORD_RESET_APPLY_FAILED", {
        timestamp,
        reason: !adminDb ? "adminDb_null" : "adminAuth_null",
      });
      return NextResponse.json({ error: "Sunucu yapılandırma hatası." }, { status: 500 });
    }

    const tokenHash = hashResetToken(rawToken);
    const tokenRef = adminDb.collection(PASSWORD_RESET_COLLECTION).doc(tokenHash);

    let userId = "";
    let email = "";

    try {
      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(tokenRef);
        if (!snap.exists) {
          throw Object.assign(new Error("invalid_token"), { code: "invalid_token" });
        }
        const data = snap.data() as PasswordResetTokenRecord;
        const now = Date.now();
        const check = isTokenConsumable(data, now);
        if (!check.ok) {
          throw Object.assign(new Error(check.reason), { code: check.reason });
        }
        if (isTokenExpired(data.expiresAt, now)) {
          throw Object.assign(new Error("expired"), { code: "expired" });
        }

        userId = data.userId;
        email = data.email;

        tx.update(tokenRef, {
          status: "processing",
          processingStartedAt: now,
          used: false,
        });
      });
    } catch (err: any) {
      const code = err?.code || "";
      if (
        code === "invalid_token" ||
        code === "used" ||
        code === "expired" ||
        code === "processing" ||
        code === "missing"
      ) {
        return NextResponse.json({ error: INVALID_TOKEN_MESSAGE }, { status: 400 });
      }
      logPasswordReset("PASSWORD_RESET_APPLY_FAILED", {
        timestamp,
        reason: "transaction_failed",
        detail: err?.message || "unknown",
      });
      return NextResponse.json({ error: "Sunucu tarafında bir hata oluştu." }, { status: 500 });
    }

    // External Auth side effect — outside transaction
    try {
      await adminAuth.updateUser(userId, { password: newPassword });
    } catch (authError: any) {
      logPasswordReset("PASSWORD_RESET_APPLY_FAILED", {
        timestamp,
        reason: "auth_update_failed",
        detail: authError?.code || authError?.message || "unknown",
      });
      // Revert so a legitimate retry can proceed
      try {
        await tokenRef.update({
          status: "active",
          processingStartedAt: FieldValue.delete(),
          used: false,
        });
      } catch (revertErr: any) {
        logPasswordReset("PASSWORD_RESET_APPLY_FAILED", {
          timestamp,
          reason: "revert_processing_failed",
          detail: revertErr?.message || "unknown",
        });
      }
      return NextResponse.json(
        { error: "Şifre güncellenirken bir hata oluştu. Lütfen tekrar deneyin." },
        { status: 500 }
      );
    }

    // Mark consumed
    try {
      await tokenRef.set(
        {
          status: "used",
          used: true,
          processingStartedAt: FieldValue.delete(),
          consumedAt: Date.now(),
          userId,
          email,
        },
        { merge: true }
      );
    } catch (markErr: any) {
      // Password already changed — log; token may remain PROCESSING until timeout reclaim
      logPasswordReset("PASSWORD_RESET_APPLY_FAILED", {
        timestamp,
        reason: "mark_used_failed",
        detail: markErr?.message || "unknown",
      });
    }

    logPasswordReset("PASSWORD_RESET_APPLIED", {
      timestamp,
      email: email ? maskEmail(email) : "unknown",
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    logPasswordReset("PASSWORD_RESET_APPLY_FAILED", {
      timestamp,
      reason: error?.message || "unexpected",
    });
    return NextResponse.json({ error: "Sunucu tarafında bir hata oluştu." }, { status: 500 });
  }
}
