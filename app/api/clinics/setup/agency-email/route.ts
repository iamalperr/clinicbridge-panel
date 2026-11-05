import { NextResponse } from "next/server";
import { Resend } from "resend";
import { requireClinicCaller } from "@/lib/setup/caller";
import { buildAgencyInstallEmail } from "@/lib/setup/emails";
import { getPasswordResetFromAddress } from "@/lib/auth/passwordReset";
import { nextRateWindow } from "@/lib/signup/account";

export const runtime = "nodejs";

const LIMIT = 5;

export async function POST(req: Request) {
  const auth = await requireClinicCaller(req);
  if ("error" in auth) return auth.error;
  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { db, clinicId, clinic, language } = auth.caller;
  const limitRef = db.collection("setupAgencyEmailLimits").doc(clinicId);
  const limitSnap = await limitRef.get();
  const existing = limitSnap.exists ? limitSnap.data() as { windowStart: number; count: number } : null;
  const next = nextRateWindow(existing, Date.now(), LIMIT);
  if (!next.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  await limitRef.set(next);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ emailSent: false });
  const message = buildAgencyInstallEmail({
    language,
    clinicName: typeof clinic.name === "string" ? clinic.name : "Klinik",
    clinicId,
  });
  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: getPasswordResetFromAddress(),
      to: email,
      subject: message.subject,
      html: message.html,
    });
    return NextResponse.json({ emailSent: !error });
  } catch {
    return NextResponse.json({ emailSent: false });
  }
}
