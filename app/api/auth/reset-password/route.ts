import { NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { token, newPassword } = body;

    if (!token || !newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { error: "Geçersiz istek. Token ve en az 6 karakterli yeni şifre gereklidir." },
        { status: 400 }
      );
    }

    if (!adminDb || !adminAuth) {
      return NextResponse.json(
        { error: "Firebase Admin SDK başlatılamadı. Service Account eksik." },
        { status: 500 }
      );
    }

    // 1. Verify Token
    const tokensRef = adminDb.collection("password_reset_tokens");
    const snapshot = await tokensRef.where("token", "==", token).limit(1).get();

    if (snapshot.empty) {
      return NextResponse.json(
        { error: "Bu bağlantı geçersiz veya önceden kullanılmış." },
        { status: 400 }
      );
    }

    const tokenDoc = snapshot.docs[0];
    const tokenData = tokenDoc.data();

    if (Date.now() > tokenData.expiresAt) {
      await tokenDoc.ref.delete();
      return NextResponse.json(
        { error: "Bu şifre sıfırlama bağlantısının süresi dolmuş." },
        { status: 400 }
      );
    }

    // 2. Update Password via Firebase Admin Auth
    const email = tokenData.email;
    try {
      const userRecord = await adminAuth.getUserByEmail(email);
      await adminAuth.updateUser(userRecord.uid, {
        password: newPassword
      });
    } catch (authError: any) {
      console.error("Firebase Admin Auth Update Error:", authError);
      return NextResponse.json(
        { error: "Şifre güncellenirken kullanıcı bulunamadı veya Auth servisinde bir hata oluştu." },
        { status: 500 }
      );
    }

    // 3. Delete the token (Single-use)
    await tokenDoc.ref.delete();

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: any) {
    console.error("Reset password API error:", error);
    const isDev = process.env.NODE_ENV === "development";
    return NextResponse.json(
      { error: isDev ? `Server Error: ${error?.message}` : "Sunucu tarafında bir hata oluştu." }, 
      { status: 500 }
    );
  }
}
