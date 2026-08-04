import { NextResponse } from "next/server";
import { retryDueAgencyLeadNotifications } from "@/lib/services/agencyNotificationService";

/**
 * POST /api/internal/agency-notifications/retry
 * Retries due failed/pending agency lead quote-notification jobs.
 * Auth: Authorization: Bearer ${CRON_SECRET} or x-cron-secret header.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET;
  const auth = req.headers.get("authorization") || "";
  const headerSecret = req.headers.get("x-cron-secret") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!secret || (bearer !== secret && headerSecret !== secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const result = await retryDueAgencyLeadNotifications({
      agencyId: typeof body.agencyId === "string" ? body.agencyId : undefined,
      limit: typeof body.limit === "number" ? body.limit : 25,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[agency-notifications/retry]", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
