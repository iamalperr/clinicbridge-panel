import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { runDailyTrialLifecycle } from "@/lib/lifecycle/runDaily";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET;
  const auth = req.headers.get("authorization") || "";
  const headerSecret = req.headers.get("x-cron-secret") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return Boolean(secret && (bearer === secret || headerSecret === secret));
}

async function handle(req: Request) {
  if (!authorize(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const url = new URL(req.url);
  const dryRun = body.dryRun === true || url.searchParams.get("dryRun") === "1";
  const onlyClinicId =
    (typeof body.clinicId === "string" && body.clinicId) ||
    url.searchParams.get("clinicId") ||
    "";

  const result = await runDailyTrialLifecycle(db, {
    dryRun,
    onlyClinicId: onlyClinicId || undefined,
    adminAlertEmail: process.env.ADMIN_ALERT_EMAIL || null,
  });
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
