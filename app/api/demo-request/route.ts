import { NextResponse } from "next/server";
import { Resend } from "resend";

import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import {
  formatDemoAttributionEmailSection,
  sanitizeAttributionPayload,
} from "@/lib/attribution";
import { stripUndefinedDeep } from "@/lib/firestore/stripUndefined";

const resend = new Resend(process.env.RESEND_API_KEY || "dummy-resend-key");

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

    /* ─── Validation (unchanged required fields) ───────────── */
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

    /* ─── Optional attribution (never fails the request) ───── */
    let attribution: Record<string, unknown> | null = null;
    try {
      const sanitizedAttr = sanitizeAttributionPayload(body?.attribution);
      if (sanitizedAttr) {
        // Firestore rejects nested `undefined`. stripUndefinedDeep is defense-in-depth
        // after sanitize already omits empty optionals.
        attribution = stripUndefinedDeep(sanitizedAttr) as Record<string, unknown>;
      }
    } catch {
      attribution = null;
    }

    /* ─── Sanitised payload ────────────────────────────────── */
    const coreFields = {
      fullName: fullName.trim(),
      clinicName: clinicName.trim(),
      phone: phone?.trim() || "",
      email: email?.trim() || "",
      website: website?.trim() || "",
      message: message?.trim() || "",
      source: "landing" as const,
      status: "new" as const,
    };

    const withAttribution: Record<string, unknown> = { ...coreFields };
    if (attribution) {
      withAttribution.attribution = attribution;
      withAttribution.leadSourceLabel =
        typeof attribution.leadSourceLabel === "string"
          ? attribution.leadSourceLabel
          : "Direct / Unknown";
    }

    /* ─── Write to Firestore ───────────────────────────────── */
    let docId: string;
    // Keep for email formatting; may be cleared if attribution write is skipped
    let attributionForEmail: Record<string, unknown> | null = attribution;

    const adminDb = getAdminDb();
    if (adminDb) {
      try {
        const docRef = await adminDb.collection("demoRequests").add({
          ...stripUndefinedDeep(withAttribution),
          createdAt: FieldValue.serverTimestamp(),
        });
        docId = docRef.id;
        console.log("[DemoRequest API] Created via Admin SDK:", docId);
      } catch (writeErr: unknown) {
        // Attribution must never block the core demo lead. Retry without it.
        const msg = writeErr instanceof Error ? writeErr.message : String(writeErr);
        console.error(
          JSON.stringify({
            checkpoint: "DEMO_REQUEST_WRITE_FAILED_RETRY_CORE",
            error: msg,
            hadAttribution: Boolean(attribution),
          })
        );
        attributionForEmail = null;
        const docRef = await adminDb.collection("demoRequests").add({
          ...coreFields,
          createdAt: FieldValue.serverTimestamp(),
        });
        docId = docRef.id;
        console.log("[DemoRequest API] Created via Admin SDK (core-only retry):", docId);
      }
    } else {
      // Fallback: string-only REST fields — nest attribution as JSON string
      const restPayload: Record<string, string> = {
        fullName: coreFields.fullName,
        clinicName: coreFields.clinicName,
        phone: coreFields.phone,
        email: coreFields.email,
        website: coreFields.website,
        message: coreFields.message,
        source: "landing",
        status: "new",
      };
      if (attribution) {
        try {
          restPayload.attributionJson = JSON.stringify(attribution).slice(0, 4000);
          restPayload.leadSourceLabel = String(
            typeof attribution.leadSourceLabel === "string"
              ? attribution.leadSourceLabel
              : ""
          );
        } catch {
          // ignore attribution on REST fallback
        }
      }
      docId = await writeViaRestApi(restPayload);
      console.log("[DemoRequest API] Created via REST API fallback:", docId);
    }

    /* ─── Notification e-mail ──────────────────────────────── */
    if (!process.env.RESEND_API_KEY) {
      console.error("[DemoRequest API] RESEND_API_KEY eksik.");
      throw new Error("Email configuration is missing.");
    }

    try {
      const notifyTo = process.env.DEMO_NOTIFY_EMAIL || "info@clinicbridge-ai.com";
      const fromEmail = process.env.EMAIL_FROM || "ClinicBridge AI <info@clinicbridge-ai.com>";
      const requestDate = new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });

      const attributionBlock = attributionForEmail
        ? `\n\n${formatDemoAttributionEmailSection(attributionForEmail)}\n`
        : "";

      const emailText = `Yeni bir demo talebi alındı.

Ad Soyad: ${coreFields.fullName}
Klinik Adı: ${coreFields.clinicName}
Telefon: ${coreFields.phone || "-"}
E-posta: ${coreFields.email || "-"}
Web Sitesi: ${coreFields.website || "-"}
Mesaj: ${coreFields.message || "-"}

Talep Tarihi: ${requestDate}${attributionBlock}`;

      const emailPayload: any = {
        from: fromEmail,
        to: [notifyTo],
        subject: `Yeni Demo Talebi - ${coreFields.clinicName}`,
        text: emailText,
      };

      if (coreFields.email) {
        emailPayload.reply_to = coreFields.email;
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
