import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import type { UserAnalyticsSummary } from "@/lib/types/analytics";

function escapeCSV(val: any) {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
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
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

export async function POST(req: Request) {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) return NextResponse.json({ error: "DB error" }, { status: 500 });

    const body = await req.json();
    const users: UserAnalyticsSummary[] = body.users || [];

    if (users.length === 0) {
      return NextResponse.json({ error: "Dışa aktarılacak kullanıcı bulunamadı." }, { status: 400 });
    }

    const headers = [
      "Kullanici Adi",
      "E-posta",
      "Rol",
      "Klinik",
      "Durum",
      "Aktivite Durumu",
      "Son Giris",
      "Toplam Giris",
      "Son 7 Gun Giris",
      "Son 30 Gun Giris",
      "Bugun Giris",
      "Toplam Sure",
      "30 Gunluk Sure",
      "7 Gunluk Sure",
      "Bugunku Sure"
    ];

    const rows = users.map(u => [
      escapeCSV(u.name),
      escapeCSV(u.email),
      escapeCSV(u.role),
      escapeCSV(u.clinic_name),
      escapeCSV(u.status),
      escapeCSV(u.activity_status),
      escapeCSV(formatDate(u.last_login_at)),
      escapeCSV(u.logins_total),
      escapeCSV(u.logins_7d),
      escapeCSV(u.logins_30d),
      escapeCSV(u.logins_today),
      escapeCSV(formatDuration(u.duration_total)),
      escapeCSV(formatDuration(u.duration_30d)),
      escapeCSV(formatDuration(u.duration_7d)),
      escapeCSV(formatDuration(u.duration_today))
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");

    // Prepend UTF-8 BOM so Excel opens it properly
    const bom = "\uFEFF";

    return new NextResponse(bom + csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="kullanici_analitigi_${new Date().toISOString().split("T")[0]}.csv"`
      }
    });

  } catch (err: any) {
    console.error("Analytics export error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
