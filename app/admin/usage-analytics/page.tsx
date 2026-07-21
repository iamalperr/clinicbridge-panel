"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { isSuperAdmin } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import Badge from "@/components/ui/Badge";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";
import PageHeader from "@/components/ui/PageHeader";
import { Download, Search, Users, Activity, Clock, ShieldAlert, Monitor, ArrowUpRight } from "lucide-react";
import type { UserAnalyticsSummary } from "@/lib/types/analytics";

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

function getActivityColor(status: string) {
  switch (status) {
    case "Çok Aktif": return "#10b981"; // Green
    case "Aktif": return "#84cc16"; // Light Green
    case "Düşük Kullanım": return "#f59e0b"; // Orange
    case "Pasif": return "#ef4444"; // Red
    default: return "#94a3b8"; // Gray (Hiç Giriş Yapmadı)
  }
}

export default function UsageAnalyticsPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [summary, setSummary] = useState<any>(null);
  const [users, setUsers] = useState<UserAnalyticsSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterActivity, setFilterActivity] = useState("all");

  useEffect(() => {
    if (authLoading) return;
    
    // Check authorization
    const role = profile?.role;
    if (!role || (!isSuperAdmin(role) && role !== "admin")) {
      router.replace("/clinics"); // Unauthorized
      return;
    }

    fetchData();
  }, [profile, authLoading, router]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [summaryRes, usersRes] = await Promise.all([
        fetch("/api/admin/analytics/summary"),
        fetch("/api/admin/analytics/users")
      ]);
      const summaryData = await summaryRes.json();
      const usersData = await usersRes.json();
      
      setSummary(summaryData);
      setUsers(usersData.users || []);
    } catch (err) {
      console.error("Failed to load analytics data", err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const res = await fetch("/api/admin/analytics/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ users: filteredUsers })
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kullanici_analitigi_${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
    } catch (err) {
      console.error("Export failed", err);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return users.filter(u => {
      const matchesSearch = !q || 
        u.name.toLowerCase().includes(q) || 
        u.email.toLowerCase().includes(q) || 
        (u.clinic_name && u.clinic_name.toLowerCase().includes(q));
        
      const matchesRole = filterRole === "all" || u.role === filterRole;
      const matchesActivity = filterActivity === "all" || u.activity_status === filterActivity;
      
      return matchesSearch && matchesRole && matchesActivity;
    });
  }, [users, searchQuery, filterRole, filterActivity]);

  if (authLoading || loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100dvh" }}>
        <p style={{ color: UI_COLORS.textMuted }}>Veriler yükleniyor...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px", maxWidth: 1400, margin: "0 auto", paddingBottom: 100 }}>
      <PageHeader 
        title="Kullanım Analitiği" 
        subtitle="Platformdaki kullanıcı aktivitelerini ve kullanım metriklerini detaylı olarak inceleyin."
        actions={
          <Button variant="secondary" onClick={handleExport} style={{ display: "flex", gap: 8 }}>
            <Download size={16} /> Dışa Aktar (CSV)
          </Button>
        }
      />

      {/* Summary Cards */}
      {summary && (
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", 
          gap: 20, 
          marginBottom: 32 
        }}>
          {[
            { title: "Toplam Kullanıcı", value: summary.totalUsers, icon: Users, color: UI_COLORS.brand },
            { title: "Bugün Giriş Yapanlar", value: summary.activeUsersToday, icon: Activity, color: "#10b981" },
            { title: "Şu An Aktif", value: summary.currentlyActiveUsers, icon: Monitor, color: "#10b981" },
            { title: "Son 30 Günde Pasif", value: summary.inactiveUsers30d, icon: ShieldAlert, color: "#ef4444" },
            { title: "Ortalama Oturum", value: formatDuration(summary.avgSessionTimeSeconds), icon: Clock, color: "#f59e0b" },
            { title: "Bugünkü Oturumlar", value: summary.totalSessionsToday, icon: ArrowUpRight, color: UI_COLORS.brand }
          ].map((card, i) => (
            <div key={i} style={{ 
              background: UI_COLORS.bgCard, border: `1px solid ${UI_COLORS.border}`,
              borderRadius: 16, padding: 20, display: "flex", alignItems: "center", gap: 16
            }}>
              <div style={{ 
                width: 48, height: 48, borderRadius: 12, background: `${card.color}15`,
                display: "flex", alignItems: "center", justifyContent: "center", color: card.color
              }}>
                <card.icon size={24} />
              </div>
              <div>
                <p style={{ fontSize: 13, color: UI_COLORS.textMuted, fontWeight: 500, marginBottom: 4 }}>{card.title}</p>
                <p style={{ fontSize: 24, fontWeight: 700, color: UI_COLORS.textPrimary }}>{card.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table Section */}
      <div style={{ background: UI_COLORS.bgCard, border: `1px solid ${UI_COLORS.border}`, borderRadius: 16, overflow: "hidden" }}>
        
        {/* Filters */}
        <div style={{ padding: 20, borderBottom: `1px solid ${UI_COLORS.border}`, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 250 }}>
            <Input 
              placeholder="Kullanıcı, e-posta veya klinik ara..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div style={{ width: 180 }}>
            <Select 
              value={filterActivity} 
              onChange={e => setFilterActivity(e.target.value)}
              options={[
                { value: "all", label: "Tüm Aktiviteler" },
                { value: "Çok Aktif", label: "Çok Aktif" },
                { value: "Aktif", label: "Aktif" },
                { value: "Düşük Kullanım", label: "Düşük Kullanım" },
                { value: "Pasif", label: "Pasif" },
                { value: "Hiç Giriş Yapmadı", label: "Hiç Giriş Yapmadı" }
              ]}
            />
          </div>
          <div style={{ width: 180 }}>
            <Select 
              value={filterRole} 
              onChange={e => setFilterRole(e.target.value)}
              options={[
                { value: "all", label: "Tüm Roller" },
                { value: "clinicUser", label: "Klinik Kullanıcısı" },
                { value: "clinicAdmin", label: "Klinik Yöneticisi" },
                { value: "admin", label: "Yönetici" },
                { value: "superAdmin", label: "Super Admin" }
              ]}
            />
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
            <thead>
              <tr style={{ background: "rgba(0,0,0,0.02)", borderBottom: `1px solid ${UI_COLORS.border}` }}>
                <th style={{ padding: "16px 20px", textAlign: "left", fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted }}>KULLANICI</th>
                <th style={{ padding: "16px 20px", textAlign: "left", fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted }}>DURUM</th>
                <th style={{ padding: "16px 20px", textAlign: "left", fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted }}>KLİNİK</th>
                <th style={{ padding: "16px 20px", textAlign: "left", fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted }}>SON GİRİŞ</th>
                <th style={{ padding: "16px 20px", textAlign: "right", fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted }}>TOP. GİRİŞ</th>
                <th style={{ padding: "16px 20px", textAlign: "right", fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted }}>30 GÜN SÜRE</th>
                <th style={{ padding: "16px 20px", textAlign: "right", fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted }}>AKSIYON</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: "center", color: UI_COLORS.textMuted }}>
                    Kullanıcı bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u, i) => (
                  <tr key={u.user_id} style={{ borderBottom: i === filteredUsers.length - 1 ? "none" : `1px solid ${UI_COLORS.border}` }}>
                    <td style={{ padding: "16px 20px" }}>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 600, color: UI_COLORS.textPrimary }}>{u.name}</p>
                        <p style={{ fontSize: 12, color: UI_COLORS.textMuted }}>{u.email}</p>
                      </div>
                    </td>
                    <td style={{ padding: "16px 20px" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20, background: `${getActivityColor(u.activity_status)}15`, color: getActivityColor(u.activity_status), fontSize: 12, fontWeight: 600 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: getActivityColor(u.activity_status) }} />
                        {u.activity_status}
                      </div>
                    </td>
                    <td style={{ padding: "16px 20px", fontSize: 13, color: UI_COLORS.textSecondary }}>
                      {u.clinic_name}
                    </td>
                    <td style={{ padding: "16px 20px", fontSize: 13, color: UI_COLORS.textSecondary }}>
                      {formatDate(u.last_login_at)}
                    </td>
                    <td style={{ padding: "16px 20px", fontSize: 13, color: UI_COLORS.textPrimary, textAlign: "right", fontWeight: 600 }}>
                      {u.logins_total}
                    </td>
                    <td style={{ padding: "16px 20px", fontSize: 13, color: UI_COLORS.textPrimary, textAlign: "right", fontWeight: 600 }}>
                      {formatDuration(u.duration_30d)}
                    </td>
                    <td style={{ padding: "16px 20px", textAlign: "right" }}>
                      <Button variant="ghost" onClick={() => alert("Detay paneli MVP aşamasında yakında aktif olacak. (" + u.email + ")")}>
                        Detay
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
