"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { subscribeToLead, updateLeadStatus, assignLeadToClinic, updateLead } from "@/lib/services/leadService";
import { subscribeToAgencyClinics } from "@/lib/services/agencyService";
import SectionCard from "@/components/ui/SectionCard";
import Badge from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { UI_COLORS } from "@/components/ui/ui-shared";
import {
  ArrowLeft,
  User,
  Globe,
  MessageSquare,
  Shield,
  Building2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import Link from "next/link";
import type { Lead, AgencyClinic, LeadStatus } from "@/lib/types/agency";
import { TREATMENT_CATEGORIES, LEAD_STATUSES, LEAD_URGENCIES } from "@/lib/types/agency";

export default function LeadDetailPage() {
  const { leadId } = useParams() as { leadId: string };
  const { profile } = useAuth();
  const router = useRouter();
  const agencyId = profile?.agencyId;

  const [lead, setLead] = useState<Lead | null>(null);
  const [clinics, setClinics] = useState<AgencyClinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClinic, setSelectedClinic] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<LeadStatus | "">("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!agencyId || !leadId) return;

    const unsub1 = subscribeToLead(agencyId, leadId, (l) => {
      setLead(l);
      setLoading(false);
    });

    const unsub2 = subscribeToAgencyClinics(agencyId, setClinics);

    return () => {
      unsub1();
      unsub2();
    };
  }, [agencyId, leadId]);

  const handleAssign = async () => {
    if (!agencyId || !leadId || !selectedClinic) return;
    setSaving(true);
    try {
      const clinic = clinics.find((c) => c.clinicId === selectedClinic);
      await assignLeadToClinic(
        agencyId,
        leadId,
        selectedClinic,
        clinic?.clinicName || selectedClinic,
        profile?.name || profile?.email
      );
      setSelectedClinic("");
    } catch (err) {
      console.error("Assign failed:", err);
    }
    setSaving(false);
  };

  const handleStatusUpdate = async () => {
    if (!agencyId || !leadId || !selectedStatus) return;
    setSaving(true);
    try {
      await updateLeadStatus(
        agencyId,
        leadId,
        selectedStatus,
        profile?.name || profile?.email
      );
      setSelectedStatus("");
    } catch (err) {
      console.error("Status update failed:", err);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={32} style={{ animation: "spin 1s linear infinite" }} color="#10b981" />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!lead) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <AlertCircle size={48} color={UI_COLORS.textMuted} />
        <h2 style={{ marginTop: 16, color: UI_COLORS.textPrimary }}>Lead Not Found</h2>
        <Link href="/agency/leads" style={{ color: "#10b981", marginTop: 12, display: "inline-block" }}>
          ← Back to Leads
        </Link>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1100 }}>
      {/* Back button */}
      <Link
        href="/agency/leads"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          fontWeight: 600,
          color: UI_COLORS.textMuted,
          textDecoration: "none",
          marginBottom: 20,
        }}
      >
        <ArrowLeft size={16} /> Back to Leads
      </Link>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: UI_COLORS.textPrimary }}>
            {lead.patientName || "Anonymous Patient"}
          </h1>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Badge
              label={LEAD_STATUSES[lead.status]?.en || lead.status}
              variant={
                lead.status === "new" ? "info" :
                lead.status === "converted" ? "success" :
                lead.status === "lost" ? "danger" : "warning"
              }
            />
            <Badge
              label={LEAD_URGENCIES[lead.urgency]?.en || lead.urgency}
              variant={lead.urgency === "high" || lead.urgency === "emergency" ? "danger" : "default"}
            />
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Patient Info */}
          <SectionCard title="Patient Information">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <InfoRow icon={<User size={14} />} label="Name" value={lead.patientName || "—"} />
              <InfoRow icon={<Globe size={14} />} label="Country" value={lead.country || "—"} />
              <InfoRow label="Email" value={lead.patientEmail || "—"} />
              <InfoRow label="Language" value={lead.language?.toUpperCase() || "—"} />
              <InfoRow label="Phone" value={lead.patientPhone || "—"} />
              <InfoRow label="Source" value={lead.source || "—"} />
            </div>
          </SectionCard>

          {/* Treatment Info */}
          <SectionCard title="Treatment Information">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <InfoRow
                label="Category"
                value={TREATMENT_CATEGORIES[lead.treatmentCategory]?.en || lead.treatmentCategory}
              />
              <InfoRow label="Subcategory" value={lead.treatmentSubcategory || "—"} />
              <InfoRow label="Urgency" value={LEAD_URGENCIES[lead.urgency]?.en || lead.urgency} />
            </div>
          </SectionCard>

          {/* Conversation Summary */}
          <SectionCard title="Conversation Summary">
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: UI_COLORS.textSecondary }}>
              {lead.conversationSummary || "No conversation summary available."}
            </p>
          </SectionCard>

          {/* AI Extracted Notes */}
          {lead.aiExtractedNotes && (
            <SectionCard title="AI Notes">
              <p style={{ fontSize: 13.5, lineHeight: 1.6, color: UI_COLORS.textSecondary }}>
                {lead.aiExtractedNotes}
              </p>
            </SectionCard>
          )}

          {/* Status History */}
          <SectionCard title="Status History">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(lead.statusHistory || []).map((entry, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "8px 0",
                    borderBottom: i < (lead.statusHistory?.length || 0) - 1 ? `1px solid ${UI_COLORS.border}` : "none",
                  }}
                >
                  <Clock size={14} color={UI_COLORS.textMuted} style={{ marginTop: 2 }} />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textPrimary }}>
                      {LEAD_STATUSES[entry.status]?.en || entry.status}
                    </p>
                    {entry.note && (
                      <p style={{ fontSize: 12, color: UI_COLORS.textMuted, marginTop: 2 }}>
                        {entry.note}
                      </p>
                    )}
                    <p style={{ fontSize: 11.5, color: UI_COLORS.textMuted, marginTop: 2 }}>
                      {entry.changedBy && `by ${entry.changedBy} · `}
                      {typeof entry.changedAt === "string"
                        ? new Date(entry.changedAt).toLocaleString()
                        : "—"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        {/* Right column — Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* KVKK / Consent */}
          <SectionCard title="Consent Status">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {lead.consentStatus === "accepted" ? (
                <CheckCircle2 size={18} color="#22c55e" />
              ) : (
                <Shield size={18} color="#f59e0b" />
              )}
              <span style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textPrimary }}>
                {lead.consentStatus === "accepted" ? "Consent Given" :
                 lead.consentStatus === "declined" ? "Consent Declined" : "Pending"}
              </span>
            </div>
          </SectionCard>

          {/* Assign to Clinic */}
          <SectionCard title="Assign to Clinic">
            {lead.clinicId ? (
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: UI_COLORS.textPrimary }}>
                  Currently: {lead.assignedClinicName || lead.clinicId}
                </p>
                <p style={{ fontSize: 12, color: UI_COLORS.textMuted, marginTop: 4 }}>
                  Reassign below if needed.
                </p>
              </div>
            ) : (
              <p style={{ fontSize: 12.5, color: UI_COLORS.textMuted, marginBottom: 8 }}>
                No clinic assigned yet.
              </p>
            )}
            <div style={{ marginTop: 12 }}>
              <select
                value={selectedClinic}
                onChange={(e) => setSelectedClinic(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: `1px solid ${UI_COLORS.border}`,
                  fontSize: 13,
                  background: "var(--bg-card)",
                  color: UI_COLORS.textPrimary,
                  marginBottom: 8,
                }}
              >
                <option value="">Select clinic...</option>
                {clinics
                  .filter((c) => c.status === "active")
                  .map((c) => (
                    <option key={c.clinicId} value={c.clinicId}>
                      {c.clinicName} ({c.location?.city || "—"})
                    </option>
                  ))}
              </select>
              <Button
                onClick={handleAssign}
                disabled={!selectedClinic || saving}
                style={{
                  width: "100%",
                  background: "#10b981",
                  borderColor: "#10b981",
                }}
              >
                <Building2 size={14} />
                {saving ? "Assigning..." : "Assign Clinic"}
              </Button>
            </div>
          </SectionCard>

          {/* Update Status */}
          <SectionCard title="Update Status">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as LeadStatus)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: `1px solid ${UI_COLORS.border}`,
                fontSize: 13,
                background: "var(--bg-card)",
                color: UI_COLORS.textPrimary,
                marginBottom: 8,
              }}
            >
              <option value="">Select new status...</option>
              {Object.entries(LEAD_STATUSES).map(([key, val]) => (
                <option key={key} value={key} disabled={key === lead.status}>
                  {val.en} {key === lead.status ? "(current)" : ""}
                </option>
              ))}
            </select>
            <Button
              onClick={handleStatusUpdate}
              disabled={!selectedStatus || saving}
              style={{ width: "100%" }}
            >
              {saving ? "Updating..." : "Update Status"}
            </Button>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <p style={{ fontSize: 11.5, fontWeight: 600, color: UI_COLORS.textMuted, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
        {icon} {label}
      </p>
      <p style={{ fontSize: 13.5, fontWeight: 500, color: UI_COLORS.textPrimary }}>
        {value}
      </p>
    </div>
  );
}
