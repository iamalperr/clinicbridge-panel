"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useAuth } from "@/lib/auth-context";
import { isSuperAdmin } from "@/lib/types";
import PageHeader from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { UI_COLORS } from "@/components/ui/ui-shared";
import type { TrialAdminRow } from "@/lib/lifecycle/adminRows";
import { LIFECYCLE_MILESTONES } from "@/lib/lifecycle/types";

const selectStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: `1px solid ${UI_COLORS.border}`,
  background: UI_COLORS.bgInput,
  color: UI_COLORS.textPrimary,
  font: "inherit",
};

const noteStyle: CSSProperties = {
  width: "100%",
  minHeight: 56,
  padding: "8px 10px",
  borderRadius: 10,
  border: `1px solid ${UI_COLORS.border}`,
  background: UI_COLORS.bgInput,
  color: UI_COLORS.textPrimary,
  font: "inherit",
  resize: "vertical",
};

function healthColor(health: TrialAdminRow["health"]): string {
  if (health === "green") return "#16a34a";
  if (health === "yellow") return "#ca8a04";
  if (health === "red") return "#dc2626";
  return UI_COLORS.textSecondary;
}

export default function AdminTrialsPage() {
  const { profile, loading, getToken } = useAuth();
  const [rows, setRows] = useState<TrialAdminRow[]>([]);
  const [stage, setStage] = useState("all");
  const [health, setHealth] = useState("all");
  const [source, setSource] = useState("all");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { csmNote: string; nextAction: string }>>({});

  const allowed = isSuperAdmin(profile?.role);

  const authed = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const token = await getToken();
      if (!token) throw new Error("Oturum doğrulanamadı.");
      const response = await fetch(path, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(typeof body.error === "string" ? body.error : "İstek başarısız.");
      }
      if (response.headers.get("content-type")?.includes("text/csv")) {
        return response.text();
      }
      return response.json();
    },
    [getToken]
  );

  const load = useCallback(async () => {
    if (!allowed) return;
    setError("");
    const params = new URLSearchParams({ stage, health, source });
    const body = await authed(`/api/admin/trials?${params.toString()}`);
    const nextRows = Array.isArray(body.rows) ? (body.rows as TrialAdminRow[]) : [];
    setRows(nextRows);
    const nextDrafts: Record<string, { csmNote: string; nextAction: string }> = {};
    for (const row of nextRows) {
      nextDrafts[row.clinicId] = { csmNote: row.csmNote, nextAction: row.nextAction };
    }
    setDrafts(nextDrafts);
  }, [allowed, authed, stage, health, source]);

  useEffect(() => {
    if (loading || !allowed) return;
    void load();
  }, [loading, allowed, load]);

  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) if (row.source) set.add(row.source);
    return Array.from(set).sort();
  }, [rows]);

  async function saveNotes(clinicId: string) {
    const draft = drafts[clinicId];
    if (!draft) return;
    setBusyId(clinicId);
    setError("");
    try {
      await authed("/api/admin/trials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicId, csmNote: draft.csmNote, nextAction: draft.nextAction }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt başarısız.");
    } finally {
      setBusyId(null);
    }
  }

  async function exportCsv() {
    setError("");
    try {
      const params = new URLSearchParams({ stage, health, source, format: "csv" });
      const token = await getToken();
      if (!token) throw new Error("Oturum doğrulanamadı.");
      const response = await fetch(`/api/admin/trials?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("CSV alınamadı.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "trial-lifecycle.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "CSV başarısız.");
    }
  }

  if (loading) return null;
  if (!allowed) {
    return (
      <div style={{ padding: 32 }}>
        <PageHeader title="Trials" subtitle="Yalnızca platform yöneticileri" />
        <p style={{ color: UI_COLORS.danger }}>Bu sayfaya erişim yetkiniz yok.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 28px 48px", maxWidth: 1400, margin: "0 auto" }}>
      <PageHeader
        title="Trial lifecycle"
        subtitle="Self-serve klinik aktivasyon ve deneme takibi"
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Yenile
            </Button>
            <Button type="button" onClick={() => void exportCsv()}>
              CSV
            </Button>
          </div>
        }
      />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: UI_COLORS.textSecondary }}>
          Stage
          <select style={selectStyle} value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="all">All</option>
            {LIFECYCLE_MILESTONES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: UI_COLORS.textSecondary }}>
          Health
          <select style={selectStyle} value={health} onChange={(e) => setHealth(e.target.value)}>
            <option value="all">All</option>
            <option value="green">green</option>
            <option value="yellow">yellow</option>
            <option value="red">red</option>
            <option value="neutral">neutral</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: UI_COLORS.textSecondary }}>
          Source
          <select style={selectStyle} value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="all">All</option>
            {sources.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <p style={{ color: UI_COLORS.danger }}>{error}</p> : null}

      <div style={{ overflowX: "auto", border: `1px solid ${UI_COLORS.border}`, borderRadius: 16, background: UI_COLORS.bgCard }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead>
            <tr style={{ textAlign: "left", background: "rgba(0,0,0,0.03)" }}>
              {["Klinik", "İletişim", "Kayıt", "Gün", "Kaynak", "Stage", "Health", "Son aktivite", "Linkler", "CSM notu", "Sonraki aksiyon"].map(
                (label) => (
                  <th key={label} style={{ padding: "12px 10px", whiteSpace: "nowrap", fontWeight: 600 }}>
                    {label}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ padding: 24, color: UI_COLORS.textSecondary }}>
                  Kayıt yok.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.clinicId} style={{ borderTop: `1px solid ${UI_COLORS.border}` }}>
                  <td style={{ padding: "12px 10px", verticalAlign: "top" }}>
                    <div style={{ fontWeight: 600 }}>{row.clinicName}</div>
                    <div style={{ color: UI_COLORS.textSecondary, fontSize: 12 }}>{row.clinicId}</div>
                  </td>
                  <td style={{ padding: "12px 10px", verticalAlign: "top" }}>
                    <div>{row.contactName || "—"}</div>
                    <div style={{ color: UI_COLORS.textSecondary }}>{row.contactPhone || "—"}</div>
                    <div style={{ color: UI_COLORS.textSecondary }}>{row.contactEmail || "—"}</div>
                  </td>
                  <td style={{ padding: "12px 10px", verticalAlign: "top", whiteSpace: "nowrap" }}>
                    {row.signupDate ? new Date(row.signupDate).toLocaleDateString("tr-TR") : "—"}
                  </td>
                  <td style={{ padding: "12px 10px", verticalAlign: "top" }}>{row.trialDay}</td>
                  <td style={{ padding: "12px 10px", verticalAlign: "top" }}>{row.source}</td>
                  <td style={{ padding: "12px 10px", verticalAlign: "top" }}>{row.stage || "—"}</td>
                  <td style={{ padding: "12px 10px", verticalAlign: "top" }}>
                    <span style={{ color: healthColor(row.health), fontWeight: 700 }}>{row.health}</span>
                  </td>
                  <td style={{ padding: "12px 10px", verticalAlign: "top", whiteSpace: "nowrap" }}>
                    {row.lastActivityAt ? new Date(row.lastActivityAt).toLocaleString("tr-TR") : "—"}
                  </td>
                  <td style={{ padding: "12px 10px", verticalAlign: "top" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <a href={row.panelUrl} style={{ color: UI_COLORS.brand }}>
                        Panel
                      </a>
                      {row.telUrl ? (
                        <a href={row.telUrl} style={{ color: UI_COLORS.brand }}>
                          Ara
                        </a>
                      ) : null}
                      {row.mailtoUrl ? (
                        <a href={row.mailtoUrl} style={{ color: UI_COLORS.brand }}>
                          E-posta
                        </a>
                      ) : null}
                    </div>
                  </td>
                  <td style={{ padding: "12px 10px", verticalAlign: "top", minWidth: 180 }}>
                    <textarea
                      style={noteStyle}
                      value={drafts[row.clinicId]?.csmNote || ""}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.clinicId]: {
                            csmNote: e.target.value,
                            nextAction: prev[row.clinicId]?.nextAction || "",
                          },
                        }))
                      }
                      placeholder="CSM notu"
                    />
                  </td>
                  <td style={{ padding: "12px 10px", verticalAlign: "top", minWidth: 180 }}>
                    <textarea
                      style={noteStyle}
                      value={drafts[row.clinicId]?.nextAction || ""}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.clinicId]: {
                            csmNote: prev[row.clinicId]?.csmNote || "",
                            nextAction: e.target.value,
                          },
                        }))
                      }
                      placeholder="Sonraki aksiyon"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      style={{ marginTop: 8 }}
                      disabled={busyId === row.clinicId}
                      onClick={() => void saveNotes(row.clinicId)}
                    >
                      {busyId === row.clinicId ? "..." : "Kaydet"}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
