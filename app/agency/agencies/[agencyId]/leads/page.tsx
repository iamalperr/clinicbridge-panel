"use client";

import { useAgencyWorkspace } from "@/components/agency/AgencyWorkspaceContext";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { isSuperAdmin } from "@/lib/types";
import { subscribeToLeads } from "@/lib/services/leadService";
import Badge from "@/components/ui/Badge";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { Search, Filter, Loader2, UserPlus, AlertCircle } from "lucide-react";
import type { Lead, TreatmentCategory, LeadStatus } from "@/lib/types/agency";
import { TREATMENT_CATEGORIES, LEAD_STATUSES, LEAD_URGENCIES } from "@/lib/types/agency";

export default function LeadsPage() {
  const { profile } = useAuth();
  const { agencyId } = useAgencyWorkspace();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterCountry, setFilterCountry] = useState<string>("all");

  useEffect(() => {
    if (!agencyId) {
      setLoading(false);
      return;
    }
    const unsub = subscribeToLeads(agencyId, (data) => {
      setLeads(data);
      setLoading(false);
    });
    return unsub;
  }, [agencyId]);

  // Derive unique countries from leads
  const countries = [...new Set(leads.map((l) => l.country).filter(Boolean))].sort();

  // Filter
  const filtered = leads.filter((lead) => {
    if (filterCategory !== "all" && lead.treatmentCategory !== filterCategory) return false;
    if (filterStatus !== "all" && lead.status !== filterStatus) return false;
    if (filterCountry !== "all" && lead.country !== filterCountry) return false;
    if (search) {
      const q = search.toLowerCase();
      const nameMatch = lead.patientName?.toLowerCase().includes(q);
      const emailMatch = lead.patientEmail?.toLowerCase().includes(q);
      const summaryMatch = lead.conversationSummary?.toLowerCase().includes(q);
      if (!nameMatch && !emailMatch && !summaryMatch) return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={32} style={{ animation: "spin 1s linear infinite" }} color="#10b981" />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!agencyId && !isSuperAdmin(profile?.role)) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <AlertCircle size={48} color={UI_COLORS.textMuted} />
        <h2 style={{ marginTop: 16, color: UI_COLORS.textPrimary }}>No Agency Assigned</h2>
        <p style={{ color: UI_COLORS.textMuted, marginTop: 8 }}>Your account is not linked to any agency.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.02em" }}>
            Leads
          </h1>
          <p style={{ fontSize: 14, color: UI_COLORS.textMuted, marginTop: 4 }}>
            {filtered.length} of {leads.length} leads
          </p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: 11, color: UI_COLORS.textMuted }} />
          <input
            type="text"
            placeholder="Search by name, email, summary..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px 10px 36px",
              borderRadius: 10,
              border: `1px solid ${UI_COLORS.border}`,
              fontSize: 13,
              background: "var(--bg-card)",
              color: UI_COLORS.textPrimary,
              outline: "none",
            }}
          />
        </div>

        {/* Category filter */}
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: `1px solid ${UI_COLORS.border}`,
            fontSize: 13,
            background: "var(--bg-card)",
            color: UI_COLORS.textPrimary,
            cursor: "pointer",
          }}
        >
          <option value="all">All Categories</option>
          {Object.entries(TREATMENT_CATEGORIES).map(([key, val]) => (
            <option key={key} value={key}>{val.en}</option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: `1px solid ${UI_COLORS.border}`,
            fontSize: 13,
            background: "var(--bg-card)",
            color: UI_COLORS.textPrimary,
            cursor: "pointer",
          }}
        >
          <option value="all">All Statuses</option>
          {Object.entries(LEAD_STATUSES).map(([key, val]) => (
            <option key={key} value={key}>{val.en}</option>
          ))}
        </select>

        {/* Country filter */}
        <select
          value={filterCountry}
          onChange={(e) => setFilterCountry(e.target.value)}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: `1px solid ${UI_COLORS.border}`,
            fontSize: 13,
            background: "var(--bg-card)",
            color: UI_COLORS.textPrimary,
            cursor: "pointer",
          }}
        >
          <option value="all">All Countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div style={{
        background: "var(--bg-card)",
        borderRadius: 14,
        border: `1px solid ${UI_COLORS.border}`,
        overflow: "hidden",
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${UI_COLORS.border}` }}>
              {["Patient", "Treatment", "Country", "Language", "Urgency", "Status", "Clinic", "Date"].map((h) => (
                <th key={h} style={{
                  padding: "12px 14px",
                  textAlign: "left",
                  fontWeight: 700,
                  fontSize: 11.5,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: UI_COLORS.textMuted,
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 40, textAlign: "center", color: UI_COLORS.textMuted }}>
                  No leads found
                </td>
              </tr>
            ) : (
              filtered.map((lead) => (
                <tr
                  key={lead.id}
                  style={{
                    borderBottom: `1px solid ${UI_COLORS.border}`,
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(16, 185, 129, 0.03)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <td style={{ padding: "12px 14px" }}>
                    <Link href={`/agency/leads/${lead.id}`} style={{ textDecoration: "none", color: UI_COLORS.textPrimary, fontWeight: 600 }}>
                      {lead.patientName || "Anonymous"}
                    </Link>
                    {lead.patientEmail && (
                      <p style={{ fontSize: 11.5, color: UI_COLORS.textMuted, marginTop: 2 }}>
                        {lead.patientEmail}
                      </p>
                    )}
                  </td>
                  <td style={{ padding: "12px 14px", color: UI_COLORS.textSecondary }}>
                    {TREATMENT_CATEGORIES[lead.treatmentCategory]?.en || lead.treatmentCategory}
                  </td>
                  <td style={{ padding: "12px 14px", color: UI_COLORS.textSecondary }}>
                    {lead.country}
                  </td>
                  <td style={{ padding: "12px 14px", color: UI_COLORS.textSecondary }}>
                    {lead.language?.toUpperCase()}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: LEAD_URGENCIES[lead.urgency]?.color || "#94a3b8",
                    }}>
                      {LEAD_URGENCIES[lead.urgency]?.en || lead.urgency}
                    </span>
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <Badge
                      label={LEAD_STATUSES[lead.status]?.en || lead.status}
                      variant={
                        lead.status === "new" ? "info" :
                        lead.status === "converted" ? "success" :
                        lead.status === "lost" ? "danger" : "warning"
                      }
                    />
                  </td>
                  <td style={{ padding: "12px 14px", color: UI_COLORS.textSecondary, fontSize: 12.5 }}>
                    {lead.assignedClinicName || "—"}
                  </td>
                  <td style={{ padding: "12px 14px", color: UI_COLORS.textMuted, fontSize: 12 }}>
                    {lead.createdAt?.toDate
                      ? lead.createdAt.toDate().toLocaleDateString()
                      : typeof lead.createdAt === "string"
                      ? new Date(lead.createdAt).toLocaleDateString()
                      : "—"}
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
