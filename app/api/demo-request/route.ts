import { NextResponse } from "next/server";
import { Resend } from "resend";

import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";


const resend = new Resend(process.env.RESEND_API_KEY);

/* ─── Firestore REST API fallback ─────────────────────────────────────── */
async function writeViaRestApi(docData: Record<string, string>): Promise<string> {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  if (!projectId || !apiKey) {
    throw new Error("Firebase projectId or apiKey is not configured.");
  }

  // Convert plain object to Firestore REST format
  const fields: Record<string, { stringValue: string } | { timestampValue: string }> = {};
  for (const [key, value] of Object.entries(docData)) {
    fields[key] = { stringValue: value };
  }
  // Add server timestamp as ISO string
  fields.createdAt = { timestampValue: new Date().toISOString() };

  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/demoRequests?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error("[DemoRequest API] Firestore REST error:", res.status, errBody);
    throw new Error(`Firestore REST API error: ${res.status}`);
  }

  const result = await res.json();
  // Extract document ID from name like "projects/.../documents/demoRequests/ABC123"
  const docId = result.name?.split("/").pop() || "unknown";
  return docId;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { fullName, clinicName, phone, email, website, message } = body;

    /* ─── Validation ───────────────────────────────────────── */
    if (!fullName?.trim()) {
      return NextResponse.json(
        { error: "Ad Soyad zorunludur." },
        { status: 400 }
      );
    }

    if (!clinicName?.trim()) {
      return NextResponse.json(
        { error: "Klinik Adı zorunludur." },
        { status: 400 }
      );
    }

    if (!phone?.trim() && !email?.trim()) {
      return NextResponse.json(
        { error: "Telefon veya e-posta alanlarından en az biri zorunludur." },
        { status: 400 }
      );
    }

    if (email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Geçerli bir e-posta adresi girin." },
        { status: 400 }
      );
    }

    /* ─── Sanitised payload ────────────────────────────────── */
    const sanitised = {
      fullName: fullName.trim(),
      clinicName: clinicName.trim(),
      phone: phone?.trim() || "",
      email: email?.trim() || "",
      website: website?.trim() || "",
      message: message?.trim() || "",
      source: "landing",
      status: "new",
    };

    /* ─── Write to Firestore ───────────────────────────────── */
    let docId: string;

    const adminDb = getAdminDb();
    if (adminDb) {
      // Preferred: use Admin SDK (bypasses security rules)
      const docRef = await adminDb.collection("demoRequests").add({
        ...sanitised,
        createdAt: FieldValue.serverTimestamp(),
      });
      docId = docRef.id;
      console.log("[DemoRequest API] Created via Admin SDK:", docId);
    } else {
      // Fallback: use Firestore REST API (respects security rules, but works for open collections)
      docId = await writeViaRestApi(sanitised);
      console.log("[DemoRequest API] Created via REST API fallback:", docId);
    }


    /* ─── Notification e-mail ──────────────────────────────── */
    if (!process.env.RESEND_API_KEY) {
      console.error("[DemoRequest API] RESEND_API_KEY eksik.");
      throw new Error("Email configuration is missing.");
    }

    try {
      const notifyTo = process.env.DEMO_NOTIFY_EMAIL || "info@clinicbridge-ai.com";
      const fromEmail = process.env.EMAIL_FROM || "ClinicBridge AI Tech <info@clinicbridge-ai.com>";
      const requestDate = new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });

      const emailText = `Yeni bir demo talebi alındı.

Ad Soyad: ${sanitised.fullName}
Klinik Adı: ${sanitised.clinicName}
Telefon: ${sanitised.phone || "-"}
E-posta: ${sanitised.email || "-"}
Web Sitesi: ${sanitised.website || "-"}
Mesaj: ${sanitised.message || "-"}

Talep Tarihi: ${requestDate}`;

      const emailPayload: any = {
        from: fromEmail,
        to: [notifyTo],
        subject: `Yeni Demo Talebi - ${sanitised.clinicName}`,
        text: emailText,
      };

      if (sanitised.email) {
        emailPayload.reply_to = sanitised.email;
      }

      const { data, error } = await resend.emails.send(emailPayload);

      if (error) {
        console.error("[DemoRequest API] Resend email error:", error);
        throw new Error(`Email send failed: ${error.message}`);
      }

      console.log("[DemoRequest API] Notification email sent:", data?.id);
    } catch (emailErr) {
      console.error("[DemoRequest API] Notification email failed:", emailErr);
      throw emailErr; // Bloğu durdur ve catch (error) bloğuna düşerek 500 dön.
    }

    return NextResponse.json({ success: true, id: docId });
  } catch (error: unknown) {
    console.error("[DemoRequest API] Unexpected error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "development"
            ? `Server Error: ${msg}`
            : "Sunucu tarafında bir hata oluştu.",
      },
      { status: 500 }
    );
  }
}
