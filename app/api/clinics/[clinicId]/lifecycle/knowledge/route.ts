import { NextResponse } from "next/server";
import { AuthError, requireClinicAccess } from "@/lib/services/apiAuth";
import { getAdminDb } from "@/lib/firebase-admin";
import { hasKnowledgeMinimum } from "@/lib/lifecycle/milestones";
import { safeRecordLifecycleMilestone } from "@/lib/lifecycle/safeRecord";

export const runtime = "nodejs";

/** Recount treatments/FAQ and stamp knowledge_min_reached when threshold is met. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  try {
    const { clinicId } = await params;
    await requireClinicAccess(request, clinicId);
    const db = getAdminDb();
    if (!db) return NextResponse.json({ error: "unavailable" }, { status: 503 });

    const snap = await db.collection("trainingMaterials").where("clinicId", "==", clinicId).get();
    let treatmentCount = 0;
    let faqCount = 0;
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const category = String(data.category || "");
      const title = String(data.title || "").trim();
      const content = String(data.content || "").trim();
      if (!title || !content) continue;
      if (category === "Tedaviler") treatmentCount += 1;
      if (category === "Sık Sorulan Sorular") faqCount += 1;
    }
    const reached = hasKnowledgeMinimum({ treatmentCount, faqCount });
    if (reached) {
      await safeRecordLifecycleMilestone(db, {
        clinicId,
        milestone: "knowledge_min_reached",
        meta: { treatmentCount, faqCount },
      });
    }
    return NextResponse.json({ ok: true, treatmentCount, faqCount, reached });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
