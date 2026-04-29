import { NextResponse } from "next/server";
import { Resend } from "resend";

/* ─── Try to import Admin SDK (may be null if credentials are missing) ─── */
let adminDb: FirebaseFirestore.Firestore | null = null;
let FieldValue: typeof import("firebase-admin/firestore").FieldValue | null = null;

try {
  const adminModule = require("@/lib/firebase-admin");
  adminDb = adminModule.adminDb;
  FieldValue = require("firebase-admin/firestore").FieldValue;
} catch {
  console.warn("[DemoRequest API] Firebase Admin SDK not available, using REST API fallback.");
}

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

    if (adminDb && FieldValue) {
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

    /* ─── Notification e-mail (best-effort) ────────────────── */
    try {
      if (process.env.RESEND_API_KEY) {
        const notifyTo = process.env.DEMO_NOTIFY_EMAIL || "info@clinicbridge-ai.com";

        await resend.emails.send({
          from: process.env.EMAIL_FROM || "no-reply@clinicbridge-ai.com",
          to: [notifyTo],
          subject: `Yeni Demo Talebi: ${clinicName}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1e293b">
              <h2 style="color:#6366f1;margin-bottom:24px">Yeni Demo Talebi</h2>
              <table style="width:100%;border-collapse:collapse">
                <tr><td style="padding:8px 12px;font-weight:600;color:#475569">Ad Soyad</td><td style="padding:8px 12px">${fullName}</td></tr>
                <tr style="background:#f8fafc"><td style="padding:8px 12px;font-weight:600;color:#475569">Klinik Adı</td><td style="padding:8px 12px">${clinicName}</td></tr>
                <tr><td style="padding:8px 12px;font-weight:600;color:#475569">Telefon</td><td style="padding:8px 12px">${phone || "—"}</td></tr>
                <tr style="background:#f8fafc"><td style="padding:8px 12px;font-weight:600;color:#475569">E-posta</td><td style="padding:8px 12px">${email || "—"}</td></tr>
                <tr><td style="padding:8px 12px;font-weight:600;color:#475569">Web Sitesi</td><td style="padding:8px 12px">${website || "—"}</td></tr>
                <tr style="background:#f8fafc"><td style="padding:8px 12px;font-weight:600;color:#475569">Mesaj</td><td style="padding:8px 12px">${message || "—"}</td></tr>
              </table>
              <p style="margin-top:24px;font-size:12px;color:#94a3b8">&copy; ${new Date().getFullYear()} ClinicBridge AI</p>
            </div>
          `,
        });
        console.log("[DemoRequest API] Notification email sent.");
      }
    } catch (emailErr) {
      // E-mail failure is non-blocking — the demo request is already saved.
      console.error("[DemoRequest API] Notification email failed (non-blocking):", emailErr);
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
