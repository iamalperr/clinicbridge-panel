import { NextResponse } from "next/server";
import { verifyAuth, AuthError } from "@/lib/services/apiAuth";
import { isSuperAdmin } from "@/lib/types";
import { getRoleDisplayName } from "@/lib/services/analyticsService";
import type { UserAnalyticsSummary } from "@/lib/types/analytics";

function escapeCSV(val: any) {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

function formatDuration(seconds: number) {
  if (!seconds || seconds === 0) return "0 dk";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}s ${m}d`;
  return `${m} dk`;
}

function formatDate(ts: number | null) {
  if (!ts) return "Hiç";
  return new Date(ts).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export async function POST(req: Request) {
  try {
    const authResult = await verifyAuth(req);
    const { profile } = authResult;

    if (!isSuperAdmin(profile.role) && profile.role !== "clinicAdmin" && profile.role !== "agencyAdmin") {
      return NextResponse.json(
        { error: "Bu işlemi gerçekleştirme yetkiniz bulunmamaktadır." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const users: UserAnalyticsSummary[] = body.users || [];

    if (users.length === 0) {
      return NextResponse.json({ error: "Dışa aktarılacak kullanıcı bulunamadı." }, { status: 400 });
    }

    const headers = [
      "Kullanıcı Adı",
      "E-posta",
      "Rol",
      "Klinik",
      "Hesap Durumu",
      "Aktivite Durumu",
      "Son Giriş Tarihi",
      "Son Aktivite Tarihi",
      "Toplam Giriş Sayısı",
      "Son 7 Gün Giriş",
      "Son 30 Gün Giriş",
      "Bugün Giriş",
      "Toplam Süre",
      "Son 30 Gün Süre",
      "Son 7 Gün Süre",
      "Bugünkü Süre"
    ];

    const rows = users.map(u => [
      escapeCSV(u.name || "İsimsiz"),
      escapeCSV(u.email || "-"),
      escapeCSV(getRoleDisplayName(u.role)),
      escapeCSV(u.clinic_name || "-"),
      escapeCSV(u.status === "active" ? "Aktif" : u.status === "suspended" ? "Askıya Alındı" : u.status || "Aktif"),
      escapeCSV(u.activity_status || "Hiç Giriş Yapmadı"),
      escapeCSV(formatDate(u.last_login_at)),
      escapeCSV(formatDate(u.last_activity_at)),
      escapeCSV(u.logins_total || 0),
      escapeCSV(u.logins_7d || 0),
      escapeCSV(u.logins_30d || 0),
      escapeCSV(u.logins_today || 0),
      escapeCSV(formatDuration(u.duration_total || 0)),
      escapeCSV(formatDuration(u.duration_30d || 0)),
      escapeCSV(formatDuration(u.duration_7d || 0)),
      escapeCSV(formatDuration(u.duration_today || 0))
    ]);

    const csvContent = [
      headers.join(";"),
      ...rows.map(row => row.join(";"))
    ].join("\r\n");

    // Prepend UTF-8 BOM so Excel opens Turkish characters properly
    const bom = "\uFEFF";
    const dateStr = new Date().toISOString().split("T")[0];

    return new NextResponse(bom + csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="kullanici_analitigi_${dateStr}.csv"`
      }
    });

  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Analytics export error:", err);
    return NextResponse.json({ error: err.message || "İç sunucu hatası oluştu." }, { status: 500 });
  }
}
