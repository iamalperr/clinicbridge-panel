import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ error: "Token eksik." }, { status: 400 });
    }

    const tokensRef = adminDb!.collection("password_reset_tokens");
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
      // Delete expired token to keep DB clean
      await tokenDoc.ref.delete();
      return NextResponse.json(
        { error: "Bu şifre sıfırlama bağlantısının süresi dolmuş. Lütfen yeni bir talep oluşturun." },
        { status: 400 }
      );
    }

    return NextResponse.json({ email: tokenData.email }, { status: 200 });

  } catch (error: any) {
    console.error("Verify token error:", error);
    const isDev = process.env.NODE_ENV === "development";
    return NextResponse.json(
      { error: isDev ? `Server Error: ${error?.message}` : "Sunucu tarafında bir hata oluştu." }, 
      { status: 500 }
    );
  }
}
