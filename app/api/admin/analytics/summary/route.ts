import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyAuth, AuthError } from "@/lib/services/apiAuth";
import { isSuperAdmin } from "@/lib/types";
import { loadUsageAnalytics } from "@/lib/services/analytics/loadUsageAnalytics";

/** @deprecated Prefer GET /api/admin/analytics — kept as thin wrapper. */
export async function GET(req: Request) {
  try {
    const authResult = await verifyAuth(req);
    const { profile } = authResult;
    const role = profile.role;
    if (!isSuperAdmin(role) && role !== "clinicAdmin" && role !== "agencyAdmin") {
      return NextResponse.json(
        { error: "Bu analitik verilerine erişim yetkiniz bulunmamaktadır." },
        { status: 403 }
      );
    }
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: "Veritabanı bağlantısı kurulamadı." }, { status: 503 });
    }
    const url = new URL(req.url);
    const payload = await loadUsageAnalytics(adminDb, profile, {
      user: url.searchParams.get("user"),
      clinic_id: url.searchParams.get("clinic_id"),
      agency_id: url.searchParams.get("agency_id"),
      role: url.searchParams.get("role"),
    });
    return NextResponse.json({ ...payload.summary, meta: payload.meta });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[Analytics:Summary] Error:", err);
    return NextResponse.json(
      { error: err.message || "İç sunucu hatası oluştu." },
      { status: 500 }
    );
  }
}
