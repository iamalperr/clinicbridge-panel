import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { planInstallPing, type InstallState } from "@/lib/setup/installPing";
import { buildLiveBotEmail } from "@/lib/setup/emails";
import { getPasswordResetFromAddress } from "@/lib/auth/passwordReset";
import { Resend } from "resend";

export const runtime = "nodejs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  let body: { clinicId?: unknown; domain?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400, headers: CORS });
  }
  const clinicId = typeof body.clinicId === "string" ? body.clinicId.trim() : "";
  const domain = typeof body.domain === "string" ? body.domain : "";
  if (!/^[A-Za-z0-9]{8,128}$/.test(clinicId)) {
    return NextResponse.json({ error: "invalid" }, { status: 400, headers: CORS });
  }
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: CORS });
  const ref = db.collection("clinics").doc(clinicId);
  const snap = await ref.get();
  const data = snap.data() || {};
  const state: InstallState = {
    exists: snap.exists,
    widgetInstalledAt: timestampIso(data.widgetInstalledAt),
    installedDomain: typeof data.installedDomain === "string" ? data.installedDomain : null,
    widgetLiveEmailSent: data.widgetLiveEmailSent === true,
  };
  const plan = planInstallPing(state, domain, new Date().toISOString());
  if (plan.status === "invalid") return NextResponse.json({ error: "invalid" }, { status: 400, headers: CORS });
  if (plan.status === "missing") return NextResponse.json({ error: "not_found" }, { status: 404, headers: CORS });

  let sendEmail = false;
  if (plan.status === "first" || plan.status === "retry-email") {
    sendEmail = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      const current = fresh.data() || {};
      const again = planInstallPing({
        exists: fresh.exists,
        widgetInstalledAt: timestampIso(current.widgetInstalledAt),
        installedDomain: typeof current.installedDomain === "string" ? current.installedDomain : null,
        widgetLiveEmailSent: current.widgetLiveEmailSent === true,
      }, domain, new Date().toISOString());
      if (again.status !== "first" && again.status !== "retry-email") return false;
      tx.update(ref, {
        widgetInstalledAt: current.widgetInstalledAt || Timestamp.now(),
        installedDomain: again.installedDomain,
        widgetLiveEmailSent: true,
      });
      return true;
    });
  } else if (plan.status === "update-domain") {
    await ref.update({ installedDomain: plan.installedDomain });
  }

  if (sendEmail) {
    const sent = await sendLiveEmail({
      language: data.language === "en" ? "en" : "tr",
      clinicName: typeof data.name === "string" ? data.name : "Klinik",
      domain: plan.status === "first" || plan.status === "retry-email" ? plan.installedDomain : domain,
      to: typeof data.email === "string" ? data.email : "",
    });
    if (!sent) await ref.update({ widgetLiveEmailSent: false });
  }

  const after = await ref.get();
  return NextResponse.json({
    installed: Boolean(after.data()?.widgetInstalledAt),
    domain: after.data()?.installedDomain || null,
  }, { headers: CORS });
}

function timestampIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return "set";
}

async function sendLiveEmail(input: { language: "tr" | "en"; clinicName: string; domain: string; to: string }): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !input.to) return false;
  const message = buildLiveBotEmail(input);
  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: getPasswordResetFromAddress(),
      to: input.to,
      subject: message.subject,
      html: message.html,
    });
    return !error;
  } catch {
    return false;
  }
}
