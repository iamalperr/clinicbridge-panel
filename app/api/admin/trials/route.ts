import { NextResponse } from "next/server";
import { AuthError, requireSuperAdmin } from "@/lib/services/apiAuth";
import { getAdminDb } from "@/lib/firebase-admin";
import { filterTrialRows, rowFromLifecycleDoc, trialsToCsv } from "@/lib/lifecycle/adminRows";
import { updateLifecycleAdminFields } from "@/lib/lifecycle/recordMilestone";
import { LIFECYCLE_COLLECTION } from "@/lib/lifecycle/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await requireSuperAdmin(req);
    const db = getAdminDb();
    if (!db) return NextResponse.json({ error: "unavailable" }, { status: 503 });

    const url = new URL(req.url);
    const stage = url.searchParams.get("stage") || "all";
    const health = url.searchParams.get("health") || "all";
    const source = url.searchParams.get("source") || "all";
    const format = url.searchParams.get("format") || "json";

    const snap = await db.collection(LIFECYCLE_COLLECTION).get();
    const rows = snap.docs.map((docSnap) => rowFromLifecycleDoc(docSnap.id, docSnap.data() || {}));
    const filtered = filterTrialRows(rows, { stage, health, source });

    if (format === "csv") {
      const csv = trialsToCsv(filtered);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="trial-lifecycle.csv"',
        },
      });
    }
    return NextResponse.json({ rows: filtered });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await requireSuperAdmin(req);
    const db = getAdminDb();
    if (!db) return NextResponse.json({ error: "unavailable" }, { status: 503 });
    const body = await req.json().catch(() => ({}));
    const clinicId = typeof body.clinicId === "string" ? body.clinicId.trim() : "";
    if (!clinicId) return NextResponse.json({ error: "invalid" }, { status: 400 });
    await updateLifecycleAdminFields(db, clinicId, {
      csmNote: typeof body.csmNote === "string" ? body.csmNote : undefined,
      nextAction: typeof body.nextAction === "string" ? body.nextAction : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
