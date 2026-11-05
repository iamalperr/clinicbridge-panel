import { NextResponse } from "next/server";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { Resend } from "resend";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { extractClientIp } from "@/lib/auth/passwordResetRateLimit";
import { getPasswordResetFromAddress, getTrustedAppOrigin } from "@/lib/auth/passwordReset";
import { hashScanIp } from "@/lib/preview/rateLimit";
import type { PreviewKnowledgeItem } from "@/lib/preview/types";
import { chatsPerMonthForSignupPlan } from "@/lib/pricing";
import {
  DIRECT_CLINIC_ROLE,
  directClinicPermissions,
  domainFromSourceUrl,
  nextRateWindow,
  trainingDocsFromPreview,
  trialEndsAtFrom,
  validateSignup,
} from "@/lib/signup/account";
import { buildWelcomeEmail } from "@/lib/signup/welcomeEmail";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const parsed = validateSignup(body && typeof body === "object" ? body : {});
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const signup = parsed.value;

  const adminAuth = getAdminAuth();
  const db = getAdminDb();
  if (!adminAuth || !db) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const rateRef = db.collection("signupRateLimits").doc(hashScanIp(`signup:${extractClientIp(req)}`));
  const allowed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(rateRef);
    const data = snap.exists ? snap.data() : null;
    const existing = data && typeof data.windowStart === "number" && typeof data.count === "number"
      ? { windowStart: data.windowStart, count: data.count }
      : null;
    const next = nextRateWindow(existing, Date.now());
    if (!next.allowed) return false;
    tx.set(rateRef, { windowStart: next.windowStart, count: next.count });
    return true;
  });
  if (!allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let userRecord: { uid: string } | null = null;
  let clinicId: string | null = null;
  try {
    userRecord = await adminAuth.createUser({
      email: signup.email,
      password: signup.password,
      displayName: signup.name,
      emailVerified: false,
    });

    const clinicRef = db.collection("clinics").doc();
    clinicId = clinicRef.id;
    const createdAt = new Date();
    const preview = await readPreview(db, signup.previewId);
    const materials = trainingDocsFromPreview(preview?.knowledgeItems ?? []);

    await clinicRef.set({
      name: signup.clinicName,
      domain: preview ? domainFromSourceUrl(preview.sourceUrl) : "",
      email: signup.email,
      phone: preview?.phone || signup.phone,
      whatsappNumber: preview?.whatsapp || "",
      workingHours: preview?.hours || "",
      language: preview?.languages?.some((language) => language.toLowerCase().startsWith("tr")) ? "tr" : signup.language,
      plan: "trial",
      status: "trial",
      acquisition: "direct",
      trialEndsAt: Timestamp.fromDate(trialEndsAtFrom(createdAt)),
      chatLimit: chatsPerMonthForSignupPlan("trial"),
      setupCompleted: false,
      modules: { ai: true, widget: true, voice: false },
      aiEnabled: "active",
      messages: 0,
      conversations: 0,
      createdAt: FieldValue.serverTimestamp(),
    });

    await db.collection("users").doc(userRecord.uid).set({
      uid: userRecord.uid,
      email: signup.email,
      name: signup.name,
      phone: signup.phone,
      role: DIRECT_CLINIC_ROLE,
      clinicId,
      agencyId: null,
      permissions: directClinicPermissions(),
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
    });
    await adminAuth.setCustomUserClaims(userRecord.uid, {
      role: DIRECT_CLINIC_ROLE,
      clinicId,
      agencyId: null,
    });

    if (materials.length && preview && !preview.claimedClinicId) {
      const batch = db.batch();
      for (const item of materials) {
        const ref = db.collection("trainingMaterials").doc();
        batch.set(ref, {
          title: item.title,
          content: item.content,
          category: item.category,
          language: item.language,
          type: "note",
          status: "learned",
          clinicId,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      batch.update(db.collection("previews").doc(preview.id), { claimedClinicId: clinicId });
      await batch.commit();
    }

    const emailSent = await sendWelcome(adminAuth, signup);
    return NextResponse.json({ success: true, clinicId, emailSent }, { status: 201 });
  } catch (error: unknown) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code: string }).code) : "";
    if (userRecord) {
      await adminAuth.deleteUser(userRecord.uid).catch(() => undefined);
      if (clinicId) await db.collection("clinics").doc(clinicId).delete().catch(() => undefined);
      await db.collection("users").doc(userRecord.uid).delete().catch(() => undefined);
    }
    if (code === "auth/email-already-exists") {
      return NextResponse.json({ error: "email_taken" }, { status: 409 });
    }
    console.error("[signup] failed", code || "unknown");
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}

async function readPreview(
  db: Firestore,
  previewId: string | null
): Promise<{ id: string; sourceUrl: string; phone: string | null; whatsapp: string | null; hours: string | null; languages: string[]; knowledgeItems: PreviewKnowledgeItem[]; claimedClinicId?: string } | null> {
  if (!previewId) return null;
  const snap = await db.collection("previews").doc(previewId).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  const expiresAt = data.expiresAt?.toDate?.() as Date | undefined;
  if (!expiresAt || expiresAt.getTime() < Date.now()) return null;
  return {
    id: snap.id,
    sourceUrl: typeof data.sourceUrl === "string" ? data.sourceUrl : "",
    phone: typeof data.phone === "string" ? data.phone : null,
    whatsapp: typeof data.whatsapp === "string" ? data.whatsapp : null,
    hours: typeof data.hours === "string" ? data.hours : null,
    languages: Array.isArray(data.languages) ? data.languages.filter((item) => typeof item === "string") : [],
    knowledgeItems: Array.isArray(data.knowledgeItems) ? data.knowledgeItems as PreviewKnowledgeItem[] : [],
    claimedClinicId: typeof data.claimedClinicId === "string" ? data.claimedClinicId : undefined,
  };
}

async function sendWelcome(
  adminAuth: NonNullable<ReturnType<typeof getAdminAuth>>,
  signup: { email: string; name: string; clinicName: string; language: "tr" | "en" }
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  let verificationLink: string | null = null;
  try {
    verificationLink = await adminAuth.generateEmailVerificationLink(signup.email, {
      url: `${getTrustedAppOrigin()}/login`,
    });
  } catch {
    verificationLink = null;
  }
  const message = buildWelcomeEmail({
    language: signup.language,
    name: signup.name,
    clinicName: signup.clinicName,
    verificationLink,
  });
  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: getPasswordResetFromAddress(),
      to: signup.email,
      subject: message.subject,
      html: message.html,
    });
    return !error;
  } catch {
    return false;
  }
}
