"use client";

import { useEffect, useState, useMemo, Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { isSuperAdmin } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { UI_COLORS } from "@/components/ui/ui-shared";
import PageHeader from "@/components/ui/PageHeader";
import { 
  Download, 
  Users, 
  Activity, 
  Clock, 
  ShieldAlert, 
  Monitor, 
  ArrowUpRight, 
  RefreshCw, 
  AlertCircle,
  X,
  UserCheck
} from "lucide-react";
import type { UserAnalyticsSummary } from "@/lib/types/analytics";
import { getRoleDisplayName } from "@/lib/services/analyticsService";

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

function getActivityColor(status: string) {
  switch (status) {
    case "Çok Aktif": return "#10b981"; // Green
    case "Aktif": return "#10b981"; // Green
    case "Düşük Kullanım": return "#f59e0b"; // Orange
    case "Pasif": return "#ef4444"; // Red
    default: return "#94a3b8"; // Gray (Hiç Giriş Yapmadı)
  }
}

function UsageAnalyticsContent() {
  const { profile, loading: authLoading, getToken } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const userQueryParam = searchParams.get("user")?.trim() || null;

  const [summary, setSummary] = useState<any>(null);
  const [users, setUsers] = useState<UserAnalyticsSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterActivity, setFilterActivity] = useState("all");
  const [exporting, setExporting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Oturum doğrulaması yapılamadı. Lütfen tekrar giriş yapın.");
      }

      const headers: Record<string, string> = {
        "Authorization": `Bearer ${token}`
      };

      const queryParams = new URLSearchParams();
      if (userQueryParam) {
        queryParams.set("user", userQueryParam);
      }

      const queryString = queryParams.toString() ? `?${queryParams.toString()}` : "";

      const [summaryRes, usersRes] = await Promise.all([
        fetch(`/api/admin/analytics/summary${queryString}`, { headers }),
        fetch(`/api/admin/analytics/users${queryString}`, { headers })
      ]);

      const summaryData = await summaryRes.json().catch(() => ({}));
      const usersData = await usersRes.json().catch(() => ({}));

      if (!summaryRes.ok) {
        throw new Error(summaryData.error || `Özet analitik alınamadı (HTTP ${summaryRes.status})`);
      }

      if (!usersRes.ok) {
        throw new Error(usersData.error || `Kullanıcı analitiği alınamadı (HTTP ${usersRes.status})`);
      }

      setSummary(summaryData);
      setUsers(usersData.users || []);
    } catch (err: any) {
      console.error("[UsageAnalytics] Fetch error:", err);
      setError(err.message || "Analitik verileri yüklenirken bir hata oluştu.");
      setSummary(null);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [getToken, userQueryParam]);

  useEffect(() => {
    if (authLoading) return;
    
    // Check authorization: Super Admin, Admin, Clinic Admin, Agency Admin
    const role = profile?.role;
    if (!role || (!isSuperAdmin(role) && role !== "clinicAdmin" && role !== "agencyAdmin")) {
      router.replace("/");
      return;
    }

    fetchData();
  }, [profile, authLoading, router, fetchData]);

  const clearUserFilter = () => {
    router.push("/admin/usage-analytics");
  };

  const handleExport = async () => {
    if (filteredUsers.length === 0) return;
    setExporting(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/analytics/export", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : ""
        },
        body: JSON.stringify({ users: filteredUsers })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Dışa aktarma başarısız oldu.");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kullanici_analitigi_${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Export failed", err);
      alert(err.message || "CSV dışa aktarma sırasında bir hata oluştu.");
    } finally {
      setExporting(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return users.filter(u => {
      const matchesSearch = !q || 
        u.name.toLowerCase().includes(q) || 
        u.email.toLowerCase().includes(q) || 
        (u.clinic_name && u.clinic_name.toLowerCase().includes(q)) ||
        u.role.toLowerCase().includes(q);
        
      const matchesRole = filterRole === "all" || u.role === filterRole;
      const matchesActivity = filterActivity === "all" || u.activity_status === filterActivity;
      
      return matchesSearch && matchesRole && matchesActivity;
    });
  }, [users, searchQuery, filterRole, filterActivity]);

  if (authLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <p style={{ color: UI_COLORS.textMuted }}>Oturum doğrulanıyor...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px", maxWidth: 1400, margin: "0 auto", paddingBottom: 100 }}>
      <PageHeader 
        title="Kullanım Analitiği" 
        subtitle="Platformdaki kullanıcı aktivitelerini, oturum sürelerini ve kullanım metriklerini inceleyin."
        actions={
          <div style={{ display: "flex", gap: 12 }}>
            <Button 
              variant="ghost" 
              onClick={fetchData} 
              disabled={loading}
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Yenile
            </Button>
            <Button 
              variant="secondary" 
              onClick={handleExport} 
              disabled={loading || exporting || filteredUsers.length === 0} 
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <Download size={16} /> {exporting ? "Aktarılıyor..." : "Dışa Aktar (CSV)"}
            </Button>
          </div>
        }
      />

      {/* Active URL Filter Indicator */}
      {userQueryParam && (
        <div style={{ 
          marginBottom: 24, 
          padding: "12px 18px", 
          borderRadius: 12, 
          background: "rgba(59, 130, 246, 0.08)", 
          border: "1px solid rgba(59, 130, 246, 0.25)",
          display: "flex", 
          alignItems: "center", 
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <UserCheck size={18} color={UI_COLORS.brand} />
            <span style={{ fontSize: 13.5, color: UI_COLORS.textPrimary }}>
              Filtrelenen Kullanıcı ID: <strong style={{ fontFamily: "monospace" }}>{userQueryParam}</strong>
            </span>
          </div>
          <Button variant="ghost" onClick={clearUserFilter} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <X size={14} /> Filtreyi Temizle (Tüm Kullanıcılar)
          </Button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div style={{ 
          marginBottom: 24, 
          padding: "16px 20px", 
          borderRadius: 14, 
          background: "rgba(239, 68, 68, 0.08)", 
          border: "1px solid rgba(239, 68, 68, 0.25)",
          display: "flex", 
          alignItems: "center", 
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <AlertCircle size={22} color={UI_COLORS.danger} />
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: UI_COLORS.danger, margin: 0 }}>
                Veriler yüklenirken bir sorun oluştu
              </p>
              <p style={{ fontSize: 13, color: UI_COLORS.textSecondary, margin: "4px 0 0" }}>
                {error}
              </p>
            </div>
          </div>
          <Button variant="secondary" onClick={fetchData} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <RefreshCw size={15} /> Yeniden Dene
          </Button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", 
        gap: 20, 
        marginBottom: 32 
      }}>
        {[
          { 
            title: "Toplam Kullanıcı", 
            value: loading ? "..." : (summary?.totalUsers ?? 0), 
            icon: Users, 
            color: UI_COLORS.brand 
          },
          { 
            title: "Bugün Giriş Yapanlar", 
            value: loading ? "..." : (summary?.activeUsersToday ?? 0), 
            icon: Activity, 
            color: "#10b981" 
          },
          { 
            title: "Şu An Aktif", 
            value: loading ? "..." : (summary?.currentlyActiveUsers ?? 0), 
            icon: Monitor, 
            color: "#10b981" 
          },
          { 
            title: "Son 30 Günde Pasif", 
            value: loading ? "..." : (summary?.inactiveUsers30d ?? 0), 
            icon: ShieldAlert, 
            color: "#ef4444" 
          },
          { 
            title: "Ortalama Oturum", 
            value: loading ? "..." : formatDuration(summary?.avgSessionTimeSeconds ?? 0), 
            icon: Clock, 
            color: "#f59e0b" 
          },
          { 
            title: "Bugünkü Oturumlar", 
            value: loading ? "..." : (summary?.totalSessionsToday ?? 0), 
            icon: ArrowUpRight, 
            color: UI_COLORS.brand 
          }
        ].map((card, i) => (
          <div key={i} style={{ 
            background: UI_COLORS.bgCard, 
            border: `1px solid ${UI_COLORS.border}`,
            borderRadius: 16, 
            padding: 20, 
            display: "flex", 
            alignItems: "center", 
            gap: 16,
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)"
          }}>
            <div style={{ 
              width: 48, 
              height: 48, 
              borderRadius: 12, 
              background: `${card.color}15`,
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center", 
              color: card.color,
              flexShrink: 0
            }}>
              <card.icon size={24} />
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 13, color: UI_COLORS.textMuted, fontWeight: 500, marginBottom: 4 }}>{card.title}</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: UI_COLORS.textPrimary, margin: 0 }}>
                {card.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Table Section */}
      <div style={{ background: UI_COLORS.bgCard, border: `1px solid ${UI_COLORS.border}`, borderRadius: 16, overflow: "hidden" }}>
        
        {/* Filters Bar */}
        <div style={{ padding: 20, borderBottom: `1px solid ${UI_COLORS.border}`, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 250 }}>
            <Input 
              placeholder="Kullanıcı adı, e-posta, rol veya klinik ara..." 
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
                { value: "superAdmin", label: "Super Admin" },
                { value: "admin", label: "Admin" },
                { value: "agencyAdmin", label: "Acente Yöneticisi" },
                { value: "agencyUser", label: "Acente Kullanıcısı" },
                { value: "clinicAdmin", label: "Klinik Yöneticisi" },
                { value: "clinicUser", label: "Klinik Kullanıcısı" },
                { value: "viewer", label: "Görüntüleyici" }
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
                <th style={{ padding: "16px 20px", textAlign: "left", fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted }}>ROL</th>
                <th style={{ padding: "16px 20px", textAlign: "left", fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted }}>DURUM</th>
                <th style={{ padding: "16px 20px", textAlign: "left", fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted }}>KLİNİK</th>
                <th style={{ padding: "16px 20px", textAlign: "left", fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted }}>SON GİRİŞ</th>
                <th style={{ padding: "16px 20px", textAlign: "right", fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted }}>TOP. GİRİŞ</th>
                <th style={{ padding: "16px 20px", textAlign: "right", fontSize: 12, fontWeight: 600, color: UI_COLORS.textMuted }}>30 GÜN SÜRE</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: 48, textAlign: "center", color: UI_COLORS.textMuted }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                      <RefreshCw size={24} className="animate-spin" color={UI_COLORS.brand} />
                      <span>Kullanıcı kullanım verileri yükleniyor...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 48, textAlign: "center", color: UI_COLORS.textMuted }}>
                    {userQueryParam ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                        <AlertCircle size={28} color={UI_COLORS.textMuted} />
                        <p style={{ margin: 0, fontSize: 14, color: UI_COLORS.textSecondary }}>
                          ID'si <code style={{ background: "rgba(0,0,0,0.06)", padding: "2px 6px", borderRadius: 4 }}>{userQueryParam}</code> olan kullanıcı bulunamadı veya bu hesabı görüntüleme yetkiniz yok.
                        </p>
                        <Button variant="secondary" onClick={clearUserFilter} style={{ marginTop: 8 }}>
                          Tüm Kullanıcıları Görüntüle
                        </Button>
                      </div>
                    ) : (
                      "Kullanıcı bulunamadı."
                    )}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u, i) => (
                  <tr key={u.user_id} style={{ borderBottom: i === filteredUsers.length - 1 ? "none" : `1px solid ${UI_COLORS.border}` }}>
                    <td style={{ padding: "16px 20px" }}>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 600, color: UI_COLORS.textPrimary, margin: 0 }}>{u.name}</p>
                        <p style={{ fontSize: 12, color: UI_COLORS.textMuted, margin: "2px 0 0" }}>{u.email}</p>
                      </div>
                    </td>
                    <td style={{ padding: "16px 20px" }}>
                      <span style={{ 
                        fontSize: 12, 
                        fontWeight: 600, 
                        color: u.role === "superAdmin" || u.role === "admin" ? UI_COLORS.brand : UI_COLORS.textSecondary,
                        background: u.role === "superAdmin" || u.role === "admin" ? `${UI_COLORS.brand}12` : "rgba(0,0,0,0.04)",
                        padding: "4px 8px",
                        borderRadius: 6
                      }}>
                        {getRoleDisplayName(u.role)}
                      </span>
                    </td>
                    <td style={{ padding: "16px 20px" }}>
                      <div style={{ 
                        display: "inline-flex", 
                        alignItems: "center", 
                        gap: 6, 
                        padding: "4px 10px", 
                        borderRadius: 20, 
                        background: `${getActivityColor(u.activity_status)}15`, 
                        color: getActivityColor(u.activity_status), 
                        fontSize: 12, 
                        fontWeight: 600 
                      }}>
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

export default function UsageAnalyticsPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <p style={{ color: UI_COLORS.textMuted }}>Yükleniyor...</p>
      </div>
    }>
      <UsageAnalyticsContent />
    </Suspense>
  );
}
