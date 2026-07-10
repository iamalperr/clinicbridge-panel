"use client";

import { useAgencyWorkspace } from "@/components/agency/AgencyWorkspaceContext";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { isSuperAdmin } from "@/lib/types";
import { subscribeToQuotes, updateQuoteStatus } from "@/lib/services/quoteService";
import Badge from "@/components/ui/Badge";
import { UI_COLORS } from "@/components/ui/ui-shared";
import { FileText, Loader2, AlertCircle, Search, ChevronDown, ChevronUp, Building2, ExternalLink } from "lucide-react";
import type { QuoteRequest, QuoteStatus } from "@/lib/types/matching";
import { QUOTE_STATUSES } from "@/lib/types/matching";
import { TREATMENT_CATEGORIES, type TreatmentCategory } from "@/lib/types/agency";

export default function QuotesPage() {
  const { profile } = useAuth();
  const { agencyId } = useAgencyWorkspace();

  const [quotes, setQuotes] = useState<QuoteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    const unsub = subscribeToQuotes(agencyId, (data) => { setQuotes(data); setLoading(false); });
    return () => unsub();
  }, [agencyId]);

  if (!agencyId) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <AlertCircle size={48} color={UI_COLORS.textMuted} />
        <h2 style={{ marginTop: 16, color: UI_COLORS.textPrimary }}>No Agency Selected</h2>
        <p style={{ color: UI_COLORS.textMuted, marginTop: 8 }}>
          {isSuperAdmin(profile?.role) ? "Select an agency to view quote requests." : "Your account is not linked to any agency."}
        </p>
      </div>
    );
  }

  const filtered = quotes.filter((q) => {
    if (filterStatus !== "all" && q.status !== filterStatus) return false;
    if (search) {
      const s = search.toLowerCase();
      return (q.patientName || "").toLowerCase().includes(s)
        || q.treatmentName.toLowerCase().includes(s)
        || (q.patientEmail || "").toLowerCase().includes(s);
    }
    return true;
  });

  const statusCounts = quotes.reduce((acc, q) => {
    acc[q.status] = (acc[q.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleStatusChange = async (quoteId: string, newStatus: QuoteStatus) => {
    if (!agencyId) return;
    try { await updateQuoteStatus(agencyId, quoteId, newStatus); }
    catch (err) { console.error("Failed to update quote:", err); }
  };

  const statusBadgeVariant = (s: QuoteStatus): "success" | "warning" | "info" | "danger" | "default" => {
    if (s === "accepted") return "success";
    if (s === "rejected" || s === "expired") return "danger";
    if (s === "offer_received" || s === "sent_to_patient") return "info";
    if (s === "requested" || s === "clinic_reviewing") return "warning";
    return "default";
  };

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1400 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: UI_COLORS.textPrimary, letterSpacing: "-0.02em" }}>Quote Requests</h1>
          <p style={{ fontSize: 14, color: UI_COLORS.textMuted, marginTop: 4 }}>
            {quotes.length} quote requests — manage clinic offers and patient responses.
          </p>
        </div>
      </div>

      {/* Status Filter Chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setFilterStatus("all")}
          style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
            border: `1px solid ${filterStatus === "all" ? "#10b981" : UI_COLORS.border}`,
            background: filterStatus === "all" ? "rgba(16, 185, 129, 0.08)" : "transparent",
            color: filterStatus === "all" ? "#10b981" : UI_COLORS.textMuted,
          }}>
          All ({quotes.length})
        </button>
        {Object.entries(QUOTE_STATUSES).map(([key, val]) => (
          <button key={key} onClick={() => setFilterStatus(key)}
            style={{
              padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${filterStatus === key ? val.color : UI_COLORS.border}`,
              background: filterStatus === key ? `${val.color}14` : "transparent",
              color: filterStatus === key ? val.color : UI_COLORS.textMuted,
            }}>
            {val.en} {statusCounts[key] ? `(${statusCounts[key]})` : ""}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ position: "relative", maxWidth: 400, marginBottom: 20 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: 11, color: UI_COLORS.textMuted }} />
        <input type="text" placeholder="Search quotes..." value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ width: "100%", padding: "10px 12px 10px 36px", borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, fontSize: 13, background: "var(--bg-card)", color: UI_COLORS.textPrimary, outline: "none" }} />
      </div>

      {loading ? (
        <div style={{ height: "40vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Loader2 size={32} style={{ animation: "spin 1s linear infinite" }} color="#10b981" />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 48, textAlign: "center", background: "var(--bg-card)", borderRadius: 14, border: `1px solid ${UI_COLORS.border}` }}>
          <FileText size={48} color={UI_COLORS.textMuted} style={{ opacity: 0.3 }} />
          <h3 style={{ marginTop: 16, fontSize: 16, fontWeight: 700, color: UI_COLORS.textPrimary }}>
            {search || filterStatus !== "all" ? "No quotes match your filters" : "No quote requests yet"}
          </h3>
          <p style={{ color: UI_COLORS.textMuted, fontSize: 13, marginTop: 8 }}>
            Quote requests are created when patients request clinic offers through the AI assistant.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((q) => (
            <div key={q.id} style={{
              background: "var(--bg-card)", borderRadius: 14, border: `1px solid ${UI_COLORS.border}`, overflow: "hidden",
              transition: "box-shadow 0.15s",
            }}>
              {/* Header */}
              <button onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                style={{
                  width: "100%", padding: "16px 20px", background: "transparent", border: "none",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 16, textAlign: "left",
                }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: UI_COLORS.textPrimary }}>
                      {q.patientName || "Anonymous Patient"}
                    </span>
                    <Badge label={QUOTE_STATUSES[q.status]?.en || q.status} variant={statusBadgeVariant(q.status)} />
                  </div>
                  <div style={{ display: "flex", gap: 16, fontSize: 12, color: UI_COLORS.textMuted }}>
                    <span>{q.treatmentName}</span>
                    <span>{TREATMENT_CATEGORIES[q.treatmentCategory]?.en}</span>
                    <span>{q.selectedClinicNames?.length || 0} clinics</span>
                    {q.patientCountry && <span>🌍 {q.patientCountry}</span>}
                  </div>
                </div>
                {expandedId === q.id ? <ChevronUp size={16} color={UI_COLORS.textMuted} /> : <ChevronDown size={16} color={UI_COLORS.textMuted} />}
              </button>

              {/* Expanded Detail */}
              {expandedId === q.id && (
                <div style={{ padding: "0 20px 20px", borderTop: `1px solid ${UI_COLORS.border}` }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: UI_COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Patient Info</p>
                      <div style={{ fontSize: 13, color: UI_COLORS.textSecondary, lineHeight: 1.8 }}>
                        <p><strong>Name:</strong> {q.patientName || "—"}</p>
                        <p><strong>Email:</strong> {q.patientEmail || "—"}</p>
                        <p><strong>Country:</strong> {q.patientCountry || "—"}</p>
                        <p><strong>Consent:</strong> {q.consentStatus}</p>
                      </div>
                    </div>
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: UI_COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Treatment</p>
                      <div style={{ fontSize: 13, color: UI_COLORS.textSecondary, lineHeight: 1.8 }}>
                        <p><strong>Treatment:</strong> {q.treatmentName}</p>
                        <p><strong>Category:</strong> {TREATMENT_CATEGORIES[q.treatmentCategory]?.en}</p>
                        {q.subTreatment && <p><strong>Sub-treatment:</strong> {q.subTreatment}</p>}
                      </div>
                    </div>
                  </div>

                  {/* Selected Clinics */}
                  {q.selectedClinicNames && q.selectedClinicNames.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: UI_COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Selected Clinics</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {q.selectedClinicNames.map((name, i) => (
                          <span key={i} style={{
                            display: "flex", alignItems: "center", gap: 4,
                            padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                            background: "rgba(16, 185, 129, 0.06)", border: `1px solid rgba(16, 185, 129, 0.15)`,
                            color: "#10b981",
                          }}>
                            <Building2 size={12} /> {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Clinic Offers */}
                  {q.clinicOffers && q.clinicOffers.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: UI_COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Clinic Offers</p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {q.clinicOffers.map((offer, i) => (
                          <div key={i} style={{ padding: "12px 16px", borderRadius: 10, border: `1px solid ${UI_COLORS.border}`, background: "var(--bg-app)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textPrimary }}>{offer.clinicName}</span>
                              <span style={{ fontSize: 14, fontWeight: 700, color: "#10b981" }}>{offer.priceMin}–{offer.priceMax} {offer.currency}</span>
                            </div>
                            {offer.packageDetails && <p style={{ fontSize: 12, color: UI_COLORS.textMuted }}>{offer.packageDetails}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Status Actions */}
                  <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                    <select
                      value={q.status}
                      onChange={(e) => handleStatusChange(q.id, e.target.value as QuoteStatus)}
                      style={{
                        padding: "8px 12px", borderRadius: 8, border: `1px solid ${UI_COLORS.border}`,
                        fontSize: 13, background: "var(--bg-card)", color: UI_COLORS.textPrimary, cursor: "pointer",
                      }}
                    >
                      {Object.entries(QUOTE_STATUSES).map(([k, v]) => (
                        <option key={k} value={k}>{v.en}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
