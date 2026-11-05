import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { dueTrialReminder, parseTimestamp, trialLanguage } from "@/lib/trial/policy";
import { buildTrialReminderEmail } from "@/lib/trial/emails";
import { sendClinicEmail } from "@/lib/trial/sendClinicEmail";

export const runtime = "nodejs";

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET;
  const auth = req.headers.get("authorization") || "";
  const headerSecret = req.headers.get("x-cron-secret") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return Boolean(secret && (bearer === secret || headerSecret === secret));
}

export async function POST(req: Request) {
  if (!authorize(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const onlyId = typeof body.clinicId === "string" ? body.clinicId : "";
  const now = new Date();
  const clinics = onlyId
    ? [await db.collection("clinics").doc(onlyId).get()].filter((snap) => snap.exists)
    : (await db.collection("clinics").where("acquisition", "==", "direct").get()).docs;
  const results: Array<{ clinicId: string; reminder: "3" | "1"; emailSent: boolean }> = [];

  for (const clinic of clinics) {
    const data = clinic.data();
    if (!data) continue;
    const reminder = dueTrialReminder({
      acquisition: data.acquisition,
      plan: data.plan,
      trialEndsAt: parseTimestamp(data.trialEndsAt),
      now,
      sent3: data.trialReminder3Sent === true,
      sent1: data.trialReminder1Sent === true,
    });
    if (!reminder) continue;
    const email = typeof data.email === "string" ? data.email : "";
    const field = reminder === "3" ? "trialReminder3Sent" : "trialReminder1Sent";
    const claimed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(clinic.ref);
      if (fresh.data()?.[field] === true) return false;
      tx.set(clinic.ref, { [field]: true }, { merge: true });
      return true;
    });
    if (!claimed) {
      results.push({ clinicId: clinic.id, reminder, emailSent: false });
      continue;
    }
    const message = buildTrialReminderEmail({
      language: trialLanguage(undefined, data.language),
      clinicName: typeof data.name === "string" ? data.name : "Klinik",
      reminder,
    });
    const emailSent = await sendClinicEmail({ to: email, subject: message.subject, html: message.html });
    if (!emailSent) await clinic.ref.set({ [field]: false }, { merge: true });
    results.push({ clinicId: clinic.id, reminder, emailSent });
  }

  return NextResponse.json({ ok: true, results });
}
