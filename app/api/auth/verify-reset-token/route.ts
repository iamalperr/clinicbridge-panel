import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  PASSWORD_RESET_COLLECTION,
  hashResetToken,
  isTokenConsumable,
  logPasswordReset,
  type PasswordResetTokenRecord,
} from "@/lib/auth/passwordReset";

const INVALID_TOKEN_MESSAGE =
  "Bu bağlantı geçersiz veya süresi dolmuş. Lütfen yeni bir talep oluşturun.";

export async function POST(req: Request) {
  const timestamp = new Date().toISOString();

  try {
    const body = await req.json();
    const rawToken = typeof body?.token === "string" ? body.token.trim() : "";

    if (!rawToken || rawToken.length > 200) {
      return NextResponse.json({ error: "Token eksik." }, { status: 400 });
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      logPasswordReset("PASSWORD_RESET_VERIFY_FAILED", {
        timestamp,
        reason: "adminDb_null",
      });
      return NextResponse.json({ error: "Sunucu yapılandırma hatası." }, { status: 500 });
    }

    const tokenHash = hashResetToken(rawToken);
    let snap;
    try {
      snap = await adminDb.collection(PASSWORD_RESET_COLLECTION).doc(tokenHash).get();
    } catch (err: any) {
      logPasswordReset("PASSWORD_RESET_VERIFY_FAILED", {
        timestamp,
        reason: "firestore_get_failed",
        detail: err?.message || "unknown",
      });
      return NextResponse.json({ error: "Sunucu tarafında bir hata oluştu." }, { status: 500 });
    }

    if (!snap.exists) {
      // Legacy auto-ID + raw-token documents are not queryable by design.
      // They expire within the existing 15-minute TTL.
      return NextResponse.json({ error: INVALID_TOKEN_MESSAGE }, { status: 400 });
    }

    const data = snap.data() as PasswordResetTokenRecord;
    const check = isTokenConsumable(data);
    if (!check.ok) {
      if (check.reason === "expired") {
        try {
          await snap.ref.delete();
        } catch {
          // ignore cleanup failure
        }
      }
      return NextResponse.json({ error: INVALID_TOKEN_MESSAGE }, { status: 400 });
    }

    return NextResponse.json({ email: data.email }, { status: 200 });
  } catch (error: any) {
    logPasswordReset("PASSWORD_RESET_VERIFY_FAILED", {
      timestamp,
      reason: error?.message || "unexpected",
    });
    return NextResponse.json({ error: "Sunucu tarafında bir hata oluştu." }, { status: 500 });
  }
}
