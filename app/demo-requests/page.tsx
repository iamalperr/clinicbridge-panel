"use client";

import { useEffect, useState } from "react";
import { UI_COLORS, UI_COMMON_STYLES } from "@/components/ui/ui-shared";
import {
  DemoRequest,
  DemoRequestStatus,
  fetchDemoRequests,
  updateDemoRequestStatus,
} from "@/lib/services/demoRequestService";
import { Loader2, Inbox, Phone, Mail, Globe, Building2, RefreshCw } from "lucide-react";

/* ─── Helpers ─────────────────────────────────────────────── */

const STATUS_OPTIONS: { value: DemoRequestStatus; label: string; color: string; bg: string }[] = [
  { value: "new",       label: "Yeni",        color: "#60a5fa", bg: "rgba(59,130,246,0.12)" },
  { value: "contacted", label: "İletişildi",  color: "#fbbf24", bg: "rgba(245,158,11,0.12)" },
  { value: "qualified", label: "Nitelikli",   color: "#34d399", bg: "rgba(16,185,129,0.12)" },
  { value: "closed",    label: "Kapalı",      color: "#94a3b8", bg: "rgba(148,163,184,0.10)" },
];

function StatusBadge({ status }: { status: DemoRequestStatus }) {
  const s = STATUS_OPTIONS.find((o) => o.value === status) ?? STATUS_OPTIONS[0];
  return (
    <span style={{
      padding: "3px 10px",
      borderRadius: 99,
      fontSize: 12,
      fontWeight: 700,
      color: s.color,
      background: s.bg,
      whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  );
}

function formatDate(ts: DemoRequest["createdAt"]): string {
  if (!ts) return "—";
  try {
    return ts.toDate().toLocaleString("tr-TR", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

/* ─── Page ────────────────────────────────────────────────── */

export default function DemoRequestsPage() {
  const [requests, setRequests] = useState<DemoRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRequests(await fetchDemoRequests());
    } catch (e) {
      console.error(e);
      setError("Demo talepleri yüklenirken hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleStatusChange = async (id: string, status: DemoRequestStatus) => {
    setUpdatingId(id);
    try {
      await updateDemoRequestStatus(id, status);
      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status } : r))
      );
    } catch {
      alert("Durum güncellenemedi.");
    } finally {
      setUpdatingId(null);
    }
  };

  /* ─ counts ─ */
  const newCount = requests.filter((r) => r.status === "new").length;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.5px" }}>
            Demo Talepleri
          </h1>
          <p style={{ color: UI_COLORS.textSecondary, marginTop: 4, fontSize: 14 }}>
            Landing page üzerinden gelen demo talepleri
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "9px 18px", borderRadius: 10,
            background: "rgba(99,102,241,0.08)", border: `1px solid ${UI_COLORS.border}`,
            color: UI_COLORS.brand, fontWeight: 600, fontSize: 13, cursor: "pointer",
          }}
        >
          <RefreshCw size={14} className={loading ? "spin" : ""} />
          Yenile
        </button>
      </div>

      {/* Stats bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
        {STATUS_OPTIONS.map((s) => {
          const count = requests.filter((r) => r.status === s.value).length;
          return (
            <div key={s.value} style={{
              background: UI_COLORS.bgCard, border: `1px solid ${UI_COLORS.border}`,
              borderRadius: 12, padding: "16px 20px",
            }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: UI_COLORS.textMuted, marginBottom: 6 }}>
                {s.label}
              </p>
              <p style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{count}</p>
            </div>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, padding: 16, marginBottom: 24, color: UI_COLORS.danger, fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "64px 0", color: UI_COLORS.textMuted }}>
          <Loader2 size={24} className="spin" />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } } .spin { animation: spin 0.8s linear infinite; }`}</style>
        </div>
      ) : requests.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 0", color: UI_COLORS.textMuted }}>
          <Inbox size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
          <p style={{ fontSize: 15, fontWeight: 600 }}>Henüz demo talebi yok</p>
          <p style={{ fontSize: 13, marginTop: 4 }}>Landing page'den gelen talepler burada görünecek.</p>
        </div>
      ) : (
        <div style={{ background: UI_COLORS.bgCard, border: `1px solid ${UI_COLORS.border}`, borderRadius: 16, overflow: "hidden" }}>
          {/* Table head */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "160px 1fr 1fr 140px 160px 140px 150px",
            padding: "12px 20px",
            borderBottom: `1px solid ${UI_COLORS.border}`,
            background: "rgba(255,255,255,0.02)",
          }}>
            {["Tarih", "Ad Soyad", "Klinik", "Telefon", "E-posta", "Web", "Durum"].map((col) => (
              <span key={col} style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: UI_COLORS.textMuted }}>
                {col}
              </span>
            ))}
          </div>

          {/* Table rows */}
          {requests.map((req, i) => (
            <div
              key={req.id}
              style={{
                display: "grid",
                gridTemplateColumns: "160px 1fr 1fr 140px 160px 140px 150px",
                padding: "14px 20px",
                borderBottom: i < requests.length - 1 ? `1px solid ${UI_COLORS.border}` : "none",
                alignItems: "center",
                transition: UI_COMMON_STYLES.transition,
              }}
            >
              <span style={{ fontSize: 12, color: UI_COLORS.textMuted }}>{formatDate(req.createdAt)}</span>

              <span style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textPrimary }}>
                {req.fullName || "—"}
              </span>

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Building2 size={13} style={{ color: UI_COLORS.textMuted, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: UI_COLORS.textSecondary }}>{req.clinicName || "—"}</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <Phone size={12} style={{ color: UI_COLORS.textMuted, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: UI_COLORS.textSecondary }}>{req.phone || "—"}</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <Mail size={12} style={{ color: UI_COLORS.textMuted, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: UI_COLORS.textSecondary }}>{req.email || "—"}</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <Globe size={12} style={{ color: UI_COLORS.textMuted, flexShrink: 0 }} />
                {req.website ? (
                  <a href={req.website} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, color: UI_COLORS.brand, textDecoration: "none" }}>
                    {req.website.replace(/^https?:\/\//, "")}
                  </a>
                ) : <span style={{ fontSize: 12, color: UI_COLORS.textMuted }}>—</span>}
              </div>

              {/* Status selector */}
              <div style={{ position: "relative" }}>
                {updatingId === req.id ? (
                  <Loader2 size={14} className="spin" style={{ color: UI_COLORS.textMuted }} />
                ) : (
                  <select
                    value={req.status}
                    onChange={(e) => handleStatusChange(req.id, e.target.value as DemoRequestStatus)}
                    style={{
                      width: "100%",
                      padding: "5px 8px",
                      borderRadius: 8,
                      border: `1px solid ${UI_COLORS.border}`,
                      background: UI_COLORS.bgCard,
                      color: UI_COLORS.textPrimary,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      outline: "none",
                    }}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Message preview panel — shows message on hover would need state; show as tooltip-less expandable row instead */}
      {newCount > 0 && (
        <p style={{ marginTop: 16, fontSize: 12, color: UI_COLORS.textMuted, textAlign: "right" }}>
          {newCount} yeni talep bekliyor
        </p>
      )}
    </div>
  );
}
