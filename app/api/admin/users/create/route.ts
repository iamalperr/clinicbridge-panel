import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    if (!adminAuth || !adminDb) {
      return NextResponse.json({ error: "Sunucu yapılandırma hatası (Firebase Admin)." }, { status: 500 });
    }

    // 1. Verify Authorization Header
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Yetkisiz erişim. Token bulunamadı." }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch (err) {
      return NextResponse.json({ error: "Geçersiz veya süresi dolmuş token." }, { status: 401 });
    }

    // 2. Verify Admin Role
    console.log(`[AdminAuth] Validating user UID: ${decodedToken.uid}, Email: ${decodedToken.email}`);
    
    let callerDoc = await adminDb.collection("users").where("uid", "==", decodedToken.uid).limit(1).get();
    let callerData = callerDoc.empty ? null : callerDoc.docs[0].data();

    // If Firestore document is missing by UID, try to find by Email (legacy users often have uid: "")
    if (!callerData && decodedToken.email) {
      console.log(`[AdminAuth] UID not found. Falling back to email lookup: ${decodedToken.email}`);
      const callerByEmail = await adminDb.collection("users").where("email", "==", decodedToken.email).limit(1).get();
      
      if (!callerByEmail.empty) {
        callerData = callerByEmail.docs[0].data();
        // Safely sync the missing UID back to the Firestore profile
        await adminDb.collection("users").doc(callerByEmail.docs[0].id).set({ uid: decodedToken.uid }, { merge: true });
        console.log(`[AdminAuth] Synced UID for legacy user profile: ${decodedToken.email}`);
      }
    }

    // Support all possible admin role values across the system
    const adminRoles = ["admin", "platform_admin", "Yönetici", "yonetici"];
    const resolvedRole = callerData?.role || "none";

    console.log(`[AdminAuth] Resolved user role: ${resolvedRole}`);

    if (!callerData || !adminRoles.includes(resolvedRole)) {
      return NextResponse.json({ error: "Bu işlemi yapmak için yönetici (admin) yetkisine sahip olmalısınız." }, { status: 403 });
    }

    // 3. Parse Request Body
    const body = await req.json();
    const { email, name, role, clinicId, password } = body;

    if (!email || !name || !role) {
      return NextResponse.json({ error: "E-posta, isim ve rol alanları zorunludur." }, { status: 400 });
    }

    if (role === "clinicUser" && !clinicId) {
      return NextResponse.json({ error: "Klinik kullanıcısı oluştururken klinik seçimi zorunludur." }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 4. Generate or use password
    const tempPassword = password || crypto.randomBytes(6).toString("hex");

    // 5. Create user in Firebase Auth
    let userRecord;
    try {
      userRecord = await adminAuth.createUser({
        email: normalizedEmail,
        password: tempPassword,
        displayName: name,
        emailVerified: false,
      });
    } catch (err: any) {
      if (err.code === "auth/email-already-exists") {
        console.log(`[Auth] User ${normalizedEmail} already exists in Firebase Auth. Fetching existing user record to sync Firestore profile...`);
        userRecord = await adminAuth.getUserByEmail(normalizedEmail);
      } else {
        console.error("Firebase Auth creation failed:", err);
        return NextResponse.json({ error: `Firebase Auth oluşturma işlemi başarısız: ${err.message}` }, { status: 500 });
      }
    }

    // 6. Generate Password Reset Link (Optional but preferred)
    let resetLink = null;
    try {
      resetLink = await adminAuth.generatePasswordResetLink(normalizedEmail);
    } catch (err) {
      console.warn("Could not generate password reset link:", err);
    }

    // 7. Store user in Firestore
    try {
      const userDocRef = adminDb.collection("users").doc(userRecord.uid);
      await userDocRef.set({
        uid: userRecord.uid,
        email: normalizedEmail,
        name,
        role,
        clinicId: role === "admin" ? null : clinicId,
        status: "active",
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true }); // Use merge in case the document already exists to avoid overwriting everything
    } catch (err: any) {
      console.error("Firestore profile creation failed:", err);
      return NextResponse.json({ error: `Firestore profil oluşturma işlemi başarısız: ${err.message}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Kullanıcı başarıyla oluşturuldu.",
      data: {
        uid: userRecord.uid,
        email: normalizedEmail,
        temporaryPassword: password ? null : tempPassword, // Only return if auto-generated
        resetLink,
      }
    }, { status: 201 });

  } catch (error: any) {
    console.error("Admin user creation error:", error);
    return NextResponse.json(
      { error: "Sunucu hatası: Kullanıcı oluşturulamadı." }, 
      { status: 500 }
    );
  }
}
